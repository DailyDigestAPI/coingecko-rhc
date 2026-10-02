// Turns raw CoinGecko data into the daily digest. Every label, score and list here is computed by this
// code from the raw fields — none of it is a CoinGecko classification.
import { CONFIG } from './config.js';

const H = 36e5;

export function analyze(raw) {
  const tokens = raw.tokens.map(enrich);
  const tradeable = tokens.filter((t) => t.liquidity >= 5_000 && t.vol24 >= 1_000);

  const overview = buildOverview(raw, tokens, tradeable);
  const newLaunches = pickNewLaunches(tokens);
  const accumulation = pickAccumulation(tokens);
  const fading = pickFading(tokens);
  const avoid = pickAvoid(tokens);
  const allWallets = buildWallets(raw.wallets);
  const wallets = {
    checked: allWallets.length,
    traders: allWallets.filter((w) => w.kind === 'trader').slice(0, CONFIG.wallets.show),
    bots: allWallets.filter((w) => w.kind === 'bot').length,
    insiders: allWallets.filter((w) => w.kind === 'insider').length,
    biggest: allWallets[0] || null, // the single largest realized PnL, whatever kind it is
  };

  return { ...raw, tokens, overview, newLaunches, accumulation, fading, avoid, wallets };
}

// ---------- derived fields ----------
function enrich(t) {
  const info = t.info || {};
  const now = Date.now();

  // Holder history → holders now, 24h ago, 7d ago (nearest earlier sample; series is sparse at the start)
  const s = t.holdersSeries;
  let holders = null;
  if (s && s.length) {
    const at = (msAgo) => {
      const target = now - msAgo;
      let best = null;
      for (const [ts, n] of s) { if (ts <= target) best = n; else break; }
      return best ?? (s[0][0] <= target + 6 * H ? s[0][1] : null); // allow a 6h grace at the start of history
    };
    const nowN = s.at(-1)[1];
    const spanHours = (now - s[0][0]) / H;
    const young = spanHours < 24; // launched inside the window: "24h change" is really "since launch"
    const h24 = young ? s[0][1] : at(24 * H);
    let d7 = s[0][0] <= now - 6.75 * 24 * H ? (at(7 * 24 * H) ?? s[0][1]) : null; // only when the history really spans the week
    if (d7 != null && d7 < 50) d7 = null; // a week ago it had a handful of holders: the % is launch noise, not a trend
    holders = {
      now: nowN,
      ago24: h24, ago7d: d7,
      change24: h24 != null ? nowN - h24 : null,
      change24Pct: !young && h24 ? ((nowN - h24) / h24) * 100 : null,
      sinceLaunch: young,
      newShare24: nowN ? (nowN - (h24 ?? nowN)) / nowN : null, // share of today's holders that arrived in the last 24h
      newShare6: nowN ? (nowN - (at(6 * H) ?? s[0][1])) / nowN : null, // same, last 6h — what launch-day momentum looks like
      rate6: rate(s, now - 6 * H, now),                 // holders gained per hour, last 6h
      rate6prev: rate(s, now - 12 * H, now - 6 * H),     // and the 6h before that
      change7dPct: !young && d7 ? ((nowN - d7) / d7) * 100 : null,
      spanHours,
      series: s,
    };
  }
  const holdersCount = holders?.now ?? info.holdersCount ?? null;
  // Holder count growing far faster than unique buyers = airdrop / sybil distribution, not demand
  const holdersInflated = holders?.change24 != null && holders.change24 > 100 && holders.change24 > 3 * Math.max(1, t.tx24.buyers);

  // Candles → volume momentum (last 24h vs the 24h before) and the sparkline
  let momentum = null;
  const step = (t.candleMinutes || 60) * 60e3;
  if (t.candles && t.candles.length >= 6) {
    const last = t.candles.filter((c) => c.ts >= now - 24 * H);
    const prev = t.candles.filter((c) => c.ts < now - 24 * H && c.ts >= now - 48 * H);
    const vLast = last.reduce((a, c) => a + (c.v || 0), 0);
    const vPrev = prev.reduce((a, c) => a + (c.v || 0), 0);
    const closes = t.candles.map((c) => c.c);
    const hi = Math.max(...t.candles.map((c) => c.h)), lo = Math.min(...t.candles.map((c) => c.l));
    const minPrevCandles = (12 * H) / step; // need at least half a day of the previous 24h to compare
    momentum = {
      volLast24: vLast, volPrev24: vPrev,
      volChangePct: prev.length >= minPrevCandles && vPrev > 0 ? ((vLast - vPrev) / vPrev) * 100 : null,
      hi48: hi, lo48: lo,
      fromHiPct: hi ? ((t.price - hi) / hi) * 100 : null,
      closes,
      hoursCovered: Math.round((t.candles.length * step) / H),
      candleMinutes: t.candleMinutes || 60,
    };
  }

  // Whale concentration excluding pool / LP / locker contracts (they show up in top-10 lists)
  let whales = null;
  if (t.topHolders) {
    const isContract = (h) => /pool|manager|lp|lock|burn|dead|router|vault|bridge|treasury/i.test(h.label || '') || /^0x0+(dead)?$/i.test(h.address) || /dead$/i.test(h.address);
    const wallets = t.topHolders.filter((h) => !isContract(h));
    whales = {
      top10PctExPool: wallets.reduce((a, h) => a + (h.pct || 0), 0),
      largestWalletPct: Math.max(0, ...wallets.map((h) => h.pct || 0)),
      poolPct: t.topHolders.filter(isContract).reduce((a, h) => a + (h.pct || 0), 0),
      contracts: t.topHolders.filter(isContract).map((h) => h.label).filter(Boolean),
      list: t.topHolders,
    };
  }
  const top10Pct = whales ? whales.top10PctExPool : (info.holdersDist?.top_10 != null ? Number(info.holdersDist.top_10) : null);

  const socials = {
    website: info.websites?.[0] || t.coin?.homepage || null,
    twitter: info.twitter || t.coin?.twitter || null,
    telegram: info.telegram || t.coin?.telegram || null,
    discord: info.discord || null,
  };
  const socialCount = ['website', 'twitter', 'telegram', 'discord'].filter((k) => socials[k]).length;

  const buyersRatio = t.tx24.sellers ? t.tx24.buyers / t.tx24.sellers : (t.tx24.buyers ? Infinity : null);
  const buyersRatio6 = t.tx6.sellers ? t.tx6.buyers / t.tx6.sellers : (t.tx6.buyers ? Infinity : null);
  const turnover = t.liquidity ? t.vol24 / t.liquidity : null;
  const liqToMcap = t.liquidity && (t.mcap || t.fdv) ? t.liquidity / (t.mcap || t.fdv) : null;

  // Risk flags — this code's reading of the raw fields
  const flags = [];
  if (info.honeypot === true) flags.push({ level: 'red', text: 'Honeypot flag' });
  if (info.mintAuthority) flags.push({ level: 'red', text: 'Mint authority active' });
  if (info.freezeAuthority) flags.push({ level: 'red', text: 'Freeze authority active' });
  if (t.tx24.buys >= CONFIG.avoid.minBuysForNoSells && t.tx24.sells === 0) flags.push({ level: 'red', text: `${t.tx24.buys} buys, zero sells in 24h` });
  // Only the real holder list (pool / LP contracts removed) can hard-fail a token. The distribution figure
  // from token info includes the pool itself, so without the list it is amber at most.
  if (whales && top10Pct > CONFIG.avoid.top10PctExPool) flags.push({ level: 'red', text: `Top-10 wallets hold ${top10Pct.toFixed(0)}%` });
  else if (whales && top10Pct > CONFIG.newLaunch.maxTop10PctExPool) flags.push({ level: 'amber', text: `Top-10 wallets hold ${top10Pct.toFixed(0)}%` });
  else if (!whales && top10Pct != null && top10Pct > CONFIG.avoid.top10PctExPool) flags.push({ level: 'amber', text: `Top-10 holders incl. pool ${top10Pct.toFixed(0)}% (wallet list unavailable)` });
  if (whales && whales.largestWalletPct > 20) flags.push({ level: 'amber', text: `One wallet holds ${whales.largestWalletPct.toFixed(1)}%` });
  if (info.devHoldingPct != null && info.devHoldingPct > 10) flags.push({ level: 'amber', text: `Dev holds ${info.devHoldingPct.toFixed(1)}%` });
  if (t.liquidity < CONFIG.avoid.thinLiquidityUsd && (t.fdv || 0) > CONFIG.avoid.thinLiquidityFdvUsd) flags.push({ level: 'red', text: `$${fmtK(t.liquidity)} liquidity vs $${fmtK(t.fdv)} FDV` });
  if (liqToMcap != null && liqToMcap < 0.02 && t.liquidity >= CONFIG.avoid.thinLiquidityUsd) flags.push({ level: 'amber', text: `Liquidity is ${(liqToMcap * 100).toFixed(1)}% of mcap` });
  if (t.pool.lockedChecked && t.pool.lockedLiquidityPct != null && t.pool.lockedLiquidityPct < 50) flags.push({ level: 'amber', text: `${t.pool.lockedLiquidityPct.toFixed(0)}% liquidity locked` });
  if (info.honeypot === null && t.info) flags.push({ level: 'grey', text: 'Honeypot status unknown' });
  if (t.susReports > 0) flags.push({ level: 'amber', text: `${t.susReports} community sus report${t.susReports > 1 ? 's' : ''}` });
  if (turnover != null && turnover > 20) flags.push({ level: 'amber', text: `Volume is ${turnover.toFixed(0)}× liquidity (churn)` });
  if (info.gtScore != null && info.gtScore < 40) flags.push({ level: 'amber', text: `GT Score ${info.gtScore.toFixed(0)}` });
  if (holdersInflated) flags.push({ level: 'amber', text: `+${holders.change24.toLocaleString()} holders but only ${t.tx24.buyers} buyers (airdrop?)` });
  if (t.copycats >= 3) flags.push({ level: 'grey', text: `${t.copycats} other tokens use this ticker` });

  const hardFail = flags.some((f) => f.level === 'red');

  const buyersRatio1 = t.tx1.sellers ? t.tx1.buyers / t.tx1.sellers : (t.tx1.buyers ? Infinity : null);
  const sizing = t.liquidity ? [1_000, 5_000, 20_000].map((usd) => ({ usd, impactPct: priceImpact(usd, t.liquidity) })) : null;
  // Overhang: the biggest non-contract wallet's bag against the pool. If it sold into the pool, this is the share it would eat.
  const largestWallet = whales ? whales.list.filter((h) => !/pool|manager|lp|lock|burn|dead|router|vault|bridge|treasury/i.test(h.label || '')).sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0))[0] : null;
  const overhang = largestWallet?.valueUsd && t.liquidity ? { address: largestWallet.address, usd: largestWallet.valueUsd, pctOfPool: (largestWallet.valueUsd / t.liquidity) * 100, impactPct: priceImpact(largestWallet.valueUsd, t.liquidity) } : null;
  if (overhang && overhang.pctOfPool >= 100) flags.push({ level: 'amber', text: `One wallet holds ${overhang.pctOfPool.toFixed(0)}% of the pool's value` });
  const top10Usd = whales ? whales.list.filter((h) => !/pool|manager|lp|lock|burn|dead|router|vault|bridge|treasury/i.test(h.label || '')).reduce((a, h) => a + (h.valueUsd || 0), 0) : null;

  return {
    ...t, holders, holdersCount, holdersInflated, momentum, whales, top10Pct, socials, socialCount, buyersRatio, buyersRatio6, buyersRatio1, turnover, liqToMcap, flags, hardFail, sizing, overhang, top10Usd,
    netBuyers24: t.tx24.buyers - t.tx24.sellers,
    netBuyers6: t.tx6.buyers - t.tx6.sellers,
    ageDays: t.ageHours != null ? t.ageHours / 24 : null,
    isNew: t.ageHours != null && t.ageHours <= CONFIG.newLaunch.maxAgeHours,
  };
}

