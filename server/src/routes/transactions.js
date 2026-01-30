import express from 'express';
import db from '../db/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { recalculateAssetFromTransactions, getCurrentAvgBuyPrice } from '../utils/assetCalculations.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticateToken);

// Create a new transaction (BUY or SELL)
router.post('/', async (req, res) => {
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

    const transactionType = type.toUpperCase();
    const totalAmount = quantity * price;

    // Check asset exists and belongs to user
    const asset = await db.get(
      'SELECT * FROM assets WHERE id = ? AND user_id = ?',
      [asset_id, req.user.id]
    );

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Validate asset is EQUITY category
    if (asset.category !== 'EQUITY') {
      return res.status(400).json({ error: 'Transactions are only supported for EQUITY assets' });
    }

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
      const avgBuyPrice = await getCurrentAvgBuyPrice(asset_id);
      const costBasis = avgBuyPrice * quantity;
      realizedGain = totalAmount - costBasis;
    }

    // Insert transaction
    const result = await db.run(
      `INSERT INTO transactions (
        asset_id, user_id, type, quantity, price, total_amount,
        transaction_date, notes, realized_gain
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        asset_id, req.user.id, transactionType, quantity, price, totalAmount,
        transaction_date, notes || null, realizedGain
      ]
    );

    // Recalculate asset values
    await recalculateAssetFromTransactions(asset_id);

    // Get the created transaction
    const transaction = await db.get('SELECT * FROM transactions WHERE id = ?', [result.lastInsertRowid]);

    // Get updated asset
    const updatedAsset = await db.get('SELECT * FROM assets WHERE id = ?', [asset_id]);

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
router.get('/asset/:assetId', async (req, res) => {
  try {
    const { assetId } = req.params;

    // Verify asset belongs to user
    const asset = await db.get(
      'SELECT * FROM assets WHERE id = ? AND user_id = ?',
      [assetId, req.user.id]
    );

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Get all transactions
    const transactions = await db.all(
      'SELECT * FROM transactions WHERE asset_id = ? ORDER BY transaction_date DESC, id DESC',
      [assetId]
    );

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
router.get('/:id', async (req, res) => {
  try {
    const transaction = await db.get(
      `SELECT t.*, a.name as asset_name, a.symbol, a.category, a.asset_type
      FROM transactions t
      JOIN assets a ON t.asset_id = a.id
      WHERE t.id = ? AND t.user_id = ?`,
      [req.params.id, req.user.id]
    );

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json({ transaction });
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ error: 'Failed to fetch transaction' });
  }
});

// Update transaction
router.put('/:id', async (req, res) => {
  try {
    const { quantity, price, notes, transaction_date } = req.body;

    // Get transaction first to verify ownership
    const transaction = await db.get(
      'SELECT * FROM transactions WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Build update query dynamically based on provided fields
    const updates = [];
    const values = [];

    if (quantity !== undefined && quantity > 0) {
      updates.push('quantity = ?');
      values.push(quantity);
    }

    if (price !== undefined && price > 0) {
      updates.push('price = ?');
      values.push(price);
    }

    if (notes !== undefined) {
      updates.push('notes = ?');
      values.push(notes || null);
    }

    if (transaction_date !== undefined && transaction_date) {
      updates.push('transaction_date = ?');
      values.push(transaction_date);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Calculate new total_amount if quantity or price changed
    const newQuantity = quantity !== undefined ? quantity : transaction.quantity;
    const newPrice = price !== undefined ? price : transaction.price;
    const newTotalAmount = newQuantity * newPrice;

    updates.push('total_amount = ?');
    values.push(newTotalAmount);

    // Add transaction id to values
    values.push(req.params.id);

    // Execute update
    await db.run(
      `UPDATE transactions SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    // Recalculate realized gain for SELL transactions
    if (transaction.type === 'SELL') {
      const avgBuyPrice = await getCurrentAvgBuyPrice(transaction.asset_id);
      const costBasis = avgBuyPrice * newQuantity;
      const realizedGain = newTotalAmount - costBasis;

      await db.run('UPDATE transactions SET realized_gain = ? WHERE id = ?', [realizedGain, req.params.id]);
    }

    // Recalculate asset values
    await recalculateAssetFromTransactions(transaction.asset_id);

    // Get updated transaction
    const updatedTransaction = await db.get('SELECT * FROM transactions WHERE id = ?', [req.params.id]);

    res.json({
      message: 'Transaction updated successfully',
      transaction: updatedTransaction
    });
  } catch (error) {
    console.error('Error updating transaction:', error);
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

// Delete transaction
router.delete('/:id', async (req, res) => {
  try {
    // Get transaction first to find the asset_id
    const transaction = await db.get(
      'SELECT * FROM transactions WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Delete the transaction
    await db.run('DELETE FROM transactions WHERE id = ?', [req.params.id]);

    // Recalculate asset values
    await recalculateAssetFromTransactions(transaction.asset_id);

    // Get updated asset
    const updatedAsset = await db.get('SELECT * FROM assets WHERE id = ?', [transaction.asset_id]);

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
