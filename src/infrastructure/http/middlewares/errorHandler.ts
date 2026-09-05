import { NextFunction, Request, Response } from 'express';
import {
  AllProvidersFailedError,
  DuplicateIdempotencyKeyConflictError,
  IdempotencyKeyInFlightError,
  InvalidEmailAddressError,
  InvalidEmailMessageError,
} from '../../../domain/errors/DomainErrors';
import { Logger } from '../../../application/ports/Logger';

interface ErrorBody {
  requestId: string;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Middleware central de manejo de errores. Traduce cada tipo de error de
 * dominio/aplicacion a un codigo de estado HTTP semantico y a un cuerpo
 * de error consistente, siguiendo el requisito de "codigos de estado
 * semanticos y mensajes de error claros". Este es el UNICO lugar del
 * sistema que conoce la correspondencia error-de-dominio -> status HTTP.
 */
export function buildErrorHandler(logger: Logger) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return function errorHandler(
    err: unknown,
    req: Request,
    res: Response,
    _next: NextFunction,
  ): void {
    const requestId = req.requestId ?? 'unknown';

    if (err instanceof InvalidEmailAddressError || err instanceof InvalidEmailMessageError) {
      const body: ErrorBody = {
        requestId,
        error: { code: 'INVALID_PAYLOAD', message: err.message },
      };
      res.status(400).json(body);
      return;
    }

    if (err instanceof DuplicateIdempotencyKeyConflictError) {
      const body: ErrorBody = {
        requestId,
        error: { code: 'IDEMPOTENCY_KEY_CONFLICT', message: err.message },
      };
      res.status(409).json(body);
      return;
    }

    if (err instanceof IdempotencyKeyInFlightError) {
      const body: ErrorBody = {
        requestId,
        error: { code: 'IDEMPOTENCY_KEY_IN_FLIGHT', message: err.message },
      };
      // 409 Conflict: hay otra peticion con la misma Idempotency-Key en
      // curso en este momento; el cliente deberia reintentar mas tarde.
      res.status(409).json(body);
      return;
    }

    if (err instanceof AllProvidersFailedError) {
      logger.error({ requestId, attempts: err.attempts }, err.message);
      const body: ErrorBody = {
        requestId,
        error: {
          code: 'ALL_PROVIDERS_FAILED',
          message:
            'No se pudo enviar el email: todos los proveedores de correo configurados fallaron. Intente nuevamente mas tarde.',
          details: { attempts: err.attempts },
        },
      };
      // 502 Bad Gateway: el servicio funciono correctamente pero las
      // dependencias externas (los proveedores de email) no respondieron.
      res.status(502).json(body);
      return;
    }

    logger.error(
      { requestId, err: err instanceof Error ? err.message : String(err) },
      'Error no manejado',
    );
    const body: ErrorBody = {
      requestId,
      error: { code: 'INTERNAL_ERROR', message: 'Error interno del servicio' },
    };
    res.status(500).json(body);
  };
}

/** Handler para rutas no encontradas (404). */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    requestId: req.requestId ?? 'unknown',
    error: {
      code: 'NOT_FOUND',
      message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
    },
  });
}
