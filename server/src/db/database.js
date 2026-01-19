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

  // Transactions table for buy/sell tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('BUY', 'SELL')),
      quantity REAL NOT NULL,
      price REAL NOT NULL,
      total_amount REAL NOT NULL,
      transaction_date TEXT NOT NULL,
      notes TEXT,
      realized_gain REAL,
      is_initial_holding INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Portfolio history for performance tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS portfolio_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      total_value REAL NOT NULL,
      total_invested REAL NOT NULL,
      day_change REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, date)
    )
  `);

  // Add status column to assets if not exists
  const assetColumns = db.prepare("PRAGMA table_info(assets)").all();
  const hasStatus = assetColumns.some(col => col.name === 'status');
  if (!hasStatus) {
    db.exec(`ALTER TABLE assets ADD COLUMN status TEXT DEFAULT 'ACTIVE'`);
  }

  // Create indexes for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_assets_user_id ON assets(user_id);
    CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category);
    CREATE INDEX IF NOT EXISTS idx_price_cache_symbol ON price_cache(symbol);
    CREATE INDEX IF NOT EXISTS idx_transactions_asset_id ON transactions(asset_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
    CREATE INDEX IF NOT EXISTS idx_portfolio_history_user_date ON portfolio_history(user_id, date);
  `);

  // Migrate existing equity assets to transactions (one-time migration)
  migrateExistingEquityAssets();

  console.log('Database initialized successfully');
}

// Migration: Convert existing equity assets with quantity/avg_buy_price to initial transactions
function migrateExistingEquityAssets() {
  // Find equity assets that have quantity but no transactions yet
  const equityAssets = db.prepare(`
    SELECT a.* FROM assets a
    WHERE a.category = 'EQUITY'
    AND a.quantity > 0
    AND a.avg_buy_price > 0
    AND NOT EXISTS (
      SELECT 1 FROM transactions t WHERE t.asset_id = a.id
    )
  `).all();

  if (equityAssets.length === 0) return;

  const insertTxn = db.prepare(`
    INSERT INTO transactions (
      asset_id, user_id, type, quantity, price, total_amount, transaction_date, is_initial_holding
    ) VALUES (?, ?, 'BUY', ?, ?, ?, ?, 1)
  `);

  for (const asset of equityAssets) {
    const transactionDate = asset.purchase_date || new Date().toISOString().split('T')[0];
    insertTxn.run(
      asset.id,
      asset.user_id,
      asset.quantity,
      asset.avg_buy_price,
      asset.quantity * asset.avg_buy_price,
      transactionDate
    );
  }

  console.log(`Migrated ${equityAssets.length} existing equity assets to transactions`);
}

export default db;
