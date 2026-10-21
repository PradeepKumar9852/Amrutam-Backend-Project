const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/config/prisma');

describe('Doctor Profile, Availability & Search Comprehensive Test Suite', () => {
  const timestamp = Date.now();

  const doctor1Data = {
    email: `ayur_doc1_${timestamp}@example.com`,
    password: 'Password@123',
    firstName: 'Devendra',
    lastName: 'Sharma',
    phoneNumber: `+9197771${Math.floor(10000 + Math.random() * 90000)}`,
    specialization: 'Kayachikitsa',
    qualification: 'BAMS, MD (Ayurveda)',
    experienceYears: 12,
    licenseNumber: `DOC-LIC-1-${timestamp}`,
    consultationFee: 750,
  };

  const doctor2Data = {
    email: `ayur_doc2_${timestamp}@example.com`,
    password: 'Password@123',
    firstName: 'Ananya',
    lastName: 'Deshmukh',
    phoneNumber: `+9197772${Math.floor(10000 + Math.random() * 90000)}`,
    specialization: 'Panchakarma',
    qualification: 'BAMS',
    experienceYears: 5,
    licenseNumber: `DOC-LIC-2-${timestamp}`,
    consultationFee: 400,
  };

  const patientData = {
    email: `patient_doc_test_${timestamp}@example.com`,
    password: 'Password@123',
    firstName: 'Rohit',
    lastName: 'Mehta',
    phoneNumber: `+9197773${Math.floor(10000 + Math.random() * 90000)}`,
    gender: 'MALE',
  };

  let doctor1Token;
  let doctor1ProfileId;
  let doctor1UserId;

  let doctor2Token;
  let doctor2ProfileId;

  let patientToken;
  let createdSlotId;

  beforeAll(async () => {
    // 1. Register Doctor 1
    const d1Res = await request(app)
      .post('/api/v1/auth/register/doctor')
      .send(doctor1Data);
    doctor1Token = d1Res.body.data.token;
    doctor1ProfileId = d1Res.body.data.user.doctorProfile.id;
    doctor1UserId = d1Res.body.data.user.id;

    // 2. Register Doctor 2
    const d2Res = await request(app)
      .post('/api/v1/auth/register/doctor')
      .send(doctor2Data);
    doctor2Token = d2Res.body.data.token;
    doctor2ProfileId = d2Res.body.data.user.doctorProfile.id;

    // 3. Register Patient
    const pRes = await request(app)
      .post('/api/v1/auth/register/patient')
      .send(patientData);
    patientToken = pRes.body.data.token;
  });

  afterAll(async () => {
    try {
      const users = await prisma.user.findMany({
        where: {
          email: {
            in: [doctor1Data.email, doctor2Data.email, patientData.email],
          },
        },
        select: { id: true },
      });
      const userIds = users.map((u) => u.id);

      await prisma.availabilitySlot.deleteMany({
        where: { doctor: { userId: { in: userIds } } },
      });
      await prisma.auditLog.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.doctorProfile.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.patientProfile.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    } catch (e) {
      // Ignore cleanup error
    }
    const { closeRedis } = require('../src/config/redis');
    await closeRedis();
    await prisma.$disconnect();
  });

  // =========================================================================
  // 1. DOCTOR SEARCH, FILTERING, SORTING & PAGINATION
  // =========================================================================
  describe('Doctor Listing & Search API (GET /api/v1/doctors)', () => {
    it('should list doctors with pagination structure', async () => {
      const res = await request(app).get('/api/v1/doctors?page=1&limit=10');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(10);
    });

    it('should filter doctors by specialization case-insensitively', async () => {
      const res = await request(app).get('/api/v1/doctors?specialization=kayachikitsa');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const found = res.body.data.some((d) => d.id === doctor1ProfileId);
      expect(found).toBe(true);
      const otherSpecialization = res.body.data.every(
        (d) => d.specialization.toLowerCase().includes('kayachikitsa')
      );
      expect(otherSpecialization).toBe(true);
    });

    it('should filter doctors by fee range (minFee and maxFee)', async () => {
      const res = await request(app).get('/api/v1/doctors?minFee=300&maxFee=500');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const fees = res.body.data.map((d) => parseFloat(d.consultationFee));
      fees.forEach((fee) => {
        expect(fee).toBeGreaterThanOrEqual(300);
        expect(fee).toBeLessThanOrEqual(500);
      });
    });

    it('should sort doctors by experienceYears ascending and descending', async () => {
      const resDesc = await request(app).get(
        '/api/v1/doctors?sortBy=experienceYears&sortOrder=desc&limit=10'
      );
      expect(resDesc.status).toBe(200);
      const experiencesDesc = resDesc.body.data.map((d) => d.experienceYears);
      for (let i = 0; i < experiencesDesc.length - 1; i++) {
        expect(experiencesDesc[i]).toBeGreaterThanOrEqual(experiencesDesc[i + 1]);
      }
    });

    it('should get detailed doctor profile by ID with upcoming slots', async () => {
      const res = await request(app).get(`/api/v1/doctors/${doctor1ProfileId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(doctor1ProfileId);
      expect(res.body.data.specialization).toBe('Kayachikitsa');
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.availabilitySlots).toBeDefined();
    });

    it('should return 404 for non-existent doctor ID', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app).get(`/api/v1/doctors/${fakeId}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // 2. DOCTOR PROFILE UPDATE (PUT /api/v1/doctors/profile)
  // =========================================================================
  describe('Doctor Profile Updates (PUT /api/v1/doctors/profile)', () => {
    it('should allow DOCTOR to update their professional profile details', async () => {
      const res = await request(app)
        .put('/api/v1/doctors/profile')
        .set('Authorization', `Bearer ${doctor1Token}`)
        .send({
          consultationFee: 850,
          bio: 'Specialist in chronic Ayurvedic conditions and dietary therapy.',
          experienceYears: 13,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(parseFloat(res.body.data.consultationFee)).toBe(850);
      expect(res.body.data.experienceYears).toBe(13);
      expect(res.body.data.bio).toContain('chronic Ayurvedic');
    });

    it('should forbid non-doctors (PATIENT) from calling doctor profile update', async () => {
      const res = await request(app)
        .put('/api/v1/doctors/profile')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ consultationFee: 1000 });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // 3. AVAILABILITY SLOT CREATION & OVERLAP VALIDATION
  // =========================================================================
  describe('Availability Slot Creation & Overlap Validation', () => {
    it('should allow DOCTOR to create availability slots in the future', async () => {
      // Slot: Tomorrow at 14:00 to 14:45 (45 min duration)
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const start = new Date(tomorrow.setHours(14, 0, 0, 0)).toISOString();
      const end = new Date(tomorrow.setHours(14, 45, 0, 0)).toISOString();

      const res = await request(app)
        .post('/api/v1/doctors/slots')
        .set('Authorization', `Bearer ${doctor1Token}`)
        .send({ startTime: start, endTime: end });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].doctorId).toBe(doctor1ProfileId);

      createdSlotId = res.body.data[0].id;
    });

    it('should reject slot creation if startTime is in the past (400 Bad Request)', async () => {
      const pastStart = new Date(Date.now() - 3600000).toISOString();
      const pastEnd = new Date(Date.now() - 1800000).toISOString();

      const res = await request(app)
        .post('/api/v1/doctors/slots')
        .set('Authorization', `Bearer ${doctor1Token}`)
        .send({ startTime: pastStart, endTime: pastEnd });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject slot if duration is less than 15 minutes (400 Bad Request)', async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const start = new Date(tomorrow.setHours(15, 0, 0, 0)).toISOString();
      const end = new Date(tomorrow.setHours(15, 10, 0, 0)).toISOString(); // 10 minutes

      const res = await request(app)
        .post('/api/v1/doctors/slots')
        .set('Authorization', `Bearer ${doctor1Token}`)
        .send({ startTime: start, endTime: end });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should prevent overlapping slots in the same doctor calendar (409 Conflict)', async () => {
      // Overlaps with 14:00 - 14:45 (from 14:30 to 15:15)
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const start = new Date(tomorrow.setHours(14, 30, 0, 0)).toISOString();
      const end = new Date(tomorrow.setHours(15, 15, 0, 0)).toISOString();

      const res = await request(app)
        .post('/api/v1/doctors/slots')
        .set('Authorization', `Bearer ${doctor1Token}`)
        .send({ startTime: start, endTime: end });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('overlaps');
    });

    it('should prevent overlapping slots submitted within the same batch (400 Bad Request)', async () => {
      const tomorrow = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const s1Start = new Date(tomorrow.setHours(9, 0, 0, 0)).toISOString();
      const s1End = new Date(tomorrow.setHours(10, 0, 0, 0)).toISOString();
      // Overlaps: 09:30 to 10:30
      const s2Start = new Date(tomorrow.setHours(9, 30, 0, 0)).toISOString();
      const s2End = new Date(tomorrow.setHours(10, 30, 0, 0)).toISOString();

      const res = await request(app)
        .post('/api/v1/doctors/slots')
        .set('Authorization', `Bearer ${doctor1Token}`)
        .send({
          slots: [
            { startTime: s1Start, endTime: s1End },
            { startTime: s2Start, endTime: s2End },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Overlapping');
    });
  });

  // =========================================================================
  // 4. SLOT UPDATING & RESCHEDULING (PATCH /api/v1/doctors/slots/:slotId)
  // =========================================================================
  describe('Availability Slot Updating & Ownership Enforcement', () => {
    it('should allow doctor owner to update slot times', async () => {
      // Reschedule to 16:00 - 16:45
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const newStart = new Date(tomorrow.setHours(16, 0, 0, 0)).toISOString();
      const newEnd = new Date(tomorrow.setHours(16, 45, 0, 0)).toISOString();

      const res = await request(app)
        .patch(`/api/v1/doctors/slots/${createdSlotId}`)
        .set('Authorization', `Bearer ${doctor1Token}`)
        .send({ startTime: newStart, endTime: newEnd });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(new Date(res.body.data.startTime).toISOString()).toBe(newStart);
    });

    it('should forbid Doctor 2 from updating Doctor 1 slot (Ownership enforcement)', async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const newStart = new Date(tomorrow.setHours(17, 0, 0, 0)).toISOString();
      const newEnd = new Date(tomorrow.setHours(17, 45, 0, 0)).toISOString();

      const res = await request(app)
        .patch(`/api/v1/doctors/slots/${createdSlotId}`)
        .set('Authorization', `Bearer ${doctor2Token}`)
        .send({ startTime: newStart, endTime: newEnd });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // 5. SLOT RETRIEVAL & DELETION
  // =========================================================================
  describe('Slot Query & Deletion API', () => {
    it('should list available slots for a doctor via GET /api/v1/doctors/:id/slots', async () => {
      const res = await request(app).get(`/api/v1/doctors/${doctor1ProfileId}/slots`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.doctor.id).toBe(doctor1ProfileId);
      expect(Array.isArray(res.body.data.slots)).toBe(true);
      expect(res.body.data.slots.some((s) => s.id === createdSlotId)).toBe(true);
    });

    it('should forbid Doctor 2 from deleting Doctor 1 slot', async () => {
      const res = await request(app)
        .delete(`/api/v1/doctors/slots/${createdSlotId}`)
        .set('Authorization', `Bearer ${doctor2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should allow doctor owner to delete their unbooked slot', async () => {
      const res = await request(app)
        .delete(`/api/v1/doctors/slots/${createdSlotId}`)
        .set('Authorization', `Bearer ${doctor1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
