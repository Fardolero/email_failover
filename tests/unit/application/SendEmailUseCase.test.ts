import { SendEmailUseCase } from '../../../src/application/use-cases/SendEmailUseCase';
import { SendEmailCommand } from '../../../src/application/dto/SendEmailCommand';
import {
  AllProvidersFailedError,
  DuplicateIdempotencyKeyConflictError,
  IdempotencyKeyInFlightError,
} from '../../../src/domain/errors/DomainErrors';
import { InvalidEmailAddressError, InvalidEmailMessageError } from '../../../src/domain/errors/DomainErrors';
import { FakeEmailProvider } from '../../doubles/FakeEmailProvider';
import { createTestRepository } from '../../doubles/InMemoryEmailSendRepositoryTestFactory';
import { silentLogger } from '../../doubles/silentLogger';

const fastRetryConfig = { maxRetries: 1, baseDelayMs: 1, maxDelayMs: 2 };

function baseCommand(overrides: Partial<SendEmailCommand> = {}): SendEmailCommand {
  return {
    requestId: 'req-1',
    from: 'no-reply@example.com',
    to: ['destinatario@example.com'],
    subject: 'Asunto',
    textBody: 'Cuerpo del mensaje',
    ...overrides,
  };
}

describe('SendEmailUseCase', () => {
  it('escenario de exito: el proveedor primario responde OK y no se toca el secundario', async () => {
    const primary = new FakeEmailProvider('mailgun', { type: 'success' });
    const secondary = new FakeEmailProvider('sendgrid', { type: 'success' });
    const useCase = new SendEmailUseCase({
      providers: [primary, secondary],
      repository: createTestRepository(),
      logger: silentLogger,
      retryConfig: fastRetryConfig,
    });

    const result = await useCase.execute(baseCommand());

    expect(result.status).toBe('SENT');
    expect(result.providerName).toBe('mailgun');
    expect(primary.callCount).toBe(1);
    expect(secondary.callCount).toBe(0);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toMatchObject({ providerName: 'mailgun', succeeded: true });
  });

  it('escenario de failover: el primario agota reintentos y el secundario responde OK', async () => {
    const primary = new FakeEmailProvider('mailgun', { type: 'transient-failure' });
    const secondary = new FakeEmailProvider('sendgrid', { type: 'success' });
    const useCase = new SendEmailUseCase({
      providers: [primary, secondary],
      repository: createTestRepository(),
      logger: silentLogger,
      retryConfig: fastRetryConfig,
    });

    const result = await useCase.execute(baseCommand());

    expect(result.status).toBe('SENT');
    expect(result.providerName).toBe('sendgrid');
    // maxRetries=1 => 2 intentos contra el primario antes de conmutar
    expect(primary.callCount).toBe(2);
    expect(secondary.callCount).toBe(1);
    expect(result.attempts).toHaveLength(3);
    expect(result.attempts.filter((a) => a.providerName === 'mailgun')).toHaveLength(2);
    expect(result.attempts.at(-1)).toMatchObject({ providerName: 'sendgrid', succeeded: true });
  });

  it('se recupera solo con reintentos, sin necesitar failover (proveedor flaky)', async () => {
    const primary = new FakeEmailProvider('mailgun', {
      type: 'fail-n-times-then-succeed',
      failures: 1,
    });
    const secondary = new FakeEmailProvider('sendgrid', { type: 'success' });
    const useCase = new SendEmailUseCase({
      providers: [primary, secondary],
      repository: createTestRepository(),
      logger: silentLogger,
      retryConfig: fastRetryConfig,
    });

    const result = await useCase.execute(baseCommand());

    expect(result.providerName).toBe('mailgun');
    expect(primary.callCount).toBe(2);
    expect(secondary.callCount).toBe(0);
  });

  it('failover encadenado a un tercer proveedor cuando los dos primeros fallan', async () => {
    const primary = new FakeEmailProvider('mailgun', { type: 'transient-failure' });
    const secondary = new FakeEmailProvider('sendgrid', { type: 'permanent-failure' });
    const tertiary = new FakeEmailProvider('postmark', { type: 'success' });
    const useCase = new SendEmailUseCase({
      providers: [primary, secondary, tertiary],
      repository: createTestRepository(),
      logger: silentLogger,
      retryConfig: fastRetryConfig,
    });

    const result = await useCase.execute(baseCommand());

    expect(result.providerName).toBe('postmark');
    // El error permanente de sendgrid no se reintenta (1 sola llamada).
    expect(secondary.callCount).toBe(1);
    expect(tertiary.callCount).toBe(1);
  });

  it('si todos los proveedores fallan, lanza AllProvidersFailedError con el detalle de cada intento', async () => {
    const primary = new FakeEmailProvider('mailgun', { type: 'transient-failure' });
    const secondary = new FakeEmailProvider('sendgrid', { type: 'transient-failure' });
    const useCase = new SendEmailUseCase({
      providers: [primary, secondary],
      repository: createTestRepository(),
      logger: silentLogger,
      retryConfig: fastRetryConfig,
    });

    await expect(useCase.execute(baseCommand())).rejects.toThrow(AllProvidersFailedError);
    expect(primary.callCount).toBe(2);
    expect(secondary.callCount).toBe(2);
  });

  it('no contacta a ningun proveedor si el payload de dominio es invalido', async () => {
    const primary = new FakeEmailProvider('mailgun', { type: 'success' });
    const useCase = new SendEmailUseCase({
      providers: [primary],
      repository: createTestRepository(),
      logger: silentLogger,
      retryConfig: fastRetryConfig,
    });

    await expect(
      useCase.execute(baseCommand({ to: ['no-es-un-email'] })),
    ).rejects.toThrow(InvalidEmailAddressError);
    await expect(
      useCase.execute(baseCommand({ textBody: undefined, htmlBody: undefined })),
    ).rejects.toThrow(InvalidEmailMessageError);
    expect(primary.callCount).toBe(0);
  });

  describe('idempotencia', () => {
    it('una Idempotency-Key repetida con el mismo payload devuelve el resultado cacheado sin reenviar', async () => {
      const primary = new FakeEmailProvider('mailgun', { type: 'success' });
      const repository = createTestRepository();
      const useCase = new SendEmailUseCase({
        providers: [primary],
        repository,
        logger: silentLogger,
        retryConfig: fastRetryConfig,
      });

      const command = baseCommand({ idempotencyKey: 'idem-123' });
      const first = await useCase.execute(command);
      const second = await useCase.execute({ ...command, requestId: 'req-2' });

      expect(primary.callCount).toBe(1);
      expect(second.idempotentReplay).toBe(true);
      expect(second.providerMessageId).toBe(first.providerMessageId);
    });

    it('rechaza una Idempotency-Key reutilizada con un payload distinto', async () => {
      const primary = new FakeEmailProvider('mailgun', { type: 'success' });
      const repository = createTestRepository();
      const useCase = new SendEmailUseCase({
        providers: [primary],
        repository,
        logger: silentLogger,
        retryConfig: fastRetryConfig,
      });

      await useCase.execute(baseCommand({ idempotencyKey: 'idem-999' }));

      await expect(
        useCase.execute(
          baseCommand({ idempotencyKey: 'idem-999', subject: 'Asunto distinto' }),
        ),
      ).rejects.toThrow(DuplicateIdempotencyKeyConflictError);
    });

    it('rechaza una segunda peticion CONCURRENTE con la misma Idempotency-Key mientras la primera todavia esta en curso (evita doble envio)', async () => {
      // El proveedor tarda "un rato" en responder, para poder disparar la
      // segunda peticion mientras la primera todavia no termino: sin la
      // reserva PENDING, ambas pasarian el chequeo de "no existe" y el
      // correo se enviaria dos veces.
      const primary = new FakeEmailProvider('mailgun', { type: 'success' }, 30);
      const repository = createTestRepository();
      const useCase = new SendEmailUseCase({
        providers: [primary],
        repository,
        logger: silentLogger,
        retryConfig: fastRetryConfig,
      });

      const command = baseCommand({ idempotencyKey: 'idem-concurrente' });
      const firstPromise = useCase.execute(command);
      // Se cede el control del event loop para asegurar que la primera
      // peticion ya alcanzo a reservar la clave (PENDING) antes de lanzar
      // la segunda.
      await new Promise((resolve) => setImmediate(resolve));
      const secondPromise = useCase.execute({ ...command, requestId: 'req-concurrente-2' });

      await expect(secondPromise).rejects.toThrow(IdempotencyKeyInFlightError);
      await expect(firstPromise).resolves.toMatchObject({ status: 'SENT' });
      expect(primary.callCount).toBe(1);
    });

    it('permite reintentar con la misma Idempotency-Key si el intento anterior fallo (no quedo un envio duplicado bloqueado para siempre)', async () => {
      const primary = new FakeEmailProvider('mailgun', { type: 'transient-failure' });
      const repository = createTestRepository();
      const useCase = new SendEmailUseCase({
        providers: [primary],
        repository,
        logger: silentLogger,
        retryConfig: fastRetryConfig,
      });

      const command = baseCommand({ idempotencyKey: 'idem-retry-tras-fallo' });
      await expect(useCase.execute(command)).rejects.toThrow(AllProvidersFailedError);

      // Ahora el proveedor "se recupera" y el cliente reintenta con la
      // misma clave: no deberia quedar bloqueado por el fallo anterior.
      const secondary = new FakeEmailProvider('mailgun-recuperado', { type: 'success' });
      const useCaseRetry = new SendEmailUseCase({
        providers: [secondary],
        repository,
        logger: silentLogger,
        retryConfig: fastRetryConfig,
      });
      const result = await useCaseRetry.execute({ ...command, requestId: 'req-retry' });

      expect(result.status).toBe('SENT');
      expect(result.idempotentReplay).toBe(false);
    });
  });

  describe('circuit breaker por proveedor', () => {
    function fakeClock(startMs: number) {
      let current = startMs;
      return { now: () => current, advance: (ms: number) => (current += ms) };
    }

    it('tras varios fallos consecutivos EN PETICIONES DISTINTAS, abre el circuito y deja de contactar a ese proveedor (failover inmediato)', async () => {
      const primary = new FakeEmailProvider('mailgun', { type: 'transient-failure' });
      const secondary = new FakeEmailProvider('sendgrid', { type: 'success' });
      const clock = fakeClock(0);
      const useCase = new SendEmailUseCase({
        providers: [primary, secondary],
        repository: createTestRepository(),
        logger: silentLogger,
        retryConfig: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 2 },
        circuitBreakerConfig: { failureThreshold: 2, openDurationMs: 10_000 },
        clock: clock.now,
      });

      // 2 peticiones separadas contra un primario siempre caido: alcanza
      // el failureThreshold (2) y el circuito de "mailgun" se abre.
      await useCase.execute(baseCommand({ requestId: 'r1' }));
      await useCase.execute(baseCommand({ requestId: 'r2' }));
      expect(primary.callCount).toBe(2);

      // Una tercera peticion: como el circuito de "mailgun" ya esta
      // abierto, NO deberia ni siquiera intentar contactarlo.
      const result = await useCase.execute(baseCommand({ requestId: 'r3' }));

      expect(primary.callCount).toBe(2); // sigue en 2: no se lo volvio a llamar
      expect(result.providerName).toBe('sendgrid');
      expect(
        result.attempts.find((a) => a.providerName === 'mailgun')?.errorMessage,
      ).toMatch(/circuit breaker abierto/i);
    });

    it('pasado openDurationMs, vuelve a intentar contra el proveedor (half-open) y si responde OK cierra el circuito', async () => {
      const primary = new FakeEmailProvider('mailgun', {
        type: 'fail-n-times-then-succeed',
        failures: 2,
      });
      const clock = fakeClock(0);
      const useCase = new SendEmailUseCase({
        providers: [primary],
        repository: createTestRepository(),
        logger: silentLogger,
        retryConfig: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 2 },
        circuitBreakerConfig: { failureThreshold: 2, openDurationMs: 10_000 },
        clock: clock.now,
      });

      await expect(useCase.execute(baseCommand({ requestId: 'r1' }))).rejects.toThrow();
      await expect(useCase.execute(baseCommand({ requestId: 'r2' }))).rejects.toThrow();
      expect(primary.callCount).toBe(2);

      // Con el circuito abierto, una peticion inmediata no debe ni
      // siquiera contactar al proveedor.
      await expect(useCase.execute(baseCommand({ requestId: 'r3' }))).rejects.toThrow();
      expect(primary.callCount).toBe(2);

      // Pasa el tiempo de espera: la siguiente peticion SI debe intentar
      // de nuevo (half-open), y esta vez el proveedor ya se recupero.
      clock.advance(10_001);
      const result = await useCase.execute(baseCommand({ requestId: 'r4' }));

      expect(primary.callCount).toBe(3);
      expect(result.status).toBe('SENT');
    });
  });
});
