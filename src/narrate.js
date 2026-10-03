// Turns the numbers into sentences. Deterministic templates, no model, no adjectives the data can't back.
import { CONFIG } from './config.js';
import { pct, fmtK } from './analyze.js';

export function narrate(r) {
  const o = r.overview;
  r.story = {
    today: today(r),
    launches: launches(r),
    accumulation: accumulation(r),
    fading: fading(r),
    avoid: avoidText(r),
    wallets: walletsText(r),
    yesterday: yesterdayText(r),
    notable: notableText(r),
    news: newsText(r),
    bands: Object.fromEntries(r.bands.map((b) => [b.key, bandText(b, r)])),
  };
  for (const b of r.bands) b.story = r.story.bands[b.key];
  for (const t of [...r.newLaunches.picks, ...r.accumulation.picks, ...r.fading.picks]) t.story = tokenStory(t, r);
  for (const t of r.avoid) t.story = avoidStory(t);
  return r;
}

const money = (v) => '$' + fmtK(v);
const fmtPrice = (p) => (p >= 1 ? '$' + p.toFixed(p >= 100 ? 2 : 4) : '$' + Number(p.toPrecision(3)));
const n = (v) => (v == null ? '—' : Math.round(v).toLocaleString());

function today(r) {
  const o = r.overview;
  const p = [];
  const volDir = o.volPrev24 ? (o.volLast24 - o.volPrev24) / o.volPrev24 * 100 : null;
  p.push(`${money(o.totalVolume24)} traded across ${o.memesTracked} memes in the last 24h` + (volDir != null ? `, ${volDir >= 0 ? 'up' : 'down'} ${Math.abs(volDir).toFixed(0)}% on the day before` : '') + '.');
  if (o.buyerSkew != null) p.push(`${n(o.buyers24)} unique wallets bought and ${n(o.sellers24)} sold — ${o.buyerSkew >= 1.15 ? 'buyers clearly in charge' : o.buyerSkew >= 1.03 ? 'a slight buyer edge' : o.buyerSkew >= 0.97 ? 'dead even' : 'sellers in charge'}.`);
  if (o.breadthPct != null) p.push(`${o.breadthPct.toFixed(0)}% of traded tokens closed up, median move ${pct(o.medianChange24)}.`);
  let read;
  if (o.heat === 'HOT') read = 'Momentum day. Breadth, buyers and volume all point the same way; the risk is chasing what already ran.';
  else if (o.heat === 'COLD') read = 'Risk-off. Fewer buyers, falling volume, most charts red. New launches get less follow-through on days like this.';
  else if (volDir != null && volDir < -15 && o.buyerSkew > 1) read = 'Cooling, not fleeing: fewer dollars moving but buyers still outnumber sellers. Selective day — size down, let the lists do the filtering.';
  else if (volDir != null && volDir > 15 && o.buyerSkew < 1) read = 'More volume with more sellers than buyers: distribution. Be careful with anything green on the day.';
  else read = 'Nothing decisive. Selective day — the lists below matter more than the chain-wide read.';
  p.push(read);
  if (o.launchEveryMin != null) p.push(`Launch pace: a new pool every ${o.launchEveryMin < 1 ? Math.round(o.launchEveryMin * 60) + ' seconds' : o.launchEveryMin.toFixed(1) + ' minutes'} (${o.newPoolsSwept}${o.newPoolsCapped ? '+' : ''} in the last ${o.launchSpan.toFixed(1)}h). ${o.survivors7d} of this week's launches are still trading with $10k+ of liquidity.`);
  if (o.honeypotPct != null) p.push(`Honeypot flags: ${o.honeypots} of ${o.honeypotChecked} checked tokens (${o.honeypotPct.toFixed(1)}%). ${o.honeypotPct < 2 ? 'The obvious scam flag is not the problem on this chain — concentration is, see Avoid.' : 'Check the flag before anything else.'}`);
  if (o.eth) p.push(`ETH at $${o.eth.price.toLocaleString(undefined, { maximumFractionDigits: 0 })} (${pct(o.eth.change24)}) — the quote asset for most of these pools.`);
  return p;
}

