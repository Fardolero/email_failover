import { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const REQUEST_ID_HEADER = 'X-Request-Id';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

/**
 * Asigna un identificador unico a cada peticion (o respeta uno provisto
 * por el cliente/proxy en el header X-Request-Id), lo expone en
 * `req.requestId` y lo devuelve en la respuesta. Es la base de la
 * observabilidad: todos los logs de una peticion pueden correlacionarse
 * por este id, y el cliente puede reportar incidentes referenciandolo.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(REQUEST_ID_HEADER);
  const requestId = incoming && incoming.trim().length > 0 ? incoming : uuidv4();
  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}
