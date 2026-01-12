import express from 'express';
import db from '../db/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Cache duration in milliseconds (15 minutes)
const CACHE_DURATION = 15 * 60 * 1000;

// Fetch stock/ETF price from Yahoo Finance
async function fetchYahooPrice(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance API error: ${response.status}`);
    }

    const data = await response.json();
    const result = data.chart.result?.[0];

    if (!result) {
      throw new Error('No data found for symbol');
    }

    const price = result.meta.regularMarketPrice;
    const currency = result.meta.currency;
    const previousClose = result.meta.previousClose;

    return {
      symbol,
      price,
      currency,
      previousClose,
      change: price - previousClose,
      changePercent: ((price - previousClose) / previousClose) * 100
    };
  } catch (error) {
    console.error(`Error fetching Yahoo price for ${symbol}:`, error.message);
    return null;
  }
}

// Fetch mutual fund NAV from AMFI
async function fetchMutualFundNAV(schemeCode) {
  try {
    const url = `https://api.mfapi.in/mf/${schemeCode}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`AMFI API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.data || data.data.length === 0) {
      throw new Error('No NAV data found');
    }

    const latestNAV = data.data[0];

    return {
      symbol: schemeCode,
      name: data.meta.scheme_name,
      price: parseFloat(latestNAV.nav),
      currency: 'INR',
      date: latestNAV.date
    };
  } catch (error) {
    console.error(`Error fetching MF NAV for ${schemeCode}:`, error.message);
    return null;
  }
}

// Check cache for price
function getCachedPrice(symbol) {
  const cached = db.prepare(`
    SELECT * FROM price_cache WHERE symbol = ?
  `).get(symbol);

  if (cached) {
    const age = Date.now() - new Date(cached.fetched_at).getTime();
    if (age < CACHE_DURATION) {
      return cached;
    }
  }
  return null;
}

// Save price to cache
function cachePrice(symbol, price, currency = 'INR') {
  db.prepare(`
    INSERT OR REPLACE INTO price_cache (symbol, price, currency, fetched_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  `).run(symbol, price, currency);
}

// Search stocks by company name using Yahoo Finance
router.get('/search/stocks', authenticateToken, async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=15&newsCount=0&listsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance search error: ${response.status}`);
    }

    const data = await response.json();

    // Filter for Indian stocks (NSE/BSE) and format results
    const stocks = (data.quotes || [])
      .filter(q => q.quoteType === 'EQUITY' && (q.exchange === 'NSI' || q.exchange === 'BSE' || q.symbol?.endsWith('.NS') || q.symbol?.endsWith('.BO')))
      .map(q => ({
        symbol: q.symbol,
        name: q.longname || q.shortname,
        exchange: q.symbol?.endsWith('.NS') ? 'NSE' : 'BSE',
        type: 'STOCK'
      }))
      .slice(0, 10);

    res.json({ stocks });
  } catch (error) {
    console.error('Error searching stocks:', error);
    res.status(500).json({ error: 'Failed to search stocks' });
  }
});

// Cache for mutual fund list
let mfListCache = null;
let mfListCacheTime = 0;
const MF_LIST_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Search mutual funds by name
router.get('/search/mf', authenticateToken, async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 3) {
      return res.status(400).json({ error: 'Search query must be at least 3 characters' });
    }

    // Check if we have a cached list
    const now = Date.now();
    if (!mfListCache || (now - mfListCacheTime) > MF_LIST_CACHE_DURATION) {
      console.log('Fetching fresh mutual fund list...');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      try {
        const response = await fetch('https://api.mfapi.in/mf', {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`MFAPI returned ${response.status}`);
        }

        mfListCache = await response.json();
        mfListCacheTime = now;
        console.log(`Cached ${mfListCache.length} mutual funds`);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          console.error('MFAPI request timed out');
          return res.status(504).json({ error: 'Mutual fund API timed out. Please try again.' });
        }
        throw fetchError;
      }
    }

    if (!mfListCache || !Array.isArray(mfListCache)) {
      return res.status(503).json({ error: 'Mutual fund data not available' });
    }

    const searchLower = q.toLowerCase();
    const filtered = mfListCache
      .filter(f => f.schemeName && f.schemeName.toLowerCase().includes(searchLower))
      .slice(0, 20);

    res.json({ funds: filtered });
  } catch (error) {
    console.error('Error searching mutual funds:', error);
    res.status(500).json({ error: 'Failed to search mutual funds' });
  }
});

// Bulk price fetch
router.post('/bulk', authenticateToken, async (req, res) => {
  try {
    const { symbols } = req.body; // Array of { symbol, type }

    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({ error: 'symbols array is required' });
    }

    const results = {};

    for (const item of symbols) {
      const { symbol, type } = item;

      // Check cache first
      const cached = getCachedPrice(symbol);
      if (cached) {
        results[symbol] = { price: cached.price, currency: cached.currency, cached: true };
        continue;
      }

      let priceData = null;

      if (type === 'mf') {
        priceData = await fetchMutualFundNAV(symbol);
      } else {
        priceData = await fetchYahooPrice(symbol);
      }

      if (priceData) {
        cachePrice(symbol, priceData.price, priceData.currency);
        results[symbol] = { price: priceData.price, currency: priceData.currency, cached: false };
      } else {
        results[symbol] = { error: 'Price not found' };
      }
    }

    res.json({ prices: results });
  } catch (error) {
    console.error('Error fetching bulk prices:', error);
    res.status(500).json({ error: 'Failed to fetch prices' });
  }
});

// Get price for a symbol (must be last - catches all)
router.get('/:symbol', authenticateToken, async (req, res) => {
  try {
    const { symbol } = req.params;
    const { type } = req.query; // 'stock', 'mf', or 'crypto'

    // Check cache first
    const cached = getCachedPrice(symbol);
    if (cached) {
      return res.json({ price: cached, cached: true });
    }

    let priceData = null;

    if (type === 'mf') {
      priceData = await fetchMutualFundNAV(symbol);
    } else {
      // Default to Yahoo Finance for stocks/ETFs
      priceData = await fetchYahooPrice(symbol);
    }

    if (!priceData) {
      return res.status(404).json({ error: 'Price not found for symbol' });
    }

    // Cache the price
    cachePrice(symbol, priceData.price, priceData.currency);

    res.json({ price: priceData, cached: false });
  } catch (error) {
    console.error('Error fetching price:', error);
    res.status(500).json({ error: 'Failed to fetch price' });
  }
});

export default router;
