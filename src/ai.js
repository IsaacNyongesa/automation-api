import OpenAI from 'openai';
import pRetry from 'p-retry';
import { config } from './config.js';

// ─── Client ─────────────────────────────────────────────
const client = new OpenAI({ apiKey: config.openaiKey });

// ─── Core wrapper: retries on transient failures ────────
async function chat(system, user, { json = false, maxTokens = 1500 } = {}) {
  return pRetry(
    async () => {
      const res = await client.chat.completions.create({
        model: config.openaiModel,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: user },
        ],
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      });
      return res.choices[0].message.content;
    },
    {
      retries: 3,
      minTimeout: 1000,
      maxTimeout: 10000,
      onFailedAttempt: (err) => {
        console.warn(
          `[ai] attempt ${err.attemptNumber} failed: ${err.message} — retrying`
        );
      },
    }
  );
}

// ─── Prompt 1: classify an email ────────────────────────
const CLASSIFY_SYS = `You triage emails for a busy professional.

Return ONLY valid JSON in this exact shape:
{
  "category": "urgent" | "newsletter" | "invoice" | "other",
  "summary": "one clear sentence describing the email",
  "needs_reply": true | false,
  "draft": "reply text, or empty string if needs_reply is false"
}

Rules:
- "urgent": a real person needs a timely response
- "newsletter": marketing, digests, subscriptions, automated updates
- "invoice": receipts, bills, payment confirmations
- "other": everything else
- Only set "needs_reply": true if a human is clearly waiting on the user
- Drafts must be polite, under 120 words, and NEVER invent facts
- If unsure what to reply, still set needs_reply but leave draft as a
  short acknowledgement asking for clarification`;

export async function classifyEmail(body) {
  const cleaned = (body || '').slice(0, 4000);
  if (!cleaned.trim()) {
    return {
      category: 'other',
      summary: '(empty email)',
      needs_reply: false,
      draft: '',
    };
  }
  const out = await chat(CLASSIFY_SYS, cleaned, { json: true, maxTokens: 800 });
  try {
    return JSON.parse(out);
  } catch {
    console.warn('[ai] classifyEmail returned non-JSON, using fallback');
    return {
      category: 'other',
      summary: cleaned.slice(0, 120),
      needs_reply: false,
      draft: '',
    };
  }
}

// ─── Prompt 2: summarize research sources ───────────────
const RESEARCH_SYS = `You are a research assistant.

Given a user query and the text of several web sources, produce a clean briefing.

Format:
- Start with a 2-3 sentence overview.
- Then 4-8 bullet points with concrete facts.
- Cite sources inline using [1], [2], etc.
- If sources conflict, say so explicitly.
- End with a "Sources" section listing each [n] and its URL.

Be concise. Do not invent information not present in the sources.
If the sources are mostly useless, say so honestly.`;

export async function summarizeResearch(query, docs) {
  const usable = docs.filter(([, text]) => text && !text.startsWith('[scrape failed'));
  const joined = usable
    .map(([url, text], i) => `[${i + 1}] ${url}\n${text}`)
    .join('\n\n---\n\n');

  if (!usable.length) {
    return `No usable sources found for: "${query}".\n\nTry a different query or increase maxSources.`;
  }

  return chat(
    RESEARCH_SYS,
    `Query: ${query}\n\nSources:\n\n${joined}`,
    { maxTokens: 2000 }
  );
}