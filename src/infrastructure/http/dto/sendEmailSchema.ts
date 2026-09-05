import { z } from 'zod';

const attachmentSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  contentBase64: z.string().min(1),
});

/**
 * Esquema de validacion del payload de entrada de `POST /api/v1/emails`.
 * Se valida ANTES de construir cualquier objeto de dominio: errores de
 * forma (tipos incorrectos, campos faltantes) se reportan como 400 con
 * mensajes especificos por campo, sin necesidad de involucrar al dominio.
 * La validacion semantica mas fina (formato de email, etc.) queda en el
 * dominio (EmailAddress, EmailMessage), que es la unica fuente de verdad
 * de las reglas de negocio.
 */
export const sendEmailRequestSchema = z
  .object({
    from: z.string().min(1, 'from es obligatorio'),
    to: z.array(z.string().min(1)).min(1, 'to debe tener al menos un destinatario'),
    cc: z.array(z.string().min(1)).optional(),
    subject: z.string().min(1, 'subject es obligatorio'),
    textBody: z.string().optional(),
    htmlBody: z.string().optional(),
    replyTo: z.string().optional(),
    attachments: z.array(attachmentSchema).optional(),
  })
  .refine((body) => !!body.textBody || !!body.htmlBody, {
    message: 'Debe incluir textBody y/o htmlBody',
    path: ['textBody'],
  });

export type SendEmailRequestBody = z.infer<typeof sendEmailRequestSchema>;
