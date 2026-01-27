import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { priceService } from '../services/assets';

const PriceContext = createContext(null);

// Cache duration: 5 minutes for live prices, 24 hours for backup
const CACHE_DURATION = 5 * 60 * 1000;
const BACKUP_DURATION = 24 * 60 * 60 * 1000;

export function PriceProvider({ children }) {
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [marketStatus, setMarketStatus] = useState(null);

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
  const needsFetch = useCallback((symbolKey) => {
    const cached = prices[symbolKey];
    if (!cached || cached.unavailable) return true;
    if (!lastUpdated) return true;
    return Date.now() - lastUpdated.getTime() > CACHE_DURATION;
  }, [prices, lastUpdated]);

  // Fetch prices for given assets
  const fetchPrices = useCallback(async (assets, forceRefresh = false) => {
    if (!assets || assets.length === 0) return {};

    // Filter to equity assets with symbols
    const equityAssets = assets.filter(a =>
      a.category === 'EQUITY' && a.symbol
    );

    if (equityAssets.length === 0) return prices;

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

    // If nothing to fetch, return current prices
    if (symbolsToFetch.length === 0) {
      return prices;
    }

    // If already fetching the same symbols, wait for that promise
    if (fetchPromiseRef.current) {
      const fetchingSymbols = Array.from(fetchedSymbolsRef.current);
      const allCovered = symbolsToFetch.every(s => fetchingSymbols.includes(s.symbol));
      if (allCovered) {
        await fetchPromiseRef.current;
        return prices;
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

        // Merge with existing prices
        setPrices(prev => {
          const merged = { ...prev };

          // Add new prices
          for (const [symbol, data] of Object.entries(newPrices)) {
            if (data && typeof data.price === 'number' && data.price > 0) {
              merged[symbol] = data;
            } else if (data?.unavailable) {
              // Check backup for unavailable prices
              const backup = loadBackupPrices();
              if (backup[symbol]) {
                merged[symbol] = { ...backup[symbol], fromBackup: true };
              } else {
                merged[symbol] = data;
              }
            }
          }

          // Save valid prices to backup
          saveBackupPrices(merged);

          return merged;
        });

        setMarketStatus(newMarketStatus);
        setLastUpdated(new Date());

        return newPrices;
      } catch (error) {
        console.error('Error fetching prices:', error);
        // On error, try to use backup prices
        const backup = loadBackupPrices();
        if (Object.keys(backup).length > 0) {
          setPrices(prev => {
            const merged = { ...prev };
            for (const s of symbolsToFetch) {
              if (!merged[s.symbol] && backup[s.symbol]) {
                merged[s.symbol] = { ...backup[s.symbol], fromBackup: true };
              }
            }
            return merged;
          });
        }
        return {};
      } finally {
        setLoading(false);
        fetchPromiseRef.current = null;
        fetchedSymbolsRef.current = new Set();
      }
    })();

    fetchPromiseRef.current = fetchPromise;
    return fetchPromise;
  }, [prices, getSymbolKey, needsFetch, loadBackupPrices, saveBackupPrices]);

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
