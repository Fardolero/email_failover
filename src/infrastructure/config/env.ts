import { MockProviderMode } from '../providers/BaseMockProviderAdapter';

function optionalInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseMode(value: string | undefined, providerEnvVar: string): MockProviderMode {
  const allowed: MockProviderMode[] = ['healthy', 'flaky', 'down'];
  if (!value) return 'healthy';
  if (!allowed.includes(value as MockProviderMode)) {
    throw new Error(
      `${providerEnvVar} invalido: "${value}" (valores permitidos: ${allowed.join(', ')})`,
    );
  }
  return value as MockProviderMode;
}

export interface AppEnv {
  port: number;
  logLevel: string;
  providerOrder: string[];
  retry: {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
  };
  circuitBreaker: {
    failureThreshold: number;
    openDurationMs: number;
  };
  providers: {
    mailgun: { mode: MockProviderMode; flakyFailuresBeforeSuccess: number };
    sendgrid: { mode: MockProviderMode; flakyFailuresBeforeSuccess: number };
    postmark: { mode: MockProviderMode; flakyFailuresBeforeSuccess: number };
  };
  simulatedLatencyMs: number;
}

/**
 * Lee y valida la configuracion del proceso a partir de variables de
 * entorno. Centralizar esto en un unico lugar evita `process.env`
 * disperso por todo el codebase y hace explicito, en un solo archivo,
 * cada parametro configurable del servicio.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const providerOrder = (source.PROVIDER_ORDER ?? 'mailgun,sendgrid,postmark')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return {
    port: optionalInt(source.PORT, 3000),
    logLevel: source.LOG_LEVEL ?? 'info',
    providerOrder,
    retry: {
      maxRetries: optionalInt(source.MAX_RETRIES_PER_PROVIDER, 2),
      baseDelayMs: optionalInt(source.RETRY_BASE_DELAY_MS, 100),
      maxDelayMs: optionalInt(source.RETRY_MAX_DELAY_MS, 2000),
    },
    circuitBreaker: {
      failureThreshold: optionalInt(source.CIRCUIT_BREAKER_FAILURE_THRESHOLD, 5),
      openDurationMs: optionalInt(source.CIRCUIT_BREAKER_OPEN_DURATION_MS, 30_000),
    },
    providers: {
      mailgun: {
        mode: parseMode(source.MAILGUN_MODE, 'MAILGUN_MODE'),
        flakyFailuresBeforeSuccess: optionalInt(source.MAILGUN_FLAKY_FAILURES, 2),
      },
      sendgrid: {
        mode: parseMode(source.SENDGRID_MODE, 'SENDGRID_MODE'),
        flakyFailuresBeforeSuccess: optionalInt(source.SENDGRID_FLAKY_FAILURES, 2),
      },
      postmark: {
        mode: parseMode(source.POSTMARK_MODE, 'POSTMARK_MODE'),
        flakyFailuresBeforeSuccess: optionalInt(source.POSTMARK_FLAKY_FAILURES, 2),
      },
    },
    simulatedLatencyMs: optionalInt(source.PROVIDER_SIMULATED_LATENCY_MS, 50),
  };
}
