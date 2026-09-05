/**
 * Errores que puede lanzar un adaptador de proveedor de email (puerto
 * EmailProviderPort). Se clasifican en dos familias para que la capa de
 * aplicacion sepa como reaccionar, sin conocer nada del proveedor concreto:
 *
 * - TransientProviderError: error probablemente temporal (timeout, 5xx,
 *   429 rate limit, error de red). Vale la pena reintentar y, si se agotan
 *   los reintentos, hacer failover al siguiente proveedor de la cadena.
 * - PermanentProviderError: el proveedor rechazo el mensaje de forma
 *   definitiva (credenciales invalidas, 4xx que no es rate limit, etc).
 *   No tiene sentido reintentar contra ESE proveedor, pero el mensaje en
 *   si podria seguir siendo valido, asi que el failover a otro proveedor
 *   igual se intenta.
 */
export abstract class ProviderError extends Error {
  protected constructor(
    public readonly providerName: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
  }
}

export class TransientProviderError extends ProviderError {
  constructor(providerName: string, message: string, cause?: unknown) {
    super(providerName, message, cause);
    this.name = 'TransientProviderError';
  }
}

export class PermanentProviderError extends ProviderError {
  constructor(providerName: string, message: string, cause?: unknown) {
    super(providerName, message, cause);
    this.name = 'PermanentProviderError';
  }
}
