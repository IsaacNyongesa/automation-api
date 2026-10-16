import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Connection pool ────────────────────────────────────
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[pg] idle client error:', err.message);
});

// ─── Run schema on boot ─────────────────────────────────
export async function initDb() {
  const sql = fs.readFileSync(path.join(__dirname, 'db', 'init.sql'), 'utf8');
  await pool.query(sql);
  console.log('[db] schema ready');
}

// ─── Job helpers ────────────────────────────────────────
export async function startJob(kind, payload) {
  const { rows } = await pool.query(
    `INSERT INTO jobs (kind, payload, status)
     VALUES ($1, $2, 'running')
     RETURNING id`,
    [kind, payload]
  );
  return rows[0].id;
}

export async function finishJob(id, result, status = 'done', error = null) {
  await pool.query(
    `UPDATE jobs
       SET result = $2,
           status = $3,
           error  = $4,
           finished_at = now()
     WHERE id = $1`,
    [id, result, status, error]
  );
}

export async function failJob(id, errorMessage) {
  await finishJob(id, null, 'failed', errorMessage);
}

// ─── Convenience: recent jobs ───────────────────────────
export async function recentJobs(limit = 20) {
  const { rows } = await pool.query(
    `SELECT id, kind, status,
            payload->>'query' AS query,
            created_at, finished_at,
            CASE
              WHEN finished_at IS NOT NULL
              THEN EXTRACT(EPOCH FROM (finished_at - created_at))::int
            END AS duration_seconds
       FROM jobs
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit]
  );
  return rows;
}

// ─── Graceful shutdown ──────────────────────────────────
export async function closePool() {
  await pool.end();
}