import { TransientProviderError } from '../../domain/errors/ProviderErrors';

export interface RetryConfig {
  /** Cantidad de reintentos ADICIONALES al primer intento (0 = sin reintentos). */
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface RetryAttemptLog {
  attemptNumber: number;
  durationMs: number;
  error?: unknown;
}

export interface RetryOutcomeSuccess<T> {
  ok: true;
  value: T;
  attempts: RetryAttemptLog[];
}

export interface RetryOutcomeFailure {
  ok: false;
  error: unknown;
  attempts: RetryAttemptLog[];
}

export type RetryOutcome<T> = RetryOutcomeSuccess<T> | RetryOutcomeFailure;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calcula el delay de backoff exponencial con jitter completo ("full
 * jitter"), una estrategia estandar para evitar que reintentos de muchas
 * instancias del cliente se sincronicen ("thundering herd") contra un
 * proveedor que ya esta degradado.
 */
export function computeBackoffDelayMs(
  attemptNumber: number,
  config: Pick<RetryConfig, 'baseDelayMs' | 'maxDelayMs'>,
): number {
  const exponential = config.baseDelayMs * 2 ** (attemptNumber - 1);
  const capped = Math.min(exponential, config.maxDelayMs);
  return Math.floor(Math.random() * capped);
}

/**
 * Ejecuta `operation` reintentando SOLO cuando falla con un
 * TransientProviderError, hasta `config.maxRetries` reintentos, con
 * backoff exponencial + jitter entre intentos. Cualquier otro tipo de
 * error (por ejemplo PermanentProviderError) se propaga inmediatamente
 * sin reintentar, ya que reintentar no cambiaria el resultado.
 *
 * Esta funcion es pura infraestructura de resiliencia y no sabe nada de
 * "proveedores de email": podria reutilizarse para cualquier operacion
 * asincrona clasificable en errores transitorios/permanentes.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig,
): Promise<RetryOutcome<T>> {
  const attempts: RetryAttemptLog[] = [];
  const totalAttempts = config.maxRetries + 1;

  for (let attemptNumber = 1; attemptNumber <= totalAttempts; attemptNumber += 1) {
    const startedAt = Date.now();
    try {
      const value = await operation();
      attempts.push({ attemptNumber, durationMs: Date.now() - startedAt });
      return { ok: true, value, attempts };
    } catch (error) {
      attempts.push({ attemptNumber, durationMs: Date.now() - startedAt, error });

      const isRetryable = error instanceof TransientProviderError;
      const isLastAttempt = attemptNumber === totalAttempts;
      if (!isRetryable || isLastAttempt) {
        return { ok: false, error, attempts };
      }

      const delayMs = computeBackoffDelayMs(attemptNumber, config);
      await sleep(delayMs);
    }
  }

  // Inalcanzable: el for siempre retorna en la ultima iteracion.
  throw new Error('withRetry: estado inesperado');
}
