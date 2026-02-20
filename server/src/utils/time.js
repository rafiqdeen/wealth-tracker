/**
 * Centralized time utilities for IST (Indian Standard Time) calculations
 */

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +5:30 hours in milliseconds

/**
 * Get current time in IST
 * @returns {Date} Current IST time
 */
export function getISTTime() {
  const now = Date.now();
  return new Date(now + IST_OFFSET_MS + new Date().getTimezoneOffset() * 60 * 1000);
}

/**
 * Get IST time string in HH:MM format
 * @returns {string} Time string like "14:30"
 */
export function getISTTimeString() {
  const istTime = getISTTime();
  return istTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Get current day of week in IST (0 = Sunday, 6 = Saturday)
 * @returns {number} Day of week
 */
export function getISTDay() {
  return getISTTime().getDay();
}

/**
 * Get current hour and minute in IST
 * @returns {{ hours: number, minutes: number, timeInMinutes: number }}
 */
export function getISTHourMinute() {
  const istTime = getISTTime();
  const hours = istTime.getHours();
  const minutes = istTime.getMinutes();
  return {
    hours,
    minutes,
    timeInMinutes: hours * 60 + minutes
  };
}

/**
 * Check if current IST time is within Indian market hours (9:15 AM - 3:30 PM)
 * @returns {boolean}
 */
export function isWithinMarketHours() {
  const { timeInMinutes } = getISTHourMinute();
  const marketOpen = 9 * 60 + 15;  // 9:15 AM
  const marketClose = 15 * 60 + 30; // 3:30 PM
  return timeInMinutes >= marketOpen && timeInMinutes <= marketClose;
}

/**
 * Check if current IST day is a weekend
 * @returns {boolean}
 */
export function isWeekend() {
  const day = getISTDay();
  return day === 0 || day === 6;
}

export default {
  getISTTime,
  getISTTimeString,
  getISTDay,
  getISTHourMinute,
  isWithinMarketHours,
  isWeekend,
  IST_OFFSET_MS
};
