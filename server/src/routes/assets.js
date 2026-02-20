import express from 'express';
import db from '../db/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { recalculateAssetFromTransactions, recalculateMultipleAssets } from '../utils/assetCalculations.js';

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
router.get('/', async (req, res) => {
  try {
    const assets = await db.all(
      'SELECT * FROM assets WHERE user_id = ? ORDER BY category, asset_type, name',
      [req.user.id]
    );

    res.json({ assets });
  } catch (error) {
    console.error('Error fetching assets:', error);
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

// Get assets by category
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const assets = await db.all(
      'SELECT * FROM assets WHERE user_id = ? AND category = ? ORDER BY asset_type, name',
      [req.user.id, category.toUpperCase()]
    );

    res.json({ assets });
  } catch (error) {
    console.error('Error fetching assets by category:', error);
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

// Get single asset
router.get('/:id', async (req, res) => {
  try {
    const asset = await db.get(
      'SELECT * FROM assets WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    res.json({ asset });
  } catch (error) {
    console.error('Error fetching asset:', error);
    res.status(500).json({ error: 'Failed to fetch asset' });
  }
});

// Create new asset or record transaction
router.post('/', async (req, res) => {
  try {
    const {
      category, asset_type, name, symbol, exchange, quantity, price,
      transaction_type, // BUY or SELL for equity
      principal, interest_rate, start_date, maturity_date, institution,
      purchase_price, current_value, location, area_sqft, balance,
      weight_grams, purity, premium, sum_assured, policy_number,
      purchase_date, notes, sector
    } = req.body;

    if (!category || !asset_type || !name) {
      return res.status(400).json({ error: 'Category, asset_type, and name are required' });
    }

    const upperCategory = category.toUpperCase();

    // EQUITY assets must have a symbol for price fetching
    if (upperCategory === 'EQUITY' && !symbol) {
      return res.status(400).json({ error: 'Symbol is required for equity assets' });
    }
    const upperAssetType = asset_type.toUpperCase();
    const transactionDate = purchase_date || new Date().toISOString().split('T')[0];

    // Handle EQUITY assets with Buy/Sell transactions
    if (upperCategory === 'EQUITY' && quantity && price) {
      const txnType = (transaction_type || 'BUY').toUpperCase();

      // Check if asset already exists
      let existingAsset = await db.get(
        "SELECT * FROM assets WHERE user_id = ? AND category = 'EQUITY' AND symbol = ? AND asset_type = ?",
        [req.user.id, symbol, upperAssetType]
      );

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
        await db.run(
          `INSERT INTO transactions (
            asset_id, user_id, type, quantity, price, total_amount, transaction_date, notes, realized_gain
          ) VALUES (?, ?, 'SELL', ?, ?, ?, ?, ?, ?)`,
          [
            existingAsset.id,
            req.user.id,
            quantity,
            price,
            proceeds,
            transactionDate,
            notes || null,
            realizedGain
          ]
        );

        // Recalculate asset
        await recalculateAssetFromTransactions(existingAsset.id);

        const updatedAsset = await db.get('SELECT * FROM assets WHERE id = ?', [existingAsset.id]);
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
          // Update sector if provided and not already set
          if (sector && !existingAsset.sector) {
            await db.run('UPDATE assets SET sector = ? WHERE id = ?', [sector, assetId]);
          }
        } else {
          // Create new asset
          const result = await db.run(
            `INSERT INTO assets (
              user_id, category, asset_type, name, symbol, exchange, quantity, avg_buy_price, status, sector
            ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'ACTIVE', ?)`,
            [
              req.user.id, upperCategory, upperAssetType, name,
              symbol || null, exchange || null, sector || null
            ]
          );
          assetId = result.lastInsertRowid;
        }

        // Create BUY transaction
        await db.run(
          `INSERT INTO transactions (
            asset_id, user_id, type, quantity, price, total_amount, transaction_date, notes
          ) VALUES (?, ?, 'BUY', ?, ?, ?, ?, ?)`,
          [
            assetId,
            req.user.id,
            quantity,
            price,
            quantity * price,
            transactionDate,
            notes || null
          ]
        );

        // Recalculate asset
        await recalculateAssetFromTransactions(assetId);

        const updatedAsset = await db.get('SELECT * FROM assets WHERE id = ?', [assetId]);
        return res.status(201).json({
          message: existingAsset ? 'Buy transaction recorded successfully' : 'Asset created with buy transaction',
          asset: updatedAsset
        });
      }
    }

    // Non-EQUITY assets: create normally
    const result = await db.run(
      `INSERT INTO assets (
        user_id, category, asset_type, name, symbol, exchange, quantity, avg_buy_price,
        principal, interest_rate, start_date, maturity_date, institution,
        purchase_price, current_value, location, area_sqft, balance,
        weight_grams, purity, premium, sum_assured, policy_number,
        purchase_date, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id, upperCategory, upperAssetType, name,
        symbol || null, exchange || null, quantity || null, price || null,
        principal || null, interest_rate || null, start_date || null, maturity_date || null, institution || null,
        purchase_price || null, current_value || null, location || null, area_sqft || null, balance || null,
        weight_grams || null, purity || null, premium || null, sum_assured || null, policy_number || null,
        purchase_date || null, notes || null
      ]
    );

    const asset = await db.get('SELECT * FROM assets WHERE id = ?', [result.lastInsertRowid]);

    res.status(201).json({ message: 'Asset created successfully', asset });
  } catch (error) {
    console.error('Error creating asset:', error);
    res.status(500).json({ error: 'Failed to create asset' });
  }
});

// Update asset
router.put('/:id', async (req, res) => {
  try {
    // First check if asset belongs to user
    const existing = await db.get('SELECT id FROM assets WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const {
      category, asset_type, name, symbol, exchange, quantity, avg_buy_price,
      principal, interest_rate, start_date, maturity_date, institution,
      purchase_price, current_value, location, area_sqft, balance,
      weight_grams, purity, premium, sum_assured, policy_number,
      purchase_date, notes, sector
    } = req.body;

    await db.run(
      `UPDATE assets SET
        category = COALESCE(?, category),
        asset_type = COALESCE(?, asset_type),
        name = COALESCE(?, name),
        symbol = COALESCE(?, symbol),
        exchange = COALESCE(?, exchange),
        quantity = COALESCE(?, quantity),
        avg_buy_price = COALESCE(?, avg_buy_price),
        principal = COALESCE(?, principal),
        interest_rate = COALESCE(?, interest_rate),
        start_date = COALESCE(?, start_date),
        maturity_date = COALESCE(?, maturity_date),
        institution = COALESCE(?, institution),
        purchase_price = COALESCE(?, purchase_price),
        current_value = COALESCE(?, current_value),
        location = COALESCE(?, location),
        area_sqft = COALESCE(?, area_sqft),
        balance = COALESCE(?, balance),
        weight_grams = COALESCE(?, weight_grams),
        purity = COALESCE(?, purity),
        premium = COALESCE(?, premium),
        sum_assured = COALESCE(?, sum_assured),
        policy_number = COALESCE(?, policy_number),
        purchase_date = COALESCE(?, purchase_date),
        notes = COALESCE(?, notes),
        sector = COALESCE(?, sector),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?`,
      [
        category?.toUpperCase(), asset_type?.toUpperCase(), name,
        symbol, exchange, quantity, avg_buy_price,
        principal, interest_rate, start_date, maturity_date, institution,
        purchase_price, current_value, location, area_sqft, balance,
        weight_grams, purity, premium, sum_assured, policy_number,
        purchase_date, notes, sector,
        req.params.id, req.user.id
      ]
    );

    const asset = await db.get('SELECT * FROM assets WHERE id = ?', [req.params.id]);

    res.json({ message: 'Asset updated successfully', asset });
  } catch (error) {
    console.error('Error updating asset:', error);
    res.status(500).json({ error: 'Failed to update asset' });
  }
});

// Delete asset
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.run('DELETE FROM assets WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);

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
router.get('/summary/overview', async (req, res) => {
  try {
    const assets = await db.all('SELECT * FROM assets WHERE user_id = ?', [req.user.id]);

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

// Recalculate all equity assets from their transactions
// Uses batch query to avoid N+1 problem (2 queries instead of N+1)
router.post('/recalculate', async (req, res) => {
  try {
    // Get all equity asset IDs for this user
    const equityAssets = await db.all(
      "SELECT id FROM assets WHERE user_id = ? AND category = 'EQUITY'",
      [req.user.id]
    );

    const assetIds = equityAssets.map(a => a.id);

    // Batch recalculate all assets (single query for all transactions)
    const { recalculated } = await recalculateMultipleAssets(assetIds);

    res.json({
      message: `Recalculated ${recalculated} equity assets`,
      count: recalculated
    });
  } catch (error) {
    console.error('Error recalculating assets:', error);
    res.status(500).json({ error: 'Failed to recalculate assets' });
  }
});

export default router;
