import { EmailMessage } from '../../../src/domain/entities/EmailMessage';
import { EmailAddress } from '../../../src/domain/value-objects/EmailAddress';
import { MailgunProviderAdapter } from '../../../src/infrastructure/providers/MailgunProviderAdapter';
import { TransientProviderError } from '../../../src/domain/errors/ProviderErrors';

function sampleMessage(): EmailMessage {
  return EmailMessage.create({
    id: 'req-1',
    from: EmailAddress.create('no-reply@example.com'),
    to: [EmailAddress.create('destinatario@example.com')],
    subject: 'Asunto',
    textBody: 'Cuerpo',
  });
}

describe('Adaptadores mock de proveedor (BaseMockProviderAdapter)', () => {
  it('modo "healthy": siempre responde OK', async () => {
    const provider = new MailgunProviderAdapter({
      mode: 'healthy',
      flakyFailuresBeforeSuccess: 2,
      simulatedLatencyMs: 0,
    });

    const result = await provider.send(sampleMessage());

    expect(result.providerName).toBe('mailgun');
    expect(result.providerMessageId).toMatch(/^mailgun-/);
  });

  it('modo "down": siempre falla con TransientProviderError', async () => {
    const provider = new MailgunProviderAdapter({
      mode: 'down',
      flakyFailuresBeforeSuccess: 2,
      simulatedLatencyMs: 0,
    });

    await expect(provider.send(sampleMessage())).rejects.toThrow(TransientProviderError);
    await expect(provider.send(sampleMessage())).rejects.toThrow(TransientProviderError);
  });

  it('modo "flaky": falla N veces y luego responde OK', async () => {
    const provider = new MailgunProviderAdapter({
      mode: 'flaky',
      flakyFailuresBeforeSuccess: 2,
      simulatedLatencyMs: 0,
    });

    await expect(provider.send(sampleMessage())).rejects.toThrow(TransientProviderError);
    await expect(provider.send(sampleMessage())).rejects.toThrow(TransientProviderError);
    const result = await provider.send(sampleMessage());
    expect(result.providerName).toBe('mailgun');
  });
});
