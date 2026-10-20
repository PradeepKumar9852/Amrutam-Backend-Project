# Amrutam Telemedicine Backend - Five-Minute Reviewer Demo Script

This script provides an honest, step-by-step walkthrough to present the Amrutam Telemedicine Backend to an evaluator or reviewer in five minutes.

---

## Preparation (30 Seconds Before the Demo)

1. Start your local server:
   ```bash
   npm run dev
   ```
2. Open your browser to:
   - **Swagger UI**: [http://localhost:5000/api-docs](http://localhost:5000/api-docs)
   - **System Health Check**: [http://localhost:5000/api/v1/health](http://localhost:5000/api/v1/health)
3. Have your terminal ready to run the automated test suite.

---

## 5-Minute Walkthrough Flow

### Minute 1: System Foundation & Architecture (0:00 - 1:00)
- **What to say**:
  > *"The Amrutam Telemedicine Backend is designed as a modular monolith built with Node.js, Express, PostgreSQL, Prisma ORM, and Redis. It separates concerns strictly: routes handle endpoint mapping, thin controllers handle request/response transformation, and domain services handle business logic and database transactions."*
- **What to show**:
  1. Open [http://localhost:5000/api/v1/health](http://localhost:5000/api/v1/health) to demonstrate live system health, database latency, and Redis connectivity.
  2. Open [http://localhost:5000/api-docs](http://localhost:5000/api-docs) to show all 23 live, interactive endpoints documented with OpenAPI 3.0 schemas, parameters, and JWT Bearer auth.

---

### Minute 2: Authentication, Role-Based Access Control & Logout (1:00 - 2:00)
- **What to say**:
  > *"We support three distinct roles: Patients, Doctors, and Administrators. Passwords are encrypted with bcrypt at cost factor 12. Authentication uses JWT with real-time database checks for account deactivation, plus an instant token revocation blacklist in Redis upon logout."*
- **What to show**:
  1. In Swagger UI under **Authentication**, execute `POST /api/v1/auth/login` with an existing user or create a new patient.
  2. Copy the returned JWT token and click **Authorize** at the top of Swagger UI.
  3. Try accessing `GET /api/v1/admin/analytics` as a patient — show the clean `403 Forbidden` response.
  4. Call `POST /api/v1/auth/logout`. Then show that subsequent calls with the revoked token are immediately rejected with `401 Unauthorized`.

---

### Minute 3: Availability & Concurrency-Safe Booking (2:00 - 3:00)
- **What to say**:
  > *"The core challenge of telemedicine scheduling is race conditions—preventing two patients from booking the exact same doctor slot at the same second. We solved this with pessimistic row locking using PostgreSQL `SELECT ... FOR UPDATE` inside an atomic transaction, backed by a unique database constraint on `consultations.slot_id`. We also support idempotency so network retries do not create duplicate bookings."*
- **What to show**:
  1. Show `POST /api/v1/bookings` in Swagger.
  2. Explain the `Idempotency-Key` header and how it returns an idempotent replay (`X-Idempotent-Replay: true`).
  3. Mention that a dedicated automated test runs 5 concurrent client requests simultaneously against the same slot, proving that exactly 1 succeeds and 4 receive clean `409 Conflict` errors.

---

### Minute 4: Clinical Lifecycle & Ayurvedic Prescriptions (3:00 - 4:00)
- **What to say**:
  > *"Consultations follow a strict Finite State Machine: `PENDING -> CONFIRMED -> IN_PROGRESS -> COMPLETED`. Once a consultation is in progress, only the attending doctor can issue a prescription containing Ayurvedic medicines, dosages, and lifestyle advice. When prescribed, the consultation transitions automatically to COMPLETED, and an immutable audit log is generated. Protected Health Information is shielded by IDOR barriers."*
- **What to show**:
  1. Highlight `POST /api/v1/prescriptions` in Swagger with medicine items (`Ashwagandha`, `Triphala`, dosages, and durations).
  2. Explain that if Patient A attempts to view Patient B's prescription or symptoms, the API enforces strict ownership and rejects with `403 Forbidden`.

---

### Minute 5: Automated Testing, Observability & Docker (4:00 - 5:00)
- **What to say**:
  > *"To ensure code quality and regression prevention, we built a comprehensive Jest/Supertest suite with 74 integration and security tests. We also have Docker Compose for multi-container orchestration, structured logging with `X-Request-Id` correlation, and GitHub Actions CI."*
- **What to show**:
  1. Switch to terminal and run:
     ```bash
     npm test
     ```
  2. Point out that all 5 test suites pass (`74 passed, 74 total`), including race conditions, RBAC boundaries, IDOR defenses, and Redis caching.
  3. Point to the `X-Request-Id` header returned on any HTTP call to demonstrate distributed request correlation.

---

## Honest Answers to Likely Reviewer Questions

### Q: "Is this backend currently deployed to the cloud?"
- **Honest answer**:
  > *"No, it is not currently deployed to a public cloud provider. However, it is fully containerized with a production-ready `Dockerfile` and `docker-compose.yml`, and includes a GitHub Actions CI pipeline (`.github/workflows/ci.yml`) that validates the Prisma schema and runs the 74 tests on an isolated PostgreSQL service."*

### Q: "What happens if Redis goes down?"
- **Honest answer**:
  > *"Our Redis client (`src/config/redis.js`) includes a non-blocking connection strategy and an automatic in-memory fallback. If Redis is offline, the backend continues to serve all database requests without crashing, and falls back to memory for caching and token blacklists."*

### Q: "How is Protected Health Information (PHI) protected?"
- **Honest answer**:
  > *"Access to consultation symptoms and prescription records is gated by strict ownership checks (`req.user.id === patient.userId || req.user.id === doctor.userId || req.user.role === 'ADMIN'`). Sensitive medical fields and passwords are automatically redacted from all structured logs, and audit logs record every clinical event."*
