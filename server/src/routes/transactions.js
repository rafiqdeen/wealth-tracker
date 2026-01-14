import express from 'express';
import db from '../db/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticateToken);

// Helper: Recalculate asset quantity and avg_buy_price from transactions
function recalculateAsset(assetId) {
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
      // For weighted average, reduce quantity but adjust cost proportionally
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

// Helper: Calculate current avg buy price for an asset
function getCurrentAvgBuyPrice(assetId) {
  const asset = db.prepare('SELECT quantity, avg_buy_price FROM assets WHERE id = ?').get(assetId);
  return asset?.avg_buy_price || 0;
}

// Create a new transaction (BUY or SELL)
router.post('/', (req, res) => {
  try {
    const { asset_id, type, quantity, price, transaction_date, notes } = req.body;

    // Validate required fields
    if (!asset_id || !type || !quantity || !price || !transaction_date) {
      return res.status(400).json({
        error: 'asset_id, type, quantity, price, and transaction_date are required'
      });
    }

    // Validate type
    if (!['BUY', 'SELL'].includes(type.toUpperCase())) {
      return res.status(400).json({ error: 'type must be BUY or SELL' });
    }

    // Validate quantity and price are positive
    if (quantity <= 0 || price <= 0) {
      return res.status(400).json({ error: 'quantity and price must be positive numbers' });
    }

    // Check asset exists and belongs to user
    const asset = db.prepare(`
      SELECT * FROM assets WHERE id = ? AND user_id = ?
    `).get(asset_id, req.user.id);

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Validate asset is EQUITY category
    if (asset.category !== 'EQUITY') {
      return res.status(400).json({ error: 'Transactions are only supported for EQUITY assets' });
    }

    const transactionType = type.toUpperCase();
    const totalAmount = quantity * price;

    // For SELL, validate quantity doesn't exceed current holdings
    if (transactionType === 'SELL') {
      const currentQuantity = asset.quantity || 0;
      if (quantity > currentQuantity) {
        return res.status(400).json({
          error: `Cannot sell ${quantity} units. Current holdings: ${currentQuantity}`
        });
      }
    }

    // Calculate realized gain for SELL transactions (using weighted average)
    let realizedGain = null;
    if (transactionType === 'SELL') {
      const avgBuyPrice = getCurrentAvgBuyPrice(asset_id);
      const costBasis = avgBuyPrice * quantity;
      realizedGain = totalAmount - costBasis;
    }

    // Insert transaction
    const result = db.prepare(`
      INSERT INTO transactions (
        asset_id, user_id, type, quantity, price, total_amount,
        transaction_date, notes, realized_gain
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      asset_id, req.user.id, transactionType, quantity, price, totalAmount,
      transaction_date, notes || null, realizedGain
    );

    // Recalculate asset values
    const updatedAssetValues = recalculateAsset(asset_id);

    // Get the created transaction
    const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);

    // Get updated asset
    const updatedAsset = db.prepare('SELECT * FROM assets WHERE id = ?').get(asset_id);

    res.status(201).json({
      message: `${transactionType} transaction recorded successfully`,
      transaction,
      asset: updatedAsset
    });
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

// Get all transactions for an asset
router.get('/asset/:assetId', (req, res) => {
  try {
    const { assetId } = req.params;

    // Verify asset belongs to user
    const asset = db.prepare(`
      SELECT * FROM assets WHERE id = ? AND user_id = ?
    `).get(assetId, req.user.id);

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Get all transactions
    const transactions = db.prepare(`
      SELECT * FROM transactions WHERE asset_id = ? ORDER BY transaction_date DESC, id DESC
    `).all(assetId);

    // Calculate summary
    let totalBought = 0;
    let totalSold = 0;
    let totalInvested = 0;
    let totalRealizedGain = 0;

    for (const txn of transactions) {
      if (txn.type === 'BUY') {
        totalBought += txn.quantity;
        totalInvested += txn.total_amount;
      } else if (txn.type === 'SELL') {
        totalSold += txn.quantity;
        if (txn.realized_gain !== null) {
          totalRealizedGain += txn.realized_gain;
        }
      }
    }

    const summary = {
      total_bought: totalBought,
      total_sold: totalSold,
      current_quantity: asset.quantity || 0,
      avg_buy_price: asset.avg_buy_price || 0,
      total_invested: totalInvested,
      total_realized_gain: totalRealizedGain
    };

    res.json({ transactions, summary, asset });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Get single transaction
router.get('/:id', (req, res) => {
  try {
    const transaction = db.prepare(`
      SELECT t.*, a.name as asset_name, a.symbol, a.category, a.asset_type
      FROM transactions t
      JOIN assets a ON t.asset_id = a.id
      WHERE t.id = ? AND t.user_id = ?
    `).get(req.params.id, req.user.id);

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json({ transaction });
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ error: 'Failed to fetch transaction' });
  }
});

// Delete transaction
router.delete('/:id', (req, res) => {
  try {
    // Get transaction first to find the asset_id
    const transaction = db.prepare(`
      SELECT * FROM transactions WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Delete the transaction
    db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);

    // Recalculate asset values
    const updatedAssetValues = recalculateAsset(transaction.asset_id);

    // Get updated asset
    const updatedAsset = db.prepare('SELECT * FROM assets WHERE id = ?').get(transaction.asset_id);

    res.json({
      message: 'Transaction deleted successfully',
      asset: updatedAsset
    });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

export default router;
