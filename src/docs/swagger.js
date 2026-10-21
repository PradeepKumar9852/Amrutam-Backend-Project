/**
 * Amrutam Telemedicine Backend - OpenAPI 3.0 Specification
 */

const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Amrutam Telemedicine Backend API',
    version: '1.0.0',
    description:
      'Production-grade RESTful API for Amrutam Telemedicine and Ayurvedic Healthcare System. Supports patient-doctor appointments, atomic concurrency-safe bookings, consultation lifecycle, Ayurvedic prescriptions, role-based authorization (RBAC), and admin analytics.',
    contact: {
      name: 'Amrutam Engineering Team',
      url: 'https://amrutam.co.in',
    },
  },
  servers: [
    {
      url: 'http://localhost:5000',
      description: 'Local Development Server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT token obtained from /api/v1/auth/login or registration.',
      },
    },
    schemas: {
      ApiResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          statusCode: { type: 'integer', example: 200 },
          message: { type: 'string', example: 'Operation completed successfully' },
          data: { type: 'object' },
        },
      },
      ApiErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          statusCode: { type: 'integer', example: 400 },
          message: { type: 'string', example: 'Error description' },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string', example: 'email' },
                message: { type: 'string', example: 'Invalid email address format' },
              },
            },
          },
        },
      },
      RegisterPatientRequest: {
        type: 'object',
        required: ['email', 'password', 'firstName', 'lastName'],
        properties: {
          email: { type: 'string', format: 'email', example: 'aarav.sharma@example.com' },
          password: { type: 'string', minLength: 8, example: 'Password@123' },
          firstName: { type: 'string', example: 'Aarav' },
          lastName: { type: 'string', example: 'Sharma' },
          gender: { type: 'string', enum: ['MALE', 'FEMALE', 'OTHER'], example: 'MALE' },
          phoneNumber: { type: 'string', example: '+919876543210' },
          dateOfBirth: { type: 'string', format: 'date', example: '1995-06-15' },
        },
      },
      RegisterDoctorRequest: {
        type: 'object',
        required: ['email', 'password', 'firstName', 'lastName', 'specialization', 'qualification', 'licenseNumber'],
        properties: {
          email: { type: 'string', format: 'email', example: 'dr.priya.nair@amrutam.co.in' },
          password: { type: 'string', minLength: 8, example: 'Password@123' },
          firstName: { type: 'string', example: 'Priya' },
          lastName: { type: 'string', example: 'Nair' },
          specialization: { type: 'string', example: 'Ayurvedic Medicine & Panchakarma' },
          qualification: { type: 'string', example: 'BAMS, MD (Ayurveda)' },
          experienceYears: { type: 'integer', example: 9 },
          licenseNumber: { type: 'string', example: 'AYUR-DL-98234' },
          consultationFee: { type: 'number', example: 750 },
          bio: { type: 'string', example: 'Senior Ayurvedic physician specializing in lifestyle disorders.' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'aarav.sharma@example.com' },
          password: { type: 'string', example: 'Password@123' },
        },
      },
      CreateSlotRequest: {
        type: 'object',
        required: ['startTime', 'endTime'],
        properties: {
          startTime: { type: 'string', format: 'date-time', example: '2026-10-22T09:00:00.000Z' },
          endTime: { type: 'string', format: 'date-time', example: '2026-10-22T10:00:00.000Z' },
        },
      },
      CreateBookingRequest: {
        type: 'object',
        required: ['slotId'],
        properties: {
          slotId: { type: 'string', format: 'uuid', example: '58c89599-528f-43ea-a42e-be25585f67b5' },
          consultationType: { type: 'string', enum: ['VIDEO', 'AUDIO', 'CHAT'], default: 'VIDEO' },
          symptomsSummary: { type: 'string', example: 'Chronic acidity, joint pain, and sluggish digestion.' },
          idempotencyKey: { type: 'string', example: 'idemp-client-unique-key-1234' },
        },
      },
      CancelBookingRequest: {
        type: 'object',
        required: ['cancellationReason'],
        properties: {
          cancellationReason: { type: 'string', minLength: 3, example: 'Sudden schedule conflict. Rescheduling.' },
        },
      },
      UpdateStatusRequest: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'RESCHEDULED'], example: 'IN_PROGRESS' },
          notes: { type: 'string', example: 'Patient admitted into video consultation.' },
        },
      },
      PrescriptionItemInput: {
        type: 'object',
        required: ['medicineName', 'dosage', 'frequency', 'duration'],
        properties: {
          medicineName: { type: 'string', example: 'Ashwagandha Churna' },
          dosage: { type: 'string', example: '1 teaspoon (3g)' },
          frequency: { type: 'string', example: 'Twice daily after meals' },
          duration: { type: 'string', example: '30 days' },
          instructions: { type: 'string', example: 'Consume with warm milk or lukewarm water' },
        },
      },
      CreatePrescriptionRequest: {
        type: 'object',
        required: ['consultationId', 'diagnosis', 'items'],
        properties: {
          consultationId: { type: 'string', format: 'uuid', example: '49a8812c-bba8-4c6d-8809-ec199cc43f94' },
          diagnosis: { type: 'string', example: 'Vata-Pitta imbalance with Agnimandya' },
          notes: { type: 'string', example: 'Follow Sattvic diet. Avoid cold and fermented foods.' },
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/PrescriptionItemInput' },
          },
        },
      },
      VerifyDoctorRequest: {
        type: 'object',
        required: ['isVerified'],
        properties: {
          isVerified: { type: 'boolean', example: true },
        },
      },
      UserStatusRequest: {
        type: 'object',
        required: ['isActive'],
        properties: {
          isActive: { type: 'boolean', example: false },
        },
      },
      ProcessPaymentRequest: {
        type: 'object',
        required: ['consultationId'],
        properties: {
          consultationId: { type: 'string', format: 'uuid', example: '49a8812c-bba8-4c6d-8809-ec199cc43f94' },
          paymentMethod: { type: 'string', enum: ['UPI', 'CARD', 'NET_BANKING', 'WALLET', 'FAIL_SIMULATION'], default: 'UPI', example: 'UPI' },
          idempotencyKey: { type: 'string', example: 'idemp-pay-992384' },
          simulateFailure: { type: 'boolean', example: false, description: 'Simulate gateway decline scenario for testing and safe retry' },
        },
      },
      RefundPaymentRequest: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { type: 'string', minLength: 5, example: 'Patient requested cancellation prior to consultation window.' },
        },
      },
    },
  },

  paths: {
    '/': {
      get: {
        summary: 'Root Welcome Endpoint',
        tags: ['System'],
        responses: {
          200: {
            description: 'Returns API welcome status and links',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } },
          },
        },
      },
    },
    '/api/v1/health': {
      get: {
        summary: 'System Health Check & Database Diagnostic',
        tags: ['System'],
        responses: {
          200: {
            description: 'System operational status and live PostgreSQL ping latency',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } },
          },
        },
      },
    },
    '/api/v1/health/liveness': {
      get: {
        summary: 'Kubernetes Liveness Probe',
        tags: ['System'],
        description: 'Returns 200 UP indicating the Node.js process is active and responsive.',
        responses: {
          200: {
            description: 'Process is alive',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } },
          },
        },
      },
    },
    '/api/v1/health/readiness': {
      get: {
        summary: 'Kubernetes Readiness Probe',
        tags: ['System'],
        description: 'Verifies database connectivity. Returns 200 READY or 503 NOT_READY to control traffic routing.',
        responses: {
          200: {
            description: 'Database connected and service ready to accept traffic',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } },
          },
          503: {
            description: 'Database disconnected or degraded; pod should not receive traffic',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } },
          },
        },
      },
    },

    // AUTHENTICATION
    '/api/v1/auth/register/patient': {
      post: {
        summary: 'Register a Patient Account',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterPatientRequest' } } },
        },
        responses: {
          201: { description: 'Patient registered successfully; returns JWT token' },
          400: { description: 'Validation error (e.g. password too short)' },
          409: { description: 'Email or phone number already registered' },
        },
      },
    },
    '/api/v1/auth/register/doctor': {
      post: {
        summary: 'Register a Doctor Account (Pending verification)',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterDoctorRequest' } } },
        },
        responses: {
          201: { description: 'Doctor registered successfully; pending verification' },
          400: { description: 'Validation error' },
          409: { description: 'Email, phone, or license number already exists' },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        summary: 'Authenticate User & Obtain JWT Token',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } },
        },
        responses: {
          200: { description: 'Login successful with JWT Bearer token' },
          401: { description: 'Invalid email or password' },
          403: { description: 'Account deactivated' },
          429: { description: 'Too many authentication attempts (Rate limit exceeded)' },
        },
      },
    },
    '/api/v1/auth/me': {
      get: {
        summary: 'Get Current Authenticated User Profile',
        tags: ['Authentication'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'User profile retrieved successfully' },
          401: { description: 'Missing, invalid, or expired JWT token' },
        },
      },
    },
    '/api/v1/auth/profile': {
      put: {
        summary: 'Update Authenticated User Profile',
        tags: ['Authentication'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  firstName: { type: 'string', example: 'Aarav' },
                  lastName: { type: 'string', example: 'Sharma' },
                  phoneNumber: { type: 'string', example: '+919876543210' },
                  dateOfBirth: { type: 'string', format: 'date', example: '1995-06-15' },
                  gender: { type: 'string', enum: ['MALE', 'FEMALE', 'OTHER'] },
                  bloodGroup: { type: 'string', example: 'O+' },
                  emergencyContact: { type: 'string', example: '+919876500000' },
                  address: { type: 'string', example: '45 Ayurveda Lane, Rishikesh' },
                  bio: { type: 'string', example: 'Ayurvedic doctor notes' },
                  consultationFee: { type: 'number', example: 750 },
                  experienceYears: { type: 'integer', example: 8 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Profile updated successfully' },
          400: { description: 'Validation error' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/api/v1/auth/change-password': {
      put: {
        summary: 'Change User Password and Invalidate Existing Tokens',
        tags: ['Authentication'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['currentPassword', 'newPassword'],
                properties: {
                  currentPassword: { type: 'string', example: 'Password@123' },
                  newPassword: { type: 'string', minLength: 8, example: 'NewSecurePassword@123' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Password changed successfully. New tokens issued.' },
          400: { description: 'New password cannot be same as current' },
          401: { description: 'Incorrect current password' },
        },
      },
    },
    '/api/v1/auth/deactivate': {
      patch: {
        summary: 'Self Account Deactivation',
        tags: ['Authentication'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['password'],
                properties: {
                  password: { type: 'string', example: 'Password@123' },
                  reason: { type: 'string', example: 'No longer needed' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Account deactivated successfully' },
          401: { description: 'Incorrect password' },
        },
      },
    },
    '/api/v1/auth/mfa/setup': {
      post: {
        summary: 'Initiate MFA Setup for Privileged Account (RFC 6238 TOTP)',
        tags: ['Authentication - MFA'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Returns TOTP secret, otpauth URL, and 8 emergency backup codes' },
          400: { description: 'MFA already enabled' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/api/v1/auth/mfa/enable': {
      post: {
        summary: 'Verify 6-digit TOTP Code and Enable MFA',
        tags: ['Authentication - MFA'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token'],
                properties: {
                  token: { type: 'string', example: '123456' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'MFA successfully enabled' },
          400: { description: 'Invalid 6-digit verification code or expired session' },
        },
      },
    },
    '/api/v1/auth/mfa/verify-login': {
      post: {
        summary: 'Complete Login MFA Challenge with TOTP or Backup Recovery Code',
        tags: ['Authentication - MFA'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['tempToken', 'mfaCode'],
                properties: {
                  tempToken: { type: 'string', description: 'Ephemeral JWT token returned from initial login' },
                  mfaCode: { type: 'string', example: '123456', description: '6-digit TOTP code or backup code' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'MFA verified; returns full JWT access & refresh token pair' },
          401: { description: 'Invalid MFA verification code or session expired' },
        },
      },
    },
    '/api/v1/auth/mfa/disable': {
      post: {
        summary: 'Disable MFA with Password & TOTP/Recovery Code',
        tags: ['Authentication - MFA'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['password', 'token'],
                properties: {
                  password: { type: 'string', example: 'Password@123' },
                  token: { type: 'string', example: '123456' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'MFA disabled successfully' },
          401: { description: 'Invalid password or verification code' },
        },
      },
    },
    '/api/v1/auth/refresh': {
      post: {
        summary: 'Rotate and Refresh Access Token',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: {
                  refreshToken: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'New token pair issued; old refresh token invalidated' },
          401: { description: 'Invalid, revoked, or expired refresh token' },
        },
      },
    },
    '/api/v1/auth/revoke': {
      post: {
        summary: 'Explicitly Revoke Access or Refresh Token',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token'],
                properties: {
                  token: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Token revoked and added to Redis blacklist' },
        },
      },
    },
    '/api/v1/auth/logout': {
      post: {
        summary: 'Logout & Invalidate JWT Token (Redis Blacklist)',
        tags: ['Authentication'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Successfully logged out; token added to Redis blacklist' },
          401: { description: 'Missing or invalid authentication token' },
        },
      },
    },

    // DOCTORS & SLOTS
    '/api/v1/doctors': {
      get: {
        summary: 'Search & Filter Doctors',
        tags: ['Doctors'],
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Free-text search across name & specialization' },
          { name: 'specialization', in: 'query', schema: { type: 'string' }, description: 'Ayurvedic specialization filter' },
          { name: 'minFee', in: 'query', schema: { type: 'number' }, description: 'Minimum consultation fee' },
          { name: 'maxFee', in: 'query', schema: { type: 'number' }, description: 'Maximum consultation fee' },
          { name: 'minExperience', in: 'query', schema: { type: 'integer' }, description: 'Minimum years of experience' },
          { name: 'isVerified', in: 'query', schema: { type: 'boolean' }, description: 'Filter verified doctors' },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['experienceYears', 'consultationFee', 'createdAt', 'firstName'] } },
          { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          200: { description: 'Paginated list of doctors with matching criteria' },
        },
      },
    },
    '/api/v1/doctors/{id}': {
      get: {
        summary: 'Get Detailed Doctor Profile & Open Slots',
        tags: ['Doctors'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Doctor profile and upcoming availability slots' },
          404: { description: 'Doctor not found' },
        },
      },
    },
    '/api/v1/doctors/slots': {
      post: {
        summary: 'Create Availability Slot(s) for Doctor',
        tags: ['Doctors'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                oneOf: [
                  { $ref: '#/components/schemas/CreateSlotRequest' },
                  {
                    type: 'object',
                    properties: {
                      slots: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/CreateSlotRequest' },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
        responses: {
          201: { description: 'Availability slot(s) created successfully' },
          400: { description: 'End time before start time or slot in the past' },
          403: { description: 'Forbidden (DOCTOR role required)' },
          409: { description: 'Overlapping slot already exists for doctor' },
        },
      },
    },
    '/api/v1/doctors/{id}/slots': {
      get: {
        summary: 'Get Availability Slots for a Specific Doctor',
        tags: ['Doctors'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'isBooked', in: 'query', schema: { type: 'boolean' }, description: 'Filter by booked status (false for open slots)' },
          { name: 'startDate', in: 'query', schema: { type: 'string' } },
          { name: 'endDate', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Availability slots for doctor' },
          404: { description: 'Doctor not found' },
        },
      },
    },
    '/api/v1/doctors/slots/{slotId}': {
      delete: {
        summary: 'Delete Unbooked Availability Slot',
        tags: ['Doctors'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'slotId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Slot deleted successfully' },
          400: { description: 'Cannot delete a slot that is already booked' },
          403: { description: 'Forbidden (Can only delete own slot)' },
          404: { description: 'Slot not found' },
        },
      },
    },

    // BOOKINGS & APPOINTMENTS
    '/api/v1/bookings': {
      post: {
        summary: 'Book an Appointment (Concurrency-Safe with Idempotency)',
        tags: ['Bookings'],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: false,
            schema: { type: 'string' },
            description: 'Optional unique client key. Prevents duplicate booking on network retry.',
          },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateBookingRequest' } } },
        },
        responses: {
          201: { description: 'Appointment booked successfully with meeting link' },
          200: { description: 'Idempotent replay: returns existing booking' },
          400: { description: 'Slot in the past' },
          403: { description: 'Forbidden (PATIENT role required)' },
          409: { description: 'Conflict: Slot already booked by another user' },
        },
      },
      get: {
        summary: 'List Appointments for Authenticated User',
        tags: ['Bookings'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'RESCHEDULED'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          200: { description: 'Paginated appointments for current patient or doctor' },
        },
      },
    },
    '/api/v1/bookings/{id}': {
      get: {
        summary: 'Get Appointment Details by ID',
        tags: ['Bookings'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Booking details with doctor and slot info' },
          403: { description: 'Forbidden (Can only view own booking)' },
          404: { description: 'Booking not found' },
        },
      },
    },
    '/api/v1/bookings/{id}/cancel': {
      patch: {
        summary: 'Cancel an Appointment (Frees the Slot Atomically)',
        tags: ['Bookings'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CancelBookingRequest' } } },
        },
        responses: {
          200: { description: 'Appointment cancelled successfully; slot freed' },
          400: { description: 'Cannot cancel a COMPLETED or CANCELLED booking' },
          403: { description: 'Forbidden' },
          404: { description: 'Booking not found' },
        },
      },
    },
    '/api/v1/bookings/{id}/status': {
      patch: {
        summary: 'Update Consultation Lifecycle Status (Doctor or Admin)',
        tags: ['Bookings'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateStatusRequest' } } },
        },
        responses: {
          200: { description: 'Status updated successfully' },
          400: { description: 'Invalid status transition' },
          403: { description: 'Forbidden (Only assigned doctor or admin)' },
        },
      },
    },

    // CONSULTATIONS LIFECYCLE
    '/api/v1/consultations': {
      post: {
        summary: 'Schedule a Consultation (Patient Only)',
        tags: ['Consultations'],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: false,
            schema: { type: 'string' },
            description: 'Optional unique client key to guarantee exactly-once scheduling',
          },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateBookingRequest' } } },
        },
        responses: {
          201: { description: 'Consultation scheduled successfully' },
          200: { description: 'Idempotent replay: returns existing consultation' },
          400: { description: 'Slot is in the past or invalid' },
          403: { description: 'Forbidden (PATIENT role required)' },
          409: { description: 'Conflict: Slot already booked or key reuse conflict' },
        },
      },
      get: {
        summary: 'List Consultations for Authenticated User',
        tags: ['Consultations'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'RESCHEDULED'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          200: { description: 'Paginated consultations for patient or doctor' },
        },
      },
    },
    '/api/v1/consultations/{id}': {
      get: {
        summary: 'Get Consultation Details by ID',
        tags: ['Consultations'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Consultation record with doctor, patient, slot, and prescription' },
          403: { description: 'Forbidden (Authorized patient, doctor, or admin only)' },
          404: { description: 'Consultation not found' },
        },
      },
    },
    '/api/v1/consultations/{id}/cancel': {
      patch: {
        summary: 'Cancel Consultation & Release Slot',
        tags: ['Consultations'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CancelBookingRequest' } } },
        },
        responses: {
          200: { description: 'Consultation cancelled and slot released' },
          400: { description: 'Cannot cancel a COMPLETED or CANCELLED consultation' },
          403: { description: 'Forbidden (Authorized participant or admin only)' },
          404: { description: 'Consultation not found' },
        },
      },
    },
    '/api/v1/consultations/{id}/status': {
      patch: {
        summary: 'Update Consultation State (FSM: CONFIRMED -> IN_PROGRESS -> COMPLETED)',
        tags: ['Consultations'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateStatusRequest' } } },
        },
        responses: {
          200: { description: 'Consultation status updated' },
          400: { description: 'Invalid state machine transition' },
          403: { description: 'Forbidden (Assigned doctor or admin only)' },
          404: { description: 'Consultation not found' },
        },
      },
    },

    // PRESCRIPTIONS
    '/api/v1/prescriptions': {
      post: {
        summary: 'Issue Ayurvedic Prescription with Medicine Items',
        tags: ['Prescriptions'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreatePrescriptionRequest' } } },
        },
        responses: {
          201: { description: 'Prescription issued successfully; consultation marked COMPLETED' },
          400: { description: 'Consultation not IN_PROGRESS or COMPLETED' },
          403: { description: 'Forbidden (Only assigned doctor)' },
          409: { description: 'Prescription already exists for this consultation' },
        },
      },
      get: {
        summary: 'List Prescriptions for Authenticated User',
        tags: ['Prescriptions'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          200: { description: 'Paginated prescription history' },
        },
      },
    },
    '/api/v1/prescriptions/{id}': {
      get: {
        summary: 'Get Prescription Details by ID',
        tags: ['Prescriptions'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Prescription details with medicine items and advice' },
          403: { description: 'Forbidden (Health privacy: only patient or doctor)' },
          404: { description: 'Prescription not found' },
        },
      },
    },
    '/api/v1/prescriptions/consultation/{consultationId}': {
      get: {
        summary: 'Get Prescription for a Specific Consultation',
        tags: ['Prescriptions'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'consultationId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Prescription details' },
          403: { description: 'Forbidden' },
          404: { description: 'No prescription found for consultation' },
        },
      },
    },

    // ADMIN OPERATIONS
    '/api/v1/admin/analytics': {
      get: {
        summary: 'Get System Metrics, Breakdown, Booking Trends, & Gross Revenue',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'startDate', in: 'query', schema: { type: 'string' }, description: 'Filter by start date (YYYY-MM-DD)' },
          { name: 'endDate', in: 'query', schema: { type: 'string' }, description: 'Filter by end date (YYYY-MM-DD)' },
        ],
        responses: {
          200: { description: 'System analytics with booking trends and cancellation metrics' },
          403: { description: 'Forbidden (ADMIN only)' },
        },
      },
    },
    '/api/v1/analytics/overview': {
      get: {
        summary: 'Get Platform Analytics Overview (Admin)',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'startDate', in: 'query', schema: { type: 'string' }, description: 'Filter by start date (YYYY-MM-DD)' },
          { name: 'endDate', in: 'query', schema: { type: 'string' }, description: 'Filter by end date (YYYY-MM-DD)' },
        ],
        responses: {
          200: { description: 'Platform analytics summary' },
          403: { description: 'Forbidden (ADMIN only)' },
        },
      },
    },
    '/api/v1/audit/logs': {
      get: {
        summary: 'Query Audit Logs (Admin)',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'action', in: 'query', schema: { type: 'string' } },
          { name: 'entityType', in: 'query', schema: { type: 'string' } },
          { name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'startDate', in: 'query', schema: { type: 'string' } },
          { name: 'endDate', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: { description: 'Paginated audit trail' },
          403: { description: 'Forbidden (ADMIN only)' },
        },
      },
    },
    '/api/v1/admin/audit-logs': {
      get: {
        summary: 'Query & Filter Security and Business Audit Logs',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'action', in: 'query', schema: { type: 'string' }, description: 'Filter by action (e.g. BOOKING_CREATED, PRESCRIPTION_ISSUED)' },
          { name: 'entityType', in: 'query', schema: { type: 'string' } },
          { name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'startDate', in: 'query', schema: { type: 'string' } },
          { name: 'endDate', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: { description: 'Paginated audit trail' },
          403: { description: 'Forbidden (ADMIN only)' },
        },
      },
    },
    '/api/v1/admin/doctors/{id}/verify': {
      patch: {
        summary: 'Approve or Revoke Doctor Credential Verification',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/VerifyDoctorRequest' } } },
        },
        responses: {
          200: { description: 'Doctor verification updated' },
          403: { description: 'Forbidden (ADMIN only)' },
          404: { description: 'Doctor not found' },
        },
      },
    },
    '/api/v1/admin/users': {
      get: {
        summary: 'List & Search All Users (Admin Control Panel)',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'role', in: 'query', schema: { type: 'string', enum: ['ADMIN', 'DOCTOR', 'PATIENT'] } },
          { name: 'isActive', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: { description: 'Paginated user accounts' },
          403: { description: 'Forbidden (ADMIN only)' },
        },
      },
      post: {
        summary: 'Admin Creates a User Account',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                  phoneNumber: { type: 'string' },
                  role: { type: 'string', enum: ['ADMIN', 'DOCTOR', 'PATIENT'], default: 'PATIENT' },
                  isActive: { type: 'boolean', default: true },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'User account created' },
          409: { description: 'Conflict: email or phone already exists' },
        },
      },
    },
    '/api/v1/admin/users/{id}/status': {
      patch: {
        summary: 'Activate or Deactivate User Account',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UserStatusRequest' } } },
        },
        responses: {
          200: { description: 'User account status updated' },
          400: { description: 'Cannot deactivate own admin account' },
          403: { description: 'Forbidden (ADMIN only)' },
          404: { description: 'User not found' },
        },
      },
    },
    '/metrics': {
      get: {
        summary: 'Prometheus Plain-Text Metrics Exporter',
        tags: ['Observability'],
        responses: {
          200: {
            description: 'Prometheus metrics stream',
            content: { 'text/plain': { schema: { type: 'string' } } },
          },
        },
      },
    },
    '/api/v1/payments/process': {
      post: {
        summary: 'Process Consultation Payment (Concurrency-Safe with Idempotency)',
        tags: ['Payments'],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: false,
            schema: { type: 'string' },
            description: 'Optional unique client request key to guarantee exactly-once processing',
          },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ProcessPaymentRequest' } } },
        },
        responses: {
          201: { description: 'Payment processed successfully' },
          200: { description: 'Idempotent replay of previously completed payment' },
          400: { description: 'Invalid request or consultation cancelled' },
          403: { description: 'Forbidden (Patient only / not owner)' },
          404: { description: 'Consultation not found' },
        },
      },
    },
    '/api/v1/payments/consultation/{consultationId}': {
      get: {
        summary: 'Get Consultation Payment Receipt',
        tags: ['Payments'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'consultationId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Payment details retrieved successfully' },
          403: { description: 'Forbidden (Authorized Patient/Doctor/Admin only)' },
          404: { description: 'Payment or consultation not found' },
        },
      },
    },
    '/api/v1/payments/{id}/refund': {
      post: {
        summary: 'Refund Consultation Payment and Cancel Booking',
        tags: ['Payments'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RefundPaymentRequest' } } },
        },
        responses: {
          200: { description: 'Payment refunded successfully' },
          400: { description: 'Payment cannot be refunded (not in COMPLETED status)' },
          403: { description: 'Forbidden (DOCTOR or ADMIN only)' },
          404: { description: 'Payment not found' },
        },
      },
    },
  },
};

module.exports = swaggerSpec;

