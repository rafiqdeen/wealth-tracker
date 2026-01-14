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

// Helper: Recalculate asset quantity and avg_buy_price from transactions
function recalculateAssetFromTransactions(assetId) {
  const transactions = db.prepare(`
    SELECT * FROM transactions WHERE asset_id = ? ORDER BY transaction_date, id
  `).all(assetId);

  let totalQuantity = 0;
  let totalCost = 0;

  for (const txn of transactions) {
    if (txn.type === 'BUY') {
      totalCost += txn.total_amount;
      totalQuantity += txn.quantity;
    } else if (txn.type === 'SELL') {
      const avgCostPerUnit = totalQuantity > 0 ? totalCost / totalQuantity : 0;
      totalCost -= avgCostPerUnit * txn.quantity;
      totalQuantity -= txn.quantity;
    }
  }

  const avgBuyPrice = totalQuantity > 0 ? totalCost / totalQuantity : 0;
  const status = totalQuantity <= 0 ? 'CLOSED' : 'ACTIVE';

  db.prepare(`
    UPDATE assets SET quantity = ?, avg_buy_price = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(totalQuantity, avgBuyPrice, status, assetId);

  return { quantity: totalQuantity, avg_buy_price: avgBuyPrice, status };
}

// Create new asset or record transaction
router.post('/', (req, res) => {
  try {
    const {
      category, asset_type, name, symbol, exchange, quantity, price,
      transaction_type, // BUY or SELL for equity
      principal, interest_rate, start_date, maturity_date, institution,
      purchase_price, current_value, location, area_sqft, balance,
      weight_grams, purity, premium, sum_assured, policy_number,
      purchase_date, notes
    } = req.body;

    if (!category || !asset_type || !name) {
      return res.status(400).json({ error: 'Category, asset_type, and name are required' });
    }

    const upperCategory = category.toUpperCase();
    const upperAssetType = asset_type.toUpperCase();
    const transactionDate = purchase_date || new Date().toISOString().split('T')[0];

    // Handle EQUITY assets with Buy/Sell transactions
    if (upperCategory === 'EQUITY' && quantity && price) {
      const txnType = (transaction_type || 'BUY').toUpperCase();

      // Check if asset already exists
      let existingAsset = db.prepare(`
        SELECT * FROM assets
        WHERE user_id = ? AND category = 'EQUITY' AND symbol = ? AND asset_type = ?
      `).get(req.user.id, symbol, upperAssetType);

      if (txnType === 'SELL') {
        // For SELL, asset must exist
        if (!existingAsset) {
          return res.status(400).json({ error: `You don't own any ${symbol} to sell` });
        }

        // Validate quantity
        if (quantity > existingAsset.quantity) {
          return res.status(400).json({
            error: `Cannot sell ${quantity} units. You only have ${existingAsset.quantity} units.`
          });
        }

        // Calculate realized gain
        const avgBuyPrice = existingAsset.avg_buy_price || 0;
        const costBasis = avgBuyPrice * quantity;
        const proceeds = price * quantity;
        const realizedGain = proceeds - costBasis;

        // Create SELL transaction
        db.prepare(`
          INSERT INTO transactions (
            asset_id, user_id, type, quantity, price, total_amount, transaction_date, notes, realized_gain
          ) VALUES (?, ?, 'SELL', ?, ?, ?, ?, ?, ?)
        `).run(
          existingAsset.id,
          req.user.id,
          quantity,
          price,
          proceeds,
          transactionDate,
          notes || null,
          realizedGain
        );

        // Recalculate asset
        recalculateAssetFromTransactions(existingAsset.id);

        const updatedAsset = db.prepare('SELECT * FROM assets WHERE id = ?').get(existingAsset.id);
        return res.status(201).json({
          message: 'Sell transaction recorded successfully',
          asset: updatedAsset,
          realized_gain: realizedGain
        });

      } else {
        // BUY transaction
        let assetId;

        if (existingAsset) {
          // Add to existing asset
          assetId = existingAsset.id;
        } else {
          // Create new asset
          const result = db.prepare(`
            INSERT INTO assets (
              user_id, category, asset_type, name, symbol, exchange, quantity, avg_buy_price, status
            ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'ACTIVE')
          `).run(
            req.user.id, upperCategory, upperAssetType, name,
            symbol || null, exchange || null
          );
          assetId = result.lastInsertRowid;
        }

        // Create BUY transaction
        db.prepare(`
          INSERT INTO transactions (
            asset_id, user_id, type, quantity, price, total_amount, transaction_date, notes
          ) VALUES (?, ?, 'BUY', ?, ?, ?, ?, ?)
        `).run(
          assetId,
          req.user.id,
          quantity,
          price,
          quantity * price,
          transactionDate,
          notes || null
        );

        // Recalculate asset
        recalculateAssetFromTransactions(assetId);

        const updatedAsset = db.prepare('SELECT * FROM assets WHERE id = ?').get(assetId);
        return res.status(201).json({
          message: existingAsset ? 'Buy transaction recorded successfully' : 'Asset created with buy transaction',
          asset: updatedAsset
        });
      }
    }

    // Non-EQUITY assets: create normally
    const result = db.prepare(`
      INSERT INTO assets (
        user_id, category, asset_type, name, symbol, exchange, quantity, avg_buy_price,
        principal, interest_rate, start_date, maturity_date, institution,
        purchase_price, current_value, location, area_sqft, balance,
        weight_grams, purity, premium, sum_assured, policy_number,
        purchase_date, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id, upperCategory, upperAssetType, name,
      symbol || null, exchange || null, quantity || null, price || null,
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
