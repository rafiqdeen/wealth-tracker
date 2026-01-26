import express from 'express';
import dns from 'dns';
import db from '../db/database.js';
import { authenticateToken } from '../middleware/auth.js';

// Force IPv4 first to avoid IPv6 connection issues
dns.setDefaultResultOrder('ipv4first');

const router = express.Router();

// Cache duration in milliseconds (30 minutes - balances freshness vs API limits)
const CACHE_DURATION = 30 * 60 * 1000;

// Fetch stock/ETF price from Yahoo Finance with timeout and retry
// Returns comprehensive price data including previousClose for holiday handling
async function fetchYahooPrice(symbol, retries = 2) {
  let rateLimitRetries = 0;
  const maxRateLimitRetries = 3; // Max 3 rate limit retries

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      });
      clearTimeout(timeoutId);

      // Handle rate limiting (429) with max retries
      if (response.status === 429) {
        rateLimitRetries++;
        if (rateLimitRetries > maxRateLimitRetries) {
          return null;
        }
        const retryAfter = Math.min(response.headers.get('Retry-After') || (rateLimitRetries) * 5, 15);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        continue; // Retry without counting this attempt
      }

      if (!response.ok) {
        throw new Error(`Yahoo Finance API error: ${response.status}`);
      }

      const data = await response.json();
      const result = data.chart.result?.[0];

      if (!result) {
        throw new Error('No data found for symbol');
      }

      const meta = result.meta;
      const regularMarketPrice = meta.regularMarketPrice;
      const previousClose = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPreviousClose;
      const currency = meta.currency;
      const regularMarketTime = meta.regularMarketTime; // Unix timestamp of last trade

      // Determine if price is from today or stale (holiday/weekend)
      const lastTradeDate = regularMarketTime ? new Date(regularMarketTime * 1000) : null;
      const today = new Date();
      const isToday = lastTradeDate &&
        lastTradeDate.toDateString() === today.toDateString();

      // Use regularMarketPrice if available and recent, otherwise use previousClose
      // This handles holidays where regularMarketPrice might be stale
      const effectivePrice = regularMarketPrice || previousClose;

      // Calculate change (only meaningful when market is trading)
      const change = previousClose ? effectivePrice - previousClose : 0;
      const changePercent = previousClose ? ((effectivePrice - previousClose) / previousClose) * 100 : 0;

      // Get price date (the trading day this price is from)
      const priceDate = lastTradeDate
        ? lastTradeDate.toISOString().split('T')[0]
        : today.toISOString().split('T')[0];

      return {
        symbol,
        price: effectivePrice,
        regularMarketPrice,
        previousClose,
        currency,
        change,
        changePercent,
        priceDate,
        lastTradeTime: regularMarketTime,
        isLive: isToday,
        priceType: isToday ? 'LIVE' : 'LAST_CLOSE'
      };
    } catch (error) {
      clearTimeout(timeoutId);

      const isLastAttempt = attempt === retries;
      const errorType = error.name === 'AbortError' ? 'timeout' : error.message;

      if (isLastAttempt) {
        console.error(`Error fetching Yahoo price for ${symbol}: ${errorType}`);
        return null;
      }

      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }
  return null;
}

