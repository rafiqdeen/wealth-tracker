import express from 'express';
import dns from 'dns';
import db from '../db/database.js';
import { authenticateToken } from '../middleware/auth.js';

// Force IPv4 first to avoid IPv6 connection issues
dns.setDefaultResultOrder('ipv4first');

const router = express.Router();

// Constants
const TROY_OUNCE_TO_GRAMS = 31.1035; // 1 troy ounce = 31.1035 grams

// India premium over international spot price
// Accounts for: Import duty (~15%) + GST (3%) + local premiums
// Actual retail markup is typically 4-6% over landed cost
const INDIA_PREMIUM = {
  gold: 1.052,   // ~5.2% premium for gold (matches Chennai retail prices)
  silver: 1.05,  // ~5% premium for silver
};

// Yahoo Finance symbols
const SYMBOLS = {
  gold: 'GC=F',      // Gold Futures (COMEX) - USD per troy ounce
  silver: 'SI=F',    // Silver Futures - USD per troy ounce
  usdInr: 'USDINR=X' // USD to INR exchange rate
};

// Purity factors for gold
const GOLD_PURITY_FACTORS = {
  '24K': 1.000,   // 99.9% pure
  '22K': 0.916,   // 91.6% pure
  '18K': 0.750,   // 75.0% pure
  '14K': 0.585,   // 58.5% pure
};

// Purity factors for silver
const SILVER_PURITY_FACTORS = {
  '999': 1.000,   // 99.9% fine silver
  '925': 0.925,   // Sterling silver
  '900': 0.900,   // Coin silver
};

// Daily fetch time (11:30 AM IST)
const FETCH_HOUR = 11;
const FETCH_MINUTE = 30;

// Fetch price from Yahoo Finance with timeout
const FETCH_TIMEOUT_MS = 15000; // 15 seconds

