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

/**
 * Format date as relative time (e.g., "2 days ago", "3 weeks ago")
 * Falls back to full date for dates older than 30 days
 * @param {string|Date} dateStr - The date to format
 * @returns {string} Relative or formatted date string
 */
export const formatRelativeDate = (dateStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const now = new Date();
  const diffTime = now - date;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return '1 week ago';
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;

  // For older dates, return formatted date
  return formatDate(dateStr);
};

/**
 * Format month/year for grouping headers
 * @param {string|Date} dateStr - The date to format
 * @returns {string} Month and year string
 */
export const formatMonthYear = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
};

/**
 * Format number with Indian locale for input display (no currency symbol)
 * @param {string|number} value - The value to format
 * @returns {string} Formatted number string with Indian commas
 */
export const formatIndianNumber = (value) => {
  if (value === null || value === undefined || value === '') return '';
  const num = typeof value === 'string' ? value.replace(/,/g, '') : value;
  if (isNaN(num) || num === '') return '';

  const parts = num.toString().split('.');
  const intPart = parts[0];
  const decPart = parts[1];

  // Format integer part with Indian grouping
  const lastThree = intPart.slice(-3);
  const otherNumbers = intPart.slice(0, -3);
  const formatted = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') +
    (otherNumbers ? ',' : '') + lastThree;

  return decPart !== undefined ? `${formatted}.${decPart}` : formatted;
};

/**
 * Parse Indian formatted number string to raw number
 * @param {string} value - The formatted string (e.g., "1,00,00,000")
 * @returns {string} Raw number string without commas
 */
export const parseIndianNumber = (value) => {
  if (!value) return '';
  return value.toString().replace(/,/g, '');
};

/**
 * Calculate maturity value for FD/PPF with compound interest
 * @param {number} principal - Principal amount
 * @param {number} rate - Annual interest rate (%)
 * @param {number} years - Tenure in years
 * @param {number} compoundingFrequency - Times compounded per year (default: 4 for quarterly)
 * @returns {object} { maturityValue, interestEarned }
 */
export const calculateMaturityValue = (principal, rate, years, compoundingFrequency = 4) => {
  if (!principal || !rate || !years) return { maturityValue: 0, interestEarned: 0 };

  const p = parseFloat(principal);
  const r = parseFloat(rate) / 100;
  const n = compoundingFrequency;
  const t = parseFloat(years);

  // Compound interest formula: A = P(1 + r/n)^(nt)
  const maturityValue = p * Math.pow(1 + r / n, n * t);
  const interestEarned = maturityValue - p;

  return {
    maturityValue: Math.round(maturityValue),
    interestEarned: Math.round(interestEarned)
  };
};

/**
 * Calculate tenure in years between two dates
 * @param {string} startDate - Start date string
 * @param {string} endDate - End date string
 * @returns {number} Tenure in years (decimal)
 */
export const calculateTenureYears = (startDate, endDate) => {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = end - start;
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return diffDays / 365;
};
