/**
 * Alternative Price Providers with Circuit Breaker Protection
 *
 * Fallback chain:
 * 1. Yahoo Finance (primary) - via existing fetchYahooPrice
 * 2. BSE API - for all Indian stocks
 * 3. Google Finance - last resort (HTML scraping)
 */

import CircuitBreaker from './circuitBreaker.js';

// Circuit breakers for each provider
const breakers = {
  yahoo: new CircuitBreaker('yahoo', {
    failureThreshold: 3,
    recoveryTimeout: 120000  // 2 minutes
  }),
  bse: new CircuitBreaker('bse', {
    failureThreshold: 5,
    recoveryTimeout: 60000   // 1 minute
  }),
  google: new CircuitBreaker('google', {
    failureThreshold: 10,
    recoveryTimeout: 300000  // 5 minutes
  })
};

// User agents for requests
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Fetch price from BSE API
 * Works for stocks listed on BSE (most NSE stocks are also on BSE)
 *
 * @param {string} symbol - Stock symbol (e.g., "RELIANCE.NS" or "RELIANCE.BO")
 * @returns {object|null} - Price data or null
 */
async function fetchBSEPrice(symbol) {
  // Extract base symbol (remove exchange suffix)
  const baseSymbol = symbol.replace('.NS', '').replace('.BO', '');

  // BSE API needs scrip code, but we can search by symbol
  const searchUrl = `https://api.bseindia.com/BseIndiaAPI/api/Sensex/getSensexData?scripcode=&scripname=${encodeURIComponent(baseSymbol)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    // First, search for the scrip code
    const searchResponse = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'application/json',
        'Referer': 'https://www.bseindia.com/'
      }
    });

    if (!searchResponse.ok) {
      throw new Error(`BSE search error: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();

    // Find matching stock
    const match = searchData.Table?.find(item =>
      item.scrip_cd && item.short_name?.toUpperCase() === baseSymbol.toUpperCase()
    );

    if (!match || !match.scrip_cd) {
      // Try alternate BSE endpoint for quote
      return await fetchBSEQuote(baseSymbol);
    }

    clearTimeout(timeoutId);

    // Get detailed quote using scrip code
    return await fetchBSEQuote(baseSymbol, match.scrip_cd);

  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('BSE API timeout');
    }
    throw error;
  }
}

/**
 * Fetch BSE quote by symbol or scrip code
 */
async function fetchBSEQuote(symbol, scripCode = null) {
  // Use BSE GetQuote API
  const quoteUrl = scripCode
    ? `https://api.bseindia.com/BseIndiaAPI/api/StockReachGraph/w?flag=0&scripcode=${scripCode}`
    : `https://api.bseindia.com/BseIndiaAPI/api/getScripHeaderData/w?scripcode=&scripid=${encodeURIComponent(symbol)}&flag=`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(quoteUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'application/json',
        'Referer': 'https://www.bseindia.com/'
      }
    });

    if (!response.ok) {
      throw new Error(`BSE quote error: ${response.status}`);
    }

    const data = await response.json();
    clearTimeout(timeoutId);

    // Parse response (format varies by endpoint)
    let price, previousClose, change, changePercent;

    if (data.CurrValue || data.Curvalue) {
      // StockReachGraph response
      price = parseFloat(data.CurrValue || data.Curvalue);
      previousClose = parseFloat(data.PrevClose || data.prevClose);
    } else if (data.Header) {
      // getScripHeaderData response
      price = parseFloat(data.Header.CurrentVal || data.Header.CurrVal);
      previousClose = parseFloat(data.Header.PreClsVal || data.Header.PrevCls);
      change = parseFloat(data.Header.Change);
      changePercent = parseFloat(data.Header.PerChange || data.Header.PercChange);
    }

    if (!price || price <= 0) {
      throw new Error('Invalid BSE price data');
    }

    // Calculate change if not provided
    if (!change && previousClose) {
      change = price - previousClose;
      changePercent = (change / previousClose) * 100;
    }

    return {
      price,
      previousClose: previousClose || price,
      change: change || 0,
      changePercent: changePercent || 0,
      currency: 'INR',
      source: 'bse'
    };

  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Fetch price from Google Finance (HTML scraping - last resort)
 * More reliable than BSE but slower and may break with page changes
 *
 * @param {string} symbol - Stock symbol (e.g., "RELIANCE.NS")
 * @returns {object|null} - Price data or null
 */
