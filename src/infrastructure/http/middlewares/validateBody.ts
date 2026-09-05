import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';

/**
 * Middleware generico de validacion de body contra un schema de zod.
 * Si el body es invalido, responde 400 inmediatamente con el detalle de
 * cada violacion (campo + mensaje), sin dejar que la peticion siquiera
 * llegue al controller/caso de uso.
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        requestId: req.requestId,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'El payload de la peticion no es valido',
          details: result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
