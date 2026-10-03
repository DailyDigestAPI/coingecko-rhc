#!/usr/bin/env node
// Usage: node src/index.js [--fresh] [--no-render] [--date YYYY-MM-DD]
//   --fresh      ignore today's cache and re-pull everything (spends credits)
//   --no-render  collect + analyze only, write JSON, skip the HTML
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CoinGecko } from './cg.js';
import { collect } from './collect.js';
import { analyze } from './analyze.js';
import { deepen, historySnapshot } from './deepen.js';
import { buildNews } from './news.js';
import { narrate } from './narrate.js';
import { render } from './render.js';
import { CONFIG } from './config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(path.join(root, '.env'));

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const day = opt('--date', new Date().toISOString().slice(0, 10));
const tag = CONFIG.network === 'robinhood' ? '' : `-${CONFIG.network}`; // other chains get their own files and history
const log = (m) => console.error(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

const cg = new CoinGecko({
  apiKey: process.env.COINGECKO_API_KEY,
  cacheDir: path.join(root, 'data', 'cache', day + tag),
  concurrency: Number(process.env.CG_CONCURRENCY || 4),
  fresh: flag('--fresh'),
  log,
});

const dataDir = path.join(root, 'data');
const reportsDir = path.join(root, 'reports');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

const historyDir = path.join(dataDir, 'history', CONFIG.network);
fs.mkdirSync(historyDir, { recursive: true });

const raw = await collect(cg, { log });
const report = analyze(raw);
report.day = day;
report.config = CONFIG;
await deepen(cg, report, { log, historyDir });
buildNews(report, raw, { log, historyDir, dataDir });
narrate(report);
report.health = { calls: cg.stats.calls, cached: cg.stats.cached, failed: cg.stats.failed, credits: cg.stats.credits, failures: cg.failures.slice(0, 50) };
fs.writeFileSync(path.join(historyDir, `${day}.json`), JSON.stringify(historySnapshot(report), null, 1));

const jsonPath = path.join(dataDir, `${day}${tag}.json`);
fs.writeFileSync(jsonPath, JSON.stringify(stripBulk(report), null, 1));
log(`data: ${path.relative(root, jsonPath)}`);

if (!flag('--no-render')) {
  const html = render(report);
  const out = path.join(reportsDir, `${day}${tag}.html`);
  fs.writeFileSync(out, html);
  fs.writeFileSync(path.join(reportsDir, `latest${tag}.html`), html);
  log(`report: ${path.relative(root, out)}`);
}
log(`api: ${cg.stats.credits} credits spent, ${cg.stats.cached} served from cache, ${cg.stats.failed} failed/empty, ${raw.durationSec}s`);

// --- helpers ---
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
// Keep the JSON readable: drop the per-token candle/holder series and descriptions
function stripBulk(r) {
  const slim = (t) => { const { candles, holdersSeries, holders, info, momentum, topHolders, topTraders, whales, ...rest } = t; return { ...rest, holders: holders ? { ...holders, series: undefined } : null, info: info ? { ...info, description: undefined } : null, momentum: momentum ? { ...momentum, closes: undefined } : null, whales: whales ? { ...whales, list: undefined } : null }; };
  return { ...r, tokens: r.tokens.filter((t) => t.info).map(slim), overview: { ...r.overview, gainers: r.overview.gainers.map(slim), losers: r.overview.losers.map(slim), byVolume: r.overview.byVolume.map(slim), trending: r.overview.trending.map(slim) },
    newLaunches: { ...r.newLaunches, picks: r.newLaunches.picks.map(slim), runnersUp: r.newLaunches.runnersUp.map(slim), outsideWindow: r.newLaunches.outsideWindow.map(slim), belowWindow: r.newLaunches.belowWindow.map(slim) },
    accumulation: { ...r.accumulation, picks: r.accumulation.picks.map(slim) }, fading: { ...r.fading, picks: r.fading.picks.map(slim) }, avoid: r.avoid.map(slim),
    bands: r.bands.map((b) => ({ ...b, table: b.table.map(slim), setups: { ...b.setups, picks: b.setups.picks.map(slim), runnersUp: b.setups.runnersUp.map(slim) }, fading: { ...b.fading, picks: b.fading.picks.map(slim) } })),
    news: r.news ? { ...r.news, items: r.news.items.map(({ tokens, ...i }) => ({ ...i, tokens: tokens.map((t) => t.symbol) })), events: r.news.events.map(({ token, ...e }) => ({ ...e, token: token?.symbol || null })) } : null,
    notable: Object.fromEntries(Object.entries(r.notable).map(([k, v]) => [k, Array.isArray(v) && v[0]?.pools ? v.map(slim) : v])) };
}
