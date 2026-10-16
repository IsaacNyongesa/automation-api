-- ─── jobs table ─────────────────────────────────────────
-- Logs every API request: triage / research / etc.
CREATE TABLE IF NOT EXISTS jobs (
  id          BIGSERIAL PRIMARY KEY,
  kind        TEXT NOT NULL,
  payload     JSONB NOT NULL,
  result      JSONB,
  status      TEXT NOT NULL DEFAULT 'running',
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,

  CONSTRAINT jobs_status_check
    CHECK (status IN ('running', 'done', 'failed'))
);

-- ─── Indexes ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS jobs_kind_created_idx
  ON jobs (kind, created_at DESC);

CREATE INDEX IF NOT EXISTS jobs_status_idx
  ON jobs (status)
  WHERE status <> 'done';

-- GIN index so we can query inside payload/result JSONB
CREATE INDEX IF NOT EXISTS jobs_payload_gin
  ON jobs USING GIN (payload);

-- ─── View: recent jobs ──────────────────────────────────
CREATE OR REPLACE VIEW recent_jobs AS
SELECT
  id,
  kind,
  status,
  payload->>'query'   AS query,
  payload->>'maxEmails' AS max_emails,
  created_at,
  finished_at,
  CASE
    WHEN finished_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (finished_at - created_at))::int
    ELSE NULL
  END AS duration_seconds
FROM jobs
ORDER BY created_at DESC
LIMIT 100;