function launches(r) {
  const L = r.newLaunches;
  const c = CONFIG.newLaunch;
  const s = [`${L.candidates} tokens launched in the last 7 days. ${L.passed} cleared the structural bar (liquidity, buyers, holders, concentration, no red flags, not a clone). ${L.early} of those ${L.early === 1 ? 'sits' : 'sit'} in the early window — $${fmtK(c.mcapMin)}–$${fmtK(c.mcapMax)} market cap, where there is still room to run. The picks are the highest-scoring tokens inside that window.`];
  if (!L.picks.length) s.push(`Nothing in the window scored today.${L.outsideWindow?.length ? ` The strongest launches already ran past it: ${L.outsideWindow.slice(0, 3).map((t) => `${t.symbol} ($${fmtK(t.mcap || t.fdv)})`).join(', ')} — late, not early.` : ''} An empty list beats chasing.`);
  else if (L.outsideWindow?.length) s.push(`Already past the window, for reference: ${L.outsideWindow.slice(0, 4).map((t) => `${t.symbol} ($${fmtK(t.mcap || t.fdv)}, score ${t.score.toFixed(0)})`).join(', ')}. Strong launches, but the easy part of the move is gone.`);
  if (L.belowWindow?.length) s.push(`Still too small to call: ${L.belowWindow.map((t) => `${t.symbol} ($${fmtK(t.mcap || t.fdv)}, score ${t.score.toFixed(0)})`).join(', ')} — under $${fmtK(c.mcapMin)}, worth a watch, not a position.`);
  else {
    const young = L.picks.filter((t) => t.ageHours < 12).length;
    if (young) s.push(`${young} of the ${L.picks.length} ${young === 1 ? 'is' : 'are'} under 12 hours old, which means every number on ${young === 1 ? 'its' : 'their'} card is launch-day data. Launch-day numbers are real but unstable: a token that looks like this at hour 3 often looks very different at hour 30.`);
    const cc = L.picks.filter((t) => t.copycats >= 1);
    if (cc.length) s.push(`Ticker clones are live on ${cc.map((t) => `${t.symbol} (${t.copycats} other${t.copycats > 1 ? 's' : ''})`).join(', ')} — check the contract address before buying anything with these names.`);
  }
  return s;
}

function accumulation(r) {
  const A = r.accumulation;
  const s = [];
  if (A.mode === 'setups') {
    s.push(`Every token older than two days is scored on visible demand: holder growth, buyers vs sellers and whether that is improving, volume momentum, a dip with holders still arriving, depth, concentration, how much of the top-trader supply came from insiders, listings and GT Score. Red flags, airdrop spikes, shrinking holder counts and ticker clones are out before scoring.`);
    s.push(`A high score is not a buy signal; it means the demand is real and the token is still tradeable. Each pick carries a thesis and the thing that would break it.`);
    return s;
  }
  if (A.mode === 'holders') s.push(`Holder history exists for ${A.checked} tokens that are older than two days and traded today. The three below are adding wallets while price is flat, and the new holders are explained by unique buyers — airdrop spikes are filtered out.`);
  else if (A.mode === 'fallback') s.push('Holder history is not available on this chain yet, so this list uses buyer counts instead: flat price, clearly more unique buyers than sellers.');
  else s.push(`Holder history exists for ${A.checked} tokens, but none of them is adding wallets while price sits still today.`);
  if (A.picks.length) s.push('This is the list a screener cannot give you. Someone is building a position without moving the chart. Whether that is smart money or a slow exit-liquidity trap is the research to do — the holder table and trade flow on page 2 are where to start.');
  return s;
}

function fading(r) {
  const F = r.fading;
  const s = [`${F.checked} tokens with real liquidity were checked for two or more fade signals at once: holders leaving, volume halving, sellers outnumbering buyers, a −25% day, or −40% from the 48h high.`];
  if (F.picks.length) s.push('Ranking is weighted by liquidity, so a fade on a token people actually hold outranks a fade on a $20k pool. If you hold one of these, the holder trend tends to show up before the chart does.');
  else s.push('Nothing is bleeding on two fronts at once today.');
  return s;
}