// ---------- market overview ----------
function buildOverview(raw, tokens, tradeable) {
  const sum = (arr, f) => arr.reduce((a, x) => a + (f(x) || 0), 0);
  const med = (arr) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const withPch = tradeable.filter((t) => t.pch.h24 != null && t.ageHours > 24); // launch-day prices start near zero, skip them
  const up = withPch.filter((t) => t.pch.h24 > 0).length;
  const newTokens = tokens.filter((t) => t.isNew);
  const new24 = tokens.filter((t) => t.ageHours != null && t.ageHours <= 24);
  const survivors = newTokens.filter((t) => t.ageHours > 24 && t.liquidity >= 10_000);
  const launchSpan = raw.counts.newestSpanHours || null; // hours covered by the newest-pools sweep
  const launchPerHour = launchSpan ? raw.counts.newPools / launchSpan : null;
  const withInfo = tokens.filter((t) => t.info && t.info.honeypot !== null);
  const honeypots = withInfo.filter((t) => t.info.honeypot === true).length;
  const buyers = sum(tradeable, (t) => t.tx24.buyers), sellers = sum(tradeable, (t) => t.tx24.sellers);
  const withHolders = tokens.filter((t) => t.holders?.change24 != null && t.liquidity >= 10_000 && !t.holdersInflated);
  const holdersGained = sum(withHolders, (t) => t.holders.change24);
  const withMom = tradeable.filter((t) => t.momentum?.volChangePct != null);
  const volLast = sum(withMom, (t) => t.momentum.volLast24), volPrev = sum(withMom, (t) => t.momentum.volPrev24);
  const bySize = (lo, hi) => tradeable.filter((t) => (t.mcap || t.fdv || 0) >= lo && (t.mcap || t.fdv || 0) < hi);

  // Heat: this code's one-word read of the day. Breadth + net buyers + volume momentum.
  const breadth = withPch.length ? (up / withPch.length) * 100 : null;
  const buyerSkew = sellers ? buyers / sellers : null;
  let heat = 'MIXED', heatWhy = [];
  const score = (breadth != null ? (breadth - 50) / 25 : 0) + (buyerSkew != null ? (buyerSkew - 1) * 2 : 0) + (volPrev ? Math.max(-1, Math.min(1, (volLast - volPrev) / volPrev)) : 0);
  if (score >= 1) heat = 'HOT'; else if (score <= -1) heat = 'COLD';
  if (breadth != null) heatWhy.push(`${breadth.toFixed(0)}% of traded memes are up on the day`);
  if (buyerSkew != null) heatWhy.push(`${buyers.toLocaleString()} unique buyers vs ${sellers.toLocaleString()} sellers`);
  if (volPrev) heatWhy.push(`volume ${pct((volLast - volPrev) / volPrev * 100)} vs the previous 24h`);

  return {
    heat, heatWhy, heatScore: score,
    poolsScanned: raw.counts.pools,
    memesTracked: tokens.length,
    tradeable: tradeable.length,
    totalLiquidity: sum(tokens, (t) => t.liquidity),
    totalVolume24: sum(tokens, (t) => t.vol24),
    volLast24: volLast, volPrev24: volPrev,
    buyers24: buyers, sellers24: sellers, buyerSkew,
    txs24: sum(tradeable, (t) => t.tx24.buys + t.tx24.sells),
    breadthPct: breadth, medianChange24: med(withPch.map((t) => t.pch.h24)),
    newPools24: new24.length, newTokens7d: newTokens.length, newPoolsCapped: raw.counts.newPoolsCapped,
    launchSpan, launchPerHour, launchEveryMin: launchPerHour ? 60 / launchPerHour : null, newPoolsSwept: raw.counts.newPools,
    survivors7d: survivors.length, newOlderThan24h: newTokens.filter((t) => t.ageHours > 24).length,
    honeypotPct: withInfo.length ? (honeypots / withInfo.length) * 100 : null, honeypots, honeypotChecked: withInfo.length,
    holdersGained24: withHolders.length ? holdersGained : null, holdersTracked: withHolders.length,
    sizeBuckets: { micro: bySize(0, 100_000).length, small: bySize(100_000, 1_000_000).length, mid: bySize(1_000_000, 10_000_000).length, large: bySize(10_000_000, Infinity).length },
    gainers: [...withPch].filter((t) => t.vol24 >= 10_000 && t.liquidity >= 10_000).sort((a, b) => b.pch.h24 - a.pch.h24).slice(0, 3),
    losers: [...withPch].filter((t) => t.vol24 >= 10_000 && t.liquidity >= 10_000).sort((a, b) => a.pch.h24 - b.pch.h24).slice(0, 3),
    byVolume: [...tradeable].sort((a, b) => b.vol24 - a.vol24).slice(0, 5),
    trending: tokens.filter((t) => t.trending).slice(0, 8),
    eth: raw.eth,
  };
}

