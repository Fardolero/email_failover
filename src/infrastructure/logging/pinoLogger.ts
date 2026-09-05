import pino from 'pino';
import { Logger } from '../../application/ports/Logger';

/**
 * Crea el logger de infraestructura (pino, logs estructurados en JSON,
 * aptos para ingesta por un agregador tipo ELK/Datadog/CloudWatch) y lo
 * expone a traves del puerto `Logger` que consume la capa de aplicacion.
 */
export function createLogger(level: string): pino.Logger & Logger {
  return pino({
    level,
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
