const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/config/prisma');

describe('Doctor Availability & Appointment Booking Concurrency Tests', () => {
  const timestamp = Date.now();

  const doctorData = {
    email: `doc_booking_${timestamp}@amrutam.co.in`,
    password: 'Password@123',
    firstName: 'Dr. Vasudevan',
    lastName: 'Namboodiri',
    specialization: 'Panchakarma & Kayachikitsa',
    qualification: 'BAMS, MD (Ayur)',
    experienceYears: 12,
    licenseNumber: `KL-AYUR-${timestamp}`,
    consultationFee: 800,
  };

  const patient1Data = {
    email: `patient1_${timestamp}@example.com`,
    password: 'Password@123',
    firstName: 'Rohan',
    lastName: 'Mehta',
    gender: 'MALE',
  };

  const patient2Data = {
    email: `patient2_${timestamp}@example.com`,
    password: 'Password@123',
    firstName: 'Sneha',
    lastName: 'Patel',
    gender: 'FEMALE',
  };

  let doctorToken;
  let doctorProfileId;
  let patient1Token;
  let patient2Token;

  let testSlot1;
  let testSlot2;
  let concurrentSlot;

  beforeAll(async () => {
    // 1. Register Doctor
    const docRes = await request(app)
      .post('/api/v1/auth/register/doctor')
      .send(doctorData);
    doctorToken = docRes.body.data.token;
    doctorProfileId = docRes.body.data.user.doctorProfile.id;

    // 2. Register Patient 1
    const p1Res = await request(app)
      .post('/api/v1/auth/register/patient')
      .send(patient1Data);
    patient1Token = p1Res.body.data.token;

    // 3. Register Patient 2
    const p2Res = await request(app)
      .post('/api/v1/auth/register/patient')
      .send(patient2Data);
    patient2Token = p2Res.body.data.token;
  });

  afterAll(async () => {
    // Clean up test data
    try {
      const users = await prisma.user.findMany({
        where: {
          email: {
            in: [doctorData.email, patient1Data.email, patient2Data.email],
          },
        },
        select: { id: true },
      });
      const userIds = users.map((u) => u.id);

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
  // 1. DOCTOR AVAILABILITY SLOTS
  // =========================================================================
  describe('Doctor Availability Slot Management', () => {
    it('should allow DOCTOR to create availability slots (201 Created)', async () => {
      // Tomorrow 10:00 to 11:00
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const slot1Start = new Date(tomorrow.setHours(10, 0, 0, 0)).toISOString();
      const slot1End = new Date(tomorrow.setHours(11, 0, 0, 0)).toISOString();

      const slot2Start = new Date(tomorrow.setHours(11, 30, 0, 0)).toISOString();
      const slot2End = new Date(tomorrow.setHours(12, 30, 0, 0)).toISOString();

      const res = await request(app)
        .post('/api/v1/doctors/slots')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          slots: [
            { startTime: slot1Start, endTime: slot1End },
            { startTime: slot2Start, endTime: slot2End },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);

      testSlot1 = res.body.data[0];
      testSlot2 = res.body.data[1];
    });

    it('should reject creating duplicate overlapping slot for the same doctor (409 Conflict)', async () => {
      const res = await request(app)
        .post('/api/v1/doctors/slots')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          startTime: testSlot1.startTime,
          endTime: testSlot1.endTime,
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/already exists/i);
    });

    it('should reject slot creation with end time before start time (400 Bad Request)', async () => {
      const now = new Date(Date.now() + 100000);
      const res = await request(app)
        .post('/api/v1/doctors/slots')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          startTime: new Date(now.getTime() + 60000).toISOString(),
          endTime: now.toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should allow patients to query doctor available slots', async () => {
      const res = await request(app)
        .get(`/api/v1/doctors/${doctorProfileId}/slots?isBooked=false`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.slots.length).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // 2. APPOINTMENT BOOKING & VALIDATION
  // =========================================================================
  describe('Appointment Booking', () => {
    let bookedConsultationId;

    it('should allow authenticated patient to book an open slot (201 Created)', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({
          slotId: testSlot1.id,
          consultationType: 'VIDEO',
          symptomsSummary: 'Consultation for joint pain and Ayurvedic dietary regimen',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.bookingReference).toMatch(/^AMR-\d{8}-\d{4}$/);
      expect(res.body.data.status).toBe('CONFIRMED');
      expect(res.body.data.slot.isBooked).toBe(true);

      bookedConsultationId = res.body.data.id;
    });

    it('should reject booking an already booked slot (409 Conflict)', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patient2Token}`)
        .send({
          slotId: testSlot1.id,
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/already booked/i);
    });

    it('should allow patient to view their own bookings', async () => {
      const res = await request(app)
        .get('/api/v1/bookings')
        .set('Authorization', `Bearer ${patient1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].id).toBe(bookedConsultationId);
    });

    it('should forbid patient from viewing another patient’s booking (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/bookings/${bookedConsultationId}`)
        .set('Authorization', `Bearer ${patient2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/not authorized/i);
    });
  });

  // =========================================================================
  // 3. IDEMPOTENCY FOR BOOKING CREATION
  // =========================================================================
  describe('Idempotency Support', () => {
    let idempotentSlot;

    beforeAll(async () => {
      const future = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const res = await request(app)
        .post('/api/v1/doctors/slots')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          startTime: new Date(future.setHours(14, 0, 0, 0)).toISOString(),
          endTime: new Date(future.setHours(15, 0, 0, 0)).toISOString(),
        });
      idempotentSlot = res.body.data[0] || res.body.data;
    });

    it('should return 201 on first request and 200 with X-Idempotent-Replay on retry with same idempotency key', async () => {
      const idempotencyKey = `idemp-${timestamp}-${Math.random()}`;

      // 1st Attempt: Initial Creation
      const res1 = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patient1Token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          slotId: idempotentSlot.id,
          symptomsSummary: 'Digestive consultation',
        });

      expect(res1.status).toBe(201);
      expect(res1.body.success).toBe(true);
      const firstReference = res1.body.data.bookingReference;

      // 2nd Attempt: Retry with EXACT same Idempotency-Key
      const res2 = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patient1Token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          slotId: idempotentSlot.id,
          symptomsSummary: 'Digestive consultation',
        });

      expect(res2.status).toBe(200);
      expect(res2.body.success).toBe(true);
      expect(res2.headers['x-idempotent-replay']).toBe('true');
      expect(res2.body.data.bookingReference).toBe(firstReference);

      // Verify in DB that only 1 consultation was created for this slot
      const totalCreated = await prisma.consultation.count({
        where: { slotId: idempotentSlot.id },
      });
      expect(totalCreated).toBe(1);
    });
  });

  // =========================================================================
  // 4. CONCURRENT BOOKINGS / RACE CONDITION PREVENTION TEST
  // =========================================================================
  describe('Concurrency & Double-Booking Prevention', () => {
    beforeAll(async () => {
      // Create a specific isolated slot for the concurrency test
      const future = new Date(Date.now() + 72 * 60 * 60 * 1000);
      const res = await request(app)
        .post('/api/v1/doctors/slots')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          startTime: new Date(future.setHours(16, 0, 0, 0)).toISOString(),
          endTime: new Date(future.setHours(17, 0, 0, 0)).toISOString(),
        });
      concurrentSlot = res.body.data[0] || res.body.data;
    });

    it('should allow EXACTLY ONE request to book the slot and reject all other concurrent attempts with 409', async () => {
      // Simulate 5 simultaneous requests fired at the exact same millisecond trying to reserve concurrentSlot
      const simultaneousRequests = [
        request(app).post('/api/v1/bookings').set('Authorization', `Bearer ${patient1Token}`).send({ slotId: concurrentSlot.id }),
        request(app).post('/api/v1/bookings').set('Authorization', `Bearer ${patient2Token}`).send({ slotId: concurrentSlot.id }),
        request(app).post('/api/v1/bookings').set('Authorization', `Bearer ${patient1Token}`).send({ slotId: concurrentSlot.id }),
        request(app).post('/api/v1/bookings').set('Authorization', `Bearer ${patient2Token}`).send({ slotId: concurrentSlot.id }),
        request(app).post('/api/v1/bookings').set('Authorization', `Bearer ${patient1Token}`).send({ slotId: concurrentSlot.id }),
      ];

      const responses = await Promise.all(simultaneousRequests);

      const successfulBookings = responses.filter((r) => r.status === 201);
      const conflictBookings = responses.filter((r) => r.status === 409);

      // Exactly ONE request succeeds
      expect(successfulBookings).toHaveLength(1);
      // The other 4 concurrent requests must fail with 409 Conflict
      expect(conflictBookings).toHaveLength(4);

      // Verify the slot in PostgreSQL has isBooked = true and version = 1
      const slotInDb = await prisma.availabilitySlot.findUnique({
        where: { id: concurrentSlot.id },
      });
      expect(slotInDb.isBooked).toBe(true);
      expect(slotInDb.version).toBe(1);

      // Verify exactly ONE consultation was written to PostgreSQL
      const consultationsInDb = await prisma.consultation.findMany({
        where: { slotId: concurrentSlot.id },
      });
      expect(consultationsInDb).toHaveLength(1);
    });
  });

  // =========================================================================
  // 5. CANCELLATION & SLOT RE-RELEASE
  // =========================================================================
  describe('Cancellation & Slot Release', () => {
    let cancelSlot;
    let cancelBookingId;

    beforeAll(async () => {
      const future = new Date(Date.now() + 96 * 60 * 60 * 1000);
      const slotRes = await request(app)
        .post('/api/v1/doctors/slots')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          startTime: new Date(future.setHours(9, 0, 0, 0)).toISOString(),
          endTime: new Date(future.setHours(10, 0, 0, 0)).toISOString(),
        });
      cancelSlot = slotRes.body.data[0] || slotRes.body.data;

      const bookRes = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({ slotId: cancelSlot.id });
      cancelBookingId = bookRes.body.data.id;
    });

    it('should cancel booking and atomically free the doctor availability slot (200 OK)', async () => {
      const res = await request(app)
        .patch(`/api/v1/bookings/${cancelBookingId}/cancel`)
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({ cancellationReason: 'Personal emergency. Need to reschedule.' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CANCELLED');

      // Verify slot in DB is now freed (isBooked = false)
      const slotInDb = await prisma.availabilitySlot.findUnique({
        where: { id: cancelSlot.id },
      });
      expect(slotInDb.isBooked).toBe(false);

      // Verify cannot cancel already cancelled booking
      const retryCancel = await request(app)
        .patch(`/api/v1/bookings/${cancelBookingId}/cancel`)
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({ cancellationReason: 'Trying to cancel again' });

      expect(retryCancel.status).toBe(400);
      expect(retryCancel.body.success).toBe(false);
      expect(retryCancel.body.message).toMatch(/Cannot cancel a booking with status 'CANCELLED'/i);
    });

    it('should allow doctor to update consultation status to COMPLETED', async () => {
      // Create a slot & booking
      const future = new Date(Date.now() + 120 * 60 * 60 * 1000);
      const slotRes = await request(app)
        .post('/api/v1/doctors/slots')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          startTime: new Date(future.setHours(11, 0, 0, 0)).toISOString(),
          endTime: new Date(future.setHours(12, 0, 0, 0)).toISOString(),
        });
      const slot = slotRes.body.data[0] || slotRes.body.data;

      const bookRes = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({ slotId: slot.id });
      const bId = bookRes.body.data.id;

      // Doctor first starts consultation (IN_PROGRESS)
      const startRes = await request(app)
        .patch(`/api/v1/bookings/${bId}/status`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ status: 'IN_PROGRESS' });

      expect(startRes.status).toBe(200);
      expect(startRes.body.data.status).toBe('IN_PROGRESS');

      // Doctor then concludes consultation (COMPLETED)
      const updateRes = await request(app)
        .patch(`/api/v1/bookings/${bId}/status`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ status: 'COMPLETED' });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.status).toBe('COMPLETED');
    });
  });
});
