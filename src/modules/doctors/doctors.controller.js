const doctorService = require('./doctors.service');
const ApiResponse = require('../../utils/apiResponse');

/**
 * List doctors with filters and pagination
 * GET /api/v1/doctors
 */
async function listDoctors(req, res, next) {
  try {
    const result = await doctorService.listDoctors(req.query);
    return ApiResponse.success(res, 200, 'Doctors retrieved successfully', result.doctors, result.pagination);
  } catch (error) {
    next(error);
  }
}

/**
 * Get detailed doctor profile by ID
 * GET /api/v1/doctors/:id
 */
async function getDoctorById(req, res, next) {
  try {
    const doctor = await doctorService.getDoctorById(req.params.id);
    return ApiResponse.success(res, 200, 'Doctor profile retrieved successfully', doctor);
  } catch (error) {
    next(error);
  }
}

/**
 * Create doctor availability slot(s)
 * POST /api/v1/doctors/slots
 */
async function createSlots(req, res, next) {
  try {
    const slotsPayload = req.body.slots ? req.body.slots : req.body;
    const createdSlots = await doctorService.createAvailabilitySlots(req.user.id, slotsPayload);
    return ApiResponse.created(res, 'Availability slot(s) created successfully', createdSlots);
  } catch (error) {
    next(error);
  }
}

/**
 * Get slots for a specific doctor
 * GET /api/v1/doctors/:id/slots
 */
async function getDoctorSlots(req, res, next) {
  try {
    const result = await doctorService.getDoctorSlots(req.params.id, req.query);
    return ApiResponse.success(res, 200, 'Doctor availability slots retrieved successfully', result);
  } catch (error) {
    next(error);
  }
}

/**
 * Update doctor professional profile
 * PUT /api/v1/doctors/profile
 */
async function updateProfile(req, res, next) {
  try {
    const updated = await doctorService.updateDoctorProfile(req.user.id, req.body);
    return ApiResponse.success(res, 200, 'Doctor profile updated successfully', updated);
  } catch (error) {
    next(error);
  }
}

/**
 * Update an existing unbooked availability slot
 * PATCH /api/v1/doctors/slots/:slotId
 */
async function updateSlot(req, res, next) {
  try {
    const updated = await doctorService.updateAvailabilitySlot(req.user.id, req.params.slotId, req.body);
    return ApiResponse.success(res, 200, 'Availability slot updated successfully', updated);
  } catch (error) {
    next(error);
  }
}

/**
 * Delete an unbooked availability slot
 * DELETE /api/v1/doctors/slots/:slotId
 */
async function deleteSlot(req, res, next) {
  try {
    const result = await doctorService.deleteAvailabilitySlot(req.user.id, req.params.slotId);
    return ApiResponse.success(res, 200, 'Availability slot deleted successfully', result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listDoctors,
  getDoctorById,
  updateProfile,
  createSlots,
  updateSlot,
  getDoctorSlots,
  deleteSlot,
};
