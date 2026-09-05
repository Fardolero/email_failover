import { EmailProviderPort } from '../../domain/ports/EmailProviderPort';
import { MailgunProviderAdapter } from '../providers/MailgunProviderAdapter';
import { SendGridProviderAdapter } from '../providers/SendGridProviderAdapter';
import { PostmarkProviderAdapter } from '../providers/PostmarkProviderAdapter';
import { AppEnv } from './env';

/**
 * Registro (factory) de proveedores disponibles "de fabrica". Agregar un
 * nuevo proveedor a este mapa (mas su clase adaptadora en
 * infrastructure/providers) es todo lo que hace falta para que quede
 * disponible en PROVIDER_ORDER, sin tocar el dominio ni la aplicacion.
 */
function buildAvailableProviders(env: AppEnv): Record<string, () => EmailProviderPort> {
  return {
    mailgun: () =>
      new MailgunProviderAdapter({
        mode: env.providers.mailgun.mode,
        flakyFailuresBeforeSuccess: env.providers.mailgun.flakyFailuresBeforeSuccess,
        simulatedLatencyMs: env.simulatedLatencyMs,
      }),
    sendgrid: () =>
      new SendGridProviderAdapter({
        mode: env.providers.sendgrid.mode,
        flakyFailuresBeforeSuccess: env.providers.sendgrid.flakyFailuresBeforeSuccess,
        simulatedLatencyMs: env.simulatedLatencyMs,
      }),
    postmark: () =>
      new PostmarkProviderAdapter({
        mode: env.providers.postmark.mode,
        flakyFailuresBeforeSuccess: env.providers.postmark.flakyFailuresBeforeSuccess,
        simulatedLatencyMs: env.simulatedLatencyMs,
      }),
  };
}

/**
 * Construye la cadena de failover ordenada segun `env.providerOrder`
 * (a su vez proveniente de la variable de entorno PROVIDER_ORDER).
 * El primer elemento es el proveedor primario; el resto son los
 * proveedores de respaldo, intentados en orden ante una falla.
 */
export function buildProviderChain(env: AppEnv): EmailProviderPort[] {
  const available = buildAvailableProviders(env);
  const chain = env.providerOrder.map((providerName) => {
    const factory = available[providerName];
    if (!factory) {
      throw new Error(
        `Proveedor desconocido en PROVIDER_ORDER: "${providerName}". Disponibles: ${Object.keys(
          available,
        ).join(', ')}`,
      );
    }
    return factory();
  });

  if (chain.length === 0) {
    throw new Error('PROVIDER_ORDER debe incluir al menos un proveedor');
  }

  return chain;
}
