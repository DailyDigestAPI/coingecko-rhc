// Renders the analyzed report as one self-contained HTML page. No external assets.
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
  const dateStr = day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const timeStr = day.toISOString().slice(11, 16) + ' UTC';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${CONFIG.networkLabel} Meme Digest · ${r.day}</title>
<style>${CSS}</style></head>
<body><main class="page">

<header class="top">
  <div>
    <div class="kicker">${esc(CONFIG.networkLabel)} · daily meme digest</div>
    <h1>${dateStr} <span class="heat heat-${o.heat.toLowerCase()}">${o.heat}</span></h1>
    <div class="sub">${o.heatWhy.map(esc).join(' · ')}</div>
  </div>
  <div class="meta">
    <div>Data: <a href="${CG_LINKS.api}">CoinGecko API</a></div>
    <div>${o.poolsScanned.toLocaleString()} pools scanned · ${o.memesTracked} memes tracked · ${timeStr}</div>
    <div class="dim">${(r.stats.credits + r.stats.cached).toLocaleString()} API calls${r.stats.cached ? ` (${r.stats.cached.toLocaleString()} from today's cache)` : ''} · ${r.durationSec}s</div>
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
    ${tile('Holders gained 24h', o.holdersGained24 != null ? (o.holdersGained24 >= 0 ? '+' : '') + o.holdersGained24.toLocaleString() : 'n/a', o.holdersGained24 != null ? `net new wallets across ${o.holdersTracked} tokens` : 'no holder history yet', o.holdersGained24 == null ? '' : o.holdersGained24 > 0 ? 'up' : 'down')}
  </div>
  <div class="strips">
    ${strip('Most traded', o.byVolume.map((t) => chip(t, '$' + fmtK(t.vol24))))}
    ${strip('Top gainers', o.gainers.map((t) => chip(t, pct(t.pch.h24), 'up')))}
    ${strip('Top losers', o.losers.map((t) => chip(t, pct(t.pch.h24), 'down')))}
    ${strip('Market cap mix', [`<span class="chip"><b>${o.sizeBuckets.micro}</b> under $100k</span>`, `<span class="chip"><b>${o.sizeBuckets.small}</b> $100k–1M</span>`, `<span class="chip"><b>${o.sizeBuckets.mid}</b> $1M–10M</span>`, `<span class="chip"><b>${o.sizeBuckets.large}</b> over $10M</span>`, o.eth ? `<span class="chip dim">ETH $${o.eth.price.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${pct(o.eth.change24)}</span>` : ''])}
  </div>
</section>

<section>
  <h2>New launches worth a look <span class="count">${r.newLaunches.picks.length} of ${r.newLaunches.candidates} launched this week passed</span></h2>
  <p class="rule">Rule: ${esc(r.newLaunches.rule)}. Ranked by holder growth, buyer skew, depth, turnover, GT Score and socials.</p>
  ${r.newLaunches.picks.length ? `<div class="grid3">${r.newLaunches.picks.map((t, i) => launchCard(t, i + 1)).join('')}</div>` : empty('Nothing launched this week clears the bar today. The filters are strict on purpose.')}
  ${r.newLaunches.runnersUp.length ? `<div class="runners">Also passed: ${r.newLaunches.runnersUp.map((t) => miniChip(t)).join(' ')}</div>` : ''}
</section>

<div class="grid2">
<section>
  <h2>Quiet accumulation <span class="count">price flat, wallets growing</span></h2>
  <p class="rule">Rule: ${esc(r.accumulation.rule)}.${r.accumulation.mode === 'fallback' ? ' <b>Holder history not available for this chain yet</b>, so this list uses buyer counts instead.' : ''}</p>
  ${r.accumulation.picks.length ? r.accumulation.picks.map((t, i) => trendCard(t, i + 1, t.why, 'up')).join('') : empty(r.accumulation.mode === 'none' ? `Holder history exists for ${r.accumulation.checked} tokens, but none is adding wallets while price sits still today.` : 'No token fits the pattern today.')}
</section>
<section>
  <h2>Losing power <span class="count">wallets leaving, volume drying up</span></h2>
  <p class="rule">Rule: ${esc(r.fading.rule)}.</p>
  ${r.fading.picks.length ? r.fading.picks.map((t, i) => trendCard(t, i + 1, t.reasons.join(' · '), 'down')).join('') : empty(`Checked ${r.fading.checked} tokens with real liquidity. Nothing is bleeding on two fronts at once today.`)}
