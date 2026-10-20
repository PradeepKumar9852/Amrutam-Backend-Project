# Amrutam Telemedicine System — Implementation Plan & Phase Roadmap

## 1. Architectural Philosophy & Strategy

To support **100,000 daily consultations** while keeping the code accessible, maintainable, and beginner-friendly, we adopt a **Modular Monolith** architecture.
- **Why Modular Monolith over Microservices?**
  - A microservice mesh introduces high operational complexity (network latency between services, distributed consensus, complex deployments).
  - A modular monolith keeps domain logic cleanly separated by directory (`src/modules/*`) while running inside a single containerized runtime.
  - Scaling is achieved effortlessly by running multiple stateless container replicas behind an Application Load Balancer (ALB) sharing a managed PostgreSQL database and Redis cluster.

---

## 2. Technology Choices & Beginner-Friendly Explanations

1. **Node.js LTS (v22) with CommonJS**:
   - *Why*: Node.js has a non-blocking asynchronous event loop ideal for I/O-intensive APIs. CommonJS (`require` and `module.exports`) is the most widely understood, universally supported, and beginner-friendly standard in the Node ecosystem.
2. **Express.js**:
   - *Why*: The gold-standard web framework in Node.js. It is minimalistic, unopinionated, and makes request handling, routing, and middleware pipelines crystal clear.
3. **PostgreSQL 17**:
   - *Why*: A battle-tested, ACID-compliant relational database. It provides strict foreign-key integrity, row-level locking (`FOR UPDATE`), and indexing necessary to prevent double-booking.
4. **Prisma ORM**:
   - *Why*: Type-safe query building, automatic migration generation (`prisma/migrations`), and intuitive relational mapping without writing vulnerable raw SQL strings.
5. **Redis (`ioredis`)**:
   - *Why*: In-memory key-value store used for sub-millisecond data access. Handles distributed locks for booking slots, JWT refresh-token blacklisting, rate limiting, and write idempotency caching.
6. **Zod**:
   - *Why*: Schema declaration and validation library. Validates all incoming HTTP request bodies, queries, and headers before passing them to controller handlers.
7. **Pino Logger**:
   - *Why*: Extremely fast structured JSON logger that records request IDs, error traces, and operational context with sensitive-field redaction.
8. **Prometheus Metrics (`src/utils/metrics.js`)**:
   - *Why*: Provides production-ready latency histograms (`p50`, `p90`, `p95`, `p99`) and request rate metrics compatible with standard OpenTelemetry collectors and Grafana.
9. **Jest & Supertest**:
   - *Why*: High-speed, automated test suite runner allowing end-to-end HTTP request simulation without starting external servers.
10. **Docker & Docker Compose**:
    - *Why*: Guarantees that the app runs identically in development, CI, and production by packaging the Node runtime, PostgreSQL, and Redis into reproducible containers.

---

## 3. Directory Structure

```text
Amrutam Backend System/
├── .github/workflows/
│   └── ci.yml                 # Automated CI workflow (linting, tests, build)
├── docs/
│   ├── ARCHITECTURE.md        # 4-page comprehensive architecture document
│   ├── SECURITY_CHECKLIST.md  # OWASP matrix, key rotation, and data classification
│   ├── THREAT_MODEL.md        # STRIDE attack surface analysis
│   ├── OBSERVABILITY.md       # Operational debugging and monitoring guide
│   ├── RELIABILITY_STRATEGY.md# Backoff, jitter, and disaster recovery plan
│   ├── DOCKER_GUIDE.md        # Local and production container execution guide
│   ├── DEMO_SCRIPT.md         # 5-minute technical review walkthrough script
│   ├── openapi.json           # Complete OpenAPI 3.0 API specification
│   └── openapi.yaml           # YAML format OpenAPI 3.0 specification
├── infra/
│   ├── docker/                # Production container configs
│   ├── k8s/                   # Kubernetes Deployment, Service, and HPA
│   ├── monitoring/            # Prometheus scraping configurations
│   └── terraform/             # AWS ECS, RDS, and ElastiCache IaC
├── prisma/
│   ├── schema.prisma          # Database schema (8 models, enums, indexes)
│   └── migrations/            # Auto-generated SQL schema migrations
├── src/
│   ├── app.js                 # Express application setup, middlewares, routes
│   ├── server.js              # HTTP server bootstrapper and graceful shutdown
│   ├── config/
│   │   ├── env.js             # Validated environment variables (Zod)
│   │   ├── prisma.js          # Shared Prisma ORM client instance
│   │   └── redis.js           # Redis client with in-memory resilient fallback
│   ├── middlewares/
│   │   ├── authMiddleware.js  # JWT verification and user identity extraction
│   │   ├── roleMiddleware.js  # RBAC enforcement (ADMIN, DOCTOR, PATIENT)
│   │   ├── validateRequest.js # Zod schema validation middleware
│   │   ├── idempotency.middleware.js # Redis write idempotency handler
│   │   ├── rateLimiter.js     # IP and route-based rate limiting
│   │   └── errorHandler.js    # Centralized error handler with sanitized responses
│   ├── modules/
│   │   ├── admin/             # Platform analytics, summaries, doctor verification
│   │   ├── auth/              # Registration, login, token rotation, logout
│   │   ├── bookings/          # Concurrency-safe slot reservation & idempotency
│   │   ├── doctors/           # Doctor profiles, availability management, search
│   │   ├── health/            # Health check, readiness, and Prometheus metrics
│   │   ├── payments/          # Payment processing boundary, refunds, webhooks
│   │   └── prescriptions/     # Clinical prescriptions & medicine line-items
│   ├── jobs/
│   │   ├── retry.js           # Exponential backoff with randomized jitter
│   │   └── jobQueue.js        # Non-blocking async job dispatcher
│   ├── routes/
│   │   └── v1.routes.js       # Centralized API v1 route aggregator
│   └── utils/
│       ├── apiResponse.js     # Standardized JSON response envelope
│       ├── logger.js          # Structured logger with PII masking
│       └── metrics.js         # Prometheus latency histogram and counter registry
└── tests/
    ├── admin.test.js          # Platform analytics and admin authorization tests
    ├── auth.test.js           # Auth, token rotation, and RBAC tests
    ├── booking.test.js        # Concurrency & idempotency booking tests
    ├── payment.test.js        # Payment gateway boundary & refund tests
    ├── prescription.test.js   # Clinical prescription & access control tests
    └── security.test.js       # OWASP security, rate-limiting, and injection tests
```

