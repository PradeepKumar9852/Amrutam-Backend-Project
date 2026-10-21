const doctorsService = require('../doctors/doctors.service');

/**
 * Service to manage doctor availability slots
 */
async function createSlots(userId, slotsPayload) {
  return doctorsService.createAvailabilitySlots(userId, slotsPayload);
}

async function getDoctorSlots(doctorId, query) {
  return doctorsService.getDoctorSlots(doctorId, query);
}

async function updateSlot(userId, slotId, data) {
  return doctorsService.updateAvailabilitySlot(userId, slotId, data);
}

async function deleteSlot(userId, slotId) {
  return doctorsService.deleteAvailabilitySlot(userId, slotId);
}

module.exports = {
  createSlots,
  updateSlot,
  getDoctorSlots,
  deleteSlot,
};
