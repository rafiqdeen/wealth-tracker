/**
 * Async handler wrapper to eliminate try/catch boilerplate in route handlers
 *
 * Usage:
 * router.get('/path', authenticateToken, asyncHandler(async (req, res) => {
 *   const data = await db.all('SELECT * FROM table');
 *   res.json(data);
 * }));
 *
 * Errors are automatically caught and passed to Express error middleware.
 */

/**
 * Wraps an async route handler to automatically catch errors
 * @param {Function} fn - Async route handler function
 * @returns {Function} Express middleware function
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;
