import { EmailMessage } from '../../src/domain/entities/EmailMessage';
import { EmailProviderPort, ProviderSendResult } from '../../src/domain/ports/EmailProviderPort';
import { PermanentProviderError, TransientProviderError } from '../../src/domain/errors/ProviderErrors';

export type FakeBehavior =
  | { type: 'success' }
  | { type: 'transient-failure' }
  | { type: 'permanent-failure' }
  | { type: 'fail-n-times-then-succeed'; failures: number };

/**
 * Doble de prueba (test double) para EmailProviderPort, controlado por el
 * test para simular exactamente el escenario que se quiere verificar
 * (exito, fallo transitorio, fallo permanente, o "flaky"). Se usa en los
 * tests unitarios de SendEmailUseCase para probar la logica de failover
 * de forma totalmente aislada de I/O real.
 */
export class FakeEmailProvider implements EmailProviderPort {
  public callCount = 0;
  public readonly receivedMessages: EmailMessage[] = [];

  constructor(
    public readonly name: string,
    private readonly behavior: FakeBehavior,
  ) {}

  async send(message: EmailMessage): Promise<ProviderSendResult> {
    this.callCount += 1;
    this.receivedMessages.push(message);

    switch (this.behavior.type) {
      case 'success':
        return { providerName: this.name, providerMessageId: `${this.name}-msg-${this.callCount}` };
      case 'transient-failure':
        throw new TransientProviderError(this.name, `${this.name}: fallo transitorio simulado`);
      case 'permanent-failure':
        throw new PermanentProviderError(this.name, `${this.name}: fallo permanente simulado`);
      case 'fail-n-times-then-succeed':
        if (this.callCount <= this.behavior.failures) {
          throw new TransientProviderError(
            this.name,
            `${this.name}: fallo transitorio simulado (${this.callCount}/${this.behavior.failures})`,
          );
        }
        return { providerName: this.name, providerMessageId: `${this.name}-msg-${this.callCount}` };
      default:
        throw new Error('Comportamiento de FakeEmailProvider no soportado');
    }
  }
}
