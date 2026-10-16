import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CREDENTIALS_PATH = path.join(ROOT, 'credentials.json');
const TOKEN_PATH       = path.join(ROOT, 'token.json');

const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

// Labels we want to auto-create if they don't exist
const WANTED_LABELS = [
  'Automation/Urgent',
  'Automation/Newsletter',
  'Automation/Invoice',
  'Automation/Other',
];

async function main() {
  // ─── 1. Load credentials.json ─────────────────────────
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error(`❌ Missing ${CREDENTIALS_PATH}`);
    console.error('   Download it from Google Cloud → Credentials → OAuth client → Download JSON.');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const creds = raw.installed || raw.web;

  if (!creds) {
    console.error('❌ credentials.json has no "installed" or "web" section.');
    process.exit(1);
  }

  const { client_id, client_secret, redirect_uris } = creds;
  const redirectUri = (redirect_uris && redirect_uris[0]) || 'http://localhost';

  const oauth = new google.auth.OAuth2(client_id, client_secret, redirectUri);

  // ─── 2. Generate auth URL ─────────────────────────────
  const url = oauth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  console.log('\n──────────────────────────────────────────────');
  console.log('Open this URL in your browser:\n');
  console.log(url);
  console.log('──────────────────────────────────────────────\n');
  console.log('Sign in and approve access. Google will redirect you to a');
  console.log('URL like  http://localhost/?code=4/0Axxxx...  — the page');
  console.log('may fail to load. That is fine. Copy the "code" value');
  console.log('from the address bar (everything after "code=" and before "&").\n');

  // ─── 3. Ask user to paste the code ────────────────────
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let code = (await rl.question('Paste the code here: ')).trim();
  rl.close();

  // User might paste the full URL or URL-encoded code
  if (code.includes('code=')) {
    const m = code.match(/code=([^&]+)/);
    if (m) code = m[1];
  }
  code = decodeURIComponent(code);

  // ─── 4. Exchange code for tokens ──────────────────────
  let tokens;
  try {
    ({ tokens } = await oauth.getToken(code));
  } catch (err) {
    console.error('\n❌ Failed to exchange code for tokens:', err.message);
    console.error('   The code may have expired. Run the script again.');
    process.exit(1);
  }

  if (!tokens.refresh_token) {
    console.error('\n⚠️  No refresh_token returned.');
    console.error('   This usually means you approved before without the "prompt=consent" flag.');
    console.error('   Fix: go to https://myaccount.google.com/permissions , remove this app,');
    console.error('   then run this script again.');
    process.exit(1);
  }

  // ─── 5. Save token.json ───────────────────────────────
  const tokenFile = {
    client_id,
    client_secret,
    refresh_token: tokens.refresh_token,
  };
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenFile, null, 2));
  console.log(`\n✅ Saved refresh token to ${TOKEN_PATH}`);

  // ─── 6. Create labels + print their IDs ───────────────
  oauth.setCredentials(tokens);
  const gmail = google.gmail({ version: 'v1', auth: oauth });

  console.log('\nCreating/finding Gmail labels...\n');
  const ids = {};

  for (const name of WANTED_LABELS) {
    const id = await ensureLabel(gmail, name);
    ids[name] = id;
    console.log(`  ${name.padEnd(24)} → ${id}`);
  }

  console.log('\n──────────────────────────────────────────────');
  console.log('Paste these into your .env file:\n');
  console.log(`LABEL_URGENT=${ids['Automation/Urgent']}`);
  console.log(`LABEL_NEWSLETTER=${ids['Automation/Newsletter']}`);
  console.log(`LABEL_INVOICE=${ids['Automation/Invoice']}`);
  console.log(`LABEL_OTHER=${ids['Automation/Other']}`);
  console.log('──────────────────────────────────────────────\n');
  console.log('Done. You can now run:  npm start\n');
}

async function ensureLabel(gmail, name) {
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

main().catch((err) => {
  console.error('\n❌ Unexpected error:', err);
  process.exit(1);
});