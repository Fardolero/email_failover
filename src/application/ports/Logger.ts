/**
 * Puerto de logging. La aplicacion depende de esta interfaz minima, no de
 * pino directamente, para no acoplar la logica de negocio a una libreria de
 * logging concreta (facil de reemplazar o mockear en tests).
 */
export interface Logger {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
  debug(obj: Record<string, unknown>, msg?: string): void;
}
