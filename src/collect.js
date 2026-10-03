// Pulls everything the report needs for one chain, in one sweep.
// Every value here is raw CoinGecko API data. Nothing is scored yet — see analyze.js.
import { CONFIG } from './config.js';

const N = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const hoursSince = (iso) => (iso ? (Date.now() - Date.parse(iso)) / 36e5 : null);

export async function collect(cg, { network = CONFIG.network, log = () => {} } = {}) {
  const net = `/onchain/networks/${network}`;
  const t0 = Date.now();

  // ---- 1. Universe: every pool with real activity, three nets so nothing structural is missed ----
  log('pools: by 24h volume');
  const byVolume = await cg.pages('/onchain/pools/megafilter', { networks: network, sort: 'h24_volume_usd_desc', include: 'base_token,quote_token,dex' }, {
    maxPages: CONFIG.universe.maxPages,
    stop: (data) => N(data.at(-1)?.attributes?.volume_usd?.h24) < CONFIG.universe.minVolumeUsd,
  });
  log('pools: by liquidity');
  const byReserve = await cg.pages('/onchain/pools/megafilter', { networks: network, sort: 'reserve_in_usd_desc', include: 'base_token,quote_token,dex' }, {
    maxPages: 10,
    stop: (data) => N(data.at(-1)?.attributes?.reserve_in_usd) < CONFIG.universe.minReserveUsd,
  });
  log('pools: newest');
  const newest = await cg.pages('/onchain/pools/megafilter', { networks: network, sort: 'pool_created_at_desc', include: 'base_token,quote_token,dex' }, {
    maxPages: CONFIG.universe.maxNewPages,
    stop: (data) => hoursSince(data.at(-1)?.attributes?.pool_created_at) > CONFIG.newLaunch.maxAgeHours,
  });
  log('pools: trending');
  const trendingRes = await cg.get(`${net}/trending_pools`, { include: 'base_token', duration: '24h' }, { optional: true });
  const trending = new Set((trendingRes?.data || []).map((p) => p.attributes.address));

  const pools = new Map();
  for (const p of [...byVolume, ...byReserve, ...newest]) pools.set(p.attributes.address, p);
  log(`universe: ${pools.size} pools (${byVolume.length} by volume, ${byReserve.length} by liquidity, ${newest.length} created in last ${CONFIG.newLaunch.maxAgeHours}h)`);

  // ---- 2. Group pools by base token; the token is the unit of analysis ----
  const tokens = new Map();
  for (const p of pools.values()) {
    const a = p.attributes;
    const base = p.base_token;
    if (!base?.attributes?.address) continue;
    const addr = base.attributes.address.toLowerCase();
    const pool = {
      address: a.address,
      name: a.name,
      dex: p.dex_id,
      quote: p.quote_token?.attributes?.symbol || null,
      createdAt: a.pool_created_at,
      ageHours: hoursSince(a.pool_created_at),
      price: N(a.base_token_price_usd),
      fdv: N(a.fdv_usd),
      mcap: N(a.market_cap_usd),
      reserve: N(a.reserve_in_usd),
      vol: { m5: N(a.volume_usd?.m5), h1: N(a.volume_usd?.h1), h6: N(a.volume_usd?.h6), h24: N(a.volume_usd?.h24) },
      pch: { m5: N(a.price_change_percentage?.m5), h1: N(a.price_change_percentage?.h1), h6: N(a.price_change_percentage?.h6), h24: N(a.price_change_percentage?.h24) },
      tx: a.transactions || {},
      sentiment: { up: N(a.sentiment_vote_positive_percentage), down: N(a.sentiment_vote_negative_percentage) },
      susReports: N(a.community_sus_report),
      trending: trending.has(a.address),
    };
    if (!tokens.has(addr)) {
      tokens.set(addr, {
        address: addr,
        symbol: base.attributes.symbol,
        name: base.attributes.name,
        image: base.attributes.image_url,
        cgId: base.attributes.coingecko_coin_id || null,
        pools: [],
      });
    }
    tokens.get(addr).pools.push(pool);
  }

  // Primary pool = deepest liquidity. Volume/txs are summed across all pools of the token.
  for (const t of tokens.values()) {
    t.pools.sort((a, b) => (b.reserve || 0) - (a.reserve || 0));
    const p = t.pools[0];
    t.pool = p;
    t.price = p.price;
    t.fdv = p.fdv ?? t.pools.find((x) => x.fdv)?.fdv ?? null;
    t.mcap = p.mcap;
    t.liquidity = t.pools.reduce((s, x) => s + (x.reserve || 0), 0);
    t.vol24 = t.pools.reduce((s, x) => s + (x.vol.h24 || 0), 0);
    t.vol6 = t.pools.reduce((s, x) => s + (x.vol.h6 || 0), 0);
    t.vol1 = t.pools.reduce((s, x) => s + (x.vol.h1 || 0), 0);
    const sum = (k, w) => t.pools.reduce((s, x) => s + (x.tx?.[w]?.[k] || 0), 0);
    t.tx24 = { buys: sum('buys', 'h24'), sells: sum('sells', 'h24'), buyers: sum('buyers', 'h24'), sellers: sum('sellers', 'h24') };
    t.tx6 = { buys: sum('buys', 'h6'), sells: sum('sells', 'h6'), buyers: sum('buyers', 'h6'), sellers: sum('sellers', 'h6') };
    t.tx1 = { buys: sum('buys', 'h1'), sells: sum('sells', 'h1'), buyers: sum('buyers', 'h1'), sellers: sum('sellers', 'h1') };
    t.pch = p.pch;
    t.firstPoolAt = t.pools.map((x) => x.createdAt).filter(Boolean).sort()[0] || null;
    t.ageHours = hoursSince(t.firstPoolAt);
    t.trending = t.pools.some((x) => x.trending);
    t.sentiment = p.sentiment;
    t.susReports = p.susReports;
  }

  // ---- 3. Filter out non-memes (stables, wrapped majors, quote assets) before spending per-token calls ----
  const isInfra = (t) => {
    const s = (t.symbol || '').toUpperCase().replace(/^\$/, '');
    if (CONFIG.excludeSymbols.has(s)) return true;
    if (/^(W|CB|ST|WST|RS|BRIDGED)?(ETH|BTC|USD[A-Z]?|EUR[A-Z]?)$/.test(s)) return true;
    // Tokenized stocks / bridged majors on this chain sit in pools with enormous reserve and no trading
    if (t.liquidity > CONFIG.rwa.minLiquidityUsd && t.vol24 < CONFIG.rwa.maxVolumeUsd) return true;
    // Appears as the quote side of many pools -> it is money, not a meme
    const asQuote = [...pools.values()].filter((p) => p.quote_token?.attributes?.address?.toLowerCase() === t.address).length;
    return asQuote >= 5;
  };
  let memes = [...tokens.values()].filter((t) => !isInfra(t));
  const infra = [...tokens.values()].filter(isInfra).map((t) => t.symbol);
  log(`tokens: ${tokens.size} total, ${memes.length} kept, excluded as infra: ${infra.slice(0, 30).join(', ')}${infra.length > 30 ? ` +${infra.length - 30} more` : ''}`);

  // Copycat count: how many other tokens in the universe use the same ticker (launch spam is real)
  const bySymbol = new Map();
  for (const t of memes) { const k = (t.symbol || '').toUpperCase(); bySymbol.set(k, (bySymbol.get(k) || 0) + 1); }
  for (const t of memes) t.copycats = (bySymbol.get((t.symbol || '').toUpperCase()) || 1) - 1;
  // If a much bigger token shares the ticker, say so — the small one is usually riding the name
  const biggestBySymbol = new Map();
  for (const t of memes) { const k = (t.symbol || '').toUpperCase(); const cap = t.mcap || t.fdv || 0; if (!biggestBySymbol.has(k) || cap > (biggestBySymbol.get(k).mcap || biggestBySymbol.get(k).fdv || 0)) biggestBySymbol.set(k, t); }
  for (const t of memes) { const big = biggestBySymbol.get((t.symbol || '').toUpperCase()); const cap = t.mcap || t.fdv || 0; t.biggerTwin = big && big !== t && (big.mcap || big.fdv || 0) > 3 * cap && big.liquidity >= 50_000 ? { address: big.address, pool: big.pool.address, mcap: big.mcap || big.fdv, ageHours: big.ageHours, liquidity: big.liquidity } : null; }
  const newestSpanHours = Math.max(0, ...newest.map((p) => hoursSince(p.attributes.pool_created_at) || 0));

  // ---- 4. Per-token detail, only where it can matter ----
  const worthDetail = memes
    .filter((t) => t.liquidity >= CONFIG.detail.minLiquidityUsd || t.vol24 >= CONFIG.detail.minVolumeUsd || t.ageHours <= CONFIG.newLaunch.maxAgeHours)
    .sort((a, b) => b.vol24 - a.vol24)
    .slice(0, CONFIG.detail.maxTokens);
  log(`detail: token info + holder history + 48h candles for ${worthDetail.length} tokens`);

  await Promise.all(worthDetail.map(async (t) => {
    // Hourly candles for the 48h view; 5-minute candles when the token is too young to have hours
    const young = t.ageHours != null && t.ageHours < 48;
    const [info, holders, ohlcv] = await Promise.all([
      cg.get(`${net}/tokens/${t.address}/info`, {}, { optional: true }),
      cg.get(`${net}/tokens/${t.address}/holders_chart`, { days: 7 }, { optional: true }),
      young
        ? cg.get(`${net}/pools/${t.pool.address}/ohlcv/minute`, { aggregate: 5, limit: 576, currency: 'usd' }, { optional: true })
        : cg.get(`${net}/pools/${t.pool.address}/ohlcv/hour`, { limit: 48, currency: 'usd' }, { optional: true }),
    ]);
    t.candleMinutes = young ? 5 : 60;
    const i = info?.data?.attributes;
    t.info = i ? {
      gtScore: N(i.gt_score),
      gtScoreDetails: i.gt_score_details || null,
      gtVerified: !!i.gt_verified,
      honeypot: i.is_honeypot === true || i.is_honeypot === 'true' ? true : i.is_honeypot === false || i.is_honeypot === 'false' ? false : null, // API also returns the string "unknown"
      mintAuthority: i.mint_authority ?? null,
      freezeAuthority: i.freeze_authority ?? null,
      devAddress: i.developer_address || null,
      devHoldingPct: N(i.developer_holding_percentage),
      holdersCount: N(i.holders?.count),
      holdersDist: i.holders?.distribution_percentage || null,
      categories: i.categories || [],
      websites: i.websites || [],
      twitter: i.twitter_handle || null,
      telegram: i.telegram_handle || null,
      discord: i.discord_url || null,
      cgId: i.coingecko_coin_id || t.cgId || null,
      description: i.description || null,
    } : null;
    if (t.info?.cgId) t.cgId = t.info.cgId;
    const list = holders?.data?.attributes?.token_holders_list || null;
    t.holdersSeries = list ? list.map(([ts, n]) => [Date.parse(ts), Number(n)]).sort((a, b) => a[0] - b[0]) : null;
    const candles = ohlcv?.data?.attributes?.ohlcv_list || null;
    t.candles = candles ? candles.map(([ts, o, h, l, c, v]) => ({ ts: ts * 1000, o, h, l, c, v })).sort((a, b) => a.ts - b.ts) : null;
  }));

  // Second pass on the meme filter, now that categories are known: tokenized stocks, RWA and stables are not memes
  const rwa = memes.filter((t) => (t.info?.categories || []).some(CONFIG.rwa.isRwaCategory));
  if (rwa.length) { log(`tokens: ${rwa.length} more excluded by category: ${rwa.map((t) => t.symbol).slice(0, 20).join(', ')}`); memes = memes.filter((t) => !rwa.includes(t)); }
  const worthDetailKept = worthDetail.filter((t) => !rwa.includes(t));

  // ---- 5. Launch-stage checks: pool detail (locked liquidity) and the real holder list ----
  const launchCandidates = worthDetailKept.filter((t) => t.ageHours <= CONFIG.newLaunch.maxAgeHours && t.liquidity >= CONFIG.newLaunch.minLiquidityUsd);
  const established = worthDetailKept.filter((t) => t.ageHours > CONFIG.newLaunch.maxAgeHours).slice(0, CONFIG.detail.maxHolderLists);
  const holderTargets = [...launchCandidates, ...established];
  log(`holders: top-10 holder lists + locked-liquidity check for ${holderTargets.length} tokens`);
  await Promise.all(holderTargets.map(async (t) => {
    const [top, poolDetail] = await Promise.all([
      cg.get(`${net}/tokens/${t.address}/top_holders`, {}, { optional: true }),
      cg.get(`${net}/pools/${t.pool.address}`, { include_composition: 'true' }, { optional: true }),
    ]);
    const holders = top?.data?.attributes?.holders || null;
    t.topHolders = holders ? holders.map((h) => ({ rank: h.rank, address: h.address, label: h.label || null, pct: N(h.percentage), valueUsd: N(h.value) })) : null;
    const pd = poolDetail?.data?.attributes;
    t.pool.lockedLiquidityPct = pd ? N(pd.locked_liquidity_percentage) : null;
    t.pool.feePct = pd ? N(pd.pool_fee_percentage) : null;
    t.pool.lockedChecked = !!pd;
  }));

  // ---- 6. Who is making money: top traders of the most active tokens ----
  // Top traders: the most traded tokens (for the wallet leaderboard) plus every existing-coin setup candidate,
  // because the setup score needs to know how much of the sold supply came from wallets that never bought.
  const byVol = worthDetailKept.filter((t) => t.vol24 >= CONFIG.wallets.minTokenVolumeUsd).slice(0, CONFIG.wallets.maxTokens);
  const setupCands = worthDetailKept.filter((t) => t.ageHours >= CONFIG.setups.minAgeHours && t.liquidity >= CONFIG.setups.minLiquidityUsd && t.vol24 >= CONFIG.setups.minVolumeUsd);
  const traderTargets = [...new Set([...byVol, ...setupCands])].slice(0, CONFIG.wallets.maxTokens + 60);
  log(`wallets: top traders for ${traderTargets.length} tokens`);
  await Promise.all(traderTargets.map(async (t) => {
    const res = await cg.get(`${net}/tokens/${t.address}/top_traders`, {}, { optional: true });
    const list = res?.data?.attributes?.traders || null;
    t.topTraders = list ? list.map((w) => ({
      address: w.address,
      realizedPnl: N(w.realized_pnl_usd),
      unrealizedPnl: N(w.unrealized_pnl_usd),
      buys: w.total_buy_count, sells: w.total_sell_count,
      buyUsd: N(w.total_buy_usd), sellUsd: N(w.total_sell_usd),
      avgBuy: N(w.average_buy_price_usd), avgSell: N(w.average_sell_price_usd),
      explorer: w.explorer_url || null,
    })) : null;
  }));

  // ---- 7. Listings + ATH for tokens CoinGecko tracks as coins (only the ones with a coin id) ----
  const coinTargets = worthDetailKept.filter((t) => t.cgId).slice(0, CONFIG.detail.maxCoinLookups);
  log(`coins: tickers + ATH for ${coinTargets.length} CoinGecko-listed tokens`);
  await Promise.all(coinTargets.map(async (t) => {
    const c = await cg.get(`/coins/${t.cgId}`, { localization: 'false', tickers: 'true', market_data: 'true', community_data: 'false', developer_data: 'false', sparkline: 'false' }, { optional: true });
    if (!c) return;
    const md = c.market_data || {};
    const tickers = (c.tickers || []).map((k) => ({ market: k.market?.name, identifier: k.market?.identifier, volumeUsd: N(k.converted_volume?.usd), trust: k.trust_score || null, url: k.trade_url || null, isDex: /uniswap|pancake|raydium|sushi|curve|aerodrome|velodrome|dex|swap|pons/i.test(k.market?.name || '') }));
    const cex = tickers.filter((k) => !k.isDex);
    t.coin = {
      id: c.id,
      categories: c.categories || [],
      athUsd: N(md.ath?.usd), athChangePct: N(md.ath_change_percentage?.usd), athDate: md.ath_date?.usd || null,
      atlUsd: N(md.atl?.usd),
      mcapRank: c.market_cap_rank || null,
      sentimentUp: N(c.sentiment_votes_up_percentage), sentimentDown: N(c.sentiment_votes_down_percentage),
      watchlistUsers: N(c.watchlist_portfolio_users),
      twitter: c.links?.twitter_screen_name || null,
      telegram: c.links?.telegram_channel_identifier || null,
      homepage: (c.links?.homepage || []).filter(Boolean)[0] || null,
      listedAt: c.listing_timestamp || null,
      tickersTotal: tickers.length,
      cexListings: dedupe(cex.map((k) => k.market)).slice(0, 8),
      dexCount: tickers.length - cex.length,
    };
  }));

  // Coin-level categories catch what token info missed (e.g. a stablecoin project with a meme-looking ticker)
  const rwa2 = memes.filter((t) => {
    const cats = t.coin?.categories || [];
    if (cats.some(CONFIG.rwa.isRwaCategory)) return true;
    // CoinGecko tags it as infrastructure / DeFi / exchange / L1-L2 and not as a meme → not a meme
    return cats.some(CONFIG.rwa.isNotMemeCategory) && !cats.some(CONFIG.rwa.isMemeCategory);
  });
  if (rwa2.length) { log(`tokens: ${rwa2.length} more excluded by CoinGecko coin category: ${rwa2.map((t) => t.symbol).join(', ')}`); memes = memes.filter((t) => !rwa2.includes(t)); }

  // ---- 8. Winning wallets across the chain: aggregate, then look at their other bags ----
  const walletAgg = new Map();
  for (const t of byVol) for (const w of t.topTraders || []) {
    if (w.realizedPnl === null) continue;
    const key = w.address.toLowerCase();
    const cur = walletAgg.get(key) || { address: w.address, explorer: w.explorer, realizedPnl: 0, tokens: [], trades: 0, buyUsd: 0, sellUsd: 0 };
    cur.realizedPnl += w.realizedPnl;
    cur.tokens.push({ symbol: t.symbol, pnl: w.realizedPnl, buys: w.buys, sells: w.sells });
    cur.trades += (w.buys || 0) + (w.sells || 0);
    cur.buyUsd += w.buyUsd || 0; cur.sellUsd += w.sellUsd || 0;
    walletAgg.set(key, cur);
  }
  const wallets = [...walletAgg.values()].sort((a, b) => b.realizedPnl - a.realizedPnl).slice(0, CONFIG.wallets.maxWallets);
  log(`wallets: balances for the top ${wallets.length}`);
  await Promise.all(wallets.map(async (w) => {
    const [bal, pnl] = await Promise.all([
      cg.get(`/onchain/wallets/${w.address}/balances`, { networks: network }, { optional: true }),
      cg.get(`/onchain/wallets/${w.address}/pnl`, { networks: network }, { optional: true }),
    ]);
    w.balancesRaw = bal?.data ?? null;
    w.pnlRaw = pnl?.data ?? null;
  }));

  // ---- 8b. Whale trades: big swaps today across the most traded tokens ----
  const whaleTargets = [...memes].sort((a, b) => b.vol24 - a.vol24).slice(0, CONFIG.notable.whaleTradeTokens);
  log(`whales: trades ≥ $${CONFIG.notable.whaleTradeUsd.toLocaleString()} across the ${whaleTargets.length} most traded tokens`);
  const bigTrades = [];
  await Promise.all(whaleTargets.map(async (t) => {
    const res = await cg.get(`${net}/pools/${t.pool.address}/trades`, { trade_volume_in_usd_greater_than: CONFIG.notable.whaleTradeUsd }, { optional: true });
    for (const r of res?.data || []) {
      const a = r.attributes;
      bigTrades.push({ symbol: t.symbol, address: t.address, pool: t.pool.address, ts: a.block_timestamp, kind: a.kind, usd: N(a.volume_in_usd) ?? 0, wallet: a.tx_from_address, tx: a.tx_hash });
    }
  }));

  // ---- 9. Native + global context ----
  const eth = await cg.get('/simple/price', { ids: 'ethereum', vs_currencies: 'usd', include_24hr_change: 'true' }, { optional: true });

  return {
    network,
    generatedAt: new Date().toISOString(),
    durationSec: Math.round((Date.now() - t0) / 1000),
    counts: { pools: pools.size, tokens: tokens.size, memes: memes.length, detailed: worthDetailKept.length, newPools: newest.length, newPoolsCapped: newest.length >= CONFIG.universe.maxNewPages * 20, newestSpanHours },
    infraExcluded: infra,
    eth: eth?.ethereum ? { price: eth.ethereum.usd, change24: eth.ethereum.usd_24h_change } : null,
    tokens: memes,
    bigTrades,
    wallets,
    stats: cg.stats,
  };
}

const dedupe = (arr) => [...new Set(arr.filter(Boolean))];
