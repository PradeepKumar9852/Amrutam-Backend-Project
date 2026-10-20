const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const config = require('../src/config/env');
const { prisma } = require('../src/config/prisma');

describe('Authentication & Role-Based Authorization Tests', () => {
  const timestamp = Date.now();
  const testPatient = {
    email: `patient_${timestamp}@example.com`,
    password: 'Password@123',
    firstName: 'Aarav',
    lastName: 'Sharma',
    phoneNumber: `+9198765${Math.floor(10000 + Math.random() * 90000)}`,
    gender: 'MALE',
  };

  const testDoctor = {
    email: `doctor_${timestamp}@example.com`,
    password: 'Password@123',
    firstName: 'Dr. Priya',
    lastName: 'Nair',
    phoneNumber: `+9198766${Math.floor(10000 + Math.random() * 90000)}`,
    specialization: 'Ayurvedic Medicine',
    qualification: 'BAMS, MD (Ayurveda)',
    experienceYears: 8,
    licenseNumber: `AYUR-${timestamp}`,
    consultationFee: 500,
  };

  let patientToken;
  let doctorToken;

  afterAll(async () => {
    // Clean up test data created during the test run
    try {
      await prisma.user.deleteMany({
        where: {
          email: {
            in: [testPatient.email, testDoctor.email],
          },
        },
      });
    } catch (e) {
      // Ignore cleanup error if records already deleted
    }
    await prisma.$disconnect();
  });

  // 1. REGISTRATION TESTS
  describe('POST /api/v1/auth/register/patient', () => {
    it('should successfully register a patient and return 201 with JWT', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register/patient')
        .send(testPatient);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(testPatient.email.toLowerCase());
      expect(res.body.data.user.role).toBe('PATIENT');
      expect(res.body.data.user.patientProfile.firstName).toBe(testPatient.firstName);
      expect(res.body.data.user.passwordHash).toBeUndefined(); // Never expose password hash
      expect(res.body.data.token).toBeDefined();

      patientToken = res.body.data.token;
    });

    it('should reject registration if email is already taken (409 Conflict)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register/patient')
        .send(testPatient);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/already exists/i);
    });

    it('should reject registration if password is shorter than 8 characters (400 Validation Error)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register/patient')
        .send({
          ...testPatient,
          email: `short_pw_${timestamp}@example.com`,
          password: 'short',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Validation Error');
    });
  });

  describe('POST /api/v1/auth/register/doctor', () => {
    it('should successfully register a doctor with license number and pending verification', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register/doctor')
        .send(testDoctor);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(testDoctor.email.toLowerCase());
      expect(res.body.data.user.role).toBe('DOCTOR');
      expect(res.body.data.user.doctorProfile.licenseNumber).toBe(testDoctor.licenseNumber);
      expect(res.body.data.user.doctorProfile.isVerified).toBe(false);
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(res.body.data.token).toBeDefined();

      doctorToken = res.body.data.token;
    });
  });

  // 2. LOGIN TESTS
  describe('POST /api/v1/auth/login', () => {
    it('should successfully log in with valid credentials and return JWT', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testPatient.email,
          password: testPatient.password,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe(testPatient.email.toLowerCase());
      expect(res.body.data.user.passwordHash).toBeUndefined();
    });

    it('should reject login with wrong password (401 Unauthorized)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testPatient.email,
          password: 'WrongPassword@123',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid email or password');
    });

    it('should reject login with non-existent email (401 Unauthorized)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: `nobody_${timestamp}@example.com`,
          password: 'Password@123',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid email or password');
    });
  });

  // 3. AUTHENTICATION MIDDLEWARE & TOKEN VALIDATION TESTS
  describe('GET /api/v1/auth/me (Protected Route)', () => {
    it('should successfully return profile with valid Bearer token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(testPatient.email.toLowerCase());
      expect(res.body.data.patientProfile.firstName).toBe(testPatient.firstName);
    });

    it('should reject request when Authorization header is missing (401 Unauthorized)', async () => {
      const res = await request(app).get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Authentication required/i);
    });

    it('should reject request when token is malformed or invalid (401 Unauthorized)', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid.token.payload');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Invalid authentication token/i);
    });

    it('should reject request when token has expired (401 Unauthorized)', async () => {
      // Create an explicitly expired token
      const expiredToken = jwt.sign(
        { sub: 'random-uuid', email: 'test@example.com', role: 'PATIENT' },
        config.jwtSecret,
        { expiresIn: '-1s' }
      );

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/expired/i);
    });
  });

  // 4. ROLE-BASED ACCESS CONTROL (RBAC) TESTS
  describe('Role-Based Access Control', () => {
    it('should allow DOCTOR role to access doctor-only route (200 OK)', async () => {
      const res = await request(app)
        .get('/api/v1/auth/doctor-only')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/Doctor Portal/i);
    });

    it('should forbid PATIENT role from accessing doctor-only route (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/auth/doctor-only')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Forbidden: Role 'PATIENT' is not authorized/i);
    });

    it('should forbid both PATIENT and DOCTOR from accessing admin-only route (403 Forbidden)', async () => {
      const resPatient = await request(app)
        .get('/api/v1/auth/admin-only')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(resPatient.status).toBe(403);
      expect(resPatient.body.success).toBe(false);

      const resDoctor = await request(app)
        .get('/api/v1/auth/admin-only')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(resDoctor.status).toBe(403);
      expect(resDoctor.body.success).toBe(false);
    });
  });

  // 5. REFRESH TOKEN ROTATION TESTS
  describe('Refresh Token Rotation', () => {
    let currentRefreshToken;

    it('should return a valid refreshToken on login', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testPatient.email,
          password: testPatient.password,
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('refreshToken');
      currentRefreshToken = res.body.data.refreshToken;
    });


    it('should successfully refresh access token and return new rotated refresh token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: currentRefreshToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(res.body.data.refreshToken).not.toBe(currentRefreshToken);
    });

    it('should reject already used/rotated refresh token (replay attack prevention)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: currentRefreshToken });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});

