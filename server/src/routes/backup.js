import express from 'express';
import db from '../db/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticateToken);

// GET /api/backup/export - Export all user data
router.get('/export', async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all assets
    const assets = await db.all(
      'SELECT * FROM assets WHERE user_id = ? ORDER BY category, name',
      [userId]
    );

    // Get all transactions
    const transactions = await db.all(
      `SELECT t.*, a.name as asset_name, a.symbol, a.category as asset_category
      FROM transactions t
      JOIN assets a ON t.asset_id = a.id
      WHERE t.user_id = ?
      ORDER BY t.transaction_date DESC`,
      [userId]
    );

    // Get all goals
    const goals = await db.all(
      'SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    // Get all goal-asset links
    const goalAssetLinks = await db.all(
      `SELECT gal.*, a.name as asset_name
      FROM goal_asset_links gal
      JOIN goals g ON gal.goal_id = g.id
      JOIN assets a ON gal.asset_id = a.id
      WHERE g.user_id = ?`,
      [userId]
    );

    // Get all goal contributions
    const goalContributions = await db.all(
      `SELECT gc.*, g.name as goal_name
      FROM goal_contributions gc
      JOIN goals g ON gc.goal_id = g.id
      WHERE g.user_id = ?
      ORDER BY gc.contribution_date DESC`,
      [userId]
    );

    // Get goal history
    const goalHistory = await db.all(
      `SELECT gh.*, g.name as goal_name
      FROM goal_history gh
      JOIN goals g ON gh.goal_id = g.id
      WHERE g.user_id = ?
      ORDER BY gh.date DESC
      LIMIT 1000`,
      [userId]
    );

    // Get portfolio history
    const portfolioHistory = await db.all(
      `SELECT * FROM portfolio_history
      WHERE user_id = ?
      ORDER BY date DESC
      LIMIT 365`,
      [userId]
    );

    const exportData = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
      },
      data: {
        assets,
        transactions,
        goals,
        goalAssetLinks,
        goalContributions,
        goalHistory,
        portfolioHistory,
      },
      stats: {
        assets: assets.length,
        transactions: transactions.length,
        goals: goals.length,
        goalLinks: goalAssetLinks.length,
        contributions: goalContributions.length,
      },
    };

    res.json(exportData);
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// GET /api/backup/transactions - Get all transactions for backup
router.get('/transactions', async (req, res) => {
  try {
    const transactions = await db.all(
      `SELECT t.*, a.name as asset_name, a.symbol, a.category as asset_category, a.asset_type
      FROM transactions t
      JOIN assets a ON t.asset_id = a.id
      WHERE t.user_id = ?
      ORDER BY t.transaction_date DESC`,
      [req.user.id]
    );

    res.json({ transactions });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// POST /api/backup/import - Import data from backup
router.post('/import', async (req, res) => {
  try {
    const { data, options = {} } = req.body;
    const userId = req.user.id;
    const { overwrite = false, importAssets = true, importGoals = true, importTransactions = true } = options;

    if (!data || !data.version) {
      return res.status(400).json({ error: 'Invalid backup file format' });
    }

    const results = {
      assets: { imported: 0, skipped: 0, errors: [] },
      goals: { imported: 0, skipped: 0, errors: [] },
      transactions: { imported: 0, skipped: 0, errors: [] },
      goalLinks: { imported: 0, skipped: 0 },
      contributions: { imported: 0, skipped: 0 },
    };

    // Import assets
    if (importAssets && data.assets && Array.isArray(data.assets)) {
      const assetIdMap = new Map(); // Maps old IDs to new IDs

      for (const asset of data.assets) {
        try {
          // Check if asset already exists by name and category
          const existing = await db.get(
            'SELECT id FROM assets WHERE user_id = ? AND name = ? AND category = ?',
            [userId, asset.name, asset.category]
          );

          if (existing && !overwrite) {
            assetIdMap.set(asset.id, existing.id);
            results.assets.skipped++;
            continue;
          }

          if (existing && overwrite) {
            // Update existing asset
            await db.run(
              `UPDATE assets SET
                asset_type = ?, symbol = ?, exchange = ?, quantity = ?, avg_buy_price = ?,
                principal = ?, interest_rate = ?, start_date = ?, maturity_date = ?, institution = ?,
                purchase_price = ?, current_value = ?, location = ?, area_sqft = ?,
                balance = ?, weight_grams = ?, purity = ?,
                premium = ?, sum_assured = ?, policy_number = ?,
                purchase_date = ?, notes = ?, status = ?, appreciation_rate = ?,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
              [
                asset.asset_type, asset.symbol, asset.exchange, asset.quantity, asset.avg_buy_price,
                asset.principal, asset.interest_rate, asset.start_date, asset.maturity_date, asset.institution,
                asset.purchase_price, asset.current_value, asset.location, asset.area_sqft,
                asset.balance, asset.weight_grams, asset.purity,
                asset.premium, asset.sum_assured, asset.policy_number,
                asset.purchase_date, asset.notes, asset.status || 'ACTIVE', asset.appreciation_rate,
                existing.id
              ]
            );
            assetIdMap.set(asset.id, existing.id);
            results.assets.imported++;
          } else {
            // Insert new asset
            const result = await db.run(
              `INSERT INTO assets (
                user_id, category, asset_type, name, symbol, exchange, quantity, avg_buy_price,
                principal, interest_rate, start_date, maturity_date, institution,
                purchase_price, current_value, location, area_sqft,
                balance, weight_grams, purity,
                premium, sum_assured, policy_number,
                purchase_date, notes, status, appreciation_rate
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                userId, asset.category, asset.asset_type, asset.name,
                asset.symbol, asset.exchange, asset.quantity, asset.avg_buy_price,
                asset.principal, asset.interest_rate, asset.start_date, asset.maturity_date, asset.institution,
                asset.purchase_price, asset.current_value, asset.location, asset.area_sqft,
                asset.balance, asset.weight_grams, asset.purity,
                asset.premium, asset.sum_assured, asset.policy_number,
                asset.purchase_date, asset.notes, asset.status || 'ACTIVE', asset.appreciation_rate
              ]
            );
            assetIdMap.set(asset.id, result.lastInsertRowid);
            results.assets.imported++;
          }
        } catch (err) {
          results.assets.errors.push({ name: asset.name, error: err.message });
        }
      }

      // Import transactions (only for newly mapped assets)
      if (importTransactions && data.transactions && Array.isArray(data.transactions)) {
        for (const txn of data.transactions) {
          try {
            const newAssetId = assetIdMap.get(txn.asset_id);
            if (!newAssetId) {
              results.transactions.skipped++;
              continue;
            }

            // Check if transaction already exists
            const existing = await db.get(
              `SELECT id FROM transactions
              WHERE asset_id = ? AND user_id = ? AND type = ? AND quantity = ? AND transaction_date = ?`,
              [newAssetId, userId, txn.type, txn.quantity, txn.transaction_date]
            );

            if (existing && !overwrite) {
              results.transactions.skipped++;
              continue;
            }

            if (!existing) {
              await db.run(
                `INSERT INTO transactions (
                  asset_id, user_id, type, quantity, price, total_amount,
                  transaction_date, notes, realized_gain, is_initial_holding
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  newAssetId, userId, txn.type, txn.quantity, txn.price, txn.total_amount,
                  txn.transaction_date, txn.notes, txn.realized_gain, txn.is_initial_holding || 0
                ]
              );
              results.transactions.imported++;
            }
          } catch (err) {
            results.transactions.errors.push({ error: err.message });
          }
        }
      }
    }

    // Import goals
    if (importGoals && data.goals && Array.isArray(data.goals)) {
      const goalIdMap = new Map(); // Maps old IDs to new IDs

      for (const goal of data.goals) {
        try {
          // Check if goal already exists by name
          const existing = await db.get(
            'SELECT id FROM goals WHERE user_id = ? AND name = ?',
            [userId, goal.name]
          );

          if (existing && !overwrite) {
            goalIdMap.set(goal.id, existing.id);
            results.goals.skipped++;
            continue;
          }

          if (existing && overwrite) {
            await db.run(
              `UPDATE goals SET
                category = ?, target_amount = ?, target_date = ?,
                progress_mode = ?, manual_current_amount = ?, status = ?, notes = ?,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
              [
                goal.category, goal.target_amount, goal.target_date,
                goal.progress_mode, goal.manual_current_amount, goal.status, goal.notes,
                existing.id
              ]
            );
            goalIdMap.set(goal.id, existing.id);
            results.goals.imported++;
          } else {
            const result = await db.run(
              `INSERT INTO goals (
                user_id, name, category, target_amount, target_date,
                progress_mode, manual_current_amount, status, notes
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                userId, goal.name, goal.category, goal.target_amount, goal.target_date,
                goal.progress_mode || 'AUTO', goal.manual_current_amount || 0, goal.status || 'ACTIVE', goal.notes
              ]
            );
            goalIdMap.set(goal.id, result.lastInsertRowid);
            results.goals.imported++;
          }
        } catch (err) {
          results.goals.errors.push({ name: goal.name, error: err.message });
        }
      }

      // Import goal-asset links
      if (data.goalAssetLinks && Array.isArray(data.goalAssetLinks)) {
        for (const link of data.goalAssetLinks) {
          try {
            const newGoalId = goalIdMap.get(link.goal_id);
            // We need assetIdMap from assets import
            if (!newGoalId) {
              results.goalLinks.skipped++;
              continue;
            }

            // Try to find asset by name if we don't have the map
            let assetId = link.asset_id;
            if (link.asset_name) {
              const asset = await db.get(
                'SELECT id FROM assets WHERE user_id = ? AND name = ?',
                [userId, link.asset_name]
              );
              if (asset) assetId = asset.id;
            }

            const existing = await db.get(
              'SELECT id FROM goal_asset_links WHERE goal_id = ? AND asset_id = ?',
              [newGoalId, assetId]
            );

            if (!existing) {
              await db.run(
                `INSERT INTO goal_asset_links (
                  goal_id, asset_id, link_type, allocation_percent,
                  allocation_mode, fixed_allocation_amount, initial_value_snapshot
                ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                  newGoalId, assetId, link.link_type || 'FUNDING', link.allocation_percent || 100,
                  link.allocation_mode || 'PERCENT', link.fixed_allocation_amount, link.initial_value_snapshot
                ]
              );
              results.goalLinks.imported++;
            } else {
              results.goalLinks.skipped++;
            }
          } catch (err) {
            results.goalLinks.skipped++;
          }
        }
      }

      // Import contributions
      if (data.goalContributions && Array.isArray(data.goalContributions)) {
        for (const contrib of data.goalContributions) {
          try {
            const newGoalId = goalIdMap.get(contrib.goal_id);
            if (!newGoalId) {
              results.contributions.skipped++;
              continue;
            }

            await db.run(
              `INSERT INTO goal_contributions (
                goal_id, contribution_type, amount, description, contribution_date
              ) VALUES (?, ?, ?, ?, ?)`,
              [
                newGoalId, contrib.contribution_type, contrib.amount,
                contrib.description, contrib.contribution_date
              ]
            );
            results.contributions.imported++;
          } catch (err) {
            results.contributions.skipped++;
          }
        }
      }
    }

    res.json({
      message: 'Import completed',
      results,
    });
  } catch (error) {
    console.error('Error importing data:', error);
    res.status(500).json({ error: 'Failed to import data' });
  }
});

export default router;
