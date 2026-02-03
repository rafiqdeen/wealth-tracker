/**
 * Background Price Sync Service
 *
 * Proactively fetches prices for user portfolios to ensure fresh data.
 *
 * Schedule:
 * - Market open (9:15-15:30 IST): Sync every 15 minutes
 * - Market closed: Sync once at 4 PM IST (after market close)
 * - Weekends: No sync needed
 *
 * Features:
 * - Prioritizes frequently accessed symbols
 * - Uses fallback API chain (Yahoo -> BSE -> Google)
 * - 3-second delay between requests to avoid rate limits
 * - Tracks job status for monitoring
 */

import db from '../db/database.js';
import { fetchPriceWithFallback } from './priceProviders.js';

// Sync configuration
const SYNC_INTERVAL_MARKET_OPEN = 15 * 60 * 1000;   // 15 minutes
const SYNC_DELAY_BETWEEN_SYMBOLS = 3000;            // 3 seconds between API calls (background)
const FAST_SYNC_DELAY = 300;                        // 300ms for manual sync
const MAX_SYMBOLS_PER_SYNC = 50;                    // Limit symbols per sync job
const VERCEL_TIMEOUT = 25000;                       // 25 seconds (Vercel limit is 30s)

let syncTimer = null;
let isRunning = false;
let lastPostMarketSyncDate = null; // Track if we've done post-market sync today

/**
 * Get current IST time info
 */
function getISTTime() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60 * 1000);

  return {
    date: istTime,
    hours: istTime.getHours(),
    minutes: istTime.getMinutes(),
    day: istTime.getDay(), // 0 = Sunday, 6 = Saturday
    timeInMinutes: istTime.getHours() * 60 + istTime.getMinutes()
  };
}

/**
 * Check if market is currently open (IST)
 */
function isMarketOpen() {
  const ist = getISTTime();

  // Weekend check
  if (ist.day === 0 || ist.day === 6) return false;

  // Market hours: 9:15 AM to 3:30 PM IST
  const marketOpen = 9 * 60 + 15;   // 9:15 AM
  const marketClose = 15 * 60 + 30; // 3:30 PM

  return ist.timeInMinutes >= marketOpen && ist.timeInMinutes <= marketClose;
}

/**
 * Check if it's time for post-market sync (4 PM IST on weekdays)
 */
function isPostMarketSyncTime() {
  const ist = getISTTime();

  // Weekend check
  if (ist.day === 0 || ist.day === 6) return false;

  // 4:00 PM - 4:15 PM IST window
  const postMarketStart = 16 * 60;      // 4:00 PM
  const postMarketEnd = 16 * 60 + 15;   // 4:15 PM

  return ist.timeInMinutes >= postMarketStart && ist.timeInMinutes <= postMarketEnd;
}

/**
 * Get all unique equity symbols from user portfolios
 * Ordered by priority (most requested first)
 */
async function getSymbolsToSync() {
  try {
    // Get all unique stock/MF symbols from active assets
    const symbols = await db.all(
      `SELECT DISTINCT
        CASE
          WHEN a.asset_type = 'MUTUAL_FUND' THEN a.symbol
          ELSE a.symbol || '.' || CASE WHEN a.exchange = 'BSE' THEN 'BO' ELSE 'NS' END
        END as full_symbol,
        a.asset_type,
        COALESCE(sp.priority, 0) as priority,
        COALESCE(sp.request_count, 0) as request_count
      FROM assets a
      LEFT JOIN symbol_priority sp ON sp.symbol =
        CASE
          WHEN a.asset_type = 'MUTUAL_FUND' THEN a.symbol
          ELSE a.symbol || '.' || CASE WHEN a.exchange = 'BSE' THEN 'BO' ELSE 'NS' END
        END
      WHERE a.category = 'EQUITY'
        AND a.symbol IS NOT NULL
        AND a.status = 'ACTIVE'
      ORDER BY priority DESC, request_count DESC
      LIMIT ?`,
      [MAX_SYMBOLS_PER_SYNC]
    );

    return symbols.map(s => ({
      symbol: s.full_symbol,
      type: s.asset_type === 'MUTUAL_FUND' ? 'mf' : 'stock'
    }));
  } catch (error) {
    console.error('[PriceSync] Error getting symbols:', error.message);
    return [];
  }
}