// ---------- the three lists ----------
function pickNewLaunches(tokens) {
  const c = CONFIG.newLaunch;
  const pool = tokens.filter((t) => t.isNew);
  const passed = pool.filter((t) => !t.hardFail && t.ageHours >= c.minAgeHours && t.liquidity >= c.minLiquidityUsd && t.vol24 >= c.minVolumeUsd && t.tx24.buyers >= c.minBuyers24 && (t.holdersCount ?? 0) >= c.minHolders && (!t.whales || t.top10Pct <= c.maxTop10PctExPool) && (t.pch.h24 == null || t.pch.h24 > c.maxDrawdown24));
  const scored = passed.map((t) => {
    const parts = [];
    const add = (label, v, w) => parts.push({ label, v, w, s: v * w });
    // Real demand = holders arriving at a pace unique buyers can explain. Inflated counts score zero here.
    add('holder growth 6h', t.holdersInflated ? 0 : clamp((t.holders?.newShare6 ?? 0) / 0.3, 0, 1), 20);
    add('buyers vs sellers', clamp(((t.buyersRatio ?? 1) - 1) / 1, 0, 1), 15);
    add('unique buyers', clamp(Math.log10(Math.max(1, t.tx24.buyers)) / 3.5, 0, 1), 15);
    add('liquidity depth', clamp(Math.log10(Math.max(1, t.liquidity)) / 6, 0, 1), 10);
    add('healthy turnover', t.turnover == null ? 0.5 : (t.turnover >= 0.3 && t.turnover <= 8 ? 1 : 0.3), 10);
    add('holding its range', t.momentum?.fromHiPct == null ? 0.5 : clamp(1 + t.momentum.fromHiPct / 100, 0, 1), 10);
    add('GT Score', clamp((t.info?.gtScore ?? 40) / 100, 0, 1), 10);
    add('socials + listing', clamp((t.socialCount + (t.cgId ? 2 : 0)) / 5, 0, 1), 5);
    add('clean flags', t.flags.some((f) => f.level === 'amber') ? 0.4 : 1, 5);
    return { ...t, score: parts.reduce((a, p) => a + p.s, 0), scoreParts: parts };
  }).sort((a, b) => b.score - a.score);
  return { candidates: pool.length, passed: passed.length, picks: scored.slice(0, CONFIG.picks), runnersUp: scored.slice(CONFIG.picks, CONFIG.picks + 5),
    rule: `first pool between ${c.minAgeHours}h and ${c.maxAgeHours / 24} days old · liquidity ≥ $${fmtK(c.minLiquidityUsd)} · 24h volume ≥ $${fmtK(c.minVolumeUsd)} · ≥ ${c.minBuyers24} unique buyers · ≥ ${c.minHolders} holders · top-10 wallets ≤ ${c.maxTop10PctExPool}% · not down more than ${Math.abs(c.maxDrawdown24)}% on the day · no red flags` };
}

