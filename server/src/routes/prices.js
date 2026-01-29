import express from 'express';
import dns from 'dns';
import db from '../db/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { fetchPriceWithFallback, getCircuitBreakerStates, resetCircuitBreaker, resetAllCircuitBreakers } from '../services/priceProviders.js';
import { getSyncStatus, triggerManualSync, updateSymbolPriority, getRecentSyncJobs } from '../services/priceSync.js';

// Force IPv4 first to avoid IPv6 connection issues
dns.setDefaultResultOrder('ipv4first');

const router = express.Router();

// Modern browser User-Agent strings for rotation (from yfinance PR #2277)
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:134.0) Gecko/20100101 Firefox/134.0',
  'Mozilla/5.0 (X11; Linux x86_64; rv:134.0) Gecko/20100101 Firefox/134.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0',
];

// Get random User-Agent
function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Smart cache durations based on market status
// Market open: 15 min (prices change frequently)
// Market closed: 12 hours (prices don't change)
// Mutual funds: 24 hours (NAV updates once daily)
const CACHE_DURATION_MARKET_OPEN = 15 * 60 * 1000;      // 15 minutes
const CACHE_DURATION_MARKET_CLOSED = 12 * 60 * 60 * 1000; // 12 hours
const CACHE_DURATION_MUTUAL_FUND = 24 * 60 * 60 * 1000;   // 24 hours

/**
 * Get appropriate cache duration based on asset type and market status
 */
function getCacheDuration(symbol, isMarketOpen) {
  // Mutual funds use MFAPI and update NAV once daily
  const isMutualFund = !symbol.includes('.NS') && !symbol.includes('.BO');

  if (isMutualFund) {
    return CACHE_DURATION_MUTUAL_FUND;
  }

  return isMarketOpen ? CACHE_DURATION_MARKET_OPEN : CACHE_DURATION_MARKET_CLOSED;
}

/**
 * Check if cached price is still valid
 */
function isCacheValid(cached, symbol, isMarketOpen) {
  if (!cached || !cached.fetched_at) return false;

  // Parse fetched_at as UTC (SQLite CURRENT_TIMESTAMP is UTC)
  const fetchedAtUTC = cached.fetched_at + 'Z';
  const cacheAge = Date.now() - new Date(fetchedAtUTC).getTime();
  const maxAge = getCacheDuration(symbol, isMarketOpen);

  return cacheAge < maxAge;
}

// Yahoo session management - cookie + crumb for bypassing rate limits
let yahooSession = {
  cookie: null,
  crumb: null,
  fetchedAt: 0
};
const YAHOO_SESSION_DURATION = 30 * 60 * 1000; // 30 minutes

// Lock to prevent multiple concurrent session fetches
let sessionFetchPromise = null;

async function getYahooSession() {
  const now = Date.now();

  // Return cached session if still valid
  if (yahooSession.cookie && yahooSession.crumb && (now - yahooSession.fetchedAt) < YAHOO_SESSION_DURATION) {
    return yahooSession;
  }

  // If already fetching, wait for that result
  if (sessionFetchPromise) {
    return sessionFetchPromise;
  }

  // Start new fetch
  sessionFetchPromise = (async () => {
    try {
      // Get A3 cookie from fc.yahoo.com
      const fcRes = await fetch('https://fc.yahoo.com/', {
        redirect: 'manual',
        headers: {
          'User-Agent': getRandomUserAgent()
        }
      });

      const cookies = fcRes.headers.getSetCookie();
      const a3Cookie = cookies.find(c => c.startsWith('A3='));

      if (!a3Cookie) {
        console.log('[Yahoo] Failed to get A3 cookie');
        return yahooSession.cookie ? yahooSession : null; // Return existing if any
      }

      const cookieStr = a3Cookie.split(';')[0];

      // Small delay before crumb request
      await new Promise(r => setTimeout(r, 500));

      // Get crumb using the cookie
      const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Cookie': cookieStr
        }
      });

      if (!crumbRes.ok) {
        console.log('[Yahoo] Failed to get crumb:', crumbRes.status);
        return yahooSession.cookie ? yahooSession : null; // Return existing if any
      }

      const crumb = await crumbRes.text();

      // Cache the session
      yahooSession = {
        cookie: cookieStr,
        crumb: crumb,
        fetchedAt: now
      };

      console.log('[Yahoo] Session established successfully');
      return yahooSession;
    } catch (error) {
      console.error('[Yahoo] Session error:', error.message);
      return yahooSession.cookie ? yahooSession : null;
    } finally {
      sessionFetchPromise = null;
    }
  })();

  return sessionFetchPromise;
}