</section>
</div>

<div class="grid2">
<section>
  <h2>Avoid <span class="count">traded today, failed a hard check</span></h2>
  <p class="rule">Only tokens with ≥ $${fmtK(CONFIG.avoid.minVolumeUsd)} volume today, so this is what people are actually buying.</p>
  ${r.avoid.length ? `<table class="avoid"><tbody>${r.avoid.map((t) => `<tr><td class="sym">${tokenLink(t)}<span class="dim"> $${fmtK(t.vol24)} vol</span></td><td>${t.reasons.map((x) => `<span class="flag red">${esc(x)}</span>`).join(' ')}</td></tr>`).join('')}</tbody></table>` : empty('No traded token failed a hard check today.')}
</section>
<section>
  <h2>Who's actually winning <span class="count">top realized PnL across the ${Math.min(CONFIG.wallets.maxTokens, r.tokens.filter((t) => t.topTraders).length)} most traded memes</span></h2>
  <p class="rule">From each token's top-trader list, the ${r.wallets.checked} biggest earners were checked wallet-wide: realized PnL on ${esc(CONFIG.networkLabel)}, win/loss by token, and current bags. <b>${r.wallets.bots} were bots or routers and ${r.wallets.insiders} sold tokens they never bought</b> (team / airdrop wallets) — those are dropped. What is left is a human you could study.</p>
  ${r.wallets.traders.length ? `<table class="wallets"><tbody>${r.wallets.traders.map(walletRow).join('')}</tbody></table>` : empty(`Every one of the ${r.wallets.checked} top-PnL wallets checked today is a bot, router or insider wallet. Nobody human is winning big on ${CONFIG.networkLabel} memes right now.`)}
  ${r.wallets.biggest && r.wallets.biggest.kind !== 'trader' ? `<p class="rule">For scale: the single largest realized PnL belongs to <a href="${esc(r.wallets.biggest.explorer || '#')}">${r.wallets.biggest.address.slice(0, 6)}…${r.wallets.biggest.address.slice(-4)}</a> at <b>${money(r.wallets.biggest.pnl.realized ?? r.wallets.biggest.realizedPnl)}</b> — ${esc(r.wallets.biggest.tags[0]?.text || '')}.</p>` : ''}
</section>
</div>

<footer>
  <p><b>How to read this.</b> Every number is CoinGecko API data for ${esc(CONFIG.networkLabel)}. Every list, score, flag and the HOT/MIXED/COLD call are computed by <a href="https://github.com/strvcture/coingecko-rhc">this open-source script</a> from that data, using the rules printed above each section. They are not CoinGecko ratings and not financial advice. Memes on a new chain can go to zero in an afternoon; the Avoid list is a floor, not a guarantee.</p>
  <p class="links">CoinGecko API: <a href="${CG_LINKS.api}">overview</a> · <a href="${CG_LINKS.pricing}">pricing</a> · <a href="${CG_LINKS.docs}">docs</a> &nbsp;|&nbsp; by <a href="https://x.com/${CONFIG.handle}">@${CONFIG.handle}</a></p>
</footer>
</main>
<script>${JS}</script>
</body></html>`;
}

// ---------- blocks ----------
function tile(label, value, sub, tone = '') {
  return `<div class="tile ${tone}"><div class="label">${esc(label)}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;
}
function delta(v, suffix) { return `<span class="${v >= 0 ? 'up' : 'down'}">${pct(v)}</span> ${suffix}`; }
function strip(label, items) { return `<div class="strip"><span class="label">${esc(label)}</span>${items.filter(Boolean).join('')}</div>`; }
function chip(t, value, tone = '') { return `<span class="chip">${tokenLink(t)} <b class="${tone}">${value}</b></span>`; }
function miniChip(t) { return `<span class="chip">${tokenLink(t)} <span class="dim">$${fmtK(t.liquidity)} liq · ${t.holdersCount ?? '—'} holders</span></span>`; }
function empty(text) { return `<div class="empty">${esc(text)}</div>`; }

