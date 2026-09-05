import { Express } from 'express';
import { loadEnv } from './infrastructure/config/env';
import { buildProviderChain } from './infrastructure/config/providerChain';
import { InMemoryEmailSendRepository } from './infrastructure/persistence/InMemoryEmailSendRepository';
import { createLogger } from './infrastructure/logging/pinoLogger';
import { buildApp } from './infrastructure/http/app';

/**
 * Composition root de produccion: es el UNICO lugar del sistema que
 * conoce simultaneamente las variables de entorno, los adaptadores de
 * proveedores concretos y el framework HTTP. Todo lo demas (dominio,
 * aplicacion, e incluso `buildApp`) recibe sus dependencias por
 * parametro/constructor y no sabe de donde vienen.
 */
export function createProductionApp(): Express {
  const env = loadEnv();
  const logger = createLogger(env.logLevel);
  const providers = buildProviderChain(env);
  const repository = new InMemoryEmailSendRepository();

  logger.info(
    { providerOrder: providers.map((p) => p.name), retry: env.retry },
    'Cadena de failover configurada',
  );

  return buildApp({
    providers,
    repository,
    logger,
    retryConfig: env.retry,
  });
}

export { loadEnv };
