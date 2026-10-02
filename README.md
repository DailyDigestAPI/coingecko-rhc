# Robinhood Chain Meme Digest

One command. One page. What happened in Robinhood Chain memes in the last 24 hours, and which tokens
deserve a look, which are quietly filling up with holders, which are bleeding out, and which to leave alone.

Built on [CoinGecko API](https://www.coingecko.com/en/api?utm_source=x&utm_content=riddlerdefi) data.
Every list, score and flag is computed by this script from that data; none of it is a CoinGecko rating.

![Sample report](reports/sample.png)

## What the report shows

| Section | Question it answers | Raw data it is built from |
|---|---|---|
| **Market overview** | Is the chain hot or cold today? | 24h volume vs the previous 24h, unique buyers vs sellers, % of tokens up, new pools, 7-day survivor rate, honeypot rate, net holders gained |
| **New launches worth a look** | Which of this week's launches clear a safety + traction bar? | Pool age, liquidity, volume, buyers/sellers, holder count and growth, top-10 wallet share, locked liquidity, dev holding, GT Score, socials, exchange listings |
| **Quiet accumulation** | Who is adding holders while price sits still? | Holder history (7 days, per token) against 24h price change |
| **Losing power** | Where are wallets leaving and volume drying up? | Holder history, hourly candles (last 24h vs previous 24h), sellers vs buyers, distance from 48h high |
| **Avoid** | What is being traded today that failed a hard check? | Honeypot flag, mint/freeze authority, zero sells, extreme wallet concentration, thin liquidity vs FDV |
| **Who's winning** | Which wallets realized the most PnL across the most traded memes, and what are they holding now? | Top traders per token, wallet balances and PnL on the chain |

Each pick carries the token address (one-click copy), a CoinGecko or GeckoTerminal link and an explorer link,
so you can go from "worth a look" to "looking at it" without retyping anything.

## Run it

```bash
git clone https://github.com/strvcture/coingecko-rhc
cd coingecko-rhc
cp .env.example .env          # add your CoinGecko API key
npm run report                # → reports/YYYY-MM-DD.html and reports/latest.html
```

Requires Node 22+ and nothing else: no dependencies, no build step.

- A full pull is roughly **1,500–2,500 API credits** and takes 2–5 minutes.
- Responses are cached per day in `data/cache/`, so re-running the same day to tweak rules or styling costs **zero credits**.
- `npm run report:fresh` ignores the cache and pulls everything again.
- `node src/index.js --no-render` collects and analyzes only (writes `data/YYYY-MM-DD.json`).

### Point it at another chain

```bash
CG_NETWORK=base CG_NETWORK_LABEL="Base" CG_EXPLORER=https://basescan.org npm run report
```

Any network id from `/onchain/networks` works. Holder history and wallet balances vary by chain; where a
field is missing the report says so instead of hiding the section.

## How the picks are made

All thresholds live in [`src/config.js`](src/config.js) and are printed above each section of the report.
The defaults:

- **New launch**: first pool under 7 days old · liquidity ≥ $15k · 24h volume ≥ $10k · ≥ 30 unique buyers
  · ≥ 100 holders · top-10 wallets (excluding pool/LP contracts) ≤ 45% · no red flag. Survivors are ranked
  0–100 on holder growth, buyer skew, unique buyers, depth, turnover, GT Score, socials/listing and clean flags.
- **Quiet accumulation**: price within ±15% on the day · holders up ≥ 2% and ≥ 15 wallets in 24h · older
  than 48h. If a chain has no holder history, the list falls back to unique buyers ≥ 1.3× sellers and says so.
- **Losing power**: two or more of — holders down ≥ 1.5% in 24h · volume down ≥ 50% vs the previous 24h ·
  sellers ≥ 1.4× buyers · price −25% · −40% from the 48h high. Weighted by liquidity so a fade on a $2M
  token outranks one on a $20k token.
- **Avoid**: any red flag on a token with ≥ $3k volume today.
- **Heat** (HOT / MIXED / COLD): breadth, buyer skew and volume momentum, combined into one score.

## What comes from CoinGecko and what this code computes

**CoinGecko API supplies:** pool prices, liquidity, volume, buy/sell counts, pool age, token info (GT Score,
honeypot flag, mint/freeze authority, developer holding, holder count and distribution, socials), holder
history, OHLCV candles, top holders, top traders with realized PnL, locked liquidity %, wallet balances, and
coin-level tickers / ATH for tokens listed on CoinGecko.

**This code computes:** the universe (which pools count), the meme filter (stables and wrapped majors are
dropped), top-10 wallet share excluding pool contracts, holder change over 24h/7d, volume momentum from
candles, every flag, every score, every list and the HOT/MIXED/COLD call.

Not financial advice. Memes on a young chain can go to zero in an afternoon. "Avoid" is a floor, not a guarantee.

## Layout

```
src/cg.js        API client: keep-alive, IPv4-first, retries, 429 handling, per-day disk cache
src/collect.js   one sweep of the chain → raw data (nothing scored here)
src/analyze.js   derived fields, flags, scores, the five lists
src/render.js    one self-contained HTML page, inline SVG sparklines, no external assets
src/config.js    every threshold
src/index.js     CLI
reports/         generated pages (sample committed)
data/            JSON per day + cache (cache is git-ignored)
```

## CoinGecko API

- [CoinGecko API](https://www.coingecko.com/en/api?utm_source=x&utm_content=riddlerdefi)
- [Pricing](https://www.coingecko.com/en/api/pricing?utm_source=x&utm_content=riddlerdefi)
- [Documentation](https://docs.coingecko.com/?utm_source=x&utm_content=riddlerdefi)

The onchain wallet, megafilter and holder endpoints used here need the Analyst plan or above.

## License

MIT
