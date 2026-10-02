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

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${CONFIG.networkLabel} Meme Digest · ${r.day}</title>
<style>${CSS}</style></head>
<body><main class="page">

<!-- ============================== PAGE 1 ============================== -->
<header class="top">
  <div>
    <div class="kicker">${esc(CONFIG.networkLabel)} · daily meme digest · page 1 of 2</div>
    <h1>${dateStr} <span class="heat heat-${o.heat.toLowerCase()}">${o.heat}</span></h1>
    <div class="sub">${o.heatWhy.map(esc).join(' · ')}</div>
  </div>
  <div class="meta">
    <div>Data: <a href="${CG_LINKS.api}">CoinGecko API</a></div>
    <div>${o.poolsScanned.toLocaleString()} pools scanned · ${o.memesTracked} memes tracked · ${timeStr}</div>
    <div class="dim">${(r.health.calls + r.health.cached).toLocaleString()} API calls · ${r.health.failed} failed · ${r.durationSec}s</div>
  </div>
</header>

<section class="overview">
  <div class="tiles">
    ${tile('24h meme volume', '$' + fmtK(o.totalVolume24), o.volPrev24 ? delta((o.volLast24 - o.volPrev24) / o.volPrev24 * 100, 'vs prev 24h') : 'from ' + o.tradeable + ' traded tokens')}
    ${tile('Meme liquidity', '$' + fmtK(o.totalLiquidity), `across ${o.memesTracked} tokens`)}
    ${tile('Buyers vs sellers', o.buyerSkew != null ? o.buyerSkew.toFixed(2) + '×' : '—', `${o.buyers24.toLocaleString()} buying · ${o.sellers24.toLocaleString()} selling`, o.buyerSkew == null ? '' : o.buyerSkew >= 1.1 ? 'up' : o.buyerSkew <= 0.9 ? 'down' : '')}
    ${tile('Breadth', o.breadthPct != null ? o.breadthPct.toFixed(0) + '%' : '—', `of traded memes up · median ${pct(o.medianChange24)}`, o.breadthPct == null ? '' : o.breadthPct >= 55 ? 'up' : o.breadthPct <= 40 ? 'down' : '')}
    ${tile('New pool every', o.launchEveryMin != null ? (o.launchEveryMin < 1 ? `${Math.round(o.launchEveryMin * 60)}s` : `${o.launchEveryMin.toFixed(1)} min`) : '—', o.launchSpan ? `${o.newPoolsSwept}${o.newPoolsCapped ? '+' : ''} pools created in the last ${o.launchSpan < 10 ? o.launchSpan.toFixed(1) : o.launchSpan.toFixed(0)}h` : 'no launch data')}
    ${tile('Launches still alive', o.survivors7d.toLocaleString(), `tokens 1–7 days old with ≥ $10k liquidity (of ${o.newOlderThan24h} seen)`)}
    ${tile('Honeypot rate', o.honeypotPct != null ? o.honeypotPct.toFixed(1) + '%' : '—', `${o.honeypots} of ${o.honeypotChecked} checked tokens`, o.honeypotPct > 10 ? 'down' : '')}
    ${tile('Holders gained 24h', o.holdersGained24 != null ? (o.holdersGained24 >= 0 ? '+' : '') + o.holdersGained24.toLocaleString() : 'n/a', o.holdersGained24 != null ? `net new wallets across ${o.holdersTracked} tokens, airdrop spikes excluded` : 'no holder history yet', o.holdersGained24 == null ? '' : o.holdersGained24 > 0 ? 'up' : 'down')}
  </div>
  <div class="two">
    <div class="prose">
      <h3>Today in short</h3>
      ${r.story.today.map((p) => `<p>${esc(p)}</p>`).join('')}
    </div>
    <div class="strips">
      ${strip('Most traded', o.byVolume.map((t) => chip(t, '$' + fmtK(t.vol24))))}
      ${strip('Top gainers', o.gainers.map((t) => chip(t, pct(t.pch.h24), 'up')))}
      ${strip('Top losers', o.losers.map((t) => chip(t, pct(t.pch.h24), 'down')))}
      ${strip('Trending on GeckoTerminal', o.trending.map((t) => chip(t, '')))}
      ${strip('Market cap mix', [`<span class="chip"><b>${o.sizeBuckets.micro}</b> under $100k</span>`, `<span class="chip"><b>${o.sizeBuckets.small}</b> $100k–1M</span>`, `<span class="chip"><b>${o.sizeBuckets.mid}</b> $1M–10M</span>`, `<span class="chip"><b>${o.sizeBuckets.large}</b> over $10M</span>`, o.eth ? `<span class="chip dim">ETH $${o.eth.price.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${pct(o.eth.change24)}</span>` : ''])}
    </div>
  </div>
