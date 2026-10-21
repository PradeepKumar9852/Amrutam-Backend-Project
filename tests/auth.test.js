const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const config = require('../src/config/env');
const { prisma } = require('../src/config/prisma');
const { generateTotp } = require('../src/utils/mfa');

describe('Authentication, MFA & User Management Comprehensive Test Suite', () => {
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
  let adminToken;
  let adminUserId;

  beforeAll(async () => {
    // Seed an initial Admin user for RBAC verification
    const bcrypt = require('bcryptjs');
    const adminPasswordHash = await bcrypt.hash('AdminPassword@123', 12);
    const admin = await prisma.user.create({
      data: {
        email: `admin_${timestamp}@amrutam.co.in`,
        passwordHash: adminPasswordHash,
        role: 'ADMIN',
        isActive: true,
      },
    });
    adminUserId = admin.id;

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: `admin_${timestamp}@amrutam.co.in`,
        password: 'AdminPassword@123',
      });
    adminToken = res.body.data.token;
  });

  afterAll(async () => {
    try {
      await prisma.auditLog.deleteMany({
        where: { user: { email: { contains: `${timestamp}` } } },
      });
      await prisma.patientProfile.deleteMany({
        where: { user: { email: { contains: `${timestamp}` } } },
      });
      await prisma.doctorProfile.deleteMany({
        where: { user: { email: { contains: `${timestamp}` } } },
      });
      await prisma.user.deleteMany({
        where: { email: { contains: `${timestamp}` } },
      });
    } catch (e) {
      // Ignore cleanup error
    }
    const { closeRedis } = require('../src/config/redis');
    await closeRedis();
    await prisma.$disconnect();
  });

  // =========================================================================
  // 1. REGISTRATION TESTS & ROLE ESCALATION DEFENSE
  // =========================================================================
  describe('Registration & Role Escalation Defense', () => {
    it('should successfully register a patient and return 201 with JWT', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register/patient')
        .send(testPatient);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(testPatient.email.toLowerCase());
      expect(res.body.data.user.role).toBe('PATIENT');
      expect(res.body.data.user.patientProfile.firstName).toBe(testPatient.firstName);
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(res.body.data.token).toBeDefined();

      patientToken = res.body.data.token;
    });

    it('should prevent role escalation: ignoring any role parameter in patient registration', async () => {
      const escalationPayload = {
        email: `escalate_pat_${timestamp}@example.com`,
        password: 'Password@123',
        firstName: 'Hacker',
        lastName: 'Patient',
        role: 'ADMIN', // Malicious attempt to escalate privileges
      };

      const res = await request(app)
        .post('/api/v1/auth/register/patient')
        .send(escalationPayload);

      expect(res.status).toBe(201);
      expect(res.body.data.user.role).toBe('PATIENT'); // Must remain PATIENT
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

    it('should successfully register a doctor with pending verification (isVerified=false)', async () => {
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

    it('should prevent doctor role escalation: ignoring any role parameter', async () => {
      const escalationDoc = {
        email: `escalate_doc_${timestamp}@example.com`,
        password: 'Password@123',
        firstName: 'Dr. Hacker',
        lastName: 'Attacker',
        specialization: 'Ayurveda',
        qualification: 'BAMS',
        licenseNumber: `ESC-LIC-${timestamp}`,
        role: 'ADMIN',
      };

      const res = await request(app)
        .post('/api/v1/auth/register/doctor')
        .send(escalationDoc);

      expect(res.status).toBe(201);
      expect(res.body.data.user.role).toBe('DOCTOR');
    });
  });

  // =========================================================================
  // 2. LOGIN & CREDENTIAL VALIDATION TESTS
  // =========================================================================
  describe('Login & Credential Security', () => {
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

  // =========================================================================
  // 3. AUTHENTICATION & TOKEN VALIDATION TESTS
  // =========================================================================
  describe('Token Expiry & Authentication Enforcement', () => {
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
      const expiredToken = jwt.sign(
        { sub: 'random-uuid', email: 'test@example.com', role: 'PATIENT', type: 'ACCESS' },
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

    it('should reject refresh tokens used directly as access Bearer tokens (401 Unauthorized)', async () => {
      const refreshToken = jwt.sign(
        { sub: adminUserId, email: 'admin@example.com', role: 'ADMIN', type: 'REFRESH' },
        config.jwtSecret,
        { expiresIn: '7d' }
      );

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${refreshToken}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/Access token required/i);
    });
  });

  // =========================================================================
  // 4. ROLE-BASED ACCESS CONTROL (RBAC) TESTS
  // =========================================================================
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

    it('should allow ADMIN role to access admin-only route (200 OK)', async () => {
      const res = await request(app)
        .get('/api/v1/auth/admin-only')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/Admin Control Panel/i);
    });

    it('should forbid PATIENT and DOCTOR from accessing admin-only route (403 Forbidden)', async () => {
      const resPatient = await request(app)
        .get('/api/v1/auth/admin-only')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(resPatient.status).toBe(403);

      const resDoctor = await request(app)
        .get('/api/v1/auth/admin-only')
        .set('Authorization', `Bearer ${doctorToken}`);
      expect(resDoctor.status).toBe(403);
    });
  });

  // =========================================================================
  // 5. REFRESH TOKEN ROTATION & REVOCATION LIFECYCLE
  // =========================================================================
  describe('Refresh Token Rotation & Revocation Lifecycle', () => {
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

    it('should successfully refresh access token and return rotated refresh token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: currentRefreshToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(res.body.data.refreshToken).not.toBe(currentRefreshToken);

      currentRefreshToken = res.body.data.refreshToken;
    });

    it('should reject already used/rotated refresh token (replay attack prevention)', async () => {
      // Use the old token which has been blacklisted
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: currentRefreshToken });

      expect(res.status).toBe(200); // This succeeds and rotates

      // Replay the now-rotated token
      const replayRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: currentRefreshToken });

      expect(replayRes.status).toBe(401);
      expect(replayRes.body.success).toBe(false);
      expect(replayRes.body.message).toMatch(/revoked/i);
    });

    it('should support explicit token revocation endpoint POST /api/v1/auth/revoke', async () => {
      // Obtain a new token
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testPatient.email,
          password: testPatient.password,
        });
      const tokenToRevoke = loginRes.body.data.token;

      // Revoke the token explicitly
      const revokeRes = await request(app)
        .post('/api/v1/auth/revoke')
        .send({ token: tokenToRevoke });

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.data.revoked).toBe(true);

      // Verify the token is now rejected on protected endpoints
      const checkRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tokenToRevoke}`);

      expect(checkRes.status).toBe(401);
      expect(checkRes.body.message).toMatch(/revoked/i);
    });

    it('should revoke access token upon POST /api/v1/auth/logout', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testDoctor.email,
          password: testDoctor.password,
        });
      const activeDocToken = loginRes.body.data.token;

      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${activeDocToken}`)
        .send({ refreshToken: loginRes.body.data.refreshToken });

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.message).toMatch(/Successfully logged out/i);

      // Verify subsequent request with that token is rejected
      const rejectedRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${activeDocToken}`);

      expect(rejectedRes.status).toBe(401);
      expect(rejectedRes.body.message).toMatch(/revoked/i);
    });
  });

  // =========================================================================
  // 6. USER PROFILE & PASSWORD CHANGE MANAGEMENT
  // =========================================================================
  describe('User Profile & Password Change Lifecycle', () => {
    it('should allow patient to update their profile details via PUT /api/v1/auth/profile', async () => {
      const res = await request(app)
        .put('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          firstName: 'Aarav Updated',
          bloodGroup: 'O+',
          address: '45 Ayurveda Lane, Rishikesh, Uttarakhand',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.patientProfile.firstName).toBe('Aarav Updated');
      expect(res.body.data.patientProfile.bloodGroup).toBe('O+');
      expect(res.body.data.patientProfile.address).toContain('Rishikesh');
    });

    it('should prevent role escalation during profile update', async () => {
      const res = await request(app)
        .put('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          role: 'ADMIN', // Tamper attempt
        });

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe('PATIENT'); // Never altered
    });

    it('should reject password change with incorrect current password', async () => {
      const res = await request(app)
        .put('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          currentPassword: 'WrongPassword@123',
          newPassword: 'BrandNewPassword@123',
        });

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/Incorrect current password/i);
    });

    it('should reject password change if new password is same as old password', async () => {
      const res = await request(app)
        .put('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          currentPassword: testPatient.password,
          newPassword: testPatient.password,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/cannot be the same/i);
    });

    it('should successfully change password and invalidate previous session token', async () => {
      const res = await request(app)
        .put('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          currentPassword: testPatient.password,
          newPassword: 'BrandNewPassword@123',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('token');

      // Old token should now be blacklisted
      const oldTokenCheck = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(oldTokenCheck.status).toBe(401);

      // Log in with new password
      const newLoginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testPatient.email,
          password: 'BrandNewPassword@123',
        });

      expect(newLoginRes.status).toBe(200);
      expect(newLoginRes.body.success).toBe(true);
      patientToken = newLoginRes.body.data.token;
      testPatient.password = 'BrandNewPassword@123';
    });
  });

  // =========================================================================
  // 7. MULTI-FACTOR AUTHENTICATION (MFA) FOR PRIVILEGED ACCOUNTS
  // =========================================================================
  describe('Multi-Factor Authentication (MFA) Lifecycle', () => {
    let privilegedDoctorToken;
    let mfaSecret;
    let backupRecoveryCodes;
    const privilegedDoctor = {
      email: `priv_doc_${timestamp}@amrutam.co.in`,
      password: 'PrivDoctorPassword@123',
      firstName: 'Dr. Vikram',
      lastName: 'Vaidya',
      specialization: 'Ayurvedic Surgery',
      qualification: 'BAMS, MS (Shalya)',
      licenseNumber: `MFA-LIC-${timestamp}`,
      consultationFee: 800,
    };

    beforeAll(async () => {
      const docRes = await request(app)
        .post('/api/v1/auth/register/doctor')
        .send(privilegedDoctor);
      privilegedDoctorToken = docRes.body.data.token;
    });

    it('should initiate MFA setup and generate secret, otpauthUrl, and 8 backup codes', async () => {
      const res = await request(app)
        .post('/api/v1/auth/mfa/setup')
        .set('Authorization', `Bearer ${privilegedDoctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('secret');
      expect(res.body.data).toHaveProperty('otpauthUrl');
      expect(res.body.data).toHaveProperty('backupCodes');
      expect(res.body.data.backupCodes.length).toBe(8);
      expect(res.body.data.otpauthUrl).toMatch(/otpauth:\/\/totp/i);

      mfaSecret = res.body.data.secret;
      backupRecoveryCodes = res.body.data.backupCodes;
    });

    it('should reject MFA enable attempt with invalid 6-digit TOTP code (400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/mfa/enable')
        .set('Authorization', `Bearer ${privilegedDoctorToken}`)
        .send({ token: '000000' }); // Invalid code

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Invalid 6-digit verification code/i);
    });

    it('should successfully enable MFA when providing valid RFC 6238 TOTP code', async () => {
      const validTotp = generateTotp(mfaSecret);

      const res = await request(app)
        .post('/api/v1/auth/mfa/enable')
        .set('Authorization', `Bearer ${privilegedDoctorToken}`)
        .send({ token: validTotp });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.mfaEnabled).toBe(true);

      // Verify profile confirms MFA is enabled and secrets are not leaked
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${privilegedDoctorToken}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.data.mfaEnabled).toBe(true);
      expect(meRes.body.data.mfaSecret).toBeUndefined();
      expect(meRes.body.data.mfaBackupCodes).toBeUndefined();
    });

    it('should reject subsequent MFA setup when MFA is already enabled', async () => {
      const res = await request(app)
        .post('/api/v1/auth/mfa/setup')
        .set('Authorization', `Bearer ${privilegedDoctorToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already enabled/i);
    });

    it('should trigger MFA challenge on login when MFA is enabled', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: privilegedDoctor.email,
          password: privilegedDoctor.password,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.mfaRequired).toBe(true);
      expect(res.body.data).toHaveProperty('tempToken');
      expect(res.body.data.token).toBeUndefined(); // Access token is withheld!
    });

    it('should prevent temp MFA challenge tokens from accessing protected routes', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: privilegedDoctor.email,
          password: privilegedDoctor.password,
        });
      const tempToken = loginRes.body.data.tempToken;

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tempToken}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/Access token required/i);
    });

    it('should reject invalid code in POST /api/v1/auth/mfa/verify-login', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: privilegedDoctor.email,
          password: privilegedDoctor.password,
        });
      const tempToken = loginRes.body.data.tempToken;

      const res = await request(app)
        .post('/api/v1/auth/mfa/verify-login')
        .send({
          tempToken,
          mfaCode: '999999',
        });

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/Invalid MFA verification code/i);
    });

    it('should successfully complete login challenge with valid TOTP code', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: privilegedDoctor.email,
          password: privilegedDoctor.password,
        });
      const tempToken = loginRes.body.data.tempToken;
      const validTotp = generateTotp(mfaSecret);

      const verifyRes = await request(app)
        .post('/api/v1/auth/mfa/verify-login')
        .send({
          tempToken,
          mfaCode: validTotp,
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.data).toHaveProperty('token');
      expect(verifyRes.body.data).toHaveProperty('refreshToken');
      expect(verifyRes.body.data.user.email).toBe(privilegedDoctor.email.toLowerCase());
    });

    it('should successfully authenticate using emergency backup recovery code and burn it', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: privilegedDoctor.email,
          password: privilegedDoctor.password,
        });
      const tempToken = loginRes.body.data.tempToken;
      const singleUseCode = backupRecoveryCodes[0];

      // Use the emergency code
      const verifyRes = await request(app)
        .post('/api/v1/auth/mfa/verify-login')
        .send({
          tempToken,
          mfaCode: singleUseCode,
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data).toHaveProperty('token');

      // Attempt to reuse the same backup recovery code (should fail: single-use)
      const reuseLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: privilegedDoctor.email,
          password: privilegedDoctor.password,
        });
      const reuseTemp = reuseLogin.body.data.tempToken;

      const reuseRes = await request(app)
        .post('/api/v1/auth/mfa/verify-login')
        .send({
          tempToken: reuseTemp,
          mfaCode: singleUseCode,
        });

      expect(reuseRes.status).toBe(401);
      expect(reuseRes.body.message).toMatch(/Invalid MFA verification code/i);
    });

    it('should successfully disable MFA with password and valid TOTP code', async () => {
      const validTotp = generateTotp(mfaSecret);

      const disableRes = await request(app)
        .post('/api/v1/auth/mfa/disable')
        .set('Authorization', `Bearer ${privilegedDoctorToken}`)
        .send({
          password: privilegedDoctor.password,
          token: validTotp,
        });

      expect(disableRes.status).toBe(200);
      expect(disableRes.body.data.mfaEnabled).toBe(false);

      // Verify that login now does not require MFA
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: privilegedDoctor.email,
          password: privilegedDoctor.password,
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.mfaRequired).toBeUndefined();
      expect(loginRes.body.data.token).toBeDefined();
    });
  });

  // =========================================================================
  // 8. SELF ACCOUNT DEACTIVATION TESTS
  // =========================================================================
  describe('Self Account Deactivation', () => {
    let userToDeactivateToken;
    const deactUser = {
      email: `deact_user_${timestamp}@example.com`,
      password: 'Password@123',
      firstName: 'Self',
      lastName: 'Deactivator',
    };

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/auth/register/patient')
        .send(deactUser);
      userToDeactivateToken = res.body.data.token;
    });

    it('should reject deactivation with incorrect password', async () => {
      const res = await request(app)
        .patch('/api/v1/auth/deactivate')
        .set('Authorization', `Bearer ${userToDeactivateToken}`)
        .send({ password: 'WrongPassword@123' });

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/Incorrect password/i);
    });

    it('should successfully deactivate account with correct password and blacklist token', async () => {
      const res = await request(app)
        .patch('/api/v1/auth/deactivate')
        .set('Authorization', `Bearer ${userToDeactivateToken}`)
        .send({ password: deactUser.password });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/deactivated successfully/i);

      // Subsequent request with the token is immediately blocked
      const checkRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${userToDeactivateToken}`);

      expect(checkRes.status).toBe(401); // Revoked

      // Subsequent login is blocked with 403 Forbidden
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: deactUser.email,
          password: deactUser.password,
        });

      expect(loginRes.status).toBe(403);
      expect(loginRes.body.message).toMatch(/disabled/i);
    });
  });

  // =========================================================================
  // 9. ADMIN USER MANAGEMENT & AUDIT CONTROL
  // =========================================================================
  describe('Admin User Management & Creation', () => {
    it('should allow admin to list users with pagination and role filters', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users?role=PATIENT&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.every((u) => u.role === 'PATIENT')).toBe(true);
    });

    it('should allow admin to create a new user with privileged role', async () => {
      const newAdminPayload = {
        email: `new_admin_${timestamp}@amrutam.co.in`,
        password: 'SecureAdminPassword@123',
        role: 'ADMIN',
      };

      const res = await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newAdminPayload);

      expect(res.status).toBe(201);
      expect(res.body.data.role).toBe('ADMIN');
      expect(res.body.data.email).toBe(newAdminPayload.email.toLowerCase());
    });

    it('should forbid non-admin from creating users via admin endpoint', async () => {
      const res = await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          email: `unauthorized_admin_${timestamp}@amrutam.co.in`,
          password: 'Password@123',
          role: 'ADMIN',
        });

      expect(res.status).toBe(403);
    });
  });
});
