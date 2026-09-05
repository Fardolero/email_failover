import { BaseMockProviderAdapter, MockProviderMode } from './BaseMockProviderAdapter';

/**
 * Adaptador para Postmark.
 *
 * Se incluye como TERCER proveedor, ademas de Mailgun y SendGrid, para
 * demostrar en la practica el requisito de extensibilidad: agregar
 * Postmark a la cadena de failover no requirio ningun cambio en el
 * dominio, en SendEmailUseCase, ni en la capa HTTP. Solo hizo falta:
 *   1) esta clase (adaptador), y
 *   2) una linea en infrastructure/config/providerChain.ts.
 *
 * En produccion, `send()` invocaria al SDK oficial `postmark` (o
 * `POST https://api.postmarkapp.com/email`).
 */
export class PostmarkProviderAdapter extends BaseMockProviderAdapter {
  constructor(options: {
    mode: MockProviderMode;
    flakyFailuresBeforeSuccess: number;
    simulatedLatencyMs: number;
  }) {
    super({ name: 'postmark', ...options });
  }
}
