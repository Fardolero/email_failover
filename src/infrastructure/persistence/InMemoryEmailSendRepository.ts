import {
  EmailSendRecord,
  EmailSendRepository,
} from '../../application/ports/EmailSendRepository';

/**
 * Implementacion en memoria del puerto EmailSendRepository. Suficiente
 * para esta prueba tecnica y para correr el servicio en un unico proceso.
 *
 * Nota de escalabilidad (ver README): en un despliegue con multiples
 * instancias detras de un load balancer, la idempotencia debe compartirse
 * entre procesos. Gracias a que el resto del sistema depende solo de la
 * interfaz `EmailSendRepository`, migrar a Redis (con TTL) o a una tabla
 * en Postgres/DynamoDB es un cambio 100% localizado a esta clase.
 */
export class InMemoryEmailSendRepository implements EmailSendRepository {
  private readonly byIdempotencyKey = new Map<string, EmailSendRecord>();
  private readonly byRequestId = new Map<string, EmailSendRecord>();

  async findByIdempotencyKey(key: string): Promise<EmailSendRecord | undefined> {
    return this.byIdempotencyKey.get(key);
  }

  async findByRequestId(requestId: string): Promise<EmailSendRecord | undefined> {
    return this.byRequestId.get(requestId);
  }

  async save(record: EmailSendRecord): Promise<void> {
    this.byRequestId.set(record.requestId, record);
    if (record.idempotencyKey) {
      this.byIdempotencyKey.set(record.idempotencyKey, record);
    }
  }
}