</section>

<section>
  <h2>New launches worth a look <span class="count">${r.newLaunches.picks.length} of ${r.newLaunches.candidates} launched this week · ${r.newLaunches.passed} passed the bar</span></h2>
  <p class="rule">Rule: ${esc(r.newLaunches.rule)}. Ranked by holder growth, buyer skew, unique buyers, depth, turnover, range, GT Score and socials.</p>
  <div class="prose">${r.story.launches.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
  ${r.newLaunches.picks.length ? r.newLaunches.picks.map((t, i) => deepCard(t, i + 1, 'launch')).join('') : empty('Nothing launched this week clears the bar today. The filters are strict on purpose.')}
  ${r.newLaunches.runnersUp.length ? `<div class="runners"><span class="label">Also passed</span> ${r.newLaunches.runnersUp.map((t) => miniChip(t)).join(' ')}</div>` : ''}
</section>

<!-- ============================== PAGE 2 ============================== -->
<div class="pagebreak"></div>
<header class="top second">
  <div>
    <div class="kicker">${esc(CONFIG.networkLabel)} · daily meme digest · page 2 of 2</div>
    <h1>Existing coins</h1>
    <div class="sub">Tokens older than two days with real liquidity: who is quietly accumulating, who is bleeding, what to avoid, and who is actually making money.</div>
  </div>
  <div class="meta"><div>${dateStr} · ${timeStr}</div><div>Data: <a href="${CG_LINKS.api}">CoinGecko API</a></div></div>
</header>

<section>
  <h2>Quiet accumulation <span class="count">price flat, wallets growing</span></h2>
  <p class="rule">Rule: ${esc(r.accumulation.rule)}.</p>
  <div class="prose">${r.story.accumulation.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
  ${r.accumulation.picks.length ? r.accumulation.picks.map((t, i) => deepCard(t, i + 1, 'up', t.why)).join('') : empty('No token fits the pattern today.')}
</section>

<section>
  <h2>Losing power <span class="count">wallets leaving, volume drying up</span></h2>
  <p class="rule">Rule: ${esc(r.fading.rule)}.</p>
  <div class="prose">${r.story.fading.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
  ${r.fading.picks.length ? r.fading.picks.map((t, i) => deepCard(t, i + 1, 'down', t.reasons.join(' · '))).join('') : empty(`Checked ${r.fading.checked} tokens with real liquidity. Nothing is bleeding on two fronts at once today.`)}
</section>

<div class="grid2">
<section>
  <h2>Avoid <span class="count">traded today, failed a hard check</span></h2>
  <div class="prose">${r.story.avoid.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
  ${r.avoid.length ? r.avoid.map(avoidRow).join('') : empty('No traded token failed a hard check today.')}
</section>
<section>
  <h2>Who's actually winning <span class="count">top realized PnL across the ${Math.min(CONFIG.wallets.maxTokens, r.tokens.filter((t) => t.topTraders).length)} most traded memes</span></h2>
  <div class="prose">${r.story.wallets.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
  ${r.wallets.traders.length ? r.wallets.traders.map(walletCard).join('') : empty(`Every one of the ${r.wallets.checked} top-PnL wallets checked today is a bot, router or insider wallet.`)}
  ${r.wallets.biggest && r.wallets.biggest.kind !== 'trader' ? `<p class="rule">For scale: the single largest realized PnL belongs to <a href="${esc(r.wallets.biggest.explorer || '#')}">${short(r.wallets.biggest.address)}</a> at <b>${money(r.wallets.biggest.pnl.realized ?? r.wallets.biggest.realizedPnl)}</b> — ${esc(r.wallets.biggest.tags[0]?.text || '')}.</p>` : ''}
</section>
</div>

<section>
  <h2>Yesterday's picks, today <span class="count">${r.yesterday ? `listed on ${r.yesterday.day}` : 'tracking starts today'}</span></h2>
  <div class="prose">${r.story.yesterday.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
  ${r.yesterday ? `<table class="revisit"><thead><tr><th>List</th><th>Token</th><th>Liquidity then → now</th><th>Price</th><th>Holders</th><th>Status</th><th>Today</th></tr></thead><tbody>${r.yesterday.rows.map(revisitRow).join('')}</tbody></table>` : ''}
</section>

<footer>
  <p><b>How to read this.</b> Every number is CoinGecko API data for ${esc(CONFIG.networkLabel)}. Every list, score, flag, sentence and the HOT/MIXED/COLD call are computed by <a href="https://github.com/strvcture/coingecko-rhc">this open-source script</a> from that data, using the rules printed above each section. They are not CoinGecko ratings and not financial advice. Memes on a new chain can go to zero in an afternoon; the Avoid list is a floor, not a guarantee.</p>
  <p><b>Glossary.</b> <i>Top-10 wallets</i> — share of supply held by the ten largest holders after removing pool, LP, locker and burn contracts. <i>GT Score</i> — GeckoTerminal's 0–100 token quality score, from CoinGecko. <i>Turnover</i> — 24h volume divided by liquidity; above ~10× usually means bots churning a thin pool. <i>Flow</i> — the last ~300 trades in the main pool, as reported by the API. <i>Holders since launch</i> — for tokens under 24h old, the 24h change is the whole history.</p>
  ${r.health.failed ? `<p class="dim">Run health: ${r.health.failed} of ${r.health.calls + r.health.cached} calls returned nothing (${[...new Set(r.health.failures.map((f) => f.endpoint.split('/').slice(-1)[0]))].slice(0, 6).join(', ')}). Affected tokens show "not available" for that field rather than a guess.</p>` : `<p class="dim">Run health: all ${(r.health.calls + r.health.cached).toLocaleString()} calls returned data.</p>`}
  <p class="links">CoinGecko API: <a href="${CG_LINKS.api}">overview</a> · <a href="${CG_LINKS.pricing}">pricing</a> · <a href="${CG_LINKS.docs}">docs</a> &nbsp;|&nbsp; by <a href="https://x.com/${CONFIG.handle}">@${CONFIG.handle}</a></p>
</footer>
</main>
<script>${JS}</script>
</body></html>`;
}

// ---------- the deep-dive card ----------
function deepCard(t, n, kind, headline = '') {
  const i = t.info || {};
  const listings = t.coin ? (t.coin.cexListings.length ? t.coin.cexListings.join(', ') : `DEX only (${t.coin.dexCount} pairs)`) : (t.cgId ? 'on CoinGecko' : 'not on CoinGecko yet');
  const locked = !t.pool.lockedChecked ? 'not checked' : t.pool.lockedLiquidityPct == null ? 'not found' : t.pool.lockedLiquidityPct.toFixed(0) + '%';
  const dev = i.devHoldingPct != null ? i.devHoldingPct.toFixed(1) + '%' : 'not found';
  const sinceLabel = t.ageHours < 24 ? 'since launch' : '24h';
  return `<article class="deep kind-${kind}">
    <div class="head">
      <span class="rank">#${n}</span>
      ${avatar(t)}
      <div class="title"><div class="sym">${esc(t.symbol)} <span class="name">${esc(t.name)}</span>${t.trending ? ' <span class="tag">trending</span>' : ''}${t.copycats >= 1 ? ` <span class="tag grey">${t.copycats} clone${t.copycats > 1 ? 's' : ''}</span>` : ''}</div>
      <div class="dim">${age(t.ageHours)} old · ${esc(t.pool.dex || '')} · ${esc(t.pool.name || '')}${t.pools.length > 1 ? ` · +${t.pools.length - 1} more pool${t.pools.length > 2 ? 's' : ''}` : ''}</div></div>
      <div class="price">${price(t.price)}<div class="${tone(t.pch.h24)}">${pct(t.pch.h24)} ${sinceLabel}</div>${t.pch.h1 != null ? `<div class="dim">${pct(t.pch.h1)} 1h · ${pct(t.pch.h6)} 6h</div>` : ''}</div>
    </div>
    ${headline ? `<div class="why why-${kind}">${esc(headline)}</div>` : ''}
    <div class="body">
      <div class="left">
        ${spark(t, 420, 56)}
        <div class="kv">
          ${kv('Mcap', '$' + fmtK(t.mcap || t.fdv))}${kv('Liquidity', '$' + fmtK(t.liquidity), t.liqToMcap != null ? (t.liqToMcap * 100).toFixed(0) + '% of mcap' : '')}
          ${kv('Vol 24h', '$' + fmtK(t.vol24), t.turnover != null ? t.turnover.toFixed(1) + '× liq' : '')}${kv('Vol 1h / 6h', `$${fmtK(t.vol1)} / $${fmtK(t.vol6)}`, t.momentum?.volChangePct != null ? `<span class="${tone(t.momentum.volChangePct)}">${pct(t.momentum.volChangePct)}</span> vs prev 24h` : '')}
          ${kv('Buyers / sellers 24h', `${t.tx24.buyers} / ${t.tx24.sellers}`, t.buyersRatio != null && t.buyersRatio !== Infinity ? t.buyersRatio.toFixed(2) + '× buyers' : '')}${kv('Buyers / sellers 6h', `${t.tx6.buyers} / ${t.tx6.sellers}`, t.buyersRatio6 != null && t.buyersRatio6 !== Infinity ? t.buyersRatio6.toFixed(2) + '×' : '')}
          ${kv('Holders', t.holdersCount != null ? t.holdersCount.toLocaleString() : '—', holdersSub(t))}${kv('Top-10 wallets', t.top10Pct != null ? t.top10Pct.toFixed(0) + '%' : '—', t.whales ? `largest ${t.whales.largestWalletPct.toFixed(1)}%${t.whales.poolPct ? ` · pool ${t.whales.poolPct.toFixed(0)}%` : ''}` : 'incl. pool')}
          ${kv('Liquidity locked', locked)}${kv('Dev holding', dev)}
          ${kv('GT Score', i.gtScore != null ? i.gtScore.toFixed(0) + '/100' : '—', i.gtScoreDetails ? `holders ${num0(i.gtScoreDetails.holders)} · tx ${num0(i.gtScoreDetails.transaction)} · info ${num0(i.gtScoreDetails.info)}` : '')}${kv('Listings', listings, t.coin?.athChangePct != null ? `${pct(t.coin.athChangePct)} from ATH` : '')}
          ${t.sizing ? kv('Price impact est.', t.sizing.map((x) => `$${fmtK(x.usd)}→${x.impactPct < 10 ? x.impactPct.toFixed(1) : x.impactPct.toFixed(0)}%`).join(' · '), 'constant-product, before fees') : ''}${t.overhang ? kv('Largest wallet vs pool', `$${fmtK(t.overhang.usd)} = ${t.overhang.pctOfPool.toFixed(0)}% of pool`, `~${t.overhang.impactPct.toFixed(0)}% impact if it sold`) : kv('Largest wallet vs pool', '—')}
          ${t.holders?.rate6 != null ? kv('Holder velocity', `${Math.round(t.holders.rate6)}/h`, t.holders.rate6prev != null ? `vs ${Math.round(t.holders.rate6prev)}/h the 6h before` : 'last 6h') : ''}${t.buyersRatio1 != null && t.buyersRatio1 !== Infinity ? kv('Buyer skew 1h → 24h', `${t.buyersRatio1.toFixed(2)}× → ${t.buyersRatio != null && t.buyersRatio !== Infinity ? t.buyersRatio.toFixed(2) : '∞'}×`, `${t.tx1.buyers} buyers / ${t.tx1.sellers} sellers last hour`) : ''}
          ${kv('Honeypot', i.honeypot === true ? 'YES' : i.honeypot === false ? 'no' : 'unknown', [i.mintAuthority ? 'mint authority' : '', i.freezeAuthority ? 'freeze authority' : ''].filter(Boolean).join(' · ') || 'no mint / freeze authority')}${kv('48h range', t.momentum ? `${price(t.momentum.lo48)} – ${price(t.momentum.hi48)}` : '—', t.momentum?.fromHiPct != null ? `${pct(t.momentum.fromHiPct)} from high` : '')}
        </div>
        <div class="socials">${social('web', t.socials.website)}${social('X', t.socials.twitter && 'https://x.com/' + t.socials.twitter)}${social('TG', t.socials.telegram && 'https://t.me/' + t.socials.telegram)}${social('DC', t.socials.discord)}${t.coin?.watchlistUsers ? `<span class="dim">${t.coin.watchlistUsers} CoinGecko watchlists</span>` : ''}${i.categories?.length ? `<span class="dim">· ${i.categories.slice(0, 3).map(esc).join(', ')}</span>` : ''}</div>
        ${flags(t.flags)}
        ${t.scoreParts ? `<div class="score"><div class="bar"><i style="width:${t.score.toFixed(0)}%"></i></div><span>${t.score.toFixed(0)}/100 · ${t.scoreParts.filter((p) => p.v >= 0.7).map((p) => p.label).slice(0, 3).join(', ') || 'no standout factor'}${t.scoreParts.filter((p) => p.v <= 0.2).length ? ` · weak: ${t.scoreParts.filter((p) => p.v <= 0.2).map((p) => p.label).slice(0, 2).join(', ')}` : ''}</span></div>` : ''}
        ${links(t)}
      </div>
      <div class="right">
        <div class="prose">${(t.story || []).map((p) => `<p>${esc(p)}</p>`).join('')}${i.description ? `<p class="desc">“${esc(i.description.slice(0, 260))}${i.description.length > 260 ? '…' : ''}” <span class="dim">— token description, as submitted</span></p>` : ''}</div>
        <div class="tables">
          ${flowTable(t)}
          ${holdersTable(t)}
          ${tradersTable(t)}
        </div>
      </div>
    </div>
  </article>`;
}

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
    <td>${x.holdersChange != null ? `<span class="${tone(x.holdersChange)}">${x.holdersChange >= 0 ? '+' : ''}${x.holdersChange.toLocaleString()}</span>` : '—'}</td>
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
:root{--bg:#0b0e13;--card:#131922;--card2:#182130;--line:#223042;--text:#e8eef5;--mute:#8d9bab;--up:#3ddc84;--down:#ff5c72;--amber:#ffb648;--accent:#c3f73a;--red:#ff5c72}
*{box-sizing:border-box;min-width:0}html{color-scheme:dark}html,body{overflow-x:hidden}body{margin:0;background:var(--bg);color:var(--text);font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none;border-bottom:1px solid var(--line)}a:hover{border-color:var(--accent)}
.page{max-width:1240px;margin:0 auto;padding:22px 16px 30px}
.top{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;padding-bottom:14px;border-bottom:1px solid var(--line);margin-bottom:14px}.top.second{margin-top:36px;padding-top:24px;border-top:2px solid var(--line)}
.kicker{text-transform:uppercase;letter-spacing:.12em;font-size:11px;color:var(--mute)}
h1{margin:4px 0 2px;font-size:28px;letter-spacing:-.02em;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.sub{color:var(--mute);overflow-wrap:anywhere}.meta{text-align:right;color:var(--mute);font-size:12px;line-height:1.5;flex:none}.meta a{color:var(--text)}
.heat{font-size:12px;font-weight:700;letter-spacing:.1em;padding:4px 10px;border-radius:999px;border:1px solid}
.heat-hot{color:var(--up);border-color:var(--up);background:rgba(61,220,132,.08)}.heat-cold{color:var(--down);border-color:var(--down);background:rgba(255,92,114,.08)}.heat-mixed{color:var(--amber);border-color:var(--amber);background:rgba(255,182,72,.08)}
.tiles{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:8px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.tile .label{font-size:11px;color:var(--mute);text-transform:uppercase;letter-spacing:.06em}.tile .value{font-size:22px;font-weight:700;letter-spacing:-.02em;margin:2px 0}.tile .sub{font-size:11px;color:var(--mute);line-height:1.3}
.tile.up .value{color:var(--up)}.tile.down .value{color:var(--down)}
.two{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:18px;margin-top:14px;align-items:start}
.strips{display:flex;flex-direction:column;gap:8px}
.strip{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.strip .label{font-size:11px;color:var(--mute);text-transform:uppercase;letter-spacing:.06em;margin-right:4px;white-space:nowrap}
.chip{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:2px 8px;font-size:12px}.chip b{margin-left:4px}.chip.dim{color:var(--mute)}
.up{color:var(--up)}.down{color:var(--down)}.dim{color:var(--mute)}
.prose{font-size:13px;line-height:1.55}.prose h3{margin:0 0 6px;font-size:14px}.prose p{margin:0 0 8px}.prose.small{font-size:12px;color:var(--mute)}.prose .desc{color:var(--mute);font-style:italic}
section{margin-top:26px}h2{font-size:19px;margin:0 0 4px;letter-spacing:-.01em}h2 .count{font-size:12px;font-weight:500;color:var(--mute);margin-left:8px}
.rule{margin:0 0 10px;font-size:11.5px;color:var(--mute);overflow-wrap:anywhere}
.grid2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px}
.deep{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:12px 0}
.head{display:flex;gap:10px;align-items:center}
.noimg{position:relative;width:36px;height:36px;border-radius:50%;background:var(--card2);flex:none;display:inline-flex;align-items:center;justify-content:center;font-weight:800;color:var(--mute);border:1px solid var(--line);overflow:hidden}.noimg img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.noimg.small{width:28px;height:28px;font-size:12px}
.rank{font-size:12px;color:var(--accent);font-weight:700;flex:none}.title{flex:1}.sym{font-weight:700;font-size:17px}.name{font-weight:400;color:var(--mute);font-size:12px}
.tag{font-size:10px;color:var(--accent);border:1px solid var(--accent);border-radius:4px;padding:0 5px;vertical-align:middle;font-weight:600}.tag.grey{color:var(--mute);border-color:var(--line)}.tag.amber{color:var(--amber);border-color:rgba(255,182,72,.5)}
.price{text-align:right;font-weight:700;white-space:nowrap;flex:none}.price div{font-size:11px;font-weight:600}sub{font-size:9px;vertical-align:-3px}
.why{margin-top:8px;font-size:13px;font-weight:600}.why-up{color:var(--up)}.why-down{color:var(--down)}
.body{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:18px;margin-top:10px}
.spark{display:block;width:100%;height:56px;margin:0 0 8px}.spark.empty{display:flex;align-items:center;justify-content:center;color:var(--mute);font-size:11px;background:var(--card2);border-radius:6px}.sl{font-size:9px;fill:var(--mute)}
.kv{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:4px 10px}.k{display:flex;flex-direction:column;border-top:1px solid var(--line);padding:5px 0 3px}.k span{font-size:10.5px;color:var(--mute);text-transform:uppercase;letter-spacing:.05em}.k b{font-size:13px}.k i{font-style:normal;font-size:11px;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.socials{display:flex;gap:6px;align-items:center;margin-top:8px;font-size:11px;flex-wrap:wrap}.soc{font-size:10.5px;font-weight:700;padding:1px 7px;border-radius:4px;border:1px solid var(--line)}.soc.on{color:var(--up);border-color:rgba(61,220,132,.4)}.soc.off{color:#4e5a68;text-decoration:line-through}
.flags{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}.flag{font-size:10.5px;padding:2px 7px;border-radius:4px;border:1px solid}
.flag.red{color:var(--red);border-color:rgba(255,92,114,.45);background:rgba(255,92,114,.08)}.flag.amber{color:var(--amber);border-color:rgba(255,182,72,.45);background:rgba(255,182,72,.08)}.flag.grey{color:var(--mute);border-color:var(--line)}.flag.green{color:var(--up);border-color:rgba(61,220,132,.35)}
.score{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:11px;color:var(--mute)}.bar{flex:0 0 90px;height:6px;background:var(--card2);border-radius:3px;overflow:hidden}.bar i{display:block;height:100%;background:var(--accent)}
.links{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;font-size:11.5px;align-items:center}.links a{border:1px solid var(--line);border-radius:5px;padding:2px 8px}.links a:hover{border-color:var(--accent)}
.copy{font:inherit;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--mute);background:var(--card2);border:1px solid var(--line);border-radius:5px;padding:2px 8px;cursor:pointer}.copy:hover{color:var(--text)}
.runners{margin-top:10px;font-size:12px;color:var(--mute);display:flex;flex-wrap:wrap;gap:6px;align-items:center}.runners .label{font-size:11px;text-transform:uppercase;letter-spacing:.06em}
.tables{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:6px}.tbl{background:var(--card2);border-radius:10px;padding:10px 12px}.tbl h4{margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.06em}.tbl h4 .dim{text-transform:none;letter-spacing:0;font-weight:500;margin-left:6px}
.tbl table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}.tbl td{padding:3px 4px;vertical-align:top;border-top:1px solid var(--line)}.tbl tr:first-child td{border-top:0}.tbl td.k{color:var(--mute);width:26%;white-space:nowrap}.tbl td.num{text-align:right;white-space:nowrap}.holders td:first-child{width:22px}.holders td:nth-child(3){width:70px}.holders td:nth-child(4){width:70px}.traders td:nth-child(2){width:80px}.traders td:nth-child(3){width:70px}
.addr{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;border:0;color:var(--text)}
.flowbar{height:6px;background:rgba(255,92,114,.35);border-radius:3px;overflow:hidden;margin:2px 0 6px}.flowbar .b{display:block;height:100%;background:var(--up)}.flowline{font-size:12px;margin-bottom:6px}
.avoidcard,.walletcard{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;margin:10px 0}
.kvline{font-size:12px;margin-top:5px}.kvline .k{color:var(--mute);text-transform:uppercase;font-size:10.5px;letter-spacing:.05em;margin-right:6px}
table.revisit{width:100%;border-collapse:collapse;font-size:12.5px}.revisit th{text-align:left;font-size:11px;color:var(--mute);text-transform:uppercase;letter-spacing:.05em;padding:6px;border-bottom:1px solid var(--line)}.revisit td{padding:7px 6px;border-top:1px solid var(--line);vertical-align:top}
.empty{background:var(--card);border:1px dashed var(--line);border-radius:10px;padding:14px;color:var(--mute);font-size:12.5px}
footer{margin-top:30px;padding-top:12px;border-top:1px solid var(--line);color:var(--mute);font-size:11.5px}footer a{color:var(--text)}footer .links{line-height:1.8}
.pagebreak{height:0}
@media(max-width:1000px){.tiles{grid-template-columns:repeat(4,minmax(0,1fr))}.two{grid-template-columns:minmax(0,1fr)}.grid2{grid-template-columns:minmax(0,1fr)}.body{grid-template-columns:minmax(0,1fr)}}
@media(max-width:600px){.tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.top{flex-direction:column;align-items:flex-start}.meta{text-align:left}h1{font-size:22px}.head{flex-wrap:wrap}.price{margin-left:auto}.chip{white-space:normal}}
@media print{body{background:#fff;color:#111}:root{--bg:#fff;--card:#fff;--card2:#f3f5f8;--line:#d8dee6;--text:#111;--mute:#555}.page{padding:0}a{border:0}.pagebreak{page-break-after:always;break-after:page}.top.second{margin-top:0;border-top:0}.deep,.avoidcard,.walletcard{break-inside:avoid}}
`;
