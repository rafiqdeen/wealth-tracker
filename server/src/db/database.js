import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new Database(join(__dirname, '../../data/wealth.db'));

export function initializeDb() {
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Assets table - flexible schema for all asset types
  db.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      name TEXT NOT NULL,

      -- Market assets (stocks, MF, ETF, crypto)
      symbol TEXT,
      exchange TEXT,
      quantity REAL,
      avg_buy_price REAL,

      -- Fixed income (FD, RD, PPF, EPF, NPS)
      principal REAL,
      interest_rate REAL,
      start_date TEXT,
      maturity_date TEXT,
      institution TEXT,

      -- Real estate
      purchase_price REAL,
      current_value REAL,
      location TEXT,
      area_sqft REAL,

      -- Savings accounts
      balance REAL,

      -- Physical assets (gold, silver)
      weight_grams REAL,
      purity TEXT,

      -- Insurance
      premium REAL,
      sum_assured REAL,
      policy_number TEXT,

      -- Common fields
      purchase_date TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Price cache table
  db.exec(`
    CREATE TABLE IF NOT EXISTS price_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      price REAL NOT NULL,
      currency TEXT DEFAULT 'INR',
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(symbol)
    )
  `);

  // Create indexes for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_assets_user_id ON assets(user_id);
    CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category);
    CREATE INDEX IF NOT EXISTS idx_price_cache_symbol ON price_cache(symbol);
  `);

  console.log('Database initialized successfully');
}

export default db;
