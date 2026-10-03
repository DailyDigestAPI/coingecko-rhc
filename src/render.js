// Renders the analyzed report as one self-contained HTML document, two pages:
//   page 1 — chain digest + new launches, each with a full deep dive
//   page 2 — existing coins: quiet accumulation, losing power, avoid, who's winning, yesterday revisited
// No external assets. Prints with a page break between the two.
import { CONFIG } from './config.js';
import { pct, fmtK } from './analyze.js';

const UTM = `utm_source=x&utm_content=${CONFIG.handle}`;
const CG_LINKS = {
  api: `https://www.coingecko.com/en/api?${UTM}`,
  pricing: `https://www.coingecko.com/en/api/pricing?${UTM}`,
  docs: `https://docs.coingecko.com/?${UTM}`,
};

export function render(r) {
  const o = r.overview;
  const day = new Date(r.generatedAt);
  const dateStr = day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const timeStr = day.toISOString().slice(11, 16) + ' UTC';
  const n = r.notable;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${CONFIG.networkLabel} Meme Digest · ${r.day}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>${CSS}</style></head>
<body><main class="page">

<!-- ============================== PAGE 1 · DIGEST ============================== -->
<header class="banner pg1">
  <div class="banner-num">01</div>
  <div class="banner-body">
    <div class="kicker">${esc(CONFIG.networkLabel)} · daily meme digest · ${dateStr}</div>
    <h1>The chain today <span class="heat heat-${o.heat.toLowerCase()}">${o.heat}</span></h1>
    <div class="sub">${o.heatWhy.map(esc).join(' · ')}</div>
  </div>
  <div class="meta">
    <div>Data: <a href="${CG_LINKS.api}">CoinGecko API</a></div>
    <div>${o.poolsScanned.toLocaleString()} pools scanned · ${o.memesTracked} memes tracked · ${timeStr}</div>
    <div class="dim">${(r.health.calls + r.health.cached).toLocaleString()} API calls · ${r.health.failed} failed · ${r.durationSec}s</div>
  </div>
</header>

<section class="overview">
  <div class="lead">${esc(r.story.today[3] || '')}</div>
  <div class="tiles">
    ${tile('24h meme volume', '$' + fmtK(o.totalVolume24), o.volPrev24 ? delta((o.volLast24 - o.volPrev24) / o.volPrev24 * 100, 'vs prev 24h') : 'from ' + o.tradeable + ' traded tokens')}
    ${tile('Meme liquidity', '$' + fmtK(o.totalLiquidity), `across ${o.memesTracked} tokens`)}
    ${tile('Buyers vs sellers', o.buyerSkew != null ? o.buyerSkew.toFixed(2) + '×' : '—', `${o.buyers24.toLocaleString()} buying · ${o.sellers24.toLocaleString()} selling`, o.buyerSkew == null ? '' : o.buyerSkew >= 1.1 ? 'up' : o.buyerSkew <= 0.9 ? 'down' : '')}
    ${tile('Breadth', o.breadthPct != null ? o.breadthPct.toFixed(0) + '%' : '—', `of traded memes up · median ${pct(o.medianChange24)}`, o.breadthPct == null ? '' : o.breadthPct >= 55 ? 'up' : o.breadthPct <= 40 ? 'down' : '')}
    ${tile('New pool every', o.launchEveryMin != null ? (o.launchEveryMin < 1 ? `${Math.round(o.launchEveryMin * 60)}s` : `${o.launchEveryMin.toFixed(1)} min`) : '—', o.launchSpan ? `${o.newPoolsSwept}${o.newPoolsCapped ? '+' : ''} pools created in the last ${o.launchSpan < 10 ? o.launchSpan.toFixed(1) : o.launchSpan.toFixed(0)}h` : 'no launch data')}
    ${tile('Whale flow', n.whaleTotal.n ? money(n.whaleTotal.buyUsd - n.whaleTotal.sellUsd) : '—', n.whaleTotal.n ? `net, ${n.whaleTotal.n} trades ≥ $${fmtK(CONFIG.notable.whaleTradeUsd)} on the top ${n.whaleTotal.tokens} tokens` : 'no large trades returned', n.whaleTotal.n ? (n.whaleTotal.buyUsd >= n.whaleTotal.sellUsd ? 'up' : 'down') : '')}
  </div>
  <div class="two">
    <div class="prose">
      <h3>Today in short</h3>
      ${r.story.today.filter((_, k) => k !== 3).map((p) => `<p>${esc(p)}</p>`).join('')}
      <p class="dim">${o.survivors7d} of this week's launches still hold $10k+ liquidity · honeypot flags ${o.honeypots} of ${o.honeypotChecked} checked.</p>
    </div>
    <div class="strips">
      ${strip('Most traded', o.byVolume.map((t) => chip(t, '$' + fmtK(t.vol24))))}
      ${strip('Trending on GeckoTerminal', o.trending.map((t) => chip(t, '')))}
      ${strip('Market cap mix', [`<span class="chip"><b>${o.sizeBuckets.micro}</b> under $100k</span>`, `<span class="chip"><b>${o.sizeBuckets.small}</b> $100k–1M</span>`, `<span class="chip"><b>${o.sizeBuckets.mid}</b> $1M–10M</span>`, `<span class="chip"><b>${o.sizeBuckets.large}</b> over $10M</span>`, o.eth ? `<span class="chip dim">ETH $${o.eth.price.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${pct(o.eth.change24)}</span>` : ''])}
    </div>
  </div>
</section>

<section>
  <h2>What's happening <span class="count">headlines and on-chain events — what changed, not how much traded</span></h2>
  <div class="prose">${r.story.news.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
  ${newsBlock(r)}
</section>

<section>
  <h2>Notable today <span class="count">movers, flows and listings worth knowing before the lists</span></h2>
  <div class="prose">${r.story.notable.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
  <div class="notable">
    ${noteList('Most new holders', n.holderGainers, (t) => `<b class="up">+${t.holders.change24.toLocaleString()}</b> <span class="dim">${t.holders.now.toLocaleString()} total · price ${pct(t.pch.h24)}</span>`)}
    ${noteList('Volume surges', n.volumeSurges, (t) => `<b class="up">${pct(t.momentum.volChangePct)}</b> <span class="dim">$${fmtK(t.vol24)} · price ${pct(t.pch.h24)}</span>`)}
    ${noteList('Top gainers 24h', n.gainers, (t) => `<b class="up">${pct(t.pch.h24)}</b> <span class="dim">$${fmtK(t.liquidity)} liq</span>`)}
    ${noteList('Top losers 24h', n.losers, (t) => `<b class="down">${pct(t.pch.h24)}</b> <span class="dim">$${fmtK(t.liquidity)} liq</span>`)}
  </div>
  <details class="more"><summary>More movers — volume collapses, wallets leaving, CEX-listed, near ATH</summary><div class="notable">
    ${noteList('Volume collapses', n.volumeCollapses, (t) => `<b class="down">${pct(t.momentum.volChangePct)}</b> <span class="dim">$${fmtK(t.vol24)} · price ${pct(t.pch.h24)}</span>`)}
    ${noteList('Most wallets leaving', n.holderLosers, (t) => `<b class="down">${t.holders.change24.toLocaleString()}</b> <span class="dim">${t.holders.now.toLocaleString()} left · price ${pct(t.pch.h24)}</span>`)}
    ${noteList('On a CEX', n.cexListed, (t) => `<span class="dim">${esc(t.coin.cexListings.slice(0, 3).join(', '))}${t.coin.cexListings.length > 3 ? ` +${t.coin.cexListings.length - 3}` : ''}</span>`)}
    ${noteList('Near all-time high', n.nearAth, (t) => `<b class="up">${pct(t.coin.athChangePct)}</b> <span class="dim">from ATH</span>`, 'Nothing within 15% of its ATH today.')}
    ${n.newOnCoinGecko.length ? noteList('New on CoinGecko this week', n.newOnCoinGecko, (t) => `<span class="dim">listed ${new Date(t.coin.listedAt).toISOString().slice(0, 10)}</span>`) : ''}
  </div></details>
  ${whaleTable(n)}
</section>

<div class="grid2">
<section>
  <h2>Who's actually winning <span class="count">top realized PnL across the ${Math.min(CONFIG.wallets.maxTokens, r.tokens.filter((t) => t.topTraders).length)} most traded memes</span></h2>
  <div class="prose">${r.story.wallets.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
  ${r.wallets.traders.length ? r.wallets.traders.map(walletCard).join('') : empty(`Every one of the ${r.wallets.checked} top-PnL wallets checked today is a bot, router or insider wallet.`)}
  ${r.wallets.biggest && r.wallets.biggest.kind !== 'trader' ? `<p class="rule">For scale: the single largest realized PnL belongs to <a href="${esc(r.wallets.biggest.explorer || '#')}">${short(r.wallets.biggest.address)}</a> at <b>${money(r.wallets.biggest.pnl.realized ?? r.wallets.biggest.realizedPnl)}</b> — ${esc(r.wallets.biggest.tags[0]?.text || '')}.</p>` : ''}
</section>
<section>
  <h2>Yesterday's picks, today <span class="count">${r.yesterday ? `listed on ${r.yesterday.day}` : 'tracking starts today'}</span></h2>
  <div class="prose">${r.story.yesterday.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
  ${r.yesterday ? `<table class="revisit"><thead><tr><th>List</th><th>Token</th><th>Liquidity then → now</th><th>Price</th><th>Status</th><th>Today</th></tr></thead><tbody>${r.yesterday.rows.map(revisitRow).join('')}</tbody></table>` : ''}
</section>
</div>

<!-- ============================== PAGE 2 · NEW LAUNCHES ============================== -->
<div class="pagebreak"></div>
<header class="banner pg2">
  <div class="banner-num">02</div>
  <div class="banner-body">
    <div class="kicker">${esc(CONFIG.networkLabel)} · daily meme digest · ${dateStr}</div>
    <h1>New launches</h1>
    <div class="sub">What launched this week, still early ($${fmtK(CONFIG.newLaunch.mcapMin)}–$${fmtK(CONFIG.newLaunch.mcapMax)} market cap), cleared the safety bar, and scored highest on demand.</div>
  </div>
  <div class="meta"><div>${r.newLaunches.picks.length} pick${r.newLaunches.picks.length === 1 ? '' : 's'} · ${r.newLaunches.early} in the window</div><div>${r.newLaunches.passed} passed · ${r.newLaunches.candidates} launched</div></div>
</header>

<section>
  <h2>New launches worth a look <span class="count">${r.newLaunches.picks.length} picked · ${r.newLaunches.early} in the early window · ${r.newLaunches.passed} passed the bar · ${r.newLaunches.candidates} launched this week</span></h2>
  <p class="rule">Rule: ${esc(r.newLaunches.rule)}. Ranked by holder growth, buyer skew, unique buyers, depth, turnover, range, GT Score and socials.</p>
  <div class="prose lead-p">${r.story.launches.slice(0, 1).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
  <div class="prose small">${r.story.launches.slice(1).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
  ${r.newLaunches.picks.length ? r.newLaunches.picks.map((t, i) => deepCard(t, i + 1, 'launch')).join('') : empty('Nothing in the early window clears the bar today. An empty list beats chasing — the filters are strict on purpose.')}
  ${r.newLaunches.runnersUp.length ? `<details class="more"><summary>Also in the window, lower score (${r.newLaunches.runnersUp.length})</summary><div class="runners">${r.newLaunches.runnersUp.map((t) => miniChip(t)).join(' ')}</div></details>` : ''}
  ${r.newLaunches.outsideWindow?.length ? `<details class="more"><summary>Already ran past the window (${r.newLaunches.outsideWindow.length}) — strong, but late</summary><div class="runners">${r.newLaunches.outsideWindow.map((t) => miniChip(t)).join(' ')}</div></details>` : ''}
</section>

<!-- ============================== PAGE 3 · EXISTING COINS ============================== -->
<div class="pagebreak"></div>
<header class="banner pg3">
  <div class="banner-num">03</div>
  <div class="banner-body">
    <div class="kicker">${esc(CONFIG.networkLabel)} · daily meme digest · ${dateStr}</div>
    <h1>Existing coins</h1>
    <div class="sub">Older than two days, split by market cap. Best setups by score per band, the bags losing power in the bigger band, then what to avoid.</div>
  </div>
  <div class="meta">${r.bands.map((b) => `<div>${esc(b.label)}: ${b.setups.picks.length} setup${b.setups.picks.length === 1 ? '' : 's'}${b.rotate ? ` · ${b.fading.picks.length} to rotate` : ''}</div>`).join('')}<div>${r.avoid.length} to avoid</div></div>
</header>

${r.bands.map(bandSection).join('')}

<section>
  <h2>Avoid <span class="count">traded today, failed a hard check</span></h2>
  <div class="prose">${r.story.avoid.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
  <div class="grid2">${r.avoid.length ? r.avoid.map(avoidRow).join('') : empty('No traded token failed a hard check today.')}</div>
</section>

<footer>
  <p><b>How to read this.</b> Every number is CoinGecko API data for ${esc(CONFIG.networkLabel)}. Every list, score, flag, sentence and the HOT/MIXED/COLD call are computed by <a href="https://github.com/DailyDigestAPI/coingecko-rhc">this open-source script</a> from that data, using the rules printed above each section. They are not CoinGecko ratings and not financial advice. Memes on a new chain can go to zero in an afternoon; the Avoid list is a floor, not a guarantee.</p>
  <p><b>Glossary.</b> <i>Top-10 wallets</i> — share of supply held by the ten largest holders after removing pool, LP, locker and burn contracts. <i>GT Score</i> — GeckoTerminal's 0–100 token quality score, from CoinGecko. <i>Turnover</i> — 24h volume divided by liquidity; above ~10× usually means bots churning a thin pool. <i>Flow</i> — the last ~300 trades in the main pool, as reported by the API. <i>Whale flow</i> — trades of $${fmtK(CONFIG.notable.whaleTradeUsd)}+ on the ${CONFIG.notable.whaleTradeTokens} most traded tokens, in the window the API returns. <i>Holders since launch</i> — for tokens under 24h old, the 24h change is the whole history.</p>
  ${r.health.failed ? `<p class="dim">Run health: ${r.health.failed} of ${r.health.calls + r.health.cached} calls returned nothing (${[...new Set(r.health.failures.map((f) => f.endpoint.split('/').slice(-1)[0]))].slice(0, 6).join(', ')}). Affected tokens show "not available" for that field rather than a guess.</p>` : `<p class="dim">Run health: all ${(r.health.calls + r.health.cached).toLocaleString()} calls returned data.</p>`}
  <p class="links">CoinGecko API: <a href="${CG_LINKS.api}">overview</a> · <a href="${CG_LINKS.pricing}">pricing</a> · <a href="${CG_LINKS.docs}">docs</a> &nbsp;|&nbsp; by <a href="https://x.com/${CONFIG.handle}">@${CONFIG.handle}</a></p>
</footer>
</main>
<script>${JS}</script>
</body></html>`;
}

// ---------- page 1 blocks ----------
function newsBlock(r) {
  const N = r.news;
  if (!N) return '';
  const toneCls = (t) => (t === 'good' ? 'up' : t === 'bad' ? 'down' : 'dim');
  const toneWord = (t) => (t === 'good' ? 'good' : t === 'bad' ? 'bad' : 'neutral');
  const ago = (h) => (h < 1 ? `${Math.round(h * 60)}m ago` : h < 48 ? `${Math.floor(h)}h ago` : `${Math.floor(h / 24)}d ago`);
  const head = N.items.length
    ? `<ul class="news">${N.items.map((i) => `<li><span class="pill ${toneCls(i.tone)}">${toneWord(i.tone)}</span><a href="${esc(i.url)}">${esc(i.title)}</a><span class="dim">${esc(i.source || '')} · ${ago(i.hoursAgo)}${i.tokens.length ? ' · ' : ''}</span>${i.tokens.map((t) => tokenLink(t)).join(' ')}</li>`).join('')}</ul>`
    : empty(`No headline in the last ${CONFIG.news.windowHours}h mentions ${CONFIG.networkLabel} or a tracked coin. ${N.feed.scanned.toLocaleString()} items scanned.`);
  const ev = N.events.length
    ? `<ul class="news">${N.events.map((e) => `<li><span class="pill ${toneCls(e.tone)}">${toneWord(e.tone)}</span><span>${esc(e.text)}</span>${e.token ? tokenLink(e.token) : ''}</li>`).join('')}</ul>`
    : empty(N.hasPrevUniverse ? `Nothing structural changed since ${esc(N.prevDay)}.` : 'On-chain events start tomorrow — today is the first run that stores the full universe.');
  return `<div class="grid2 newsgrid">
    <div class="note"><h4>Headlines <span class="dim">CoinGecko news feed · about ${esc(CONFIG.networkLabel)} or a coin traded here</span></h4>${head}</div>
    <div class="note"><h4>On-chain since ${esc(N.prevDay || 'last run')} <span class="dim">arrivals, launches, liquidity in/out, levels, listings</span></h4>${ev}</div>
  </div>`;
}

function noteList(title, items, fmt, emptyText = '') {
  if (!items.length && !emptyText) return '';
  return `<div class="note"><h4>${esc(title)}</h4>${items.length ? `<ul>${items.map((t) => `<li>${tokenLink(t)} ${fmt(t)}</li>`).join('')}</ul>` : `<div class="dim">${esc(emptyText)}</div>`}</div>`;
}

function whaleTable(n) {
  if (!n.whaleTrades.length) return '';
  return `<div class="tbl whales"><h4>Biggest trades <span class="dim">≥ $${fmtK(CONFIG.notable.whaleTradeUsd)} on the ${n.whaleTotal.tokens} most traded tokens · ${n.whaleTotal.n} trades · <span class="up">${money(n.whaleTotal.buyUsd)} bought</span> · <span class="down">${money(n.whaleTotal.sellUsd)} sold</span></span></h4>
    <div class="grid2">
      <table><tbody>${n.whaleTrades.slice(0, 6).map((x) => `<tr><td class="${x.kind === 'buy' ? 'up' : 'down'}">${x.kind}</td><td><b>${money(x.usd)}</b></td><td><a class="tok" href="https://www.geckoterminal.com/${CONFIG.network}/pools/${esc(x.pool)}?${UTM}">${esc(x.symbol)}</a></td><td><a class="addr" href="${CONFIG.explorer}/tx/${esc(x.tx)}">${short(x.wallet)}</a></td><td class="dim num">${new Date(x.ts).toISOString().slice(11, 16)}</td></tr>`).join('')}</tbody></table>
      <div><div class="dim" style="margin-bottom:4px">Most active large wallets</div><table><tbody>${n.whaleWallets.map((w) => `<tr><td><a class="addr" href="${CONFIG.explorer}/address/${esc(w.wallet)}">${short(w.wallet)}</a></td><td><span class="up">${money(w.buy)}</span> / <span class="down">${money(w.sell)}</span></td><td class="dim">${w.n} trade${w.n > 1 ? 's' : ''} · ${w.tokens.map(esc).join(', ')}</td></tr>`).join('')}</tbody></table></div>
    </div></div>`;
}

// ---------- page 3 blocks ----------
function bandSection(b) {
  const story = (b.story || []).map((p) => `<p>${esc(p)}</p>`).join('');
  return `<section class="band">
    <h2>${esc(b.label)} market cap <span class="count">${b.count} tokens · $${fmtK(b.liquidity)} liquidity · $${fmtK(b.volume)} volume · ${b.traded ? Math.round((b.up / b.traded) * 100) : 0}% up</span></h2>
    <div class="prose">${story}</div>
    ${b.table.length ? `<details class="more"><summary>Most traded in this band (${b.table.length})</summary><table class="bandtable"><thead><tr><th>Token</th><th>Age</th><th>Mcap</th><th>Liq</th><th>Vol 24h</th><th>24h</th><th>Buyers / sellers</th><th>Holders</th><th>Top-10</th><th>Flags</th></tr></thead><tbody>${b.table.map(bandRow).join('')}</tbody></table></details>` : empty('No token in this band traded with real liquidity today.')}
    <h3 class="sub-h">Best setups <span class="count">visible demand in a token you can still get into</span></h3>
    <p class="rule">Rule: ${esc(b.setups.rule)}.</p>
    ${b.setups.picks.length ? b.setups.picks.map((t, i) => deepCard(t, i + 1, 'up', `${t.why} · score ${t.score.toFixed(0)}`)).join('') : empty(`${b.setups.gated} tokens passed the gate, none scored ${CONFIG.setups.minScore}+. Nothing worth chasing in this band today.`)}
    ${b.rotate ? `<h3 class="sub-h">Consider rotating out <span class="count">bags losing power — wallets leaving, volume drying up</span></h3>
    <p class="rule">Rule: ${esc(b.fading.rule)}.</p>
    ${b.fading.picks.length ? b.fading.picks.map((t, i) => deepCard(t, i + 1, 'down', t.reasons.join(' · '))).join('') : empty(`Checked ${b.fading.checked} tokens in this band. Nothing is bleeding on two fronts at once today.`)}` : ''}
  </section>`;
}
function bandRow(t) {
  const fl = t.flags.filter((f) => f.level !== 'grey').slice(0, 2);
  return `<tr><td class="sym">${tokenLink(t)} <span class="dim">${esc(t.name)}</span></td><td>${age(t.ageHours)}</td><td>$${fmtK(t.mcap || t.fdv)}</td><td>$${fmtK(t.liquidity)}</td><td>$${fmtK(t.vol24)}</td><td class="${tone(t.pch.h24)}">${pct(t.pch.h24)}</td><td>${t.tx24.buyers} / ${t.tx24.sellers}</td><td>${t.holdersCount != null ? t.holdersCount.toLocaleString() : '—'}${t.holders?.change24 != null && !t.holders.sinceLaunch ? ` <span class="${tone(t.holders.change24)}">${t.holders.change24 >= 0 ? '+' : ''}${t.holders.change24}</span>` : ''}</td><td>${t.top10Pct != null ? t.top10Pct.toFixed(0) + '%' : '—'}</td><td>${fl.length ? fl.map((f) => `<span class="flag ${f.level}">${esc(f.text)}</span>`).join(' ') : '<span class="flag green">none</span>'}</td></tr>`;
}

// ---------- the deep-dive card ----------
function deepCard(t, n, kind, headline = '') {
  const i = t.info || {};
  const listings = t.coin ? (t.coin.cexListings.length ? t.coin.cexListings.join(', ') : `DEX only (${t.coin.dexCount} pairs)`) : (t.cgId ? 'on CoinGecko' : 'not on CoinGecko yet');
  const locked = !t.pool.lockedChecked ? 'not checked' : t.pool.lockedLiquidityPct == null ? 'not found' : t.pool.lockedLiquidityPct.toFixed(0) + '%';
  const dev = i.devHoldingPct != null ? i.devHoldingPct.toFixed(1) + '%' : 'not found';
  const sinceLabel = t.ageHours < 24 ? 'since launch' : '24h';
  const story = (t.story || []);
  const thesis = story.find((x) => x.startsWith('Thesis:'));
  const breaks = story.find((x) => x.startsWith('What breaks it:'));
  const rest = story.filter((x) => x !== thesis && x !== breaks);
  const verdict = kind === 'launch' ? `Early, and the data says demand is real — score ${t.score.toFixed(0)}/100` : kind === 'up' ? (t.inDip ? 'On a dip with demand still arriving' : 'Demand is visible and it is still tradeable') : 'Wallets are leaving — if you hold it, read this first';
  return `<article class="deep kind-${kind}">
    <div class="head">
      <span class="rank">#${n}</span>
      ${avatar(t)}
      <div class="title"><div class="sym">${esc(t.symbol)} <span class="name">${esc(t.name)}</span>${t.trending ? ' <span class="tag">trending</span>' : ''}${t.biggerTwin ? ` <span class="tag amber">clone of a $${fmtK(t.biggerTwin.mcap)} ${esc(t.symbol)}</span>` : t.copycats >= 1 ? ` <span class="tag grey">${t.copycats} clone${t.copycats > 1 ? 's' : ''}</span>` : ''}</div>
      <div class="dim">${age(t.ageHours)} old · ${esc(t.pool.dex || '')} · ${esc(t.pool.name || '')}${t.pools.length > 1 ? ` · +${t.pools.length - 1} more pool${t.pools.length > 2 ? 's' : ''}` : ''}</div></div>
      <div class="price">${price(t.price)}<div class="${tone(t.pch.h24)}">${pct(t.pch.h24)} ${sinceLabel}</div>${t.pch.h1 != null ? `<div class="dim">${pct(t.pch.h1)} 1h · ${pct(t.pch.h6)} 6h</div>` : ''}</div>
    </div>
    <div class="verdict ${kind === 'down' ? 'bad' : 'good'}">${esc(verdict)}${headline ? `<span class="dim"> — ${esc(headline)}</span>` : ''}</div>
    <div class="bignums">
      ${big('Mcap', '$' + fmtK(t.mcap || t.fdv))}${big('Liquidity', '$' + fmtK(t.liquidity), t.liqToMcap != null ? (t.liqToMcap * 100).toFixed(0) + '% of mcap' : '')}${big('Vol 24h', '$' + fmtK(t.vol24), t.turnover != null ? t.turnover.toFixed(1) + '× liq' : '')}
      ${big('Buyers / sellers', `${t.tx24.buyers} / ${t.tx24.sellers}`, t.buyersRatio != null && t.buyersRatio !== Infinity ? t.buyersRatio.toFixed(2) + '×' : '', t.buyersRatio != null && t.buyersRatio !== Infinity ? (t.buyersRatio >= 1.2 ? 'up' : t.buyersRatio <= 0.85 ? 'down' : '') : '')}
      ${big('Holders', t.holdersCount != null ? t.holdersCount.toLocaleString() : '—', holdersSub(t).split(' · ')[0])}${big('Top-10 wallets', t.top10Pct != null ? t.top10Pct.toFixed(0) + '%' : '—', t.whales ? `largest ${t.whales.largestWalletPct.toFixed(1)}%` : 'incl. pool', t.top10Pct == null ? '' : t.top10Pct <= 20 ? 'up' : t.top10Pct >= 45 ? 'down' : '')}
    </div>
    <div class="cols">
      <div class="col-main">
        ${thesis ? `<div class="callout good"><b>Thesis</b>${esc(thesis.replace(/^Thesis:\s*/, ''))}</div>` : ''}
        ${breaks ? `<div class="callout bad"><b>What breaks it</b>${esc(breaks.replace(/^What breaks it:\s*/, ''))}</div>` : ''}
        <div class="prose">${rest.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
        ${flags(t.flags)}
        ${links(t)}
      </div>
      <div class="col-side">
        ${spark(t, 420, 70)}
        ${t.sizing ? `<div class="side-box"><h5>Price impact of a buy</h5><div class="impact">${t.sizing.map((x) => `<span><b>$${fmtK(x.usd)}</b> → ${x.impactPct < 10 ? x.impactPct.toFixed(1) : x.impactPct.toFixed(0)}%</span>`).join('')}</div><div class="dim">constant-product estimate, before fees</div></div>` : ''}
        ${t.overhang ? `<div class="side-box"><h5>Largest wallet vs pool</h5><div><b>$${fmtK(t.overhang.usd)}</b> = ${t.overhang.pctOfPool.toFixed(0)}% of the pool · ~${t.overhang.impactPct.toFixed(0)}% impact if it sold</div></div>` : ''}
        <div class="side-box"><h5>Safety</h5><div>Honeypot: <b>${i.honeypot === true ? 'YES' : i.honeypot === false ? 'no' : 'unknown'}</b> · mint/freeze: <b>${i.mintAuthority || i.freezeAuthority ? 'ACTIVE' : 'none'}</b> · GT Score <b>${i.gtScore != null ? i.gtScore.toFixed(0) : '—'}</b></div><div>Liquidity locked: <b>${locked}</b> · dev holding: <b>${dev}</b></div><div>Listings: <b>${esc(listings)}</b>${t.coin?.athChangePct != null ? ` · ${pct(t.coin.athChangePct)} from ATH` : ''}</div>
        <div class="socials">${social('web', t.socials.website)}${social('X', t.socials.twitter && 'https://x.com/' + t.socials.twitter)}${social('TG', t.socials.telegram && 'https://t.me/' + t.socials.telegram)}${social('DC', t.socials.discord)}${t.coin?.watchlistUsers ? `<span class="dim">${t.coin.watchlistUsers} watchlists</span>` : ''}</div></div>
      </div>
    </div>
    <details class="more"><summary>Full data — flow, holders, traders, every metric</summary>
      <div class="kv">
        ${kv('Vol 1h / 6h', `$${fmtK(t.vol1)} / $${fmtK(t.vol6)}`, t.momentum?.volChangePct != null ? `<span class="${tone(t.momentum.volChangePct)}">${pct(t.momentum.volChangePct)}</span> vs prev 24h` : '')}${kv('Buyers / sellers 6h', `${t.tx6.buyers} / ${t.tx6.sellers}`, t.buyersRatio6 != null && t.buyersRatio6 !== Infinity ? t.buyersRatio6.toFixed(2) + '×' : '')}
        ${t.holders?.rate6 != null ? kv('Holder velocity', `${Math.round(t.holders.rate6)}/h`, t.holders.rate6prev != null ? `vs ${Math.round(t.holders.rate6prev)}/h the 6h before` : 'last 6h') : ''}${t.buyersRatio1 != null && t.buyersRatio1 !== Infinity ? kv('Buyer skew 1h → 24h', `${t.buyersRatio1.toFixed(2)}× → ${t.buyersRatio != null && t.buyersRatio !== Infinity ? t.buyersRatio.toFixed(2) : '∞'}×`, `${t.tx1.buyers} buyers / ${t.tx1.sellers} sellers last hour`) : ''}
        ${kv('48h range', t.momentum ? `${price(t.momentum.lo48)} – ${price(t.momentum.hi48)}` : '—', t.momentum?.fromHiPct != null ? `${pct(t.momentum.fromHiPct)} from high` : '')}${kv('GT Score detail', i.gtScoreDetails ? `holders ${num0(i.gtScoreDetails.holders)} · tx ${num0(i.gtScoreDetails.transaction)} · info ${num0(i.gtScoreDetails.info)}` : '—')}
        ${t.scoreParts ? kv('Score breakdown', t.scoreParts.filter((p) => p.v >= 0.7).map((p) => p.label).join(', ') || 'no standout factor', t.scoreParts.filter((p) => p.v <= 0.2).length ? `weak: ${t.scoreParts.filter((p) => p.v <= 0.2).map((p) => p.label).join(', ')}` : '') : ''}${i.categories?.length ? kv('Categories', i.categories.slice(0, 4).map(esc).join(', ')) : ''}
      </div>
      ${i.description ? `<p class="desc">“${esc(i.description.slice(0, 300))}${i.description.length > 300 ? '…' : ''}” <span class="dim">— token description, as submitted</span></p>` : ''}
      <div class="tables">${flowTable(t)}${holdersTable(t)}${tradersTable(t)}</div>
    </details>
  </article>`;
}
function big(label, value, sub = '', toneCls = '') { return `<div class="big ${toneCls}"><span>${esc(label)}</span><b>${value}</b>${sub ? `<i>${sub}</i>` : ''}</div>`; }

function flowTable(t) {
  const f = t.flow;
  if (!f) return `<div class="tbl"><h4>Recent flow</h4><div class="dim">no trades returned</div></div>`;
  const win = f.spanMin < 90 ? `${Math.round(f.spanMin)} min` : `${(f.spanMin / 60).toFixed(1)}h`;
  return `<div class="tbl"><h4>Recent flow <span class="dim">last ${f.n} trades · ${win}</span></h4>
    <div class="flowbar"><i class="b" style="width:${(f.buyUsd / Math.max(1, f.buyUsd + f.sellUsd) * 100).toFixed(0)}%"></i></div>
    <div class="flowline"><span class="up">bought ${money(f.buyUsd)}</span> · <span class="down">sold ${money(f.sellUsd)}</span> · net <b class="${tone(f.netUsd)}">${money(f.netUsd)}</b> · ${f.wallets} wallets · median ${money(f.medianUsd)}${f.driftPct != null ? ` · price ${pct(f.driftPct)} in window` : ''}</div>
    <table><tbody>
      <tr><td class="k">Biggest trades</td><td>${f.biggest.map((x) => `<span class="${x.buy ? 'up' : 'down'}">${x.buy ? 'buy' : 'sell'} ${money(x.usd)}</span> <a class="addr" href="${CONFIG.explorer}/tx/${esc(x.tx)}">${short(x.wallet)}</a>`).join(' · ')}</td></tr>
      <tr><td class="k">Top buyers</td><td>${f.topBuyers.map((w) => `<a class="addr" href="${CONFIG.explorer}/address/${esc(w.address)}">${short(w.address)}</a> ${money(w.usd)}${w.n >= 5 ? ` <span class="dim">(${w.n} trades)</span>` : ''}`).join(' · ') || '—'}</td></tr>
      <tr><td class="k">Top sellers</td><td>${f.topSellers.map((w) => `<a class="addr" href="${CONFIG.explorer}/address/${esc(w.address)}">${short(w.address)}</a> ${money(w.usd)}${w.n >= 5 ? ` <span class="dim">(${w.n} trades)</span>` : ''}`).join(' · ') || '—'}</td></tr>
    </tbody></table></div>`;
}

function holdersTable(t) {
  if (!t.topHolders) return `<div class="tbl"><h4>Top holders</h4><div class="dim">holder list not available</div></div>`;
  return `<div class="tbl"><h4>Top holders <span class="dim">share of supply</span></h4><table class="holders"><tbody>${t.topHolders.slice(0, 10).map((h) => `<tr><td class="k">${h.rank}</td><td><a class="addr" href="${CONFIG.explorer}/address/${esc(h.address)}">${short(h.address)}</a>${h.label ? ` <span class="tag grey">${esc(h.label)}</span>` : ''}</td><td class="num">${h.pct != null ? h.pct.toFixed(2) + '%' : '—'}</td><td class="num dim">${h.valueUsd != null ? '$' + fmtK(h.valueUsd) : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

function tradersTable(t) {
  if (!t.topTraders) return `<div class="tbl"><h4>Top traders</h4><div class="dim">trader list not available</div></div>`;
  const rows = [...t.topTraders].sort((a, b) => (b.realizedPnl || 0) - (a.realizedPnl || 0)).slice(0, 5);
  return `<div class="tbl"><h4>Top traders <span class="dim">realized PnL on this token</span></h4><table class="traders"><tbody>${rows.map((w) => `<tr><td><a class="addr" href="${esc(w.explorer || CONFIG.explorer + '/address/' + w.address)}">${short(w.address)}</a>${w.buys === 0 && (w.sellUsd || 0) > 1000 ? ' <span class="tag amber">sold, never bought</span>' : ''}</td><td class="num ${tone(w.realizedPnl)}">${money(w.realizedPnl)}</td><td class="num dim">${w.buys}b / ${w.sells}s</td><td class="num dim">${w.avgBuy && w.avgSell ? `avg ${price(w.avgBuy)} → ${price(w.avgSell)}` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

function avoidRow(t) {
  return `<article class="avoidcard">
    <div class="head"><span class="noimg small">${esc(t.symbol.slice(0, 1))}</span><div class="title"><div class="sym">${tokenLink(t)} <span class="name">${esc(t.name)}</span></div><div class="dim">${age(t.ageHours)} old · $${fmtK(t.vol24)} vol · $${fmtK(t.liquidity)} liq · $${fmtK(t.mcap || t.fdv)} mcap · ${t.holdersCount != null ? t.holdersCount.toLocaleString() + ' holders' : ''}</div></div></div>
    <div class="flags">${t.reasons.map((x) => `<span class="flag red">${esc(x)}</span>`).join('')}${t.flags.filter((f) => f.level === 'amber' || f.level === 'grey').map((f) => `<span class="flag ${f.level}">${esc(f.text)}</span>`).join('')}</div>
    <div class="prose small">${(t.story || []).slice(1).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
    ${links(t)}
  </article>`;
}

function walletCard(w) {
  const realized = w.pnl.realized ?? w.realizedPnl;
  const best = (w.best.length ? w.best : w.tokens.map((x) => ({ symbol: x.symbol, realized: x.pnl, buys: x.buys, sells: x.sells }))).map((x) => `${esc(x.symbol)} <span class="${tone(x.realized)}">${money(x.realized)}</span>${x.buys != null ? ` <span class="dim">(${x.buys}b/${x.sells}s)</span>` : ''}`).join(' · ');
  const bags = w.bagsChecked ? (w.bags.length ? w.bags.map((b) => `${esc(b.symbol)} $${fmtK(b.usd)}`).join(' · ') + ` <span class="dim">(≈ $${fmtK(w.bagsTotal)} on chain)</span>` : 'cashed out — nothing left on chain') : 'balances not available';
  const record = w.pnl.winRate != null ? `${w.pnl.wins}W / ${w.pnl.losses}L (${w.pnl.winRate.toFixed(0)}%)` : '';
  const oneHit = w.best[0] && realized ? w.best[0].realized / realized : null;
  return `<article class="walletcard">
    <div class="head"><div class="title"><div class="sym"><a href="${esc(w.explorer || CONFIG.explorer + '/address/' + w.address)}">${short(w.address)}</a></div><div class="dim">${w.swaps.toLocaleString()} swaps · ${w.pnl.tokens} token${w.pnl.tokens === 1 ? '' : 's'}${record ? ` · ${record}` : ''}</div></div>
    <div class="price"><b class="${tone(realized)}">${money(realized)}</b><div class="dim">realized${w.pnl.unrealized != null ? ` · <span class="${tone(w.pnl.unrealized)}">${money(w.pnl.unrealized)}</span> open` : ''}</div></div></div>
    <div class="kvline"><span class="k">best</span> ${best}</div>
    <div class="kvline"><span class="k">holds</span> ${bags}</div>
    ${oneHit != null && oneHit > 1 ? `<div class="kvline dim">${esc(w.best[0].symbol)} made more than its entire PnL — everything else it touched lost money.</div>` : oneHit != null && oneHit > 0.8 ? `<div class="kvline dim">${(oneHit * 100).toFixed(0)}% of its PnL came from ${esc(w.best[0].symbol)} — one hit, not a track record.</div>` : ''}
    ${w.tags.length ? `<div class="flags">${w.tags.map((f) => `<span class="flag ${f.level}">${esc(f.text)}</span>`).join('')}</div>` : ''}
  </article>`;
}

function revisitRow(x) {
  const st = { up: 'up', holding: '', down: 'down', bleeding: 'down', rugged: 'down', gone: 'down', unknown: '' }[x.status] || '';
  return `<tr><td class="dim">${esc(x.list)}</td><td class="sym"><a href="https://www.geckoterminal.com/${CONFIG.network}/pools/${esc(x.pool)}?${UTM}">${esc(x.symbol)}</a></td>
    <td>$${fmtK(x.liquidity)} → ${x.now.liquidity != null ? '$' + fmtK(x.now.liquidity) : '—'} <span class="${tone(x.liqChange)}">${pct(x.liqChange)}</span></td>
    <td class="${tone(x.priceChange)}">${pct(x.priceChange)}</td>
    <td><span class="flag ${st === 'down' ? 'red' : st === 'up' ? 'green' : 'grey'}">${esc(x.status)}</span></td>
    <td class="dim">${x.listedToday.length ? esc(x.listedToday.join(', ')) : x.inUniverse ? 'unlisted' : 'out of universe'}</td></tr>`;
}

// ---------- blocks ----------
function tile(label, value, sub, toneCls = '') { return `<div class="tile ${toneCls}"><div class="label">${esc(label)}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`; }
function delta(v, suffix) { return `<span class="${v >= 0 ? 'up' : 'down'}">${pct(v)}</span> ${suffix}`; }
function strip(label, items) { const list = items.filter(Boolean); return list.length ? `<div class="strip"><span class="label">${esc(label)}</span>${list.join('')}</div>` : ''; }
function chip(t, value, toneCls = '') { return `<span class="chip">${tokenLink(t)}${value ? ` <b class="${toneCls}">${value}</b>` : ''}</span>`; }
function miniChip(t) { return `<span class="chip">${tokenLink(t)} <span class="dim">${age(t.ageHours)} · $${fmtK(t.liquidity)} liq · ${t.holdersCount ?? '—'} holders · score ${t.score.toFixed(0)}</span></span>`; }
function empty(text) { return `<div class="empty">${esc(text)}</div>`; }

// ---------- atoms ----------
function avatar(t) {
  const letter = esc((t.symbol || '?').replace(/^\$/, '').slice(0, 1).toUpperCase());
  const img = t.image && !/missing/i.test(t.image) ? `<img src="${esc(t.image)}" alt="" loading="lazy" onerror="this.remove()">` : '';
  return `<span class="noimg">${letter}${img}</span>`;
}
function kv(k, v, sub = '') { return `<div class="k"><span>${esc(k)}</span><b>${v}</b>${sub ? `<i>${sub}</i>` : ''}</div>`; }
function social(label, url) { return url ? `<a class="soc on" href="${esc(url)}">${label}</a>` : `<span class="soc off">${label}</span>`; }
function flags(list) { if (!list.length) return '<div class="flags"><span class="flag green">no flags</span></div>'; return `<div class="flags">${list.map((f) => `<span class="flag ${f.level}">${esc(f.text)}</span>`).join('')}</div>`; }
function links(t) {
  const cg = t.cgId ? `<a href="https://www.coingecko.com/en/coins/${esc(t.cgId)}?${UTM}">CoinGecko</a>` : '';
  const gt = `<a href="https://www.geckoterminal.com/${CONFIG.network}/pools/${esc(t.pool.address)}?${UTM}">GeckoTerminal</a>`;
  const ex = `<a href="${CONFIG.explorer}/token/${esc(t.address)}">Explorer</a>`;
  return `<div class="links">${cg}${gt}${ex}<button class="copy" data-copy="${esc(t.address)}" title="copy token address">${t.address.slice(0, 10)}…${t.address.slice(-6)} ⧉</button></div>`;
}
function tokenLink(t) { return `<a class="tok" href="https://www.geckoterminal.com/${CONFIG.network}/pools/${esc(t.pool.address)}?${UTM}">${esc(t.symbol)}</a>`; }
function holdersSub(t) {
  const h = t.holders;
  if (!h || h.change24 == null) return 'no history';
  const sign = h.change24 >= 0 ? '+' : '';
  if (h.sinceLaunch) return `<span class="${tone(h.change24)}">${sign}${h.change24.toLocaleString()} since launch (${age(h.spanHours)})</span>`;
  return `<span class="${tone(h.change24)}">${sign}${h.change24.toLocaleString()} (${pct(h.change24Pct)}) 24h</span>${h.change7dPct != null ? ` · <span class="${tone(h.change7dPct)}">${pct(h.change7dPct)}</span> 7d` : ''}`;
}
function spark(t, w = 300, h = 40) {
  const c = t.momentum?.closes;
  if (!c || c.length < 4) return `<div class="spark empty" style="height:${h}px">no candles yet</div>`;
  const min = Math.min(...c), max = Math.max(...c), span = max - min || 1;
  const pts = c.map((v, i) => `${((i / (c.length - 1)) * w).toFixed(1)},${(h - 3 - ((v - min) / span) * (h - 6)).toFixed(1)}`);
  const up = c.at(-1) >= c[0];
  const label = t.momentum.hoursCovered >= 1 ? `${t.momentum.hoursCovered}h · ${t.momentum.candleMinutes}m candles` : `${Math.round(c.length * t.momentum.candleMinutes)}m`;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="price history"><polyline points="${pts.join(' ')}" fill="none" stroke="${up ? 'var(--up)' : 'var(--down)'}" stroke-width="1.6"/><text x="2" y="${h - 1}" class="sl">${label}</text></svg>`;
}
function price(p) {
  if (p == null) return '—';
  if (p >= 1) return '$' + p.toLocaleString(undefined, { maximumFractionDigits: p >= 100 ? 2 : 4 });
  const s = p.toFixed(12);
  const m = s.match(/^0\.(0+)(\d+)/);
  if (m && m[1].length >= 3) return `$0.0<sub>${m[1].length}</sub>${m[2].slice(0, 4)}`;
  return '$' + Number(p.toPrecision(4));
}
const money = (v) => (v == null ? '—' : (v < 0 ? '−$' : '$') + fmtK(Math.abs(v)));
const short = (a) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '—');
function age(h) { if (h == null) return '—'; if (h < 1) return `${Math.round(h * 60)}m`; if (h < 48) return `${Math.floor(h)}h`; return `${Math.floor(h / 24)}d ${Math.floor(h % 24)}h`; }
const tone = (v) => (v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : '');
const num0 = (v) => (v == null ? '—' : Number(v).toFixed(0));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const JS = `document.querySelectorAll('.copy').forEach(b=>b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(b.dataset.copy);const t=b.textContent;b.textContent='copied';setTimeout(()=>b.textContent=t,1200)}catch(e){prompt('token address',b.dataset.copy)}}));`;

const CSS = `
/* Layout: three stacked pages, each opened by a full-width colour-coded banner; everything below a banner inherits its colour as --pc. */
:root{--bg:#f6f4ef;--bg2:#eeeae1;--card:#ffffff;--card2:#e9e4d8;--line:#dcd6c8;--text:#1a1f2b;--mute:#6b7280;--up:#1a8f4a;--down:#c93a3a;--amber:#c97b12;--red:#c93a3a;
  --c1:#1f3b73;--c2:#0f6b63;--c3:#9a4a12;--pc:var(--c1);--accent:var(--pc);
  --display:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;--body:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;--mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;color-scheme:light}
*{box-sizing:border-box;min-width:0}html,body{overflow-x:hidden}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 var(--body);-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.banner.pg1 ~ *{--pc:var(--c1)}.banner.pg2 ~ *{--pc:var(--c2)}.banner.pg3 ~ *{--pc:var(--c3)}
.banner{--pc:var(--c1);display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:28px;align-items:end;padding:36px 32px 28px;margin:0 -24px 28px;border-top:0;border-bottom:6px solid color-mix(in srgb,var(--pc) 60%,#000);background:linear-gradient(120deg,var(--pc) 0%,color-mix(in srgb,var(--pc) 80%,#000) 100%);color:#fff;border-radius:0 0 18px 18px}
.banner.pg2{--pc:var(--c2)}.banner.pg3{--pc:var(--c3)}.banner.pg2,.banner.pg3{margin-top:72px}
.banner-num{font-family:var(--display);font-weight:700;font-size:72px;line-height:.9;color:#fff;letter-spacing:-.03em;opacity:.35}
.banner .kicker{color:rgba(255,255,255,.75)}.banner h1{color:#fff}.banner .sub{color:rgba(255,255,255,.85)}.banner h1{margin:8px 0 6px;font-size:34px;text-wrap:balance;font-family:var(--display);font-weight:600;letter-spacing:-.02em;line-height:1.1}.banner .sub{font-size:16px;max-width:62ch}
.banner .meta{text-align:right;color:rgba(255,255,255,.75);font-size:13px;line-height:1.7}.banner .meta a{color:#fff;border-color:rgba(255,255,255,.4)}
h1,h2,.sym,.banner-num{font-family:var(--display)}.tile .value,.big b,.price{font-family:var(--body);font-weight:600}.addr,.copy{font-family:var(--mono)}
h2{padding-left:14px;border-left:4px solid var(--pc);line-height:1.2;font-weight:600;color:color-mix(in srgb,var(--pc) 75%,var(--text))}.kicker{color:var(--pc)}.rank{color:var(--pc)}.lead{border-left-color:var(--pc)}.bar i{background:var(--pc)}details.more summary::before{color:var(--pc)}.deep.kind-launch{border-color:color-mix(in srgb,var(--c2) 35%,transparent)}.links a:hover,.copy:hover{border-color:var(--pc)}
.sub-h{padding-left:12px;border-left:3px solid var(--pc);font-weight:600;color:color-mix(in srgb,var(--pc) 70%,var(--text))}
a{color:inherit;text-decoration:none;border-bottom:1px solid var(--line)}a:hover{border-color:var(--accent)}
.page{max-width:1120px;margin:0 auto;padding:32px 24px 48px}
.top{display:none}
.kicker{text-transform:uppercase;letter-spacing:.12em;font-size:11px;color:var(--accent);font-weight:600}
h1{margin:6px 0 4px;font-size:30px;letter-spacing:-.02em;font-weight:600;display:flex;align-items:center;gap:14px;flex-wrap:wrap;line-height:1.15}
.sub{color:var(--mute);overflow-wrap:anywhere;font-size:15px}.meta{text-align:right;color:var(--mute);font-size:13px;line-height:1.6;flex:none}.meta a{color:var(--text)}
.heat{font-size:12px;font-weight:600;letter-spacing:.1em;padding:5px 12px;border-radius:6px;border:1px solid}
.heat-hot{color:#fff;border-color:#fff;background:var(--up)}.heat-cold{color:#fff;border-color:#fff;background:var(--down)}.heat-mixed{color:#fff;border-color:#fff;background:var(--amber)}
.lead{font-size:17px;line-height:1.55;font-weight:500;margin:0 0 18px;padding:14px 18px;border-left:4px solid var(--accent);background:color-mix(in srgb,var(--accent) 10%,#fff);border-radius:0 8px 8px 0}
.tiles{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}
.tile{background:color-mix(in srgb,var(--pc) 7%,#fff);border:1px solid color-mix(in srgb,var(--pc) 18%,var(--line));border-top:3px solid var(--pc);border-radius:8px;padding:14px 16px}
.tile .label{font-size:12px;color:var(--pc);text-transform:uppercase;letter-spacing:.06em}.tile .value{font-size:24px;font-weight:600;letter-spacing:-.02em;margin:4px 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tile .sub{font-size:12px;color:var(--mute);line-height:1.35}
.tile.up .value{color:var(--up)}.tile.down .value{color:var(--down)}
.two{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:24px;margin-top:20px;align-items:start}
.strips{display:flex;flex-direction:column;gap:10px}
.strip{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.strip .label{font-size:12px;color:var(--pc);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-right:4px;white-space:nowrap}
.chip{background:color-mix(in srgb,var(--pc) 6%,#fff);border:1px solid color-mix(in srgb,var(--pc) 22%,var(--line));border-radius:6px;padding:4px 10px;font-size:13px}.chip b{margin-left:4px}.chip.dim{color:var(--mute)}
.up{color:var(--up)}.down{color:var(--down)}.dim{color:var(--mute)}
.prose{font-size:15px;line-height:1.6}.prose h3{margin:0 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:var(--pc);font-weight:600}.prose p{margin:0 0 10px}.prose.small{font-size:13.5px;color:var(--mute)}.prose.lead-p{font-size:16px}.desc{color:var(--mute);font-style:italic;font-size:13.5px}
section{margin-top:40px}h2{font-size:22px;margin:0 0 6px;letter-spacing:-.015em}h2 .count{display:block;font-size:13px;font-weight:500;color:var(--mute);margin:2px 0 0;letter-spacing:0}
.rule{margin:0 0 14px;font-size:12.5px;color:var(--mute);overflow-wrap:anywhere}
.grid2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px}
.deep{background:var(--card);border:1px solid color-mix(in srgb,var(--pc) 20%,var(--line));border-left:5px solid var(--pc);border-radius:10px;padding:22px 24px;margin:18px 0;box-shadow:0 1px 3px rgba(17,24,39,.06)}.deep.kind-launch{border-color:rgba(15,118,110,.35)}.deep.kind-up{border-color:rgba(21,128,61,.35)}.deep.kind-down{border-color:rgba(185,28,28,.35)}
.head{display:flex;gap:14px;align-items:center}
.noimg{position:relative;width:48px;height:48px;border-radius:50%;background:var(--card2);flex:none;display:inline-flex;align-items:center;justify-content:center;font-weight:600;font-size:18px;color:var(--mute);border:1px solid var(--line);overflow:hidden}.noimg img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.noimg.small{width:32px;height:32px;font-size:13px}
.rank{font-size:13px;color:var(--accent);font-weight:600;flex:none}.title{flex:1}.sym{font-weight:600;font-size:22px;letter-spacing:-.01em}.name{font-weight:400;color:var(--mute);font-size:14px}
.tag{font-size:11px;color:var(--accent);border:1px solid var(--accent);border-radius:5px;padding:1px 7px;vertical-align:middle;font-weight:600}.tag.grey{color:var(--mute);border-color:var(--line)}.tag.amber{color:var(--amber);border-color:rgba(180,83,9,.5)}
.price{text-align:right;font-weight:600;white-space:nowrap;flex:none;font-size:22px}.price div{font-size:13px;font-weight:600}sub{font-size:10px;vertical-align:-3px}
.verdict{margin-top:14px;font-size:16px;font-weight:500;padding:12px 16px;border-radius:8px;background:var(--bg2)}.verdict.good{border-left:4px solid var(--up);background:rgba(22,163,74,.06)}.verdict.bad{border-left:4px solid var(--down);background:rgba(220,38,38,.06)}.verdict .dim{font-weight:400;font-size:14px}
.bignums{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-top:14px}.big{background:color-mix(in srgb,var(--pc) 6%,#fff);border-radius:8px;padding:10px 12px}.big span{display:block;font-size:11px;color:var(--pc);font-weight:600;text-transform:uppercase;letter-spacing:.06em}.big b{display:block;font-size:20px;letter-spacing:-.01em;margin-top:2px}.big i{display:block;font-style:normal;font-size:12px;color:var(--mute);line-height:1.35}.big.up b{color:var(--up)}.big.down b{color:var(--down)}
.cols{display:grid;grid-template-columns:minmax(0,7fr) minmax(0,5fr);gap:24px;margin-top:18px}
.callout{padding:12px 16px;border-radius:8px;margin-bottom:12px;font-size:15px;background:var(--bg2)}.callout b{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}.callout.good{border:1px solid rgba(22,163,74,.35);background:rgba(22,163,74,.05)}.callout.good b{color:var(--up)}.callout.bad{border:1px solid rgba(220,38,38,.35);background:rgba(220,38,38,.05)}.callout.bad b{color:var(--down)}
.side-box{background:color-mix(in srgb,var(--pc) 5%,#fff);border-radius:8px;padding:12px 14px;margin-top:10px;font-size:13.5px;line-height:1.5}.side-box h5{margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--pc);font-weight:600}.impact{display:flex;gap:14px;flex-wrap:wrap;font-size:14px}
.spark{display:block;width:100%;height:70px;margin:0 0 4px;background:var(--bg2);border-radius:8px;padding:6px}.spark.empty{display:flex;align-items:center;justify-content:center;color:var(--mute);font-size:12px}.sl{font-size:10px;fill:var(--mute)}
.kv{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 18px;margin-top:10px}.k{display:flex;flex-direction:column;border-top:1px solid var(--line);padding:7px 0 4px}.k span{font-size:11px;color:var(--mute);text-transform:uppercase;letter-spacing:.05em}.k b{font-size:14px}.k i{font-style:normal;font-size:12px;color:var(--mute)}
.socials{display:flex;gap:6px;align-items:center;margin-top:8px;font-size:12px;flex-wrap:wrap}.soc{font-size:11px;font-weight:700;padding:2px 8px;border-radius:5px;border:1px solid var(--line)}.soc.on{color:var(--up);border-color:rgba(21,128,61,.35)}.soc.off{color:#9ca3af;text-decoration:line-through}
.flags{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.flag{font-size:12px;padding:3px 9px;border-radius:6px;border:1px solid}
.flag.red{color:var(--red);border-color:rgba(185,28,28,.35);background:rgba(185,28,28,.05)}.flag.amber{color:var(--amber);border-color:rgba(180,83,9,.35);background:rgba(180,83,9,.05)}.flag.grey{color:var(--mute);border-color:var(--line)}.flag.green{color:var(--up);border-color:rgba(21,128,61,.3)}
.links{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;font-size:13px;align-items:center}.links a{border:1px solid var(--line);border-radius:6px;padding:5px 12px;background:var(--bg2)}.links a:hover{border-color:var(--accent)}
.copy{font:inherit;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:var(--text);background:var(--bg2);border:1px solid var(--line);border-radius:7px;padding:5px 12px;cursor:pointer}.copy:hover{border-color:var(--accent)}
.runners{font-size:13px;color:var(--mute);display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 0}
details.more{margin-top:14px;border:1px dashed var(--line);border-radius:12px;padding:0 16px}details.more summary{cursor:pointer;padding:12px 0;font-size:13.5px;color:var(--mute);list-style:none;display:flex;align-items:center;gap:8px}details.more summary::before{content:"▸";color:var(--accent)}details.more[open] summary::before{content:"▾"}details.more[open]{padding-bottom:14px}
.tables{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;margin-top:12px}.tbl{background:color-mix(in srgb,var(--pc) 5%,#fff);border-radius:8px;padding:12px 14px}.tbl h4{margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--pc)}.tbl h4 .dim{text-transform:none;letter-spacing:0;font-weight:500;margin-left:6px}
.tbl table{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed}.tbl td{padding:5px 4px;vertical-align:top;border-top:1px solid var(--line)}.tbl tr:first-child td{border-top:0}.tbl td.k{color:var(--mute);width:26%;white-space:nowrap}.tbl td.num{text-align:right;white-space:nowrap}.holders td:first-child{width:24px}.holders td:nth-child(3){width:76px}.holders td:nth-child(4){width:76px}.traders td:nth-child(2){width:84px}.traders td:nth-child(3){width:74px}
.addr{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;border:0;color:var(--text)}
.flowbar{height:8px;background:rgba(185,28,28,.25);border-radius:4px;overflow:hidden;margin:2px 0 8px}.flowbar .b{display:block;height:100%;background:var(--up)}.flowline{font-size:13px;margin-bottom:8px}
.notable{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:12px}.note{background:color-mix(in srgb,var(--pc) 4%,#fff);border:1px solid color-mix(in srgb,var(--pc) 15%,var(--line));border-top:3px solid var(--pc);border-radius:8px;padding:12px 14px}.note h4{margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--pc);font-weight:600}.note ul{list-style:none;margin:0;padding:0;font-size:14px}.note li{padding:5px 0;border-top:1px solid var(--line);display:flex;gap:6px;flex-wrap:wrap;align-items:baseline}.note li:first-child{border-top:0}
.newsgrid{margin-top:12px}.news{list-style:none;margin:0;padding:0;font-size:14px}.news li{padding:7px 0;border-top:1px solid var(--line);display:flex;gap:8px;flex-wrap:wrap;align-items:baseline;line-height:1.45}.news li:first-child{border-top:0}.news a{color:var(--text)}.pill{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;padding:2px 7px;border-radius:4px;border:1px solid currentColor;background:color-mix(in srgb,currentColor 8%,#fff);flex:none}.note h4 .dim{text-transform:none;letter-spacing:0;font-weight:500;margin-left:6px}
.whales{margin-top:14px}.whales table{font-size:13px}.whales td{padding:4px 6px}
.avoidcard,.walletcard{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--pc);border-radius:8px;padding:16px;margin:12px 0}
.kvline{font-size:13.5px;margin-top:6px}.kvline .k{color:var(--mute);text-transform:uppercase;font-size:11px;letter-spacing:.05em;margin-right:6px}
table.revisit{width:100%;border-collapse:collapse;font-size:13.5px}.revisit th{text-align:left;font-size:11px;color:var(--pc);font-weight:600;text-transform:uppercase;letter-spacing:.05em;padding:8px 6px;border-bottom:2px solid color-mix(in srgb,var(--pc) 35%,var(--line));background:color-mix(in srgb,var(--pc) 5%,#fff)}.revisit td{padding:8px 6px;border-top:1px solid var(--line);vertical-align:top}
.band{margin-top:48px;padding-top:24px;border-top:2px solid color-mix(in srgb,var(--pc) 30%,var(--line))}.sub-h{font-size:20px;margin:26px 0 4px;letter-spacing:-.01em}.sub-h .count{display:block;font-size:13px;font-weight:500;color:var(--mute)}
table.bandtable{width:100%;border-collapse:collapse;font-size:13px;margin:4px 0 8px}.bandtable th{text-align:left;font-size:11px;color:var(--pc);font-weight:600;text-transform:uppercase;letter-spacing:.05em;padding:8px 6px;border-bottom:2px solid color-mix(in srgb,var(--pc) 35%,var(--line));background:color-mix(in srgb,var(--pc) 5%,#fff)}.bandtable td{padding:8px 6px;border-top:1px solid var(--line);vertical-align:top;white-space:nowrap}.bandtable td.sym{white-space:normal}.bandtable td:last-child{white-space:normal}.bandtable tr:nth-child(even) td{background:rgba(17,24,39,.02)}
.empty{background:var(--card);border:1px dashed var(--line);border-radius:8px;padding:18px;color:var(--mute);font-size:14px}
footer{margin-top:48px;padding:18px 20px;border-top:4px solid var(--c1);background:var(--bg2);border-radius:8px;color:var(--mute);font-size:12.5px;line-height:1.6}footer a{color:var(--text)}footer .links{line-height:1.8}
.pagebreak{height:0}
@media(max-width:1000px){.banner{grid-template-columns:auto minmax(0,1fr)}.banner .meta{grid-column:1/-1;text-align:left}.tiles{grid-template-columns:repeat(3,minmax(0,1fr))}.two{grid-template-columns:minmax(0,1fr)}.grid2{grid-template-columns:minmax(0,1fr)}.cols{grid-template-columns:minmax(0,1fr)}.bignums{grid-template-columns:repeat(3,minmax(0,1fr))}.notable{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:600px){.page{padding:20px 16px 40px}.banner{grid-template-columns:minmax(0,1fr);margin:0 -16px 20px;padding:24px 16px 20px;gap:10px}.banner-num{font-size:56px}.banner h1{font-size:32px}.banner .meta{text-align:left}.tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.top{flex-direction:column;align-items:flex-start}.meta{text-align:left}h1{font-size:28px}.head{flex-wrap:wrap}.price{margin-left:auto}.chip{white-space:normal}.notable{grid-template-columns:minmax(0,1fr)}.bignums{grid-template-columns:repeat(2,minmax(0,1fr))}.bandtable{display:block;overflow-x:auto}.lead{font-size:17px}}

/* ================= LIGHT THEME with dark contrast blocks =================
   Page: white. Dark "squares": banners, headline tiles, the day's one-line read, verdicts, band headers, whale table.
   Page colour still runs through every heading and accent: 01 blue, 02 green, 03 amber. */
:root{--bg:#f6f7fb;--bg2:#eef1f7;--card:#ffffff;--card2:#f3f5f9;--line:#dde3ec;--text:#111827;--mute:#5b6676;--ink:#0f1420;--ink2:#171f2e;--inkline:#2a3547;
  --up:#15995a;--down:#d9304f;--amber:#c76d00;--red:#d9304f;--c1:#1f7ae0;--c2:#4f9d0b;--c3:#d97706;--c1b:#5fd3ff;--c2b:#c6ff5a;--c3b:#ffb454;--pcb:var(--c1b);color-scheme:light}
.banner.pg1 ~ *{--pc:var(--c1);--pcb:var(--c1b)}.banner.pg2 ~ *{--pc:var(--c2);--pcb:var(--c2b)}.banner.pg3 ~ *{--pc:var(--c3);--pcb:var(--c3b)}
body{background:var(--bg);color:var(--text);font-weight:500}.dim{color:var(--mute)}
/* dark squares */
.banner{--pc:var(--c1);--pcb:var(--c1b);background:var(--ink);color:#fff;border-top:10px solid var(--pcb);box-shadow:0 24px 50px -30px rgba(15,20,32,.6)}.banner.pg2{--pcb:var(--c2b)}.banner.pg3{--pcb:var(--c3b)}
.banner .banner-num{color:var(--pcb);opacity:1;text-shadow:0 0 40px color-mix(in srgb,var(--pcb) 50%,transparent)}.banner .kicker{color:var(--pcb)}.banner h1{color:#fff;text-shadow:none}.banner .sub{color:#c9d2e0}.banner .meta{color:#aab5c5}.banner .meta a{color:#fff;border-color:#4a5568}
.lead{background:var(--ink);color:#fff;border-left:6px solid var(--pcb);font-weight:600}
.tile{background:var(--ink);border:1px solid var(--inkline);color:#fff}.tile .label{color:var(--pcb);font-weight:700}.tile .value{color:#fff}.tile .sub{color:#aab5c5}.tile.up{border-color:#4be09a}.tile.up .value{color:#4be09a}.tile.down{border-color:#ff6b84}.tile.down .value{color:#ff6b84}.tile .sub .up{color:#4be09a}.tile .sub .down{color:#ff6b84}
.verdict{background:var(--ink);color:#fff;border-left:6px solid var(--pcb)}.verdict.good{border-left-color:#4be09a;background:var(--ink)}.verdict.bad{border-left-color:#ff6b84;background:var(--ink)}.verdict .dim{color:#aab5c5}
.band>h2{background:var(--ink);color:#fff;padding:14px 20px;border-radius:12px;border-left:8px solid var(--pcb)}.band>h2 .count{color:#aab5c5}
.tbl.whales{background:var(--ink);color:#fff;border:0}.tbl.whales h4{color:var(--pcb)}.tbl.whales td{border-top-color:var(--inkline)}.tbl.whales .dim{color:#aab5c5}.tbl.whales .addr,.tbl.whales .tok{color:#fff;border-color:#4a5568}.tbl.whales .up{color:#4be09a}.tbl.whales .down{color:#ff6b84}
/* light surfaces */
h2{color:var(--ink);border-left-color:var(--pc)}h2 .count{color:var(--mute)}.kicker{color:var(--pc)}.prose h3{color:var(--pc)}.rule{color:var(--mute)}
.chip{background:#fff;border:1px solid var(--line);font-weight:600;color:var(--ink)}.strip .label{color:var(--pc);font-weight:700}
.note{background:#fff;border:1px solid var(--line);box-shadow:0 8px 24px -18px rgba(15,20,32,.25)}.note h4{color:var(--pc)}.note ul{font-weight:600}.note li{border-top-color:var(--line)}
.deep{background:#fff;border:2px solid var(--line);box-shadow:0 18px 40px -28px rgba(15,20,32,.35)}.deep.kind-launch{border-color:var(--c2)}.deep.kind-up{border-color:var(--up)}.deep.kind-down{border-color:var(--down)}
.rank{color:#fff;background:var(--pc);border:0;border-radius:8px;padding:4px 10px;font-size:14px}.sym{color:var(--ink)}.name{color:var(--mute)}.price{color:var(--ink)}
.noimg{background:var(--card2);border-color:var(--line);color:var(--mute)}
.tag{color:var(--pc);border-color:var(--pc)}.tag.grey{color:var(--mute);border-color:var(--line)}.tag.amber{color:var(--amber);border-color:var(--amber)}
.big{background:var(--card2);border:1px solid var(--line)}.big span{color:var(--mute);font-weight:700}.big b{color:var(--ink)}.big i{color:var(--mute)}.big.up{background:#e8f8ef;border-color:#9fdcbb}.big.up b{color:var(--up)}.big.down{background:#fdeaee;border-color:#f3a9b7}.big.down b{color:var(--down)}
.callout{background:var(--card2);color:var(--ink)}.callout.good{background:#e8f8ef;border:2px solid #9fdcbb}.callout.good b{color:var(--up)}.callout.bad{background:#fdeaee;border:2px solid #f3a9b7}.callout.bad b{color:var(--down)}
.side-box{background:var(--card2);border:1px solid var(--line)}.side-box h5{color:var(--pc)}.spark{background:var(--card2);border:1px solid var(--line)}.sl{fill:var(--mute)}
.k{border-top-color:var(--line)}.k span{color:var(--mute)}.k b{color:var(--ink)}.k i{color:var(--mute)}
.soc{border-color:var(--line)}.soc.on{color:var(--up);border-color:#9fdcbb;background:#e8f8ef}.soc.off{color:#9aa5b5}
.flag{font-weight:700}.flag.red{color:var(--down);background:#fdeaee;border-color:#f3a9b7}.flag.amber{color:var(--amber);background:#fff3e0;border-color:#f6c98a}.flag.green{color:var(--up);background:#e8f8ef;border-color:#9fdcbb}.flag.grey{color:var(--mute);background:var(--card2);border-color:var(--line)}
.links a{background:#fff;border-color:var(--line);color:var(--ink);font-weight:600}.links a:hover{border-color:var(--pc)}.copy{background:var(--ink);color:#fff;border:0}.copy:hover{background:var(--ink2);color:#fff}
details.more{border:1px dashed var(--line);background:#fff}details.more summary{color:var(--mute);font-weight:600}details.more summary::before{color:var(--pc)}
.tbl{background:var(--card2);border:1px solid var(--line)}.tbl h4{color:var(--pc)}.tbl td{border-top-color:var(--line)}.addr{color:var(--ink)}.tok{color:var(--ink)}
.flowbar{background:#f3a9b7}.flowbar .b{background:var(--up)}
.bandtable th{color:var(--pc)}.bandtable td{border-top-color:var(--line);font-weight:600;color:var(--ink)}.bandtable tr:nth-child(even) td{background:var(--card2)}
.sub-h{color:var(--ink);border-left-color:var(--pc)}
.avoidcard{background:#fff;border:2px solid #f3a9b7}.walletcard{background:#fff;border:1px solid var(--line)}
.revisit th{color:var(--pc);border-bottom-color:var(--line)}.revisit td{border-top-color:var(--line);font-weight:600}
.empty{background:#fff;border:2px dashed var(--line);color:var(--mute)}
.heat{background:transparent}.heat-hot{color:#4be09a;border-color:#4be09a}.heat-cold{color:#ff6b84;border-color:#ff6b84}.heat-mixed{color:#ffb454;border-color:#ffb454}
footer{color:var(--mute);border-top-color:var(--line)}footer a{color:var(--ink)}
a{border-bottom-color:var(--line)}
@media print{.banner{-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{padding:0}a{border:0}.pagebreak{page-break-after:always;break-after:page}.top.second{margin-top:0;border-top:0}.deep,.avoidcard,.walletcard{break-inside:avoid}details.more{display:none}}
`;
