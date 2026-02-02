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
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
  console.log(`Database mode: ${process.env.DB_MODE || 'local'}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

  // Start background price sync service
  // Runs on: localhost (local DB) and Serv00/persistent servers (Turso)
  // Skipped on: Vercel (serverless - uses cron instead)
  const isServerless = process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (!isServerless) {
    console.log('Starting background price sync service...');
    startPriceSync();
  }
});
