import { EmailMessage } from '../entities/EmailMessage';

export interface ProviderSendResult {
  /** Nombre del proveedor que efectivamente envio el mensaje. */
  providerName: string;
  /** Identificador de mensaje devuelto por el proveedor externo. */
  providerMessageId: string;
}

/**
 * Puerto (interfaz) que el dominio/aplicacion usa para enviar un email a
 * traves de un proveedor externo concreto (Mailgun, SendGrid, Postmark, ...).
 *
 * Esta es la frontera de la arquitectura hexagonal: la aplicacion depende
 * SOLO de esta interfaz (principio de inversion de dependencias). Cada
 * proveedor real (o mock) vive en infrastructure/providers e implementa
 * este contrato sin que la logica de negocio sepa nada de HTTP, SDKs o
 * formatos propietarios de cada API externa.
 *
 * Agregar un tercer, cuarto o quinto proveedor NUNCA requiere tocar el
 * dominio ni el caso de uso: alcanza con crear una nueva clase que
 * implemente `EmailProviderPort` y registrarla en la cadena de failover
 * (ver infrastructure/config/providerChain.ts).
 */
export interface EmailProviderPort {
  /** Nombre estable del proveedor, usado en logs, metricas y respuestas. */
  readonly name: string;

  /**
   * Intenta enviar el mensaje. Debe rechazar la promesa con:
   *  - TransientProviderError si el fallo es potencialmente temporal
   *    (timeout, 5xx, rate limiting) y por lo tanto reintentable.
   *  - PermanentProviderError si el proveedor rechazo el mensaje de forma
   *    definitiva (por ejemplo, credenciales invalidas).
   */
  send(message: EmailMessage): Promise<ProviderSendResult>;
}
