/**
 * Errores de dominio: representan violaciones de reglas de negocio,
 * independientes de cualquier framework HTTP o proveedor externo.
 */

export class InvalidEmailAddressError extends Error {
  constructor(public readonly rawValue: string) {
    super(`"${rawValue}" no es una direccion de email valida`);
    this.name = 'InvalidEmailAddressError';
  }
}

export class InvalidEmailMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEmailMessageError';
  }
}

/**
 * Registro de un intento de envio contra un proveedor concreto,
 * usado tanto para observabilidad como para el error agregado final.
 */
export interface ProviderAttempt {
  providerName: string;
  attemptNumber: number;
  succeeded: boolean;
  errorMessage?: string;
  errorType?: 'transient' | 'permanent' | 'unknown';
  durationMs: number;
}

/**
 * Se lanza cuando NINGUN proveedor configurado en la cadena de failover
 * pudo enviar el mensaje. Contiene el detalle de cada intento realizado
 * para que la capa HTTP y los logs puedan explicar la causa raiz.
 */
export class AllProvidersFailedError extends Error {
  constructor(public readonly attempts: ProviderAttempt[]) {
    super(
      `No se pudo enviar el email: fallaron todos los proveedores configurados (${attempts
        .map((a) => a.providerName)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .join(', ')})`,
    );
    this.name = 'AllProvidersFailedError';
  }
}

export class DuplicateIdempotencyKeyConflictError extends Error {
  constructor(public readonly idempotencyKey: string) {
    super(
      `La Idempotency-Key "${idempotencyKey}" ya fue usada con un payload distinto`,
    );
    this.name = 'DuplicateIdempotencyKeyConflictError';
  }
}

/**
 * Se lanza cuando una peticion concurrente con la misma Idempotency-Key
 * llega mientras la primera todavia esta en curso (ni terminada con
 * exito ni fallada). Evita que dos peticiones simultaneas con la misma
 * clave terminen enviando el correo dos veces.
 */
export class IdempotencyKeyInFlightError extends Error {
  constructor(public readonly idempotencyKey: string) {
    super(
      `Ya hay un envio en curso para la Idempotency-Key "${idempotencyKey}". Reintente en unos segundos.`,
    );
    this.name = 'IdempotencyKeyInFlightError';
  }
}