function pickAccumulation(tokens) {
  const c = CONFIG.accumulation;
  const base = tokens.filter((t) => !t.hardFail && t.ageHours >= c.minAgeHours && t.liquidity >= c.minLiquidityUsd && t.vol24 >= c.minVolumeUsd && t.pch.h24 != null && Math.abs(t.pch.h24) <= c.maxAbsPriceChange24);
  const withHolders = base.filter((t) => t.holders?.change24Pct != null);
  const primary = withHolders.filter((t) => !t.holdersInflated && t.holders.change24Pct >= c.minHolderGrowthPct24 && t.holders.change24 >= c.minHolderGrowthAbs24)
    .map((t) => ({ ...t, score: t.holders.change24Pct * Math.log10(Math.max(10, t.holders.now)) + Math.max(0, t.netBuyers24) / 20, why: `holders +${t.holders.change24Pct.toFixed(1)}% (+${t.holders.change24}) in 24h while price moved ${pct(t.pch.h24)}` }))
    .sort((a, b) => b.score - a.score);
  if (primary.length) return { mode: 'holders', picks: primary.slice(0, CONFIG.picks), checked: withHolders.length, rule: `price within ±${c.maxAbsPriceChange24}% on the day · holders up ≥ ${c.minHolderGrowthPct24}% and ≥ ${c.minHolderGrowthAbs24} wallets in 24h · new holders explained by unique buyers (no airdrop spikes) · liquidity ≥ $${fmtK(c.minLiquidityUsd)} · older than ${c.minAgeHours}h` };
  // Fallback: no holder history for this chain yet → flat price + more unique buyers than sellers
  const fallback = base.filter((t) => t.buyersRatio != null && t.buyersRatio >= 1.3 && t.tx24.buyers >= 20)
    .map((t) => ({ ...t, score: (t.buyersRatio === Infinity ? 5 : t.buyersRatio) * Math.log10(Math.max(10, t.tx24.buyers)), why: `${t.tx24.buyers} unique buyers vs ${t.tx24.sellers} sellers while price moved ${pct(t.pch.h24)}` }))
    .sort((a, b) => b.score - a.score);
  return { mode: withHolders.length ? 'none' : 'fallback', picks: fallback.slice(0, CONFIG.picks), checked: withHolders.length, rule: `price within ±${c.maxAbsPriceChange24}% on the day · unique buyers ≥ 1.3× sellers · ≥ 20 buyers · liquidity ≥ $${fmtK(c.minLiquidityUsd)}` };
}

