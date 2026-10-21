const PaymentProviderInterface = require('./paymentProvider.interface');
const ApiError = require('../../../utils/apiError');
const logger = require('../../../utils/logger');

/**
 * MockPaymentProvider
 * 
 * NOTICE & DISCLAIMER:
 * This is an explicit MOCK PAYMENT GATEWAY PROVIDER used for local development,
 * integration testing, and sandbox environments when commercial payment gateway
 * credentials (e.g. Razorpay, Stripe) are not provisioned in the runtime environment.
 * 
 * PCI-DSS SAFETY:
 * - This provider strictly rejects raw credit/debit card numbers, CVVs, and PINs.
 * - Raw primary account numbers (PAN) are NEVER stored, processed, or persisted.
 */
class MockPaymentProvider extends PaymentProviderInterface {
  constructor() {
    super('MOCK_SANDBOX_GATEWAY');
  }

  /**
   * Validate that payload does not contain raw credit card PAN or security codes
   */
  _guardAgainstRawCardData(payload) {
    const rawKeys = ['cardNumber', 'pan', 'cvv', 'cvc', 'securityCode', 'pin', 'cardPin'];
    for (const key of rawKeys) {
      if (payload[key] !== undefined || payload.metadata?.[key] !== undefined) {
        throw ApiError.badRequest(
          'Security Violation: Raw card credentials (PAN, CVV, PIN) must never be transmitted. ' +
          'All card transactions must be tokenized via payment gateway SDK.'
        );
      }
    }
  }

  /**
   * Process a mock payment transaction
   */
  async processPayment(params) {
    this._guardAgainstRawCardData(params);

    const { amount, currency = 'INR', paymentMethod = 'UPI', simulateFailure = false } = params;

    // Failure simulation scenario (e.g. insufficient funds, network timeout)
    if (simulateFailure || paymentMethod === 'FAIL_SIMULATION') {
      logger.warn('[MOCK_PAYMENT] Simulating payment gateway failure', {
        consultationId: params.consultationId,
        amount,
      });

      return {
        success: false,
        status: 'FAILED',
        failureReason: 'GATEWAY_DECLINED: Simulated bank account decline or insufficient balance.',
        provider: this.name,
        timestamp: new Date().toISOString(),
      };
    }

    // Normal successful execution
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const transactionId = `MOCK-TXN-${dateStr}-${randomSuffix}`;

    logger.info('[MOCK_PAYMENT] Mock payment processed successfully', {
      transactionId,
      amount,
      currency,
      provider: this.name,
    });

    return {
      success: true,
      status: 'COMPLETED',
      transactionId,
      provider: this.name,
      amount,
      currency,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Process a mock refund
   */
  async refundPayment(params) {
    const { transactionId, amount, reason } = params;

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const refundId = `MOCK-REF-${dateStr}-${randomSuffix}`;

    logger.info('[MOCK_PAYMENT] Mock refund issued successfully', {
      refundId,
      originalTransactionId: transactionId,
      amount,
      reason,
      provider: this.name,
    });

    return {
      success: true,
      status: 'REFUNDED',
      refundId,
      provider: this.name,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Verify mock transaction
   */
  async verifyPayment(transactionId) {
    return {
      status: 'COMPLETED',
      verified: true,
      provider: this.name,
      transactionId,
    };
  }
}

// Export singleton instance
module.exports = new MockPaymentProvider();
