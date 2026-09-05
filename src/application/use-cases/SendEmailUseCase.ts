import { EmailMessage } from '../../domain/entities/EmailMessage';
import { EmailAddress } from '../../domain/value-objects/EmailAddress';
import { EmailProviderPort } from '../../domain/ports/EmailProviderPort';
import {
  AllProvidersFailedError,
  DuplicateIdempotencyKeyConflictError,
  IdempotencyKeyInFlightError,
  ProviderAttempt,
} from '../../domain/errors/DomainErrors';
import { PermanentProviderError } from '../../domain/errors/ProviderErrors';
import { SendEmailCommand, SendEmailResult } from '../dto/SendEmailCommand';
import { EmailSendRepository } from '../ports/EmailSendRepository';
import { Logger } from '../ports/Logger';
import { RetryConfig, withRetry } from '../services/RetryPolicy';
import { computePayloadFingerprint } from '../services/payloadFingerprint';
import {
  CircuitBreaker,
  CircuitBreakerConfig,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from '../services/CircuitBreaker';

export interface SendEmailUseCaseDeps {
  /**
   * Cadena de proveedores en el ORDEN en que deben intentarse. El primero
   * es el "primario"; el resto se usan como failover automatico cuando el
   * anterior agota sus reintentos.
   */
  providers: EmailProviderPort[];
  repository: EmailSendRepository;
  logger: Logger;
  retryConfig: RetryConfig;
  /** Configuracion del circuit breaker por proveedor. Default: ver CircuitBreaker.ts. */
  circuitBreakerConfig?: CircuitBreakerConfig;
  /** Inyectable solo para tests deterministicos del circuit breaker (default: Date.now). */
  clock?: () => number;
}

/**
 * Caso de uso central del servicio: valida el mensaje, aplica idempotencia,
 * e intenta enviarlo a traves de la cadena de proveedores configurada,
 * aplicando reintentos por proveedor y failover automatico entre ellos.
 *
 * Esta clase NO conoce Express, HTTP, Mailgun ni SendGrid: solo depende de
 * los puertos (EmailProviderPort, EmailSendRepository, Logger), lo que la
 * hace testeable de forma completamente aislada con dobles de prueba.
 */
export class SendEmailUseCase {
  /**
   * Un circuit breaker por proveedor, indexado por nombre. Vive en esta
   * instancia (no por peticion): el estado del circuito debe persistir
   * ENTRE peticiones para cumplir su proposito. Como SendEmailUseCase se
   * construye una sola vez en el composition root (ver container.ts) y se
   * reutiliza para toda la vida del proceso, esto es exactamente lo que
   * pasa en produccion.
   */
  private readonly circuitBreakers: Map<string, CircuitBreaker>;

  constructor(private readonly deps: SendEmailUseCaseDeps) {
    if (deps.providers.length === 0) {
      throw new Error(
        'SendEmailUseCase requiere al menos un EmailProviderPort configurado',
      );
    }
    const circuitBreakerConfig = deps.circuitBreakerConfig ?? DEFAULT_CIRCUIT_BREAKER_CONFIG;
    this.circuitBreakers = new Map(
      deps.providers.map((provider) => [
        provider.name,
        new CircuitBreaker(provider.name, circuitBreakerConfig, deps.clock),
      ]),
    );
  }

  async execute(command: SendEmailCommand): Promise<SendEmailResult> {
    const { logger, repository } = this.deps;
    const payloadFingerprint = computePayloadFingerprint({
      from: command.from,
      to: command.to,
      cc: command.cc,
      subject: command.subject,
      textBody: command.textBody,
      htmlBody: command.htmlBody,
      replyTo: command.replyTo,
    });

    if (command.idempotencyKey) {
      const existing = await repository.findByIdempotencyKey(
        command.idempotencyKey,
      );
      if (existing) {
        if (existing.payloadFingerprint !== payloadFingerprint) {
          throw new DuplicateIdempotencyKeyConflictError(command.idempotencyKey);
        }
        if (existing.status === 'SENT') {
          logger.info(
            { requestId: command.requestId, idempotencyKey: command.idempotencyKey },
            'Idempotency-Key ya procesada: devolviendo resultado cacheado sin reenviar',
          );
          return this.toResult(existing.requestId, existing, true);
        }
        if (existing.status === 'PENDING') {
          // Una peticion anterior con la MISMA clave todavia esta en curso
          // (no termino ni con exito ni con fallo). Sin este chequeo, dos
          // peticiones concurrentes con la misma Idempotency-Key podrian
          // ambas pasar el chequeo de "no existe" y terminar disparando el
          // envio dos veces contra los proveedores reales.
          throw new IdempotencyKeyInFlightError(command.idempotencyKey);
        }
        // status === 'FAILED': el intento anterior con esta clave no llego a
        // enviarse (fallaron todos los proveedores), asi que se permite
        // reintentar como si la clave fuera nueva.
      }
    }

    // 1) Construccion y validacion del mensaje de dominio. Cualquier error
    //    aqui (InvalidEmailAddressError / InvalidEmailMessageError) se
    //    propaga tal cual: es un 400 de la API, y ningun proveedor externo
    //    llega a ser contactado (y la Idempotency-Key, si vino, NO se
    //    reserva: un payload invalido nunca "consume" la clave).
    const message = EmailMessage.create({
      id: command.requestId,
      from: EmailAddress.create(command.from),
      to: command.to.map((addr) => EmailAddress.create(addr)),
      cc: command.cc?.map((addr) => EmailAddress.create(addr)),
      subject: command.subject,
      textBody: command.textBody,
      htmlBody: command.htmlBody,
      replyTo: command.replyTo ? EmailAddress.create(command.replyTo) : undefined,
      attachments: command.attachments,
    });

    // 1.5) Se "reserva" la Idempotency-Key ANTES de contactar a cualquier
    //    proveedor, guardando un registro PENDING. Esta es la parte
    //    importante de la correccion: si se guardara el registro recien al
    //    final (como con SENT/FAILED mas abajo), una peticion concurrente
    //    con la misma clave llegaria a pasar el chequeo de arriba mientras
    //    la primera todavia esta enviando, y ambas contactarian a los
    //    proveedores.
    if (command.idempotencyKey) {
      await repository.save({
        requestId: command.requestId,
        idempotencyKey: command.idempotencyKey,
        payloadFingerprint,
        status: 'PENDING',
        attempts: [],
        createdAt: new Date().toISOString(),
      });
    }

    // 2) Recorrido de la cadena de failover.
    const attempts: ProviderAttempt[] = [];

    for (const provider of this.deps.providers) {
      const breaker = this.circuitBreakers.get(provider.name) as CircuitBreaker;

      if (!breaker.canAttempt()) {
        // Circuito abierto: este proveedor viene fallando de forma
        // sostenida en peticiones anteriores. Se salta directo al
        // siguiente de la cadena SIN gastar tiempo de red ni presupuesto
        // de reintentos en un proveedor que ya sabemos que esta caido.
        attempts.push({
          providerName: provider.name,
          attemptNumber: 0,
          succeeded: false,
          errorMessage: `Circuit breaker abierto para "${provider.name}": se omite sin contactarlo (demasiados fallos recientes)`,
          errorType: 'transient',
          durationMs: 0,
        });
        logger.warn(
          { requestId: command.requestId, providerName: provider.name },
          'Circuit breaker abierto: se omite este proveedor sin contactarlo',
        );
        continue;
      }

      const outcome = await withRetry(
        () => provider.send(message),
        this.deps.retryConfig,
      );

      for (const attemptLog of outcome.attempts) {
        const succeeded = outcome.ok && attemptLog === outcome.attempts[outcome.attempts.length - 1];
        attempts.push({
          providerName: provider.name,
          attemptNumber: attemptLog.attemptNumber,
          succeeded,
          errorMessage:
            attemptLog.error instanceof Error ? attemptLog.error.message : undefined,
          errorType: attemptLog.error instanceof PermanentProviderError
            ? 'permanent'
            : attemptLog.error
              ? 'transient'
              : undefined,
          durationMs: attemptLog.durationMs,
        });
      }

      if (outcome.ok) {
        breaker.onSuccess();
        logger.info(
          {
            requestId: command.requestId,
            providerName: provider.name,
            attemptsForThisProvider: outcome.attempts.length,
            totalAttempts: attempts.length,
          },
          'Email enviado exitosamente',
        );

        const record = {
          requestId: command.requestId,
          idempotencyKey: command.idempotencyKey,
          payloadFingerprint,
          status: 'SENT' as const,
          providerName: outcome.value.providerName,
          providerMessageId: outcome.value.providerMessageId,
          attempts,
          createdAt: new Date().toISOString(),
        };
        await repository.save(record);
        return this.toResult(command.requestId, record, false);
      }

      breaker.onFailure();
      logger.warn(
        {
          requestId: command.requestId,
          providerName: provider.name,
          attemptsForThisProvider: outcome.attempts.length,
          circuitState: breaker.getState(),
          error: outcome.error instanceof Error ? outcome.error.message : String(outcome.error),
        },
        'Proveedor agoto reintentos, intentando failover al siguiente proveedor (si existe)',
      );
      // Continua al siguiente proveedor de la cadena (failover automatico).
    }

    // 3) Todos los proveedores fallaron: se registra y se propaga un error
    //    agregado que la capa HTTP traduce a un 502 Bad Gateway.
    logger.error(
      { requestId: command.requestId, attempts },
      'Todos los proveedores de la cadena de failover fallaron',
    );
    await repository.save({
      requestId: command.requestId,
      idempotencyKey: command.idempotencyKey,
      payloadFingerprint,
      status: 'FAILED',
      attempts,
      createdAt: new Date().toISOString(),
    });
    throw new AllProvidersFailedError(attempts);
  }

  private toResult(
    requestId: string,
    record: {
      providerName?: string;
      providerMessageId?: string;
      attempts: ProviderAttempt[];
    },
    idempotentReplay: boolean,
  ): SendEmailResult {
    return {
      requestId,
      status: 'SENT',
      providerName: record.providerName as string,
      providerMessageId: record.providerMessageId as string,
      attempts: record.attempts.map((a) => ({
        providerName: a.providerName,
        attemptNumber: a.attemptNumber,
        succeeded: a.succeeded,
        errorMessage: a.errorMessage,
        durationMs: a.durationMs,
      })),
      idempotentReplay,
    };
  }
}
