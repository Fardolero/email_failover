import { BaseMockProviderAdapter, MockProviderMode } from './BaseMockProviderAdapter';

/**
 * Adaptador para Mailgun.
 *
 * En una implementacion real, el metodo `send()` heredado invocaria aqui
 * al SDK oficial `mailgun.js` (o una llamada HTTP directa a
 * `POST https://api.mailgun.net/v3/{domain}/messages`), mapeando:
 *   - timeouts / errores de red / HTTP 5xx / HTTP 429  -> TransientProviderError
 *   - HTTP 400/401/403 (payload o credenciales invalidas) -> PermanentProviderError
 * Para esta prueba tecnica el comportamiento se simula via configuracion
 * (ver MAILGUN_MODE en .env.example) sin requerir una API key real.
 */
export class MailgunProviderAdapter extends BaseMockProviderAdapter {
  constructor(options: {
    mode: MockProviderMode;
    flakyFailuresBeforeSuccess: number;
    simulatedLatencyMs: number;
  }) {
    super({ name: 'mailgun', ...options });
  }
}
