import { createClient } from '@libsql/client';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { createRequire } from 'module';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// createRequire for loading CommonJS modules in ESM
const require = createRequire(import.meta.url);

// Determine database mode
const DB_MODE = process.env.DB_MODE || 'local';
const IS_TURSO = DB_MODE === 'turso';

console.log('[DB] Mode:', DB_MODE, 'IS_TURSO:', IS_TURSO);
console.log('[DB] TURSO_DATABASE_URL:', process.env.TURSO_DATABASE_URL ? 'set' : 'NOT SET');
console.log('[DB] TURSO_AUTH_TOKEN:', process.env.TURSO_AUTH_TOKEN ? 'set' : 'NOT SET');

let localDb = null;
let tursoClient = null;
let connectionInitialized = false;

// Lazy initialization for better serverless compatibility
function getConnection() {
  if (connectionInitialized) {
    return IS_TURSO ? tursoClient : localDb;
  }

  if (IS_TURSO) {
    // Turso Cloud Database - lazy init
    if (!tursoClient) {
      if (!process.env.TURSO_DATABASE_URL) {
        throw new Error('TURSO_DATABASE_URL environment variable is not set');
      }
      if (!process.env.TURSO_AUTH_TOKEN) {
        throw new Error('TURSO_AUTH_TOKEN environment variable is not set');
      }
      try {
        tursoClient = createClient({
          url: process.env.TURSO_DATABASE_URL,
          authToken: process.env.TURSO_AUTH_TOKEN,
        });
        console.log('[DB] Connected to Turso cloud database');
      } catch (e) {
        console.error('[DB] Failed to create Turso client:', e.message);
        throw e;
      }
    }
  } else {
    // Local SQLite Database - lazy init
    // Only load better-sqlite3 when NOT in Turso mode
    if (!localDb) {
      try {
        const Database = require('better-sqlite3');
        // Check data folder first, then root
        const dataPath = join(__dirname, '../../data/wealth.db');
        const rootPath = join(__dirname, '../../wealth.db');
        const dbPath = existsSync(dataPath) ? dataPath : rootPath;
        localDb = new Database(dbPath);
        localDb.pragma('foreign_keys = ON');
        console.log('[DB] Connected to local SQLite database:', dbPath);
      } catch (e) {
        console.error('[DB] Failed to load better-sqlite3:', e.message);
        throw new Error('Local SQLite database not available. Set DB_MODE=turso for cloud database.');
      }
    }
  }

  connectionInitialized = true;
  return IS_TURSO ? tursoClient : localDb;
}

/**
 * Database wrapper providing consistent async interface for both local SQLite and Turso
 */
const db = {
  /**
   * Execute a query and return all rows
   * @param {string} sql - SQL query
   * @param {Array} args - Query parameters
   * @returns {Promise<Array>} - Array of rows
   */
  async all(sql, args = []) {
    getConnection(); // Ensure connection is initialized
    if (IS_TURSO) {
      const result = await tursoClient.execute({ sql, args });
      return result.rows;
    } else {
      return localDb.prepare(sql).all(...args);
    }
  },

  /**
   * Execute a query and return the first row
   * @param {string} sql - SQL query
   * @param {Array} args - Query parameters
   * @returns {Promise<Object|undefined>} - First row or undefined
   */
  async get(sql, args = []) {
    getConnection(); // Ensure connection is initialized
    if (IS_TURSO) {
      const result = await tursoClient.execute({ sql, args });
      return result.rows[0];
    } else {
      return localDb.prepare(sql).get(...args);
    }
  },

  /**
   * Execute a query (INSERT, UPDATE, DELETE) and return result info
   * @param {string} sql - SQL query
   * @param {Array} args - Query parameters
   * @returns {Promise<{lastInsertRowid: number, changes: number}>}
   */
  async run(sql, args = []) {
    getConnection(); // Ensure connection is initialized
    if (IS_TURSO) {
      const result = await tursoClient.execute({ sql, args });
      return {
        lastInsertRowid: Number(result.lastInsertRowid),
        changes: result.rowsAffected,
      };
    } else {
      const stmt = localDb.prepare(sql);
      const result = stmt.run(...args);
      return {
        lastInsertRowid: Number(result.lastInsertRowid),
        changes: result.changes,
      };
    }
  },

  /**
   * Execute raw SQL (for schema operations)
   * @param {string} sql - SQL statement
   */
  async exec(sql) {
    getConnection(); // Ensure connection is initialized
    if (IS_TURSO) {
      // Split multiple statements and execute each
      const statements = sql.split(';').filter(s => s.trim());
      for (const stmt of statements) {
        if (stmt.trim()) {
          await tursoClient.execute(stmt);
        }
      }
    } else {
      localDb.exec(sql);
    }
  },

  /**
   * Execute multiple statements in a batch (for Turso optimization)
   * @param {Array<{sql: string, args: Array}>} statements
   */
  async batch(statements) {
    getConnection(); // Ensure connection is initialized
    if (IS_TURSO) {
      return await tursoClient.batch(statements);
    } else {
      // For local, execute sequentially
      const results = [];
      for (const { sql, args } of statements) {
        results.push(localDb.prepare(sql).run(...(args || [])));
      }
      return results;
    }
  },

  /**
   * Check if a column exists in a table
   * @param {string} table - Table name
   * @param {string} column - Column name
   * @returns {Promise<boolean>}
   */
  async hasColumn(table, column) {
    getConnection(); // Ensure connection is initialized
    if (IS_TURSO) {
      const result = await tursoClient.execute(`PRAGMA table_info(${table})`);
      return result.rows.some(row => row.name === column);
    } else {
      const columns = localDb.prepare(`PRAGMA table_info(${table})`).all();
      return columns.some(col => col.name === column);
    }
  },

  /**
   * Get table info
   * @param {string} table - Table name
   * @returns {Promise<Array>}
   */
  async tableInfo(table) {
    getConnection(); // Ensure connection is initialized
    if (IS_TURSO) {
      const result = await tursoClient.execute(`PRAGMA table_info(${table})`);
      return result.rows;
    } else {
      return localDb.prepare(`PRAGMA table_info(${table})`).all();
    }
  },

  // For backward compatibility - direct access to local db (sync operations)
  // Only use during migration period
  get local() {
    getConnection(); // Ensure connection is initialized
    if (!localDb) {
      throw new Error('Local database not available in Turso mode');
    }
    return localDb;
  },

  // Check if using Turso
  get isTurso() {
    return IS_TURSO;
  },

  // Prepare statement (for local only - backward compatibility)
  prepare(sql) {
    getConnection(); // Ensure connection is initialized
    if (IS_TURSO) {
      throw new Error('prepare() not available in Turso mode. Use db.all(), db.get(), or db.run() instead.');
    }
    return localDb.prepare(sql);
  },
};

