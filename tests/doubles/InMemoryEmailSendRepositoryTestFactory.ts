import { InMemoryEmailSendRepository } from '../../src/infrastructure/persistence/InMemoryEmailSendRepository';

export function createTestRepository(): InMemoryEmailSendRepository {
  return new InMemoryEmailSendRepository();
}
