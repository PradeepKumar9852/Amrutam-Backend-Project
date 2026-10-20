# Amrutam Telemedicine Backend - Security Checklist

This document details the security evaluation, defensive controls, verification status, and residual risks across the 10 mandated security domains for the Amrutam Telemedicine platform.

---

## 1. Authentication & Role-Based Authorization

| Check Item | Status | Verification & Implementation Evidence |
| :--- | :--- | :--- |
| **JWT Verification** | PASS | Handled in [`src/middlewares/authMiddleware.js`](../src/middlewares/authMiddleware.js). Tokens are verified using HMAC-SHA256 with `config.jwtSecret`. Expired and malformed tokens return `401 Unauthorized`. |
| **Role-Based Access Control (RBAC)** | PASS | Handled in [`src/middlewares/roleMiddleware.js`](../src/middlewares/roleMiddleware.js) using the `authorizeRoles('PATIENT' | 'DOCTOR' | 'ADMIN')` barrier. Disallowed roles return `403 Forbidden`. |
| **Real-Time Account Status Check** | PASS | `authMiddleware` checks `user.isActive` in the database on every authenticated request. If an admin deactivates an account, existing tokens are immediately blocked with `403 Forbidden`. |
| **Unsigned Token ("none" alg) Defense** | PASS | Verified in [`tests/security.test.js`](../tests/security.test.js); unsigned or algorithm-swapped tokens fail verification and return `401 Unauthorized`. |

---

## 2. Broken Access Control & IDOR Vulnerabilities

| Check Item | Status | Verification & Implementation Evidence |
| :--- | :--- | :--- |
| **Consultation Access Control** | PASS | In [`bookings.service.js`](../src/modules/bookings/bookings.service.js), `getBookingById` and `cancelBooking` verify that `booking.patient.userId === user.id || booking.doctor.userId === user.id || user.role === 'ADMIN'`. Arbitrary IDOR requests return `403 Forbidden`. |
| **Consultation Status Updates** | PASS | `updateBookingStatus` verifies that only the assigned doctor (`booking.doctor.userId === user.id`) or an `ADMIN` can change status. |
| **Prescription Access Control** | PASS | In [`prescriptions.service.js`](../src/modules/prescriptions/prescriptions.service.js), only the consultation patient, the prescribing doctor, or an admin can retrieve prescription data. Third parties receive `403 Forbidden`. |
| **Cross-Doctor Prescription Tampering** | PASS | `createPrescription` validates that `consultation.doctorId === doctor.id`. Unassigned doctors cannot prescribe for consultations they do not own (`403 Forbidden`). |
| **Doctor Availability Slot Protection** | PASS | In [`doctors.service.js`](../src/modules/doctors/doctors.service.js), `deleteAvailabilitySlot` verifies `slot.doctorId === doctor.id`. A doctor cannot delete another doctor's slots. |
| **Admin Route Isolation** | PASS | All routes under `/api/v1/admin/*` are shielded by `router.use(authenticate, authorizeRoles('ADMIN'))`. Non-admins receive `403 Forbidden`. |

---

## 3. Password Hashing & Token Handling

| Check Item | Status | Verification & Implementation Evidence |
| :--- | :--- | :--- |
| **Password Hashing** | PASS | Uses `bcryptjs` with salt round cost factor `12`. Passwords are never stored in plaintext. |
| **Timing Attack Mitigation on Login** | PASS | In [`auth.service.js`](../src/modules/auth/auth.service.js), when an unknown email is submitted, a constant-time dummy hash comparison is executed (`bcrypt.compare(password, DUMMY_HASH)`) before throwing `401 Unauthorized`. This prevents user enumeration via response timing differences. |
| **Uniform Error Messages** | PASS | Login failures return identical generic message: `"Invalid email or password"`, preventing account enumeration. |
| **Password Expiration & Expiry Config** | PASS | Configured via `config.jwtExpiresIn` (default 7 days). Stateless JWTs expire automatically. |

