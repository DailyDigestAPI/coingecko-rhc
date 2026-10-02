// Second pass, only for the tokens that made a list: recent trade flow, holder and trader tables,
// yesterday's picks revisited. Raw CoinGecko data in, derived fields labelled as such.
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.js';

const N = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

export async function deepen(cg, report, { log = () => {}, historyDir } = {}) {
  const net = `/onchain/networks/${report.network}`;
  const picks = [...report.newLaunches.picks, ...report.accumulation.picks, ...report.fading.picks];
  const avoid = report.avoid;
  const all = [...picks, ...avoid];
  log(`deepen: trade flow + holder/trader tables for ${all.length} listed tokens`);

  await Promise.all(all.map(async (t) => {
    const isPick = picks.includes(t);
    const [trades, traders, holders, coin] = await Promise.all([
      cg.get(`${net}/pools/${t.pool.address}/trades`, {}, { optional: true }),
      t.topTraders ? null : cg.get(`${net}/tokens/${t.address}/top_traders`, {}, { optional: true }),
      t.topHolders ? null : cg.get(`${net}/tokens/${t.address}/top_holders`, {}, { optional: true }),
      t.coin || !t.cgId || !isPick ? null : cg.get(`/coins/${t.cgId}`, { localization: 'false', tickers: 'true', market_data: 'true', community_data: 'false', developer_data: 'false', sparkline: 'false' }, { optional: true }),
    ]);
    t.flow = flowFromTrades(trades?.data || [], t);
    if (traders?.data?.attributes?.traders) t.topTraders = traders.data.attributes.traders.map(mapTrader);
    if (holders?.data?.attributes?.holders) {
      t.topHolders = holders.data.attributes.holders.map((h) => ({ rank: h.rank, address: h.address, label: h.label || null, pct: N(h.percentage), valueUsd: N(h.value) }));
    }
    if (coin) t.coin = mapCoin(coin);
    t.tickers = (coin?.tickers || []).map((k) => ({ market: k.market?.name, volumeUsd: N(k.converted_volume?.usd), url: k.trade_url || null, isDex: /uniswap|pancake|raydium|sushi|curve|aerodrome|velodrome|dex|swap|pons/i.test(k.market?.name || '') })).sort((a, b) => (b.volumeUsd || 0) - (a.volumeUsd || 0));
  }));

  // Smart-money overlap: do any of today's human winners hold a listed token right now?
  for (const t of picks) {
    t.heldBy = report.wallets.traders.filter((w) => w.bags.some((b) => (b.address || '').toLowerCase() === t.address)).map((w) => ({ address: w.address, usd: w.bags.find((b) => (b.address || '').toLowerCase() === t.address).usd }));
    t.tradedBy = report.wallets.traders.filter((w) => w.tokens.some((x) => x.symbol === t.symbol)).map((w) => w.address);
  }

  // Yesterday's picks, today
  report.yesterday = await revisit(cg, report, { historyDir, log, net });
  return report;
}

// What the last ~300 trades in the main pool say: who is pushing, how big, how fast.
function flowFromTrades(rows, t) {
  if (!rows.length) return null;
  const trades = rows.map((r) => {
    const a = r.attributes;
    const buy = a.kind === 'buy';
    return { ts: Date.parse(a.block_timestamp), buy, usd: N(a.volume_in_usd) ?? 0, wallet: a.tx_from_address, tx: a.tx_hash, price: N(buy ? a.price_to_in_usd : a.price_from_in_usd) };
  }).sort((a, b) => a.ts - b.ts);
  const first = trades[0].ts, last = trades.at(-1).ts;
  const spanMin = Math.max(1, (last - first) / 60e3);
  const buys = trades.filter((x) => x.buy), sells = trades.filter((x) => !x.buy);
  const buyUsd = buys.reduce((a, x) => a + x.usd, 0), sellUsd = sells.reduce((a, x) => a + x.usd, 0);
  const wallets = new Set(trades.map((x) => x.wallet));
  const byWallet = new Map();
  for (const x of trades) { const w = byWallet.get(x.wallet) || { buy: 0, sell: 0, n: 0 }; if (x.buy) w.buy += x.usd; else w.sell += x.usd; w.n++; byWallet.set(x.wallet, w); }
  const topBuyers = [...byWallet.entries()].filter(([, w]) => w.buy > 0).sort((a, b) => b[1].buy - a[1].buy).slice(0, 3).map(([address, w]) => ({ address, usd: w.buy, n: w.n }));
  const topSellers = [...byWallet.entries()].filter(([, w]) => w.sell > 0).sort((a, b) => b[1].sell - a[1].sell).slice(0, 3).map(([address, w]) => ({ address, usd: w.sell, n: w.n }));
  const sizes = trades.map((x) => x.usd).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] || 0;
  const biggest = [...trades].sort((a, b) => b.usd - a.usd).slice(0, 3);
  const repeat = [...byWallet.values()].filter((w) => w.n >= 5).length; // wallets trading 5+ times in the window: bots or very active
  // Price drift inside the window, from first to last trade
  const p0 = trades.find((x) => x.price)?.price, p1 = [...trades].reverse().find((x) => x.price)?.price;
  return {
    n: trades.length, spanMin, windowStart: first, windowEnd: last,
    buys: buys.length, sells: sells.length, buyUsd, sellUsd, netUsd: buyUsd - sellUsd,
    wallets: wallets.size, repeatWallets: repeat,
    perMinute: trades.length / spanMin,
    medianUsd: median, biggest, topBuyers, topSellers,
    driftPct: p0 && p1 ? ((p1 - p0) / p0) * 100 : null,
    concentration: buyUsd ? topBuyers.reduce((a, w) => a + w.usd, 0) / buyUsd : null, // share of buy $ from the top 3 buyers
  };
}

