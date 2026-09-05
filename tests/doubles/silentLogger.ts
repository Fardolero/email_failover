import { Logger } from '../../src/application/ports/Logger';

/** Logger que no imprime nada, para no ensuciar la salida de los tests. */
export const silentLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
};
