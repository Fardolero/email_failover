import dotenv from 'dotenv';
import { createProductionApp, loadEnv } from './container';

dotenv.config();

const env = loadEnv();
const app = createProductionApp();

const server = app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Email Failover Service escuchando en http://localhost:${env.port}`);
  // eslint-disable-next-line no-console
  console.log(`Documentacion OpenAPI (Swagger UI): http://localhost:${env.port}/docs`);
});

function shutdown(signal: string): void {
  // eslint-disable-next-line no-console
  console.log(`Recibida señal ${signal}, cerrando servidor...`);
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
