import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { priceService } from '../services/assets';

const PriceContext = createContext(null);

// Cache duration: 15 minutes for live prices (matches server cache during market open)
// 48 hours for localStorage backup (covers weekends)
const CACHE_DURATION = 15 * 60 * 1000;
const BACKUP_DURATION = 48 * 60 * 60 * 1000;

export function PriceProvider({ children }) {
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [marketStatus, setMarketStatus] = useState(null);

  // Ref to always have the latest prices (avoids stale closure in async callbacks)
  const pricesRef = useRef({});
  pricesRef.current = prices;

  // Ref for lastUpdated to avoid stale closure
  const lastUpdatedRef = useRef(null);
  lastUpdatedRef.current = lastUpdated;

  // Track in-flight requests to prevent duplicates
  const fetchPromiseRef = useRef(null);
  const fetchedSymbolsRef = useRef(new Set());

  // Load backup prices from localStorage on init
  const loadBackupPrices = useCallback(() => {
    try {
      const backupStr = localStorage.getItem('price_backup');
      if (backupStr) {
        const backup = JSON.parse(backupStr);
        if (Date.now() - backup.timestamp < BACKUP_DURATION) {
          return backup.prices;
        }
      }
    } catch (e) {
      console.error('Error loading price backup:', e);
    }
    return {};
  }, []);

  // Save prices to localStorage backup
  const saveBackupPrices = useCallback((priceData) => {
    try {
      const validPrices = {};
      for (const [symbol, data] of Object.entries(priceData)) {
        if (data && typeof data.price === 'number' && data.price > 0 && !data.unavailable) {
          validPrices[symbol] = data;
        }
      }
      if (Object.keys(validPrices).length > 0) {
        localStorage.setItem('price_backup', JSON.stringify({
          prices: validPrices,
          timestamp: Date.now()
        }));
      }
    } catch (e) {
      console.error('Error saving price backup:', e);
    }
  }, []);

  // Build symbol key for a given asset
  const getSymbolKey = useCallback((asset) => {
    if (!asset.symbol) return null;
    return asset.asset_type === 'MUTUAL_FUND'
      ? asset.symbol
      : `${asset.symbol}.${asset.exchange === 'BSE' ? 'BO' : 'NS'}`;
  }, []);

  // Check if we need to fetch prices (not in cache or stale)
  // Uses refs to avoid stale closure and unnecessary recreations
  const needsFetch = useCallback((symbolKey) => {
    const cached = pricesRef.current[symbolKey];
    if (!cached || cached.unavailable) return true;
    if (!lastUpdatedRef.current) return true;
    return Date.now() - lastUpdatedRef.current.getTime() > CACHE_DURATION;
  }, []); // No dependencies - uses refs for latest values

  // Fetch prices for given assets
  // IMPORTANT: Always returns a Promise that resolves to the complete prices object
  // This ensures XIRR calculations wait for all prices to be fetched
  const fetchPrices = useCallback(async (assets, forceRefresh = false) => {
    if (!assets || assets.length === 0) return {};

    // Filter to equity assets with symbols
    const equityAssets = assets.filter(a =>
      a.category === 'EQUITY' && a.symbol
    );

    if (equityAssets.length === 0) return {};

    // Build symbols array
    const allSymbols = equityAssets.map(a => ({
      symbol: getSymbolKey(a),
      type: a.asset_type === 'MUTUAL_FUND' ? 'mf' : 'stock'
    })).filter(s => s.symbol);

    // Determine which symbols need fetching
    let symbolsToFetch = allSymbols;
    if (!forceRefresh) {
      symbolsToFetch = allSymbols.filter(s => needsFetch(s.symbol));
    }

    // If nothing to fetch, return current prices from ref (always latest)
    if (symbolsToFetch.length === 0) {
      const result = {};
      const currentPrices = pricesRef.current;
      for (const s of allSymbols) {
        if (currentPrices[s.symbol]) {
          result[s.symbol] = currentPrices[s.symbol];
        }
      }
      return result;
    }

    // If already fetching the same symbols, wait for that promise and return its result
    if (fetchPromiseRef.current) {
      const fetchingSymbols = Array.from(fetchedSymbolsRef.current);
      const allCovered = symbolsToFetch.every(s => fetchingSymbols.includes(s.symbol));
      if (allCovered) {
        // Wait for the in-flight request and return its merged result
        const fetchedPrices = await fetchPromiseRef.current;
        // Merge with existing cached prices for symbols we already have
        const result = {};
        const currentPrices = pricesRef.current;
        for (const s of allSymbols) {
          if (fetchedPrices[s.symbol]) {
            result[s.symbol] = fetchedPrices[s.symbol];
          } else if (currentPrices[s.symbol]) {
            result[s.symbol] = currentPrices[s.symbol];
          }
        }
        return result;
      }
    }

    // Start new fetch
    setLoading(true);
    fetchedSymbolsRef.current = new Set(symbolsToFetch.map(s => s.symbol));

    const fetchPromise = (async () => {
      try {
        const response = await priceService.getBulkPrices(symbolsToFetch, forceRefresh);
        const newPrices = response.data?.prices || {};
        const newMarketStatus = response.data?.marketStatus;

        // Use ref for latest prices to avoid stale closure overwriting concurrent updates
        const mergedPrices = { ...pricesRef.current };

        // Add new prices
        for (const [symbol, data] of Object.entries(newPrices)) {
          if (data && typeof data.price === 'number' && data.price > 0) {
            mergedPrices[symbol] = data;
          } else if (data?.unavailable) {
            // Check backup for unavailable prices
            const backup = loadBackupPrices();
            if (backup[symbol]) {
              mergedPrices[symbol] = { ...backup[symbol], fromBackup: true };
            } else {
              mergedPrices[symbol] = data;
            }
          }
        }

        // Update React state and ref atomically
        pricesRef.current = mergedPrices;
        setPrices(mergedPrices);

        // Save valid prices to backup
        saveBackupPrices(mergedPrices);

        setMarketStatus(newMarketStatus);
        setLastUpdated(new Date());

        // Return merged prices for immediate use (don't wait for React state update)
        return mergedPrices;
      } catch (error) {
        console.error('Error fetching prices:', error);
        // On error, try to use backup prices
        const backup = loadBackupPrices();
        const mergedPrices = { ...pricesRef.current };

        if (Object.keys(backup).length > 0) {
          for (const s of symbolsToFetch) {
            if (!mergedPrices[s.symbol] && backup[s.symbol]) {
              mergedPrices[s.symbol] = { ...backup[s.symbol], fromBackup: true };
            }
          }
          pricesRef.current = mergedPrices;
          setPrices(mergedPrices);
        }
        return mergedPrices;
      } finally {
        setLoading(false);
        fetchPromiseRef.current = null;
        fetchedSymbolsRef.current = new Set();
      }
    })();

    fetchPromiseRef.current = fetchPromise;
    return fetchPromise;
  }, [getSymbolKey, needsFetch, loadBackupPrices, saveBackupPrices]); // No prices dependency - uses pricesRef

  // Get price for a specific asset
  const getPrice = useCallback((asset) => {
    const symbolKey = getSymbolKey(asset);
    if (!symbolKey) return null;
    return prices[symbolKey] || null;
  }, [prices, getSymbolKey]);

  // Check if price is available for an asset
  const isPriceAvailable = useCallback((asset) => {
    const priceData = getPrice(asset);
    return priceData && !priceData.unavailable && typeof priceData.price === 'number' && priceData.price > 0;
  }, [getPrice]);

  // Clear all prices (useful for logout)
  const clearPrices = useCallback(() => {
    pricesRef.current = {};
    setPrices({});
    setLastUpdated(null);
    setMarketStatus(null);
  }, []);

  // Force refresh all prices
  const refreshPrices = useCallback(async (assets) => {
    return fetchPrices(assets, true);
  }, [fetchPrices]);

  const value = {
    prices,
    loading,
    lastUpdated,
    marketStatus,
    fetchPrices,
    refreshPrices,
    getPrice,
    getSymbolKey,
    isPriceAvailable,
    clearPrices,
  };

  return (
    <PriceContext.Provider value={value}>
      {children}
    </PriceContext.Provider>
  );
}

export function usePrices() {
  const context = useContext(PriceContext);
  if (!context) {
    throw new Error('usePrices must be used within a PriceProvider');
  }
  return context;
}
