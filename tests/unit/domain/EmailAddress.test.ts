import { EmailAddress } from '../../../src/domain/value-objects/EmailAddress';
import { InvalidEmailAddressError } from '../../../src/domain/errors/DomainErrors';

describe('EmailAddress', () => {
  it('crea una direccion valida normalizada (trim + lowercase)', () => {
    const address = EmailAddress.create('  Usuario@Example.COM  ');
    expect(address.value).toBe('usuario@example.com');
    expect(address.toString()).toBe('usuario@example.com');
  });

  it.each(['', 'no-es-un-email', 'sin-arroba.com', '@sin-usuario.com', 'usuario@', 'a b@example.com'])(
    'rechaza "%s" como direccion invalida',
    (invalid) => {
      expect(() => EmailAddress.create(invalid)).toThrow(InvalidEmailAddressError);
    },
  );

  it('compara igualdad por valor', () => {
    const a = EmailAddress.create('a@example.com');
    const b = EmailAddress.create('A@Example.com');
    expect(a.equals(b)).toBe(true);
  });
});
