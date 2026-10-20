# Amrutam Telemedicine Backend - Reliability, Concurrency & Disaster Recovery Strategy

This document outlines the architectural strategies implemented across the Amrutam Telemedicine Backend to ensure operational resilience, fault tolerance, concurrency protection, and data recoverability.

---

## 1. Retry, Timeout & Error-Handling Strategy

### A. Idempotent Client Retries
- **Mechanism**: The booking creation API supports the `Idempotency-Key` or `x-idempotency-key` HTTP header.
- **Retry Semantics**: If a mobile app or web client experiences a network timeout after sending a booking request, it can safely retry with the exact same key.
- **Handling**:
  - The backend matches previously recorded audit logs for that user and key.
  - Returns the existing consultation with HTTP `200 OK` and `X-Idempotent-Replay: true`.
  - Guarantees zero duplicate consultations or double-charges.

### B. Database Timeouts & Connection Resilience
- **Prisma Connection Pooling**: Configured with automatic connection pooling (`connection_limit` and `pool_timeout`).
- **Health Checks**: The non-blocking health checker (`checkDatabaseHealth`) pings PostgreSQL using `SELECT 1` with an execution timer to detect database degradation or latency spikes before requests fail.
- **Pessimistic Lock Timeouts**: Row locks (`FOR UPDATE`) release automatically upon transaction completion or timeout, preventing deadlock conditions.

### C. Error Classification & Centralized Normalization
In [`src/middlewares/errorHandler.js`](../src/middlewares/errorHandler.js), all errors are classified into standard categories:
1. **Client Operational Errors (`ApiError`)**:
   - `400 Bad Request`: Schema validation failures (Zod), invalid enum transitions, past slot selections.
   - `401 Unauthorized`: Missing tokens, expired tokens, forged signatures, revoked tokens.
   - `403 Forbidden`: IDOR cross-account access, deactivated accounts, role mismatches.
   - `404 Not Found`: Non-existent resources.
   - `409 Conflict`: Double-booking attempts, email/phone/license duplicates.
   - `429 Too Many Requests`: Rate limit triggered.
2. **Database Driver Errors (Prisma)**:
   - `P2002` (Unique constraint): Translated into clean `409 Conflict`.
   - `P2025` (Record not found): Translated into `404 Not Found`.
   - `P2023` (Inconsistent column format, e.g. malformed UUID): Translated into `400 Bad Request`.
3. **Internal Server Errors (500)**:
   - In production, internal messages and stack traces are suppressed and replaced with `"An unexpected internal server error occurred"`.
   - The unique `requestId` is included in the payload to allow correlation with internal logs.

---

## 2. Caching & Concurrency Control Strategy

### A. Multi-Layer Concurrency Defense
Double-booking is prevented using defense-in-depth across three layers:
1. **Application Layer**: Validates that `slot.isBooked === false` and verifies slot start times are in the future.
2. **Storage Engine Layer (PostgreSQL Row-Level Locking)**:
   ```sql
   SELECT id, doctor_id, start_time, end_time, is_booked, version
   FROM availability_slots
   WHERE id = $1::uuid
   FOR UPDATE
   ```
   Ensures that concurrent transactions attempting to book the exact same slot are serialized by PostgreSQL. The first transaction reserves the slot; subsequent waiting transactions immediately see `isBooked === true` and receive a clean `409 Conflict`.
3. **Database Schema Layer (Unique Constraint)**:
   `consultations.slot_id` has a unique database index (`consultations_slot_id_key`). Even in the event of an application logic bug, PostgreSQL's relational engine rejects duplicate reservations.

### B. Redis Caching Strategy
- **Doctor Catalog Search (`GET /api/v1/doctors`)**:
  - Cache Key: `doctors:list:<query_json>`
  - TTL: 60 seconds.
  - Invalidation: Any time a doctor profile is updated or verified/unverified by an administrator (`deletePattern('doctors:*')`).
- **Doctor Availability Slots (`GET /api/v1/doctors/:id/slots`)**:
  - Cache Key: `slots:<doctorId>:<query_json>`
  - TTL: 30 seconds.
  - Invalidation: Evicted immediately upon slot creation, slot deletion, appointment booking, or appointment cancellation (`deletePattern('slots:*')`).
- **Resilient Fallback Mode**:
  - If Redis is unreachable, caching and blacklist checks fall back gracefully to in-memory maps without failing requests.

---

## 3. Backup & Disaster Recovery (DR) Considerations

For production telemedicine deployments handling patient medical records, the following recovery strategy is recommended:

### A. Recovery Objectives
- **Recovery Point Objective (RPO)**: <= 5 minutes (Maximum acceptable data loss window).
- **Recovery Time Objective (RTO)**: <= 30 minutes (Maximum acceptable downtime).

### B. PostgreSQL Backup Strategy
1. **Automated Continuous Archiving (WAL Streaming)**:
   - Enable PostgreSQL Write-Ahead Logging (WAL) archiving to an isolated, encrypted S3 bucket.
   - Provides Point-in-Time Recovery (PITR) up to the second before any accidental data corruption or incident.
2. **Daily Logical & Physical Snapshots**:
   - Automated nightly `pg_dump` with encryption (`AES-256`) and multi-region replication.
   - Automated snapshot retention policy: 7 daily, 4 weekly, and 12 monthly backups for medical compliance.
3. **Disaster Recovery Drills**:
   - Quarterly automated restoration drills verifying backup checksums and schema integrity.

### C. High Availability (HA) Topology
- **Primary-Replica Architecture**:
  - PostgreSQL configured with one read-write primary and one synchronous read replica in a secondary availability zone.
  - Automatic failover using tools such as Patroni or managed cloud RDS Multi-AZ.
- **Stateless Application Tier**:
  - The Node.js application containers are completely stateless.
  - Containers can be scaled horizontally behind an Application Load Balancer across multiple availability zones.
- **Redis High Availability**:
  - Redis configured as a Sentinel cluster or Managed Redis Multi-AZ with in-memory persistence (`AOF` enabled).
