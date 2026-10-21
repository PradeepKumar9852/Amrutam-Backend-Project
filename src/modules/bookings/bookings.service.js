const { prisma } = require('../../config/prisma');
const ApiError = require('../../utils/apiError');
const { deletePattern, acquireLock, releaseLock } = require('../../config/redis');
const jobQueue = require('../../jobs/jobQueue');


const crypto = require('crypto');

/**
 * Generate a unique human-friendly booking reference: AMR-YYYYMMDD-XXXX
 */
function generateBookingReference() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `AMR-${dateStr}-${randomSuffix}`;
}

/**
 * Compute normalized payload hash for idempotency integrity checks
 */
function computeBookingPayloadHash(payload) {
  const normalized = {
    slotId: payload.slotId,
    consultationType: payload.consultationType || 'VIDEO',
  };
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

/**
 * Book an appointment with robust concurrency control & idempotency
 */
async function createBooking(userId, payload, idempotencyKey = null, clientInfo = {}) {
  const key = idempotencyKey || payload.idempotencyKey || null;

  // 1. Verify Patient Profile
  const patient = await prisma.patientProfile.findUnique({
    where: { userId },
  });

  if (!patient) {
    throw ApiError.forbidden('Only registered patients can book appointments');
  }

  // 2. IDEMPOTENCY CHECK:
  // If an idempotencyKey is supplied, check if an existing booking with this key was already created
  if (key) {
    const existingLog = await prisma.auditLog.findFirst({
      where: {
        userId,
        action: 'BOOKING_CREATED',
        details: {
          path: ['idempotencyKey'],
          equals: key,
        },
      },
    });

    if (existingLog && existingLog.entityId) {
      // Reject if key is reused with a different slot or payload
      const currentHash = computeBookingPayloadHash(payload);
      const originalHash = existingLog.details?.payloadHash;
      const originalSlotId = existingLog.details?.slotId;

      if (
        (originalHash && originalHash !== currentHash) ||
        (originalSlotId && originalSlotId !== payload.slotId)
      ) {
        throw ApiError.conflict(
          'Idempotency-Key has already been used with a different request payload'
        );
      }

      const existingBooking = await prisma.consultation.findUnique({
        where: { id: existingLog.entityId },
        include: {
          doctor: { select: { id: true, firstName: true, lastName: true, specialization: true } },
          slot: true,
        },
      });

      if (existingBooking) {
        return { booking: existingBooking, isIdempotentReplay: true };
      }
    }
  }

  // 3. FAST-PATH DISTRIBUTED MUTEX LOCK (Redis)
  const lockToken = await acquireLock(`slot:${payload.slotId}`, 10);
  if (!lockToken) {
    throw ApiError.conflict('Doctor availability slot is currently being reserved by another request. Please retry shortly.');
  }

  let newBooking;
  try {
    // 4. ATOMIC TRANSACTION WITH POSTGRESQL ROW LOCKING ('SELECT FOR UPDATE')
    newBooking = await prisma.$transaction(async (tx) => {
      // 4a. Lock the target availability slot in PostgreSQL
      const lockedSlots = await tx.$queryRaw`
        SELECT id, doctor_id AS "doctorId", start_time AS "startTime", end_time AS "endTime", is_booked AS "isBooked", version
        FROM availability_slots
        WHERE id = ${payload.slotId}::uuid
        FOR UPDATE
      `;

      if (!lockedSlots || lockedSlots.length === 0) {
        throw ApiError.notFound('Availability slot not found');
      }

      const slot = lockedSlots[0];

      // 4b. Validate that slot is not in the past
      if (new Date(slot.startTime) < new Date()) {
        throw ApiError.badRequest('Cannot book an availability slot in the past');
      }

      // 4c. CONCURRENCY SHIELD: Check if slot is already booked
      if (slot.isBooked) {
        throw ApiError.conflict('Doctor availability slot is already booked. Please choose another slot.');
      }

      // 4d. Check if patient already has an active booking for this slot
      const existingSlotBooking = await tx.consultation.findFirst({
        where: {
          slotId: slot.id,
          status: { notIn: ['CANCELLED'] },
        },
      });

      if (existingSlotBooking) {
        throw ApiError.conflict('This slot is already reserved by another consultation.');
      }

      // 4e. Mark slot as booked and increment version
      await tx.availabilitySlot.update({
        where: { id: slot.id },
        data: {
          isBooked: true,
          version: { increment: 1 },
        },
      });

      // 4f. Create Consultation record
      const bookingReference = generateBookingReference();
      const meetingLink = `https://telemedicine.amrutam.co.in/room/${bookingReference}`;

      const consultation = await tx.consultation.create({
        data: {
          bookingReference,
          patientId: patient.id,
          doctorId: slot.doctorId,
          slotId: slot.id,
          status: 'CONFIRMED',
          consultationType: payload.consultationType || 'VIDEO',
          meetingLink,
          symptomsSummary: payload.symptomsSummary || null,
        },
        include: {
          doctor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              specialization: true,
              consultationFee: true,
            },
          },
          slot: true,
        },
      });

      // 4g. Log Audit entry with idempotency key and payload hash
      await tx.auditLog.create({
        data: {
          userId,
          action: 'BOOKING_CREATED',
          entityType: 'Consultation',
          entityId: consultation.id,
          details: {
            bookingReference,
            idempotencyKey: key,
            payloadHash: key ? computeBookingPayloadHash(payload) : null,
            slotId: slot.id,
            doctorId: slot.doctorId,
          },
          ipAddress: clientInfo.ip || null,
          userAgent: clientInfo.userAgent || null,
        },
      });

      return consultation;
    });
  } finally {
    // Release distributed mutex lock
    await releaseLock(`slot:${payload.slotId}`, lockToken);
  }

  // Invalidate slot cache across all queries
  await deletePattern('slots:*');

  // Dispatch asynchronous reminder notification job (non-blocking)
  jobQueue.dispatch('CONSULTATION_REMINDER', {
    consultationId: newBooking.id,
    bookingReference: newBooking.bookingReference,
    patientId: patient.id,
    scheduledTime: newBooking.slot ? newBooking.slot.startTime : null,
  });

  return { booking: newBooking, isIdempotentReplay: false };
}