function avoidText(r) {
  const s = [`Only tokens with at least ${money(CONFIG.avoid.minVolumeUsd)} of volume today — this is what people are actually buying, not a list of dead pools.`];
  const label = (x) => /top-10/i.test(x) ? 'top-10 wallet concentration' : /honeypot/i.test(x) ? 'honeypot flag' : /authority/i.test(x) ? 'mint or freeze authority' : /zero sells/i.test(x) ? 'buys with no sells' : /liquidity vs/i.test(x) ? 'an FDV with no liquidity behind it' : x.toLowerCase();
  const reasons = {};
  for (const t of r.avoid) for (const x of t.reasons) { const k = label(x); reasons[k] = (reasons[k] || 0) + 1; }
  const top = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
  if (top) s.push(`Most common failure: ${top[0]} (${top[1]} of ${r.avoid.length}). A red flag here is a hard rule, not a judgement — the token is listed with the exact check it failed and the number behind it.`);
  const vol = r.avoid.reduce((a, t) => a + t.vol24, 0);
  if (r.avoid.length) s.push(`Combined, these ${r.avoid.length} tokens did ${money(vol)} of volume today. That is how much money went into tokens that fail a check you can run in one API call.`);
  return s;
}

function walletsText(r) {
  const W = r.wallets;
  const s = [`The top traders of the ${Math.min(CONFIG.wallets.maxTokens, r.tokens.filter((t) => t.topTraders).length)} most traded memes were pooled, and the ${W.checked} biggest realized-PnL wallets were checked wallet-wide.`];
  if (W.insiders || W.bots) s.push(`${W.insiders} sold tokens they never bought — team allocations, airdrops or transfers from another wallet — and ${W.bots} are bots or routers doing thousands of swaps. Neither is a trader you can copy, so they are dropped.`);
  if (W.traders.length) {
    const oneHit = W.traders.filter((w) => w.best[0] && w.pnl.realized && w.best[0].realized / w.pnl.realized > 0.8).length;
    const nTr = W.traders.length;
    const ofThem = (k) => (k === nTr ? (nTr === 1 ? 'It' : `All ${nTr}`) : `${k} of them`);
    s.push(`${nTr} human-looking wallet${nTr === 1 ? '' : 's'} remain${nTr === 1 ? 's' : ''}.` + (oneHit ? ` ${ofThem(oneHit)} made 80%+ of ${nTr === 1 ? 'its' : 'their'} PnL on a single token — one big hit, not a repeatable edge.` : ''));
    const cashed = W.traders.filter((w) => w.bagsChecked && w.bagsTotal < 5_000).length;
    if (cashed) s.push(`${ofThem(cashed)} hold${cashed === 1 ? 's' : ''} under $5k on-chain right now: the money is out. Watch what ${cashed === 1 && nTr === 1 ? 'it buys' : 'they buy'} next, not what ${cashed === 1 && nTr === 1 ? 'it' : 'they'} bought last.`);
  } else s.push('No human-looking wallet is left after filtering.');
  return s;
}

