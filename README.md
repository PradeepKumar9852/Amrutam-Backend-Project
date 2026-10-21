# Amrutam Telemedicine Backend API

[![CI Pipeline](https://img.shields.io/badge/CI-GitHub_Actions-blue.svg)](.github/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-v22.x-green.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express-4.21.x-lightgrey.svg)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-blue.svg)](https://www.postgresql.org/)
[![Prisma ORM](https://img.shields.io/badge/Prisma-5.22.x-2D3748.svg)](https://www.prisma.io/)
[![Redis](https://img.shields.io/badge/Redis-7-red.svg)](https://redis.io/)
[![Tests](https://img.shields.io/badge/Tests-172%20Passed-brightgreen.svg)](tests/)
[![Swagger](https://img.shields.io/badge/OpenAPI-3.0.3-85EA2D.svg)](http://localhost:5000/api-docs)
[![Prometheus](https://img.shields.io/badge/Prometheus-Metrics-orange.svg)](http://localhost:5000/metrics)

A modular, production-ready REST API backend for **Amrutam Telemedicine**, an Ayurvedic healthcare scheduling and consultation platform. Built with a focus on database concurrency control, defense-in-depth security, strict role-based access control (RBAC), and automated testing.

---

## Table of Contents
- [1. Technology Stack](#1-technology-stack)
- [2. System Architecture & Modular Folder Structure](#2-system-architecture--modular-folder-structure)
- [3. Key Architectural Features](#3-key-architectural-features)
- [4. Quick Start & Local Setup](#4-quick-start--local-setup)
- [5. Running with Docker Compose](#5-running-with-docker-compose)
- [6. API Documentation (Swagger / OpenAPI)](#6-api-documentation-swagger--openapi)
- [7. Automated Testing Suite](#7-automated-testing-suite)
- [8. Observability & Request Tracing](#8-observability--request-tracing)
- [9. Assignment Deliverables Comparison Matrix](#9-assignment-deliverables-comparison-matrix)
- [10. Documentation Directory Index](#10-documentation-directory-index)

---

## 1. Technology Stack

- **Runtime**: Node.js (v22.x LTS) with CommonJS
- **Framework**: Express.js (v4.21.2)
- **Primary Database**: PostgreSQL 17
- **ORM & Migrations**: Prisma ORM (v5.22.0)
- **Caching & Resilience**: Redis 7 (`ioredis`) with automatic resilient in-memory fallback
- **Authentication**: Dual-token JWT (HMAC-SHA256) + bcryptjs (cost factor 12) + Redis token revocation
- **Input & Config Validation**: Zod runtime schema validation
- **API Documentation**: OpenAPI 3.0.3 via Swagger UI Express
- **Automated Testing**: Jest (v30.x) & Supertest (v7.x)
- **Containerization**: Multi-stage Dockerfile & Docker Compose

---

## 2. System Architecture & Modular Folder Structure

The application adopts a **Modular Monolith** architecture with thin controllers, encapsulated domain services, and centralized cross-cutting concerns:

```
Amrutam Backend System/
├── .github/
│   └── workflows/
│       └── ci.yml               # GitHub Actions automated CI workflow
├── docs/                        # Complete architecture & design deliverables
│   ├── ARCHITECTURE.md          # Component diagrams, ER diagram & sequence diagrams
│   ├── RELIABILITY_STRATEGY.md  # Retries, timeouts, caching & disaster recovery
│   ├── OBSERVABILITY.md         # Request IDs, structured logging & telemetry
│   ├── SECURITY_CHECKLIST.md    # 10-point comprehensive security verification matrix
│   ├── THREAT_MODEL.md          # STRIDE threat model & residual limitations
│   ├── DOCKER_GUIDE.md          # Docker setup, container commands & migration guide
│   └── DEMO_SCRIPT.md           # 5-minute honest project walkthrough script
├── prisma/
│   ├── migrations/              # Applied PostgreSQL migration files
│   └── schema.prisma            # Relational schema (8 models, 6 enums, composite indexes)
├── src/
│   ├── config/                  # Environment (Zod validated), Prisma singleton, Redis client
│   │   ├── env.js               # Validated environment configuration with Zod
│   │   ├── prisma.js            # Prisma ORM singleton & database health check
│   │   └── redis.js             # Redis client with resilient in-memory fallback
│   ├── docs/                    # OpenAPI 3.0.3 specification & Swagger setup
│   ├── jobs/                    # Asynchronous background job queue and retry dispatcher
│   ├── middlewares/             # Auth, RBAC, Rate limiter, Idempotency, Error handler
│   ├── modules/                 # Modular domain feature modules:
│   │   ├── admin/               # Platform management & doctor verification
│   │   ├── analytics/           # Consultation statistics & revenue metrics
│   │   ├── audit/               # Immutable compliance audit log records
│   │   ├── auth/                # Registration, login, token rotation, MFA
│   │   ├── availability/        # Doctor availability slots & schedule management
│   │   ├── bookings/            # Concurrency-safe slot reservation
│   │   ├── consultations/       # Consultation lifecycle & state machine
│   │   ├── doctors/             # Doctor profiles, search filters & ratings
│   │   ├── health/              # Deep system health & database latency checks
│   │   ├── payments/            # Payment gateway boundary & refunds
│   │   ├── prescriptions/       # Clinical prescriptions & medicine items
│   │   └── users/               # User account & patient profile management
│   ├── routes/                  # API v1 route aggregator (v1.routes.js)
│   ├── utils/                   # ApiError, ApiResponse, Logger, Metrics
│   ├── app.js                   # Express pipeline, middlewares & routes
│   └── server.js                # Server initialization & graceful shutdown
├── tests/                       # 7 integration & security test suites (134 tests)
│   ├── admin.test.js
│   ├── auth.test.js
│   ├── booking.test.js
│   ├── doctor.test.js
│   ├── payment.test.js
│   ├── prescription.test.js
│   └── security.test.js
├── .dockerignore
├── .env.example                 # Safe template for required environment variables
├── .gitignore
├── Dockerfile                   # Multi-stage, non-root Node.js 22 container
├── docker-compose.yml           # App + PostgreSQL 17 + Redis 7 orchestration
├── package.json
└── README.md
```

---

## 3. Key Architectural Features

### A. Concurrency Protection & Anti-Double-Booking
- **Pessimistic Storage Locking**: Uses PostgreSQL `SELECT ... FOR UPDATE` inside `prisma.$transaction` to serialize concurrent booking attempts for the same availability slot.
- **Database Unique Constraint**: A unique index on `consultations.slot_id` provides secondary storage engine protection.
- **Race Condition Tested**: Verified by automated tests simulating 5 simultaneous client booking requests for the same slot (1 succeeds with 201, 4 are rejected with 409 Conflict).

### B. Idempotency Support
- Clients can send an `Idempotency-Key` or `x-idempotency-key` header on booking mutations.
- Network retries retrieve the existing booking with HTTP `200 OK` and `X-Idempotent-Replay: true` rather than producing duplicate records.

### C. Defense-in-Depth Security & PHI Privacy
- **Stateless JWT with Instant Logout Revocation**: `POST /api/v1/auth/logout` adds revoked tokens to a Redis blacklist with matching TTLs.
- **Timing Attack Mitigation**: Login executes a constant-time dummy bcrypt comparison if an email is not found, equalizing response time and preventing user enumeration.
- **IDOR Barriers**: Strict user ownership verification on all consultation and prescription endpoints; cross-account access attempts return `403 Forbidden`.
- **Sensitive Data Redaction**: Automatic recursion in `logger.js` redacts passwords, tokens, and clinical notes from all structured logs.

---

## 4. Quick Start & Local Setup

### Prerequisites
- **Node.js**: v20+ or v22+
- **PostgreSQL**: v15+ or v17+ running locally
- **Redis** *(optional)*: Running locally on port 6379 (an automatic in-memory fallback activates if Redis is offline)

### Step 1: Clone & Install Dependencies
```bash
git clone <repository-url>
cd "Amrutam Backend System"
npm install
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Update `.env` with your PostgreSQL database credentials:
```env
PORT=5000
NODE_ENV=development
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/amrutam_telemedicine?schema=public"
JWT_SECRET=your_super_secret_jwt_key_at_least_32_characters_for_security
JWT_EXPIRES_IN=7d
REDIS_URL=redis://localhost:6379
CORS_ORIGIN=*
```

### Step 3: Run Database Migrations
Generate Prisma Client and apply migrations:
```bash
npm run prisma:generate
npm run prisma:deploy
```

### Step 4: Start the Server
- **Development Mode** (with Nodemon hot-reload):
  ```bash
  npm run dev
  ```
- **Production Mode**:
  ```bash
  npm start
  ```

---

## 5. Running with Docker Compose

To run the entire system (Node.js API + PostgreSQL 17 + Redis 7) in an isolated container environment without installing PostgreSQL or Redis on your host:

```bash
docker compose up --build -d
```

**What this does automatically:**
1. Starts PostgreSQL 17 with health checks and persistent volume storage (`postgres_data`).
2. Starts Redis 7 with persistent volume storage (`redis_data`).
3. Compiles the multi-stage Node.js 22 container as unprivileged user `node`.
4. Automatically runs `npx prisma migrate deploy` on startup.
5. Exposes the API on port `5000`.

To view live container logs:
```bash
docker compose logs -f app
```

To stop containers while preserving database records:
```bash
docker compose down
```

*(See [docs/DOCKER_GUIDE.md](docs/DOCKER_GUIDE.md) for detailed container instructions).*

---

## 6. API Documentation (Swagger / OpenAPI)

Once the server is running, the interactive Swagger UI and raw OpenAPI JSON specification are accessible:

- **Interactive Swagger UI**: [http://localhost:5000/api-docs](http://localhost:5000/api-docs)
- **Raw OpenAPI 3.0.3 JSON**: [http://localhost:5000/api-docs.json](http://localhost:5000/api-docs.json)
- **System Health Check**: [http://localhost:5000/api/v1/health](http://localhost:5000/api/v1/health)

### Testing via Swagger UI:
1. Register or login via `POST /api/v1/auth/login`.
2. Copy the returned JWT token.
3. Click the green **Authorize** button at the top of Swagger UI and enter `Bearer <your_token>`.
4. Execute any authenticated route with automatic role and parameter validation.

---

## 7. Automated Testing Suite

The repository includes a comprehensive automated integration, reliability, and security test suite using Jest and Supertest.

Run the full test suite:
```bash
npm test
```

### Actual Test Results (Verified)
```text
PASS tests/auth.test.js          (32 tests)
PASS tests/security.test.js      (25 tests)
PASS tests/doctor.test.js        (18 tests)
PASS tests/booking.test.js       (18 tests)
PASS tests/prescription.test.js  (16 tests)
PASS tests/reliability.test.js   (15 tests)
PASS tests/payment.test.js       (14 tests)
PASS tests/admin.test.js         (34 tests)

Test Suites: 8 passed, 8 total
Tests:       172 passed, 172 total
Snapshots:   0 total
Time:        62.88 s
```

---

## 8. Observability, Metrics & Request Tracing

- **OpenTelemetry W3C Distributed Tracing**: Every request attaches standard W3C `traceparent` (`00-{trace_id}-{span_id}-01`) and `X-Request-Id` headers for multi-hop distributed tracing.
- **Prometheus Metrics Stream**: Accessible at `GET /metrics` and `GET /api/v1/health/metrics` exporting duration histograms (p50, p90, p95, p99), HTTP counters by route/status, process heap, and active connections.
- **Structured JSON Logging**: In production (`NODE_ENV=production`), logs are emitted as single-line JSON records with sensitive fields (`password`, `token`, `diagnosis`, `symptomsSummary`, `cardNumber`) automatically redacted.
- **Kubernetes Health Probes**:
  - `GET /api/v1/health/liveness` — Process uptime probe (returns 200 `UP`).
  - `GET /api/v1/health/readiness` — Deep PostgreSQL connectivity probe (returns 200 `READY` or 503 `NOT_READY`).
  - `GET /api/v1/health` — Full diagnostic state (memory, DB latency, Redis status).

*(See [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md) and [docs/RELIABILITY_STRATEGY.md](docs/RELIABILITY_STRATEGY.md) for full details).*

---

## 9. Assignment Deliverables Comparison Matrix

| Feature / Requirement from Assignment | Status | Implementation Details & Evidence |
| :--- | :---: | :--- |
| **Modular Folder Structure & Clean Architecture** | **COMPLETED** | Thin controllers in `src/modules/*/*.controller.js`, domain logic in `src/modules/*/*.service.js`, centralized middlewares. |
| **PostgreSQL Schema & Prisma Migrations** | **COMPLETED** | 9 models (`User`, `PatientProfile`, `DoctorProfile`, `AvailabilitySlot`, `Consultation`, `Prescription`, `PrescriptionItem`, `Payment`, `AuditLog`) with migrations in `prisma/migrations/`. |
| **Authentication & RBAC (Patient, Doctor, Admin)** | **COMPLETED** | Registration, login, `authMiddleware`, and `roleMiddleware` with bcrypt hashing and rate limiting. |
| **Multi-Factor Authentication (MFA / 2FA)** | **COMPLETED** | RFC 6238 TOTP enrollment and verification with timing-safe checks in `src/utils/mfa.js`. |
| **Doctor Availability & Slot Management** | **COMPLETED** | Slot creation with overlap validation, slot deletion with ownership verification, and public slot listing. |
| **Concurrency-Safe Appointment Booking** | **COMPLETED** | PostgreSQL row locking (`SELECT ... FOR UPDATE`), unique index constraint on `slot_id`, and 5-client concurrent race condition test. |
| **Idempotency for Retries** | **COMPLETED** | Dedicated `idempotency.middleware.js` and service-level atomic transaction checks returning `X-Idempotent-Replay: true`. |
| **Consultation Lifecycle FSM** | **COMPLETED** | Finite State Machine: `PENDING -> CONFIRMED -> IN_PROGRESS -> COMPLETED`. Illegal jumps return 400 Bad Request. |
| **Ayurvedic Prescriptions** | **COMPLETED** | Issue prescription with nested medicine items, automatic consultation completion, and strict doctor ownership checks. |
| **Payments Lifecycle & Refunds** | **COMPLETED** | Full payment processing (`POST /api/v1/payments/process`), receipt retrieval, and doctor/admin refunds with atomic slot release. |
| **Async Jobs for Heavy Tasks** | **COMPLETED** | Background job queue (`src/jobs/jobQueue.js`) with exponential backoff & jitter retry (`src/jobs/retry.js`) for reminders and PDF delivery. |
| **Circuit Breaker Pattern** | **COMPLETED** | Three-state (`CLOSED`, `OPEN`, `HALF_OPEN`) circuit breaker (`src/utils/circuitBreaker.js`) protecting downstream integrations. |
| **Doctor Search, Filtering & Sorting** | **COMPLETED** | Case-insensitive search, specialization filter, min/max fee range, experience filter, and multi-field sorting. |
| **Admin Analytics & Audit Logging** | **COMPLETED** | Dashboard metrics (revenue, status breakdown, top specializations) and paginated audit logs (`GET /api/v1/admin/audit-logs`). |
| **OpenAPI / Swagger 3.0 Documentation** | **COMPLETED** | Full specification mounted at `/api-docs` + standalone `docs/openapi.json` and `docs/openapi.yaml` covering all 45 endpoints. |
| **Docker & Docker Compose** | **COMPLETED** | Multi-stage `Dockerfile`, `docker-compose.yml` (App + PostgreSQL 17 + Redis 7), and `.dockerignore`. |
| **Automated CI Pipeline** | **COMPLETED** | GitHub Actions workflow (`.github/workflows/ci.yml`) for linting, security audits, Prisma validation, migrations, test suites, and Docker builds. |
| **Measured Load Benchmarks** | **COMPLETED** | Automated benchmark script (`scripts/loadBenchmark.js`) measuring 86.9 RPS reads, 425.5ms p95 writes (< 500ms SLA target), and 100% success rate. |

---

## 10. Operational Troubleshooting Guide

### Common Issues & Solutions

#### 1. "Redis connection offline: Operating with fallback mode"
- **Cause**: Redis server is not currently running on `localhost:6379`.
- **Expected Behavior**: The system is designed with a resilient in-memory fallback (`fallback_in_memory`). The API continues operating with 100% functionality (in-memory caching and token blacklists).
- **Fix (Optional)**: Start Redis via Docker (`docker run -d -p 6379:6379 redis:7-alpine`) or update `REDIS_URL` in `.env`.

#### 2. "Database connection error (P1001) / Connection Refused"
- **Cause**: PostgreSQL is not reachable at the host/port defined in `DATABASE_URL`.
- **Fix**:
  1. Verify PostgreSQL service status (`pg_isready -h localhost -p 5432`).
  2. Confirm your `.env` connection string format: `postgresql://postgres:<password>@localhost:5432/amrutam_telemedicine?schema=public`.
  3. Ensure the `amrutam_telemedicine` database exists (`CREATE DATABASE amrutam_telemedicine;`).

#### 3. "Port 5000 Already in Use"
- **Cause**: A previous server instance or another application is occupying port 5000.
- **Fix**: Set a different port in `.env` (e.g. `PORT=5001`), or terminate the occupying process on Windows:
  ```powershell
  Get-Process -Id (Get-NetTCPConnection -LocalPort 5000).OwningProcess | Stop-Process -Force
  ```

#### 4. Running Migrations in Staging / Docker
- If deploying to a new environment, run:
  ```bash
  npx prisma migrate deploy
  ```
  *(Note: In Docker Compose, this is executed automatically on container startup).*

---

## 11. Documentation Directory Index

Detailed technical reports and architectural artifacts are available in the [`docs/`](docs/) directory:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — System layers, Mermaid architecture, data-flow, ER, and booking sequence diagrams.
- [docs/RELIABILITY_STRATEGY.md](docs/RELIABILITY_STRATEGY.md) — Actual load benchmark results, circuit breakers, caching, backups, retention, and saga decisions.
- [docs/BENCHMARK_RESULTS.json](docs/BENCHMARK_RESULTS.json) — Raw recorded latency and throughput metrics from load tests.
- [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md) — OpenTelemetry W3C tracing, Prometheus metrics, structured logs, and health probes.
- [docs/SECURITY_CHECKLIST.md](docs/SECURITY_CHECKLIST.md) — 10-domain defensive security audit, IDOR defenses, and verification status.
- [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) — STRIDE threat modeling and mitigation strategies.
- [docs/DOCKER_GUIDE.md](docs/DOCKER_GUIDE.md) — Complete guide to running, migrating, and debugging with Docker.
- [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) — 5-minute reviewer walkthrough script.