function launchCard(t, n) {
  const i = t.info || {};
  const listings = t.coin ? (t.coin.cexListings.length ? t.coin.cexListings.join(', ') : `DEX only (${t.coin.dexCount} pairs)`) : (t.cgId ? 'on CoinGecko' : 'not on CoinGecko yet');
  const locked = !t.pool.lockedChecked ? 'not checked' : t.pool.lockedLiquidityPct == null ? 'not found' : t.pool.lockedLiquidityPct.toFixed(0) + '%';
  const dev = i.devHoldingPct != null ? i.devHoldingPct.toFixed(1) + '%' : 'not found';
  return `<article class="card launch">
    <div class="head">
      <span class="rank">#${n}</span>
      ${avatar(t)}
      <div class="title"><div class="sym">${esc(t.symbol)} <span class="name">${esc(t.name)}</span>${t.trending ? ' <span class="tag">trending</span>' : ''}</div>
      <div class="dim">${age(t.ageHours)} old · ${esc(t.pool.dex || '')} · ${esc(t.pool.quote || '')} pair</div></div>
      <div class="price">${price(t.price)}<div class="${tone(t.pch.h24)}">${pct(t.pch.h24)} ${t.ageHours < 24 ? 'since launch' : '24h'}</div></div>
    </div>
    ${spark(t)}
    <div class="kv">
      ${kv('Mcap', '$' + fmtK(t.mcap || t.fdv))}${kv('Liquidity', '$' + fmtK(t.liquidity), t.liqToMcap != null ? (t.liqToMcap * 100).toFixed(0) + '% of mcap' : '')}
      ${kv('Vol 24h', '$' + fmtK(t.vol24), t.turnover != null ? t.turnover.toFixed(1) + '× liq' : '')}${kv('Buyers / sellers', `${t.tx24.buyers} / ${t.tx24.sellers}`, t.buyersRatio != null && t.buyersRatio !== Infinity ? t.buyersRatio.toFixed(2) + '×' : '')}
      ${kv('Holders', t.holdersCount != null ? t.holdersCount.toLocaleString() : '—', holdersSub(t))}
      ${kv('Top-10 wallets', t.top10Pct != null ? t.top10Pct.toFixed(0) + '%' : '—', t.whales ? `largest ${t.whales.largestWalletPct.toFixed(1)}%${t.whales.poolPct ? ` · pool ${t.whales.poolPct.toFixed(0)}%` : ''}` : 'incl. pool')}
      ${kv('Liquidity locked', locked)}${kv('Dev holding', dev)}
      ${kv('GT Score', i.gtScore != null ? i.gtScore.toFixed(0) + '/100' : '—', i.gtScoreDetails ? `holders ${num0(i.gtScoreDetails.holders)} · tx ${num0(i.gtScoreDetails.transaction)} · info ${num0(i.gtScoreDetails.info)}` : '')}
      ${kv('Listings', listings)}
    </div>
    <div class="socials">${social('web', t.socials.website)}${social('X', t.socials.twitter && 'https://x.com/' + t.socials.twitter)}${social('TG', t.socials.telegram && 'https://t.me/' + t.socials.telegram)}${social('DC', t.socials.discord)}${t.coin?.watchlistUsers ? `<span class="dim">${t.coin.watchlistUsers} CoinGecko watchlists</span>` : ''}</div>
    ${flags(t.flags)}
    <div class="score"><div class="bar"><i style="width:${t.score.toFixed(0)}%"></i></div><span>${t.score.toFixed(0)}/100 · ${t.scoreParts.filter((p) => p.v >= 0.7).map((p) => p.label).slice(0, 3).join(', ') || 'no standout factor'}</span></div>
    ${links(t)}
  </article>`;
}