function notableText(r) {
  const n = r.notable, s = [];
  const w = n.whaleTotal;
  if (w.n) {
    const skew = w.sellUsd ? w.buyUsd / w.sellUsd : null;
    s.push(`${w.n} trades of $${fmtK(CONFIG.notable.whaleTradeUsd)} or more hit the ${w.tokens} most traded tokens in the window the API returns: ${money(w.buyUsd)} bought vs ${money(w.sellUsd)} sold${skew != null ? skew < 0.7 ? ' — big money is leaving, not arriving.' : skew > 1.4 ? ' — big money is buying.' : ' — roughly balanced.' : '.'}`);
    const top = n.whaleWallets[0];
    if (top) s.push(`Biggest single wallet in that flow: ${top.wallet.slice(0, 6)}…${top.wallet.slice(-4)} with ${money(top.buy + top.sell)} across ${top.n} trade${top.n > 1 ? 's' : ''} in ${top.tokens.join(', ')}${top.buy === 0 ? ' — all sells' : top.sell === 0 ? ' — all buys' : ''}.`);
  }
  if (n.volumeSurges.length) s.push(`Volume surges vs the previous 24h: ${n.volumeSurges.slice(0, 3).map((t) => `${t.symbol} ${pct(t.momentum.volChangePct)}`).join(', ')}. A surge with price flat is accumulation or a bot; a surge with price up is a move; a surge with price down is an exit.`);
  if (n.holderGainers.length) s.push(`Most new holders (airdrop spikes excluded): ${n.holderGainers.slice(0, 3).map((t) => `${t.symbol} +${t.holders.change24.toLocaleString()}`).join(', ')}.` + (n.holderLosers.length ? ` Most wallets leaving: ${n.holderLosers.slice(0, 3).map((t) => `${t.symbol} ${t.holders.change24.toLocaleString()}`).join(', ')}.` : ''));
  if (n.cexListed.length) s.push(`Tradeable on a centralized exchange: ${n.cexListed.map((t) => `${t.symbol} (${t.coin.cexListings.slice(0, 2).join(', ')}${t.coin.cexListings.length > 2 ? ', +' + (t.coin.cexListings.length - 2) : ''})`).join('; ')}. CEX access widens the buyer pool and gives you an exit that is not the pool.`);
  if (n.nearAth.length) s.push(`Within 15% of all-time high: ${n.nearAth.map((t) => `${t.symbol} (${pct(t.coin.athChangePct)})`).join(', ')}.`);
  if (n.newOnCoinGecko.length) s.push(`Newly listed on CoinGecko this week: ${n.newOnCoinGecko.map((t) => t.symbol).join(', ')}.`);
  return s;
}

function newsText(r) {
  const N = r.news, s = [];
  if (!N) return s;
  const f = N.feed;
  const good = N.items.filter((i) => i.tone === 'good').length, bad = N.items.filter((i) => i.tone === 'bad').length;
  if (N.items.length) s.push(`${N.items.length} headline${N.items.length === 1 ? '' : 's'} about ${CONFIG.networkLabel} or a coin traded here in the last ${CONFIG.news.windowHours}h, out of ${f.scanned.toLocaleString()} scanned from CoinGecko's news feed${f.spanHours ? ` (the feed reaches back ${f.spanHours.toFixed(0)}h; earlier matches come from the stored log)` : ''}.${bad ? ` ${bad} read${bad === 1 ? 's' : ''} as bad news on the keyword rule.` : ''}${good ? ` ${good} as good.` : ''}`);
  else s.push(`No headline in the last ${CONFIG.news.windowHours}h mentions ${CONFIG.networkLabel} or a coin traded here, out of ${f.scanned.toLocaleString()} scanned from CoinGecko's news feed. Quiet is information too: nothing is pulling outside attention to the chain today.`);
  const E = N.events;
  if (E.length) {
    const kinds = {};
    for (const e of E) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
    const label = { arrived: ['existing coin deployed here', 'existing coins deployed here'], 'big-launch': ['big day-one launch', 'big day-one launches'], pulled: ['liquidity pull', 'liquidity pulls'], added: ['liquidity add', 'liquidity adds'], 'crossed-up': ['market-cap level crossed up', 'market-cap levels crossed up'], 'crossed-down': ['market-cap level lost', 'market-cap levels lost'], listed: ['new exchange listing', 'new exchange listings'], chain: ['chain-wide change', 'chain-wide changes'], trending: ['token trending on CoinGecko globally', 'tokens trending on CoinGecko globally'], rug: ['launch pick gone', 'launch picks gone'] };
    s.push(`On-chain since ${N.prevDay || 'the last run'}: ${Object.entries(kinds).map(([k, n]) => `${n} ${(label[k] || [k, k])[n > 1 ? 1 : 0]}`).join(', ')}. These come from comparing today's universe with yesterday's snapshot — no feed involved.`);
    const worst = E.find((e) => e.tone === 'bad'), best = E.find((e) => e.tone === 'good');
    if (worst && best) s.push(`Biggest negative: ${worst.text} Biggest positive: ${best.text}`);
  } else if (!N.hasPrevUniverse) s.push('On-chain events start tomorrow: today\'s run is the first to store the full universe, so there is nothing to compare against yet.');
  else s.push(`Nothing structural moved since ${N.prevDay}: no big liquidity in or out, no market-cap level crossed, no new exchange listing among tracked tokens.`);
  return s;
}

