/**
 * Database Seed Script for Amrutam Telemedicine Backend
 * Seeds realistic Ayurvedic healthcare data for local development and reviewer evaluation.
 * 
 * Usage:
 *   npm run seed
 */

const bcrypt = require('bcryptjs');
const { prisma } = require('../src/config/prisma');

async function getOrCreateUser(userData) {
  let user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: userData.email },
        ...(userData.phoneNumber ? [{ phoneNumber: userData.phoneNumber }] : []),
      ],
    },
  });

  if (!user) {
    user = await prisma.user.create({ data: userData });
  }
  return user;
}

async function seed() {
  console.log('🌱 Starting Amrutam Telemedicine database seeding...');

  const passwordHash = await bcrypt.hash('Password@123', 12);
  const adminPasswordHash = await bcrypt.hash('Admin@123', 12);

  // 1. Seed Admin User
  console.log('-> Seeding Platform Administrator...');
  const adminUser = await getOrCreateUser({
    email: 'admin@amrutam.co.in',
    passwordHash: adminPasswordHash,
    phoneNumber: '+919999000001',
    role: 'ADMIN',
    isActive: true,
    mfaEnabled: false,
  });

  // 2. Seed Ayurvedic Doctors
  console.log('-> Seeding Verified Ayurvedic Doctors...');
  const doctorsData = [
    {
      email: 'dr.rajesh.sharma@amrutam.co.in',
      phone: '+919999000011',
      firstName: 'Dr. Rajesh',
      lastName: 'Sharma',
      specialization: 'Kayachikitsa (Internal Medicine)',
      qualification: 'BAMS, MD (Ayurveda)',
      experienceYears: 14,
      licenseNumber: 'AYUR-DEL-2012-0841',
      consultationFee: 800.0,
      bio: 'Senior Ayurvedic consultant specializing in chronic lifestyle disorders, metabolic health, and digestive wellness with 14+ years of clinical practice.',
    },
    {
      email: 'dr.priya.nair@amrutam.co.in',
      phone: '+919999000012',
      firstName: 'Dr. Priya',
      lastName: 'Nair',
      specialization: 'Panchakarma & Detoxification',
      qualification: 'BAMS, MS (Ayurveda)',
      experienceYears: 10,
      licenseNumber: 'AYUR-KER-2015-1192',
      consultationFee: 1000.0,
      bio: 'Kerala-trained Panchakarma specialist focusing on joint disorders, detoxification therapies, and stress rejuvenation protocols.',
    },
    {
      email: 'dr.anand.kulkarni@amrutam.co.in',
      phone: '+919999000013',
      firstName: 'Dr. Anand',
      lastName: 'Kulkarni',
      specialization: 'Shalya Tantra (Surgical Care & Wound Management)',
      qualification: 'BAMS, MS (Ayur Shalya)',
      experienceYears: 8,
      licenseNumber: 'AYUR-MAH-2017-3401',
      consultationFee: 750.0,
      bio: 'Expert in Kshara Sutra therapy, anorectal management, and traditional Ayurvedic wound healing techniques.',
    },
    {
      email: 'dr.sunita.menon@amrutam.co.in',
      phone: '+919999000014',
      firstName: 'Dr. Sunita',
      lastName: 'Menon',
      specialization: 'Prasuti Tantra & Stri Roga (Women Health)',
      qualification: 'BAMS, MD (Ayur)',
      experienceYears: 16,
      licenseNumber: 'AYUR-KAR-2010-0455',
      consultationFee: 900.0,
      bio: 'Distinguished practitioner specializing in hormonal harmony, PCOS management, prenatal Ayurvedic wellness, and post-partum recovery.',
    },
  ];

  const createdDoctors = [];
  for (const doc of doctorsData) {
    const user = await getOrCreateUser({
      email: doc.email,
      passwordHash,
      phoneNumber: doc.phone,
      role: 'DOCTOR',
      isActive: true,
    });

    let profile = await prisma.doctorProfile.findUnique({
      where: { userId: user.id },
    });

    if (!profile) {
      profile = await prisma.doctorProfile.create({
        data: {
          userId: user.id,
          firstName: doc.firstName,
          lastName: doc.lastName,
          specialization: doc.specialization,
          qualification: doc.qualification,
          experienceYears: doc.experienceYears,
          licenseNumber: doc.licenseNumber,
          consultationFee: doc.consultationFee,
          bio: doc.bio,
          isVerified: true,
        },
      });
    }

    createdDoctors.push({ user, profile });
  }

  // 3. Seed Patient Users
  console.log('-> Seeding Sample Patients...');
  const patientsData = [
    {
      email: 'arjun.patel@example.com',
      phone: '+919999000021',
      firstName: 'Arjun',
      lastName: 'Patel',
      gender: 'MALE',
      bloodGroup: 'B+',
      dob: new Date('1992-05-14'),
    },
    {
      email: 'ananya.iyer@example.com',
      phone: '+919999000022',
      firstName: 'Ananya',
      lastName: 'Iyer',
      gender: 'FEMALE',
      bloodGroup: 'O+',
      dob: new Date('1996-09-22'),
    },
  ];

  const createdPatients = [];
  for (const pat of patientsData) {
    const user = await getOrCreateUser({
      email: pat.email,
      passwordHash,
      phoneNumber: pat.phone,
      role: 'PATIENT',
      isActive: true,
    });

    let profile = await prisma.patientProfile.findUnique({
      where: { userId: user.id },
    });

    if (!profile) {
      profile = await prisma.patientProfile.create({
        data: {
          userId: user.id,
          firstName: pat.firstName,
          lastName: pat.lastName,
          gender: pat.gender,
          bloodGroup: pat.bloodGroup,
          dateOfBirth: pat.dob,
          address: '142, Indiranagar 100ft Road, Bengaluru, Karnataka 560038',
        },
      });
    }

    createdPatients.push({ user, profile });
  }

  // 4. Seed Availability Slots for Dr. Rajesh Sharma
  console.log('-> Seeding Doctor Availability Slots...');
  const leadDoctor = createdDoctors[0].profile;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const slotTimes = [
    { startHour: 10, startMin: 0, endHour: 10, endMin: 30 },
    { startHour: 11, startMin: 0, endHour: 11, endMin: 30 },
    { startHour: 14, startMin: 0, endHour: 14, endMin: 30 },
    { startHour: 15, startMin: 0, endHour: 15, endMin: 30 },
  ];

  const createdSlots = [];
  for (const t of slotTimes) {
    const startTime = new Date(tomorrow);
    startTime.setHours(t.startHour, t.startMin, 0, 0);

    const endTime = new Date(tomorrow);
    endTime.setHours(t.endHour, t.endMin, 0, 0);

    let slot = await prisma.availabilitySlot.findFirst({
      where: {
        doctorId: leadDoctor.id,
        startTime,
      },
    });

    if (!slot) {
      slot = await prisma.availabilitySlot.create({
        data: {
          doctorId: leadDoctor.id,
          startTime,
          endTime,
          isBooked: false,
        },
      });
    }
    createdSlots.push(slot);
  }

  // 5. Seed a Completed Consultation with Prescription for Patient Arjun
  console.log('-> Seeding Sample Completed Consultation & Prescription...');
  const firstSlot = createdSlots[0];
  const patientArjun = createdPatients[0].profile;

  const sampleBookingRef = 'AMR-SEED-2026-001';
  let consultation = await prisma.consultation.findUnique({
    where: { bookingReference: sampleBookingRef },
  });

  if (!consultation && firstSlot) {
    await prisma.availabilitySlot.update({
      where: { id: firstSlot.id },
      data: { isBooked: true },
    });

    consultation = await prisma.consultation.create({
      data: {
        bookingReference: sampleBookingRef,
        patientId: patientArjun.id,
        doctorId: leadDoctor.id,
        slotId: firstSlot.id,
        status: 'COMPLETED',
        consultationType: 'VIDEO',
        meetingLink: 'https://telemedicine.amrutam.co.in/room/amr-seed-001',
        symptomsSummary: 'Persistent hyperacidity (Amlapitta), irregular digestion, and sleep disturbances.',
      },
    });

    // Seed Prescription with authentic Ayurvedic items
    const prescription = await prisma.prescription.create({
      data: {
        consultationId: consultation.id,
        doctorId: leadDoctor.id,
        patientId: patientArjun.id,
        diagnosis: 'Amlapitta with Pitta-Vata aggravation. Mild digestive sluggishness (Mandagni).',
        notes: 'Advised warm water intake, avoiding fermented and spicy foods. Follow Dinacharya guidelines.',
        items: {
          create: [
            {
              medicineName: 'Avipattikar Churna',
              dosage: '3 grams',
              frequency: 'Twice daily before meals',
              duration: '15 days',
              instructions: 'Take with lukewarm water 20 minutes prior to lunch and dinner.',
            },
            {
              medicineName: 'Kamadudha Ras (Moti Yukta)',
              dosage: '1 tablet (250mg)',
              frequency: 'Twice daily',
              duration: '21 days',
              instructions: 'Take after meals with honey or milk.',
            },
            {
              medicineName: 'Ashwagandha Vati',
              dosage: '1 tablet (500mg)',
              frequency: 'Once daily at bedtime',
              duration: '30 days',
              instructions: 'Take with warm milk for sleep regulation and stress reduction.',
            },
          ],
        },
      },
    });

    // Seed Payment record
    await prisma.payment.create({
      data: {
        consultationId: consultation.id,
        patientId: patientArjun.id,
        amount: 800.0,
        currency: 'INR',
        status: 'COMPLETED',
        paymentMethod: 'UPI',
        transactionId: 'TXN_SEED_987654321',
      },
    });

    // Seed Audit Log
    await prisma.auditLog.create({
      data: {
        userId: createdDoctors[0].user.id,
        action: 'PRESCRIPTION_ISSUED',
        entityType: 'Prescription',
        entityId: prescription.id,
        details: { consultationId: consultation.id, itemsCount: 3 },
      },
    });
  }

  console.log('\n======================================================');
  console.log('✅ Seeding completed successfully!');
  console.log('======================================================');
  console.log('Default Credentials:');
  console.log('  Admin User  : admin@amrutam.co.in / Admin@123');
  console.log('  Doctor User : dr.rajesh.sharma@amrutam.co.in / Password@123');
  console.log('  Patient User: arjun.patel@example.com / Password@123');
  console.log('======================================================\n');
}

seed()
  .catch((err) => {
    console.error('Seeding error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
