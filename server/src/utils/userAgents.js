/**
 * Centralized User-Agent rotation for external API calls
 * Modern browser User-Agent strings (from yfinance PR #2277)
 */

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:134.0) Gecko/20100101 Firefox/134.0',
  'Mozilla/5.0 (X11; Linux x86_64; rv:134.0) Gecko/20100101 Firefox/134.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0',
];

/**
 * Get a random User-Agent string for API requests
 * @returns {string} Random User-Agent
 */
export function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Get standard headers for Yahoo Finance API requests
 * @param {string} [cookie] - Optional cookie string
 * @returns {object} Headers object
 */
export function getYahooHeaders(cookie = null) {
  const headers = {
    'User-Agent': getRandomUserAgent(),
    'Accept': 'application/json,text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  if (cookie) {
    headers['Cookie'] = cookie;
  }

  return headers;
}

export { USER_AGENTS };
export default { getRandomUserAgent, getYahooHeaders, USER_AGENTS };
