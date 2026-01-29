/**
 * Express App Configuration
 *
 * This module exports the configured Express app for both:
 * - Local development (via index.js)
 * - Vercel serverless deployment (via api/index.js)
 */

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dns from 'dns';
import dotenv from 'dotenv';
import { initializeDb } from './db/database.js';
import authRoutes from './routes/auth.js';
import assetRoutes from './routes/assets.js';
import priceRoutes from './routes/prices.js';
import transactionRoutes from './routes/transactions.js';
import portfolioRoutes from './routes/portfolio.js';
import metalsRoutes from './routes/metals.js';
import goalsRoutes from './routes/goals.js';
import backupRoutes from './routes/backup.js';

// Force IPv4 first to avoid IPv6 connection issues with external APIs
dns.setDefaultResultOrder('ipv4first');

dotenv.config();

// Validate required environment variables
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required');
  }
}
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET must be at least 32 characters long');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
}

const app = express();

// Trust proxy for Vercel
app.set('trust proxy', 1);

// CORS configuration - restrict origins in production
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173']
    : true, // Allow all in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Rate limiting - more relaxed in development
const isDev = process.env.NODE_ENV !== 'production';

// Global rate limiter: 1000 requests per 15 minutes in dev, 200 in production
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 1000 : 200,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev, // Skip rate limiting in development
});

// Data rate limiter: skip in dev, 100 per 15 minutes in production
const dataLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 500 : 100,
  message: { error: 'Too many data requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev, // Skip rate limiting in development
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow embedding for API responses
}));
app.use(cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: '10kb' })); // Limit request body size
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use('/api/', globalLimiter); // Apply global rate limit to all API routes

// Initialize database (async for Turso, sync for local SQLite)
let dbInitialized = false;
let dbInitPromise = null;

async function ensureDbInitialized() {
  if (dbInitialized) return;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = initializeDb().then(() => {
    dbInitialized = true;
    console.log('[App] Database initialized');
  });

  return dbInitPromise;
}

// Middleware to ensure DB is initialized before handling requests
app.use(async (req, res, next) => {
  try {
    await ensureDbInitialized();
    next();
  } catch (error) {
    console.error('[App] Database initialization failed:', error);
    res.status(500).json({ error: 'Database initialization failed' });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/assets', dataLimiter, assetRoutes); // Stricter rate limit for data operations
app.use('/api/prices', priceRoutes);
app.use('/api/transactions', dataLimiter, transactionRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/metals', metalsRoutes);
app.use('/api/goals', dataLimiter, goalsRoutes); // Stricter rate limit for goal operations
app.use('/api/backup', dataLimiter, backupRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Wealth Tracker API is running',
    mode: process.env.DB_MODE || 'local',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[App] Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
