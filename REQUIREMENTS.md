# Amrutam Telemedicine System — Comprehensive System Requirements Specification

## 1. Executive Summary & Objective

**Amrutam Telemedicine System** is an enterprise-grade, high-concurrency digital Ayurveda healthcare platform. It connects verified Ayurvedic doctors (Vaidyas) with patients worldwide for holistic medical consultations, digital prescriptions (Pathya & Aushadhi), and secure wellness transactions.

The objective of this engineering initiative is to deliver a production-ready, modular monolithic backend adhering to strict reliability, security, scalability, and observability standards.

---

## 2. Business Workflows & Functional Requirements

### 2.1 User Lifecycle & Identity Management
- **Actor Roles**: Support three distinct role classes with Role-Based Access Control (RBAC):
  1. `PATIENT`: Can manage medical profiles, search doctors, book appointments, attend consultations, view prescriptions, and process payments.
  2. `DOCTOR`: Can manage professional credentials, define availability slots, conduct consultations, and author medical prescriptions.
  3. `ADMIN`: Full system visibility, doctor verification, platform-wide analytics, and audit log inspection.
- **Registration & Authentication**:
  - Secure registration with cryptographic password hashing using `bcryptjs` (salt rounds $\ge 12$).
  - JWT authentication with dual-token lifecycle:
    - **Short-lived Access Token**: 15-minute expiration, containing `sub` (userId), `role`, and `email`.
    - **Long-lived Refresh Token**: 7-day expiration, protected with cryptographic UUID `jti` nonces and atomic rotation.
  - Revocation & Replay Prevention: Blacklisting rotated/revoked tokens via Redis with TTL matching token expiry.
  - Multi-Factor Authentication (MFA) support architecture for privileged doctor and administrative accounts.

### 2.2 Doctor Management & Availability Scheduling
- **Doctor Profiles**: Store verified medical qualifications (e.g. BAMS, MD Ayurveda), license numbers, specialization categories (e.g., Panchakarma, Kayachikitsa), experience years, consultation fees, and verification status (`isVerified`).
- **Availability Slots**:
  - Doctors create non-overlapping schedule slots (`startTime` to `endTime`) in UTC with ISO 8601 formatting.
  - Slot duration validation (minimum 15 mins, maximum 120 mins).
  - Deletion safeguards preventing removal of already booked or ongoing consultation slots.
- **Search & Discovery**:
  - Filter doctors by specialization, experience, fee range, and verified status.
  - Search available time windows with cursor/offset pagination to avoid unbounded queries.

### 2.3 Concurrency-Safe Appointment Booking
- **High-Concurrency Booking Protocol**:
  - System must guarantee zero double-booking under extreme concurrent requests for the exact same slot.
  - Concurrency control layers:
    1. **Database Constraint**: Unique foreign key constraint on `slotId` in the `consultations` table.
    2. **Transaction Isolation**: Atomically execute slot status check and consultation creation within a serializable/repeatable-read transaction.
    3. **Optimistic Locking**: Track slot `version` counter to abort conflicting concurrent updates.
    4. **Distributed Redis Mutex**: Fast-path distributed locking using atomic Redis `SET resource:id NX EX` with automatic TTL release.
- **Write Idempotency**:
  - Client sends an `Idempotency-Key` HTTP header (UUID v4) on booking and payment requests.
  - Idempotency middleware stores the request state (`PROCESSING`, `COMPLETED`) and cached response in Redis (24-hour TTL).
  - Repeated requests with identical keys return the original cached response with `X-Idempotent-Replay: true` header without re-executing business logic.

### 2.4 Consultation Lifecycle
- **Finite State Machine (FSM)**:
  - Allowed states: `PENDING` $\to$ `CONFIRMED` $\to$ `IN_PROGRESS` $\to$ `COMPLETED` / `CANCELLED` / `RESCHEDULED`.
  - State transition validation preventing invalid flows (e.g. `COMPLETED` cannot move back to `PENDING`).
  - Strict Authorization: Only the assigned doctor, the patient owner, or an authorized admin can view or modify consultation details.

### 2.5 Medical Prescriptions (Aushadhi)
- **Authoring & Integrity**:
  - Only the assigned doctor can issue a prescription for a `CONFIRMED` or `COMPLETED` consultation.
  - Prescriptions are immutable once issued to protect medical legal integrity.
  - Prescriptions store diagnosis, Ayurvedic lifestyle advice (Pathya/Apathya), and structured medicine line-items (medicine name, dosage, frequency, duration, special instructions).
