const { prisma } = require('../../config/prisma');
const ApiError = require('../../utils/apiError');
const { getCache, setCache, deletePattern } = require('../../config/redis');

/**
 * List doctors with search, filters, and pagination (Cached in Redis)
 */
async function listDoctors(query = {}) {
  const cacheKey = `doctors:list:${JSON.stringify(query)}`;
  const cachedData = await getCache(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  const page = query.page || 1;
  const limit = query.limit || 10;
  const skip = (page - 1) * limit;

  const sortBy = query.sortBy || 'experienceYears';
  const sortOrder = query.sortOrder || 'desc';

  const where = {
    user: { isActive: true },
    ...(query.isVerified !== undefined && { isVerified: query.isVerified }),
    ...(query.specialization && {
      specialization: { contains: query.specialization, mode: 'insensitive' },
    }),
    ...(query.minExperience !== undefined && !isNaN(query.minExperience) && {
      experienceYears: { gte: query.minExperience },
    }),
    ...((query.minFee !== undefined || query.maxFee !== undefined) && {
      consultationFee: {
        ...(query.minFee !== undefined && !isNaN(query.minFee) && { gte: query.minFee }),
        ...(query.maxFee !== undefined && !isNaN(query.maxFee) && { lte: query.maxFee }),
      },
    }),
    ...(query.search && {
      OR: [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { specialization: { contains: query.search, mode: 'insensitive' } },
      ],
    }),
  };

  const orderBy = [];
  if (sortBy === 'experienceYears') {
    orderBy.push({ isVerified: 'desc' }, { experienceYears: sortOrder });
  } else if (sortBy === 'consultationFee') {
    orderBy.push({ consultationFee: sortOrder });
  } else if (sortBy === 'createdAt') {
    orderBy.push({ createdAt: sortOrder });
  } else if (sortBy === 'firstName') {
    orderBy.push({ firstName: sortOrder });
  } else {
    orderBy.push({ createdAt: 'desc' });
  }

  const [total, doctors] = await Promise.all([
    prisma.doctorProfile.count({ where }),
    prisma.doctorProfile.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            createdAt: true,
          },
        },
      },
    }),
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  const result = {
    doctors,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };

  // Cache doctor search result for 60 seconds
  await setCache(cacheKey, result, 60);

  return result;
}

/**
 * Get detailed doctor profile by ID
 */
async function getDoctorById(id) {
  const doctor = await prisma.doctorProfile.findFirst({
    where: {
      OR: [{ id }, { userId: id }],
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          phoneNumber: true,
          role: true,
          createdAt: true,
        },
      },
      availabilitySlots: {
        where: {
          isBooked: false,
          startTime: { gte: new Date() },
        },
        orderBy: { startTime: 'asc' },
        take: 20, // Return next 20 upcoming open slots
      },
    },
  });

  if (!doctor) {
    throw ApiError.notFound('Doctor profile not found');
  }

  return doctor;
}

/**
 * Create availability slots for a doctor
 */
async function createAvailabilitySlots(userId, slots) {
  const doctor = await prisma.doctorProfile.findUnique({
    where: { userId },
  });

  if (!doctor) {
    throw ApiError.forbidden('Only registered doctors can create availability slots');
  }

  const slotList = Array.isArray(slots) ? slots : [slots];

  // Validate that no slots in the batch conflict or overlap with each other
  const sortedBatch = [...slotList].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  for (let i = 0; i < sortedBatch.length - 1; i++) {
    const currentEnd = new Date(sortedBatch[i].endTime).getTime();
    const nextStart = new Date(sortedBatch[i + 1].startTime).getTime();
    if (nextStart <= currentEnd) {
      throw ApiError.badRequest('Overlapping or duplicate slot intervals found within the submitted batch');
    }
  }

  // Create slots in a transaction and log audit
  const createdSlots = await prisma.$transaction(async (tx) => {
    // Row lock on the doctor profile to serialize concurrent slot creation for the doctor
    await tx.$queryRaw`
      SELECT id FROM doctor_profiles WHERE id = ${doctor.id}::uuid FOR UPDATE
    `;

    const results = [];
    for (const slot of slotList) {
      const startTime = new Date(slot.startTime);
      const endTime = new Date(slot.endTime);

      // Check if slot overlaps with an existing slot for this doctor
      const overlapping = await tx.availabilitySlot.findFirst({
        where: {
          doctorId: doctor.id,
          AND: [
            { startTime: { lt: endTime } },
            { endTime: { gt: startTime } },
          ],
        },
      });

      if (overlapping) {
        throw ApiError.conflict(
          `A slot starting at ${startTime.toISOString()} already exists or overlaps for this doctor`
        );
      }

      const created = await tx.availabilitySlot.create({
        data: {
          doctorId: doctor.id,
          startTime,
          endTime,
          isBooked: false,
          version: 0,
        },
      });
      results.push(created);
    }

    await tx.auditLog.create({
      data: {
        userId,
        action: 'SLOT_CREATED',
        entityType: 'AvailabilitySlot',
        entityId: doctor.id,
        details: { count: results.length },
      },
    });

    return results;
  });

  // Invalidate slot caches across all doctors
  await deletePattern('slots:*');

  return createdSlots;
}

