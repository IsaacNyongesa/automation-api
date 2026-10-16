import express from 'express';
import { config } from './config.js';
import { requireApiKey } from './auth.js';
import { triageSchema, researchSchema, formatZodError } from './schemas.js';
import { initDb, startJob, finishJob, failJob, recentJobs, closePool } from './store.js';
import {
  getGmail, extractText, getHeader, extractEmail,
  listUnread, fetchMessage, applyLabel, saveDraft,
} from './gmail.js';
import { classifyEmail } from './ai.js';
import { research } from './researcher.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

// ─── Health ─────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// ─── POST /inbox/triage ─────────────────────────────────
app.post('/inbox/triage', requireApiKey, async (req, res) => {
  const parsed = triageSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(formatZodError(parsed.error));
  }

  const { maxEmails, dryRun, query } = parsed.data;
  const jobId = await startJob('triage', { maxEmails, dryRun, query });

  try {
    const gmail = getGmail();
    const messages = await listUnread(gmail, { max: maxEmails, query });

    const results = [];

    for (const m of messages) {
      const full = await fetchMessage(gmail, m.id);
      const body = extractText(full);
      const subject = getHeader(full, 'Subject') || '(no subject)';
      const from = getHeader(full, 'From');

      const ai = await classifyEmail(body);
      const labelId = config.labelMap[ai.category] || config.labelMap.other;

      let draftSaved = false;

      if (!dryRun) {
        await applyLabel(gmail, m.id, labelId, { markRead: true });

        if (ai.needs_reply && ai.draft) {
          await saveDraft(gmail, {
            to: extractEmail(from),
            subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
            body: ai.draft,
          });
          draftSaved = true;
        }
      }

      results.push({
        emailId: m.id,
        subject,
        from,
        category: ai.category,
        summary: ai.summary,
        needsReply: !!ai.needs_reply,
        draftSaved,
      });
    }

    await finishJob(jobId, { count: results.length, results });
    res.json({ jobId, count: results.length, results });
  } catch (err) {
    console.error('[triage] failed:', err);
    await failJob(jobId, err.message);
    res.status(500).json({ error: 'triage_failed', message: err.message });
  }
});

// ─── POST /research ─────────────────────────────────────
app.post('/research', requireApiKey, async (req, res) => {
  const parsed = researchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(formatZodError(parsed.error));
  }

  const { query, maxSources } = parsed.data;
  const jobId = await startJob('research', { query, maxSources });

  try {
    const { summary, sources } = await research(query, maxSources);
    const result = { query, summary, sources };

    await finishJob(jobId, result);
    res.json({ jobId, ...result });
  } catch (err) {
    console.error('[research] failed:', err);
    await failJob(jobId, err.message);
    res.status(500).json({ error: 'research_failed', message: err.message });
  }
});

// ─── GET /jobs ──────────────────────────────────────────
app.get('/jobs', requireApiKey, async (req, res) => {
  try {
    const jobs = await recentJobs(20);
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Global error handler ───────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'internal_error' });
});

// ─── 404 ────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

// ─── Boot ───────────────────────────────────────────────
async function boot() {
  try {
    await initDb();
  } catch (err) {
    console.error('❌ Failed to initialise database:', err.message);
    console.error('   Is Postgres running? Check DATABASE_URL in .env');
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    console.log(`✅ API listening on http://localhost:${config.port}`);
    console.log(`   Model: ${config.openaiModel}`);
    console.log(`   Endpoints: POST /inbox/triage, POST /research, GET /jobs, GET /health`);
  });

  // ─── Graceful shutdown ────────────────────────────────
  const shutdown = async (signal) => {
    console.log(`\n[${signal}] shutting down...`);
    server.close(async () => {
      await closePool();
      console.log('[shutdown] clean exit');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

boot();