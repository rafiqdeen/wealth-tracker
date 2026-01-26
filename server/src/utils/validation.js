/**
 * Input validation utilities for the Wealth Tracker API
 */

/**
 * Validate a numeric value is within acceptable range
 * @param {any} value - The value to validate
 * @param {string} fieldName - Name of the field for error messages
 * @param {object} options - Validation options
 * @returns {{ valid: boolean, error?: string, value?: number }}
 */
export function validateNumber(value, fieldName, options = {}) {
  const {
    min = 0.0001,
    max = 999999999999,
    maxDecimals = 4,
    required = true,
  } = options;

  if (value === undefined || value === null) {
    if (required) {
      return { valid: false, error: `${fieldName} is required` };
    }
    return { valid: true, value: null };
  }

  const num = typeof value === 'string' ? parseFloat(value) : value;

  if (typeof num !== 'number' || isNaN(num)) {
    return { valid: false, error: `${fieldName} must be a valid number` };
  }

  if (num < min) {
    return { valid: false, error: `${fieldName} must be at least ${min}` };
  }

  if (num > max) {
    return { valid: false, error: `${fieldName} must be at most ${max}` };
  }

  // Check decimal places
  const decimalStr = num.toString().split('.')[1];
  if (decimalStr && decimalStr.length > maxDecimals) {
    return { valid: false, error: `${fieldName} must have at most ${maxDecimals} decimal places` };
  }

  return { valid: true, value: num };
}

/**
 * Validate a string value
 * @param {any} value - The value to validate
 * @param {string} fieldName - Name of the field for error messages
 * @param {object} options - Validation options
 * @returns {{ valid: boolean, error?: string, value?: string }}
 */
export function validateString(value, fieldName, options = {}) {
  const {
    minLength = 1,
    maxLength = 1000,
    pattern = null,
    required = true,
    sanitize = true,
  } = options;

  if (value === undefined || value === null || value === '') {
    if (required) {
      return { valid: false, error: `${fieldName} is required` };
    }
    return { valid: true, value: null };
  }

  if (typeof value !== 'string') {
    return { valid: false, error: `${fieldName} must be a string` };
  }

  // Sanitize: trim whitespace
  let sanitized = sanitize ? value.trim() : value;

  if (sanitized.length < minLength) {
    return { valid: false, error: `${fieldName} must be at least ${minLength} characters` };
  }

  if (sanitized.length > maxLength) {
    return { valid: false, error: `${fieldName} must be at most ${maxLength} characters` };
  }

  if (pattern && !pattern.test(sanitized)) {
    return { valid: false, error: `${fieldName} format is invalid` };
  }

  return { valid: true, value: sanitized };
}

/**
 * Validate a date string (YYYY-MM-DD format)
 * @param {any} value - The value to validate
 * @param {string} fieldName - Name of the field for error messages
 * @param {object} options - Validation options
 * @returns {{ valid: boolean, error?: string, value?: string }}
 */
export function validateDate(value, fieldName, options = {}) {
  const { required = true, allowFuture = true, allowPast = true } = options;

  if (value === undefined || value === null || value === '') {
    if (required) {
      return { valid: false, error: `${fieldName} is required` };
    }
    return { valid: true, value: null };
  }

  // Check format YYYY-MM-DD
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(value)) {
    return { valid: false, error: `${fieldName} must be in YYYY-MM-DD format` };
  }

  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return { valid: false, error: `${fieldName} is not a valid date` };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!allowFuture && date > today) {
    return { valid: false, error: `${fieldName} cannot be in the future` };
  }

  if (!allowPast && date < today) {
    return { valid: false, error: `${fieldName} cannot be in the past` };
  }

  return { valid: true, value };
}

/**
 * Validate an email address
 * @param {any} value - The value to validate
 * @param {string} fieldName - Name of the field for error messages
 * @returns {{ valid: boolean, error?: string, value?: string }}
 */
export function validateEmail(value, fieldName = 'Email') {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const stringResult = validateString(value, fieldName, {
    minLength: 5,
    maxLength: 254,
    pattern: emailPattern,
  });

  if (!stringResult.valid) {
    return stringResult;
  }

  return { valid: true, value: stringResult.value.toLowerCase() };
}

/**
 * Validate an enum value
 * @param {any} value - The value to validate
 * @param {string} fieldName - Name of the field for error messages
 * @param {string[]} allowedValues - Array of allowed values
 * @param {object} options - Validation options
 * @returns {{ valid: boolean, error?: string, value?: string }}
 */
export function validateEnum(value, fieldName, allowedValues, options = {}) {
  const { required = true, caseSensitive = false } = options;

  if (value === undefined || value === null || value === '') {
    if (required) {
      return { valid: false, error: `${fieldName} is required` };
    }
    return { valid: true, value: null };
  }

  const checkValue = caseSensitive ? value : String(value).toUpperCase();
  const checkAllowed = caseSensitive ? allowedValues : allowedValues.map(v => v.toUpperCase());

  if (!checkAllowed.includes(checkValue)) {
    return {
      valid: false,
      error: `${fieldName} must be one of: ${allowedValues.join(', ')}`,
    };
  }

  return { valid: true, value: caseSensitive ? value : checkValue };
}

/**
 * Validate an integer ID
 * @param {any} value - The value to validate
 * @param {string} fieldName - Name of the field for error messages
 * @returns {{ valid: boolean, error?: string, value?: number }}
 */
export function validateId(value, fieldName = 'ID') {
  const num = parseInt(value, 10);

  if (isNaN(num) || num < 1 || !Number.isInteger(num)) {
    return { valid: false, error: `${fieldName} must be a positive integer` };
  }

  return { valid: true, value: num };
}

/**
 * Whitelist of fields that can be updated for each entity
 */
export const UPDATE_WHITELISTS = {
  transaction: ['quantity', 'price', 'notes'],
  asset: [
    'category', 'asset_type', 'name', 'symbol', 'exchange', 'quantity', 'avg_buy_price',
    'principal', 'interest_rate', 'start_date', 'maturity_date', 'institution',
    'purchase_price', 'current_value', 'location', 'area_sqft', 'balance',
    'weight_grams', 'purity', 'premium', 'sum_assured', 'policy_number',
    'purchase_date', 'notes', 'appreciation_rate',
  ],
  goal: ['name', 'category', 'target_amount', 'target_date', 'progress_mode', 'manual_current_amount', 'status', 'notes'],
  goalLink: ['link_type', 'allocation_percent', 'allocation_mode', 'fixed_allocation_amount'],
};

/**
 * Filter object to only include whitelisted fields
 * @param {object} data - The input data object
 * @param {string} entityType - The entity type (transaction, asset, goal, goalLink)
 * @returns {object} Filtered object with only allowed fields
 */
export function filterToWhitelist(data, entityType) {
  const whitelist = UPDATE_WHITELISTS[entityType];
  if (!whitelist) {
    throw new Error(`Unknown entity type: ${entityType}`);
  }

  const filtered = {};
  for (const field of whitelist) {
    if (data[field] !== undefined) {
      filtered[field] = data[field];
    }
  }
  return filtered;
}
