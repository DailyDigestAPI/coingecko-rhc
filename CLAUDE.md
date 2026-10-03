# Robinhood Chain Meme Digest — agent instructions

## The GM trigger

When the user says anything that means "run today's digest", run it. The canonical phrase is:

> GM, what's cooking today on RHC? run me the daily digest

Treat these as the same request — missing words, different punctuation, different order, or any
sentence with the same meaning all count:

- "GM, whats cooking on RHC"
- "gm gm what's cooking today"
- "what's cooking on robinhood chain"
- "run me the daily digest" / "run today's digest" / "run the digest"
- "morning, anything cooking?" / "RHC digest pls" / "what did the chain do overnight"

If the message is a greeting plus any reference to the chain, the digest, or "what's cooking", run it.
Do not ask for confirmation. It costs about 1,100 API credits on the first run of the day and nothing
on later runs the same day (cached).

## What to do

1. From this folder run `npm run report` (allow up to 5 minutes), then `open reports/latest.html`.
2. Reply with a short, punchy rundown, in this order, each one line:
   - **Heat**: HOT / MIXED / COLD and the one-line reason.
   - **Big money**: whale flow net figure and whether it's buying or leaving.
   - **Launches**: the #1 new launch with age, holders and the one flag that matters (or "nothing cleared the bar").
   - **Existing**: the top accumulation or fading name, whichever is more interesting today.
   - **Yesterday**: how many of yesterday's picks are still alive.
   - **Avoid**: the single ugliest thing on the avoid list.
3. End with one line: "Full three pages are open in your browser."

Tone: hype is fine, numbers are not negotiable. Every figure comes from the report; never invent one.
Say "worth a look", never "buy". If the run fails, say so and show the error — don't fake a digest.

## Variants

- "... and push" → also commit and push the new report to GitHub (`git add -A && git commit && git push`).
- "... on Base" → run with `CG_NETWORK=base CG_NETWORK_LABEL="Base" CG_EXPLORER=https://basescan.org`
  and open `reports/latest-base.html`.
- "... fresh" → use `npm run report:fresh` to ignore today's cache.

## Rules for this repo

- The API key lives only in `.env` (git-ignored). Never print it, never commit it.
- Everything the report says is computed by this code from CoinGecko API data. Keep that distinction
  in any wording you add: labels and scores are ours, not CoinGecko's.
- Thresholds live in `src/config.js`; prose templates in `src/narrate.js`; layout in `src/render.js`.
