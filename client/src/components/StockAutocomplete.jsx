import { useState, useEffect, useRef } from 'react';
import { priceService } from '../services/assets';

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
    if (!searchQuery || searchQuery.length < 2) {
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
      <input
        type="text"
        value={query}
        onChange={handleInputChange}
        onFocus={() => results.length > 0 && setShowDropdown(true)}
        placeholder={placeholder}
        disabled={disabled}
        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
      />

      {loading && (
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
          <svg className="animate-spin h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      )}

      {showDropdown && results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
          {results.map((item, index) => (
            <li
              key={`${item.symbol}-${index}`}
              onClick={() => handleSelect(item)}
              className="px-3 py-2 cursor-pointer hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
            >
              <div className="font-medium text-gray-900 text-sm">{item.name}</div>
              <div className="text-xs text-gray-500">
                {item.symbol} {item.exchange && `• ${item.exchange}`}
              </div>
            </li>
          ))}
        </ul>
      )}

      {showDropdown && query.length >= 2 && !loading && results.length === 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg p-3 text-sm text-gray-500">
          No results found for "{query}"
        </div>
      )}
    </div>
  );
}
