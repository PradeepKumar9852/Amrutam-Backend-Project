# Amrutam Telemedicine Backend - Docker & CI/CD Guide

This guide explains how to run the Amrutam Telemedicine Backend and PostgreSQL database using Docker and Docker Compose for local development, as well as how automated testing is configured via GitHub Actions.

---

## 1. Prerequisites

Before running with Docker, ensure you have:
1. **Docker Desktop** installed on your computer ([Download Docker Desktop](https://www.docker.com/products/docker-desktop/)).
2. Make sure Docker Desktop is started and running.

---

## 2. Environment Configuration

The application uses environment variables for all secrets and database connection strings.

1. In the project root, copy `.env.example` to `.env` (if not already present):
   ```bash
   cp .env.example .env
   ```
2. For Docker, `docker-compose.yml` automatically connects the `app` container to the `postgres` container using safe local defaults.
3. You can customize any variable in your `.env` file:
   - `PORT`: Exposed API port (default: `5000`)
   - `POSTGRES_USER`: PostgreSQL username (default: `postgres`)
   - `POSTGRES_PASSWORD`: PostgreSQL password (default: `postgres_dev_password`)
   - `POSTGRES_DB`: PostgreSQL database name (default: `amrutam_telemedicine`)
   - `JWT_SECRET`: Secret key for JWT authentication (minimum 32 characters in production)

> [!IMPORTANT]
> Never commit `.env` or real production credentials to Git. The repository includes `.gitignore` and `.dockerignore` to keep secrets secure.

---

## 3. How to Start the Application with Docker

### Step 1: Build and Launch Containers
Run the following command in your terminal from the project root:
```bash
docker compose up --build -d
```

**What this does automatically:**
1. Downloads the lightweight `postgres:17-alpine` database and `redis:7-alpine` cache images.
2. Starts the PostgreSQL container with persistent storage (`postgres_data`) and Redis (`redis_data`).
3. Runs health checks (`pg_isready` for PostgreSQL and `redis-cli ping` for Redis) until both are healthy.
4. Builds the Node.js 22 multi-stage Docker image, compiling Prisma specifically for Linux.
5. Runs `npx prisma migrate deploy` automatically to create all database tables.
6. Starts the Express server on port `5000` connected to PostgreSQL and Redis.

### Step 2: Verify the Application is Running
Check the status of running containers:
```bash
docker compose ps
```

You should see `amrutam-postgres`, `amrutam-redis`, and `amrutam-api` all with status `Up (healthy)`.

### Step 3: Access the API & Documentation
Open your browser or API client (Postman / Thunder Client / cURL):
- **Health Check**: [http://localhost:5000/api/v1/health](http://localhost:5000/api/v1/health)
- **Interactive Swagger Documentation**: [http://localhost:5000/api-docs](http://localhost:5000/api-docs)
- **API Root**: [http://localhost:5000/](http://localhost:5000/)

### Step 4: View Real-Time Application Logs
To watch incoming HTTP requests and application output:
```bash
docker compose logs -f app
```
To view database logs:
```bash
docker compose logs -f postgres
```

---

## 4. How to Stop the Application

### Normal Shutdown (Preserves Database Data)
To stop the containers while keeping all registered users, bookings, and database records safe in the Docker volume:
```bash
docker compose down
```

### Complete Reset (Wipes Database Data)
If you ever want to completely reset the database to a fresh state:
```bash
docker compose down -v
```
*(The `-v` flag removes the `postgres_data` volume).*

---

## 5. Database Migrations Guide

The Amrutam backend uses Prisma ORM for database migrations.

### How Migrations Work in Docker
When `docker compose up` starts, it automatically executes:
```bash
npx prisma migrate deploy
```
This applies all existing migration files found in `prisma/migrations/` to the database without requiring any manual intervention or terminal prompts.

### Creating New Migrations During Development
If you update `prisma/schema.prisma` with a new model or field:
1. Make the change in `prisma/schema.prisma`.
2. Generate and apply a new migration locally:
   ```bash
   npm run prisma:migrate
   ```
   *(Prompts you for a migration name, e.g., `add_notification_table`)*.
3. Commit the new migration folder in `prisma/migrations/`.

### Viewing Data with Prisma Studio
To inspect your database records visually using Prisma Studio:
- **Local development**:
  ```bash
  npm run prisma:studio
  ```
  Opens [http://localhost:5555](http://localhost:5555).

---

## 6. Automated Continuous Integration (GitHub Actions)

A GitHub Actions workflow is configured in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

### What CI Checks on Every Push and Pull Request:
1. **Clean Environment**: Spawns an isolated Ubuntu Linux runner with a PostgreSQL 17 service container.
2. **Dependency Integrity**: Runs `npm ci` to verify package locks.
3. **Prisma Schema Validation**: Runs `npx prisma validate` to catch relationship or syntax mistakes.
4. **Database Migrations**: Applies `npx prisma migrate deploy` to ensure migrations execute cleanly.
5. **Full Automated Test Suite**: Executes `npm test` across all 5 test suites (Auth, Bookings, Prescriptions, Admin Analytics, Security & RBAC).
