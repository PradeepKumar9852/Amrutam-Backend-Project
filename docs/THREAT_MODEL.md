# Amrutam Telemedicine Backend - Threat Model

## 1. System Overview & Scope
The Amrutam Telemedicine Backend provides healthcare consultation scheduling, tele-consultation room allocation, and digital Ayurvedic prescription issuance. Because the platform processes sensitive Protected Health Information (PHI) and handles doctor credentials and availability, rigorous threat modeling is required.

- **Primary Assets**:
  - Patient Protected Health Information (PHI): Medical symptoms, diagnoses, Ayurvedic treatment regimens.
  - Doctor Credentials & Professional Identity: Medical license numbers, verification statuses.
  - Appointment Integrity: Consultation availability slots, booking references, video call room links.
  - User Credentials: Email addresses, phone numbers, bcrypt password hashes.
  - Financial Data: Consultation fee transactions and gross platform revenue metrics.

---

## 2. STRIDE Threat Analysis

### S — Spoofing Identity
| Threat Description | Impact | Defensive Controls Implemented | Residual Risk |
| :--- | :--- | :--- | :--- |
| **Attacker forges JWT tokens** to impersonate doctors or system administrators. | High | Cryptographically signed using HMAC-SHA256 (`HS256`) with secret validated at startup. Tokens lacking valid signatures or containing `"alg": "none"` are rejected with `401 Unauthorized`. | If `JWT_SECRET` is leaked from host environment, attackers could mint tokens. Mitigation: Secret rotation and KMS integration in production. |
| **Attacker uses brute-force password guessing** against patient or doctor accounts. | High | `authRateLimiter` restricts authentication requests to 10 attempts per 15 minutes per IP. Passwords hashed using `bcrypt` (cost 12). | Distributed credential stuffing across broad botnet IP ranges. Recommended: Multi-factor authentication (MFA/TOTP). |
| **Timing-based user enumeration** during login. | Medium | Fixed: `login` performs a constant-time dummy `bcrypt.compare` against a precalculated hash when an email does not exist, equalizing response times. | Negligible timing variance in DB lookup. |

---

### T — Tampering with Data
| Threat Description | Impact | Defensive Controls Implemented | Residual Risk |
| :--- | :--- | :--- | :--- |
| **Tampering with consultation status** (e.g. prematurely completing consultations without doctor authorization). | High | Strict Finite State Machine in `bookings.service.js`: transitions restricted to `PENDING -> CONFIRMED -> IN_PROGRESS -> COMPLETED`. Only assigned doctor or admin can transition status. | None; state transitions are verified in application logic and atomic transactions. |
| **Issuing fraudulent prescriptions** under another doctor's license. | High | `createPrescription` verifies doctor identity and enforces `consultation.doctorId === doctor.id`. Unrelated doctors receive `403 Forbidden`. | Malicious insider doctor with compromised account. Mitigation: Administrative audit logs. |
| **Altering doctor verification status without authorization.** | High | `verifyDoctor` route `/api/v1/admin/doctors/:id/verify` is restricted exclusively to the `ADMIN` role. | Compromise of an admin credential. Mitigation: Strict admin IP whitelisting or SSO. |

---

### R — Repudiation
| Threat Description | Impact | Defensive Controls Implemented | Residual Risk |
| :--- | :--- | :--- | :--- |
| **A user denies cancelling an appointment or booking a slot.** | Medium | Complete `audit_logs` table records actor `userId`, `action` (`BOOKING_CREATED`, `BOOKING_CANCELLED`), `entityId`, timestamp, `ipAddress`, and `userAgent`. | Audit log table tampering if database superuser is compromised. Mitigation: Append-only write-once audit log archival (e.g. AWS CloudWatch/S3 Object Lock). |
| **A doctor denies issuing a specific Ayurvedic prescription.** | High | Prescriptions link to the unique `doctorId` and `consultationId`, with date-time stamps and a corresponding `PRESCRIPTION_ISSUED` audit log. | None within application boundary. |

---

