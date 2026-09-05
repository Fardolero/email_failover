export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  /** Fallos consecutivos necesarios para abrir el circuito. */
  failureThreshold: number;
  /** Cuanto tiempo se mantiene abierto antes de permitir un intento de prueba (half-open). */
  openDurationMs: number;
}

/**
 * Circuit breaker por proveedor (patron clasico de resiliencia, complementario
 * al retry con backoff de RetryPolicy.ts).
 *
 * Motivacion: el retry con backoff protege UNA peticion de un fallo
 * puntual, pero si un proveedor esta genuinamente caido durante varios
 * minutos, cada peticion nueva que llegue pagaria igual el costo completo
 * de reintentar contra el (varios intentos + backoff) antes de recien
 * ahi hacer failover, degradando la latencia percibida por TODOS los
 * clientes durante toda la caida. El circuit breaker recuerda, entre
 * peticiones, que un proveedor viene fallando de forma sostenida y deja
 * de intentarlo (fail-fast, sin red) durante una ventana de tiempo,
 * saltando directo al siguiente proveedor de la cadena.
 *
 * Maquina de estados (la implementacion estandar de 3 estados):
 *  - CLOSED: funcionamiento normal, se intenta contra el proveedor.
 *  - OPEN: se alcanzaron `failureThreshold` fallos consecutivos; no se
 *    intenta contra el proveedor hasta que pase `openDurationMs`.
 *  - HALF_OPEN: paso el tiempo de espera; se permite UN intento de
 *    prueba. Si tiene exito, se cierra el circuito; si falla, se vuelve
 *    a abrir (reiniciando la ventana de espera).
 *
 * Es una clase de infraestructura de resiliencia generica (no sabe nada
 * de "proveedores de email"), igual que RetryPolicy; SendEmailUseCase
 * mantiene una instancia por proveedor de la cadena.
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private openedAtMs = 0;

  constructor(
    public readonly name: string,
    private readonly config: CircuitBreakerConfig,
    private readonly now: () => number = Date.now,
  ) {}

  getState(): CircuitState {
    return this.state;
  }

  /**
   * Debe consultarse ANTES de intentar contactar al proveedor. Si retorna
   * false, el llamador debe saltar directo al siguiente proveedor de la
   * cadena sin gastar tiempo de red ni presupuesto de reintentos.
   */
  canAttempt(): boolean {
    if (this.state !== 'OPEN') {
      return true;
    }
    const elapsed = this.now() - this.openedAtMs;
    if (elapsed >= this.config.openDurationMs) {
      this.state = 'HALF_OPEN';
      return true;
    }
    return false;
  }

  /** Debe llamarse cuando el proveedor respondio OK (tras agotar reintentos con exito). */
  onSuccess(): void {
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
  }

  /** Debe llamarse cuando el proveedor agoto sus reintentos sin exito. */
  onFailure(): void {
    this.consecutiveFailures += 1;
    const shouldOpen =
      this.state === 'HALF_OPEN' || this.consecutiveFailures >= this.config.failureThreshold;
    if (shouldOpen) {
      this.state = 'OPEN';
      this.openedAtMs = this.now();
    }
  }
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  openDurationMs: 30_000,
};
