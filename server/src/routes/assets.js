import express from 'express';
import db from '../db/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Asset categories and types
export const ASSET_CATEGORIES = {
  EQUITY: ['STOCK', 'MUTUAL_FUND', 'ETF'],
  FIXED_INCOME: ['FD', 'RD', 'PPF', 'EPF', 'VPF', 'NPS', 'BONDS', 'NSC', 'KVP'],
  REAL_ESTATE: ['LAND', 'PROPERTY', 'REIT'],
  PHYSICAL: ['GOLD', 'SILVER', 'VEHICLE'],
  SAVINGS: ['SAVINGS_ACCOUNT', 'CURRENT_ACCOUNT'],
  CRYPTO: ['CRYPTOCURRENCY'],
  INSURANCE: ['LIC', 'ULIP', 'TERM_INSURANCE'],
  OTHER: ['CUSTOM']
};

// Apply auth middleware to all routes
router.use(authenticateToken);

// Get all assets for user
router.get('/', (req, res) => {
  try {
    const assets = db.prepare(`
      SELECT * FROM assets WHERE user_id = ? ORDER BY category, asset_type, name
    `).all(req.user.id);

    res.json({ assets });
  } catch (error) {
    console.error('Error fetching assets:', error);
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

// Get assets by category
router.get('/category/:category', (req, res) => {
  try {
    const { category } = req.params;
    const assets = db.prepare(`
      SELECT * FROM assets WHERE user_id = ? AND category = ? ORDER BY asset_type, name
    `).all(req.user.id, category.toUpperCase());

    res.json({ assets });
  } catch (error) {
    console.error('Error fetching assets by category:', error);
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

// Get single asset
router.get('/:id', (req, res) => {
  try {
    const asset = db.prepare(`
      SELECT * FROM assets WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    res.json({ asset });
  } catch (error) {
    console.error('Error fetching asset:', error);
    res.status(500).json({ error: 'Failed to fetch asset' });
  }
});

// Create new asset
router.post('/', (req, res) => {
  try {
    const {
      category, asset_type, name, symbol, exchange, quantity, avg_buy_price,
      principal, interest_rate, start_date, maturity_date, institution,
      purchase_price, current_value, location, area_sqft, balance,
      weight_grams, purity, premium, sum_assured, policy_number,
      purchase_date, notes
    } = req.body;

    if (!category || !asset_type || !name) {
      return res.status(400).json({ error: 'Category, asset_type, and name are required' });
    }

    const result = db.prepare(`
      INSERT INTO assets (
        user_id, category, asset_type, name, symbol, exchange, quantity, avg_buy_price,
        principal, interest_rate, start_date, maturity_date, institution,
        purchase_price, current_value, location, area_sqft, balance,
        weight_grams, purity, premium, sum_assured, policy_number,
        purchase_date, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id, category.toUpperCase(), asset_type.toUpperCase(), name,
      symbol || null, exchange || null, quantity || null, avg_buy_price || null,
      principal || null, interest_rate || null, start_date || null, maturity_date || null, institution || null,
      purchase_price || null, current_value || null, location || null, area_sqft || null, balance || null,
      weight_grams || null, purity || null, premium || null, sum_assured || null, policy_number || null,
      purchase_date || null, notes || null
    );

    const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({ message: 'Asset created successfully', asset });
  } catch (error) {
    console.error('Error creating asset:', error);
    res.status(500).json({ error: 'Failed to create asset' });
  }
});

// Update asset
router.put('/:id', (req, res) => {
  try {
    // First check if asset belongs to user
    const existing = db.prepare('SELECT id FROM assets WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const {
      category, asset_type, name, symbol, exchange, quantity, avg_buy_price,
      principal, interest_rate, start_date, maturity_date, institution,
      purchase_price, current_value, location, area_sqft, balance,
      weight_grams, purity, premium, sum_assured, policy_number,
      purchase_date, notes
    } = req.body;

    db.prepare(`
      UPDATE assets SET
        category = COALESCE(?, category),
        asset_type = COALESCE(?, asset_type),
        name = COALESCE(?, name),
        symbol = ?,
        exchange = ?,
        quantity = ?,
        avg_buy_price = ?,
        principal = ?,
        interest_rate = ?,
        start_date = ?,
        maturity_date = ?,
        institution = ?,
        purchase_price = ?,
        current_value = ?,
        location = ?,
        area_sqft = ?,
        balance = ?,
        weight_grams = ?,
        purity = ?,
        premium = ?,
        sum_assured = ?,
        policy_number = ?,
        purchase_date = ?,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(
      category?.toUpperCase(), asset_type?.toUpperCase(), name,
      symbol, exchange, quantity, avg_buy_price,
      principal, interest_rate, start_date, maturity_date, institution,
      purchase_price, current_value, location, area_sqft, balance,
      weight_grams, purity, premium, sum_assured, policy_number,
      purchase_date, notes,
      req.params.id, req.user.id
    );

    const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);

    res.json({ message: 'Asset updated successfully', asset });
  } catch (error) {
    console.error('Error updating asset:', error);
    res.status(500).json({ error: 'Failed to update asset' });
  }
});

// Delete asset
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM assets WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    res.json({ message: 'Asset deleted successfully' });
  } catch (error) {
    console.error('Error deleting asset:', error);
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});

// Get portfolio summary
router.get('/summary/overview', (req, res) => {
  try {
    const assets = db.prepare('SELECT * FROM assets WHERE user_id = ?').all(req.user.id);

    // Calculate totals by category
    const summary = {
      totalValue: 0,
      byCategory: {},
      assetCount: assets.length
    };

    for (const asset of assets) {
      let value = 0;

      // Calculate value based on asset type
      if (asset.quantity && asset.avg_buy_price) {
        value = asset.quantity * asset.avg_buy_price;
      } else if (asset.principal) {
        value = asset.principal;
      } else if (asset.current_value) {
        value = asset.current_value;
      } else if (asset.purchase_price) {
        value = asset.purchase_price;
      } else if (asset.balance) {
        value = asset.balance;
      }

      summary.totalValue += value;

      if (!summary.byCategory[asset.category]) {
        summary.byCategory[asset.category] = { value: 0, count: 0 };
      }
      summary.byCategory[asset.category].value += value;
      summary.byCategory[asset.category].count += 1;
    }

    res.json({ summary });
  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

export default router;