async function fetchYahooPrice(symbol) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Yahoo Finance API error: ${response.status}`);
    }

    const data = await response.json();
    const result = data.chart.result?.[0];

    if (!result) {
      throw new Error(`No data found for symbol: ${symbol}`);
    }

    const meta = result.meta;
    return {
      symbol,
      price: meta.regularMarketPrice,
      currency: meta.currency,
      previousClose: meta.chartPreviousClose || meta.previousClose,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const errorType = error.name === 'AbortError' ? 'Request timed out' : error.message;
    console.error(`Error fetching Yahoo price for ${symbol}: ${errorType}`);
    throw new Error(errorType);
  }
}

// Fetch gold/silver price and convert to INR per gram
async function fetchMetalPriceINR(metal = 'gold') {
  // Fetch metal price in USD (per troy ounce)
  const metalSymbol = metal === 'gold' ? SYMBOLS.gold : SYMBOLS.silver;
  const metalData = await fetchYahooPrice(metalSymbol);

  // Fetch USD to INR exchange rate
  const forexData = await fetchYahooPrice(SYMBOLS.usdInr);

  const metalPriceUSD = metalData.price; // USD per troy ounce
  const usdToInr = forexData.price;      // INR per USD
  const indiaPremium = INDIA_PREMIUM[metal] || 1;

  // Convert to INR per gram (24K/999 purity)
  // Formula: (USD/troy oz) × (INR/USD) ÷ (grams/troy oz) × India premium
  const internationalPriceINR = (metalPriceUSD * usdToInr) / TROY_OUNCE_TO_GRAMS;
  const pricePerGramINR = internationalPriceINR * indiaPremium;

  return {
    metal,
    pricePerGram24K: Math.round(pricePerGramINR * 100) / 100, // Round to 2 decimals
    metalPriceUSD,
    usdToInr,
    indiaPremium,
    internationalPrice: Math.round(internationalPriceINR * 100) / 100,
    currency: 'INR',
    calculation: {
      metalPriceUSD: metalPriceUSD,
      usdToInr: usdToInr,
      troyOunceToGrams: TROY_OUNCE_TO_GRAMS,
      indiaPremium: `${((indiaPremium - 1) * 100).toFixed(1)}%`,
      formula: `(${metalPriceUSD.toFixed(2)} USD/oz × ${usdToInr.toFixed(2)} INR/USD) ÷ ${TROY_OUNCE_TO_GRAMS} g/oz × ${indiaPremium} = ₹${pricePerGramINR.toFixed(2)}/g`
    },
    fetchedAt: new Date().toISOString()
  };
}

// Get current time in IST (UTC+5:30)
function getISTTime() {
  const now = new Date();
  // Convert to IST by adding 5 hours 30 minutes to UTC
  const istOffset = 5.5 * 60 * 60 * 1000; // 5.5 hours in milliseconds
  const istTime = new Date(now.getTime() + istOffset + (now.getTimezoneOffset() * 60 * 1000));
  return istTime;
}

// Check if we should fetch new price (after 11:30 AM IST and no fetch today after 11:30)
async function shouldFetchNewPrice(metal) {
  const istNow = getISTTime();
  const currentHour = istNow.getUTCHours();
  const currentMinute = istNow.getUTCMinutes();
  // Use IST date for comparison
  const today = istNow.toISOString().split('T')[0];

  // If before 11:30 AM, don't auto-fetch
  if (currentHour < FETCH_HOUR || (currentHour === FETCH_HOUR && currentMinute < FETCH_MINUTE)) {
    return false;
  }

  // Check if we already fetched today after 11:30 AM
  const todayFetch = await db.get(
    `SELECT * FROM metal_prices
    WHERE metal = ?
    AND DATE(fetched_at) = ?
    AND TIME(fetched_at) >= '11:30:00'
    ORDER BY fetched_at DESC
    LIMIT 1`,
    [metal, today]
  );

  return !todayFetch;
}

// Get most recent cached price
async function getCachedPrice(metal) {
  return await db.get(
    `SELECT * FROM metal_prices
    WHERE metal = ?
    ORDER BY fetched_at DESC
    LIMIT 1`,
    [metal]
  );
}

// Save price to database
async function savePrice(metal, pricePerGram24K, metalPriceUSD, usdToInr) {
  const now = new Date().toISOString();

  await db.run(
    `INSERT INTO metal_prices (metal, price_per_gram, price_per_gram_24k, currency, fetched_at)
    VALUES (?, ?, ?, 'INR', ?)`,
    [metal, pricePerGram24K, pricePerGram24K, now]
  );

  // Also store the raw data for reference
  await db.run(
    `INSERT OR REPLACE INTO price_cache (symbol, price, currency, fetched_at)
    VALUES (?, ?, 'USD', CURRENT_TIMESTAMP)`,
    [metal === 'gold' ? 'GC=F' : 'SI=F', metalPriceUSD]
  );

  await db.run(
    `INSERT OR REPLACE INTO price_cache (symbol, price, currency, fetched_at)
    VALUES ('USDINR=X', ?, 'INR', CURRENT_TIMESTAMP)`,
    [usdToInr]
  );

  return await getCachedPrice(metal);
}

// Calculate purity prices
function getPurityPrices(pricePerGram24K, metal = 'gold') {
  const factors = metal === 'gold' ? GOLD_PURITY_FACTORS : SILVER_PURITY_FACTORS;
  return Object.fromEntries(
    Object.entries(factors).map(([purity, factor]) => [
      purity,
      Math.round(pricePerGram24K * factor * 100) / 100
    ])
  );
}

// GET /api/metals/price/:metal - Get metal price (gold/silver)
router.get('/price/:metal', authenticateToken, async (req, res) => {
  try {
    const { metal } = req.params;

    if (!['gold', 'silver'].includes(metal)) {
      return res.status(400).json({ error: 'Invalid metal. Use "gold" or "silver"' });
    }

    // Check if we should auto-fetch new price
    if (await shouldFetchNewPrice(metal)) {
      try {
        const freshData = await fetchMetalPriceINR(metal);
        const saved = await savePrice(metal, freshData.pricePerGram24K, freshData.metalPriceUSD, freshData.usdToInr);

        return res.json({
          metal,
          pricePerGram24K: freshData.pricePerGram24K,
          purityPrices: getPurityPrices(freshData.pricePerGram24K, metal),
          currency: 'INR',
          fetchedAt: saved.fetched_at,
          source: 'yahoo_finance',
          calculation: freshData.calculation,
          isAutoFetch: true
        });
      } catch (fetchError) {
        console.error(`[Metals] Failed to fetch fresh ${metal} price:`, fetchError.message);
        // Fall back to cached price
      }
    }

    // Return cached price
    const cached = await getCachedPrice(metal);

    if (!cached) {
      // No cached price - try to fetch
      try {
        const freshData = await fetchMetalPriceINR(metal);
        const saved = await savePrice(metal, freshData.pricePerGram24K, freshData.metalPriceUSD, freshData.usdToInr);

        return res.json({
          metal,
          pricePerGram24K: freshData.pricePerGram24K,
          purityPrices: getPurityPrices(freshData.pricePerGram24K, metal),
          currency: 'INR',
          fetchedAt: saved.fetched_at,
          source: 'yahoo_finance',
          calculation: freshData.calculation,
          isAutoFetch: true
        });
      } catch (fetchError) {
        return res.status(404).json({
          error: 'No price data available. Please try refreshing.',
          details: fetchError.message
        });
      }
    }

    res.json({
      metal,
      pricePerGram24K: cached.price_per_gram_24k,
      purityPrices: getPurityPrices(cached.price_per_gram_24k, metal),
      currency: 'INR',
      fetchedAt: cached.fetched_at,
      source: 'cached',
    });
  } catch (error) {
    console.error('[Metals] Price fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/metals/price/:metal/refresh - Force refresh price
router.post('/price/:metal/refresh', authenticateToken, async (req, res) => {
  try {
    const { metal } = req.params;

    if (!['gold', 'silver'].includes(metal)) {
      return res.status(400).json({ error: 'Invalid metal. Use "gold" or "silver"' });
    }

    const freshData = await fetchMetalPriceINR(metal);
    const saved = await savePrice(metal, freshData.pricePerGram24K, freshData.metalPriceUSD, freshData.usdToInr);

    res.json({
      metal,
      pricePerGram24K: freshData.pricePerGram24K,
      purityPrices: getPurityPrices(freshData.pricePerGram24K, metal),
      currency: 'INR',
      fetchedAt: saved.fetched_at,
      source: 'yahoo_finance',
      calculation: freshData.calculation,
      message: 'Price refreshed successfully from Yahoo Finance'
    });
  } catch (error) {
    console.error('[Metals] Price refresh error:', error);
    res.status(500).json({ error: `Failed to refresh price: ${error.message}` });
  }
});

// GET /api/metals/calculate - Calculate value based on weight and purity
router.get('/calculate', authenticateToken, async (req, res) => {
  try {
    const { metal = 'gold', weight, purity } = req.query;

    if (!weight || isNaN(parseFloat(weight))) {
      return res.status(400).json({ error: 'Valid weight in grams is required' });
    }

    const purityFactors = metal === 'gold' ? GOLD_PURITY_FACTORS : SILVER_PURITY_FACTORS;
    const defaultPurity = metal === 'gold' ? '24K' : '999';
    const selectedPurity = purity || defaultPurity;

    if (!purityFactors[selectedPurity]) {
      return res.status(400).json({
        error: `Invalid purity for ${metal}. Valid options: ${Object.keys(purityFactors).join(', ')}`
      });
    }

    const cached = await getCachedPrice(metal);

    if (!cached) {
      return res.status(404).json({ error: 'No price data available. Please refresh the price first.' });
    }

    const weightGrams = parseFloat(weight);
    const purityFactor = purityFactors[selectedPurity];
    // Round price per gram first for consistency with displayed formula
    const pricePerGram = Math.round(cached.price_per_gram_24k * purityFactor * 100) / 100;
    const totalValue = Math.round(weightGrams * pricePerGram);

    res.json({
      metal,
      weight: weightGrams,
      purity: selectedPurity,
      purityFactor,
      pricePerGram24K: cached.price_per_gram_24k,
      pricePerGram,
      totalValue,
      currency: 'INR',
      fetchedAt: cached.fetched_at,
      calculation: `${weightGrams}g × ₹${pricePerGram.toFixed(2)}/g = ₹${totalValue}`
    });
  } catch (error) {
    console.error('[Metals] Calculate error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/metals/rates - Get current raw rates (for debugging)
router.get('/rates', authenticateToken, async (req, res) => {
  try {
    const goldFutures = await fetchYahooPrice(SYMBOLS.gold);
    const silverFutures = await fetchYahooPrice(SYMBOLS.silver);
    const usdInr = await fetchYahooPrice(SYMBOLS.usdInr);

    const goldInternational = (goldFutures.price * usdInr.price) / TROY_OUNCE_TO_GRAMS;
    const silverInternational = (silverFutures.price * usdInr.price) / TROY_OUNCE_TO_GRAMS;
    const goldIndiaRetail = goldInternational * INDIA_PREMIUM.gold;
    const silverIndiaRetail = silverInternational * INDIA_PREMIUM.silver;

    res.json({
      raw: {
        goldFutures: {
          symbol: SYMBOLS.gold,
          price: goldFutures.price,
          currency: 'USD',
          unit: 'per troy ounce'
        },
        silverFutures: {
          symbol: SYMBOLS.silver,
          price: silverFutures.price,
          currency: 'USD',
          unit: 'per troy ounce'
        },
        usdToInr: {
          symbol: SYMBOLS.usdInr,
          rate: usdInr.price
        }
      },
      converted: {
        gold: {
          international24K: Math.round(goldInternational * 100) / 100,
          indiaRetail24K: Math.round(goldIndiaRetail * 100) / 100,
          indiaRetail22K: Math.round(goldIndiaRetail * GOLD_PURITY_FACTORS['22K'] * 100) / 100,
          premium: `${((INDIA_PREMIUM.gold - 1) * 100).toFixed(1)}%`
        },
        silver: {
          international999: Math.round(silverInternational * 100) / 100,
          indiaRetail999: Math.round(silverIndiaRetail * 100) / 100,
          premium: `${((INDIA_PREMIUM.silver - 1) * 100).toFixed(1)}%`
        }
      },
      constants: {
        troyOunceToGrams: TROY_OUNCE_TO_GRAMS,
        indiaPremium: INDIA_PREMIUM,
        goldPurityFactors: GOLD_PURITY_FACTORS,
        silverPurityFactors: SILVER_PURITY_FACTORS
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Metals] Rates fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/metals/seed - Seed price manually (for testing)
router.post('/seed', authenticateToken, async (req, res) => {
  try {
    const { metal = 'gold', pricePerGram24K } = req.body;

    if (!pricePerGram24K || isNaN(parseFloat(pricePerGram24K))) {
      return res.status(400).json({ error: 'Valid pricePerGram24K is required' });
    }

    const saved = await savePrice(metal, parseFloat(pricePerGram24K), 0, 0);

    res.json({
      message: 'Price seeded successfully',
      metal,
      pricePerGram24K: saved.price_per_gram_24k,
      purityPrices: getPurityPrices(saved.price_per_gram_24k, metal),
      fetchedAt: saved.fetched_at,
    });
  } catch (error) {
    console.error('[Metals] Seed error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