function bandText(b, r) {
  const s = [];
  const skew = b.sellers ? b.buyers / b.sellers : null;
  s.push(`${b.count} tokens sit in the ${b.label} band and are older than two days; ${b.traded} traded today with real liquidity. Together: ${money(b.liquidity)} of liquidity, ${money(b.volume)} of 24h volume, ${b.buyers.toLocaleString()} buyers vs ${b.sellers.toLocaleString()} sellers${skew != null ? ` (${skew.toFixed(2)}×)` : ''}, ${b.traded ? Math.round((b.up / b.traded) * 100) : 0}% up on the day.`);
  const S = b.setups;
  if (S.picks.length) s.push(`${S.gated} tokens passed the structural gate; ${S.picks.length} scored ${CONFIG.setups.minScore}+ on the setup score and are below. ${S.runnersUp.length ? `Next in line: ${S.runnersUp.map((t) => `${t.symbol} (${t.score.toFixed(0)})`).join(', ')}.` : ''}`);
  else s.push(`${S.gated} tokens passed the structural gate but none scored ${CONFIG.setups.minScore}+ today. An empty list beats a weak one — nothing in this band shows demand worth chasing right now.`);
  if (b.rotate) s.push(b.fading.picks.length ? `Below the setups: the names in this band that are losing power. If you hold one, that is the list to read first.` : 'Nothing in this band is bleeding on two fronts at once today.');
  return s;
}

function yesterdayText(r) {
  const Y = r.yesterday;
  if (!Y) return ['First run on record. From tomorrow this section shows how the previous day\'s picks held up: liquidity, price and holders since they were listed.'];
  const rows = Y.rows;
  const by = (list) => rows.filter((x) => x.list === list);
  const s = [`${rows.length} tokens were listed on ${Y.day}. Here is where they are now.`];
  const nl = by('new launches');
  if (nl.length) {
    const dead = nl.filter((x) => ['rugged', 'gone'].includes(x.status)).length;
    s.push(`New launches: ${nl.filter((x) => ['holding', 'up'].includes(x.status)).length} of ${nl.length} still hold their liquidity, ${dead} are gone or under $5k.` + (dead === nl.length ? ' Every launch-day pick died within a day. That is the base rate on this chain, and it is why the launch page says "worth a look", never "buy".' : dead ? ' Launch-day picks die fast here; the structural bar filters scams, not failure.' : ''));
  }
  const av = by('avoid');
  if (av.length) s.push(`Avoid list: ${av.filter((x) => ['rugged', 'gone', 'bleeding', 'down'].includes(x.status)).length} of ${av.length} are down 25%+, bleeding liquidity or gone.`);
  return s;
}