function pickFading(tokens) {
  const c = CONFIG.fading;
  const base = tokens.filter((t) => t.liquidity >= c.minLiquidityUsd && t.vol24 >= c.minVolumeUsd && t.ageHours > 24);
  const scored = base.map((t) => {
    const reasons = [];
    let score = 0;
    if (t.holders?.change24Pct != null && t.holders.change24Pct <= c.holderDropPct24) { reasons.push(`holders ${pct(t.holders.change24Pct)} (${t.holders.change24}) in 24h`); score += Math.abs(t.holders.change24Pct) * 3; }
    if (t.momentum?.volChangePct != null && t.momentum.volChangePct <= c.volumeDropPct) { reasons.push(`volume ${pct(t.momentum.volChangePct)} vs previous 24h`); score += Math.abs(t.momentum.volChangePct) / 10; }
    if (t.tx24.buyers > 0 && t.tx24.sellers / Math.max(1, t.tx24.buyers) >= c.sellersToBuyersRatio) { reasons.push(`${t.tx24.sellers} sellers vs ${t.tx24.buyers} buyers`); score += (t.tx24.sellers / t.tx24.buyers) * 2; }
    if (t.pch.h24 != null && t.pch.h24 <= -25) { reasons.push(`price ${pct(t.pch.h24)} in 24h`); score += Math.abs(t.pch.h24) / 10; }
    if (t.momentum?.fromHiPct != null && t.momentum.fromHiPct <= -40) { reasons.push(`${pct(t.momentum.fromHiPct)} from its 48h high`); score += 2; }
    // Weight by how much money is in it: a fade on a $2M token matters more than on a $20k one
    score *= Math.log10(Math.max(10_000, t.liquidity)) / 4;
    return { ...t, score, reasons };
  }).filter((t) => t.reasons.length >= 2 || (t.reasons.length === 1 && t.holders?.change24Pct != null && t.holders.change24Pct <= c.holderDropPct24 * 2))
    .sort((a, b) => b.score - a.score);
  return { picks: scored.slice(0, CONFIG.picks), checked: base.length, rule: `two or more of: holders down ≥ ${Math.abs(c.holderDropPct24)}% in 24h · volume down ≥ ${Math.abs(c.volumeDropPct)}% vs previous 24h · sellers ≥ ${c.sellersToBuyersRatio}× buyers · price −25% · −40% from 48h high — liquidity ≥ $${fmtK(c.minLiquidityUsd)}` };
}

