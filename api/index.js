/**
 * Vercel Serverless Function Entry Point
 *
 * This wraps the Express app for Vercel's serverless runtime.
 * Note: better-sqlite3 doesn't work on Vercel, so we use Turso (DB_MODE=turso)
 */

import app from '../server/src/app.js';

export default app;
