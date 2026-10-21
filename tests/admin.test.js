const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/config/prisma');
const bcrypt = require('bcryptjs');

describe('Doctor Search, Admin Analytics & Audit Logs Integration Tests', () => {
  jest.setTimeout(30000);

  const timestamp = Date.now();

  let adminToken;
  let adminUserId;
  let doctorToken;
  let doctorProfileId;
  let patientToken;
  let patientUserId;

  beforeAll(async () => {
    // 1. Create an Admin user directly
    const adminPasswordHash = await bcrypt.hash('Admin@123', 10);
    const adminUser = await prisma.user.create({
      data: {
        email: `admin_${timestamp}@amrutam.co.in`,
        passwordHash: adminPasswordHash,
        role: 'ADMIN',
        isActive: true,
      },
    });
    adminUserId = adminUser.id;

    // Login as Admin to get JWT
    const adminLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: adminUser.email,
        password: 'Admin@123',
      });
    adminToken = adminLoginRes.body.data.token;

    // 2. Register Doctor with specific fee & experience
    const docRes = await request(app)
      .post('/api/v1/auth/register/doctor')
      .send({
        email: `doc_search1_${timestamp}@amrutam.co.in`,
        password: 'Password@123',
        firstName: 'Dr. Charaka',
        lastName: 'Samhita',
        specialization: 'Ayurvedic Kayachikitsa & Herbology',
        qualification: 'BAMS, MD',
        experienceYears: 18,
        licenseNumber: `DL-SRCH-${timestamp}`,
        consultationFee: 1200,
      });
    doctorToken = docRes.body.data.token;
    doctorProfileId = docRes.body.data.user.doctorProfile.id;

    // Register second doctor
    await request(app)
      .post('/api/v1/auth/register/doctor')
      .send({
        email: `doc_search2_${timestamp}@amrutam.co.in`,
        password: 'Password@123',
        firstName: 'Dr. Sushruta',
        lastName: 'Varanasi',
        specialization: 'Panchakarma',
        qualification: 'BAMS',
        experienceYears: 5,
        licenseNumber: `UP-SRCH-${timestamp}`,
        consultationFee: 450,
      });

    // 3. Register Patient
    const patRes = await request(app)
      .post('/api/v1/auth/register/patient')
      .send({
        email: `patient_search_${timestamp}@example.com`,
        password: 'Password@123',
        firstName: 'Devendra',
        lastName: 'Joshi',
        gender: 'MALE',
      });
    patientToken = patRes.body.data.token;
    patientUserId = patRes.body.data.user.id;
  });

  afterAll(async () => {
    try {
      const users = await prisma.user.findMany({
        where: {
          email: {
            contains: `${timestamp}`,
          },
        },
        select: { id: true },
      });
      const userIds = users.map((u) => u.id);

      await prisma.auditLog.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.consultation.deleteMany({
        where: {
          OR: [
            { patient: { userId: { in: userIds } } },
            { doctor: { userId: { in: userIds } } },
          ],
        },
      });
      await prisma.availabilitySlot.deleteMany({
        where: { doctor: { userId: { in: userIds } } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    } catch (e) {
      // Ignore cleanup error
    }
    await prisma.$disconnect();
  });

  // =========================================================================
  // 1. DOCTOR SEARCH, FILTERING, SORTING & PAGINATION
  // =========================================================================
  describe('GET /api/v1/doctors - Search & Filtering', () => {
    it('should filter doctors by specialization', async () => {
      const res = await request(app).get('/api/v1/doctors?specialization=Herbology');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].specialization).toMatch(/Herbology/i);
    });

    it('should filter doctors by consultation fee range (minFee & maxFee)', async () => {
      const res = await request(app).get('/api/v1/doctors?minFee=400&maxFee=600');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      res.body.data.forEach((doc) => {
        const fee = parseFloat(doc.consultationFee);
        expect(fee).toBeGreaterThanOrEqual(400);
        expect(fee).toBeLessThanOrEqual(600);
      });
    });

    it('should sort doctors by consultationFee ascending', async () => {
      const res = await request(app).get('/api/v1/doctors?sortBy=consultationFee&sortOrder=asc&limit=10');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      for (let i = 0; i < res.body.data.length - 1; i++) {
        const fee1 = parseFloat(res.body.data[i].consultationFee);
        const fee2 = parseFloat(res.body.data[i + 1].consultationFee);
        expect(fee1).toBeLessThanOrEqual(fee2);
      }
    });

    it('should return complete pagination metadata (total, totalPages, hasNext, hasPrev)', async () => {
      const res = await request(app).get('/api/v1/doctors?page=1&limit=1');

      expect(res.status).toBe(200);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(1);
      expect(res.body.meta.totalPages).toBeGreaterThanOrEqual(1);
      expect(typeof res.body.meta.hasNext).toBe('boolean');
      expect(res.body.meta.hasPrev).toBe(false);
    });
  });

  // =========================================================================
  // 2. ADMIN DASHBOARD ANALYTICS & ACCESS CONTROL
  // =========================================================================
  describe('GET /api/v1/admin/analytics & /api/v1/analytics/overview', () => {
    it('should allow ADMIN to retrieve system overview analytics (200 OK)', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.overview.totalUsers).toBeGreaterThanOrEqual(1);
      expect(res.body.data.overview.totalDoctors).toBeGreaterThanOrEqual(1);
      expect(res.body.data.consultations).toBeDefined();
      expect(Array.isArray(res.body.data.topSpecializations)).toBe(true);
      expect(Array.isArray(res.body.data.bookingTrends)).toBe(true);
      expect(res.body.data.cancellations).toBeDefined();
      expect(res.body.data.cancellations).toHaveProperty('cancellationRate');
    });

    it('should support date range filtering on analytics endpoint (200 OK)', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const res = await request(app)
        .get(`/api/v1/admin/analytics?startDate=${today}&endDate=${today}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.overview.dateRange.startDate).toBe(today);
      expect(res.body.data.overview.dateRange.endDate).toBe(today);
    });

    it('should allow ADMIN to retrieve platform analytics via /api/v1/analytics/overview (200 OK)', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/overview')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.overview).toBeDefined();
    });

    it('should forbid non-admin roles (Patient) from accessing admin analytics (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Forbidden/i);
    });

    it('should forbid non-admin roles (Patient) from accessing /api/v1/analytics/overview (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/overview')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should forbid unauthenticated requests from accessing admin analytics (401 Unauthorized)', async () => {
      const res = await request(app).get('/api/v1/admin/analytics');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // 3. ADMIN AUDIT LOGS & IMMUTABILITY
  // =========================================================================
  describe('Audit Logs & Immutability Control', () => {
    it('should allow ADMIN to retrieve and filter audit logs via /api/v1/admin/audit-logs (200 OK)', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.page).toBe(1);
    });

    it('should allow ADMIN to retrieve audit logs via /api/v1/audit/logs (200 OK)', async () => {
      const res = await request(app)
        .get('/api/v1/audit/logs?page=1&limit=5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should forbid PATIENT from querying audit logs via /api/v1/audit/logs (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/audit/logs')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should prevent mutation of audit logs (no modification endpoint exists: 404 Not Found)', async () => {
      const res = await request(app)
        .delete('/api/v1/audit/logs/some-log-id')
        .set('Authorization', `Bearer ${adminToken}`);

      // Immutability: Deleting or editing audit logs is strictly rejected by routing barrier
      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // 4. DOCTOR VERIFICATION & USER DEACTIVATION
  // =========================================================================
  describe('Admin Doctor Verification & User Status', () => {
    it('should allow ADMIN to verify a doctor (200 OK)', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/doctors/${doctorProfileId}/verify`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isVerified: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isVerified).toBe(true);
    });

    it('should allow ADMIN to deactivate a user account (200 OK)', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${patientUserId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isActive).toBe(false);

      // Verify deactivated patient can no longer make authenticated requests
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(meRes.status).toBe(403);
      expect(meRes.body.message).toMatch(/deactivated/i);
    });

    it('should forbid admin from deactivating their own account (400 Bad Request)', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${adminUserId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/cannot deactivate their own account/i);
    });
  });
});
