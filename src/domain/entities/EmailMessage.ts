import { EmailAddress } from '../value-objects/EmailAddress';
import { InvalidEmailMessageError } from '../errors/DomainErrors';

export interface EmailAttachment {
  filename: string;
  contentType: string;
  /** Contenido codificado en base64. */
  contentBase64: string;
}

export interface EmailMessageProps {
  id: string;
  from: EmailAddress;
  to: EmailAddress[];
  subject: string;
  textBody?: string;
  htmlBody?: string;
  replyTo?: EmailAddress;
  cc?: EmailAddress[];
  attachments?: EmailAttachment[];
}

/**
 * Entidad de dominio que representa un correo a enviar. Se construye ya
 * validada: si `EmailMessage.create(...)` retorna, el mensaje es
 * consistente y puede pasarse a cualquier EmailProviderPort sin mas chequeos.
 */
export class EmailMessage {
  readonly id: string;
  readonly from: EmailAddress;
  readonly to: EmailAddress[];
  readonly subject: string;
  readonly textBody?: string;
  readonly htmlBody?: string;
  readonly replyTo?: EmailAddress;
  readonly cc: EmailAddress[];
  readonly attachments: EmailAttachment[];

  private constructor(props: EmailMessageProps) {
    this.id = props.id;
    this.from = props.from;
    this.to = props.to;
    this.subject = props.subject;
    this.textBody = props.textBody;
    this.htmlBody = props.htmlBody;
    this.replyTo = props.replyTo;
    this.cc = props.cc ?? [];
    this.attachments = props.attachments ?? [];
  }

  static create(props: EmailMessageProps): EmailMessage {
    if (props.to.length === 0) {
      throw new InvalidEmailMessageError(
        'El mensaje debe tener al menos un destinatario (to)',
      );
    }
    if (!props.subject || props.subject.trim().length === 0) {
      throw new InvalidEmailMessageError('El asunto (subject) es obligatorio');
    }
    const hasTextBody = !!props.textBody && props.textBody.trim().length > 0;
    const hasHtmlBody = !!props.htmlBody && props.htmlBody.trim().length > 0;
    if (!hasTextBody && !hasHtmlBody) {
      throw new InvalidEmailMessageError(
        'El mensaje debe incluir textBody y/o htmlBody',
      );
    }
    return new EmailMessage(props);
  }
}