async function revisit(cg, report, { historyDir, log, net }) {
  if (!historyDir || !fs.existsSync(historyDir)) return null;
  const files = fs.readdirSync(historyDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f.slice(0, 10) < report.day).sort();
  if (!files.length) return null;
  const prev = JSON.parse(fs.readFileSync(path.join(historyDir, files.at(-1)), 'utf8'));
  const byAddr = new Map(report.tokens.map((t) => [t.address, t]));
  const missing = prev.picks.filter((p) => !byAddr.has(p.address));
  const fetched = new Map();
  if (missing.length) {
    log(`revisit: ${prev.day} picks — ${missing.length} not in today's universe, fetching their pools`);
    const res = await cg.get(`${net}/pools/multi/${missing.map((p) => p.pool).join(',')}`, {}, { optional: true });
    for (const p of res?.data || []) fetched.set(p.attributes.address, p.attributes);
  }
  const rows = prev.picks.map((p) => {
    const now = byAddr.get(p.address);
    const pool = fetched.get(p.pool);
    const liq = now ? now.liquidity : pool ? N(pool.reserve_in_usd) : null;
    const price = now ? now.price : pool ? N(pool.base_token_price_usd) : null;
    const holders = now ? now.holdersCount : null;
    const vol = now ? now.vol24 : pool ? N(pool.volume_usd?.h24) : null;
    const priceChange = price != null && p.price ? ((price - p.price) / p.price) * 100 : null;
    const liqChange = liq != null && p.liquidity ? ((liq - p.liquidity) / p.liquidity) * 100 : null;
    let status = 'unknown';
    if (liq == null) status = 'gone';
    else if (liq < 5_000) status = 'rugged';
    else if (liqChange != null && liqChange <= -50) status = 'bleeding';
    else if (priceChange != null && priceChange >= 25) status = 'up';
    else if (priceChange != null && priceChange <= -25) status = 'down';
    else status = 'holding';
    return { ...p, now: { liquidity: liq, price, holders, vol24: vol }, priceChange, liqChange, holdersChange: holders != null && p.holders != null ? holders - p.holders : null, status, inUniverse: !!now, listedToday: now ? listsFor(now, report) : [] };
  });
  return { day: prev.day, rows };
}

function listsFor(t, report) {
  const out = [];
  if (report.newLaunches.picks.some((x) => x.address === t.address)) out.push('new launches');
  if (report.accumulation.picks.some((x) => x.address === t.address)) out.push('accumulation');
  if (report.fading.picks.some((x) => x.address === t.address)) out.push('losing power');
  if (report.avoid.some((x) => x.address === t.address)) out.push('avoid');
  return out;
}

export function historySnapshot(report) {
  const row = (t, list) => ({ list, symbol: t.symbol, name: t.name, address: t.address, pool: t.pool.address, price: t.price, liquidity: t.liquidity, holders: t.holdersCount, vol24: t.vol24, mcap: t.mcap || t.fdv });
  return {
    day: report.day, generatedAt: report.generatedAt, heat: report.overview.heat,
    picks: [
      ...report.newLaunches.picks.map((t) => row(t, 'new launches')),
      ...report.accumulation.picks.map((t) => row(t, 'accumulation')),
      ...report.fading.picks.map((t) => row(t, 'losing power')),
      ...report.avoid.map((t) => row(t, 'avoid')),
    ],
  };
}

const mapTrader = (w) => ({ address: w.address, realizedPnl: N(w.realized_pnl_usd), unrealizedPnl: N(w.unrealized_pnl_usd), buys: w.total_buy_count, sells: w.total_sell_count, buyUsd: N(w.total_buy_usd), sellUsd: N(w.total_sell_usd), avgBuy: N(w.average_buy_price_usd), avgSell: N(w.average_sell_price_usd), explorer: w.explorer_url || null });
function mapCoin(c) {
  const md = c.market_data || {};
  const tickers = (c.tickers || []).map((k) => ({ market: k.market?.name, isDex: /uniswap|pancake|raydium|sushi|curve|aerodrome|velodrome|dex|swap|pons/i.test(k.market?.name || '') }));
  const cex = tickers.filter((k) => !k.isDex);
  return { id: c.id, categories: c.categories || [], athUsd: N(md.ath?.usd), athChangePct: N(md.ath_change_percentage?.usd), athDate: md.ath_date?.usd || null, mcapRank: c.market_cap_rank || null, sentimentUp: N(c.sentiment_votes_up_percentage), watchlistUsers: N(c.watchlist_portfolio_users), twitter: c.links?.twitter_screen_name || null, telegram: c.links?.telegram_channel_identifier || null, homepage: (c.links?.homepage || []).filter(Boolean)[0] || null, tickersTotal: tickers.length, cexListings: [...new Set(cex.map((k) => k.market).filter(Boolean))].slice(0, 8), dexCount: tickers.length - cex.length };
}
