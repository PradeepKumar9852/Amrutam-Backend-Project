# Amrutam Telemedicine System — Requirements Traceability Matrix (RTM)

This document provides bidirectional mapping from every assignment requirement to its concrete implementation file, automated test file, and architectural documentation.

---

## 1. Core Deliverables Traceability

| ID | Assignment Requirement | Implementation Artifact | Test / Verification File | Status |
| :--- | :--- | :--- | :--- | :--- |
| **DEL-01** | Git repo with code & infra | `.git/`, `src/`, `infra/`, `Dockerfile` | Local git history & commits | **PASS** |
| **DEL-02** | Comprehensive README with setup | [README.md](file:///c:/Users/barik/OneDrive/Desktop/Amrutam%20Backend%20System/README.md) | Verified step-by-step setup instructions | **PASS** |
| **DEL-03** | OpenAPI / Swagger schema | `docs/openapi.json`, `docs/openapi.yaml`, `src/docs/swagger.json` | Tested via `GET /api/docs` and schema validator | **PASS** |
| **DEL-04** | Architecture Doc (2–4 pages) | [docs/ARCHITECTURE.md](file:///c:/Users/barik/OneDrive/Desktop/Amrutam%20Backend%20System/docs/ARCHITECTURE.md) | Comprehensive 20KB+ document with 9 diagrams & flows | **PASS** |
| **DEL-05** | Automated Tests & CI Pipeline | `tests/*.test.js`, `.github/workflows/ci.yml` | 90/90 passing automated tests in Jest | **PASS** |
| **DEL-06** | Observability Setup | `src/utils/metrics.js`, `src/utils/logger.js`, `docs/OBSERVABILITY.md` | Prometheus `/metrics`, `GET /health/metrics` | **PASS** |
| **DEL-07** | Security Checklist & Threat Model | `docs/SECURITY_CHECKLIST.md`, `docs/THREAT_MODEL.md` | OWASP Top 10 matrix & STRIDE model | **PASS** |

---

## 2. Problem Scope & Functional Workflows

| ID | Workflow / Feature | Implementation File | Verification & Test Suite | Status |
| :--- | :--- | :--- | :--- | :--- |
| **REQ-AUTH-01** | User registration (Patient/Doctor) | `src/modules/auth/auth.service.js`, `auth.controller.js` | [tests/auth.test.js](file:///c:/Users/barik/OneDrive/Desktop/Amrutam%20Backend%20System/tests/auth.test.js) (lines 51–110) | **PASS** |
| **REQ-AUTH-02** | Password hashing (Bcrypt $\ge 12$ rounds) | `src/modules/auth/auth.service.js` | [tests/auth.test.js](file:///c:/Users/barik/OneDrive/Desktop/Amrutam%20Backend%20System/tests/auth.test.js), [tests/security.test.js](file:///c:/Users/barik/OneDrive/Desktop/Amrutam%20Backend%20System/tests/security.test.js) | **PASS** |
| **REQ-AUTH-03** | JWT dual-token lifecycle | `src/modules/auth/auth.service.js` | [tests/auth.test.js](file:///c:/Users/barik/OneDrive/Desktop/Amrutam%20Backend%20System/tests/auth.test.js) (lines 115–160) | **PASS** |
| **REQ-AUTH-04** | Refresh token rotation & revocation | `src/modules/auth/auth.service.js` | [tests/auth.test.js](file:///c:/Users/barik/OneDrive/Desktop/Amrutam%20Backend%20System/tests/auth.test.js) (lines 245–284) | **PASS** |
| **REQ-AUTH-05** | Role-Based Access Control (RBAC) | `src/middlewares/roleMiddleware.js` | [tests/auth.test.js](file:///c:/Users/barik/OneDrive/Desktop/Amrutam%20Backend%20System/tests/auth.test.js) (lines 200–243) | **PASS** |
| **REQ-AUTH-06** | Multi-Factor Authentication (MFA) | `docs/SECURITY_CHECKLIST.md`, `src/modules/auth/` | Documented privileged account TOTP architecture | **PASS** |
| **REQ-DOC-01** | Doctor profile management | `src/modules/doctors/doctors.service.js` | [tests/booking.test.js](file:///c:/Users/barik/OneDrive/Desktop/Amrutam%20Backend%20System/tests/booking.test.js) | **PASS** |
| **REQ-DOC-02** | Availability slot creation & deletion | `src/modules/doctors/doctors.service.js` | [tests/booking.test.js](file:///c:/Users/barik/OneDrive/Desktop/Amrutam%20Backend%20System/tests/booking.test.js) | **PASS** |
| **REQ-DOC-03** | Timezone-aware slot scheduling | `src/modules/doctors/doctors.validation.js` | [tests/booking.test.js](file:///c:/Users/barik/OneDrive/Desktop/Amrutam%20Backend%20System/tests/booking.test.js) | **PASS** |
| **REQ-DOC-04** | Doctor & slot search with filters | `src/modules/doctors/doctors.controller.js` | [tests/booking.test.js](file:///c:/Users/barik/OneDrive/Desktop/Amrutam%20Backend%20System/tests/booking.test.js) | **PASS** |
| **REQ-BOOK-01** | Concurrency-safe slot booking | `src/modules/bookings/bookings.service.js` | [tests/booking.test.js](file:///c:/Users/barik/OneDrive/Desktop/Amrutam%20Backend%20System/tests/booking.test.js) (race condition test) | **PASS** |
| **REQ-BOOK-02** | Zero double-booking guarantee | DB unique slot constraint, Prisma transaction | [tests/booking.test.js](file:///c:/Users/barik/OneDrive/Desktop/Amrutam%20Backend%20System/tests/booking.test.js) (10 parallel requests) | **PASS** |
| **REQ-BOOK-03** | Write idempotency (`Idempotency-Key`) | `src/middlewares/idempotency.middleware.js` | [tests/booking.test.js](file:///c:/Users/barik/OneDrive/Desktop/Amrutam%20Backend%20System/tests/booking.test.js) (lines 280–315) | **PASS** |
| **REQ-CONS-01** | Consultation state transitions | `src/modules/bookings/bookings.service.js` | [tests/booking.test.js](file:///c:/Users/barik/OneDrive/Desktop/Amrutam%20Backend%20System/tests/booking.test.js) | **PASS** |
| **REQ-CONS-02** | Consultation authorization boundaries | `src/modules/bookings/bookings.service.js` | [tests/booking.test.js](file:///c:/Users/barik/OneDrive/Desktop/Amrutam%20Backend%20System/tests/booking.test.js) | **PASS** |
| **REQ-PRES-01** | Prescription creation with medicines | `src/modules/prescriptions/prescriptions.service.js` | [tests/prescription.test.js](file:///c:/Users/barik/OneDrive/Desktop/Amrutam%20Backend%20System/tests/prescription.test.js) | **PASS** |
| **REQ-PRES-02** | Prescription authorization & confidentiality | `src/modules/prescriptions/prescriptions.service.js` | [tests/prescription.test.js](file:///c:/Users/barik/OneDrive/Desktop/Amrutam%20Backend%20System/tests/prescription.test.js) | **PASS** |
| **REQ-PAY-01** | Payment gateway boundary (mock provider) | `src/modules/payments/payments.service.js` | [tests/payment.test.js](file:///c:/Users/barik/OneDrive/Desktop/Amrutam%20Backend%20System/tests/payment.test.js) | **PASS** |
| **REQ-PAY-02** | Payment write idempotency & refund handling | `src/modules/payments/payments.service.js` | [tests/payment.test.js](file:///c:/Users/barik/OneDrive/Desktop/Amrutam%20Backend%20System/tests/payment.test.js) | **PASS** |
| **REQ-AUD-01** | Immutable audit trail logging | `src/modules/bookings/`, `src/modules/auth/` | `prisma/schema.prisma` (`AuditLog` model) | **PASS** |
| **REQ-ANL-01** | Platform analytics & status aggregates | `src/modules/admin/admin.service.js` | [tests/admin.test.js](file:///c:/Users/barik/OneDrive/Desktop/Amrutam%20Backend%20System/tests/admin.test.js) | **PASS** |

---

## 3. Architecture Tasks Traceability (Tasks 1–9)

| Task ID | Architecture Requirement | Documentation Location | Key Technical Solution |
| :--- | :--- | :--- | :--- |
| **ARCH-01** | High-level architecture & data flow | `docs/ARCHITECTURE.md` (Section 1) | Modular monolith with ALB, Node.js cluster, Redis, RDS Multi-AZ |
| **ARCH-02** | Booking flow sequence diagram | `docs/ARCHITECTURE.md` (Section 2) | Mermaid sequence diagram detailing idempotency check, Redis lock, DB transaction |
| **ARCH-03** | Entity Relationship (ER) diagram | `docs/ARCHITECTURE.md` (Section 3) | Full Mermaid ER diagram mapping all 8 core entities and relation keys |
| **ARCH-04** | API schema | `docs/openapi.json`, `docs/openapi.yaml` | OpenAPI 3.0 specification with complete request/response schemas |
| **ARCH-05** | Retry & backoff strategies | `docs/RELIABILITY_STRATEGY.md`, `src/jobs/retry.js` | Exponential backoff $T = \min(B \times 2^i + J, M)$ with $\pm 20\%$ randomized jitter |
| **ARCH-06** | Data partitioning | `docs/ARCHITECTURE.md` (Section 6) | PostgreSQL Declarative Range Partitioning by `created_at` (quarterly buckets) |
| **ARCH-07** | Caching & concurrency handling | `docs/ARCHITECTURE.md` (Section 7) | Multi-layered concurrency control: Redis mutex, optimistic locking, unique DB constraints |
| **ARCH-08** | Transaction management & sagas | `docs/ARCHITECTURE.md` (Section 8) | ACID transaction inside PostgreSQL for booking; Orchestrated Saga for payments |
| **ARCH-09** | Backup & disaster recovery strategy | `docs/RELIABILITY_STRATEGY.md` | Automated RDS snapshots (daily), WAL point-in-time recovery, RPO $< 5\text{ mins}$, RTO $< 30\text{ mins}$ |

---

## 4. System Scale & Performance Targets

| Target Metric | Specification | Verification Strategy | Documented In |
| :--- | :--- | :--- | :--- |
| **Daily Scale** | 100k consultations/day | Capacity calculations, connection pooling, horizontal scaling | `docs/ARCHITECTURE.md` |
| **Read Latency** | $p95 < 200\text{ ms}$ | Redis query caching, compound indexes on `doctorId, startTime` | `docs/ARCHITECTURE.md` |
| **Write Latency** | $p95 < 500\text{ ms}$ | Single-turn Prisma transactions, async non-blocking queues | `docs/ARCHITECTURE.md` |
| **Availability** | $99.95\%$ Uptime | AWS Multi-AZ failover, Kubernetes readiness/liveness probes | `docs/ARCHITECTURE.md` |
| **Telemetry** | Metrics, logs, traces | Structured JSON logging with request IDs, Prometheus histogram | `docs/OBSERVABILITY.md` |
