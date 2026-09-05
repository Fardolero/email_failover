import { BaseMockProviderAdapter, MockProviderMode } from './BaseMockProviderAdapter';

/**
 * Adaptador para SendGrid.
 *
 * En una implementacion real, `send()` invocaria al SDK oficial
 * `@sendgrid/mail` (o `POST https://api.sendgrid.com/v3/mail/send`),
 * mapeando errores de la misma forma que el resto de los adaptadores:
 * transitorios (timeout/5xx/429) vs. permanentes (4xx de validacion).
 * Aqui se simula via configuracion (ver SENDGRID_MODE en .env.example).
 */
export class SendGridProviderAdapter extends BaseMockProviderAdapter {
  constructor(options: {
    mode: MockProviderMode;
    flakyFailuresBeforeSuccess: number;
    simulatedLatencyMs: number;
  }) {
    super({ name: 'sendgrid', ...options });
  }
}
