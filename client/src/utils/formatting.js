// Currency formatting utilities for Indian Rupees

/**
 * Format number as Indian currency (INR)
 * @param {number} value - The value to format
 * @param {number} decimals - Maximum fraction digits (default: 0)
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (value, decimals = 0) => {
  if (value === null || value === undefined) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: decimals,
  }).format(value);
};

/**
 * Format number in compact Indian notation (K, L, Cr)
 * @param {number} value - The value to format
 * @returns {string} Compact formatted string
 */
export const formatCompact = (value) => {
  if (value === null || value === undefined) return '₹0';
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)} K`;
  return formatCurrency(value);
};

/**
 * Format number with Indian locale
 * @param {number} value - The value to format
 * @param {number} decimals - Maximum fraction digits (default: 4)
 * @returns {string} Formatted number string
 */
export const formatNumber = (value, decimals = 4) => {
  if (value === null || value === undefined) return '0';
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: decimals,
  }).format(value);
};

/**
 * Format date in Indian locale
 * @param {string|Date} dateStr - The date to format
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
export const formatDate = (dateStr, options = {}) => {
  if (!dateStr) return '-';
  const defaultOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  };
  return new Date(dateStr).toLocaleDateString('en-IN', { ...defaultOptions, ...options });
};

/**
 * Format percentage with sign
 * @param {number} value - The percentage value
 * @param {number} decimals - Decimal places (default: 1)
 * @returns {string} Formatted percentage with sign
 */
export const formatPercent = (value, decimals = 1) => {
  if (value === null || value === undefined) return '0%';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
};

/**
 * Format currency with explicit sign (for gains/losses)
 * @param {number} value - The value to format
 * @returns {string} Formatted currency with sign
 */
export const formatGainLoss = (value) => {
  if (value === null || value === undefined) return '₹0';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${formatCompact(value)}`;
};

/**
 * Format unit price (e.g., stock price, avg buy price)
 * @param {number} value - The price value
 * @returns {string} Formatted price with max 2 decimals
 */
export const formatPrice = (value) => {
  if (value === null || value === undefined) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};