// Fetch mutual fund NAV from AMFI with timeout
// MF NAVs update once daily, typically by 11 PM IST
async function fetchMutualFundNAV(schemeCode) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

  try {
    const url = `https://api.mfapi.in/mf/${schemeCode}`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`AMFI API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.data || data.data.length === 0) {
      throw new Error('No NAV data found');
    }

    const latestNAV = data.data[0];
    const previousNAV = data.data[1]; // Previous day's NAV for change calculation

    const currentNav = parseFloat(latestNAV.nav);
    const prevNav = previousNAV ? parseFloat(previousNAV.nav) : currentNav;

    // Calculate change from previous NAV
    const change = prevNav ? currentNav - prevNav : 0;
    const changePercent = prevNav ? ((currentNav - prevNav) / prevNav) * 100 : 0;

    // Parse NAV date (format: DD-MM-YYYY)
    const navDateParts = latestNAV.date.split('-');
    const priceDate = navDateParts.length === 3
      ? `${navDateParts[2]}-${navDateParts[1]}-${navDateParts[0]}`  // Convert to YYYY-MM-DD
      : latestNAV.date;

    return {
      symbol: schemeCode,
      name: data.meta.scheme_name,
      price: currentNav,
      previousClose: prevNav,
      currency: 'INR',
      change,
      changePercent,
      priceDate,
      navDate: latestNAV.date,
      priceType: 'NAV',
      isLive: false // MF NAVs are always end-of-day
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const errorType = error.name === 'AbortError' ? 'timeout' : error.message;
    console.error(`Error fetching MF NAV for ${schemeCode}: ${errorType}`);
    return null;
  }
}

// Check cache for price (respects cache duration during market hours)
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

// Get cached price regardless of age (for use outside market hours)
// Returns complete price data including previousClose for P&L calculation
function getAnyCachedPrice(symbol) {
  return db.prepare(`
    SELECT * FROM price_cache WHERE symbol = ?
  `).get(symbol);
}

// BATCH: Get multiple cached prices in one query (much faster than individual lookups)
function getBulkCachedPrices(symbols) {
  if (!symbols || symbols.length === 0) return {};

  const placeholders = symbols.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT * FROM price_cache WHERE symbol IN (${placeholders})
  `).all(...symbols);

  // Convert to map for O(1) lookup
  return rows.reduce((acc, row) => {
    acc[row.symbol] = row;
    return acc;
  }, {});
}

