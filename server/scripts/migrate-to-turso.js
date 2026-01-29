#!/usr/bin/env node
/**
 * Migration Script: Local SQLite to Turso Cloud Database
 *
 * This script migrates all data from the local SQLite database to Turso.
 *
 * Usage:
 *   node scripts/migrate-to-turso.js
 *
 * Prerequisites:
 *   - Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in .env
 *   - Local wealth.db file exists with data
 */

import { createClient } from '@libsql/client';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Tables to migrate (in order to respect foreign key constraints)
const TABLES = [
  'users',
  'assets',
  'transactions',
  'price_cache',
  'metal_prices',
  'portfolio_history',
  'goals',
  'goal_asset_links',
  'goal_contributions',
  'goal_history',
  'price_sync_jobs',
  'symbol_priority',
];

async function main() {
  console.log('=== SQLite to Turso Migration Script ===\n');

  // Validate environment
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    console.error('Error: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set in .env');
    process.exit(1);
  }

  // Connect to local SQLite
  // Try the data folder first (where actual data is), then fall back to root
  const dataPath = join(__dirname, '../data/wealth.db');
  const rootPath = join(__dirname, '../wealth.db');

  let localDbPath;
  if (fs.existsSync(dataPath)) {
    localDbPath = dataPath;
  } else if (fs.existsSync(rootPath)) {
    localDbPath = rootPath;
  } else {
    console.error('No database file found');
    process.exit(1);
  }

  console.log(`Local database: ${localDbPath}`);

  let localDb;
  try {
    localDb = new Database(localDbPath);
    console.log('Connected to local SQLite database');
  } catch (error) {
    console.error('Failed to connect to local database:', error.message);
    process.exit(1);
  }

  // Connect to Turso
  console.log(`\nTurso database: ${process.env.TURSO_DATABASE_URL}`);
  const turso = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  console.log('Connected to Turso cloud database');

  // Test Turso connection
  try {
    await turso.execute('SELECT 1');
    console.log('Turso connection verified\n');
  } catch (error) {
    console.error('Failed to connect to Turso:', error.message);
    process.exit(1);
  }

  // Initialize schema on Turso
  console.log('Initializing schema on Turso...');
  await initializeTursoSchema(turso);
  console.log('Schema initialized\n');

  // Migrate each table
  let totalRows = 0;
  for (const table of TABLES) {
    const count = await migrateTable(localDb, turso, table);
    totalRows += count;
  }

  console.log(`\n=== Migration Complete ===`);
  console.log(`Total rows migrated: ${totalRows}`);

  // Close connections
  localDb.close();
  console.log('\nConnections closed. Migration successful!');
}

async function initializeTursoSchema(turso) {
  // Users table
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Assets table
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      name TEXT NOT NULL,
      symbol TEXT,
      exchange TEXT,
      quantity REAL,
      avg_buy_price REAL,
      principal REAL,
      interest_rate REAL,
      start_date TEXT,
      maturity_date TEXT,
      institution TEXT,
      purchase_price REAL,
      current_value REAL,
      location TEXT,
      area_sqft REAL,
      balance REAL,
      weight_grams REAL,
      purity TEXT,
      premium REAL,
      sum_assured REAL,
      policy_number TEXT,
      purchase_date TEXT,
      notes TEXT,
      status TEXT DEFAULT 'ACTIVE',
      appreciation_rate REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Price cache table
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS price_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL UNIQUE,
      price REAL NOT NULL,
      previous_close REAL,
      change_amount REAL DEFAULT 0,
      change_percent REAL DEFAULT 0,
      currency TEXT DEFAULT 'INR',
      source TEXT DEFAULT 'live',
      price_date TEXT,
      market_open INTEGER DEFAULT 1,
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Metal prices table
  await turso.execute(`
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

  // Transactions table
  await turso.execute(`
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

  // Portfolio history table
  await turso.execute(`
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

  // Goals table
  await turso.execute(`
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

  // Goal-Asset links table
  await turso.execute(`
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

  // Goal contributions table
  await turso.execute(`
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

  // Goal history table
  await turso.execute(`
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

  // Price sync jobs table
  await turso.execute(`
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

  // Symbol priority table
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS symbol_priority (
      symbol TEXT PRIMARY KEY,
      priority INTEGER DEFAULT 0,
      last_requested DATETIME,
      request_count INTEGER DEFAULT 0
    )
  `);

  // Create indexes
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_assets_user_id ON assets(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category)',
    'CREATE INDEX IF NOT EXISTS idx_assets_user_category ON assets(user_id, category)',
    'CREATE INDEX IF NOT EXISTS idx_assets_user_status ON assets(user_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_price_cache_symbol ON price_cache(symbol)',
    'CREATE INDEX IF NOT EXISTS idx_transactions_asset_id ON transactions(asset_id)',
    'CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date)',
    'CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, transaction_date DESC)',
    'CREATE INDEX IF NOT EXISTS idx_portfolio_history_user_date ON portfolio_history(user_id, date)',
    'CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status)',
    'CREATE INDEX IF NOT EXISTS idx_goals_user_status ON goals(user_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_goal_asset_links_goal_id ON goal_asset_links(goal_id)',
    'CREATE INDEX IF NOT EXISTS idx_goal_asset_links_asset_id ON goal_asset_links(asset_id)',
    'CREATE INDEX IF NOT EXISTS idx_goal_contributions_goal_id ON goal_contributions(goal_id)',
    'CREATE INDEX IF NOT EXISTS idx_goal_history_goal_id_date ON goal_history(goal_id, date)',
    'CREATE INDEX IF NOT EXISTS idx_metal_prices_metal_date ON metal_prices(metal, fetched_at)',
    'CREATE INDEX IF NOT EXISTS idx_price_sync_jobs_status ON price_sync_jobs(status)',
    'CREATE INDEX IF NOT EXISTS idx_symbol_priority_priority ON symbol_priority(priority DESC)',
  ];

  for (const indexSql of indexes) {
    await turso.execute(indexSql);
  }
}

async function migrateTable(localDb, turso, tableName) {
  console.log(`Migrating ${tableName}...`);

  // Check if table exists locally
  const tableExists = localDb.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name=?
  `).get(tableName);

  if (!tableExists) {
    console.log(`  - Table ${tableName} doesn't exist locally, skipping`);
    return 0;
  }

  // Get all rows from local table
  const rows = localDb.prepare(`SELECT * FROM ${tableName}`).all();

  if (rows.length === 0) {
    console.log(`  - No data in ${tableName}`);
    return 0;
  }

  // Get column names
  const columns = Object.keys(rows[0]);

  // Clear existing data in Turso (optional - comment out to append instead)
  try {
    await turso.execute(`DELETE FROM ${tableName}`);
  } catch (e) {
    // Table might not exist yet, ignore
  }

  // Insert rows in batches
  const BATCH_SIZE = 100;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    for (const row of batch) {
      const values = columns.map(col => row[col]);
      const placeholders = columns.map(() => '?').join(', ');

      try {
        await turso.execute({
          sql: `INSERT OR REPLACE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`,
          args: values,
        });
        inserted++;
      } catch (error) {
        console.error(`  - Error inserting row in ${tableName}:`, error.message);
        console.error(`    Row data:`, JSON.stringify(row).substring(0, 100));
      }
    }
  }

  console.log(`  - Migrated ${inserted}/${rows.length} rows`);
  return inserted;
}

// Run the migration
main().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});
