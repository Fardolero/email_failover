import request from 'supertest';
import { Express } from 'express';
import { buildApp } from '../../src/infrastructure/http/app';
import { FakeEmailProvider } from '../doubles/FakeEmailProvider';
import { createTestRepository } from '../doubles/InMemoryEmailSendRepositoryTestFactory';
import { silentLogger } from '../doubles/silentLogger';

const fastRetryConfig = { maxRetries: 1, baseDelayMs: 1, maxDelayMs: 2 };

function buildTestApp(providers: FakeEmailProvider[]): Express {
  return buildApp({
    providers,
    repository: createTestRepository(),
    logger: silentLogger,
    retryConfig: fastRetryConfig,
  });
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    from: 'no-reply@mimovilidad.com',
    to: ['usuario@example.com'],
    subject: 'Tu recibo de viaje',
    textBody: 'Gracias por viajar con nosotros.',
    ...overrides,
  };
}

describe('POST /api/v1/emails', () => {
  it('200: envia exitosamente con el proveedor primario', async () => {
    const primary = new FakeEmailProvider('mailgun', { type: 'success' });
    const secondary = new FakeEmailProvider('sendgrid', { type: 'success' });
    const app = buildTestApp([primary, secondary]);

    const response = await request(app).post('/api/v1/emails').send(validPayload());

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('SENT');
    expect(response.body.providerName).toBe('mailgun');
    expect(response.headers['x-request-id']).toBeDefined();
    expect(secondary.callCount).toBe(0);
  });

  it('200: hace failover automatico al proveedor secundario cuando el primario esta caido', async () => {
    const primary = new FakeEmailProvider('mailgun', { type: 'transient-failure' });
    const secondary = new FakeEmailProvider('sendgrid', { type: 'success' });
    const app = buildTestApp([primary, secondary]);

    const response = await request(app).post('/api/v1/emails').send(validPayload());

    expect(response.status).toBe(200);
    expect(response.body.providerName).toBe('sendgrid');
    expect(response.body.attempts.length).toBeGreaterThan(1);
    expect(response.body.attempts.some((a: { providerName: string }) => a.providerName === 'mailgun')).toBe(
      true,
    );
  });

  it('502: responde con error semantico cuando TODOS los proveedores fallan', async () => {
    const primary = new FakeEmailProvider('mailgun', { type: 'transient-failure' });
    const secondary = new FakeEmailProvider('sendgrid', { type: 'transient-failure' });
    const app = buildTestApp([primary, secondary]);

    const response = await request(app).post('/api/v1/emails').send(validPayload());

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('ALL_PROVIDERS_FAILED');
    expect(response.body.error.details.attempts.length).toBeGreaterThan(0);
  });

  it('400: rechaza un payload sin destinatarios', async () => {
    const app = buildTestApp([new FakeEmailProvider('mailgun', { type: 'success' })]);

    const response = await request(app)
      .post('/api/v1/emails')
      .send(validPayload({ to: [] }));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('400: rechaza una direccion de email con formato invalido (validacion de dominio)', async () => {
    const provider = new FakeEmailProvider('mailgun', { type: 'success' });
    const app = buildTestApp([provider]);

    const response = await request(app)
      .post('/api/v1/emails')
      .send(validPayload({ from: 'esto-no-es-un-email' }));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_PAYLOAD');
    expect(provider.callCount).toBe(0);
  });

  it('400: rechaza un payload sin textBody ni htmlBody', async () => {
    const app = buildTestApp([new FakeEmailProvider('mailgun', { type: 'success' })]);

    const response = await request(app)
      .post('/api/v1/emails')
      .send(validPayload({ textBody: undefined }));

    expect(response.status).toBe(400);
  });

  it('Idempotency-Key: una segunda peticion con la misma clave no reenvia el correo', async () => {
    const provider = new FakeEmailProvider('mailgun', { type: 'success' });
    const app = buildTestApp([provider]);
    const payload = validPayload();

    const first = await request(app)
      .post('/api/v1/emails')
      .set('Idempotency-Key', 'test-key-1')
      .send(payload);
    const second = await request(app)
      .post('/api/v1/emails')
      .set('Idempotency-Key', 'test-key-1')
      .send(payload);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.idempotentReplay).toBe(true);
    expect(provider.callCount).toBe(1);
  });

  it('409: rechaza reusar una Idempotency-Key con un payload distinto', async () => {
    const provider = new FakeEmailProvider('mailgun', { type: 'success' });
    const app = buildTestApp([provider]);

    await request(app)
      .post('/api/v1/emails')
      .set('Idempotency-Key', 'dup-key')
      .send(validPayload());

    const response = await request(app)
      .post('/api/v1/emails')
      .set('Idempotency-Key', 'dup-key')
      .send(validPayload({ subject: 'Otro asunto totalmente distinto' }));

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
  });
});

describe('GET /api/v1/emails/:id', () => {
  it('200: devuelve el registro de un envio previo', async () => {
    const provider = new FakeEmailProvider('mailgun', { type: 'success' });
    const app = buildTestApp([provider]);

    const sendResponse = await request(app).post('/api/v1/emails').send(validPayload());
    const statusResponse = await request(app).get(
      `/api/v1/emails/${sendResponse.body.requestId}`,
    );

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.status).toBe('SENT');
  });

  it('404: informa cuando el id no existe', async () => {
    const app = buildTestApp([new FakeEmailProvider('mailgun', { type: 'success' })]);

    const response = await request(app).get('/api/v1/emails/no-existe');

    expect(response.status).toBe(404);
  });
});

describe('GET /api/v1/health', () => {
  it('200: informa que el servicio esta arriba', async () => {
    const app = buildTestApp([new FakeEmailProvider('mailgun', { type: 'success' })]);

    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('UP');
  });
});

describe('GET /docs y /openapi.json', () => {
  it('expone la especificacion OpenAPI', async () => {
    const app = buildTestApp([new FakeEmailProvider('mailgun', { type: 'success' })]);

    const response = await request(app).get('/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body.info.title).toContain('Email Failover');
  });
});