/**
 * List bookings for authenticated user based on role
 */
async function listUserBookings(user, query = {}) {
  const page = query.page || 1;
  const limit = query.limit || 10;
  const skip = (page - 1) * limit;

  let where = {};

  if (user.role === 'PATIENT') {
    const patient = await prisma.patientProfile.findUnique({ where: { userId: user.id } });
    if (!patient) throw ApiError.notFound('Patient profile not found');
    where.patientId = patient.id;
  } else if (user.role === 'DOCTOR') {
    const doctor = await prisma.doctorProfile.findUnique({ where: { userId: user.id } });
    if (!doctor) throw ApiError.notFound('Doctor profile not found');
    where.doctorId = doctor.id;
  }
  // ADMIN can view all bookings

  if (query.status) {
    where.status = query.status;
  }

  const [total, bookings] = await Promise.all([
    prisma.consultation.count({ where }),
    prisma.consultation.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            gender: true,
          },
        },
        doctor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            specialization: true,
            consultationFee: true,
          },
        },
        slot: true,
      },
    }),
  ]);

  return {
    bookings,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * Get single booking by ID with permission checks
 */
async function getBookingById(user, bookingId) {
  const booking = await prisma.consultation.findUnique({
    where: { id: bookingId },
    include: {
      patient: {
        select: {
          id: true,
          userId: true,
          firstName: true,
          lastName: true,
          gender: true,
          bloodGroup: true,
        },
      },
      doctor: {
        select: {
          id: true,
          userId: true,
          firstName: true,
          lastName: true,
          specialization: true,
          qualification: true,
          consultationFee: true,
        },
      },
      slot: true,
      prescription: {
        include: { items: true },
      },
      payment: true,
    },
  });

  if (!booking) {
    throw ApiError.notFound('Booking not found');
  }

  // Authorization check
  const isOwnerPatient = booking.patient.userId === user.id;
  const isOwnerDoctor = booking.doctor.userId === user.id;
  const isAdmin = user.role === 'ADMIN';

  if (!isOwnerPatient && !isOwnerDoctor && !isAdmin) {
    throw ApiError.forbidden('You are not authorized to view this booking');
  }

  return booking;
}

/**
 * Cancel an appointment and free the slot atomically
 */
async function cancelBooking(user, bookingId, cancellationReason, clientInfo = {}) {
  const booking = await prisma.consultation.findUnique({
    where: { id: bookingId },
    include: {
      patient: true,
      doctor: true,
      slot: true,
    },
  });

  if (!booking) {
    throw ApiError.notFound('Booking not found');
  }

  // Authorization check
  const isOwnerPatient = booking.patient.userId === user.id;
  const isOwnerDoctor = booking.doctor.userId === user.id;
  const isAdmin = user.role === 'ADMIN';

  if (!isOwnerPatient && !isOwnerDoctor && !isAdmin) {
    throw ApiError.forbidden('You are not authorized to cancel this booking');
  }

  // Transition validation
  if (['COMPLETED', 'CANCELLED'].includes(booking.status)) {
    throw ApiError.badRequest(`Cannot cancel a booking with status '${booking.status}'`);
  }

  // Cancel booking and make the slot available again in an atomic transaction
  const updatedBooking = await prisma.$transaction(async (tx) => {
    // 1. Update Consultation status
    const updated = await tx.consultation.update({
      where: { id: bookingId },
      data: {
        status: 'CANCELLED',
        cancellationReason,
      },
      include: { slot: true },
    });

    // 2. Free the doctor slot so other patients can book it
    await tx.availabilitySlot.update({
      where: { id: booking.slotId },
      data: {
        isBooked: false,
        version: { increment: 1 },
      },
    });

    // 3. Log Audit
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'BOOKING_CANCELLED',
        entityType: 'Consultation',
        entityId: booking.id,
        details: {
          bookingReference: booking.bookingReference,
          cancellationReason,
          cancelledByRole: user.role,
        },
        ipAddress: clientInfo.ip || null,
        userAgent: clientInfo.userAgent || null,
      },
    });

    return updated;
  });

  // Invalidate slot cache when appointment is cancelled and slot is freed
  await deletePattern('slots:*');

  return updatedBooking;
}