function pickAvoid(tokens) {
  const c = CONFIG.avoid;
  return tokens.filter((t) => t.vol24 >= c.minVolumeUsd && t.flags.some((f) => f.level === 'red'))
    .map((t) => ({ ...t, reasons: t.flags.filter((f) => f.level === 'red').map((f) => f.text) }))
    .sort((a, b) => b.vol24 - a.vol24)
    .slice(0, CONFIG.avoidMax);
}

// ---------- wallets ----------
function buildWallets(wallets) {
  const NATIVE = /^0xe{40}$/i;
  return wallets.map((w) => {
    // Balances on this chain right now (wallet_balance → attributes.balances[])
    const bal = w.balancesRaw?.attributes || {};
    const bags = (bal.balances || []).map((b) => ({
      symbol: NATIVE.test(b.address || '') ? 'ETH' : (b.symbol || b.name || '?'),
      usd: num(b.value_usd ?? b.total_value_usd) ?? 0,
      address: b.address || null,
    })).filter((b) => b.usd >= 1).sort((a, b) => b.usd - a.usd);
    const bagsTotal = num(bal.total_value_usd) ?? bags.reduce((a, b) => a + b.usd, 0);

    // Whole-chain PnL for the wallet (wallet_pnl → attributes.total_* + token_stats[])
    const p = w.pnlRaw?.attributes || {};
    const stats = (p.token_stats || []).map((s) => ({
      symbol: s.symbol, address: s.address,
      realized: num(s.realized_pnl_usd) ?? 0, unrealized: num(s.unrealized_pnl_usd),
      buys: s.total_buy_count || 0, sells: s.total_sell_count || 0,
      buyUsd: num(s.total_buy_usd) ?? 0, sellUsd: num(s.total_sell_usd) ?? 0,
    }));
    const wins = stats.filter((s) => s.realized > 0).length, losses = stats.filter((s) => s.realized < 0).length;
    const swaps = stats.reduce((a, s) => a + s.buys + s.sells, 0) || w.trades;
    // Sold a lot of something it never bought: team / airdrop / vesting wallet, not a trader to copy
    const receivedNotBought = stats.filter((s) => s.buys === 0 && s.sellUsd > 10_000).map((s) => s.symbol);
    const totalTokens = p.total_tokens ?? stats.length;
    const tags = [];
    let kind = 'trader';
    if (receivedNotBought.length) { kind = 'insider'; tags.push({ level: 'amber', text: `sold ${receivedNotBought.slice(0, 2).join(', ')} it never bought — received tokens (team, airdrop or transfer)` }); }
    else if (swaps >= CONFIG.wallets.botSwaps || totalTokens >= CONFIG.wallets.botTokens) { kind = 'bot'; tags.push({ level: 'grey', text: `${swaps.toLocaleString()} swaps across ${totalTokens.toLocaleString()} tokens — bot or router` }); }
    const pnl = {
      realized: num(p.total_realized_pnl_usd), unrealized: num(p.total_unrealized_pnl_usd),
      tokens: totalTokens, wins, losses,
      winRate: wins + losses ? (wins / (wins + losses)) * 100 : null,
    };
    const best = [...stats].sort((a, b) => b.realized - a.realized).slice(0, 3);
    return { ...w, kind, bags: bags.slice(0, 4), bagsTotal, bagsChecked: !!w.balancesRaw, pnl, pnlChecked: !!w.pnlRaw, best, swaps, tags, balancesRaw: undefined, pnlRaw: undefined };
  }).sort((a, b) => (b.pnl.realized ?? b.realizedPnl) - (a.pnl.realized ?? a.realizedPnl));
}

// ---------- helpers ----------
// Holders gained per hour between two timestamps, from a sparse series (null if the series does not cover it)
function rate(s, from, to) {
  const inWin = s.filter(([ts]) => ts >= from && ts <= to);
  const before = [...s].reverse().find(([ts]) => ts < from);
  if (!inWin.length || !before) return null;
  const start = before[1], end = inWin.at(-1)[1];
  return (end - start) / ((to - from) / H);
}
// Constant-product estimate of the price impact of a buy of `usd` into a pool with `reserveUsd` total reserve.
// Roughly half the reserve is the quote side; impact ≈ usd / (quoteSide + usd). An estimate, not a quote.
export function priceImpact(usd, reserveUsd) {
  if (!reserveUsd) return null;
  const q = reserveUsd / 2;
  return (usd / (q + usd)) * 100;
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
export const pct = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)}%`);
export function fmtK(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'k';
  return v.toFixed(0);
}