---

## 4. Phased Development Roadmap

### Phase 1: Environment Inspection, Baseline & Project Blueprint
- State of environment: Validate Node.js LTS, npm, PostgreSQL connection string, Git setup.
- Deliverables: `REQUIREMENTS.md`, `IMPLEMENTATION_PLAN.md`, `REQUIREMENTS_TRACEABILITY.md`.
- Verification: Confirm all baseline tools and files exist without syntax errors.

### Phase 2: Configuration, Database Modeling & Migrations
- Setup `.env`, `src/config/env.js`, `src/config/prisma.js`, `src/config/redis.js`.
- Define Prisma data model with 8 core entities: `User`, `PatientProfile`, `DoctorProfile`, `AvailabilitySlot`, `Consultation`, `Prescription`, `PrescriptionItem`, `Payment`, `AuditLog`.
- Execute migrations and verify relation constraints.

### Phase 3: Shared Infrastructure & Middleware Foundation
- Centralized custom errors (`AppError`, `NotFoundError`, `UnauthorizedError`, `ConflictError`).
- Request logger with correlation ID generation (`X-Request-Id`).
- Zod request validation wrapper.
- Central error handler preventing sensitive stack trace leakage.

### Phase 4: Authentication, Profiles & RBAC
- Patient and Doctor registration with bcrypt password hashing.
- Dual-token JWT issuance (Access + Refresh).
- Refresh token rotation with atomic revocation in Redis.
- RBAC middleware (`PATIENT`, `DOCTOR`, `ADMIN`).

### Phase 5: Doctor Management, Availability & Search
- Doctor profile creation, updating, and verification endpoints.
- Time-zone aware slot generation and conflict detection.
- Paginated doctor and slot search with composite indexing.

### Phase 6: Concurrency-Safe Appointment Booking & Idempotency
- Multi-tier concurrency prevention: Unique DB constraint, serializable transactions, optimistic locking versioning.
- Redis-backed write idempotency middleware returning `X-Idempotent-Replay: true`.
- Concurrency simulation test verifying zero double-booking under race conditions.

### Phase 7: Consultation Lifecycle & Prescriptions
- Consultation state machine (`PENDING` $\to$ `CONFIRMED` $\to$ `IN_PROGRESS` $\to$ `COMPLETED`).
- Authorized prescription authoring with medicine line-items.
- Confidentiality access controls ensuring only consulting doctor and patient have access.

### Phase 8: Payment Gateway Boundary & Asynchronous Jobs
- Idempotent payment processing with mock provider.
- Refund handling and webhook dispatch.
- Resilient background job queue with exponential backoff and randomized jitter.

### Phase 9: Audit Trails & Admin Analytics
- Immutable audit log recorder capturing security-sensitive business events.
- Platform analytics: status summaries, booking/cancellation rates, revenue calculations.

### Phase 10: Security Hardening & Observability
- Helmet headers, explicit CORS, IP rate limiting.
- Prometheus `/metrics` endpoint with latency histogram calculations.
- Data classification matrix, threat model (STRIDE), and security checklist.

### Phase 11: Testing, OpenAPI Specification & CI/CD
- 90 passing automated tests covering all workflows and edge cases.
- OpenAPI 3.0 documentation (`docs/openapi.json` and `docs/openapi.yaml`).
- GitHub Actions CI workflow for automated linting, test execution, and container build.

### Phase 12: Final Review, Verification & Technical Demo Script
- Final traceability audit.
- 5-minute technical demo script for code review.
- Submission readiness.
