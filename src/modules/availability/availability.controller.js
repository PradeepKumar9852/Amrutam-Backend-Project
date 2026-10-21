const availabilityService = require('./availability.service');
const ApiResponse = require('../../utils/apiResponse');

/**
 * Controller: Create availability slots for authenticated doctor
 */
async function createSlots(req, res, next) {
  try {
    const slotsPayload = Array.isArray(req.body.slots) ? req.body.slots : [req.body];
    const createdSlots = await availabilityService.createSlots(req.user.id, slotsPayload);
    return ApiResponse.success(res, 201, 'Availability slot(s) created successfully', createdSlots);
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Get availability slots for a doctor
 */
async function getDoctorSlots(req, res, next) {
  try {
    const slots = await availabilityService.getDoctorSlots(req.params.doctorId, req.query);
    return ApiResponse.success(res, 200, 'Availability slots retrieved successfully', slots);
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Update an availability slot
 */
async function updateSlot(req, res, next) {
  try {
    const updated = await availabilityService.updateSlot(req.user.id, req.params.slotId, req.body);
    return ApiResponse.success(res, 200, 'Availability slot updated successfully', updated);
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Delete an availability slot
 */
async function deleteSlot(req, res, next) {
  try {
    const result = await availabilityService.deleteSlot(req.user.id, req.params.slotId);
    return ApiResponse.success(res, 200, result.message || 'Availability slot deleted successfully');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createSlots,
  updateSlot,
  getDoctorSlots,
  deleteSlot,
};
