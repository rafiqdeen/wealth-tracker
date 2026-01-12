import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeDb } from './db/database.js';
import authRoutes from './routes/auth.js';
import assetRoutes from './routes/assets.js';
import priceRoutes from './routes/prices.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database
initializeDb();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/prices', priceRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Wealth Tracker API is running' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
