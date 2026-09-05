import { NextFunction, Request, Response } from 'express';
import { SendEmailUseCase } from '../../../application/use-cases/SendEmailUseCase';
import { SendEmailCommand } from '../../../application/dto/SendEmailCommand';
import { EmailSendRepository } from '../../../application/ports/EmailSendRepository';
import { SendEmailRequestBody } from '../dto/sendEmailSchema';

const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/**
 * Controller HTTP: su unica responsabilidad es traducir entre el mundo
 * HTTP (Request/Response de Express) y el mundo de la aplicacion
 * (SendEmailCommand / SendEmailResult). No contiene ninguna regla de
 * negocio ni conoce los proveedores de email.
 */
export class EmailController {
  constructor(
    private readonly sendEmailUseCase: SendEmailUseCase,
    private readonly repository: EmailSendRepository,
  ) {}

  sendEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.body as SendEmailRequestBody;
      const idempotencyKey = req.header(IDEMPOTENCY_KEY_HEADER) || undefined;

      const command: SendEmailCommand = {
        requestId: req.requestId,
        idempotencyKey,
        from: body.from,
        to: body.to,
        cc: body.cc,
        subject: body.subject,
        textBody: body.textBody,
        htmlBody: body.htmlBody,
        replyTo: body.replyTo,
        attachments: body.attachments,
      };

      const result = await this.sendEmailUseCase.execute(command);

      // 200 en vez de 201 porque no se esta creando un recurso identificado
      // por una URL propia bajo el control del cliente; 202 tambien seria
      // defendible si el envio fuese asincrono, pero aqui se resuelve la
      // conmutacion por error de forma sincrona antes de responder.
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getEmailStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const record = await this.repository.findByRequestId(req.params.id);
      if (!record) {
        res.status(404).json({
          requestId: req.requestId,
          error: {
            code: 'NOT_FOUND',
            message: `No existe un envio con id "${req.params.id}"`,
          },
        });
        return;
      }
      res.status(200).json(record);
    } catch (error) {
      next(error);
    }
  };
}
