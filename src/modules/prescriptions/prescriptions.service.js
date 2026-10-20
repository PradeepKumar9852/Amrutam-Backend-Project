const { prisma } = require('../../config/prisma');
const ApiError = require('../../utils/apiError');
const jobQueue = require('../../jobs/jobQueue');


/**
 * Issue a new Ayurvedic prescription for an eligible consultation
 */
async function createPrescription(userId, payload, clientInfo = {}) {
  // 1. Verify doctor identity
  const doctor = await prisma.doctorProfile.findUnique({
    where: { userId },
  });

  if (!doctor) {
    throw ApiError.forbidden('Only registered doctors can issue prescriptions');
  }

  // 2. Verify consultation existence & ownership
  const consultation = await prisma.consultation.findUnique({
    where: { id: payload.consultationId },
    include: {
      patient: true,
      doctor: true,
    },
  });

  if (!consultation) {
    throw ApiError.notFound('Consultation record not found');
  }

  if (consultation.doctorId !== doctor.id) {
    throw ApiError.forbidden('You are not authorized to issue prescriptions for another doctor’s consultation');
  }

  // 3. State transition rule: Must be IN_PROGRESS or COMPLETED
  if (!['IN_PROGRESS', 'COMPLETED'].includes(consultation.status)) {
    throw ApiError.badRequest(
      `Cannot issue prescription for a consultation with status '${consultation.status}'. Consultation must be 'IN_PROGRESS' or 'COMPLETED'.`
    );
  }

  // 4. Duplicate prevention (1-to-1 relationship)
  const existingPrescription = await prisma.prescription.findUnique({
    where: { consultationId: payload.consultationId },
  });

  if (existingPrescription) {
    throw ApiError.conflict('A prescription has already been issued for this consultation');
  }

  // 5. Database transaction: create Prescription, PrescriptionItems, update status & audit log
  const createdPrescription = await prisma.$transaction(async (tx) => {
    const prescription = await tx.prescription.create({
      data: {
        consultationId: consultation.id,
        doctorId: doctor.id,
        patientId: consultation.patientId,
        diagnosis: payload.diagnosis,
        notes: payload.notes || null,
        items: {
          create: payload.items.map((item) => ({
            medicineName: item.medicineName,
            dosage: item.dosage,
            frequency: item.frequency,
            duration: item.duration,
            instructions: item.instructions || null,
          })),
        },
      },
      include: {
        items: true,
        doctor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            specialization: true,
            qualification: true,
            licenseNumber: true,
          },
        },
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            gender: true,
            dateOfBirth: true,
          },
        },
      },
    });

    // If consultation was IN_PROGRESS, transition to COMPLETED automatically
    if (consultation.status === 'IN_PROGRESS') {
      await tx.consultation.update({
        where: { id: consultation.id },
        data: { status: 'COMPLETED' },
      });
    }

    // Record audit log
    await tx.auditLog.create({
      data: {
        userId,
        action: 'PRESCRIPTION_ISSUED',
        entityType: 'Prescription',
        entityId: prescription.id,
        details: {
          consultationId: consultation.id,
          diagnosis: payload.diagnosis,
          itemCount: payload.items.length,
        },
        ipAddress: clientInfo.ip || null,
        userAgent: clientInfo.userAgent || null,
      },
    });

    return prescription;
  });

  // Asynchronously dispatch digital prescription delivery notification
  jobQueue.dispatch('PRESCRIPTION_DELIVERY', {
    prescriptionId: createdPrescription.id,
    consultationId: createdPrescription.consultationId,
    patientId: createdPrescription.patientId,
    itemsCount: createdPrescription.items ? createdPrescription.items.length : 0,
  });

  return createdPrescription;
}


/**
 * Get prescription details by ID with strict ownership verification
 */
async function getPrescriptionById(user, prescriptionId) {
  const prescription = await prisma.prescription.findUnique({
    where: { id: prescriptionId },
    include: {
      items: true,
      doctor: {
        select: {
          id: true,
          userId: true,
          firstName: true,
          lastName: true,
          specialization: true,
          qualification: true,
          licenseNumber: true,
        },
      },
      patient: {
        select: {
          id: true,
          userId: true,
          firstName: true,
          lastName: true,
          gender: true,
          dateOfBirth: true,
          bloodGroup: true,
        },
      },
      consultation: {
        select: {
          id: true,
          bookingReference: true,
          consultationType: true,
          createdAt: true,
        },
      },
    },
  });

  if (!prescription) {
    throw ApiError.notFound('Prescription not found');
  }

  // Authorization check
  const isOwnerPatient = prescription.patient.userId === user.id;
  const isOwnerDoctor = prescription.doctor.userId === user.id;
  const isAdmin = user.role === 'ADMIN';

  if (!isOwnerPatient && !isOwnerDoctor && !isAdmin) {
    throw ApiError.forbidden('You do not have permission to view this medical prescription');
  }

  return prescription;
}

/**
 * Get prescription by consultation ID
 */
async function getPrescriptionByConsultationId(user, consultationId) {
  const consultation = await prisma.consultation.findUnique({
    where: { id: consultationId },
    include: {
      patient: true,
      doctor: true,
    },
  });

  if (!consultation) {
    throw ApiError.notFound('Consultation not found');
  }

  const isOwnerPatient = consultation.patient.userId === user.id;
  const isOwnerDoctor = consultation.doctor.userId === user.id;
  const isAdmin = user.role === 'ADMIN';

  if (!isOwnerPatient && !isOwnerDoctor && !isAdmin) {
    throw ApiError.forbidden('You do not have permission to view this consultation’s prescription');
  }

  const prescription = await prisma.prescription.findUnique({
    where: { consultationId },
    include: {
      items: true,
      doctor: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          specialization: true,
          qualification: true,
          licenseNumber: true,
        },
      },
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          gender: true,
        },
      },
    },
  });

  if (!prescription) {
    throw ApiError.notFound('No prescription has been issued yet for this consultation');
  }

  return prescription;
}

/**
 * List prescriptions accessible by authenticated user
 */
async function listPrescriptions(user, query = {}) {
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

  if (query.doctorId && (user.role === 'PATIENT' || user.role === 'ADMIN')) {
    where.doctorId = query.doctorId;
  }

  if (query.patientId && (user.role === 'DOCTOR' || user.role === 'ADMIN')) {
    where.patientId = query.patientId;
  }

  const [total, prescriptions] = await Promise.all([
    prisma.prescription.count({ where }),
    prisma.prescription.findMany({
      where,
      skip,
      take: limit,
      orderBy: { prescribedAt: 'desc' },
      include: {
        items: true,
        doctor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            specialization: true,
          },
        },
        consultation: {
          select: {
            bookingReference: true,
            status: true,
          },
        },
      },
    }),
  ]);

  return {
    prescriptions,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

module.exports = {
  createPrescription,
  getPrescriptionById,
  getPrescriptionByConsultationId,
  listPrescriptions,
};
