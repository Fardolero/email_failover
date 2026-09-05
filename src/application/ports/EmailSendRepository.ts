import { ProviderAttempt } from '../../domain/errors/DomainErrors';

export type EmailSendStatus = 'SENT' | 'FAILED';

export interface EmailSendRecord {
  requestId: string;
  idempotencyKey?: string;
  /** Hash del payload de entrada, usado para detectar reuso incorrecto de una Idempotency-Key. */
  payloadFingerprint: string;
  status: EmailSendStatus;
  providerName?: string;
  providerMessageId?: string;
  attempts: ProviderAttempt[];
  createdAt: string;
}

/**
 * Puerto de persistencia para el historial de envios. Se usa para:
 *  - soportar idempotencia (Idempotency-Key): si el cliente reintenta la
 *    misma peticion, se devuelve el resultado ya obtenido en vez de
 *    volver a disparar el envio contra los proveedores.
 *  - exponer un endpoint de consulta de estado (`GET /emails/:id`).
 *
 * La implementacion de referencia (InMemoryEmailSendRepository) guarda todo
 * en memoria de proceso, lo cual alcanza para esta prueba tecnica y para un
 * unico proceso. En produccion, con multiples instancias detras de un load
 * balancer, esta misma interfaz se implementaria contra Redis o una base de
 * datos compartida sin tocar ninguna otra capa (esa es la ventaja de
 * depender de un puerto y no de una implementacion concreta).
 */
export interface EmailSendRepository {
  findByIdempotencyKey(key: string): Promise<EmailSendRecord | undefined>;
  findByRequestId(requestId: string): Promise<EmailSendRecord | undefined>;
  save(record: EmailSendRecord): Promise<void>;
}
