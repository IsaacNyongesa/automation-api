import fs from 'node:fs';
import { google } from 'googleapis';
import { config } from './config.js';

const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

// ─── Auth: use refresh token from token.json ────────────
export function getGmail() {
  if (!fs.existsSync(config.gmailToken)) {
    throw new Error(
      `Gmail token not found at "${config.gmailToken}". ` +
      `Run "npm run gmail-auth" once to authorize.`
    );
  }

  const token = JSON.parse(fs.readFileSync(config.gmailToken, 'utf8'));
  const oauth = new google.auth.OAuth2(token.client_id, token.client_secret);
  oauth.setCredentials({ refresh_token: token.refresh_token });

  return google.gmail({ version: 'v1', auth: oauth });
}

// ─── Extract plaintext body from a Gmail message ────────
export function extractText(message) {
  const parts = message.payload?.parts || [message.payload];

  // Prefer text/plain
  for (const p of parts) {
    if (p.mimeType === 'text/plain' && p.body?.data) {
      return Buffer.from(p.body.data, 'base64').toString('utf8');
    }
  }

  // Fall back to text/html (strip tags quickly)
  for (const p of parts) {
    if (p.mimeType === 'text/html' && p.body?.data) {
      const html = Buffer.from(p.body.data, 'base64').toString('utf8');
      return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  // Multipart: recurse one level into sub-parts
  for (const p of parts) {
    if (p.parts) {
      const nested = extractText({ payload: { parts: p.parts } });
      if (nested) return nested;
    }
  }

  return '';
}

// ─── Read a header value (case-insensitive) ─────────────
export function getHeader(message, name) {
  const headers = message.payload?.headers || [];
  const h = headers.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value || '';
}

// ─── Extract bare email address from "Name <a@b.com>" ───
export function extractEmail(fromHeader) {
  const match = fromHeader.match(/<([^>]+)>/);
  return match ? match[1] : fromHeader.trim();
}

// ─── List unread messages matching a Gmail query ────────
export async function listUnread(gmail, { max = 20, query = 'is:unread' } = {}) {
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: max,
  });
  return res.data.messages || [];
}

// ─── Fetch a full message ───────────────────────────────
export async function fetchMessage(gmail, id) {
  const res = await gmail.users.messages.get({
    userId: 'me',
    id,
    format: 'full',
  });
  return res.data;
}

// ─── Apply a label (and optionally mark read) ───────────
export async function applyLabel(gmail, id, labelId, { markRead = true } = {}) {
  const requestBody = {
    addLabelIds: [labelId],
  };
  if (markRead) {
    requestBody.removeLabelIds = ['UNREAD'];
  }
  await gmail.users.messages.modify({
    userId: 'me',
    id,
    requestBody,
  });
}

// ─── Save a draft reply ─────────────────────────────────
export async function saveDraft(gmail, { to, subject, body }) {
  const mime = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body,
  ].join('\r\n');

  const raw = Buffer.from(mime).toString('base64url');

  await gmail.users.drafts.create({
    userId: 'me',
    requestBody: { message: { raw } },
  });
}

// ─── Find a label by name, create it if missing ─────────
export async function ensureLabel(gmail, name) {
  const res = await gmail.users.labels.list({ userId: 'me' });
  const existing = (res.data.labels || []).find(
    (l) => l.name.toLowerCase() === name.toLowerCase()
  );
  if (existing) return existing.id;

  const created = await gmail.users.labels.create({
    userId: 'me',
    requestBody: {
      name,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
    },
  });
  return created.data.id;
}