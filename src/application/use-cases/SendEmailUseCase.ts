import { EmailMessage } from '../../domain/entities/EmailMessage';
import { EmailAddress } from '../../domain/value-objects/EmailAddress';
import { EmailProviderPort } from '../../domain/ports/EmailProviderPort';
import {
  AllProvidersFailedError,
  DuplicateIdempotencyKeyConflictError,
  ProviderAttempt,
} from '../../domain/errors/DomainErrors';
import { PermanentProviderError } from '../../domain/errors/ProviderErrors';
import { SendEmailCommand, SendEmailResult } from '../dto/SendEmailCommand';
import { EmailSendRepository } from '../ports/EmailSendRepository';
import { Logger } from '../ports/Logger';
import { RetryConfig, withRetry } from '../services/RetryPolicy';
import { computePayloadFingerprint } from '../services/payloadFingerprint';

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
  constructor(private readonly deps: SendEmailUseCaseDeps) {
    if (deps.providers.length === 0) {
      throw new Error(
        'SendEmailUseCase requiere al menos un EmailProviderPort configurado',
      );
    }
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
        logger.info(
          { requestId: command.requestId, idempotencyKey: command.idempotencyKey },
          'Idempotency-Key ya procesada: devolviendo resultado cacheado sin reenviar',
        );
        return this.toResult(existing.requestId, existing, true);
      }
    }

    // 1) Construccion y validacion del mensaje de dominio. Cualquier error
    //    aqui (InvalidEmailAddressError / InvalidEmailMessageError) se
    //    propaga tal cual: es un 400 de la API, y ningun proveedor externo
    //    llega a ser contactado.
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

    // 2) Recorrido de la cadena de failover.
    const attempts: ProviderAttempt[] = [];

    for (const provider of this.deps.providers) {
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

      logger.warn(
        {
          requestId: command.requestId,
          providerName: provider.name,
          attemptsForThisProvider: outcome.attempts.length,
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