// Fetch stock/ETF price from Yahoo Finance with timeout and retry
// Uses cookie + crumb for bypassing rate limits
async function fetchYahooPrice(symbol, retries = 2) {
  let rateLimitRetries = 0;
  const maxRateLimitRetries = 4; // More retries for rate limiting

  // Get session with cookie + crumb
  const session = await getYahooSession();

  // Add random initial delay to avoid pattern detection (100-500ms)
  const initialDelay = 100 + Math.random() * 400;
  await new Promise(r => setTimeout(r, initialDelay));

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout per request

    try {
      // Build URL with crumb if available
      let url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
      if (session?.crumb) {
        url += `&crumb=${encodeURIComponent(session.crumb)}`;
      }

      const userAgent = getRandomUserAgent();
      const headers = {
        'User-Agent': userAgent,
        'Accept': 'application/json,text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      };

      // Add cookie if available
      if (session?.cookie) {
        headers['Cookie'] = session.cookie;
      }

      const response = await fetch(url, {
        signal: controller.signal,
        headers
      });
      clearTimeout(timeoutId);

      // Handle rate limiting (429) with minimal retries
      if (response.status === 429) {
        rateLimitRetries++;
        console.log(`[Yahoo] ${symbol}: Rate limited (429), retry ${rateLimitRetries}/${maxRateLimitRetries}`);
        if (rateLimitRetries > maxRateLimitRetries) {
          console.log(`[Yahoo] ${symbol}: Max rate limit retries exceeded`);
          return null;
        }
        // Exponential backoff for rate limiting (3s, 6s, 12s)
        const retryAfter = 3 * Math.pow(2, rateLimitRetries - 1);
        console.log(`[Yahoo] ${symbol}: Waiting ${retryAfter}s before retry`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        continue;
      }

      if (!response.ok) {
        console.log(`[Yahoo] ${symbol}: HTTP ${response.status}`);
        throw new Error(`Yahoo Finance API error: ${response.status}`);
      }

      const data = await response.json();
      const result = data.chart.result?.[0];

      if (!result) {
        console.log(`[Yahoo] ${symbol}: No result in response - ${JSON.stringify(data.chart?.error || 'no error')}`);
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

      // Quick retry (500ms)
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  return null;
}

// Fetch mutual fund NAV from AMFI with timeout
// MF NAVs update once daily, typically by 11 PM IST
async function fetchMutualFundNAV(schemeCode) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout (aggressive for bulk)

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

// Get cached prices for multiple symbols
async function getBulkCachedPrices(symbols) {
  if (!symbols || symbols.length === 0) return {};

  const placeholders = symbols.map(() => '?').join(',');
  const rows = await db.all(
    `SELECT * FROM price_cache WHERE symbol IN (${placeholders})`,
    symbols
  );

  return rows.reduce((acc, row) => {
    acc[row.symbol] = row;
    return acc;
  }, {});
}

// Save price to cache (only successful fetches)
// source: 'live' (during market hours) or 'close' (after market hours)
async function cachePrice(symbol, priceData, source) {
  try {
    const {
      price,
      previousClose = null,
      change = 0,
      changePercent = 0,
      currency = 'INR'
    } = priceData;

    await db.run(
      `INSERT OR REPLACE INTO price_cache
      (symbol, price, previous_close, change_amount, change_percent, currency, source, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [symbol, price, previousClose, change, changePercent, currency, source]
    );
    console.log(`[Cache] Saved ${symbol} = ${price}`);
  } catch (error) {
    console.error(`[Cache] Error saving ${symbol}:`, error.message);
  }
}

// Get cached price for a symbol (for single symbol lookups)
async function getCachedPrice(symbol) {
  return await db.get(
    'SELECT * FROM price_cache WHERE symbol = ?',
    [symbol]
  );
}

// Get any cached price (ignores freshness - for market closed scenarios)
async function getAnyCachedPrice(symbol) {
  return await db.get(
    'SELECT * FROM price_cache WHERE symbol = ?',
    [symbol]
  );
}

// Format cached data for API response
function formatCachedPrice(cached) {
  // Parse fetched_at as UTC (SQLite CURRENT_TIMESTAMP is UTC)
  const fetchedAtUTC = cached.fetched_at ? cached.fetched_at + 'Z' : null;
  return {
    price: cached.price,
    previousClose: cached.previous_close,
    change: cached.change_amount || 0,
    changePercent: cached.change_percent || 0,
    currency: cached.currency || 'INR',
    source: cached.source || 'cached',
    fetchedAt: cached.fetched_at,
    cacheAge: fetchedAtUTC ? Math.round((Date.now() - new Date(fetchedAtUTC).getTime()) / 60000) : null
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
router.delete('/cache', authenticateToken, async (req, res) => {
  try {
    const { confirm } = req.query;

    // Require explicit confirmation since this affects shared cache
    if (confirm !== 'true') {
      return res.status(400).json({
        error: 'Cache clear requires confirmation. Add ?confirm=true to proceed.',
        warning: 'This clears the shared price cache and will cause fresh API calls for all users.'
      });
    }

    const result = await db.run('DELETE FROM price_cache', []);
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
// Optimized to avoid Yahoo rate limiting
async function processBatch(items, processor, concurrency = 5, delayMs = 100) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);

    // Add randomized delay between batches to avoid pattern detection
    if (i + concurrency < items.length) {
      const randomDelay = delayMs + Math.random() * 1000; // Add 0-1s random jitter
      await new Promise(resolve => setTimeout(resolve, randomDelay));
    }
  }
  return results;
}

// Bulk price fetch with smart caching
// Uses cache when valid (based on market hours and asset type)
// Only fetches from API when cache is stale or missing
router.post('/bulk', authenticateToken, async (req, res) => {
  try {
    const { symbols, forceRefresh } = req.body;

    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({ error: 'symbols array is required' });
    }

    // Get market status
    let market;
    try {
      market = await checkMarketStatus();
    } catch {
      market = { isOpen: false, reason: 'Status check failed' };
    }

    const results = {};
    const allSymbols = symbols.map(s => s.symbol);
    const symbolsToFetch = [];

    // Get all cached prices
    const cachedPrices = await getBulkCachedPrices(allSymbols);

    // First pass: check cache validity for each symbol
    for (const item of symbols) {
      const cached = cachedPrices[item.symbol];

      // Track symbol priority for background sync
      updateSymbolPriority(item.symbol);

      // Use cache if valid and not forcing refresh
      if (!forceRefresh && cached && isCacheValid(cached, item.symbol, market.isOpen)) {
        results[item.symbol] = formatCachedPrice(cached);
        console.log(`[Price] CACHE HIT: ${item.symbol} (age: ${Math.round((Date.now() - new Date(cached.fetched_at).getTime()) / 60000)}min)`);
      } else {
        symbolsToFetch.push(item);
      }
    }

    const cacheHits = Object.keys(results).length;
    const source = market.isOpen ? 'live' : 'close';

    console.log(`[Price] Market ${market.isOpen ? 'OPEN' : 'CLOSED'} - ${cacheHits} cache hits, ${symbolsToFetch.length} to fetch`);

    // Second pass: fetch symbols that need fresh data
    if (symbolsToFetch.length > 0) {
      // Pre-fetch Yahoo session to avoid rate limits on crumb endpoint
      await getYahooSession();

      let fetchedCount = 0;
      let failedCount = 0;

      await processBatch(symbolsToFetch, async (item) => {
        const { symbol, type } = item;
        try {
          // Use fallback chain for stocks, MFAPI for mutual funds
          const priceData = type === 'mf'
            ? await fetchMutualFundNAV(symbol)
            : await fetchPriceWithFallback(symbol, fetchYahooPrice);

          if (priceData && priceData.price) {
            fetchedCount++;
            // Cache immediately with the actual source
            const priceSource = priceData.source || source;
            await cachePrice(symbol, priceData, priceSource);
            console.log(`[Price] FETCHED: ${symbol} = ${priceData.price} (via ${priceSource})`);
            results[symbol] = {
              price: priceData.price,
              previousClose: priceData.previousClose,
              change: priceData.change || 0,
              changePercent: priceData.changePercent || 0,
              currency: priceData.currency || 'INR',
              source: priceSource,
              fetchedAt: new Date().toISOString()
            };
          } else {
            failedCount++;
            // Try to use stale cache as fallback
            const staleCache = cachedPrices[symbol];
            if (staleCache) {
              console.log(`[Price] STALE FALLBACK: ${symbol} (all providers failed, using old cache)`);
              results[symbol] = { ...formatCachedPrice(staleCache), source: 'stale' };
            } else {
              console.log(`[Price] FAIL: ${symbol} - all providers failed and no cache`);
              results[symbol] = { unavailable: true, reason: 'All providers failed, no cache' };
            }
          }
        } catch (err) {
          failedCount++;
          // Try to use stale cache as fallback
          const staleCache = cachedPrices[symbol];
          if (staleCache) {
            console.log(`[Price] STALE FALLBACK: ${symbol} (error: ${err.message})`);
            results[symbol] = { ...formatCachedPrice(staleCache), source: 'stale' };
          } else {
            console.error(`[Price] FAIL: ${symbol} - ${err.message}`);
            results[symbol] = { unavailable: true, reason: 'Fetch error' };
          }
        }
      }, 1, 3000); // Sequential requests with 3s delay to avoid rate limiting

      console.log(`[Price] Fetch complete: ${fetchedCount} fetched, ${failedCount} failed, ${cacheHits} from cache`);
    }

    console.log(`[Price] Returning ${Object.keys(results).length} prices`);
    res.json({ prices: results, marketStatus: market });
  } catch (error) {
    console.error('Error fetching bulk prices:', error);
    res.status(500).json({ error: 'Failed to fetch prices' });
  }
});

// Circuit breaker monitoring endpoint
router.get('/circuit-breakers', authenticateToken, (req, res) => {
  try {
    const states = getCircuitBreakerStates();
    res.json({
      circuitBreakers: states,
      summary: {
        total: states.length,
        open: states.filter(s => s.state === 'OPEN').length,
        halfOpen: states.filter(s => s.state === 'HALF_OPEN').length,
        closed: states.filter(s => s.state === 'CLOSED').length
      }
    });
  } catch (error) {
    console.error('Error getting circuit breaker states:', error);
    res.status(500).json({ error: 'Failed to get circuit breaker states' });
  }
});

// Reset circuit breaker endpoint
router.post('/circuit-breakers/reset', authenticateToken, (req, res) => {
  try {
    const { provider } = req.body;

    if (provider) {
      const success = resetCircuitBreaker(provider);
      if (success) {
        res.json({ success: true, message: `Circuit breaker ${provider} reset` });
      } else {
        res.status(404).json({ error: `Circuit breaker ${provider} not found` });
      }
    } else {
      resetAllCircuitBreakers();
      res.json({ success: true, message: 'All circuit breakers reset' });
    }
  } catch (error) {
    console.error('Error resetting circuit breaker:', error);
    res.status(500).json({ error: 'Failed to reset circuit breaker' });
  }
});

// Background sync status endpoint
router.get('/sync/status', authenticateToken, async (req, res) => {
  try {
    const status = await getSyncStatus();
    res.json(status);
  } catch (error) {
    console.error('Error getting sync status:', error);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

// Trigger manual sync endpoint
router.post('/sync/trigger', authenticateToken, async (req, res) => {
  try {
    const result = await triggerManualSync();
    res.json(result);
  } catch (error) {
    console.error('Error triggering sync:', error);
    res.status(500).json({ error: 'Failed to trigger sync' });
  }
});

// Get recent sync jobs
router.get('/sync/jobs', authenticateToken, (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const jobs = getRecentSyncJobs(limit);
    res.json({ jobs });
  } catch (error) {
    console.error('Error getting sync jobs:', error);
    res.status(500).json({ error: 'Failed to get sync jobs' });
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
    const cached = market.isOpen ? await getCachedPrice(symbol) : await getAnyCachedPrice(symbol);
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
    await cachePrice(symbol, priceData, market.isOpen ? 'live' : 'close');

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