// ---------- per token ----------
function tokenStory(t, r) {
  const s = [];
  const age = t.ageHours < 24 ? `${Math.floor(t.ageHours)}h` : `${Math.floor(t.ageHours / 24)}d`;
  s.push(`${t.symbol} is ${age} old with ${money(t.liquidity)} of liquidity across ${t.pools.length} pool${t.pools.length > 1 ? 's' : ''} and ${money(t.vol24)} of volume in 24h${t.turnover != null ? ` (${t.turnover.toFixed(1)}× its liquidity)` : ''}.`);
  if (t.holders) {
    if (t.holders.sinceLaunch) s.push(`${n(t.holders.now)} holders, ${t.holders.change24 >= 0 ? '+' : ''}${n(t.holders.change24)} since launch; ${n(t.tx24.buyers)} unique buyers vs ${n(t.tx24.sellers)} sellers, so ${t.buyersRatio != null && t.buyersRatio !== Infinity ? t.buyersRatio.toFixed(1) : '∞'} buyers per seller.`);
    else s.push(`${n(t.holders.now)} holders, ${pct(t.holders.change24Pct)} in 24h${t.holders.change7dPct != null ? ` and ${pct(t.holders.change7dPct)} over 7 days` : ''}; ${n(t.tx24.buyers)} unique buyers vs ${n(t.tx24.sellers)} sellers today.`);
    if (t.holdersInflated) s.push('The holder jump is not matched by buyers — it looks like an airdrop or distribution, not demand.');
  }
  if (t.whales) s.push(`Top-10 wallets (pool contracts removed) hold ${t.whales.top10PctExPool.toFixed(1)}%, the largest ${t.whales.largestWalletPct.toFixed(1)}%${t.whales.poolPct ? `; the pool itself holds ${t.whales.poolPct.toFixed(0)}%` : ''}.`);
  else if (t.top10Pct != null) s.push(`Top-10 holders including the pool: ${t.top10Pct.toFixed(0)}% (wallet-level list not available).`);
  if (t.flow) {
    const f = t.flow;
    const dir = f.netUsd > 0 ? 'net buying' : 'net selling';
    s.push(`Last ${f.n} trades (${f.spanMin < 90 ? Math.round(f.spanMin) + ' min' : (f.spanMin / 60).toFixed(1) + 'h'}): ${money(f.buyUsd)} bought vs ${money(f.sellUsd)} sold — ${dir} of ${money(Math.abs(f.netUsd))}, ${f.wallets} wallets, median trade ${money(f.medianUsd)}${f.perMinute >= 1 ? `, ${f.perMinute.toFixed(1)} trades a minute` : ''}.`);
    if (f.concentration != null && f.concentration > 0.5) s.push(`${(f.concentration * 100).toFixed(0)}% of the buy volume came from three wallets — thin participation behind the flow.`);
    if (f.repeatWallets >= 5) s.push(`${f.repeatWallets} wallets traded five or more times in that window; expect bot activity in the tape.`);
  }
  if (t.sizing) s.push(`Sizing: a $1k buy moves price about ${t.sizing[0].impactPct.toFixed(1)}%, $5k about ${t.sizing[1].impactPct.toFixed(1)}%, $20k about ${t.sizing[2].impactPct.toFixed(0)}% (constant-product estimate on ${money(t.liquidity)} of liquidity, before fees and tax).`);
  if (t.overhang) {
    const o = t.overhang;
    if (o.pctOfPool >= 50) s.push(`Overhang: the largest wallet holds ${money(o.usd)}, ${o.pctOfPool.toFixed(0)}% of the pool's value — a full exit would cost it roughly ${o.impactPct.toFixed(0)}% of price and take everyone else down with it. That wallet is the price.`);
    else if (o.pctOfPool >= 15) s.push(`Overhang: the largest wallet holds ${money(o.usd)}, ${o.pctOfPool.toFixed(0)}% of the pool's value — roughly a ${o.impactPct.toFixed(0)}% move if it sold in one go.`);
    else s.push(`Overhang: the largest wallet holds ${money(o.usd)}, ${o.pctOfPool.toFixed(0)}% of the pool's value — small relative to the pool.`);
  }
  if (t.holders?.rate6 != null && t.holders.rate6prev != null && (t.holders.rate6prev > 0 || t.holders.rate6 < 0)) {
    const chg = t.holders.rate6prev > 0 ? ((t.holders.rate6 - t.holders.rate6prev) / t.holders.rate6prev) * 100 : 0;
    const r6 = Math.round(t.holders.rate6), r6p = Math.round(t.holders.rate6prev);
    if (r6 < 0) s.push(`Holder velocity: losing ${Math.abs(r6)} wallets an hour over the last 6h, after gaining ${r6p} an hour the 6h before — the exit has started.`);
    else s.push(`Holder velocity: ${r6} new wallets an hour over the last 6h vs ${r6p} the 6h before — ${chg >= 25 ? 'accelerating' : chg <= -25 ? 'slowing down' : 'steady'}.`);
  }
  if (t.buyersRatio1 != null && t.buyersRatio != null && t.buyersRatio1 !== Infinity && t.buyersRatio !== Infinity && t.tx1.buyers + t.tx1.sellers >= 20) {
    const d = t.buyersRatio1 - t.buyersRatio;
    s.push(`Buyer skew ${t.buyersRatio1.toFixed(2)}× in the last hour vs ${t.buyersRatio.toFixed(2)}× over 24h — ${d >= 0.2 ? 'buyers stepping up right now' : d <= -0.2 ? 'buyers thinning out right now' : 'no change in the last hour'}.`);
  }
  if (t.momentum?.volChangePct != null) s.push(`Volume ${pct(t.momentum.volChangePct)} vs the previous 24h; price ${pct(t.momentum.fromHiPct)} from its 48h high.`);
  if (t.coin) {
    const bits = [];
    if (t.coin.athChangePct != null) bits.push(`${pct(t.coin.athChangePct)} from ATH`);
    if (t.coin.cexListings.length) bits.push(`listed on ${t.coin.cexListings.join(', ')}`); else bits.push('DEX only');
    if (t.coin.watchlistUsers) bits.push(`${n(t.coin.watchlistUsers)} CoinGecko watchlists`);
    s.push(`On CoinGecko: ${bits.join(' · ')}.`);
  } else s.push('Not listed as a coin on CoinGecko yet — no exchange tickers, no ATH history.');
  const soc = ['website', 'twitter', 'telegram', 'discord'].filter((k) => t.socials[k]);
  s.push(soc.length ? `Socials: ${soc.join(', ')}.` : 'No website, X, Telegram or Discord on record. For a meme that is a real negative: nobody is marketing it.');
  if (t.heldBy?.length) s.push(`${t.heldBy.length} of today's winning human wallets hold${t.heldBy.length === 1 ? 's' : ''} it right now (${t.heldBy.map((w) => money(w.usd)).join(', ')}).`);
  else if (t.tradedBy?.length) s.push(`${t.tradedBy.length} of today's winning human wallets traded it — and are out.`);
  if (t.topTraders) {
    const insiders = t.topTraders.filter((w) => w.buys === 0 && (w.sellUsd || 0) > 1000);
    if (insiders.length >= 2) s.push(`${insiders.length} of the top ${t.topTraders.length} earners on this token sold without ever buying — ${money(insiders.reduce((a, w) => a + (w.sellUsd || 0), 0))} of supply came from team, airdrop or transfer wallets. New holders here are absorbing insider supply.`);
    else if (insiders.length === 1) s.push(`One of the top earners sold ${money(insiders[0].sellUsd)} without ever buying — a team, airdrop or transfer wallet.`);
    const sellTotal = t.topTraders.reduce((a, w) => a + (w.sellUsd || 0), 0), buyTotal = t.topTraders.reduce((a, w) => a + (w.buyUsd || 0), 0);
    if (buyTotal && sellTotal / buyTotal >= 1.5 && !insiders.length) s.push(`The top traders have sold ${money(sellTotal)} against ${money(buyTotal)} bought: the people who made money here are mostly out.`);
  }
  if (t.setupReasons) {
    const inv = [];
    if (t.top10Pct != null) inv.push(`top-10 wallets passing ${CONFIG.setups.maxTop10Pct}% (now ${t.top10Pct.toFixed(0)}%)`);
    inv.push(`holders turning negative on the day${t.holders?.change24 != null ? ` (now ${t.holders.change24 >= 0 ? '+' : ''}${t.holders.change24})` : ''}`);
    if (t.momentum?.lo48) inv.push(`a close below the 48h low (${fmtPrice(t.momentum.lo48)})`);
    inv.push(`liquidity under $${fmtK(CONFIG.setups.minLiquidityUsd)} (now $${fmtK(t.liquidity)})`);
    s.push(`Thesis: ${t.setupReasons.length ? t.setupReasons.join(', ') : 'steady demand without a chart move'} — setup score ${t.score.toFixed(0)}/100${t.inDip ? ', and it is on sale' : ''}.`);
    s.push(`What breaks it: ${inv.slice(0, 3).join('; ')}.`);
  }
  if (t.biggerTwin) s.push(`A much bigger ${t.symbol} already exists — ${money(t.biggerTwin.mcap)} market cap, ${Math.floor(t.biggerTwin.ageHours / 24)}d old, ${money(t.biggerTwin.liquidity)} of liquidity. This is not that token; check the contract address before you act on the name.`);
  const margin = closestToFailing(t, r);
  if (margin) s.push(`Closest to failing: ${margin}.`);
  if (t.flags.length) s.push(`Flags: ${t.flags.map((f) => f.text).join('; ')}.`);
  return s;
}

