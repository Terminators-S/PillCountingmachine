process.env.REQUIRE_LOGIN = 'false';
process.env.API_KEY = '';

const request = require('supertest');
const { app, initializeApp } = require('../server');

describe('API baseline', () => {
  beforeAll(async () => {
    await initializeApp();
  });

  test('health endpoint responds with ok', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.observability).toBeDefined();
    expect(typeof response.body.observability.logLevel).toBe('string');
  });

  test('pill type validation rejects empty body', async () => {
    const response = await request(app).post('/api/pill-types').send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('code and name are required');
  });

  test('request code rejects placeholder email domains', async () => {
    const response = await request(app).post('/api/auth/request-code').send({ email: 'demo@example.com' });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('placeholder/test domains');
  });

  test('event ingestion is idempotent with event idempotency key', async () => {
    const suffix = String(Date.now()).slice(-6);
    const pillTypeCode = `UT${suffix}`;
    const machineId = `machine-${suffix}`;
    const ingestKey = `ingest-${suffix}`;

    const createPillType = await request(app)
      .post('/api/pill-types')
      .send({ code: pillTypeCode, name: `UnitTest-${suffix}` });

    expect([201, 409]).toContain(createPillType.status);

    const payload = {
      eventType: 'count.completed',
      machineId,
      eventId: `evt-${suffix}`,
      idempotencyKey: ingestKey,
      occurredAt: Date.now(),
      payload: {
        pillTypeCode,
        actualQuantity: 25,
        operatorId: 'op-unit',
        lotNo: `lot-${suffix}`,
        location: 'qa-lab'
      }
    };

    const first = await request(app).post('/api/events/ingest').send(payload);
    expect(first.status).toBe(202);
    expect(first.body.deduped).toBe(false);

    const second = await request(app).post('/api/events/ingest').send(payload);
    expect(second.status).toBe(202);
    expect(second.body.deduped).toBe(true);
  });

  test('jobs endpoint supports create, start, and finish flow', async () => {
    const suffix = String(Date.now()).slice(-6);
    const pillTypeCode = `JB${suffix}`;
    const machineId = `job-machine-${suffix}`;

    const createPillType = await request(app)
      .post('/api/pill-types')
      .send({ code: pillTypeCode, name: `JobPill-${suffix}` });

    expect([201, 409]).toContain(createPillType.status);

    const createJob = await request(app)
      .post('/api/jobs')
      .send({
        machineId,
        pillTypeCode,
        targetQuantity: 40,
        operatorId: 'job-operator'
      });

    expect(createJob.status).toBe(201);
    expect(createJob.body.jobId).toBeTruthy();

    const jobId = createJob.body.jobId;

    const startJob = await request(app)
      .post(`/api/jobs/${encodeURIComponent(jobId)}/start`)
      .send({ operatorId: 'job-operator' });
    expect(startJob.status).toBe(200);
    expect(startJob.body.status).toBe('in_progress');

    const finishJob = await request(app)
      .post(`/api/jobs/${encodeURIComponent(jobId)}/finish`)
      .send({ actualQuantity: 39, operatorId: 'job-operator' });
    expect(finishJob.status).toBe(200);
    expect(finishJob.body.status).toBe('completed');
  });
});
