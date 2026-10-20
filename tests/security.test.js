const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const config = require('../src/config/env');
const { prisma } = require('../src/config/prisma');

describe('Comprehensive Security & Authorization Test Suite', () => {
  const timestamp = Date.now();

  const doctor1Data = {
    email: `sec_doc1_${timestamp}@amrutam.co.in`,
    password: 'Password@123',
    firstName: 'Dr. Anand',
    lastName: 'Kulkarni',
    specialization: 'Ayurvedic Surgery (Shalya Tantra)',
    qualification: 'MS (Ayurveda)',
    licenseNumber: `SEC-LIC1-${timestamp}`,
    consultationFee: 700,
  };

  const doctor2Data = {
    email: `sec_doc2_${timestamp}@amrutam.co.in`,
    password: 'Password@123',
    firstName: 'Dr. Meera',
    lastName: 'Iyer',
    specialization: 'Dravyaguna',
    qualification: 'BAMS, MD',
    licenseNumber: `SEC-LIC2-${timestamp}`,
    consultationFee: 600,
  };

  const patient1Data = {
    email: `sec_pat1_${timestamp}@example.com`,
    password: 'Password@123',
    firstName: 'Vikram',
    lastName: 'Rathore',
  };

  const patient2Data = {
    email: `sec_pat2_${timestamp}@example.com`,
    password: 'Password@123',
    firstName: 'Ananya',
    lastName: 'Deshmukh',
  };

  let doc1Token, doc1ProfileId;
  let doc2Token;
  let pat1Token, pat1UserId;
  let pat2Token;
  let sharedSlot;
  let testConsultation;

  beforeAll(async () => {
    // 1. Register Doctor 1
    const d1Res = await request(app).post('/api/v1/auth/register/doctor').send(doctor1Data);
    doc1Token = d1Res.body.data.token;
    doc1ProfileId = d1Res.body.data.user.doctorProfile.id;

    // 2. Register Doctor 2
    const d2Res = await request(app).post('/api/v1/auth/register/doctor').send(doctor2Data);
    doc2Token = d2Res.body.data.token;

    // 3. Register Patient 1
    const p1Res = await request(app).post('/api/v1/auth/register/patient').send(patient1Data);
    pat1Token = p1Res.body.data.token;
    pat1UserId = p1Res.body.data.user.id;

    // 4. Register Patient 2
    const p2Res = await request(app).post('/api/v1/auth/register/patient').send(patient2Data);
    pat2Token = p2Res.body.data.token;

    // 5. Create a slot for Doctor 1
    const future = new Date(Date.now() + 120 * 60 * 60 * 1000);
    const slotRes = await request(app)
      .post('/api/v1/doctors/slots')
      .set('Authorization', `Bearer ${doc1Token}`)
      .send({
        startTime: new Date(future.setHours(10, 0, 0, 0)).toISOString(),
        endTime: new Date(future.setHours(11, 0, 0, 0)).toISOString(),
      });
    sharedSlot = slotRes.body.data[0] || slotRes.body.data;

    // 6. Patient 1 books the slot with confidential symptoms
    const bookRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${pat1Token}`)
      .send({
        slotId: sharedSlot.id,
        consultationType: 'VIDEO',
        symptomsSummary: 'Confidential Patient 1 Health Condition: Chronic migraines & Pitta imbalance',
      });
    testConsultation = bookRes.body.data;
  });

  afterAll(async () => {
    try {
      const emails = [doctor1Data.email, doctor2Data.email, patient1Data.email, patient2Data.email];
      const users = await prisma.user.findMany({
        where: { email: { in: emails } },
        select: { id: true },
      });
      const userIds = users.map((u) => u.id);

      await prisma.prescription.deleteMany({
        where: { consultation: { patient: { userId: { in: userIds } } } },
      });
      await prisma.consultation.deleteMany({
        where: { patient: { userId: { in: userIds } } },
      });
      await prisma.availabilitySlot.deleteMany({
        where: { doctor: { userId: { in: userIds } } },
      });
      await prisma.auditLog.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.patientProfile.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.doctorProfile.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    } catch (e) {
      // Clean up fallback
    }
    const { closeRedis } = require('../src/config/redis');
    await closeRedis();
    await prisma.$disconnect();
  });

  // =========================================================================
  // 1. SENSITIVE DATA EXPOSURE CHECKS
  // =========================================================================
  describe('Sensitive Data Exposure Protection', () => {
    it('should never expose passwordHash in /api/v1/auth/me response', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${pat1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.passwordHash).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('should never expose passwordHash when retrieving booking details', async () => {
      const res = await request(app)
        .get(`/api/v1/bookings/${testConsultation.id}`)
        .set('Authorization', `Bearer ${pat1Token}`);

      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('should never expose passwordHash when listing public doctors', async () => {
      const res = await request(app).get('/api/v1/doctors');

      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });
  });

  // =========================================================================
  // 2. BROKEN ACCESS CONTROL & IDOR PREVENTION
  // =========================================================================
  describe('Broken Access Control & IDOR Defense', () => {
    it('should forbid Patient 2 from accessing Patient 1 booking details (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/bookings/${testConsultation.id}`)
        .set('Authorization', `Bearer ${pat2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/not authorized to view/i);
    });

    it('should forbid Patient 2 from cancelling Patient 1 booking (403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/v1/bookings/${testConsultation.id}/cancel`)
        .set('Authorization', `Bearer ${pat2Token}`)
        .send({ cancellationReason: 'Malicious attempt to cancel another user booking' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should forbid Doctor 2 from updating status of Doctor 1 consultation (403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/v1/bookings/${testConsultation.id}/status`)
        .set('Authorization', `Bearer ${doc2Token}`)
        .send({ status: 'IN_PROGRESS' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should forbid Doctor 2 from issuing a prescription for Doctor 1 consultation (403 Forbidden)', async () => {
      // First update status to IN_PROGRESS by Doctor 1
      await request(app)
        .patch(`/api/v1/bookings/${testConsultation.id}/status`)
        .set('Authorization', `Bearer ${doc1Token}`)
        .send({ status: 'IN_PROGRESS' });

      // Doctor 2 tries to issue prescription for Doctor 1's consultation
      const res = await request(app)
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doc2Token}`)
        .send({
          consultationId: testConsultation.id,
          diagnosis: 'Attempted unauthorized diagnosis',
          items: [
            {
              medicineName: 'Triphala Churna',
              dosage: '5g',
              frequency: 'Twice daily',
              duration: '15 days',
            },
          ],
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/not authorized to issue prescriptions for another doctor/i);
    });

    it('should forbid regular patients and doctors from accessing admin analytics (403 Forbidden)', async () => {
      const patRes = await request(app)
        .get('/api/v1/admin/analytics')
        .set('Authorization', `Bearer ${pat1Token}`);
      expect(patRes.status).toBe(403);

      const docRes = await request(app)
        .get('/api/v1/admin/analytics')
        .set('Authorization', `Bearer ${doc1Token}`);
      expect(docRes.status).toBe(403);
    });

    it('should forbid regular users from accessing security audit logs (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${pat1Token}`);

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 3. ACCOUNT DEACTIVATION / IMMEDIATE TOKEN REVOCATION BEHAVIOR
  // =========================================================================
  describe('Account Status Enforcement', () => {
    let victimToken, victimUserId;

    beforeAll(async () => {
      const victimData = {
        email: `victim_${timestamp}@example.com`,
        password: 'Password@123',
        firstName: 'Deactivated',
        lastName: 'User',
      };
      const res = await request(app).post('/api/v1/auth/register/patient').send(victimData);
      victimToken = res.body.data.token;
      victimUserId = res.body.data.user.id;

      // Deactivate the user directly in database
      await prisma.user.update({
        where: { id: victimUserId },
        data: { isActive: false },
      });
    });

    it('should immediately block an active token if user account was deactivated (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${victimToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/deactivated/i);
    });

    it('should reject login attempt for deactivated user (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: `victim_${timestamp}@example.com`,
          password: 'Password@123',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/disabled/i);
    });
  });

  // =========================================================================
  // 4. MALFORMED REQUEST & PARAMETER SAFETY (No 500 crashes / stack leaks)
  // =========================================================================
  describe('Malformed Parameter & Query Safety', () => {
    it('should return 400 or 404 for malformed non-UUID in booking ID parameter, not 500', async () => {
      const res = await request(app)
        .get('/api/v1/bookings/not-a-valid-uuid')
        .set('Authorization', `Bearer ${pat1Token}`);

      expect(res.status).toBeLessThan(500); // Must be 400 or 404, never 500
      expect(res.body.success).toBe(false);
    });

    it('should return 400 or 404 for malformed non-UUID in prescription ID parameter, not 500', async () => {
      const res = await request(app)
        .get('/api/v1/prescriptions/malicious-sql-injection-attempt')
        .set('Authorization', `Bearer ${pat1Token}`);

      expect(res.status).toBeLessThan(500);
      expect(res.body.success).toBe(false);
    });

    it('should reject requests with invalid JSON syntax with clean 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email": "broken_json, "password": "123"');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Invalid JSON payload/i);
    });
  });

  // =========================================================================
  // 5. JWT INTEGRITY & FORGERY DEFENSE
  // =========================================================================
  describe('JWT Security & Forgery Defenses', () => {
    it('should reject JWT signed with a forged/untrusted secret (401 Unauthorized)', async () => {
      const forgedToken = jwt.sign(
        { sub: pat1UserId, email: patient1Data.email, role: 'ADMIN' },
        'malicious_attacker_secret_key_1234567890'
      );

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${forgedToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Invalid authentication token/i);
    });

    it('should reject tokens with algorithm "none" (401 Unauthorized)', async () => {
      // Unsigned token
      const noneToken = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMjM0NSIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsInJvbGUiOiJBRE1JTiJ9.';

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${noneToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject malformed Authorization headers without token (401 Unauthorized)', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer ');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // 6. HEALTH INFORMATION CONFIDENTIALITY
  // =========================================================================
  describe('Protected Health Information (PHI) Access Restrictions', () => {
    let issuedPrescriptionId;

    beforeAll(async () => {
      // Doctor 1 issues a prescription
      const rxRes = await request(app)
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doc1Token}`)
        .send({
          consultationId: testConsultation.id,
          diagnosis: 'Amavata (Rheumatoid arthritis) with digestive endotoxins (Ama)',
          notes: 'Avoid cold water, curd, and heavy oily foods (Pathya-Apathya regimen)',
          items: [
            {
              medicineName: 'Yograj Guggulu',
              dosage: '2 tablets',
              frequency: 'Twice daily with warm water',
              duration: '30 days',
            },
            {
              medicineName: 'Dashmoolarishta',
              dosage: '20 ml',
              frequency: 'Twice daily after food',
              duration: '30 days',
            },
          ],
        });
      issuedPrescriptionId = rxRes.body.data.id;
    });

    it('should allow the consultation patient to view their own medical prescription', async () => {
      const res = await request(app)
        .get(`/api/v1/prescriptions/${issuedPrescriptionId}`)
        .set('Authorization', `Bearer ${pat1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.diagnosis).toMatch(/Amavata/i);
      expect(res.body.data.items.length).toBe(2);
    });

    it('should allow the prescribing doctor to view the medical prescription', async () => {
      const res = await request(app)
        .get(`/api/v1/prescriptions/${issuedPrescriptionId}`)
        .set('Authorization', `Bearer ${doc1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should forbid an unrelated patient from viewing the medical prescription (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/prescriptions/${issuedPrescriptionId}`)
        .set('Authorization', `Bearer ${pat2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/do not have permission/i);
    });

    it('should forbid an unrelated doctor from viewing the medical prescription (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/prescriptions/${issuedPrescriptionId}`)
        .set('Authorization', `Bearer ${doc2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/do not have permission/i);
    });
  });

  // =========================================================================
  // 7. REDIS TOKEN REVOCATION (LOGOUT) & CACHING BEHAVIOR
  // =========================================================================
  describe('Redis Token Blacklist & Caching Integrity', () => {
    let logoutToken;

    beforeAll(async () => {
      const logoutUser = {
        email: `logout_test_${timestamp}@example.com`,
        password: 'Password@123',
        firstName: 'Logout',
        lastName: 'Tester',
      };
      const res = await request(app).post('/api/v1/auth/register/patient').send(logoutUser);
      logoutToken = res.body.data.token;
    });

    it('should allow authenticated access before logout', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${logoutToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should successfully log out and invalidate token (200 OK)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${logoutToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/logged out/i);
    });

    it('should reject subsequent requests with the revoked token (401 Unauthorized)', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${logoutToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Token has been revoked/i);
    });

    it('should serve cached doctor queries reliably', async () => {
      // First query (warms cache)
      const res1 = await request(app).get('/api/v1/doctors?limit=5');
      expect(res1.status).toBe(200);

      // Second query (hits cache)
      const res2 = await request(app).get('/api/v1/doctors?limit=5');
      expect(res2.status).toBe(200);
      expect(res2.body.data.length).toBe(res1.body.data.length);
    });
  });
});
