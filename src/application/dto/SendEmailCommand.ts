import { EmailAttachment } from '../../domain/entities/EmailMessage';

/**
 * Comando de entrada al caso de uso SendEmailUseCase. Es un DTO plano
 * (sin Value Objects) que representa la intencion del cliente HTTP tal
 * cual llega; la validacion/normalizacion a objetos de dominio ocurre
 * dentro del caso de uso.
 */
export interface SendEmailCommand {
  requestId: string;
  idempotencyKey?: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  textBody?: string;
  htmlBody?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}

export interface SendEmailResult {
  requestId: string;
  status: 'SENT';
  providerName: string;
  providerMessageId: string;
  attempts: Array<{
    providerName: string;
    attemptNumber: number;
    succeeded: boolean;
    errorMessage?: string;
    durationMs: number;
  }>;
  idempotentReplay: boolean;
}