// Which rule the token is nearest to breaking — so a reader knows what would knock it off the list tomorrow.
function closestToFailing(t, r) {
  const c = CONFIG;
  const checks = [];
  const isLaunch = r.newLaunches.picks.includes(t), isAcc = r.accumulation.picks.includes(t);
  if (isLaunch) {
    checks.push({ label: `liquidity ${money(t.liquidity)} vs the $${fmtK(c.newLaunch.minLiquidityUsd)} floor`, room: (t.liquidity - c.newLaunch.minLiquidityUsd) / c.newLaunch.minLiquidityUsd });
    if (t.whales) checks.push({ label: `top-10 wallets ${t.top10Pct.toFixed(0)}% vs the ${c.newLaunch.maxTop10PctExPool}% cap`, room: (c.newLaunch.maxTop10PctExPool - t.top10Pct) / c.newLaunch.maxTop10PctExPool });
    if (t.pch.h24 != null) checks.push({ label: `price ${pct(t.pch.h24)} vs the ${c.newLaunch.maxDrawdown24}% day limit`, room: (t.pch.h24 - c.newLaunch.maxDrawdown24) / 100 });
    checks.push({ label: `${t.tx24.buyers} unique buyers vs the ${c.newLaunch.minBuyers24} minimum`, room: (t.tx24.buyers - c.newLaunch.minBuyers24) / c.newLaunch.minBuyers24 });
  } else if (isAcc) {
    const sc = c.setups;
    checks.push({ label: `setup score ${t.score.toFixed(0)} vs the ${sc.minScore} minimum`, room: (t.score - sc.minScore) / 30 });
    if (t.top10Pct != null) checks.push({ label: `top-10 wallets ${t.top10Pct.toFixed(0)}% vs the ${sc.maxTop10Pct}% cap`, room: (sc.maxTop10Pct - t.top10Pct) / sc.maxTop10Pct });
    if (t.turnover != null) checks.push({ label: `turnover ${t.turnover.toFixed(1)}× vs the ${sc.maxTurnover}× cap`, room: (sc.maxTurnover - t.turnover) / sc.maxTurnover });
    checks.push({ label: `liquidity ${money(t.liquidity)} vs the $${fmtK(sc.minLiquidityUsd)} floor`, room: (t.liquidity - sc.minLiquidityUsd) / sc.minLiquidityUsd });
    if (t.holders?.change24 != null) checks.push({ label: `holders ${t.holders.change24 >= 0 ? '+' : ''}${t.holders.change24} on the day vs the "not shrinking" rule`, room: t.holders.change24 / Math.max(50, t.holdersCount * 0.05) });
    if (t.insiderShare != null) checks.push({ label: `${(t.insiderShare * 100).toFixed(0)}% of top-trader sells from wallets that never bought vs the ${(sc.maxInsiderShare * 100).toFixed(0)}% cap`, room: (sc.maxInsiderShare - t.insiderShare) / sc.maxInsiderShare });
  } else return null;
  const tight = checks.filter((x) => Number.isFinite(x.room)).sort((a, b) => a.room - b.room)[0];
  if (!tight) return null;
  return tight.room < 0.5 ? tight.label : `nothing — comfortably inside every rule (tightest: ${tight.label})`;
}

function avoidStory(t) {
  const s = [`${t.symbol}: ${money(t.vol24)} of volume today with ${money(t.liquidity)} of liquidity.`];
  if (t.reasons.some((x) => /liquidity vs/i.test(x))) s.push(`The market cap figure is a fully-diluted number with almost nothing behind it — ${t.copycats ? 'this is a ticker clone, not the token people are talking about.' : 'nobody could sell into it.'}`);
  if (t.whales?.largestWalletPct > 30) s.push(`One wallet holds ${t.whales.largestWalletPct.toFixed(1)}% — if that is not a labelled contract, that wallet decides the price.`);
  if (t.flow) s.push(`Last ${t.flow.n} trades: ${money(t.flow.buyUsd)} bought vs ${money(t.flow.sellUsd)} sold.`);
  return s;
}
