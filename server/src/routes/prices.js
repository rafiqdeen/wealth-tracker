import express from 'express';
import dns from 'dns';
import db from '../db/database.js';
import { authenticateToken } from '../middleware/auth.js';

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

// Cache duration in milliseconds (30 minutes - balances freshness vs API limits)
const CACHE_DURATION = 30 * 60 * 1000;

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
function getBulkCachedPrices(symbols) {
  if (!symbols || symbols.length === 0) return {};

  const placeholders = symbols.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT * FROM price_cache WHERE symbol IN (${placeholders})
  `).all(...symbols);

  return rows.reduce((acc, row) => {
    acc[row.symbol] = row;
    return acc;
  }, {});
}

// Save price to cache (only successful fetches)
// source: 'live' (during market hours) or 'close' (after market hours)
function cachePrice(symbol, priceData, source) {
  try {
    const {
      price,
      previousClose = null,
      change = 0,
      changePercent = 0,
      currency = 'INR'
    } = priceData;

    db.prepare(`
      INSERT OR REPLACE INTO price_cache
      (symbol, price, previous_close, change_amount, change_percent, currency, source, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(symbol, price, previousClose, change, changePercent, currency, source);
    console.log(`[Cache] Saved ${symbol} = ${price}`);
  } catch (error) {
    console.error(`[Cache] Error saving ${symbol}:`, error.message);
  }
}

// Format cached data for API response
function formatCachedPrice(cached) {
  return {
    price: cached.price,
    previousClose: cached.previous_close,
    change: cached.change_amount || 0,
    changePercent: cached.change_percent || 0,
    currency: cached.currency || 'INR',
    source: cached.source,
    fetchedAt: cached.fetched_at
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
// Market OPEN: Fetch fresh, cache as 'live', failed = unavailable
// Market CLOSED: Use cache, if no cache fetch once and cache as 'close'
router.post('/bulk', authenticateToken, async (req, res) => {
  try {
    const { symbols } = req.body;

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

    if (market.isOpen) {
      // === MARKET OPEN: Fetch ALL fresh, cache as 'live' ===
      console.log(`[Price] Market OPEN - fetching ${symbols.length} symbols fresh`);

      // Pre-fetch Yahoo session to avoid rate limits on crumb endpoint
      await getYahooSession();

      await processBatch(symbols, async (item) => {
        const { symbol, type } = item;
        try {
          const priceData = type === 'mf'
            ? await fetchMutualFundNAV(symbol)
            : await fetchYahooPrice(symbol);
          if (priceData && priceData.price) {
            // Cache immediately as price is fetched
            cachePrice(symbol, priceData, 'live');
            console.log(`[Price] OK: ${symbol} = ${priceData.price}`);
            results[symbol] = {
              price: priceData.price,
              previousClose: priceData.previousClose,
              change: priceData.change || 0,
              changePercent: priceData.changePercent || 0,
              currency: priceData.currency || 'INR',
              source: 'live'
            };
          } else {
            console.log(`[Price] FAIL: ${symbol} - no data returned`);
            results[symbol] = { unavailable: true, reason: 'Fetch failed' };
          }
        } catch (err) {
          console.error(`[Price] FAIL: ${symbol} - ${err.message}`);
          results[symbol] = { unavailable: true, reason: 'Fetch failed' };
        }
      }, 1, 3000); // Sequential requests with 3s delay to avoid rate limiting
    } else {
      // === MARKET CLOSED: Use cache, fetch missing symbols once ===
      console.log(`[Price] Market CLOSED - checking cache for ${symbols.length} symbols`);

      const cachedPrices = getBulkCachedPrices(allSymbols);
      const uncachedSymbols = [];

      // First pass: use cache where available
      for (const item of symbols) {
        const cached = cachedPrices[item.symbol];
        if (cached) {
          results[item.symbol] = formatCachedPrice(cached);
        } else {
          uncachedSymbols.push(item);
        }
      }

      // Second pass: fetch uncached symbols (initial fetch for first-time users)
      if (uncachedSymbols.length > 0) {
        console.log(`[Price] Fetching ${uncachedSymbols.length} uncached symbols`);

        // Pre-fetch Yahoo session to avoid rate limits on crumb endpoint
        await getYahooSession();

        let fetchedCount = 0;
        let failedCount = 0;
        const fetchResults = await processBatch(uncachedSymbols, async (item) => {
          const { symbol, type } = item;
          try {
            const priceData = type === 'mf'
              ? await fetchMutualFundNAV(symbol)
              : await fetchYahooPrice(symbol);
            if (priceData && priceData.price) {
              fetchedCount++;
              // Cache immediately as price is fetched
              cachePrice(symbol, priceData, 'close');
              console.log(`[Price] OK: ${symbol} = ${priceData.price}`);
              // Also add to results immediately
              results[symbol] = {
                price: priceData.price,
                previousClose: priceData.previousClose,
                change: priceData.change || 0,
                changePercent: priceData.changePercent || 0,
                currency: priceData.currency || 'INR',
                source: 'close'
              };
            } else {
              failedCount++;
              console.log(`[Price] FAIL: ${symbol} - no data returned`);
              results[symbol] = { unavailable: true, reason: 'No cached price available' };
            }
            return { symbol, priceData };
          } catch (err) {
            failedCount++;
            console.error(`[Price] FAIL: ${symbol} - ${err.message}`);
            results[symbol] = { unavailable: true, reason: 'Fetch error' };
            return { symbol, priceData: null };
          }
        }, 1, 3000); // Sequential requests with 3s delay to avoid rate limiting

        console.log(`[Price] Fetch complete: ${fetchedCount} success, ${failedCount} failed`);
      }
    }

    console.log(`[Price] Returning ${Object.keys(results).length} prices`);
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
