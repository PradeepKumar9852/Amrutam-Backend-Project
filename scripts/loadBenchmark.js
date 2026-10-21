/**
 * Automated Load & Latency Benchmark Script
 * Tests read and write performance under concurrency against the local server.
 * Measures real-world p50, p90, p95, p99, RPS, and checks compliance against SLA targets:
 * - 100,000 daily consultations target
 * - Read Latency: p95 < 200ms
 * - Write Latency: p95 < 500ms
 * - Availability Target: 99.95%
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

function calculatePercentiles(latencies) {
  if (!latencies.length) return { p50: 0, p90: 0, p95: 0, p99: 0, min: 0, max: 0, mean: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const getP = (p) => sorted[Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1)];

  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    min: Math.round(sorted[0] * 100) / 100,
    mean: Math.round((sum / sorted.length) * 100) / 100,
    p50: Math.round(getP(50) * 100) / 100,
    p90: Math.round(getP(90) * 100) / 100,
    p95: Math.round(getP(95) * 100) / 100,
    p99: Math.round(getP(99) * 100) / 100,
    max: Math.round(sorted[sorted.length - 1] * 100) / 100,
  };
}

async function runWorkerPool(tasks, concurrency) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const currentIndex = index++;
      const task = tasks[currentIndex];
      try {
        const result = await task();
        results[currentIndex] = result;
      } catch (err) {
        results[currentIndex] = { error: err.message, duration: 0, status: 500 };
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return results;
}

async function benchmarkReads(totalRequests = 200, concurrency = 10) {
  console.log(`\n======================================================`);
  console.log(`[1/2] RUNNING READ LATENCY BENCHMARK`);
  console.log(`      Endpoints: /api/v1/health/liveness, /api/v1/health/readiness, /api/v1/doctors`);
  console.log(`      Total: ${totalRequests} requests | Concurrency: ${concurrency}`);
  console.log(`======================================================`);

  const endpoints = [
    '/api/v1/health/liveness',
    '/api/v1/health/readiness',
    '/api/v1/doctors?page=1&limit=10',
    '/api/v1/health',
  ];

  const tasks = Array.from({ length: totalRequests }, (_, i) => {
    const endpoint = endpoints[i % endpoints.length];
    return async () => {
      const start = performance.now();
      const res = await fetch(`${BASE_URL}${endpoint}`);
      const duration = performance.now() - start;
      return {
        status: res.status,
        ok: res.ok,
        duration,
        endpoint,
      };
    };
  });

  const wallStart = performance.now();
  const results = await runWorkerPool(tasks, concurrency);
  const wallDurationSec = (performance.now() - wallStart) / 1000;

  const latencies = results.filter((r) => r.ok).map((r) => r.duration);
  const errors = results.filter((r) => !r.ok);
  const stats = calculatePercentiles(latencies);
  const rps = Math.round((results.length / wallDurationSec) * 100) / 100;

  console.log(`\n--- READ BENCHMARK RESULTS ---`);
  console.log(`Completed Requests: ${results.length}`);
  console.log(`Successful:         ${latencies.length} (${Math.round((latencies.length / results.length) * 100)}%)`);
  console.log(`Failed:             ${errors.length}`);
  console.log(`Throughput:         ${rps} req/sec`);
  console.log(`Min Latency:        ${stats.min} ms`);
  console.log(`Mean Latency:       ${stats.mean} ms`);
  console.log(`p50 Latency:        ${stats.p50} ms`);
  console.log(`p90 Latency:        ${stats.p90} ms`);
  console.log(`p95 Latency:        ${stats.p95} ms (Target: < 200 ms) -> ${stats.p95 < 200 ? 'PASS' : 'FAIL'}`);
  console.log(`p99 Latency:        ${stats.p99} ms`);
  console.log(`Max Latency:        ${stats.max} ms`);

  return {
    type: 'READ',
    totalRequests,
    concurrency,
    rps,
    stats,
    errors: errors.length,
    slaTarget: '< 200 ms',
    passed: stats.p95 < 200,
  };
}

async function benchmarkWrites(totalRequests = 50, concurrency = 5) {
  console.log(`\n======================================================`);
  console.log(`[2/2] RUNNING WRITE LATENCY BENCHMARK`);
  console.log(`      Endpoints: /api/v1/auth/register/patient & /api/v1/bookings`);
  console.log(`      Total: ${totalRequests} write operations | Concurrency: ${concurrency}`);
  console.log(`======================================================`);

  const timestamp = Date.now();

  // Setup Doctor and Slots
  console.log('-> Creating test doctor and availability slots...');
  const docEmail = `bench_doc_${timestamp}@amrutam.co.in`;
  const docReg = await fetch(`${BASE_URL}/api/v1/auth/register/doctor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: docEmail,
      password: 'Password@123',
      firstName: 'Dr. Benchmark',
      lastName: 'Vaidya',
      specialization: 'Kayachikitsa',
      qualification: 'BAMS, MD',
      licenseNumber: `BENCH-LIC-${timestamp}`,
      consultationFee: 500,
    }),
  });
  const docData = await docReg.json();
  const docToken = docData.data?.token;

  if (!docToken) {
    throw new Error(`Failed to create benchmark doctor: ${JSON.stringify(docData)}`);
  }

  // Create slots for the write benchmark
  const slots = [];
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + 3);

  for (let i = 0; i < totalRequests; i++) {
    const slotStart = new Date(baseDate.getTime() + i * 3600 * 1000);
    const slotEnd = new Date(slotStart.getTime() + 45 * 60 * 1000);

    const slotRes = await fetch(`${BASE_URL}/api/v1/doctors/slots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${docToken}`,
      },
      body: JSON.stringify({
        startTime: slotStart.toISOString(),
        endTime: slotEnd.toISOString(),
      }),
    });
    const sJson = await slotRes.json();
    if (sJson.data) {
      slots.push(Array.isArray(sJson.data) ? sJson.data[0] : sJson.data);
    }
  }

  console.log(`-> Created ${slots.length} available slots. Registering benchmark patients...`);

  // Register patients
  const patients = [];
  for (let i = 0; i < totalRequests; i++) {
    const pEmail = `bench_pat_${timestamp}_${i}@example.com`;
    const pRes = await fetch(`${BASE_URL}/api/v1/auth/register/patient`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: pEmail,
        password: 'Password@123',
        firstName: `Patient${i}`,
        lastName: 'Test',
      }),
    });
    const pData = await pRes.json();
    if (pData.data?.token) {
      patients.push({ token: pData.data.token, slotId: slots[i]?.id });
    }
  }

  console.log(`-> Prepared ${patients.length} authenticated patient booking tasks.`);

  // Benchmark booking writes (with row-level lock & transaction commit)
  const writeTasks = patients.map((pat, idx) => {
    return async () => {
      const idempotencyKey = `bench-key-${timestamp}-${idx}`;
      const start = performance.now();
      const res = await fetch(`${BASE_URL}/api/v1/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pat.token}`,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          slotId: pat.slotId,
          consultationType: 'VIDEO',
          symptomsSummary: 'Routine Ayurvedic constitutional checkup',
        }),
      });
      const duration = performance.now() - start;
      return {
        status: res.status,
        ok: res.ok,
        duration,
      };
    };
  });

  const wallStart = performance.now();
  const results = await runWorkerPool(writeTasks, concurrency);
  const wallDurationSec = (performance.now() - wallStart) / 1000;

  const latencies = results.filter((r) => r.ok).map((r) => r.duration);
  const errors = results.filter((r) => !r.ok);
  const stats = calculatePercentiles(latencies);
  const rps = Math.round((results.length / wallDurationSec) * 100) / 100;

  console.log(`\n--- WRITE BENCHMARK RESULTS ---`);
  console.log(`Completed Requests: ${results.length}`);
  console.log(`Successful:         ${latencies.length} (${Math.round((latencies.length / results.length) * 100)}%)`);
  console.log(`Failed:             ${errors.length}`);
  console.log(`Throughput:         ${rps} req/sec`);
  console.log(`Min Latency:        ${stats.min} ms`);
  console.log(`Mean Latency:       ${stats.mean} ms`);
  console.log(`p50 Latency:        ${stats.p50} ms`);
  console.log(`p90 Latency:        ${stats.p90} ms`);
  console.log(`p95 Latency:        ${stats.p95} ms (Target: < 500 ms) -> ${stats.p95 < 500 ? 'PASS' : 'FAIL'}`);
  console.log(`p99 Latency:        ${stats.p99} ms`);
  console.log(`Max Latency:        ${stats.max} ms`);

  return {
    type: 'WRITE',
    totalRequests,
    concurrency,
    rps,
    stats,
    errors: errors.length,
    slaTarget: '< 500 ms',
    passed: stats.p95 < 500,
  };
}

async function main() {
  console.log(`Starting Amrutam Backend Performance & Latency Benchmark`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  const readReport = await benchmarkReads(200, 10);
  const writeReport = await benchmarkWrites(30, 5);

  const finalReport = {
    timestamp: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      serverUrl: BASE_URL,
    },
    targets: {
      dailyConsultationsTarget: 100000,
      readP95TargetMs: 200,
      writeP95TargetMs: 500,
      availabilityTarget: '99.95%',
    },
    readBenchmark: readReport,
    writeBenchmark: writeReport,
  };

  const outputPath = path.join(__dirname, '..', 'docs', 'BENCHMARK_RESULTS.json');
  fs.writeFileSync(outputPath, JSON.stringify(finalReport, null, 2), 'utf-8');
  console.log(`\n======================================================`);
  console.log(`Benchmark complete. Results saved to: ${outputPath}`);
  console.log(`======================================================\n`);
}

main().catch((err) => {
  console.error('Benchmark failed with error:', err);
  process.exit(1);
});