function trendCard(t, n, why, dir) {
  return `<article class="card trend">
    <div class="head">
      <span class="rank">#${n}</span>
      ${avatar(t)}
      <div class="title"><div class="sym">${esc(t.symbol)} <span class="name">${esc(t.name)}</span></div><div class="dim">${age(t.ageHours)} old · $${fmtK(t.mcap || t.fdv)} mcap · $${fmtK(t.liquidity)} liq · $${fmtK(t.vol24)} vol</div></div>
      <div class="price">${price(t.price)}<div class="${tone(t.pch.h24)}">${pct(t.pch.h24)} 24h</div></div>
    </div>
    <div class="why ${dir}">${esc(why)}</div>
    <div class="row">${spark(t, 220, 34)}<div class="mini">
      ${t.holders ? `<div>holders <b>${t.holders.now.toLocaleString()}</b> ${holdersSub(t)}${t.holders.change7dPct != null ? ` · <span class="${tone(t.holders.change7dPct)}">${pct(t.holders.change7dPct)}</span> 7d` : ''}</div>` : '<div class="dim">no holder history</div>'}
      <div>buyers <b>${t.tx24.buyers}</b> · sellers <b>${t.tx24.sellers}</b>${t.momentum?.volChangePct != null ? ` · vol <span class="${tone(t.momentum.volChangePct)}">${pct(t.momentum.volChangePct)}</span> vs prev 24h` : ''}</div>
      <div class="dim">top-10 ${t.top10Pct != null ? t.top10Pct.toFixed(0) + '%' : '—'} · GT ${t.info?.gtScore != null ? t.info.gtScore.toFixed(0) : '—'}${t.coin?.athChangePct != null ? ` · ${pct(t.coin.athChangePct)} from ATH` : ''}</div>
    </div></div>
    ${flags(t.flags.filter((f) => f.level !== 'grey'))}
    ${links(t)}
  </article>`;
}

function walletRow(w) {
  const short = w.address.slice(0, 6) + '…' + w.address.slice(-4);
  const realized = w.pnl.realized ?? w.realizedPnl;
  const best = (w.best.length ? w.best : w.tokens.map((x) => ({ symbol: x.symbol, realized: x.pnl }))).map((x) => `${esc(x.symbol)} <span class="${tone(x.realized)}">${money(x.realized)}</span>`).join(' · ');
  const bags = w.bagsChecked ? (w.bags.length ? w.bags.map((b) => `${esc(b.symbol)} $${fmtK(b.usd)}`).join(' · ') + ` <span class="dim">(≈ $${fmtK(w.bagsTotal)} total)</span>` : 'cashed out — nothing left on chain') : 'balances not available';
  const record = w.pnl.winRate != null ? `${w.pnl.wins}W / ${w.pnl.losses}L` : '';
  return `<tr><td class="sym"><a href="${esc(w.explorer || CONFIG.explorer + '/address/' + w.address)}">${short}</a><div class="dim">${w.swaps.toLocaleString()} swaps${record ? ` · ${record}` : ''}</div></td>
    <td><div><b class="${tone(realized)}">${money(realized)}</b> realized${w.pnl.unrealized != null ? ` · <span class="${tone(w.pnl.unrealized)}">${money(w.pnl.unrealized)}</span> open` : ''} · ${w.pnl.tokens} token${w.pnl.tokens === 1 ? '' : 's'}</div><div class="dim">best: ${best}</div><div class="dim">holds: ${bags}</div>${w.tags.length ? `<div class="flags">${w.tags.map((f) => `<span class="flag ${f.level}">${esc(f.text)}</span>`).join('')}</div>` : ''}</td></tr>`;
}

function holdersSub(t) {
  const h = t.holders;
  if (!h || h.change24 == null) return 'no history';
  const sign = h.change24 >= 0 ? '+' : '';
  if (h.sinceLaunch) return `<span class="${tone(h.change24)}">${sign}${h.change24.toLocaleString()} since launch (${age(h.spanHours)})</span>`;
  return `<span class="${tone(h.change24)}">${sign}${h.change24.toLocaleString()} (${pct(h.change24Pct)}) 24h</span>`;
}

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
  return `<div class="links">${cg}${gt}${ex}<button class="copy" data-copy="${esc(t.address)}" title="copy token address">${t.address.slice(0, 8)}…${t.address.slice(-6)} ⧉</button></div>`;
}
function tokenLink(t) { return `<a class="tok" href="https://www.geckoterminal.com/${CONFIG.network}/pools/${esc(t.pool.address)}?${UTM}">${esc(t.symbol)}</a>`; }