/**
 * Update symbol priority after a request
 */
export async function updateSymbolPriority(symbol) {
  try {
    await db.run(
      `INSERT INTO symbol_priority (symbol, priority, last_requested, request_count)
      VALUES (?, 1, CURRENT_TIMESTAMP, 1)
      ON CONFLICT(symbol) DO UPDATE SET
        priority = priority + 1,
        last_requested = CURRENT_TIMESTAMP,
        request_count = request_count + 1`,
      [symbol]
    );
  } catch (error) {
    console.error('[PriceSync] Error updating symbol priority:', error.message);
  }
}

/**
 * Create a new sync job
 */
async function createSyncJob(symbolCount) {
  try {
    const result = await db.run(
      `INSERT INTO price_sync_jobs (status, symbols_total, started_at)
      VALUES ('RUNNING', ?, CURRENT_TIMESTAMP)`,
      [symbolCount]
    );
    return result.lastInsertRowid;
  } catch (error) {
    console.error('[PriceSync] Error creating sync job:', error.message);
    return null;
  }
}

/**
 * Update sync job progress
 */
async function updateSyncJob(jobId, fetched, failed, status = 'RUNNING', errorMessage = null) {
  try {
    if (status === 'COMPLETED' || status === 'FAILED') {
      await db.run(
        `UPDATE price_sync_jobs
        SET symbols_fetched = ?, symbols_failed = ?, status = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [fetched, failed, status, errorMessage, jobId]
      );
    } else {
      await db.run(
        `UPDATE price_sync_jobs
        SET symbols_fetched = ?, symbols_failed = ?
        WHERE id = ?`,
        [fetched, failed, jobId]
      );
    }
  } catch (error) {
    console.error('[PriceSync] Error updating sync job:', error.message);
  }
}

/**
 * Get recent sync jobs for monitoring
 */
export async function getRecentSyncJobs(limit = 10) {
  try {
    return await db.all(
      `SELECT * FROM price_sync_jobs
      ORDER BY created_at DESC
      LIMIT ?`,
      [limit]
    );
  } catch (error) {
    console.error('[PriceSync] Error getting sync jobs:', error.message);
    return [];
  }
}

/**
 * Cache a fetched price
 */
async function cachePrice(symbol, priceData, source) {
  try {
    await db.run(
      `INSERT OR REPLACE INTO price_cache
      (symbol, price, previous_close, change_amount, change_percent, currency, source, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        symbol,
        priceData.price,
        priceData.previousClose || null,
        priceData.change || 0,
        priceData.changePercent || 0,
        priceData.currency || 'INR',
        source
      ]
    );
  } catch (error) {
    console.error('[PriceSync] Error caching price:', error.message);
  }
}

/**
 * Simple Yahoo price fetcher for sync service
 * Uses minimal retries to avoid rate limiting
 */
async function fetchYahooPrice(symbol) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    clearTimeout(timeoutId);

    if (response.status === 429) {
      throw new Error('Rate limited');
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const meta = data.chart.result?.[0]?.meta;

    if (!meta?.regularMarketPrice) {
      throw new Error('No price data');
    }

    const price = meta.regularMarketPrice;
    const previousClose = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPreviousClose;

    return {
      price,
      previousClose,
      change: previousClose ? price - previousClose : 0,
      changePercent: previousClose ? ((price - previousClose) / previousClose) * 100 : 0,
      currency: meta.currency || 'INR',
      source: 'yahoo'
    };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Fetch mutual fund NAV from MFAPI
 */
async function fetchMutualFundNAV(schemeCode) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`https://api.mfapi.in/mf/${schemeCode}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`MFAPI error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.data || data.data.length === 0) {
      throw new Error('No NAV data');
    }

    const latestNAV = data.data[0];
    const previousNAV = data.data[1];

    const currentNav = parseFloat(latestNAV.nav);
    const prevNav = previousNAV ? parseFloat(previousNAV.nav) : currentNav;

    return {
      price: currentNav,
      previousClose: prevNav,
      change: currentNav - prevNav,
      changePercent: prevNav ? ((currentNav - prevNav) / prevNav) * 100 : 0,
      currency: 'INR',
      source: 'mfapi'
    };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Run a single sync cycle
 */
async function runSyncCycle() {
  if (isRunning) {
    console.log('[PriceSync] Sync already in progress, skipping');
    return;
  }

  const symbols = await getSymbolsToSync();

  if (symbols.length === 0) {
    console.log('[PriceSync] No symbols to sync');
    return;
  }

  isRunning = true;
  const jobId = await createSyncJob(symbols.length);
  let fetched = 0;
  let failed = 0;

  console.log(`[PriceSync] Starting sync for ${symbols.length} symbols (job ${jobId})`);

  try {
    for (const item of symbols) {
      try {
        let priceData;

        if (item.type === 'mf') {
          // Mutual funds use MFAPI
          priceData = await fetchMutualFundNAV(item.symbol);
        } else {
          // Stocks use fallback chain
          priceData = await fetchPriceWithFallback(item.symbol, fetchYahooPrice);
        }

        if (priceData && priceData.price > 0) {
          await cachePrice(item.symbol, priceData, priceData.source);
          fetched++;
          console.log(`[PriceSync] ${item.symbol} = ${priceData.price} (${priceData.source})`);
        } else {
          failed++;
          console.log(`[PriceSync] ${item.symbol} - no price data`);
        }
      } catch (error) {
        failed++;
        console.log(`[PriceSync] ${item.symbol} - error: ${error.message}`);
      }

      // Update job progress periodically
      if ((fetched + failed) % 10 === 0) {
        await updateSyncJob(jobId, fetched, failed);
      }

      // Delay between symbols to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, SYNC_DELAY_BETWEEN_SYMBOLS));
    }

    await updateSyncJob(jobId, fetched, failed, 'COMPLETED');
    console.log(`[PriceSync] Sync completed: ${fetched} fetched, ${failed} failed`);

  } catch (error) {
    await updateSyncJob(jobId, fetched, failed, 'FAILED', error.message);
    console.error('[PriceSync] Sync failed:', error.message);
  } finally {
    isRunning = false;
  }
}

/**
 * Schedule next sync based on market hours
 */
function scheduleNextSync() {
  if (syncTimer) {
    clearTimeout(syncTimer);
  }

  const ist = getISTTime();
  let delay;

  if (isMarketOpen()) {
    // During market hours: sync every 15 minutes
    delay = SYNC_INTERVAL_MARKET_OPEN;
    console.log(`[PriceSync] Market open - next sync in 15 minutes`);
  } else if (isPostMarketSyncTime()) {
    // Post-market sync window: run once, then wait until tomorrow
    const todayStr = ist.date.toISOString().split('T')[0];
    if (lastPostMarketSyncDate === todayStr) {
      // Already did post-market sync today, wait until tomorrow
      const marketOpen = 9 * 60 + 15;
      const nextSyncMinutes = (24 * 60 - ist.timeInMinutes) + marketOpen;
      delay = nextSyncMinutes * 60 * 1000;
      console.log(`[PriceSync] Post-market sync already done - next sync tomorrow`);
    } else {
      console.log(`[PriceSync] Post-market window - running sync`);
      lastPostMarketSyncDate = todayStr;
      runSyncCycle().then(() => scheduleNextSync());
      return;
    }
  } else {
    // Outside market hours: calculate time until next sync opportunity
    const marketOpen = 9 * 60 + 15;
    const postMarket = 16 * 60;

    let nextSyncMinutes;

    if (ist.timeInMinutes < marketOpen) {
      // Before market open
      nextSyncMinutes = marketOpen - ist.timeInMinutes;
    } else if (ist.timeInMinutes < postMarket) {
      // Between close and post-market
      nextSyncMinutes = postMarket - ist.timeInMinutes;
    } else {
      // After post-market: wait until tomorrow 9:15 AM
      nextSyncMinutes = (24 * 60 - ist.timeInMinutes) + marketOpen;
    }

    // Handle weekends
    if (ist.day === 6) {
      // Saturday: wait until Monday
      nextSyncMinutes += 24 * 60; // Add Sunday
    } else if (ist.day === 0) {
      // Sunday: wait until Monday morning
      nextSyncMinutes = (24 * 60 - ist.timeInMinutes) + marketOpen;
    }

    delay = nextSyncMinutes * 60 * 1000;
    const hours = Math.floor(nextSyncMinutes / 60);
    const mins = nextSyncMinutes % 60;
    console.log(`[PriceSync] Market closed - next sync in ${hours}h ${mins}m`);
  }

  syncTimer = setTimeout(async () => {
    await runSyncCycle();
    scheduleNextSync();
  }, delay);
}

/**
 * Start the background sync service
 */
export function startPriceSync() {
  console.log('[PriceSync] Starting background price sync service');

  // Run initial sync after a short delay (let server fully start)
  setTimeout(() => {
    // Only run if market is open or it's post-market window
    if (isMarketOpen() || isPostMarketSyncTime()) {
      runSyncCycle().then(() => scheduleNextSync());
    } else {
      scheduleNextSync();
    }
  }, 5000);
}

/**
 * Stop the background sync service
 */
export function stopPriceSync() {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  console.log('[PriceSync] Background price sync service stopped');
}

/**
 * Fast sync for manual triggers (optimized for Vercel timeout)
 * Fetches in parallel batches with minimal delay
 */
async function runFastSync() {
  const symbols = await getSymbolsToSync();

  if (symbols.length === 0) {
    return { fetched: 0, failed: 0, total: 0 };
  }

  const startTime = Date.now();
  let fetched = 0;
  let failed = 0;

  console.log(`[PriceSync] Fast sync starting for ${symbols.length} symbols`);

  // Process in parallel batches of 3
  const batchSize = 3;
  for (let i = 0; i < symbols.length; i += batchSize) {
    // Check timeout
    if (Date.now() - startTime > VERCEL_TIMEOUT) {
      console.log(`[PriceSync] Timeout reached after ${fetched + failed} symbols`);
      break;
    }

    const batch = symbols.slice(i, i + batchSize);

    const results = await Promise.allSettled(
      batch.map(async (item) => {
        try {
          let priceData;
          if (item.type === 'mf') {
            priceData = await fetchMutualFundNAV(item.symbol);
          } else {
            priceData = await fetchPriceWithFallback(item.symbol, fetchYahooPrice);
          }

          if (priceData && priceData.price > 0) {
            await cachePrice(item.symbol, priceData, priceData.source);
            console.log(`[PriceSync] ${item.symbol} = ${priceData.price}`);
            return { success: true };
          }
          return { success: false };
        } catch (error) {
          console.log(`[PriceSync] ${item.symbol} - error: ${error.message}`);
          return { success: false };
        }
      })
    );

    results.forEach(r => {
      if (r.status === 'fulfilled' && r.value.success) {
        fetched++;
      } else {
        failed++;
      }
    });

    // Small delay between batches
    if (i + batchSize < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, FAST_SYNC_DELAY));
    }
  }

  console.log(`[PriceSync] Fast sync completed: ${fetched} fetched, ${failed} failed`);
  return { fetched, failed, total: symbols.length };
}

/**
 * Manually trigger a sync (for admin/testing)
 */
export async function triggerManualSync() {
  if (isRunning) {
    return { success: false, message: 'Sync already in progress' };
  }

  isRunning = true;
  try {
    const result = await runFastSync();
    return { success: true, message: 'Sync completed', ...result };
  } finally {
    isRunning = false;
  }
}

/**
 * Get sync service status
 */
export async function getSyncStatus() {
  return {
    isRunning,
    marketOpen: isMarketOpen(),
    postMarketWindow: isPostMarketSyncTime(),
    recentJobs: await getRecentSyncJobs(5)
  };
}

export default {
  startPriceSync,
  stopPriceSync,
  triggerManualSync,
  getSyncStatus,
  updateSymbolPriority,
  getRecentSyncJobs
};
