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
import { startPriceSync } from './services/priceSync.js';

// Force IPv4 first to avoid IPv6 connection issues with external APIs
dns.setDefaultResultOrder('ipv4first');

dotenv.config();

// Validate required environment variables
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set');
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET must be at least 32 characters long');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
  console.error('FATAL: CORS_ORIGIN environment variable is required in production');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

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

// Initialize database
initializeDb();

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
  res.json({ status: 'ok', message: 'Wealth Tracker API is running' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Start background price sync service
  startPriceSync();
});
