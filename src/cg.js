// Minimal CoinGecko Pro API client. Zero dependencies (Node 22+).
// - one keep-alive pool, IPv4 first (new TLS connections are the flaky part)
// - bounded concurrency, retries with backoff, 429-aware
// - per-day disk cache so re-rendering a report costs zero credits
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

dns.setDefaultResultOrder('ipv4first');

const BASE = 'https://pro-api.coingecko.com/api/v3';

export class CoinGecko {
  constructor({ apiKey, cacheDir, concurrency = 4, fresh = false, log = () => {} }) {
    if (!apiKey) throw new Error('COINGECKO_API_KEY missing. Copy .env.example to .env and add your key.');
    this.key = apiKey;
    this.cacheDir = cacheDir;
    this.fresh = fresh;
    this.log = log;
    this.limit = concurrency;
    this.active = 0;
    this.queue = [];
    this.stats = { calls: 0, cached: 0, failed: 0, credits: 0 };
    this.failures = []; // endpoints that returned nothing, so the report can say which tokens have partial data
    if (cacheDir) fs.mkdirSync(cacheDir, { recursive: true });
  }

  _cachePath(url) {
    const h = crypto.createHash('sha1').update(url).digest('hex').slice(0, 20);
    return path.join(this.cacheDir, h + '.json');
  }

  async get(endpoint, params = {}, { optional = false } = {}) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    const url = `${BASE}${endpoint}${qs ? '?' + qs : ''}`;

    if (this.cacheDir && !this.fresh) {
      const p = this._cachePath(url);
      if (fs.existsSync(p)) {
        this.stats.cached++;
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    }
    const body = await this._withLimit(() => this._fetch(url, optional));
    if (body !== null && this.cacheDir) fs.writeFileSync(this._cachePath(url), JSON.stringify(body));
    return body;
  }

  _withLimit(fn) {
    return new Promise((resolve, reject) => {
      const run = async () => {
        this.active++;
        try { resolve(await fn()); } catch (e) { reject(e); } finally {
          this.active--;
          const next = this.queue.shift();
          if (next) next();
        }
      };
      if (this.active < this.limit) run(); else this.queue.push(run);
    });
  }

  async _fetch(url, optional) {
    const max = 6;
    let lastErr;
    for (let attempt = 1; attempt <= max; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { 'x-cg-pro-api-key': this.key, accept: 'application/json' },
          signal: AbortSignal.timeout(30_000),
        });
        this.stats.calls++;
        if (res.status === 429) {
          const wait = Number(res.headers.get('retry-after') || 5) * 1000;
          this.log(`429 rate limited, waiting ${wait}ms`);
          await sleep(wait);
          continue;
        }
        if (res.status === 404 || res.status === 400) {
          // Not retryable. Optional endpoints (per-token extras) return null instead of throwing.
          this.stats.failed++;
          this.failures.push({ endpoint: shortUrl(url), status: res.status });
          if (optional) return null;
          throw new Error(`${res.status} ${url.replace(this.key, '')}: ${(await res.text()).slice(0, 200)}`);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this.stats.credits++;
        return await res.json();
      } catch (e) {
        lastErr = e;
        const backoff = Math.min(1500 * 2 ** (attempt - 1), 15_000);
        this.log(`retry ${attempt}/${max} ${shortUrl(url)} (${e.name === 'TimeoutError' ? 'timeout' : e.message})`);
        await sleep(backoff);
      }
    }
    this.stats.failed++;
    this.failures.push({ endpoint: shortUrl(url), status: lastErr?.name === 'TimeoutError' ? 'timeout' : (lastErr?.message || 'error') });
    if (optional) return null;
    throw lastErr;
  }

  // Paginate an onchain list endpoint until a page comes back short, or `stop(page)` says enough.
  async pages(endpoint, params, { maxPages = 10, stop = () => false } = {}) {
    const out = [];
    for (let page = 1; page <= maxPages; page++) {
      const res = await this.get(endpoint, { ...params, page });
      const data = res?.data || [];
      out.push(...withIncluded(data, res?.included));
      if (data.length < 20 || stop(data, page)) break;
    }
    return out;
  }
}

// Attach included base_token / dex records to each pool row for convenience.
function withIncluded(data, included = []) {
  const byId = new Map(included.map((i) => [i.id, i]));
  return data.map((row) => {
    const rel = row.relationships || {};
    const base = rel.base_token?.data?.id;
    const quote = rel.quote_token?.data?.id;
    const dex = rel.dex?.data?.id;
    return { ...row, base_token: byId.get(base) || (base ? { id: base } : null), quote_token: byId.get(quote) || (quote ? { id: quote } : null), dex_id: dex };
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shortUrl = (u) => u.replace(BASE, '').split('?')[0];
