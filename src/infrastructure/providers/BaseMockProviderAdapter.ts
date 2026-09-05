import { v4 as uuidv4 } from 'uuid';
import { EmailMessage } from '../../domain/entities/EmailMessage';
import { EmailProviderPort, ProviderSendResult } from '../../domain/ports/EmailProviderPort';
import { TransientProviderError } from '../../domain/errors/ProviderErrors';

export type MockProviderMode = 'healthy' | 'flaky' | 'down';

export interface MockProviderConfig {
  name: string;
  mode: MockProviderMode;
  /** Cuantas veces falla (modo "flaky") antes de responder OK. */
  flakyFailuresBeforeSuccess: number;
  /** Latencia simulada de la llamada de red al proveedor, en ms. */
  simulatedLatencyMs: number;
}

/**
 * Adaptador base MOCK de un proveedor de email de terceros (Mailgun,
 * SendGrid, Postmark, ...). No se conecta a ningun servicio real: el
 * enunciado permite usar mocks siempre que demuestren la logica de
 * conmutacion por error, y esto evita depender de credenciales/API keys
 * reales.
 *
 * Implementa el puerto EmailProviderPort, por lo que desde el punto de
 * vista del dominio es indistinguible de un cliente HTTP real contra la
 * API del proveedor.
 *
 * Cada proveedor concreto (ver MailgunProviderAdapter, SendGridProviderAdapter,
 * PostmarkProviderAdapter en este mismo directorio) es una subclase muy
 * delgada de esta base: solo fija el nombre del proveedor y documenta
 * donde iria la llamada real al SDK/API HTTP de ese proveedor en
 * produccion. Sustituir la simulacion por un cliente real NUNCA requiere
 * tocar el dominio, la aplicacion, ni la capa HTTP: es exactamente el
 * "Open/Closed Principle" en accion (abierto a extension via nuevas
 * subclases, cerrado a modificacion del resto del sistema).
 *
 * El "modo" de cada instancia es configurable (ver .env.example) para
 * poder demostrar en vivo, sin tocar codigo, los tres escenarios pedidos:
 * exito directo, exito tras reintentos, y failover a otro proveedor.
 */
export abstract class BaseMockProviderAdapter implements EmailProviderPort {
  readonly name: string;
  private callCount = 0;

  protected constructor(private readonly config: MockProviderConfig) {
    this.name = config.name;
  }

  async send(_message: EmailMessage): Promise<ProviderSendResult> {
    this.callCount += 1;
    const attemptNumberForThisProvider = this.callCount;

    await this.simulateNetworkLatency();

    if (this.config.mode === 'down') {
      throw new TransientProviderError(
        this.name,
        `[mock] ${this.name} no disponible (simulando 503 Service Unavailable)`,
      );
    }

    if (this.config.mode === 'flaky') {
      // El contador de llamadas es de instancia (vive mientras el proceso
      // este arriba), no "por mensaje": si solo comparara
      // attemptNumberForThisProvider contra flakyFailuresBeforeSuccess de
      // forma directa, el proveedor se "curaria" para siempre despues del
      // primer email que lo agotara, y todos los envios posteriores lo
      // verian permanentemente sano (un demo poco realista y facil de
      // confundir con un bug de la logica de reintentos). En cambio, se
      // repite el patron fallar-N-veces/responder-OK en ciclos, para que
      // el modo "flaky" siga siendo observable en cualquier envio
      // posterior, no solo en el primero.
      const cycleLength = this.config.flakyFailuresBeforeSuccess + 1;
      const positionInCycle = ((attemptNumberForThisProvider - 1) % cycleLength) + 1;
      if (positionInCycle <= this.config.flakyFailuresBeforeSuccess) {
        throw new TransientProviderError(
          this.name,
          `[mock] ${this.name} fallo transitorio simulado (intento ${positionInCycle}/${this.config.flakyFailuresBeforeSuccess} del ciclo actual antes de recuperarse)`,
        );
      }
    }

    return {
      providerName: this.name,
      providerMessageId: `${this.name}-${uuidv4()}`,
    };
  }

  private simulateNetworkLatency(): Promise<void> {
    return new Promise((resolve) =>
      setTimeout(resolve, this.config.simulatedLatencyMs),
    );
  }
}
