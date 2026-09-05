import express, { Express } from 'express';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { EmailProviderPort } from '../../domain/ports/EmailProviderPort';
import { EmailSendRepository } from '../../application/ports/EmailSendRepository';
import { Logger } from '../../application/ports/Logger';
import { RetryConfig } from '../../application/services/RetryPolicy';
import { CircuitBreakerConfig } from '../../application/services/CircuitBreaker';
import { SendEmailUseCase } from '../../application/use-cases/SendEmailUseCase';
import { EmailController } from './controllers/EmailController';
import { buildEmailRoutes } from './routes/emailRoutes';
import { buildHealthRoutes } from './routes/healthRoutes';
import { requestIdMiddleware } from './middlewares/requestId';
import { buildErrorHandler, notFoundHandler } from './middlewares/errorHandler';

export interface BuildAppDeps {
  providers: EmailProviderPort[];
  repository: EmailSendRepository;
  logger: Logger & { child?: (bindings: Record<string, unknown>) => Logger };
  retryConfig: RetryConfig;
  circuitBreakerConfig?: CircuitBreakerConfig;
}

/**
 * Construye la aplicacion Express completa a partir de sus dependencias
 * (puertos ya resueltos a implementaciones concretas). Esta funcion es el
 * "punto de ensamblado" de la capa HTTP: no decide COMO se resuelven las
 * dependencias (eso es responsabilidad de infrastructure/config y de
 * index.ts), solo las conecta.
 *
 * Recibir las dependencias como parametros (en vez de resolverlas aqui
 * mismo desde variables de entorno) es lo que permite testear toda la
 * API con supertest inyectando proveedores de prueba, sin variables de
 * entorno ni mocks de modulos.
 */
export function buildApp(deps: BuildAppDeps): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));
  app.use(requestIdMiddleware);
  // El logging de acceso HTTP (una linea por request/response) usa su
  // propia instancia de pino, independiente del puerto `Logger` que
  // consume la capa de aplicacion: pino-http requiere una instancia real
  // de pino (con `.child()`, etc.), mientras que `deps.logger` es
  // deliberadamente un puerto minimo para poder testear con dobles de
  // prueba simples (ver tests/doubles/silentLogger.ts). Ambos loggers
  // terminan escribiendo al mismo stream en produccion.
  app.use(
    pinoHttp({
      autoLogging: process.env.NODE_ENV !== 'test',
      genReqId: (req) => (req as express.Request).requestId,
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  const useCase = new SendEmailUseCase({
    providers: deps.providers,
    repository: deps.repository,
    logger: deps.logger,
    retryConfig: deps.retryConfig,
    circuitBreakerConfig: deps.circuitBreakerConfig,
  });
  const controller = new EmailController(useCase, deps.repository);

  app.use('/api/v1', buildHealthRoutes());
  app.use('/api/v1', buildEmailRoutes(controller));

  const openapiPath = path.join(__dirname, '..', '..', '..', 'openapi', 'openapi.yaml');
  const openapiDocument = yaml.load(fs.readFileSync(openapiPath, 'utf8')) as Record<
    string,
    unknown
  >;
  app.get('/openapi.json', (_req, res) => res.json(openapiDocument));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiDocument));

  app.use(notFoundHandler);
  app.use(buildErrorHandler(deps.logger));

  return app;
}
