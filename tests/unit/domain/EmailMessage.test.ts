import { EmailMessage } from '../../../src/domain/entities/EmailMessage';
import { EmailAddress } from '../../../src/domain/value-objects/EmailAddress';
import { InvalidEmailMessageError } from '../../../src/domain/errors/DomainErrors';

function validProps() {
  return {
    id: 'req-1',
    from: EmailAddress.create('no-reply@example.com'),
    to: [EmailAddress.create('destinatario@example.com')],
    subject: 'Asunto de prueba',
    textBody: 'Hola mundo',
  };
}

describe('EmailMessage', () => {
  it('se construye correctamente con los datos minimos validos', () => {
    const message = EmailMessage.create(validProps());
    expect(message.to).toHaveLength(1);
    expect(message.cc).toEqual([]);
    expect(message.attachments).toEqual([]);
  });

  it('rechaza mensajes sin destinatarios', () => {
    expect(() => EmailMessage.create({ ...validProps(), to: [] })).toThrow(
      InvalidEmailMessageError,
    );
  });

  it('rechaza mensajes sin subject', () => {
    expect(() => EmailMessage.create({ ...validProps(), subject: '  ' })).toThrow(
      InvalidEmailMessageError,
    );
  });

  it('rechaza mensajes sin textBody NI htmlBody', () => {
    expect(() =>
      EmailMessage.create({ ...validProps(), textBody: undefined }),
    ).toThrow(InvalidEmailMessageError);
  });

  it('acepta un mensaje que solo tiene htmlBody', () => {
    const message = EmailMessage.create({
      ...validProps(),
      textBody: undefined,
      htmlBody: '<p>Hola</p>',
    });
    expect(message.htmlBody).toBe('<p>Hola</p>');
  });
});