/**
 * Update consultation status (Doctor or Admin)
 */
async function updateBookingStatus(user, bookingId, newStatus, notes = '') {
  const booking = await prisma.consultation.findUnique({
    where: { id: bookingId },
    include: { doctor: true },
  });

  if (!booking) {
    throw ApiError.notFound('Booking not found');
  }

  const isDoctor = booking.doctor.userId === user.id;
  const isAdmin = user.role === 'ADMIN';

  if (!isDoctor && !isAdmin) {
    throw ApiError.forbidden('Only the assigned doctor or admin can update consultation status');
  }

  // Strict Finite State Machine for Consultation Lifecycle
  const ALLOWED_TRANSITIONS = {
    PENDING: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['IN_PROGRESS', 'CANCELLED', 'RESCHEDULED'],
    IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [], // Terminal state
    CANCELLED: [], // Terminal state
    RESCHEDULED: ['CONFIRMED', 'CANCELLED'],
  };

  const allowedNextStatuses = ALLOWED_TRANSITIONS[booking.status] || [];
  if (!allowedNextStatuses.includes(newStatus)) {
    throw ApiError.badRequest(
      `Invalid consultation status transition from '${booking.status}' to '${newStatus}'. Allowed transitions: ${
        allowedNextStatuses.length > 0 ? allowedNextStatuses.join(', ') : 'None (Terminal state)'
      }`
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.consultation.update({
      where: { id: bookingId },
      data: { status: newStatus },
      include: { patient: true, doctor: true, slot: true },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: newStatus === 'COMPLETED' ? 'CONSULTATION_COMPLETED' : 'BOOKING_CONFIRMED',
        entityType: 'Consultation',
        entityId: bookingId,
        details: { previousStatus: booking.status, newStatus, notes },
      },
    });

    return res;
  });

  return updated;
}

module.exports = {
  createBooking,
  listUserBookings,
  getBookingById,
  cancelBooking,
  updateBookingStatus,
};
