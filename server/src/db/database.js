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

  // Price cache table - enhanced for holiday handling
  db.exec(`
    CREATE TABLE IF NOT EXISTS price_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      price REAL NOT NULL,
      previous_close REAL,
      change_amount REAL DEFAULT 0,
      change_percent REAL DEFAULT 0,
      currency TEXT DEFAULT 'INR',
      price_date TEXT,
      market_open INTEGER DEFAULT 1,
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(symbol)
    )
  `);

  // Metal prices table (gold, silver)
  db.exec(`
    CREATE TABLE IF NOT EXISTS metal_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metal TEXT NOT NULL,
      price_per_gram REAL NOT NULL,
      price_per_gram_24k REAL NOT NULL,
      currency TEXT DEFAULT 'INR',
      fetched_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(metal, fetched_at)
    )
  `);

  // Create index for metal prices
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_metal_prices_metal_date ON metal_prices(metal, fetched_at);
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

  // Add appreciation_rate column for Real Estate auto-valuation
  const hasAppreciationRate = assetColumns.some(col => col.name === 'appreciation_rate');
  if (!hasAppreciationRate) {
    db.exec(`ALTER TABLE assets ADD COLUMN appreciation_rate REAL`);
  }

  // Add new columns to price_cache for improved holiday handling
  const priceCacheColumns = db.prepare("PRAGMA table_info(price_cache)").all();
  const hasPreviousClose = priceCacheColumns.some(col => col.name === 'previous_close');
  if (!hasPreviousClose) {
    db.exec(`ALTER TABLE price_cache ADD COLUMN previous_close REAL`);
    db.exec(`ALTER TABLE price_cache ADD COLUMN change_amount REAL DEFAULT 0`);
    db.exec(`ALTER TABLE price_cache ADD COLUMN change_percent REAL DEFAULT 0`);
    db.exec(`ALTER TABLE price_cache ADD COLUMN price_date TEXT`);
    db.exec(`ALTER TABLE price_cache ADD COLUMN market_open INTEGER DEFAULT 1`);
    console.log('Migrated price_cache table with new columns for holiday handling');
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

  // Goals table - main goals storage
  db.exec(`
    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      target_amount REAL NOT NULL,
      target_date TEXT,
      progress_mode TEXT DEFAULT 'AUTO',
      manual_current_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'ACTIVE',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Goal-Asset links table - connects goals to assets with allocation
  db.exec(`
    CREATE TABLE IF NOT EXISTS goal_asset_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id INTEGER NOT NULL,
      asset_id INTEGER NOT NULL,
      link_type TEXT DEFAULT 'FUNDING',
      allocation_percent REAL DEFAULT 100,
      allocation_mode TEXT DEFAULT 'PERCENT',
      fixed_allocation_amount REAL,
      initial_value_snapshot REAL,
      link_date TEXT DEFAULT (date('now')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
      UNIQUE(goal_id, asset_id)
    )
  `);

  // Goal contributions table - tracks manual and auto contributions
  db.exec(`
    CREATE TABLE IF NOT EXISTS goal_contributions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id INTEGER NOT NULL,
      contribution_type TEXT NOT NULL,
      amount REAL NOT NULL,
      source_asset_id INTEGER,
      description TEXT,
      contribution_date TEXT DEFAULT (date('now')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
      FOREIGN KEY (source_asset_id) REFERENCES assets(id) ON DELETE SET NULL
    )
  `);

  // Goal history table - daily snapshots for progress tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS goal_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      current_value REAL NOT NULL,
      progress_percent REAL NOT NULL,
      linked_assets_value REAL DEFAULT 0,
      manual_value REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
      UNIQUE(goal_id, date)
    )
  `);

  // Create indexes for goals tables
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
    CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
    CREATE INDEX IF NOT EXISTS idx_goals_user_status ON goals(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_goal_asset_links_goal_id ON goal_asset_links(goal_id);
    CREATE INDEX IF NOT EXISTS idx_goal_asset_links_asset_id ON goal_asset_links(asset_id);
    CREATE INDEX IF NOT EXISTS idx_goal_contributions_goal_id ON goal_contributions(goal_id);
    CREATE INDEX IF NOT EXISTS idx_goal_history_goal_id_date ON goal_history(goal_id, date);
  `);

  // Additional performance indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_price_cache_symbol_date ON price_cache(symbol, fetched_at DESC);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, transaction_date DESC);
    CREATE INDEX IF NOT EXISTS idx_assets_user_category ON assets(user_id, category);
    CREATE INDEX IF NOT EXISTS idx_assets_user_status ON assets(user_id, status);
  `);

  // Price sync jobs table - tracks background sync job history
  db.exec(`
    CREATE TABLE IF NOT EXISTS price_sync_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      symbols_total INTEGER DEFAULT 0,
      symbols_fetched INTEGER DEFAULT 0,
      symbols_failed INTEGER DEFAULT 0,
      error_message TEXT,
      started_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Symbol priority table - tracks frequently accessed symbols for sync prioritization
  db.exec(`
    CREATE TABLE IF NOT EXISTS symbol_priority (
      symbol TEXT PRIMARY KEY,
      priority INTEGER DEFAULT 0,
      last_requested DATETIME,
      request_count INTEGER DEFAULT 0
    )
  `);

  // Indexes for sync tables
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_price_sync_jobs_status ON price_sync_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_price_sync_jobs_created ON price_sync_jobs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_symbol_priority_priority ON symbol_priority(priority DESC);
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