/**
 * Update a doctor's professional profile
 */
async function updateDoctorProfile(userId, data) {
  const doctor = await prisma.doctorProfile.findUnique({
    where: { userId },
  });

  if (!doctor) {
    throw ApiError.notFound('Doctor profile not found');
  }

  const { firstName, lastName, specialization, qualification, experienceYears, consultationFee, bio } = data;

  const updated = await prisma.$transaction(async (tx) => {
    return tx.doctorProfile.update({
      where: { id: doctor.id },
      data: {
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(specialization && { specialization }),
        ...(qualification && { qualification }),
        ...(experienceYears !== undefined && { experienceYears }),
        ...(consultationFee !== undefined && { consultationFee }),
        ...(bio !== undefined && { bio }),
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phoneNumber: true,
            role: true,
          },
        },
      },
    });
  });

  await deletePattern('doctors:*');
  return updated;
}

/**
 * Update an existing unbooked availability slot
 */
async function updateAvailabilitySlot(userId, slotId, data) {
  const doctor = await prisma.doctorProfile.findUnique({
    where: { userId },
  });

  if (!doctor) {
    throw ApiError.forbidden('Only doctor owners can update availability slots');
  }

  const slot = await prisma.availabilitySlot.findUnique({
    where: { id: slotId },
  });

  if (!slot) {
    throw ApiError.notFound('Availability slot not found');
  }

  if (slot.doctorId !== doctor.id) {
    throw ApiError.forbidden('You do not have permission to update another doctor’s slot');
  }

  if (slot.isBooked) {
    throw ApiError.badRequest('Cannot update a slot that is already booked by a patient');
  }

  const newStartTime = new Date(data.startTime);
  const newEndTime = new Date(data.endTime);

  // Check overlapping with any other slot of this doctor
  const overlapping = await prisma.availabilitySlot.findFirst({
    where: {
      doctorId: doctor.id,
      id: { not: slotId },
      AND: [
        { startTime: { lt: newEndTime } },
        { endTime: { gt: newStartTime } },
      ],
    },
  });

  if (overlapping) {
    throw ApiError.conflict('Updated time range overlaps with an existing availability slot');
  }

  const updated = await prisma.availabilitySlot.update({
    where: { id: slotId },
    data: {
      startTime: newStartTime,
      endTime: newEndTime,
      version: { increment: 1 },
    },
  });

  await deletePattern('slots:*');
  return updated;
}

/**
 * Get slots for a specific doctor (Cached in Redis)
 */
async function getDoctorSlots(doctorId, query = {}) {
  // Verify doctor exists
  const doctor = await prisma.doctorProfile.findFirst({
    where: { OR: [{ id: doctorId }, { userId: doctorId }] },
  });

  if (!doctor) {
    throw ApiError.notFound('Doctor profile not found');
  }

  const cacheKey = `slots:${doctor.id}:${JSON.stringify(query)}`;
  const cached = await getCache(cacheKey);
  if (cached) {
    return cached;
  }

  const where = {
    doctorId: doctor.id,
    ...(query.isBooked !== undefined && { isBooked: query.isBooked }),
    ...(query.startDate && { startTime: { gte: new Date(query.startDate) } }),
    ...(query.endDate && { endTime: { lte: new Date(query.endDate) } }),
  };

  const slots = await prisma.availabilitySlot.findMany({
    where,
    orderBy: { startTime: 'asc' },
  });

  const response = {
    doctor: {
      id: doctor.id,
      name: `Dr. ${doctor.firstName} ${doctor.lastName}`,
      specialization: doctor.specialization,
      consultationFee: doctor.consultationFee,
    },
    slots,
  };

  // Cache slots for 30 seconds
  await setCache(cacheKey, response, 30);

  return response;
}

/**
 * Delete an unbooked availability slot
 */
async function deleteAvailabilitySlot(userId, slotId) {
  const doctor = await prisma.doctorProfile.findUnique({
    where: { userId },
  });

  if (!doctor) {
    throw ApiError.forbidden('Only doctor owners can delete slots');
  }

  const slot = await prisma.availabilitySlot.findUnique({
    where: { id: slotId },
  });

  if (!slot) {
    throw ApiError.notFound('Availability slot not found');
  }

  if (slot.doctorId !== doctor.id) {
    throw ApiError.forbidden('You do not have permission to delete another doctor’s slot');
  }

  if (slot.isBooked) {
    throw ApiError.badRequest('Cannot delete a slot that is already booked by a patient');
  }

  await prisma.$transaction([
    prisma.availabilitySlot.delete({ where: { id: slotId } }),
    prisma.auditLog.create({
      data: {
        userId,
        action: 'SLOT_DELETED',
        entityType: 'AvailabilitySlot',
        entityId: slotId,
        details: { startTime: slot.startTime, endTime: slot.endTime },
      },
    }),
  ]);

  // Invalidate slot cache
  await deletePattern('slots:*');

  return { id: slotId, deleted: true };
}

module.exports = {
  listDoctors,
  getDoctorById,
  createAvailabilitySlots,
  updateAvailabilitySlot,
  updateDoctorProfile,
  getDoctorSlots,
  deleteAvailabilitySlot,
};
