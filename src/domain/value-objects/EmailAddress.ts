import { InvalidEmailAddressError } from '../errors/DomainErrors';

// Regex deliberadamente simple: la validacion exhaustiva de RFC 5322 no es el
// foco de este ejercicio. Cubre los casos tipicos y rechaza basura obvia.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Value Object: una direccion de email valida e inmutable. Encapsula la
 * unica regla de negocio relevante (formato valido) para que el resto del
 * dominio nunca tenga que volver a validarla.
 */
export class EmailAddress {
  private constructor(public readonly value: string) {}

  static create(raw: string): EmailAddress {
    const trimmed = (raw ?? '').trim();
    if (!EMAIL_REGEX.test(trimmed)) {
      throw new InvalidEmailAddressError(raw);
    }
    return new EmailAddress(trimmed.toLowerCase());
  }

  equals(other: EmailAddress): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