function spark(t, w = 300, h = 40) {
  const c = t.momentum?.closes;
  if (!c || c.length < 4) return `<div class="spark empty" style="height:${h}px">no candles</div>`;
  const min = Math.min(...c), max = Math.max(...c), span = max - min || 1;
  const pts = c.map((v, i) => `${((i / (c.length - 1)) * w).toFixed(1)},${(h - 3 - ((v - min) / span) * (h - 6)).toFixed(1)}`);
  const up = c.at(-1) >= c[0];
  const label = t.momentum.hoursCovered >= 1 ? `${t.momentum.hoursCovered}h` : `${Math.round(c.length * t.momentum.candleMinutes)}m`;
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
function money(v) { if (v == null) return '—'; return (v < 0 ? '−$' : '$') + fmtK(Math.abs(v)); }
function age(h) { if (h == null) return '—'; if (h < 1) return `${Math.round(h * 60)}m`; if (h < 48) return `${Math.floor(h)}h`; return `${Math.floor(h / 24)}d ${Math.floor(h % 24)}h`; }
const tone = (v) => (v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : '');
const num0 = (v) => (v == null ? '—' : Number(v).toFixed(0));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const JS = `document.querySelectorAll('.copy').forEach(b=>b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(b.dataset.copy);const t=b.textContent;b.textContent='copied';setTimeout(()=>b.textContent=t,1200)}catch(e){prompt('token address',b.dataset.copy)}}));`;

const CSS = `
:root{--bg:#0b0e13;--card:#131922;--card2:#182130;--line:#223042;--text:#e8eef5;--mute:#8d9bab;--up:#3ddc84;--down:#ff5c72;--amber:#ffb648;--accent:#c3f73a;--red:#ff5c72}
*{box-sizing:border-box;min-width:0}html{color-scheme:dark}html,body{overflow-x:hidden}body{margin:0;background:var(--bg);color:var(--text);font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none;border-bottom:1px solid var(--line)}a:hover{border-color:var(--accent)}
.page{max-width:1240px;margin:0 auto;padding:22px 16px 30px}
.top{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;padding-bottom:14px;border-bottom:1px solid var(--line);margin-bottom:14px}
.kicker{text-transform:uppercase;letter-spacing:.12em;font-size:11px;color:var(--mute)}
h1{margin:4px 0 2px;font-size:28px;letter-spacing:-.02em;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.sub{color:var(--mute);overflow-wrap:anywhere}.meta{text-align:right;color:var(--mute);font-size:12px;line-height:1.5}.meta a{color:var(--text)}
.heat{font-size:12px;font-weight:700;letter-spacing:.1em;padding:4px 10px;border-radius:999px;border:1px solid}
.heat-hot{color:var(--up);border-color:var(--up);background:rgba(61,220,132,.08)}.heat-cold{color:var(--down);border-color:var(--down);background:rgba(255,92,114,.08)}.heat-mixed{color:var(--amber);border-color:var(--amber);background:rgba(255,182,72,.08)}
.tiles{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:8px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px;min-width:0}
.tile .label{font-size:11px;color:var(--mute);text-transform:uppercase;letter-spacing:.06em}.tile .value{font-size:22px;font-weight:700;letter-spacing:-.02em;margin:2px 0}.tile .sub{font-size:11px;color:var(--mute);line-height:1.3}
.tile.up .value{color:var(--up)}.tile.down .value{color:var(--down)}
.strips{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px 18px;margin-top:10px}
.strip{display:flex;flex-wrap:wrap;gap:6px;align-items:center;min-width:0}.strip .label{font-size:11px;color:var(--mute);text-transform:uppercase;letter-spacing:.06em;margin-right:4px;white-space:nowrap}
.chip{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:2px 8px;font-size:12px;white-space:nowrap}.chip b{margin-left:4px}.chip.dim{color:var(--mute)}
.up{color:var(--up)}.down{color:var(--down)}.dim{color:var(--mute)}
section{margin-top:22px}h2{font-size:17px;margin:0 0 2px;letter-spacing:-.01em}h2 .count{font-size:12px;font-weight:500;color:var(--mute);margin-left:8px}
.rule{margin:0 0 10px;font-size:11.5px;color:var(--mute)}
.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.grid2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;margin-bottom:10px;min-width:0}
.head{display:flex;gap:10px;align-items:center}.noimg{position:relative;width:34px;height:34px;border-radius:50%;background:var(--card2);flex:none;display:inline-flex;align-items:center;justify-content:center;font-weight:800;color:var(--mute);border:1px solid var(--line);overflow:hidden}.noimg img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.rank{font-size:11px;color:var(--accent);font-weight:700;flex:none}.title{flex:1;min-width:0}.sym{font-weight:700;font-size:15px}.name{font-weight:400;color:var(--mute);font-size:12px}
.tag{font-size:10px;color:var(--accent);border:1px solid var(--accent);border-radius:4px;padding:0 5px;vertical-align:middle}
.price{text-align:right;font-weight:700;white-space:nowrap}.price div{font-size:11px;font-weight:600}sub{font-size:9px;vertical-align:-3px}
.spark{display:block;width:100%;height:40px;margin:8px 0 6px}.spark.empty{display:flex;align-items:center;justify-content:center;color:var(--mute);font-size:11px;background:var(--card2);border-radius:6px}.sl{font-size:9px;fill:var(--mute)}
.kv{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:4px 10px}.k{display:flex;flex-direction:column;border-top:1px solid var(--line);padding:5px 0 3px;min-width:0}.k span{font-size:10.5px;color:var(--mute);text-transform:uppercase;letter-spacing:.05em}.k b{font-size:13px}.k i{font-style:normal;font-size:11px;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.socials{display:flex;gap:6px;align-items:center;margin-top:8px;font-size:11px}.soc{font-size:10.5px;font-weight:700;padding:1px 7px;border-radius:4px;border:1px solid var(--line)}.soc.on{color:var(--up);border-color:rgba(61,220,132,.4)}.soc.off{color:#4e5a68;text-decoration:line-through}
.flags{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}.flag{font-size:10.5px;padding:2px 7px;border-radius:4px;border:1px solid}
.flag.red{color:var(--red);border-color:rgba(255,92,114,.45);background:rgba(255,92,114,.08)}.flag.amber{color:var(--amber);border-color:rgba(255,182,72,.45);background:rgba(255,182,72,.08)}.flag.grey{color:var(--mute);border-color:var(--line)}.flag.green{color:var(--up);border-color:rgba(61,220,132,.35)}
.score{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:11px;color:var(--mute)}.bar{flex:0 0 90px;height:6px;background:var(--card2);border-radius:3px;overflow:hidden}.bar i{display:block;height:100%;background:var(--accent)}
.links{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;font-size:11.5px;align-items:center}.links a{border:1px solid var(--line);border-radius:5px;padding:2px 8px}.links a:hover{border-color:var(--accent)}
.copy{font:inherit;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--mute);background:var(--card2);border:1px solid var(--line);border-radius:5px;padding:2px 8px;cursor:pointer}.copy:hover{color:var(--text)}
.runners{margin-top:8px;font-size:12px;color:var(--mute);display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.trend .why{margin-top:8px;font-size:12.5px;font-weight:600}.trend .why.up{color:var(--up)}.trend .why.down{color:var(--down)}
.row{display:flex;gap:12px;align-items:center;margin-top:6px}.row .spark{width:220px;flex:none;margin:0}.mini{font-size:11.5px;color:var(--text);min-width:0;line-height:1.5}
table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:12.5px}td{padding:7px 6px;border-top:1px solid var(--line);vertical-align:top}td.sym{white-space:nowrap;font-weight:700;width:30%}.tok{font-weight:700;border:0}
.empty{background:var(--card);border:1px dashed var(--line);border-radius:10px;padding:14px;color:var(--mute);font-size:12.5px}
footer{margin-top:26px;padding-top:12px;border-top:1px solid var(--line);color:var(--mute);font-size:11.5px}footer a{color:var(--text)}.links{line-height:1.8}
@media(max-width:1000px){.tiles{grid-template-columns:repeat(4,minmax(0,1fr))}.grid3{grid-template-columns:minmax(0,1fr)}.grid2{grid-template-columns:minmax(0,1fr)}.strips{grid-template-columns:minmax(0,1fr)}}
@media(max-width:600px){.tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.top{flex-direction:column;align-items:flex-start}.meta{text-align:left}h1{font-size:22px}.head{flex-wrap:wrap}.price{margin-left:auto}.row{flex-wrap:wrap}.row .spark{width:100%}.chip{white-space:normal}.tile .sub{overflow-wrap:anywhere}.rule{overflow-wrap:anywhere}}
@media print{body{background:#fff;color:#111}:root{--bg:#fff;--card:#fff;--card2:#f3f5f8;--line:#d8dee6;--text:#111;--mute:#555}.page{padding:0}a{border:0}}
`;
