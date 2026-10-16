import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import { summarizeResearch } from './ai.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const SCRAPE_TIMEOUT_MS = 10_000;
const MAX_CHARS_PER_SOURCE = 5_000;

// ─── 1. Search DuckDuckGo HTML endpoint (no API key) ────
async function search(query, n) {
  const url =
    'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);

  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!res.ok) {
    throw new Error(`search failed: HTTP ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const urls = [];
  $('a.result__a').each((_, el) => {
    if (urls.length >= n) return false;
    let href = $(el).attr('href') || '';

    // DDG wraps links: //duckduckgo.com/l/?uddg=https%3A%2F%2F...
    const m = href.match(/uddg=([^&]+)/);
    if (m) href = decodeURIComponent(m[1]);

    if (href.startsWith('http')) urls.push(href);
  });

  return urls;
}

// ─── 2. Fetch + extract text from one URL ───────────────
async function scrape(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
      redirect: 'follow',
      signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
    });

    if (!res.ok) return `[scrape failed: HTTP ${res.status}]`;

    const ctype = res.headers.get('content-type') || '';
    if (!ctype.includes('text/html')) {
      return `[scrape skipped: content-type ${ctype}]`;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // Strip noise
    $('script, style, nav, footer, header, aside, form, noscript, iframe').remove();
    $('[role="navigation"], [role="banner"], .ads, .advertisement').remove();

    const text = $('body')
      .text()
      .replace(/\s+/g, ' ')
      .trim();

    return text.slice(0, MAX_CHARS_PER_SOURCE);
  } catch (err) {
    return `[scrape failed: ${err.message}]`;
  }
}

// ─── 3. Public entry point ──────────────────────────────
export async function research(query, maxSources = 5) {
  // search
  const urls = await search(query, maxSources);
  if (!urls.length) {
    return {
      summary: `No search results found for: "${query}"`,
      sources: [],
    };
  }

  // scrape in parallel, cap at 4 concurrent fetches
  const limit = pLimit(4);
  const docs = await Promise.all(
    urls.map((u) => limit(async () => [u, await scrape(u)]))
  );

  // summarize
  const summary = await summarizeResearch(query, docs);

  return { summary, sources: urls };
}