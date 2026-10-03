// Page 1 "What's happening": headlines and on-chain events, not stats.
// Two sources, both CoinGecko:
//  1. /news — a global feed (20 pages × 20 items, roughly the last half day). Items are kept only when the
//     title matches the chain keywords or the item is tagged with a coin we track on this chain. Matches are
//     persisted in data/news/<network>.json so coverage compounds across daily runs.
//  2. Day-over-day diff of the tracked universe (from data/history/<network>/) — new arrivals, big launches,
//     liquidity pulled, market-cap thresholds crossed, new exchange listings — plus /search/trending overlap.
// Tone (good / bad / neutral) is a keyword rule, printed with the item. It is not sentiment analysis.
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.js';

const C = CONFIG.news;

export function buildNews(report, raw, { historyDir, dataDir, log = () => {} } = {}) {
  const now = Date.parse(report.generatedAt);
  const tracked = new Map(report.tokens.filter((t) => t.cgId).map((t) => [t.cgId, t]));

  // ---- 1. Feed items ----
  const fresh = [];
  for (const x of raw.news || []) {
    const title = x.title || '';
    const byKeyword = C.match.test(title);
    const coins = (x.related_coin_ids || []).filter((id) => tracked.has(id));
    if (!byKeyword && !coins.length) continue;
    if (C.exclude.test(title)) continue;
    fresh.push({
      title, url: x.url, source: x.source_name || x.author || null, postedAt: x.posted_at,
      coins, matchedBy: byKeyword ? 'keyword' : 'coin', tone: tone(title), seenDay: report.day,
    });
  }
  const store = loadStore(dataDir, report.network);
  const byUrl = new Map(store.map((i) => [i.url, i]));
  for (const i of fresh) if (!byUrl.has(i.url)) byUrl.set(i.url, i);
  const merged = [...byUrl.values()].filter((i) => now - Date.parse(i.postedAt) < C.keepDays * 864e5).sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));
  saveStore(dataDir, report.network, merged);
  const items = merged.filter((i) => now - Date.parse(i.postedAt) < C.windowHours * 36e5).slice(0, C.maxItems)
    .map((i) => ({ ...i, tokens: i.coins.map((id) => tracked.get(id)).filter(Boolean), hoursAgo: (now - Date.parse(i.postedAt)) / 36e5 }));

  // ---- 2. On-chain events ----
  const prev = loadPrev(historyDir, report.day);
  const events = [];
  const add = (kind, tone, text, token = null, value = null) => events.push({ kind, tone, text, token, value });

  // Existing coins arriving on this chain: a coin CoinGecko has listed for a while whose first pool here is new
  for (const t of report.tokens) {
    if (!t.coin?.listedAt || t.ageHours == null) continue;
    const listedDays = (now - Date.parse(t.coin.listedAt)) / 864e5;
    if (t.ageHours <= C.arrivedMaxAgeHours && listedDays >= C.arrivedMinListedDays) add('arrived', 'good', `${t.symbol} deployed here ${hrs(t.ageHours)} ago — on CoinGecko since ${t.coin.listedAt.slice(0, 10)}${t.coin.cexListings?.length ? `, trades on ${t.coin.cexListings.slice(0, 2).join(', ')}` : ''}. $${k(t.liquidity)} of liquidity already.`, t, t.liquidity);
  }
  // Big launches: brand new and already deep
  for (const t of report.tokens) {
    if (t.ageHours != null && t.ageHours <= 24 && t.liquidity >= C.bigLaunchLiquidityUsd && !events.some((e) => e.token === t)) add('big-launch', 'neutral', `${t.symbol} launched ${hrs(t.ageHours)} ago with $${k(t.liquidity)} of liquidity and $${k(t.vol24)} traded — big for a day-one pool here.`, t, t.liquidity);
  }
  if (prev?.universe) {
    const today = new Map(report.tokens.map((t) => [t.address, t]));
    const yday = new Map(prev.universe.map((u) => [u.address, u]));
    // Liquidity pulled
    for (const u of prev.universe) {
      if ((u.liquidity || 0) < C.pulledMinLiquidityUsd) continue;
      const t = today.get(u.address);
      const liq = t ? t.liquidity : null;
      if (liq == null) add('pulled', 'bad', `${u.symbol} is out of the universe — it had $${k(u.liquidity)} of liquidity yesterday and no pool with $${k(CONFIG.universe.minReserveUsd)}+ shows today.`, null, u.liquidity);
      else if (liq <= u.liquidity * (1 - C.pulledDropPct / 100)) add('pulled', 'bad', `${u.symbol} lost ${Math.round((1 - liq / u.liquidity) * 100)}% of its liquidity since yesterday: $${k(u.liquidity)} → $${k(liq)}.`, t, u.liquidity - liq);
    }
    // Liquidity added
    for (const t of report.tokens) {
      const u = yday.get(t.address);
      if (!u?.liquidity || u.liquidity < 5_000) continue;
      const add$ = t.liquidity - u.liquidity;
      if (add$ >= C.addedMinUsd && add$ / u.liquidity >= C.addedMinPct / 100) add('added', 'good', `${t.symbol} added $${k(add$)} of liquidity since yesterday (+${Math.round((add$ / u.liquidity) * 100)}%): $${k(u.liquidity)} → $${k(t.liquidity)}.`, t, add$);
    }
    // Market-cap thresholds crossed
    for (const t of report.tokens) {
      const u = yday.get(t.address);
      const a = u?.mcap, b = t.mcap || t.fdv;
      if (!a || !b) continue;
      if (b < a * 0.02 && t.vol24 > 50_000) continue; // a 98% market-cap drop on a token still doing real volume is a bad supply figure, not news; liquidity events cover real deaths
      for (const th of C.mcapThresholds) {
        if (a < th && b >= th) add('crossed-up', 'good', `${t.symbol} crossed $${k(th)} market cap ($${k(a)} → $${k(b)}).`, t, b);
        else if (a >= th && b < th) add('crossed-down', 'bad', `${t.symbol} fell back under $${k(th)} market cap ($${k(a)} → $${k(b)}).`, t, a);
      }
    }
    // New exchange listings
    for (const t of report.tokens) {
      const u = yday.get(t.address);
      if (!u || !t.coin || !u.cex || u.cex.length >= 8) continue; // the stored list is capped at 8 markets; a capped list cannot prove a listing is new
      const newCex = (t.coin.cexListings || []).filter((m) => !(u.cex || []).includes(m));
      if (newCex.length) add('listed', 'good', `${t.symbol} is now tradeable on ${newCex.join(', ')} — not there yesterday.`, t, t.vol24);
    }
    // Chain totals
    if (prev.totals) {
      const dL = report.overview.totalLiquidity - prev.totals.liquidity;
      if (Math.abs(dL) / prev.totals.liquidity >= C.chainLiquidityPct / 100) add('chain', dL > 0 ? 'good' : 'bad', `Meme liquidity on the chain ${dL > 0 ? 'grew' : 'shrank'} $${k(Math.abs(dL))} since yesterday (${pct((dL / prev.totals.liquidity) * 100)}): $${k(prev.totals.liquidity)} → $${k(report.overview.totalLiquidity)}.`, null, Math.abs(dL));
      const dN = report.overview.memesTracked - prev.totals.memes;
      if (Math.abs(dN) >= C.chainTokensDelta) add('chain', dN > 0 ? 'neutral' : 'bad', `${Math.abs(dN)} ${dN > 0 ? 'more' : 'fewer'} memes with real activity than yesterday (${prev.totals.memes} → ${report.overview.memesTracked}).`, null, Math.abs(dN));
    }
  }
  // Global trending overlap
  const trendingGlobal = (raw.trendingGlobal || []).filter((id) => tracked.has(id)).map((id) => tracked.get(id));
  for (const t of trendingGlobal) add('trending', 'good', `${t.symbol} is on CoinGecko's global trending list right now — attention from outside the chain.`, t, t.vol24);
  // Rugs confirmed by yesterday's revisit
  for (const row of report.yesterday?.rows || []) {
    if (['rugged', 'gone'].includes(row.status) && row.list === 'new launches') add('rug', 'bad', `${row.symbol}, a launch pick on ${report.yesterday.day}, is ${row.status === 'gone' ? 'gone' : 'under $5k of liquidity'} — $${k(row.liquidity)} of liquidity then${row.now.liquidity != null ? `, $${k(row.now.liquidity)} now` : ''}.`, null, row.liquidity);
  }
  // Dedupe by token+kind, rank by size, cap
  const seen = new Set();
  const ranked = events.filter((e) => { const key = e.kind + ':' + (e.token?.address || e.text); if (seen.has(key)) return false; seen.add(key); return true; })
    .sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, C.maxEvents);

  report.news = {
    items, events: ranked,
    feed: { scanned: (raw.news || []).length, matched: fresh.length, stored: merged.length, spanHours: feedSpan(raw.news, now), pages: C.pages },
    prevDay: prev?.day || null, hasPrevUniverse: !!prev?.universe,
    trendingGlobal: trendingGlobal.map((t) => t.symbol),
  };
  log(`news: ${raw.news?.length || 0} feed items scanned, ${fresh.length} matched, ${items.length} shown · ${ranked.length} on-chain events`);
  return report;
}