---

## 4. Input Validation & SQL / Query Safety

| Check Item | Status | Verification & Implementation Evidence |
| :--- | :--- | :--- |
| **SQL Injection Prevention** | PASS | Raw PostgreSQL queries in `bookings.service.js` use Prisma tagged template literals (`tx.$queryRaw`SELECT ... WHERE id = ${payload.slotId}::uuid FOR UPDATE``), which translate to parameterized SQL (`$1::uuid`). No dynamic string concatenation or `$queryRawUnsafe` is used. |
| **Strict Schema Validation (Zod)** | PASS | All incoming bodies and query parameters are parsed and validated with Zod schemas (`auth.validation.js`, `doctors.validation.js`, `bookings.validation.js`, `prescriptions.validation.js`, `admin.validation.js`). |
| **Malformed Parameter Safety** | PASS | In [`src/middlewares/errorHandler.js`](../src/middlewares/errorHandler.js), Prisma schema errors and `P2023` column format errors are caught cleanly and return `400 Bad Request` or `404 Not Found`, rather than unhandled 500 crashes. |
| **Malformed JSON Payload Rejection** | PASS | Catches `SyntaxError` with status 400 in `errorHandler.js` and returns `{ success: false, statusCode: 400, message: 'Invalid JSON payload received' }`. |

---

## 5. Rate Limiting & Secure HTTP Configuration

| Check Item | Status | Verification & Implementation Evidence |
| :--- | :--- | :--- |
| **Authentication Rate Limiting** | PASS | `authRateLimiter` restricts `/api/v1/auth/login` and registration routes to 10 requests per 15 minutes per IP to prevent brute-force attacks and credential stuffing. |
| **Global API Rate Limiting** | PASS | `apiRateLimiter` is mounted on `/api/v1` in `app.js` (300 requests per 15 minutes per IP) to guard against denial-of-service and scraping attacks. |
| **HTTP Security Headers (Helmet)** | PASS | `helmet()` is applied globally in `app.js` to set security headers including `X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Strict-Transport-Security`, and `hidePoweredBy`. CSP is adjusted to allow local Swagger UI rendering. |
| **Payload Size Restrictions** | PASS | Express body parser limits (`express.json` and `express.urlencoded`) are tightened to `1mb` to prevent memory exhaustion DoS via huge payloads. |
| **CORS Configuration** | PASS | Restricts allowed methods, credentials, and allowed headers (`Content-Type`, `Authorization`, `Idempotency-Key`, `x-idempotency-key`). |

---

## 6. Secret Management & Sensitive-Data Exposure

| Check Item | Status | Verification & Implementation Evidence |
| :--- | :--- | :--- |
| **Zero Password Exposure** | PASS | `passwordHash` is excluded at the service layer (`sanitizeUser`), stripped by `authMiddleware` before attaching to `req.user`, and verified across all test suites never to leak in API responses. |
| **Production JWT Secret Guard** | PASS | In [`src/config/env.js`](../src/config/env.js), startup fails with a critical error if `NODE_ENV === 'production'` and `JWT_SECRET` is unset, default, or fewer than 32 characters. |
| **Error Message Redaction** | PASS | In `errorHandler.js`, internal 500 error messages and stack traces are suppressed in production mode to prevent exposing internal server architecture or file paths. |

---

## 7. Booking Race Conditions & Double-Booking Prevention