async function fetchGooglePrice(symbol) {
  // Convert Yahoo symbol format to Google Finance format
  // RELIANCE.NS -> RELIANCE:NSE
  // INFY.BO -> INFY:BOM
  let googleSymbol = symbol
    .replace('.NS', ':NSE')
    .replace('.BO', ':BOM');

  const url = `https://www.google.com/finance/quote/${encodeURIComponent(googleSymbol)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) {
      throw new Error(`Google Finance error: ${response.status}`);
    }

    const html = await response.text();
    clearTimeout(timeoutId);

    // Extract price using data attributes (more reliable than regex)
    // Google Finance uses data-last-price attribute
    const priceMatch = html.match(/data-last-price="([0-9,.]+)"/);
    const prevCloseMatch = html.match(/data-previous-close="([0-9,.]+)"/);
    const changeMatch = html.match(/data-price-change="([+-]?[0-9,.]+)"/);
    const changePercentMatch = html.match(/data-price-change-percent="([+-]?[0-9,.]+)"/);

    if (!priceMatch) {
      // Try alternative pattern
      const altPriceMatch = html.match(/<div[^>]*class="[^"]*YMlKec[^"]*"[^>]*>[\s]*₹?([0-9,]+\.?[0-9]*)/);
      if (!altPriceMatch) {
        throw new Error('Could not parse Google Finance price');
      }
      const price = parseFloat(altPriceMatch[1].replace(/,/g, ''));
      return {
        price,
        previousClose: price,
        change: 0,
        changePercent: 0,
        currency: 'INR',
        source: 'google'
      };
    }

    const price = parseFloat(priceMatch[1].replace(/,/g, ''));
    const previousClose = prevCloseMatch ? parseFloat(prevCloseMatch[1].replace(/,/g, '')) : price;
    const change = changeMatch ? parseFloat(changeMatch[1].replace(/,/g, '')) : 0;
    const changePercent = changePercentMatch ? parseFloat(changePercentMatch[1].replace(/,/g, '')) : 0;

    if (!price || price <= 0) {
      throw new Error('Invalid Google Finance price');
    }

    return {
      price,
      previousClose,
      change,
      changePercent,
      currency: 'INR',
      source: 'google'
    };

  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Google Finance timeout');
    }
    throw error;
  }
}

/**
 * Fetch price with fallback chain and circuit breaker protection
 *
 * @param {string} symbol - Stock symbol (e.g., "RELIANCE.NS")
 * @param {Function} yahooFetcher - The existing fetchYahooPrice function
 * @returns {object|null} - Price data with source field, or null if all fail
 */
export async function fetchPriceWithFallback(symbol, yahooFetcher) {
  const providers = [
    {
      name: 'yahoo',
      fn: () => yahooFetcher(symbol),
      breaker: breakers.yahoo
    },
    {
      name: 'bse',
      fn: () => fetchBSEPrice(symbol),
      breaker: breakers.bse
    },
    {
      name: 'google',
      fn: () => fetchGooglePrice(symbol),
      breaker: breakers.google
    }
  ];

  for (const provider of providers) {
    // Skip if circuit breaker is open
    if (!provider.breaker.isAvailable()) {
      console.log(`[PriceProvider] Skipping ${provider.name} - circuit OPEN`);
      continue;
    }

    try {
      const result = await provider.breaker.execute(provider.fn);

      if (result && result.price && result.price > 0) {
        console.log(`[PriceProvider] ${symbol} fetched from ${provider.name}: ${result.price}`);
        return {
          ...result,
          source: provider.name
        };
      }
    } catch (error) {
      console.log(`[PriceProvider] ${provider.name} failed for ${symbol}: ${error.message}`);
    }
  }

  console.log(`[PriceProvider] All providers failed for ${symbol}`);
  return null;
}

/**
 * Get circuit breaker states for monitoring
 */
export function getCircuitBreakerStates() {
  return Object.entries(breakers).map(([name, breaker]) => ({
    provider: name,
    ...breaker.getState()
  }));
}

/**
 * Reset a specific circuit breaker
 */
export function resetCircuitBreaker(name) {
  if (breakers[name]) {
    breakers[name].reset();
    return true;
  }
  return false;
}

/**
 * Reset all circuit breakers
 */
export function resetAllCircuitBreakers() {
  Object.values(breakers).forEach(breaker => breaker.reset());
}

export default {
  fetchPriceWithFallback,
  fetchBSEPrice,
  fetchGooglePrice,
  getCircuitBreakerStates,
  resetCircuitBreaker,
  resetAllCircuitBreakers
};