/**
 * Initialize database schema
 */
export async function initializeDb() {
  // Users table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Assets table - flexible schema for all asset types
  await db.exec(`
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
  await db.exec(`
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
  await db.exec(`
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
  await db.exec(`
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
  await db.exec(`
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
  await db.exec(`
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
  await db.exec(`
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
  await db.exec(`
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
  await db.exec(`
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

  // User settings table (for preferences like insights card visibility)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      insights_card_prefs TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Price sync jobs table
  await db.exec(`
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
  await db.exec(`
    CREATE TABLE IF NOT EXISTS symbol_priority (
      symbol TEXT PRIMARY KEY,
      priority INTEGER DEFAULT 0,
      last_requested DATETIME,
      request_count INTEGER DEFAULT 0
    )
  `);

  // Create indexes
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_assets_user_id ON assets(user_id);
    CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category);
    CREATE INDEX IF NOT EXISTS idx_assets_user_category ON assets(user_id, category);
    CREATE INDEX IF NOT EXISTS idx_assets_user_status ON assets(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_price_cache_symbol ON price_cache(symbol);
    CREATE INDEX IF NOT EXISTS idx_transactions_asset_id ON transactions(asset_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, transaction_date DESC);
    CREATE INDEX IF NOT EXISTS idx_portfolio_history_user_date ON portfolio_history(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
    CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
    CREATE INDEX IF NOT EXISTS idx_goals_user_status ON goals(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_goal_asset_links_goal_id ON goal_asset_links(goal_id);
    CREATE INDEX IF NOT EXISTS idx_goal_asset_links_asset_id ON goal_asset_links(asset_id);
    CREATE INDEX IF NOT EXISTS idx_goal_contributions_goal_id ON goal_contributions(goal_id);
    CREATE INDEX IF NOT EXISTS idx_goal_history_goal_id_date ON goal_history(goal_id, date);
    CREATE INDEX IF NOT EXISTS idx_metal_prices_metal_date ON metal_prices(metal, fetched_at);
    CREATE INDEX IF NOT EXISTS idx_price_sync_jobs_status ON price_sync_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_symbol_priority_priority ON symbol_priority(priority DESC)
  `);

  // Run migration for existing equity assets (local only for now)
  if (!IS_TURSO) {
    await migrateExistingEquityAssets();
  }

  console.log('Database initialized successfully');
}

/**
 * Migration: Convert existing equity assets to initial transactions
 */
async function migrateExistingEquityAssets() {
  const equityAssets = await db.all(`
    SELECT a.* FROM assets a
    WHERE a.category = 'EQUITY'
    AND a.quantity > 0
    AND a.avg_buy_price > 0
    AND NOT EXISTS (
      SELECT 1 FROM transactions t WHERE t.asset_id = a.id
    )
  `);

  if (equityAssets.length === 0) return;

  for (const asset of equityAssets) {
    const transactionDate = asset.purchase_date || new Date().toISOString().split('T')[0];
    await db.run(`
      INSERT INTO transactions (
        asset_id, user_id, type, quantity, price, total_amount, transaction_date, is_initial_holding
      ) VALUES (?, ?, 'BUY', ?, ?, ?, ?, 1)
    `, [
      asset.id,
      asset.user_id,
      asset.quantity,
      asset.avg_buy_price,
      asset.quantity * asset.avg_buy_price,
      transactionDate
    ]);
  }

  console.log(`Migrated ${equityAssets.length} existing equity assets to transactions`);
}

export default db;
