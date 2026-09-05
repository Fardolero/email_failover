import { createHash } from 'crypto';

/**
 * Genera una huella (hash) determinista del payload de un comando de envio.
 * Se usa para detectar cuando un cliente reutiliza una misma
 * Idempotency-Key con un cuerpo de peticion DISTINTO, lo cual es un error
 * de uso del cliente (RFC de idempotencia estandar en APIs REST).
 */
export function computePayloadFingerprint(payload: unknown): string {
  const normalized = JSON.stringify(payload);
  return createHash('sha256').update(normalized).digest('hex');
}
