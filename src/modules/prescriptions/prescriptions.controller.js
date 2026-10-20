const prescriptionsService = require('./prescriptions.service');
const ApiResponse = require('../../utils/apiResponse');

function getClientInfo(req) {
  return {
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('user-agent'),
  };
}

/**
 * Create a new prescription
 * POST /api/v1/prescriptions
 */
async function createPrescription(req, res, next) {
  try {
    const clientInfo = getClientInfo(req);
    const prescription = await prescriptionsService.createPrescription(
      req.user.id,
      req.body,
      clientInfo
    );
    return ApiResponse.created(res, 'Prescription issued successfully', prescription);
  } catch (error) {
    next(error);
  }
}

/**
 * Get prescription by ID
 * GET /api/v1/prescriptions/:id
 */
async function getPrescriptionById(req, res, next) {
  try {
    const prescription = await prescriptionsService.getPrescriptionById(
      req.user,
      req.params.id
    );
    return ApiResponse.success(res, 200, 'Prescription details retrieved successfully', prescription);
  } catch (error) {
    next(error);
  }
}

/**
 * Get prescription for a consultation
 * GET /api/v1/prescriptions/consultation/:consultationId
 */
async function getPrescriptionByConsultationId(req, res, next) {
  try {
    const prescription = await prescriptionsService.getPrescriptionByConsultationId(
      req.user,
      req.params.consultationId
    );
    return ApiResponse.success(
      res,
      200,
      'Consultation prescription retrieved successfully',
      prescription
    );
  } catch (error) {
    next(error);
  }
}

/**
 * List prescriptions for current user
 * GET /api/v1/prescriptions
 */
async function listPrescriptions(req, res, next) {
  try {
    const result = await prescriptionsService.listPrescriptions(req.user, req.query);
    return ApiResponse.success(
      res,
      200,
      'Prescriptions retrieved successfully',
      result.prescriptions,
      result.pagination
    );
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createPrescription,
  getPrescriptionById,
  getPrescriptionByConsultationId,
  listPrescriptions,
};
