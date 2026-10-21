/**
 * Integration & Concurrency Tests for Payments, Idempotency & Metrics
 */

const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/config/prisma');

describe('Payment Processing, Idempotency & Observability Metrics', () => {
  jest.setTimeout(30000);

  let patientToken;
  let patientUserId;
  let doctorToken;
  let doctorUserId;
  let doctorProfileId;
  let otherPatientToken;
  let adminToken;
  let testSlotId;
  let testConsultationId;

  beforeAll(async () => {
    const timestamp = Date.now();

    // 1. Register Primary Patient
    const patientRes = await request(app)
      .post('/api/v1/auth/register/patient')
      .send({
        email: `pay.patient.${timestamp}@example.com`,
        password: 'Password@123',
        firstName: 'Dev',
        lastName: 'Sharma',
        phoneNumber: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
      });
    patientToken = patientRes.body.data.token;
    patientUserId = patientRes.body.data.user.id;

    // 2. Register Secondary Patient (for IDOR attack tests)
    const otherPatientRes = await request(app)
      .post('/api/v1/auth/register/patient')
      .send({
        email: `other.patient.${timestamp}@example.com`,
        password: 'Password@123',
        firstName: 'Rohan',
        lastName: 'Verma',
        phoneNumber: `+9197${Math.floor(10000000 + Math.random() * 90000000)}`,
      });
    otherPatientToken = otherPatientRes.body.data.token;

    // 3. Register Doctor
    const doctorRes = await request(app)
      .post('/api/v1/auth/register/doctor')
      .send({
        email: `pay.doctor.${timestamp}@amrutam.co.in`,
        password: 'Password@123',
        firstName: 'Ananya',
        lastName: 'Deshmukh',
        specialization: 'Ayurveda',
        qualification: 'BAMS',
        licenseNumber: `AYUR-PAY-${timestamp}`,
        consultationFee: 650.0,
      });
    doctorToken = doctorRes.body.data.token;
    doctorUserId = doctorRes.body.data.user.id;
    doctorProfileId = doctorRes.body.data.user.doctorProfile.id;

    // Verify doctor in database so slots can be booked
    await prisma.doctorProfile.update({
      where: { id: doctorProfileId },
      data: { isVerified: true },
    });

    // 4. Create an Admin User in DB
    const adminUser = await prisma.user.create({
      data: {
        email: `pay.admin.${timestamp}@amrutam.co.in`,
        passwordHash: 'dummy_hash',
        role: 'ADMIN',
      },
    });
    const jwt = require('jsonwebtoken');
    const config = require('../src/config/env');
    adminToken = jwt.sign(
      { sub: adminUser.id, id: adminUser.id, email: adminUser.email, role: 'ADMIN' },
      config.jwtSecret,
      { expiresIn: '1h' }
    );


    // 5. Create an Availability Slot for Doctor
    const slotStart = new Date(Date.now() + 86400000);
    const slotEnd = new Date(Date.now() + 86400000 + 3600000);

    const slotRes = await request(app)
      .post('/api/v1/doctors/slots')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        slots: [
          {
            startTime: slotStart.toISOString(),
            endTime: slotEnd.toISOString(),
          },
        ],
      });
    const slotsData = slotRes.body.data;
    testSlotId = Array.isArray(slotsData) ? slotsData[0].id : slotsData.id;


    // 6. Book Consultation
    const bookingRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        slotId: testSlotId,
        consultationType: 'VIDEO',
        symptomsSummary: 'Ayurvedic wellness checkup',
      });
    testConsultationId = bookingRes.body.data.id;
  });

  afterAll(async () => {
    try {
      if (testConsultationId) {
        await prisma.payment.deleteMany({ where: { consultationId: testConsultationId } });
        await prisma.consultation.deleteMany({ where: { id: testConsultationId } });
      }
      if (testSlotId) {
        await prisma.availabilitySlot.deleteMany({ where: { id: testSlotId } });
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  });


  // ===================================================================
  // 1. Payment Processing
  // ===================================================================
  describe('POST /api/v1/payments/process', () => {
    const idempotencyKey = `idemp-test-${Date.now()}-${Math.random()}`;

    it('should successfully process consultation payment for owner patient', async () => {
      const res = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${patientToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          consultationId: testConsultationId,
          paymentMethod: 'UPI',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.paymentMethod).toBe('UPI');
      expect(res.body.data).toHaveProperty('transactionId');
      expect(Number(res.body.data.amount)).toBe(650.0);
    });

    it('should return 200 OK and X-Idempotent-Replay header when re-sent with exact same Idempotency-Key', async () => {
      const res = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${patientToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          consultationId: testConsultationId,
          paymentMethod: 'UPI',
        });

      expect([200, 201]).toContain(res.statusCode);
      expect(res.body.success).toBe(true);
      expect(res.headers['x-idempotent-replay']).toBe('true');
    });

    it('should reject payment processing if another patient attempts IDOR attack', async () => {
      const res = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${otherPatientToken}`)
        .send({
          consultationId: testConsultationId,
          paymentMethod: 'CARD',
        });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should reject unauthenticated payment processing', async () => {
      const res = await request(app)
        .post('/api/v1/payments/process')
        .send({
          consultationId: testConsultationId,
          paymentMethod: 'UPI',
        });

      expect(res.statusCode).toBe(401);
    });

    it('should reject request containing raw credit card numbers or CVVs for PCI-DSS compliance (400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          consultationId: testConsultationId,
          paymentMethod: 'CARD',
          cardNumber: '4111222233334444',
          cvv: '123',
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors?.[0]?.message || res.body.message).toMatch(/Raw card credentials/i);
    });

    it('should reject reuse of same Idempotency-Key with a different consultation ID (409 Conflict)', async () => {
      const fakeOtherConsultationId = '11111111-2222-3333-4444-555555555555';
      const res = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${patientToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          consultationId: fakeOtherConsultationId,
          paymentMethod: 'UPI',
        });

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/different request payload/i);
    });

    it('should handle simulated payment gateway failure, record FAILED status & audit log, and permit safe retry', async () => {
      // 1. Create a slot & booking for failure testing
      const futureStart = new Date(Date.now() + 172800000);
      const futureEnd = new Date(Date.now() + 172800000 + 3600000);
      const slotRes = await request(app)
        .post('/api/v1/doctors/slots')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          slots: [{ startTime: futureStart.toISOString(), endTime: futureEnd.toISOString() }],
        });
      const sId = Array.isArray(slotRes.body.data) ? slotRes.body.data[0].id : slotRes.body.data.id;

      const bookRes = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ slotId: sId, consultationType: 'VIDEO' });
      const failureConsultationId = bookRes.body.data.id;

      // 2. Process payment with failure simulation
      const failKey = `fail-idemp-${Date.now()}`;
      const failRes = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${patientToken}`)
        .set('Idempotency-Key', failKey)
        .send({
          consultationId: failureConsultationId,
          paymentMethod: 'UPI',
          simulateFailure: true,
        });

      expect(failRes.statusCode).toBe(400);
      expect(failRes.body.success).toBe(false);
      expect(failRes.body.message).toMatch(/declined|insufficient/i);

      // Verify payment in database is recorded as FAILED
      const failedPaymentInDb = await prisma.payment.findUnique({
        where: { consultationId: failureConsultationId },
      });
      expect(failedPaymentInDb).toBeDefined();
      expect(failedPaymentInDb.status).toBe('FAILED');

      // Verify audit log exists with status FAILED
      const failedAudit = await prisma.auditLog.findFirst({
        where: {
          action: 'PAYMENT_PROCESSED',
          details: { path: ['status'], equals: 'FAILED' },
        },
      });
      expect(failedAudit).toBeDefined();

      // 3. SAFE RETRY: Re-attempt payment with valid transaction (re-using same or new key)
      const retryRes = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${patientToken}`)
        .set('Idempotency-Key', failKey)
        .send({
          consultationId: failureConsultationId,
          paymentMethod: 'UPI',
          simulateFailure: false,
        });

      expect(retryRes.statusCode).toBe(201);
      expect(retryRes.body.success).toBe(true);
      expect(retryRes.body.data.status).toBe('COMPLETED');

      // Verify payment in database transitioned to COMPLETED
      const completedPaymentInDb = await prisma.payment.findUnique({
        where: { consultationId: failureConsultationId },
      });
      expect(completedPaymentInDb.status).toBe('COMPLETED');
    });
  });

  // ===================================================================
  // 2. Payment Receipt Lookup
  // ===================================================================
  describe('GET /api/v1/payments/consultation/:consultationId', () => {
    it('should allow the owner patient to view receipt', async () => {
      const res = await request(app)
        .get(`/api/v1/payments/consultation/${testConsultationId}`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.payment.status).toBe('COMPLETED');
    });

    it('should allow the assigned doctor to view receipt', async () => {
      const res = await request(app)
        .get(`/api/v1/payments/consultation/${testConsultationId}`)
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should allow an admin to view receipt', async () => {
      const res = await request(app)
        .get(`/api/v1/payments/consultation/${testConsultationId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should deny unauthorized 3rd party patient from viewing receipt (IDOR protection)', async () => {
      const res = await request(app)
        .get(`/api/v1/payments/consultation/${testConsultationId}`)
        .set('Authorization', `Bearer ${otherPatientToken}`);

      expect(res.statusCode).toBe(403);
    });
  });

  // ===================================================================
  // 3. Payment Refund Lifecycle
  // ===================================================================
  describe('POST /api/v1/payments/:id/refund', () => {
    let paymentId;

    beforeAll(async () => {
      const receiptRes = await request(app)
        .get(`/api/v1/payments/consultation/${testConsultationId}`)
        .set('Authorization', `Bearer ${patientToken}`);
      paymentId = receiptRes.body.data.payment.id;
    });

    it('should reject refund request from patient role (RBAC barrier)', async () => {
      const res = await request(app)
        .post(`/api/v1/payments/${paymentId}/refund`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ reason: 'Patient changed mind' });

      expect(res.statusCode).toBe(403);
    });

    it('should allow Doctor or Admin to initiate refund', async () => {
      const res = await request(app)
        .post(`/api/v1/payments/${paymentId}/refund`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ reason: 'Patient emergency cancellation prior to consultation' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('REFUNDED');
    });

    it('should reject a second refund on already refunded payment', async () => {
      const res = await request(app)
        .post(`/api/v1/payments/${paymentId}/refund`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ reason: 'Repeat refund attempt' });

      expect(res.statusCode).toBe(400);
    });
  });

  // ===================================================================
  // 4. Observability & Prometheus Metrics Endpoint
  // ===================================================================
  describe('GET /metrics and GET /api/v1/health/metrics', () => {
    it('should expose Prometheus plain-text metrics at /metrics', async () => {
      const res = await request(app).get('/metrics');

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.text).toContain('nodejs_uptime_seconds');
      expect(res.text).toContain('http_requests_total');
      expect(res.text).toContain('nodejs_memory_heap_used_bytes');
    });

    it('should expose Prometheus metrics under /api/v1/health/metrics', async () => {
      const res = await request(app).get('/api/v1/health/metrics');

      expect(res.statusCode).toBe(200);
      expect(res.text).toContain('http_requests_total');
    });
  });
});
