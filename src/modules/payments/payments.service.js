const { prisma } = require('../../config/prisma');
const ApiError = require('../../utils/apiError');
const logger = require('../../utils/logger');
const jobQueue = require('../../jobs/jobQueue');


/**
 * Generate unique transaction reference: TXN-YYYYMMDD-XXXX
 */
function generateTransactionId() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  return `TXN-${dateStr}-${randomSuffix}`;
}

/**
 * Process payment for a consultation with idempotency and atomic transactional guarantees
 */
async function processPayment(userId, payload, idempotencyKey = null, clientInfo = {}) {
  const key = idempotencyKey || payload.idempotencyKey || null;

  // 1. Verify Patient Profile
  const patient = await prisma.patientProfile.findUnique({
    where: { userId },
  });

  if (!patient) {
    throw ApiError.forbidden('Only registered patients can process consultation payments');
  }

  // 2. Retrieve Consultation with Doctor fee
  const consultation = await prisma.consultation.findUnique({
    where: { id: payload.consultationId },
    include: {
      patient: true,
      doctor: true,
      payment: true,
      slot: true,
    },
  });

  if (!consultation) {
    throw ApiError.notFound('Consultation not found');
  }

  if (consultation.patientId !== patient.id) {
    throw ApiError.forbidden('You are not authorized to pay for another patient’s consultation');
  }

  if (['CANCELLED'].includes(consultation.status)) {
    throw ApiError.badRequest('Cannot process payment for a cancelled consultation');
  }

  // 3. IDEMPOTENCY CHECK
  // Check if payment already exists and is COMPLETED
  if (consultation.payment && consultation.payment.status === 'COMPLETED') {
    return { payment: consultation.payment, isIdempotentReplay: true };
  }

  // If idempotencyKey is supplied, check audit logs for prior execution
  if (key) {
    const existingLog = await prisma.auditLog.findFirst({
      where: {
        userId,
        action: 'PAYMENT_PROCESSED',
        details: {
          path: ['idempotencyKey'],
          equals: key,
        },
      },
    });

    if (existingLog && existingLog.entityId) {
      const existingPayment = await prisma.payment.findUnique({
        where: { id: existingLog.entityId },
      });
      if (existingPayment) {
        return { payment: existingPayment, isIdempotentReplay: true };
      }
    }
  }

  // 4. ATOMIC TRANSACTION: Record payment, update consultation, record audit
  const amount = consultation.doctor.consultationFee;
  const transactionId = generateTransactionId();

  const paymentRecord = await prisma.$transaction(async (tx) => {
    // Upsert payment record
    const payment = await tx.payment.upsert({
      where: { consultationId: consultation.id },
      create: {
        consultationId: consultation.id,
        patientId: patient.id,
        amount,
        currency: 'INR',
        status: 'COMPLETED',
        transactionId,
        paymentMethod: payload.paymentMethod || 'UPI',
        paidAt: new Date(),
      },
      update: {
        status: 'COMPLETED',
        transactionId,
        paymentMethod: payload.paymentMethod || 'UPI',
        paidAt: new Date(),
      },
    });

    // Ensure consultation is confirmed
    if (consultation.status === 'PENDING') {
      await tx.consultation.update({
        where: { id: consultation.id },
        data: { status: 'CONFIRMED' },
      });
    }

    // Record audit log entry
    await tx.auditLog.create({
      data: {
        userId,
        action: 'PAYMENT_PROCESSED',
        entityType: 'Payment',
        entityId: payment.id,
        details: {
          transactionId,
          consultationId: consultation.id,
          amount: amount.toString(),
          currency: 'INR',
          idempotencyKey: key,
        },
        ipAddress: clientInfo.ip || null,
        userAgent: clientInfo.userAgent || null,
      },
    });

    return payment;
  });

  logger.info(`[PAYMENT] Payment processed successfully for consultation: ${consultation.id}`, {
    paymentId: paymentRecord.id,
    amount: paymentRecord.amount,
  });

  // Asynchronously dispatch payment settlement webhook
  jobQueue.dispatch('PAYMENT_WEBHOOK_DISPATCH', {
    paymentId: paymentRecord.id,
    transactionId: paymentRecord.transactionId,
    amount: paymentRecord.amount,
  });

  return { payment: paymentRecord, isIdempotentReplay: false };
}


/**
 * Get payment receipt for a consultation with IDOR authorization
 */
async function getPaymentByConsultationId(user, consultationId) {
  const consultation = await prisma.consultation.findUnique({
    where: { id: consultationId },
    include: {
      patient: true,
      doctor: true,
      payment: true,
    },
  });

  if (!consultation) {
    throw ApiError.notFound('Consultation not found');
  }

  // Ownership verification
  const isOwnerPatient = consultation.patient.userId === user.id;
  const isOwnerDoctor = consultation.doctor.userId === user.id;
  const isAdmin = user.role === 'ADMIN';

  if (!isOwnerPatient && !isOwnerDoctor && !isAdmin) {
    throw ApiError.forbidden('You are not authorized to view this payment receipt');
  }

  if (!consultation.payment) {
    throw ApiError.notFound('No payment record exists for this consultation');
  }

  return {
    payment: consultation.payment,
    consultation: {
      id: consultation.id,
      bookingReference: consultation.bookingReference,
      status: consultation.status,
    },
  };
}

/**
 * Refund a payment (Admin or Doctor)
 */
async function refundPayment(user, paymentId, reason, clientInfo = {}) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      consultation: {
        include: { slot: true },
      },
    },
  });

  if (!payment) {
    throw ApiError.notFound('Payment not found');
  }

  if (payment.status !== 'COMPLETED') {
    throw ApiError.badRequest(`Cannot refund a payment with status '${payment.status}'`);
  }

  // Atomic transaction to mark payment as REFUNDED and log audit trail
  const refundedPayment = await prisma.$transaction(async (tx) => {
    const updated = await tx.payment.update({
      where: { id: paymentId },
      data: { status: 'REFUNDED' },
    });

    // If consultation not already completed, mark as cancelled and free the slot
    if (payment.consultation.status !== 'COMPLETED' && payment.consultation.status !== 'CANCELLED') {
      await tx.consultation.update({
        where: { id: payment.consultationId },
        data: {
          status: 'CANCELLED',
          cancellationReason: `Refunded: ${reason}`,
        },
      });

      if (payment.consultation.slot) {
        await tx.availabilitySlot.update({
          where: { id: payment.consultation.slot.id },
          data: { isBooked: false, version: { increment: 1 } },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'PAYMENT_REFUNDED',
        entityType: 'Payment',
        entityId: paymentId,
        details: {
          transactionId: payment.transactionId,
          refundReason: reason,
          refundedByRole: user.role,
        },
        ipAddress: clientInfo.ip || null,
        userAgent: clientInfo.userAgent || null,
      },
    });

    return updated;
  });

  return refundedPayment;
}

module.exports = {
  processPayment,
  getPaymentByConsultationId,
  refundPayment,
};
