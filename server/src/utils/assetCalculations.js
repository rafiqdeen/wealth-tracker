import db from '../db/database.js';

/**
 * Calculate quantity and avg_buy_price from a list of transactions
 * Uses weighted average cost method
 * @param {Array} transactions - Array of transaction objects (must be sorted by date)
 * @returns {{ quantity: number, avg_buy_price: number, status: string }}
 */
function calculateFromTransactions(transactions) {
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

  return { quantity: totalQuantity, avg_buy_price: avgBuyPrice, status };
}

/**
 * Recalculate asset quantity and avg_buy_price from all transactions
 * Uses weighted average cost method for calculating average buy price
 * @param {number} assetId - The asset ID to recalculate
 * @returns {Promise<{ quantity: number, avg_buy_price: number, status: string }>}
 */
export async function recalculateAssetFromTransactions(assetId) {
  const transactions = await db.all(
    'SELECT * FROM transactions WHERE asset_id = ? ORDER BY transaction_date, id',
    [assetId]
  );

  const result = calculateFromTransactions(transactions);

  await db.run(
    'UPDATE assets SET quantity = ?, avg_buy_price = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [result.quantity, result.avg_buy_price, result.status, assetId]
  );

  return result;
}

/**
 * Batch recalculate multiple assets from their transactions
 * Uses only 2 queries instead of N+1 queries
 * @param {number[]} assetIds - Array of asset IDs to recalculate
 * @returns {Promise<{ recalculated: number, results: Object }>}
 */
export async function recalculateMultipleAssets(assetIds) {
  if (!assetIds || assetIds.length === 0) {
    return { recalculated: 0, results: {} };
  }

  // Single query to fetch ALL transactions for ALL assets
  const placeholders = assetIds.map(() => '?').join(',');
  const allTransactions = await db.all(
    `SELECT * FROM transactions
     WHERE asset_id IN (${placeholders})
     ORDER BY asset_id, transaction_date, id`,
    assetIds
  );

  // Group transactions by asset_id (in-memory, very fast)
  const txnsByAsset = {};
  for (const txn of allTransactions) {
    if (!txnsByAsset[txn.asset_id]) {
      txnsByAsset[txn.asset_id] = [];
    }
    txnsByAsset[txn.asset_id].push(txn);
  }

  // Calculate and update each asset (no additional DB queries for fetching)
  const results = {};
  for (const assetId of assetIds) {
    const transactions = txnsByAsset[assetId] || [];
    const result = calculateFromTransactions(transactions);

    // Update the asset
    await db.run(
      'UPDATE assets SET quantity = ?, avg_buy_price = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [result.quantity, result.avg_buy_price, result.status, assetId]
    );

    results[assetId] = result;
  }

  return { recalculated: assetIds.length, results };
}

/**
 * Get current average buy price for an asset
 * @param {number} assetId - The asset ID
 * @returns {Promise<number>} The average buy price, or 0 if not found
 */
export async function getCurrentAvgBuyPrice(assetId) {
  const asset = await db.get('SELECT quantity, avg_buy_price FROM assets WHERE id = ?', [assetId]);
  return asset?.avg_buy_price || 0;
}
