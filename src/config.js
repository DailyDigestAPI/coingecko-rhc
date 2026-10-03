// Every threshold the report uses, in one place. These are the author's rules, not CoinGecko's.
// Change them and re-run; the report explains each pick with the numbers that put it there.
export const CONFIG = {
  network: process.env.CG_NETWORK || 'robinhood',
  networkLabel: process.env.CG_NETWORK_LABEL || 'Robinhood Chain',
  explorer: process.env.CG_EXPLORER || 'https://robin.etherscan.io',
  handle: process.env.X_HANDLE || 'riddlerdefi',

  // Tokens that are money, not memes. Matched on symbol (case-insensitive).
  excludeSymbols: new Set(['WETH', 'ETH', 'USDG', 'USDC', 'USDT', 'DAI', 'WBTC', 'CBBTC', 'USDE', 'GLD', 'HOOD', 'WHOOD', 'FRAX', 'LUSD', 'PYUSD', 'USDS', 'TBTC', 'WSTETH', 'STETH', 'RETH', 'WEETH']),

  // Tokenized stocks, bridged majors and RWA live on this chain too. They are not memes.
  rwa: {
    minLiquidityUsd: 50_000_000, // reserve this large with no trading = tokenized asset, not a meme pool
    maxVolumeUsd: 2_000,
    // "Stock Paired Tokens" are memes paired against a stock token — those stay.
    isRwaCategory: (c) => /tokenized|securit|real world|\brwa\b|stablecoin|bridged|wrapped|exchange-traded/i.test(c) && !/paired/i.test(c),
    // Only applied when CoinGecko does NOT also tag the coin as a meme
    isNotMemeCategory: (c) => /decentralized finance|defi|exchange-based|governance|infrastructure|oracle|layer [12]|smart contract platform|liquid staking|lending|derivatives|yield|perpetual|\bdex\b|zero knowledge|restaking|centralized exchange/i.test(c),
    isMemeCategory: (c) => /meme|launchpad|pump|\.fun|dog|cat|frog|animal|inu|pepe|elon|celebrity|ai agent/i.test(c),
  },

  universe: {
    maxPages: 25,          // 20 pools per page → up to 500 most-traded pools
    minVolumeUsd: 500,     // stop paging by volume once pools fall under this
    minReserveUsd: 5_000,  // stop paging by liquidity once pools fall under this
    maxNewPages: 25,       // newest pools, up to 500 → if capped the report says "500+"
  },

  detail: {
    minLiquidityUsd: 10_000,
    minVolumeUsd: 5_000,
    maxTokens: 220,        // token info + holders chart + candles each
    maxHolderLists: 60,    // established tokens that also get a top-10 holder list
    maxCoinLookups: 60,    // tokens with a CoinGecko coin id → tickers + ATH
  },

  newLaunch: {
    maxAgeHours: 168,      // "new" = first pool under 7 days old
    minAgeHours: 1,        // under an hour there is not enough data to call anything
    minLiquidityUsd: 15_000,
    minVolumeUsd: 10_000,
    minBuyers24: 30,
    minHolders: 100,
    maxTop10PctExPool: 45, // top-10 wallets excluding pool/LP contracts
    maxDrawdown24: -50,    // down more than this on the day = the launch already failed
    maxFromHi: -60,        // more than this off the launch high = the move already happened
    minScore: 60,          // below this, show nothing rather than something
    mcapMin: 200_000,      // the "early" window: big enough to be real, small enough to still run
    mcapMax: 500_000,
    mcapStretch: 1_000_000, // allowed up to here only when the score is exceptional
    stretchScore: 80,
  },

  // Existing coins: what makes a setup worth a look (page 3)
  setups: {
    minAgeHours: 48,
    minLiquidityUsd: 25_000,
    minVolumeUsd: 20_000,
    maxTurnover: 15,         // volume/liquidity above this is bot churn, not demand
    maxTop10Pct: 50,
    maxInsiderShare: 0.6,    // share of top-trader sell $ from wallets that never bought
    dipFrom48hHigh: [-60, -12], // "in a dip" = this far off the 48h high, with holders still arriving
    minScore: 55,            // below this nothing is shown; an empty list beats a weak one
  },

  accumulation: {
    minAgeHours: 48,
    maxAbsPriceChange24: 15,
    maxAbsPriceChange6: 20,   // a pump-and-dump inside the 24h window is not quiet
    maxFromHi48: -50,         // and neither is a token that just lost half its value
    minHolderGrowthPct24: 2,
    minHolderGrowthAbs24: 15,
    minLiquidityUsd: 10_000,
    minVolumeUsd: 3_000,
  },

  fading: {
    minLiquidityUsd: 8_000,
    minVolumeUsd: 2_000,
    holderDropPct24: -1.5,
    volumeDropPct: -50,    // last 24h vs the 24h before, from hourly candles
    sellersToBuyersRatio: 1.4,
  },

  avoid: {
    minVolumeUsd: 3_000,   // only flag things people are actually trading
    top10PctExPool: 60,
    thinLiquidityUsd: 5_000,
    thinLiquidityFdvUsd: 1_000_000,
    minBuysForNoSells: 30,
  },

  wallets: {
    minTokenVolumeUsd: 10_000,
    maxTokens: 40,
    maxWallets: 18,        // checked wallet-wide (PnL + balances), then classified
    show: 5,               // human-looking wallets shown
    botSwaps: 5_000,       // more swaps than this on one chain = bot / router, not a trader to copy
    botTokens: 300,
  },

  picks: 3,
  avoidMax: 6,

  // Page 3: existing coins, split by market cap (FDV where mcap is missing)
  bands: [
    { key: 'small', label: '$300k – $5M', min: 300_000, max: 5_000_000, rotate: false },
    { key: 'mid', label: '$5M – $25M', min: 5_000_000, max: 25_000_000, rotate: true }, // also lists "losing power" — bags people may want to rotate out of
  ],
  picksPerBand: 3,
  bandTableRows: 8,

  // Page 1: notable today
  notable: {
    minLiquidityUsd: 50_000,
    whaleTradeUsd: 10_000,   // trades at or above this, across the most traded tokens
    whaleTradeTokens: 20,
    maxWhaleTrades: 10,
  },
};