export function tone(title) {
  if (C.bad.test(title)) return 'bad';
  if (C.good.test(title)) return 'good';
  return 'neutral';
}

function loadStore(dataDir, network) {
  const p = storePath(dataDir, network);
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : []; } catch { return []; }
}
function saveStore(dataDir, network, items) {
  if (!dataDir) return;
  const p = storePath(dataDir, network);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(items.map(({ tokens, hoursAgo, ...i }) => i), null, 1));
}
const storePath = (dataDir, network) => path.join(dataDir, 'news', `${network}.json`);

function loadPrev(historyDir, day) {
  if (!historyDir || !fs.existsSync(historyDir)) return null;
  const files = fs.readdirSync(historyDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f.slice(0, 10) < day).sort();
  if (!files.length) return null;
  try { return JSON.parse(fs.readFileSync(path.join(historyDir, files.at(-1)), 'utf8')); } catch { return null; }
}
function feedSpan(news, now) {
  const ts = (news || []).map((x) => Date.parse(x.posted_at)).filter(Number.isFinite);
  return ts.length ? (now - Math.min(...ts)) / 36e5 : 0;
}
const hrs = (h) => (h < 1 ? `${Math.round(h * 60)}m` : h < 48 ? `${Math.floor(h)}h` : `${Math.floor(h / 24)}d`);
const k = (v) => { if (v == null) return '—'; const a = Math.abs(v); if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B'; if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M'; if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'k'; return v.toFixed(0); };
const pct = (v) => (v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(Math.abs(v) >= 10 ? 0 : 1) + '%');
