/**
 * Local Development Server Entry Point
 *
 * This file is used for local development only.
 * For production (Vercel), see api/index.js which imports app.js directly.
 */

import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import { startPriceSync } from './services/priceSync.js';

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Database mode: ${process.env.DB_MODE || 'local'}`);

  // Start background price sync service (only for local development)
  // On Vercel, this would need to be a separate cron job
  if (process.env.DB_MODE !== 'turso') {
    startPriceSync();
  }
});
