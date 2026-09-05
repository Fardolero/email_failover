import { CircuitBreaker } from '../../../src/application/services/CircuitBreaker';

function fakeClock(startMs: number) {
  let current = startMs;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe('CircuitBreaker', () => {
  it('empieza CLOSED y permite intentar', () => {
    const breaker = new CircuitBreaker('p', { failureThreshold: 2, openDurationMs: 1000 });
    expect(breaker.getState()).toBe('CLOSED');
    expect(breaker.canAttempt()).toBe(true);
  });

  it('se abre tras alcanzar el umbral de fallos consecutivos y deja de permitir intentos', () => {
    const breaker = new CircuitBreaker('p', { failureThreshold: 3, openDurationMs: 1000 });

    breaker.onFailure();
    expect(breaker.getState()).toBe('CLOSED');
    breaker.onFailure();
    expect(breaker.getState()).toBe('CLOSED');
    breaker.onFailure();

    expect(breaker.getState()).toBe('OPEN');
    expect(breaker.canAttempt()).toBe(false);
  });

  it('un exito antes de llegar al umbral resetea el contador de fallos', () => {
    const breaker = new CircuitBreaker('p', { failureThreshold: 2, openDurationMs: 1000 });

    breaker.onFailure();
    breaker.onSuccess();
    breaker.onFailure();

    expect(breaker.getState()).toBe('CLOSED');
    expect(breaker.canAttempt()).toBe(true);
  });

  it('pasa a HALF_OPEN y permite un intento de prueba una vez transcurrido openDurationMs', () => {
    const clock = fakeClock(0);
    const breaker = new CircuitBreaker('p', { failureThreshold: 1, openDurationMs: 1000 }, clock.now);

    breaker.onFailure();
    expect(breaker.getState()).toBe('OPEN');
    expect(breaker.canAttempt()).toBe(false);

    clock.advance(999);
    expect(breaker.canAttempt()).toBe(false);

    clock.advance(2);
    expect(breaker.canAttempt()).toBe(true);
    expect(breaker.getState()).toBe('HALF_OPEN');
  });

  it('si el intento de prueba en HALF_OPEN vuelve a fallar, se reabre inmediatamente', () => {
    const clock = fakeClock(0);
    const breaker = new CircuitBreaker('p', { failureThreshold: 1, openDurationMs: 1000 }, clock.now);

    breaker.onFailure();
    clock.advance(1000);
    breaker.canAttempt(); // transiciona a HALF_OPEN
    breaker.onFailure();

    expect(breaker.getState()).toBe('OPEN');
    expect(breaker.canAttempt()).toBe(false);
  });

  it('si el intento de prueba en HALF_OPEN tiene exito, el circuito se cierra', () => {
    const clock = fakeClock(0);
    const breaker = new CircuitBreaker('p', { failureThreshold: 1, openDurationMs: 1000 }, clock.now);

    breaker.onFailure();
    clock.advance(1000);
    breaker.canAttempt();
    breaker.onSuccess();

    expect(breaker.getState()).toBe('CLOSED');
    expect(breaker.canAttempt()).toBe(true);
  });
});
