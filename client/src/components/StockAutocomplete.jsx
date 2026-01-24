import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { priceService } from '../services/assets';
import { spring } from '../utils/animations';

export default function StockAutocomplete({
  value,
  onChange,
  onSelect,
  assetType,
  placeholder = 'Search by company name...',
  disabled = false
}) {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef(null);
  const debounceRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync external value changes
  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  const searchAssets = async (searchQuery) => {
    if (!searchQuery || searchQuery.length < 3) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      let response;
      if (assetType === 'MUTUAL_FUND') {
        response = await priceService.searchMutualFunds(searchQuery);
        const funds = response.data.funds || [];
        setResults(funds.map(f => ({
          symbol: f.schemeCode.toString(),
          name: f.schemeName,
          exchange: 'AMFI',
          type: 'MUTUAL_FUND'
        })));
      } else {
        response = await priceService.searchStocks(searchQuery);
        setResults(response.data.stocks || []);
      }
      setShowDropdown(true);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    onChange(newQuery);

    // Debounce API calls
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      searchAssets(newQuery);
    }, 300);
  };

  const handleSelect = (item) => {
    setQuery(item.name);
    setShowDropdown(false);
    setResults([]);
    onSelect(item);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full px-4 py-3 bg-[var(--fill-tertiary)] border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--system-blue)] transition-all text-[var(--label-primary)] placeholder-[var(--label-tertiary)] text-[15px] disabled:opacity-50"
        />

        {loading && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <svg className="animate-spin h-5 w-5 text-[var(--label-tertiary)]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        )}

        {!loading && query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              onChange('');
              setResults([]);
              setShowDropdown(false);
            }}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[var(--label-tertiary)] hover:text-[var(--label-secondary)] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <AnimatePresence>
        {showDropdown && results.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={spring.snappy}
            className="absolute z-50 mt-2 w-full bg-[var(--bg-primary)] rounded-xl shadow-lg shadow-black/10 max-h-64 overflow-auto border border-[var(--separator)]/30"
          >
            {results.map((item, index) => (
              <motion.li
                key={`${item.symbol}-${index}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.02 }}
                onClick={() => handleSelect(item)}
                className="px-4 py-3 cursor-pointer hover:bg-[var(--fill-tertiary)] border-b border-[var(--separator)]/20 last:border-b-0 transition-colors"
              >
                <div className="font-medium text-[15px] text-[var(--label-primary)]">{item.name}</div>
                <div className="text-[13px] text-[var(--label-tertiary)] mt-0.5">
                  {item.symbol}
                  {item.exchange && (
                    <span className="ml-2 px-1.5 py-0.5 bg-[var(--fill-secondary)] rounded text-[11px] font-medium">
                      {item.exchange}
                    </span>
                  )}
                </div>
              </motion.li>
            ))}
          </motion.ul>
        )}

        {showDropdown && query.length >= 3 && !loading && results.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={spring.snappy}
            className="absolute z-50 mt-2 w-full bg-[var(--bg-primary)] rounded-xl shadow-lg shadow-black/10 p-4 text-[15px] text-[var(--label-tertiary)] border border-[var(--separator)]/30"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[var(--fill-tertiary)] rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-[var(--label-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-[var(--label-primary)]">No results found</p>
                <p className="text-[13px]">Try a different search term</p>
              </div>
            </div>
          </motion.div>
        )}

        {query.length > 0 && query.length < 3 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={spring.snappy}
            className="absolute z-50 mt-2 w-full bg-[var(--bg-primary)] rounded-xl shadow-lg shadow-black/10 p-3 text-[14px] text-[var(--label-tertiary)] border border-[var(--separator)]/30"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[var(--label-quaternary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <span>Type at least 3 characters to search</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
