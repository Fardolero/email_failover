import { withRetry } from '../../../src/application/services/RetryPolicy';
import { PermanentProviderError, TransientProviderError } from '../../../src/domain/errors/ProviderErrors';

const fastRetryConfig = { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 5 };

describe('withRetry', () => {
  it('retorna exito en el primer intento sin reintentar', async () => {
    const operation = jest.fn().mockResolvedValue('ok');

    const outcome = await withRetry(operation, fastRetryConfig);

    expect(outcome.ok).toBe(true);
    expect(operation).toHaveBeenCalledTimes(1);
    if (outcome.ok) {
      expect(outcome.value).toBe('ok');
      expect(outcome.attempts).toHaveLength(1);
    }
  });

  it('reintenta ante TransientProviderError y tiene exito antes de agotar los reintentos', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new TransientProviderError('p', 'fallo 1'))
      .mockResolvedValueOnce('ok');

    const outcome = await withRetry(operation, fastRetryConfig);

    expect(outcome.ok).toBe(true);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('agota maxRetries y falla si todos los intentos son transitorios', async () => {
    const operation = jest.fn().mockRejectedValue(new TransientProviderError('p', 'siempre falla'));

    const outcome = await withRetry(operation, fastRetryConfig);

    // maxRetries=2 => 1 intento inicial + 2 reintentos = 3 llamadas
    expect(operation).toHaveBeenCalledTimes(3);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toBeInstanceOf(TransientProviderError);
      expect(outcome.attempts).toHaveLength(3);
    }
  });

  it('NO reintenta ante PermanentProviderError: falla en el primer intento', async () => {
    const operation = jest.fn().mockRejectedValue(new PermanentProviderError('p', 'rechazo definitivo'));

    const outcome = await withRetry(operation, fastRetryConfig);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toBeInstanceOf(PermanentProviderError);
    }
  });

  it('respeta maxRetries=0 (sin reintentos en absoluto)', async () => {
    const operation = jest.fn().mockRejectedValue(new TransientProviderError('p', 'fallo'));

    const outcome = await withRetry(operation, { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 5 });

    expect(operation).toHaveBeenCalledTimes(1);
    expect(outcome.ok).toBe(false);
  });
});
