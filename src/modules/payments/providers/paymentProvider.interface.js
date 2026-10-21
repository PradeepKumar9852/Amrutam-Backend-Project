/**
 * Payment Provider Interface Contract
 * Defines the standard payment integration boundary for the Amrutam Telemedicine Backend.
 */

class PaymentProviderInterface {
  constructor(providerName) {
    if (this.constructor === PaymentProviderInterface) {
      throw new Error('PaymentProviderInterface cannot be instantiated directly.');
    }
    this.name = providerName;
  }

  /**
   * Process a payment transaction
   * @param {Object} params
   * @param {number} params.amount
   * @param {string} params.currency
   * @param {string} params.consultationId
   * @param {string} params.patientId
   * @param {string} params.paymentMethod
   * @param {Object} [params.metadata]
   * @returns {Promise<{ success: boolean, transactionId?: string, status: string, failureReason?: string, provider: string }>}
   */
  async processPayment(_params) {
    throw new Error('Method processPayment() must be implemented by payment provider.');
  }

  /**
   * Refund an existing completed transaction
   * @param {Object} params
   * @param {string} params.transactionId
   * @param {number} params.amount
   * @param {string} params.currency
   * @param {string} params.reason
   * @returns {Promise<{ success: boolean, refundId?: string, status: string, provider: string }>}
   */
  async refundPayment(_params) {
    throw new Error('Method refundPayment() must be implemented by payment provider.');
  }

  /**
   * Verify the status of an external transaction
   * @param {string} _transactionId
   * @returns {Promise<{ status: string, verified: boolean }>}
   */
  async verifyPayment(_transactionId) {
    throw new Error('Method verifyPayment() must be implemented by payment provider.');
  }
}

module.exports = PaymentProviderInterface;
