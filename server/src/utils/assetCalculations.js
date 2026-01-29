import db from '../db/database.js';

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

  await db.run(
    'UPDATE assets SET quantity = ?, avg_buy_price = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [totalQuantity, avgBuyPrice, status, assetId]
  );

  return { quantity: totalQuantity, avg_buy_price: avgBuyPrice, status };
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
