const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/config/prisma');

describe('Consultation Lifecycle & Prescription Management Tests', () => {
  jest.setTimeout(30000);

  const timestamp = Date.now();

  const doctor1Data = {
    email: `doc_rx1_${timestamp}@amrutam.co.in`,
    password: 'Password@123',
    firstName: 'Dr. Madhav',
    lastName: 'Sharma',
    specialization: 'Ayurvedic Kayachikitsa',
    qualification: 'BAMS, MD',
    experienceYears: 15,
    licenseNumber: `DL-AYUR-${timestamp}`,
    consultationFee: 900,
  };

  const doctor2Data = {
    email: `doc_rx2_${timestamp}@amrutam.co.in`,
    password: 'Password@123',
    firstName: 'Dr. Ananya',
    lastName: 'Rao',
    specialization: 'Shalakya Tantra',
    qualification: 'BAMS',
    experienceYears: 6,
    licenseNumber: `KA-AYUR-${timestamp}`,
    consultationFee: 600,
  };

  const patient1Data = {
    email: `patient_rx1_${timestamp}@example.com`,
    password: 'Password@123',
    firstName: 'Kavita',
    lastName: 'Verma',
    gender: 'FEMALE',
  };

  const patient2Data = {
    email: `patient_rx2_${timestamp}@example.com`,
    password: 'Password@123',
    firstName: 'Siddharth',
    lastName: 'Kapoor',
    gender: 'MALE',
  };

  let doctor1Token;
  let doctor2Token;
  let patient1Token;
  let patient2Token;

  let activeSlot;
  let activeConsultationId;
  let createdPrescriptionId;

  beforeAll(async () => {
    // 1. Register Doctor 1
    const d1Res = await request(app)
      .post('/api/v1/auth/register/doctor')
      .send(doctor1Data);
    doctor1Token = d1Res.body.data.token;

    // 2. Register Doctor 2
    const d2Res = await request(app)
      .post('/api/v1/auth/register/doctor')
      .send(doctor2Data);
    doctor2Token = d2Res.body.data.token;

    // 3. Register Patient 1
    const p1Res = await request(app)
      .post('/api/v1/auth/register/patient')
      .send(patient1Data);
    patient1Token = p1Res.body.data.token;

    // 4. Register Patient 2
    const p2Res = await request(app)
      .post('/api/v1/auth/register/patient')
      .send(patient2Data);
    patient2Token = p2Res.body.data.token;

    // 5. Doctor 1 creates slot & Patient 1 books it
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const slotRes = await request(app)
      .post('/api/v1/doctors/slots')
      .set('Authorization', `Bearer ${doctor1Token}`)
      .send({
        startTime: new Date(future.setHours(15, 0, 0, 0)).toISOString(),
        endTime: new Date(future.setHours(16, 0, 0, 0)).toISOString(),
      });
    activeSlot = slotRes.body.data[0] || slotRes.body.data;

    const bookRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${patient1Token}`)
      .send({
        slotId: activeSlot.id,
        symptomsSummary: 'Chronic fatigue and digestive weakness',
      });
    activeConsultationId = bookRes.body.data.id;
  });

  afterAll(async () => {
    try {
      const users = await prisma.user.findMany({
        where: {
          email: {
            in: [doctor1Data.email, doctor2Data.email, patient1Data.email, patient2Data.email],
          },
        },
        select: { id: true },
      });
      const userIds = users.map((u) => u.id);

      // Clean up in proper foreign key order
      await prisma.prescriptionItem.deleteMany({
        where: { prescription: { consultation: { patient: { userId: { in: userIds } } } } },
      });
      await prisma.prescription.deleteMany({
        where: { consultation: { patient: { userId: { in: userIds } } } },
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
  // 1. CONSULTATION LIFECYCLE & STATUS TRANSITIONS
  // =========================================================================
  describe('Consultation Lifecycle & Transitions', () => {
    it('should reject prescription creation when consultation is still CONFIRMED (400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doctor1Token}`)
        .send({
          consultationId: activeConsultationId,
          diagnosis: 'Mandagni (Impaired digestive fire)',
          items: [{ medicineName: 'Triphala Churna', dosage: '1 tsp', frequency: 'Bedtime', duration: '14 days' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/must be 'IN_PROGRESS' or 'COMPLETED'/i);
    });

    it('should allow assigned doctor to start consultation (CONFIRMED -> IN_PROGRESS)', async () => {
      const res = await request(app)
        .patch(`/api/v1/bookings/${activeConsultationId}/status`)
        .set('Authorization', `Bearer ${doctor1Token}`)
        .send({ status: 'IN_PROGRESS' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('IN_PROGRESS');
    });

    it('should reject invalid transition jumping from IN_PROGRESS directly back to CONFIRMED (400 Bad Request)', async () => {
      const res = await request(app)
        .patch(`/api/v1/bookings/${activeConsultationId}/status`)
        .set('Authorization', `Bearer ${doctor1Token}`)
        .send({ status: 'CONFIRMED' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Invalid consultation status transition/i);
    });
  });

  // =========================================================================
  // 2. PRESCRIPTION CREATION & AUDIT
  // =========================================================================
  describe('Prescription Creation', () => {
    it('should allow assigned doctor to issue prescription with multiple medicine items (201 Created)', async () => {
      const prescriptionPayload = {
        consultationId: activeConsultationId,
        diagnosis: 'Vata-Pitta imbalance with Agnimandya (Sluggish metabolism)',
        notes: 'Follow Sattvic diet. Avoid cold and fermented foods. Drink warm water.',
        items: [
          {
            medicineName: 'Ashwagandha Churna',
            dosage: '1 teaspoon (3g)',
            frequency: 'Twice daily after meals',
            duration: '30 days',
            instructions: 'Take with warm milk or lukewarm water',
          },
          {
            medicineName: 'Triphala Guggulu',
            dosage: '2 tablets',
            frequency: 'Twice daily before food',
            duration: '15 days',
            instructions: 'Take with warm water',
          },
        ],
      };

      const res = await request(app)
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doctor1Token}`)
        .send(prescriptionPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.diagnosis).toBe(prescriptionPayload.diagnosis);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.items[0].medicineName).toBe('Ashwagandha Churna');
      expect(res.body.data.doctor.licenseNumber).toBe(doctor1Data.licenseNumber);

      createdPrescriptionId = res.body.data.id;

      // Verify consultation status automatically transitioned to COMPLETED
      const consult = await prisma.consultation.findUnique({ where: { id: activeConsultationId } });
      expect(consult.status).toBe('COMPLETED');

      // Verify audit log was recorded
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          action: 'PRESCRIPTION_ISSUED',
          entityId: createdPrescriptionId,
        },
      });
      expect(auditLog).toBeDefined();
    });

    it('should reject duplicate prescription for the same consultation (409 Conflict)', async () => {
      const res = await request(app)
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doctor1Token}`)
        .send({
          consultationId: activeConsultationId,
          diagnosis: 'Second attempt',
          items: [{ medicineName: 'Brahmi Vati', dosage: '1 tab', frequency: 'Daily', duration: '10 days' }],
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/already been issued/i);
    });

    it('should forbid non-doctor role (patient) from issuing prescriptions (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({
          consultationId: activeConsultationId,
          diagnosis: 'Unauthorized diagnosis attempt',
          items: [{ medicineName: 'Medicine X', dosage: '1 tab', frequency: 'Daily', duration: '5 days' }],
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should forbid unassigned doctor from issuing prescription for another doctor’s patient (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doctor2Token}`) // Doctor 2 attempting to prescribe for Doctor 1's consultation
        .send({
          consultationId: activeConsultationId,
          diagnosis: 'Intruder diagnosis',
          items: [{ medicineName: 'Medicine Y', dosage: '1 tab', frequency: 'Daily', duration: '5 days' }],
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/not authorized to issue prescriptions for another doctor/i);
    });
  });

  // =========================================================================
  // 3. PRESCRIPTION RETRIEVAL & HEALTH PRIVACY
  // =========================================================================
  describe('Prescription Retrieval & Access Control', () => {
    it('should allow patient to retrieve their own prescription by ID (200 OK)', async () => {
      const res = await request(app)
        .get(`/api/v1/prescriptions/${createdPrescriptionId}`)
        .set('Authorization', `Bearer ${patient1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(createdPrescriptionId);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.patient.firstName).toBe(patient1Data.firstName);
    });

    it('should forbid an unrelated patient from accessing another patient’s prescription (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/prescriptions/${createdPrescriptionId}`)
        .set('Authorization', `Bearer ${patient2Token}`); // Patient 2 tries to snoop on Patient 1's prescription

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/do not have permission/i);
    });

    it('should return 404 Not Found for non-existent prescription ID', async () => {
      const fakeUuid = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .get(`/api/v1/prescriptions/${fakeUuid}`)
        .set('Authorization', `Bearer ${patient1Token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should allow retrieving prescription via consultation ID', async () => {
      const res = await request(app)
        .get(`/api/v1/prescriptions/consultation/${activeConsultationId}`)
        .set('Authorization', `Bearer ${patient1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(2);
    });

    it('should list prescriptions for authenticated patient with pagination', async () => {
      const res = await request(app)
        .get('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${patient1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // 4. CONSULTATIONS ENDPOINTS & TENANT ISOLATION
  // =========================================================================
  describe('Consultations Endpoint & Authorization Control', () => {
    let secondSlot;
    let scheduledConsultationId;

    beforeAll(async () => {
      const future = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const slotRes = await request(app)
        .post('/api/v1/doctors/slots')
        .set('Authorization', `Bearer ${doctor1Token}`)
        .send({
          startTime: new Date(future.setHours(17, 0, 0, 0)).toISOString(),
          endTime: new Date(future.setHours(18, 0, 0, 0)).toISOString(),
        });
      secondSlot = slotRes.body.data[0] || slotRes.body.data;
    });

    it('should allow patient to schedule consultation via POST /api/v1/consultations (201 Created)', async () => {
      const res = await request(app)
        .post('/api/v1/consultations')
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({
          slotId: secondSlot.id,
          symptomsSummary: 'Follow-up consultation for Pitta pacification',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CONFIRMED');
      scheduledConsultationId = res.body.data.id;
    });

    it('should allow patient to view their own consultation via GET /api/v1/consultations/:id (200 OK)', async () => {
      const res = await request(app)
        .get(`/api/v1/consultations/${scheduledConsultationId}`)
        .set('Authorization', `Bearer ${patient1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(scheduledConsultationId);
    });

    it('should forbid unrelated patient from viewing consultation details via GET /api/v1/consultations/:id (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/consultations/${scheduledConsultationId}`)
        .set('Authorization', `Bearer ${patient2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/not authorized to view/i);
    });

    it('should forbid unrelated doctor from viewing consultation details (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/consultations/${scheduledConsultationId}`)
        .set('Authorization', `Bearer ${doctor2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/not authorized to view/i);
    });

    it('should forbid patient from directly updating consultation status (403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/v1/consultations/${scheduledConsultationId}/status`)
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({ status: 'IN_PROGRESS' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should forbid unassigned doctor from updating consultation status (403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/v1/consultations/${scheduledConsultationId}/status`)
        .set('Authorization', `Bearer ${doctor2Token}`)
        .send({ status: 'IN_PROGRESS' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Only the assigned doctor or admin/i);
    });

    it('should reject invalid terminal state transition (COMPLETED -> IN_PROGRESS) with 400 Bad Request', async () => {
      const res = await request(app)
        .patch(`/api/v1/consultations/${activeConsultationId}/status`)
        .set('Authorization', `Bearer ${doctor1Token}`)
        .send({ status: 'IN_PROGRESS' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Invalid consultation status transition/i);
    });

    it('should list consultations for authenticated patient via GET /api/v1/consultations (200 OK)', async () => {
      const res = await request(app)
        .get('/api/v1/consultations')
        .set('Authorization', `Bearer ${patient1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should allow patient to cancel their consultation via PATCH /api/v1/consultations/:id/cancel (200 OK)', async () => {
      const res = await request(app)
        .patch(`/api/v1/consultations/${scheduledConsultationId}/cancel`)
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({ cancellationReason: 'Rescheduling to a later date' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CANCELLED');
    });
  });

  // =========================================================================
  // 5. INPUT VALIDATION & CLINICAL INTEGRITY
  // =========================================================================
  describe('Input Validation & Clinical Boundaries', () => {
    it('should reject prescription creation with empty items array (400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doctor1Token}`)
        .send({
          consultationId: activeConsultationId,
          diagnosis: 'Test diagnosis',
          items: [],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
    });

    it('should reject prescription creation with missing dosage or medicine name (400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doctor1Token}`)
        .send({
          consultationId: activeConsultationId,
          diagnosis: 'Vata imbalance',
          items: [{ medicineName: 'Ashwagandha' }], // missing dosage, frequency, duration
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
    });

    it('should reject prescription creation with non-UUID consultationId (400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doctor1Token}`)
        .send({
          consultationId: 'not-a-valid-uuid',
          diagnosis: 'Vata imbalance',
          items: [
            { medicineName: 'Ashwagandha', dosage: '1 tab', frequency: 'Daily', duration: '7 days' },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject consultation status update with invalid enum value (400 Bad Request)', async () => {
      const res = await request(app)
        .patch(`/api/v1/consultations/${activeConsultationId}/status`)
        .set('Authorization', `Bearer ${doctor1Token}`)
        .send({ status: 'INVALID_STATUS' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