| Check Item | Status | Verification & Implementation Evidence |
| :--- | :--- | :--- |
| **PostgreSQL Row-Level Locking** | PASS | `createBooking` executes `SELECT ... FROM availability_slots WHERE id = $1::uuid FOR UPDATE` inside `prisma.$transaction`. Simultaneous booking attempts for the same slot are serialized by PostgreSQL at the storage engine level. |
| **Database Unique Constraint** | PASS | The database schema enforces a unique index on `consultations.slot_id` (`consultations_slot_id_key`). Even if application logic failed, PostgreSQL rejects duplicate slot assignments. |
| **Slot Versioning & Status Check** | PASS | Slot `isBooked` flag is checked after row locking; if already booked, `409 Conflict` is returned and the version counter is incremented. |
| **Concurrent Race Condition Test** | PASS | Verified in [`tests/booking.test.js`](../tests/booking.test.js) with 5 simultaneous requests targeting the same slot: exactly 1 succeeds (201) and 4 are cleanly rejected (409 Conflict). |

---

## 8. Idempotency Behavior During Retries

| Check Item | Status | Verification & Implementation Evidence |
| :--- | :--- | :--- |
| **Idempotency Key Extraction** | PASS | Supports `Idempotency-Key` or `x-idempotency-key` HTTP headers or payload `idempotencyKey`. |
| **Deduplication Check** | PASS | Checks previous `BOOKING_CREATED` audit logs for the user matching the key. If found, returns existing booking with HTTP `200 OK` and `X-Idempotent-Replay: true`. |
| **Atomic Transaction Coupling** | PASS | The idempotency key is written inside the same atomic PostgreSQL transaction as the consultation creation. An incomplete transaction never leaves a dangling idempotency key. |

---

## 9. Transaction Boundaries & Error Handling

| Check Item | Status | Verification & Implementation Evidence |
| :--- | :--- | :--- |
| **Atomic Database Transactions** | PASS | Used across all multi-entity operations: booking creation (lock slot + update slot + create consultation + audit log), booking cancellation (update consultation + free slot + audit log), prescription issuance (create prescription + insert items + complete consultation + audit log), user registration (create user + create profile + audit log). |
| **Finite State Machine Validation** | PASS | Consultations adhere to strict lifecycle transitions: `PENDING -> CONFIRMED -> IN_PROGRESS -> COMPLETED`. Illegal jumps (e.g., `CONFIRMED -> COMPLETED` without starting or completed booking cancellation) return `400 Bad Request`. |
| **Centralized Error Handling** | PASS | `errorHandler.js` normalizes Zod errors (400), Prisma unique constraints P2002 (409), missing records P2025 (404), column format errors P2023 (400), and rate-limit errors (429). |

---

## 10. Audit Logging & Protection of Health Information (PHI)

| Check Item | Status | Verification & Implementation Evidence |
| :--- | :--- | :--- |
| **Comprehensive Event Logging** | PASS | Records audit entries for: `USER_REGISTERED`, `USER_LOGIN`, `SLOT_CREATED`, `SLOT_DELETED`, `BOOKING_CREATED`, `BOOKING_CANCELLED`, `CONSULTATION_COMPLETED`, `PRESCRIPTION_ISSUED`, `PAYMENT_PROCESSED`, and `PAYMENT_REFUNDED`. Captures actor `userId`, `ipAddress`, and `userAgent`. |
| **Confidentiality of Audit Records** | PASS | Audit log payloads never store plaintext passwords, password hashes, or full private medical notes. |
| **Protected Health Information (PHI) Privacy** | PASS | Patient symptoms summaries and doctor Ayurvedic diagnoses are restricted to the consultation's patient, the attending doctor, and authorized compliance admins. Arbitrary access is strictly blocked (`403 Forbidden`). |

---

## 11. Data Classification Matrix

To comply with healthcare security standards (DISHA, HIPAA, ISO 27799), data elements processed by the system are classified into 4 security tiers:

| Tier | Sensitivity | Data Entities & Fields | Security Controls |
| :--- | :--- | :--- | :--- |
| **Tier 1: Public** | Low | Doctor name, specialization, qualification, experience, verified status, consultation fee, public slot start/end times. | Public read endpoints; CDN & Redis caching; no auth required. |
| **Tier 2: Internal** | Medium | User account active status, system metrics, aggregate analytics, doctor verification records. | RBAC barrier (`ADMIN` only); TLS in transit; rate limiting. |
| **Tier 3: Confidential** | High | User email addresses, phone numbers, bcrypt password hashes, transaction IDs, payment currency and amounts. | Salted bcrypt (cost 12); password hashes stripped at service layer; masked in logs; AES-256 encrypted at rest in DB. |
| **Tier 4: Restricted / PHI** | Critical | Patient chief complaints, symptom summaries, clinical diagnosis, Ayurvedic medicine items, dosage, duration, diet/lifestyle pathya advice. | Strict IDOR barrier (accessible exclusively to owner patient and attending doctor); excluded from audit logs; SSL required. |

---

## 12. Key Rotation & Cryptographic Lifecycle Policy

| Cryptographic Asset | Algorithm & Parameters | Storage Mechanism | Rotation Schedule & Zero-Downtime Strategy |
| :--- | :--- | :--- | :--- |
| **JWT Signing Key** | HMAC-SHA256 (`HS256`), >= 256 bits | Environment variable `JWT_SECRET` / AWS Secrets Manager | 90 days. Dual-key verification window allows validating existing tokens with prior secret while signing new tokens with active secret. |
| **Database Encryption Key** | AES-256 (KMS CMK) | AWS KMS Customer Managed Key | Automated annual key rotation via AWS KMS with automatic re-encryption of underlying EBS storage. |
| **TLS/SSL Certificates** | RSA 2048-bit / ECDSA P-256 | AWS Certificate Manager (ACM) | Automated 60-day renewal through Let's Encrypt / AWS ACM with DNS-01 validation. |
| **Database User Passwords** | PostgreSQL SCRAM-SHA-256 | AWS Secrets Manager | 180 days. Automated rotation lambda updating RDS master password and ECS task environment variables. |

---

## 13. OWASP Top 10 (2021/2025) Mitigation Matrix

| OWASP Vulnerability | Risk | Defensive Controls Implemented in Amrutam Backend |
| :--- | :--- | :--- |
| **A01: Broken Access Control** | Critical | Strict IDOR verification on consultations, prescriptions, payments, and slot deletions. Centralized RBAC barrier (`authorizeRoles`). |
| **A02: Cryptographic Failures** | High | Salted bcrypt (cost 12), enforced HTTPS in production, strict JWT signature and algorithm verification, TLS in transit for DB and Redis. |
| **A03: Injection (SQLi / NoSQLi)** | Critical | Parameterized queries via Prisma tagged template literals (`tx.$queryRaw`SELECT ... WHERE id = ${payload.slotId}::uuid``). Zod schema input validation. |
| **A04: Insecure Design** | High | Multi-layer concurrency defense (pessimistic row locking + DB unique index) prevents double-booking. Idempotency on all mutation endpoints. |
| **A05: Security Misconfiguration**| Medium | Helmet HTTP security headers (nosniff, X-Frame-Options, HSTS), non-root Docker container (`USER node`), automated Prisma migration deployment. |
| **A06: Vulnerable Dependencies** | High | Pinned package versions with integrity hashes in `package-lock.json`, automated `npm audit` scanning in CI pipeline. |
| **A07: Identification & Auth** | Critical | Multi-step rate limiting (`authRateLimiter`), timing-attack mitigation with constant-time dummy comparisons, instant Redis token blacklisting. |
| **A08: Software & Data Integrity**| High | Atomic transactions (`$transaction`) prevent partial database states. Idempotency guarantees exactly-once processing during network dropouts. |
| **A09: Logging & Monitoring** | Medium | Correlated request tracking (`X-Request-Id`), structured JSON logging with recursive sensitive field redaction, Prometheus metrics endpoint. |
| **A10: Server-Side Request Forgery**| Low | External webhook URLs restricted to predefined endpoints with exponential backoff and payload signing. |