### I — Information Disclosure
| Threat Description | Impact | Defensive Controls Implemented | Residual Risk |
| :--- | :--- | :--- | :--- |
| **Insecure Direct Object Reference (IDOR) on Bookings & Prescriptions.** | Critical | Strict user ownership checks: `patient.userId === user.id || doctor.userId === user.id || role === 'ADMIN'`. Cross-user viewing attempts return `403 Forbidden`. | None; checked consistently before record retrieval. |
| **Leakage of password hashes or sensitive profile tokens.** | High | Password hashes are stripped at the service layer (`sanitizeUser`) and excluded by `authMiddleware` before `req.user` is attached. | None. Verified by automated security test assertions. |
| **Internal database schema leakage via malformed queries/UUIDs.** | Medium | `errorHandler.js` normalizes Prisma `P2023` and `PrismaClientValidationError` into clean `400 Bad Request` responses, preventing internal schema or stack dumps to clients. In production, unhandled 500 error messages are redacted. | None. Stack traces enabled only in development (`isDevelopment: true`). |

---

### D — Denial of Service (DoS)
| Threat Description | Impact | Defensive Controls Implemented | Residual Risk |
| :--- | :--- | :--- | :--- |
| **Double-booking race conditions causing state inconsistency.** | High | Concurrency controlled using PostgreSQL pessimistic row locking (`SELECT ... FOR UPDATE`) within `prisma.$transaction`. Database unique index `consultations_slot_id_key` acts as secondary storage shield. | Lock wait timeouts under massive concurrent spikes. Mitigation: Slot availability caching and optimistic concurrency fallbacks if needed. |
| **Memory exhaustion through oversized request bodies.** | High | Express body parsers (`express.json` and `express.urlencoded`) limits restricted to `1mb` (tightened from 10mb). | Multi-part file upload attacks (currently not implemented). |
| **API flooding and resource scraping.** | Medium | Global `apiRateLimiter` restricts client traffic to 300 requests per 15-minute window. | Large-scale distributed DDoS requires reverse-proxy / CDN mitigation (Cloudflare / AWS Shield). |

---

### E — Elevation of Privilege
| Threat Description | Impact | Defensive Controls Implemented | Residual Risk |
| :--- | :--- | :--- | :--- |
| **A patient requests access to admin endpoints** (`/api/v1/admin/*`). | Critical | `authorizeRoles('ADMIN')` middleware halts request execution and returns `403 Forbidden`. Tested in `tests/admin.test.js` and `tests/security.test.js`. | None. |
| **Deactivated user maintains access using an existing unexpired JWT.** | High | `authMiddleware` performs real-time database lookup of `user.isActive`. Deactivated accounts are blocked immediately (`403 Forbidden`). | Latency of one database lookup per request. (Trade-off accepted for real-time revocation guarantees). |

---

## 3. Residual Security Limitations & Operational Recommendations

While the application implements strong defense-in-depth across the backend code, the following architectural and deployment-level considerations remain:

1. **Token Invalidation on Sign-Out (Resolved via Redis)**:
   - Implemented via `POST /api/v1/auth/logout` using Redis token blacklisting (`src/config/redis.js` and `authMiddleware.js`). Revoked tokens are immediately denied access with `401 Unauthorized`. An in-memory fallback maintains revocation even when Redis is offline.
2. **Reverse Proxy & TLS Termination**:
   - The Node.js application serves HTTP directly in development. In production, TLS/HTTPS termination must be handled by an upstream reverse proxy (e.g. NGINX, AWS ALB, Caddy) with HSTS headers enabled.
3. **Multi-Factor Authentication (MFA)**:
   - Implemented in [`src/utils/mfa.js`](../src/utils/mfa.js) using cryptographically secure TOTP (Time-based One-Time Password) RFC 6238 generation, enrollment QR data, and 6-digit verification with timing-safe comparison and clock-skew window toleration for privileged DOCTOR and ADMIN roles.
4. **Database Connection Encryption**:
   - Ensure PostgreSQL connection strings in production enforce `sslmode=require` or `sslmode=verify-full`.