// Save comprehensive price data to cache
// Stores price, previousClose, change data for proper holiday handling
function cachePrice(symbol, priceData, marketOpen = true) {
  const {
    price,
    previousClose = null,
    change = 0,
    changePercent = 0,
    currency = 'INR',
    priceDate = new Date().toISOString().split('T')[0]
  } = typeof priceData === 'object' ? priceData : { price: priceData };

  db.prepare(`
    INSERT OR REPLACE INTO price_cache
    (symbol, price, previous_close, change_amount, change_percent, currency, price_date, market_open, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    symbol,
    price,
    previousClose,
    change,
    changePercent,
    currency,
    priceDate,
    marketOpen ? 1 : 0
  );
}

// Get effective price for display (handles holidays properly)
// Returns price with proper change data even on holidays
function getEffectivePrice(cached, marketStatus) {
  if (!cached) return null;

  // On holidays/weekends, use cached price but change is 0 for the day
  // The cached change_percent reflects last trading day's movement
  const isMarketOpen = marketStatus?.isOpen ?? false;

  return {
    price: cached.price,
    previousClose: cached.previous_close,
    change: isMarketOpen ? cached.change_amount : 0,
    changePercent: isMarketOpen ? cached.change_percent : 0,
    // Store the actual last change for reference
    lastChange: cached.change_amount,
    lastChangePercent: cached.change_percent,
    currency: cached.currency,
    priceDate: cached.price_date,
    fetchedAt: cached.fetched_at,
    cached: true,
    priceType: isMarketOpen ? 'CACHED' : 'LAST_CLOSE'
  };
}

// Cache for market status (check once per minute max)
let marketStatusCache = { status: null, checkedAt: 0 };
const MARKET_STATUS_CACHE_DURATION = 60 * 1000; // 1 minute

/**
 * Check if Indian stock market is currently open by querying NIFTY index
 * Uses actual market data - no holiday list maintenance needed
 * Returns: { isOpen, reason, istTime, lastTradeTime }
 */
async function checkMarketStatus() {
  // Return cached status if recent
  const now = Date.now();
  if (marketStatusCache.status && (now - marketStatusCache.checkedAt) < MARKET_STATUS_CACHE_DURATION) {
    return marketStatusCache.status;
  }

  // Get current IST time
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now + istOffset + new Date().getTimezoneOffset() * 60 * 1000);
  const timeStr = istTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const day = istTime.getDay();

  // Quick weekend check (no API call needed)
  if (day === 0 || day === 6) {
    const status = { isOpen: false, reason: 'Weekend', istTime: timeStr };
    marketStatusCache = { status, checkedAt: now };
    return status;
  }

  // Market hours: 9:15 AM to 3:30 PM IST
  const hours = istTime.getHours();
  const minutes = istTime.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  const marketOpen = 9 * 60 + 15;
  const marketClose = 15 * 60 + 30;

  // Outside market hours - no API call needed
  if (timeInMinutes < marketOpen) {
    const status = { isOpen: false, reason: 'Pre-market', istTime: timeStr };
    marketStatusCache = { status, checkedAt: now };
    return status;
  }

  if (timeInMinutes > marketClose) {
    const status = { isOpen: false, reason: 'After-hours', istTime: timeStr };
    marketStatusCache = { status, checkedAt: now };
    return status;
  }

  // During market hours - check if market is actually trading (handles holidays)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=1m&range=1d',
      {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        }
      }
    );
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const meta = data.chart.result?.[0]?.meta;

      if (meta?.regularMarketTime) {
        // Convert last trade timestamp to IST
        const lastTradeTime = new Date(meta.regularMarketTime * 1000);
        const lastTradeIST = new Date(lastTradeTime.getTime() + istOffset + lastTradeTime.getTimezoneOffset() * 60 * 1000);

        // Check if last trade was today and recent (within 15 mins)
        const sameDay = lastTradeIST.toDateString() === istTime.toDateString();
        const minutesSinceLastTrade = (istTime - lastTradeIST) / (1000 * 60);

        if (sameDay && minutesSinceLastTrade < 15) {
          const status = { isOpen: true, reason: 'Market open', istTime: timeStr, lastTradeTime: lastTradeIST.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) };
          marketStatusCache = { status, checkedAt: now };
          return status;
        } else {
          // Market should be open but no recent trades = holiday or technical issue
          const status = { isOpen: false, reason: 'Market Holiday', istTime: timeStr };
          marketStatusCache = { status, checkedAt: now };
          return status;
        }
      }
    }
  } catch (error) {
    // Status check failed, assuming open during market hours
  }

  // Default to open if we can't determine (during market hours)
  const status = { isOpen: true, reason: 'Market open', istTime: timeStr };
  marketStatusCache = { status, checkedAt: now };
  return status;
}

// Get market status
router.get('/market-status', authenticateToken, async (req, res) => {
  const status = await checkMarketStatus();
  res.json(status);
});

// Search stocks by company name using Yahoo Finance
router.get('/search/stocks', authenticateToken, async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 3) {
      return res.status(400).json({ error: 'Search query must be at least 3 characters' });
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

// Clear price cache (requires confirmation)
// Note: Price cache is shared across all users for efficiency
router.delete('/cache', authenticateToken, (req, res) => {
  try {
    const { confirm } = req.query;

    // Require explicit confirmation since this affects shared cache
    if (confirm !== 'true') {
      return res.status(400).json({
        error: 'Cache clear requires confirmation. Add ?confirm=true to proceed.',
        warning: 'This clears the shared price cache and will cause fresh API calls for all users.'
      });
    }

    const result = db.prepare('DELETE FROM price_cache').run();
    res.json({
      success: true,
      message: 'Price cache cleared',
      entriesDeleted: result.changes
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// Helper to process items in batches with concurrency limit
async function processBatch(items, processor, concurrency = 3, delayMs = 200) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);

    // Add delay between batches to avoid rate limiting
    if (i + concurrency < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return results;
}

// Bulk price fetch - with proper holiday handling
// Returns prices with correct P&L data even on holidays/weekends
// CRITICAL: Never returns error objects - always returns a price if any cache exists
router.post('/bulk', authenticateToken, async (req, res) => {
  try {
    const { symbols, forceRefresh } = req.body;

    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({ error: 'symbols array is required' });
    }

    const market = await checkMarketStatus();
    const results = {};
    const toFetch = [];

    // OPTIMIZATION: Batch fetch all cached prices in ONE query instead of N queries
    const allSymbols = symbols.map(s => s.symbol);
    const cachedPrices = getBulkCachedPrices(allSymbols);

    // First pass: process all symbols using cached data
    for (const item of symbols) {
      const { symbol, type } = item;
      const cached = cachedPrices[symbol];

      // Skip cache entirely if force refresh requested
      if (forceRefresh) {
        toFetch.push({ symbol, type, fallbackCache: cached });
        continue;
      }

      // During market hours: check cache freshness
      if (market.isOpen) {
        if (cached) {
          const age = Date.now() - new Date(cached.fetched_at).getTime();
          const isFresh = age < CACHE_DURATION;

          if (isFresh && cached.price) {
            results[symbol] = {
              price: cached.price,
              previousClose: cached.previous_close,
              currency: cached.currency || 'INR',
              change: cached.change_amount || 0,
              changePercent: cached.change_percent || 0,
              lastChange: cached.change_amount || 0,
              lastChangePercent: cached.change_percent || 0,
              priceDate: cached.price_date,
              cached: true,
              priceType: 'CACHED',
              marketStatus: market.reason
            };
            continue;
          }
        }
        // Cache expired or missing - need to fetch
        toFetch.push({ symbol, type, fallbackCache: cached });
        continue;
      }

      // Outside market hours: ALWAYS use cached price if available (no fetching needed)
      if (cached && cached.price) {
        results[symbol] = {
          price: cached.price,
          previousClose: cached.previous_close,
          currency: cached.currency || 'INR',
          change: 0,
          changePercent: 0,
          lastChange: cached.change_amount || 0,
          lastChangePercent: cached.change_percent || 0,
          priceDate: cached.price_date,
          cached: true,
          priceType: 'LAST_CLOSE',
          marketStatus: market.reason
        };
        continue;
      }

      // No cache at all - need to fetch
      toFetch.push({ symbol, type, fallbackCache: null });
    }

    // Second pass: fetch uncached/stale prices
    if (toFetch.length > 0) {
      const isMarketClosed = !market.isOpen;

      // IMPORTANT: When market is closed, DON'T fetch - just mark as unavailable
      // This prevents slow responses due to API timeouts on holidays
      if (isMarketClosed) {
        for (const { symbol, fallbackCache } of toFetch) {
          if (fallbackCache && fallbackCache.price) {
            results[symbol] = {
              price: fallbackCache.price,
              previousClose: fallbackCache.previous_close,
              currency: fallbackCache.currency || 'INR',
              change: 0,
              changePercent: 0,
              lastChange: fallbackCache.change_amount || 0,
              lastChangePercent: fallbackCache.change_percent || 0,
              priceDate: fallbackCache.price_date,
              cached: true,
              stale: true,
              priceType: 'FALLBACK',
              marketStatus: market.reason
            };
          } else {
            results[symbol] = {
              price: null,
              unavailable: true,
              reason: 'No cached price (market closed)',
              marketStatus: market.reason
            };
          }
        }
      } else {
        // Market is open - fetch fresh prices
        const fetchResults = await processBatch(toFetch, async (item) => {
          const { symbol, type, fallbackCache } = item;
          let priceData = null;

          try {
            if (type === 'mf') {
              priceData = await fetchMutualFundNAV(symbol);
            } else {
              priceData = await fetchYahooPrice(symbol);
            }
          } catch (fetchError) {
            console.error(`[Price] Fetch error for ${symbol}:`, fetchError.message);
          }

          return { symbol, priceData, fallbackCache };
        }, 2, 500);

        for (const { symbol, priceData, fallbackCache } of fetchResults) {
          if (priceData && priceData.price) {
            cachePrice(symbol, priceData, true);
            results[symbol] = {
              price: priceData.price,
              previousClose: priceData.previousClose,
              currency: priceData.currency || 'INR',
              change: priceData.change || 0,
              changePercent: priceData.changePercent || 0,
              lastChange: priceData.change || 0,
              lastChangePercent: priceData.changePercent || 0,
              priceDate: priceData.priceDate,
              cached: false,
              priceType: priceData.priceType || 'LIVE',
              marketStatus: market.reason
            };
          } else if (fallbackCache && fallbackCache.price) {
            results[symbol] = {
              price: fallbackCache.price,
              previousClose: fallbackCache.previous_close,
              currency: fallbackCache.currency || 'INR',
              change: fallbackCache.change_amount || 0,
              changePercent: fallbackCache.change_percent || 0,
              lastChange: fallbackCache.change_amount || 0,
              lastChangePercent: fallbackCache.change_percent || 0,
              priceDate: fallbackCache.price_date,
              cached: true,
              stale: true,
              priceType: 'FALLBACK',
              marketStatus: market.reason
            };
          } else {
            results[symbol] = {
              price: null,
              unavailable: true,
              reason: 'Price fetch failed',
              marketStatus: market.reason
            };
          }
        }
      }
    }

    res.json({ prices: results, marketStatus: market });
  } catch (error) {
    console.error('Error fetching bulk prices:', error);
    res.status(500).json({ error: 'Failed to fetch prices' });
  }
});

// Get price for a symbol (must be last - catches all)
// Returns price with proper handling for holidays/weekends
router.get('/:symbol', authenticateToken, async (req, res) => {
  try {
    const { symbol } = req.params;
    const { type } = req.query; // 'stock', 'mf', or 'crypto'

    const market = await checkMarketStatus();

    // Check cache - use any cached price outside market hours
    const cached = market.isOpen ? getCachedPrice(symbol) : getAnyCachedPrice(symbol);
    if (cached) {
      // Return cached data with proper structure
      const priceResponse = {
        price: cached.price,
        previousClose: cached.previous_close,
        currency: cached.currency || 'INR',
        change: market.isOpen ? (cached.change_amount || 0) : 0,
        changePercent: market.isOpen ? (cached.change_percent || 0) : 0,
        lastChange: cached.change_amount || 0,
        lastChangePercent: cached.change_percent || 0,
        priceDate: cached.price_date,
        priceType: market.isOpen ? 'CACHED' : 'LAST_CLOSE'
      };
      return res.json({ price: priceResponse, cached: true, marketStatus: market });
    }

    // Fetch fresh price
    let priceData = null;

    if (type === 'mf') {
      priceData = await fetchMutualFundNAV(symbol);
    } else {
      // Default to Yahoo Finance for stocks/ETFs
      priceData = await fetchYahooPrice(symbol);
    }

    if (!priceData) {
      return res.status(404).json({ error: 'Price not found for symbol', marketStatus: market });
    }

    // Cache with full price data
    cachePrice(symbol, priceData, market.isOpen);

    // Prepare response (adjust change to 0 if market closed)
    const priceResponse = {
      price: priceData.price,
      previousClose: priceData.previousClose,
      currency: priceData.currency || 'INR',
      change: market.isOpen ? (priceData.change || 0) : 0,
      changePercent: market.isOpen ? (priceData.changePercent || 0) : 0,
      lastChange: priceData.change || 0,
      lastChangePercent: priceData.changePercent || 0,
      priceDate: priceData.priceDate,
      priceType: priceData.priceType || (market.isOpen ? 'LIVE' : 'LAST_CLOSE')
    };

    res.json({ price: priceResponse, cached: false, marketStatus: market });
  } catch (error) {
    console.error('Error fetching price:', error);
    res.status(500).json({ error: 'Failed to fetch price' });
  }
});

export default router;
