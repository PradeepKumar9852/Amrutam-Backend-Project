const { prisma } = require('../../config/prisma');
const ApiError = require('../../utils/apiError');
const logger = require('../../utils/logger');
const jobQueue = require('../../jobs/jobQueue');
const mockPaymentProvider = require('./providers/mockPaymentProvider');

/**
 * Process payment for a consultation with payment provider integration boundary,
 * idempotency, retry handling, and failure scenario support.
 */
async function processPayment(userId, payload, idempotencyKey = null, clientInfo = {}) {
  const key = idempotencyKey || payload.idempotencyKey || null;

  // 1. Safety verification: Reject raw card credentials
  if (payload.cardNumber || payload.cvv || payload.pan || payload.pin) {
    throw ApiError.badRequest(
      'Security Violation: Raw card credentials (PAN, CVV, PIN) must never be transmitted. Card transactions must be tokenized.'
    );
  }

  // 2. Verify Patient Profile
  const patient = await prisma.patientProfile.findUnique({
    where: { userId },
  });

  if (!patient) {
    throw ApiError.forbidden('Only registered patients can process consultation payments');
  }

  // 3. Retrieve Consultation with Doctor fee & existing payment
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

  // 4. IDEMPOTENCY & SAFE RETRY CHECK
  // If payment is already COMPLETED, return immediately (idempotent replay)
  if (consultation.payment && consultation.payment.status === 'COMPLETED') {
    return { payment: consultation.payment, isIdempotentReplay: true };
  }

  // If idempotencyKey is supplied, check prior audit logs
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

    if (existingLog) {
      // Reject if key is reused with a different consultation
      const loggedConsultationId = existingLog.details?.consultationId;
      if (loggedConsultationId && loggedConsultationId !== payload.consultationId) {
        throw ApiError.conflict('Idempotency-Key has already been used with a different request payload');
      }

      // If prior attempt completed successfully, replay response
      if (existingLog.details?.status === 'COMPLETED' && existingLog.entityId) {
        const existingPayment = await prisma.payment.findUnique({
          where: { id: existingLog.entityId },
        });
        if (existingPayment && existingPayment.status === 'COMPLETED') {
          return { payment: existingPayment, isIdempotentReplay: true };
        }
      }
      // If prior attempt failed, we permit safe retry!
    }
  }

  const amount = consultation.doctor.consultationFee;

  // 5. CALL PAYMENT PROVIDER BOUNDARY (MockPaymentProvider)
  const providerResult = await mockPaymentProvider.processPayment({
    amount: Number(amount),
    currency: 'INR',
    consultationId: consultation.id,
    patientId: patient.id,
    paymentMethod: payload.paymentMethod || 'UPI',
    simulateFailure: Boolean(payload.simulateFailure),
  });

  // 6. HANDLE FAILURE SCENARIO
  if (!providerResult.success) {
    // Record FAILED payment attempt atomically
    await prisma.$transaction(async (tx) => {
      await tx.payment.upsert({
        where: { consultationId: consultation.id },
        create: {
          consultationId: consultation.id,
          patientId: patient.id,
          amount,
          currency: 'INR',
          status: 'FAILED',
          paymentMethod: payload.paymentMethod || 'UPI',
        },
        update: {
          status: 'FAILED',
          paymentMethod: payload.paymentMethod || 'UPI',
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'PAYMENT_PROCESSED',
          entityType: 'Payment',
          details: {
            consultationId: consultation.id,
            status: 'FAILED',
            amount: amount.toString(),
            failureReason: providerResult.failureReason,
            provider: providerResult.provider,
            idempotencyKey: key,
          },
          ipAddress: clientInfo.ip || null,
          userAgent: clientInfo.userAgent || null,
        },
      });
    });

    logger.warn('[PAYMENT] Payment declined by provider', {
      consultationId: consultation.id,
      failureReason: providerResult.failureReason,
    });

    throw ApiError.badRequest(providerResult.failureReason || 'Payment declined by gateway');
  }

  // 7. HANDLE SUCCESS SCENARIO (Atomic transaction)
  const paymentRecord = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.upsert({
      where: { consultationId: consultation.id },
      create: {
        consultationId: consultation.id,
        patientId: patient.id,
        amount,
        currency: 'INR',
        status: 'COMPLETED',
        transactionId: providerResult.transactionId,
        paymentMethod: payload.paymentMethod || 'UPI',
        paidAt: new Date(),
      },
      update: {
        status: 'COMPLETED',
        transactionId: providerResult.transactionId,
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
          transactionId: providerResult.transactionId,
          consultationId: consultation.id,
          amount: amount.toString(),
          currency: 'INR',
          status: 'COMPLETED',
          provider: providerResult.provider,
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
    transactionId: paymentRecord.transactionId,
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
 * Refund a payment (Admin or Doctor) via provider boundary
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

  // Call mock provider refund
  const refundResult = await mockPaymentProvider.refundPayment({
    transactionId: payment.transactionId,
    amount: Number(payment.amount),
    currency: payment.currency,
    reason,
  });

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
          refundId: refundResult.refundId,
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
