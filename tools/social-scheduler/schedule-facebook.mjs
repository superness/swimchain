/**
 * schedule-facebook.mjs — schedule the Facebook posts from the social-2026H2
 * monthly bank as native scheduled posts on a Facebook Page via the Graph API.
 *
 * Posts are created UNPUBLISHED with a scheduled_publish_time, so they appear
 * in Meta Business Suite → Planner where they can be edited or deleted before
 * they go live. Nothing is published immediately.
 *
 * Env:
 *   FB_PAGE_ID      the Page id (Business Suite → Page settings, or the About page)
 *   FB_PAGE_TOKEN   a Page access token with pages_manage_posts
 *   START_DATE      first posting day, YYYY-MM-DD (default 2026-08-04)
 *   POST_TIME       local hour:minute 24h for every post (default 10:00)
 *   TZ_OFFSET       hours from UTC for POST_TIME (default -4, US Eastern DST)
 *   DRY_RUN=1       print the full plan, call nothing
 *   ONLY_MONTH      restrict to one month file (e.g. august)
 *
 * Usage:
 *   DRY_RUN=1 node schedule-facebook.mjs         # review the plan
 *   FB_PAGE_ID=... FB_PAGE_TOKEN=... node schedule-facebook.mjs
 *
 * Getting a token (one-time, ~3 minutes, done by the page owner):
 *   1. developers.facebook.com → create an app (type: Business).
 *   2. Graph API Explorer → select the app → Get Page Access Token → grant
 *      pages_manage_posts (+ pages_read_engagement) → choose your Page.
 *   3. (Optional but recommended) exchange for a long-lived token:
 *      GET /oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID
 *          &client_secret=APP_SECRET&fb_exchange_token=SHORT_TOKEN
 */

import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BANK = path.resolve(__dirname, '../../docs/marketing/social-2026H2');

const MONTH_ORDER = ['august', 'september', 'october', 'november', 'december', 'january'];
const PAGE_ID = process.env.FB_PAGE_ID || '';
const TOKEN = process.env.FB_PAGE_TOKEN || '';
const START_DATE = process.env.START_DATE || '2026-08-04';
const POST_TIME = process.env.POST_TIME || '10:00';
const TZ_OFFSET = Number(process.env.TZ_OFFSET ?? -4);
const DRY = process.env.DRY_RUN === '1';
const ONLY = process.env.ONLY_MONTH || '';

/** Parse one month markdown into [{week, title, facebook}] */
function parseMonth(file) {
  const src = readFileSync(path.join(BANK, file), 'utf-8');
  const pieces = [];
  const sections = src.split(/^## /m).slice(1);
  for (const sec of sections) {
    const header = sec.split('\n', 1)[0]; // "Week N — Title"
    const m = header.match(/Week (\d+) — (.+)/);
    if (!m) continue;
    const fb = sec.split('**Facebook**')[1]?.split('**Visual:**')[0]?.trim();
    if (!fb) continue;
    pieces.push({ week: Number(m[1]), title: m[2].trim(), message: fb });
  }
  return pieces;
}

/** Tue/Thu cadence: two slots per week starting from START_DATE's week. */
function scheduleDates(count, startIso) {
  const [h, min] = POST_TIME.split(':').map(Number);
  const start = new Date(`${startIso}T00:00:00Z`);
  // normalize to the Tuesday of the start week
  const day = start.getUTCDay();
  const toTue = (2 - day + 7) % 7;
  const tue = new Date(start.getTime() + toTue * 86400_000);
  const out = [];
  let week = 0;
  while (out.length < count) {
    for (const offset of [0, 2]) { // Tue, Thu
      if (out.length >= count) break;
      const d = new Date(tue.getTime() + (week * 7 + offset) * 86400_000);
      d.setUTCHours(h - TZ_OFFSET, min, 0, 0);
      out.push(d);
    }
    week++;
  }
  return out;
}

const files = MONTH_ORDER.filter(m => !ONLY || m === ONLY)
  .map(m => `${m}.md`)
  .filter(f => readdirSync(BANK).includes(f));

const posts = files.flatMap(f =>
  parseMonth(f).map(p => ({ ...p, month: f.replace('.md', '') }))
);
const dates = scheduleDates(posts.length, START_DATE);
posts.forEach((p, i) => { p.when = dates[i]; });

console.log(`${posts.length} Facebook posts → Tue/Thu ${POST_TIME} (UTC${TZ_OFFSET >= 0 ? '+' : ''}${TZ_OFFSET})`);
for (const p of posts) {
  console.log(`  ${p.when.toISOString()}  [${p.month} w${p.week}] ${p.title}`);
}

if (DRY) {
  console.log('\nDRY RUN — nothing scheduled. First post preview:\n');
  console.log(posts[0]?.message);
  process.exit(0);
}

if (!PAGE_ID || !TOKEN) {
  console.error('\nFB_PAGE_ID and FB_PAGE_TOKEN are required to schedule. Run with DRY_RUN=1 to preview.');
  process.exit(1);
}

const now = Date.now() / 1000;
let ok = 0;
for (const p of posts) {
  const ts = Math.floor(p.when.getTime() / 1000);
  if (ts < now + 15 * 60) {
    console.log(`skip (must be >=15min in the future): ${p.title}`);
    continue;
  }
  const res = await fetch(`https://graph.facebook.com/v21.0/${PAGE_ID}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: p.message,
      published: false,
      scheduled_publish_time: ts,
      access_token: TOKEN,
    }),
  });
  const j = await res.json();
  if (j.id) {
    ok++;
    console.log(`scheduled ${p.when.toISOString()}  ${p.title}  -> ${j.id}`);
  } else {
    console.error(`FAILED ${p.title}:`, JSON.stringify(j.error || j).slice(0, 300));
  }
  await new Promise(r => setTimeout(r, 800)); // gentle on the API
}
console.log(`\n${ok}/${posts.length} scheduled. Review them in Meta Business Suite → Planner.`);
