import api from './api';

export const assetService = {
  // Get all assets
  getAll: () => api.get('/assets'),

  // Get assets by category
  getByCategory: (category) => api.get(`/assets/category/${category}`),

  // Get single asset
  getById: (id) => api.get(`/assets/${id}`),

  // Create asset
  create: (data) => api.post('/assets', data),

  // Update asset
  update: (id, data) => api.put(`/assets/${id}`, data),

  // Delete asset
  delete: (id) => api.delete(`/assets/${id}`),

  // Get portfolio summary
  getSummary: () => api.get('/assets/summary/overview'),

  // Get transactions for an asset
  getTransactions: (assetId) => api.get(`/transactions/asset/${assetId}`),
};

export const priceService = {
  // Get price for symbol
  getPrice: (symbol, type = 'stock') => api.get(`/prices/${symbol}?type=${type}`),

  // Get bulk prices (forceRefresh bypasses cache)
  getBulkPrices: (symbols, forceRefresh = false) => api.post('/prices/bulk', { symbols, forceRefresh }),

  // Clear price cache
  clearCache: () => api.delete('/prices/cache'),

  // Search stocks by company name
  searchStocks: (query) => api.get(`/prices/search/stocks?q=${encodeURIComponent(query)}`),

  // Search mutual funds
  searchMutualFunds: (query) => api.get(`/prices/search/mf?q=${encodeURIComponent(query)}`),
};

// Asset categories and types
export const ASSET_CONFIG = {
  EQUITY: {
    label: 'Equity',
    types: [
      { value: 'STOCK', label: 'Stock' },
      { value: 'MUTUAL_FUND', label: 'Mutual Fund' },
      { value: 'ETF', label: 'ETF' },
    ],
    color: '#3B82F6',
  },
  FIXED_INCOME: {
    label: 'Fixed Income',
    types: [
      { value: 'FD', label: 'Fixed Deposit' },
      { value: 'RD', label: 'Recurring Deposit' },
      { value: 'PPF', label: 'PPF' },
      { value: 'EPF', label: 'EPF' },
      { value: 'VPF', label: 'VPF' },
      { value: 'NPS', label: 'NPS' },
      { value: 'BONDS', label: 'Bonds' },
      { value: 'NSC', label: 'NSC' },
      { value: 'KVP', label: 'KVP' },
    ],
    color: '#10B981',
  },
  REAL_ESTATE: {
    label: 'Real Estate',
    types: [
      { value: 'LAND', label: 'Land' },
      { value: 'PROPERTY', label: 'Property' },
      { value: 'REIT', label: 'REIT' },
    ],
    color: '#F59E0B',
  },
  PHYSICAL: {
    label: 'Physical Assets',
    types: [
      { value: 'GOLD', label: 'Gold' },
      { value: 'SILVER', label: 'Silver' },
      { value: 'VEHICLE', label: 'Vehicle' },
    ],
    color: '#EAB308',
  },
  SAVINGS: {
    label: 'Savings',
    types: [
      { value: 'SAVINGS_ACCOUNT', label: 'Savings Account' },
      { value: 'CURRENT_ACCOUNT', label: 'Current Account' },
    ],
    color: '#8B5CF6',
  },
  CRYPTO: {
    label: 'Cryptocurrency',
    types: [
      { value: 'CRYPTOCURRENCY', label: 'Cryptocurrency' },
    ],
    color: '#EC4899',
  },
  INSURANCE: {
    label: 'Insurance',
    types: [
      { value: 'LIC', label: 'LIC' },
      { value: 'ULIP', label: 'ULIP' },
      { value: 'TERM_INSURANCE', label: 'Term Insurance' },
    ],
    color: '#06B6D4',
  },
  OTHER: {
    label: 'Other',
    types: [
      { value: 'CUSTOM', label: 'Custom' },
    ],
    color: '#6B7280',
  },
};
