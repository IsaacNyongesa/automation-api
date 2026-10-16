import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),

  openaiKey:   process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',

  apiKey: process.env.API_KEY,

  databaseUrl: process.env.DATABASE_URL,

  gmailCredentials: process.env.GMAIL_CREDENTIALS || 'credentials.json',
  gmailToken:       process.env.GMAIL_TOKEN       || 'token.json',

  labelMap: {
    urgent:     process.env.LABEL_URGENT     || 'Label_1',
    newsletter: process.env.LABEL_NEWSLETTER || 'Label_2',
    invoice:    process.env.LABEL_INVOICE    || 'Label_3',
    other:      process.env.LABEL_OTHER      || 'Label_4',
  },
};

// ─── Fail fast if critical vars are missing ────────────
const required = {
  OPENAI_API_KEY: config.openaiKey,
  API_KEY:        config.apiKey,
  DATABASE_URL:   config.databaseUrl,
};

const missing = Object.entries(required)
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length) {
  console.error('❌ Missing required env vars:', missing.join(', '));
  console.error('   Check your .env file.');
  process.exit(1);
}