- **Confidentiality**: Access restricted strictly to the consulting doctor and the diagnosed patient.

### 2.6 Payment Boundary & Mock Integration
- **Transaction Safety**:
  - Dedicated `payments` table linked to consultations.
  - Secure mock payment provider boundary simulating gateway communication (Razorpay/Stripe API shape).
  - Handling for payment statuses: `PENDING`, `COMPLETED`, `FAILED`, `REFUNDED`.
  - Zero raw credit card or CVV storage (PCI-DSS compliance posture).
  - Idempotent payment processing preventing duplicate charges.

### 2.7 Compliance & Immutable Audit Trails
- **Audit Logging**:
  - Capture critical system events: user registration, logins, slot creation/deletion, booking creations/cancellations, prescription issuance, and payment transactions.
  - Record: `userId`, `action`, `entityType`, `entityId`, `ipAddress`, `userAgent`, `timestamp`, and sanitized `details` JSON.
  - Sensitive data redaction: Passwords, tokens, CVVs, and raw PII are never persisted in audit trails or log outputs.

### 2.8 Platform Analytics
- **Admin Dashboard Metrics**:
  - Consultation counts aggregated by status (`PENDING`, `CONFIRMED`, `COMPLETED`, `CANCELLED`).
  - Total revenue collected and average consultation fees.
  - Booking and cancellation rate distributions over custom date ranges.
  - Active verified doctor and patient counts.

---

## 3. Non-Functional & System Scale Requirements

| Parameter | Target Specification | Architectural Strategy |
| :--- | :--- | :--- |
| **Daily Scale** | 100,000 Consultations / Day | Distributed horizontal scaling (ECS Fargate / K8s HPA), connection pooling (PgBouncer), read replicas |
| **Peak Throughput** | $\sim 70$ bookings/sec peak write, $\sim 700$ reads/sec | Redis query caching, Redis distributed lock, non-blocking asynchronous event dispatch |
| **Read Latency** | $p95 < 200\text{ ms}$ | Redis cache for doctor profiles & slots, composite database indexes, bounded cursor pagination |
| **Write Latency** | $p95 < 500\text{ ms}$ | Atomic single-query Prisma transactions, optimized schema foreign keys, async queue for notifications |
| **High Availability** | $99.95\%$ Uptime ($\le 21.9\text{ min/month}$ downtime) | AWS Multi-AZ RDS deployment, multi-pod Kubernetes deployment with readiness/liveness probes |
| **Security Standard** | OWASP Top 10 API Security | Helmet security headers, strict CORS, rate limiting, Zod schema validation, parameterization |
| **Observability** | Full Telemetry (Metrics, Logs, Traces) | Prometheus `/metrics` scraping, Pino structured JSON logging, OpenTelemetry W3C trace context propagation |

---

## 4. Evaluation Rubric & Deliverables Checklist

- [x] **Architecture (20 pts)**: Modular monolith, clean separation of concerns, high-level diagrams, ER diagram, sequence flows.
- [x] **Core Flows (20 pts)**: Auth/RBAC, Doctor availability, Concurrency-safe booking, Consultations, Prescriptions, Payments, Search, Audit logs, Analytics.
- [x] **Code Quality (15 pts)**: Human-written style, clean CommonJS code, meaningful variables, zero code duplication, centralized error handling.
- [x] **Security (10 pts)**: Bcrypt hashing, JWT rotation, rate limiting, threat model, security checklist, data classification.
- [x] **Observability (10 pts)**: Structured JSON logging, Prometheus metrics (`p50`, `p90`, `p95`, `p99`), health check endpoints.
- [x] **Scalability (10 pts)**: Redis caching, connection pooling strategy, PostgreSQL partitioning plan, disaster recovery RTO/RPO.
- [x] **Infra & CI/CD (10 pts)**: Multi-stage Dockerfile, Docker Compose, Terraform IaC, Kubernetes HPA manifests, GitHub Actions CI.
- [x] **Bonus (+10 pts)**: Complete 90/90 passing automated tests, OpenAPI 3.0 specification, comprehensive demo script.
