import api from './api';

// Purity factors for gold
export const PURITY_FACTORS = {
  '24K': 1.000,
  '22K': 0.916,
  '18K': 0.750,
  '14K': 0.585,
};

// Module-level cache for metal prices (persists across page navigations in SPA)
const metalCache = {};
const METAL_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export const metalService = {
  // Get current metal price (gold/silver) — cached for 30 min
  getPrice: async (metal = 'gold') => {
    const cached = metalCache[metal];
    if (cached && Date.now() - cached.fetchedAt < METAL_CACHE_TTL) {
      return { data: cached.data };
    }
    const response = await api.get(`/metals/price/${metal}`);
    metalCache[metal] = { data: response.data, fetchedAt: Date.now() };
    return response;
  },

  // Force refresh metal price (bypasses cache)
  refreshPrice: async (metal = 'gold') => {
    const response = await api.post(`/metals/price/${metal}/refresh`);
    // Update cache with fresh data
    if (response.data) {
      metalCache[metal] = { data: response.data, fetchedAt: Date.now() };
    }
    return response;
  },

  // Calculate value based on weight and purity
  calculate: (metal = 'gold', weight, purity = '24K') =>
    api.get('/metals/calculate', { params: { metal, weight, purity } }),

  // Seed price (for testing without API key)
  seedPrice: (metal = 'gold', pricePerGram24K) =>
    api.post('/metals/seed', { metal, pricePerGram24K }),
};

// Helper function to calculate gold value locally
export const calculateGoldValue = (weightGrams, purity, pricePerGram24K) => {
  if (!weightGrams || !pricePerGram24K) return 0;
  const purityFactor = PURITY_FACTORS[purity] || 1;
  // Round price per gram first to match displayed value, then multiply by weight
  const pricePerGramForPurity = Math.round(pricePerGram24K * purityFactor * 100) / 100;
  return Math.round(weightGrams * pricePerGramForPurity);
};

// Helper function to get price for specific purity
export const getPriceForPurity = (pricePerGram24K, purity) => {
  if (!pricePerGram24K) return 0;
  const purityFactor = PURITY_FACTORS[purity] || 1;
  return Math.round(pricePerGram24K * purityFactor * 100) / 100;
};

// Format relative time for "Updated X ago"
export const formatPriceAge = (fetchedAt) => {
  if (!fetchedAt) return '';

  const fetched = new Date(fetchedAt);
  const now = new Date();
  const diffMs = now - fetched;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays} days ago`;
};
