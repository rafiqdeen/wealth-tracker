import express from 'express';
import db from '../db/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticateToken);

// Helper: Calculate asset value
function getAssetValue(asset) {
  if (asset.quantity && asset.avg_buy_price) {
    return asset.quantity * asset.avg_buy_price;
  } else if (asset.current_value) {
    return asset.current_value;
  } else if (asset.principal) {
    return asset.principal;
  } else if (asset.balance) {
    return asset.balance;
  } else if (asset.purchase_price) {
    return asset.purchase_price;
  }
  return 0;
}

// Helper: Calculate goal progress from linked assets
function calculateGoalProgress(goalId, userId) {
  const goal = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(goalId, userId);
  if (!goal) return null;

  // Get linked assets with their allocations
  // Note: Explicitly select gal.id as link_id to avoid being overwritten by a.id
  const links = db.prepare(`
    SELECT gal.id as link_id, gal.goal_id, gal.asset_id, gal.link_type,
           gal.allocation_percent, gal.allocation_mode, gal.fixed_allocation_amount,
           gal.initial_value_snapshot, gal.link_date,
           a.name, a.asset_type, a.category as asset_category,
           a.quantity, a.avg_buy_price, a.current_value, a.principal, a.balance, a.purchase_price
    FROM goal_asset_links gal
    JOIN assets a ON gal.asset_id = a.id
    WHERE gal.goal_id = ? AND a.user_id = ?
  `).all(goalId, userId);

  let linkedAssetsValue = 0;
  const linkedAssets = [];

  for (const link of links) {
    const assetValue = getAssetValue(link);
    let allocatedValue = 0;

    if (link.link_type === 'FUNDING') {
      if (link.allocation_mode === 'FIXED_AMOUNT' && link.fixed_allocation_amount) {
        allocatedValue = Math.min(link.fixed_allocation_amount, assetValue);
      } else {
        allocatedValue = assetValue * (link.allocation_percent / 100);
      }
      linkedAssetsValue += allocatedValue;
    }

    linkedAssets.push({
      id: link.link_id,
      asset_id: link.asset_id,
      asset_name: link.name,
      asset_type: link.asset_type,
      link_type: link.link_type,
      allocation_percent: link.allocation_percent,
      allocation_mode: link.allocation_mode,
      fixed_allocation_amount: link.fixed_allocation_amount,
      asset_value: assetValue,
      allocated_value: allocatedValue,
      link_date: link.link_date,
    });
  }

  // Calculate total progress based on mode
  let currentValue = 0;
  if (goal.progress_mode === 'AUTO') {
    currentValue = linkedAssetsValue;
  } else if (goal.progress_mode === 'MANUAL') {
    currentValue = goal.manual_current_amount || 0;
  } else if (goal.progress_mode === 'HYBRID') {
    currentValue = linkedAssetsValue + (goal.manual_current_amount || 0);
  }

  const progressPercent = goal.target_amount > 0
    ? Math.min((currentValue / goal.target_amount) * 100, 100)
    : 0;

  return {
    current_value: currentValue,
    linked_assets_value: linkedAssetsValue,
    manual_value: goal.manual_current_amount || 0,
    progress_percent: progressPercent,
    linked_assets: linkedAssets,
  };
}

// Helper: Get asset allocation across all goals
function getAssetAllocations(assetId, userId, excludeGoalId = null) {
  let query = `
    SELECT gal.*, g.name as goal_name
    FROM goal_asset_links gal
    JOIN goals g ON gal.goal_id = g.id
    WHERE gal.asset_id = ? AND g.user_id = ? AND g.status = 'ACTIVE'
  `;
  const params = [assetId, userId];

  if (excludeGoalId) {
    query += ' AND gal.goal_id != ?';
    params.push(excludeGoalId);
  }

  return db.prepare(query).all(...params);
}

// ==================== GOALS CRUD ====================

// GET /api/goals - Get all goals for user (OPTIMIZED: batch queries instead of N+1)
router.get('/', (req, res) => {
  try {
    // Fetch all goals in one query
    const goals = db.prepare(`
      SELECT * FROM goals WHERE user_id = ? ORDER BY status, created_at DESC
    `).all(req.user.id);

    if (goals.length === 0) {
      return res.json({ goals: [] });
    }

    // Fetch ALL linked assets for ALL goals in ONE query (fixes N+1 problem)
    const goalIds = goals.map(g => g.id);
    const placeholders = goalIds.map(() => '?').join(',');
    const allLinks = db.prepare(`
      SELECT gal.goal_id, gal.link_type, gal.allocation_percent, gal.allocation_mode,
             gal.fixed_allocation_amount, a.id as asset_id, a.name as asset_name,
             a.asset_type, a.quantity, a.avg_buy_price, a.current_value,
             a.principal, a.balance, a.purchase_price
      FROM goal_asset_links gal
      JOIN assets a ON gal.asset_id = a.id
      WHERE gal.goal_id IN (${placeholders}) AND a.user_id = ?
    `).all(...goalIds, req.user.id);

    // Group links by goal_id for O(1) lookup
    const linksByGoal = allLinks.reduce((acc, link) => {
      if (!acc[link.goal_id]) acc[link.goal_id] = [];
      acc[link.goal_id].push(link);
      return acc;
    }, {});

    // Enrich goals with progress data (no additional queries needed)
    const enrichedGoals = goals.map(goal => {
      const links = linksByGoal[goal.id] || [];
      let linkedAssetsValue = 0;
      const linkedAssetNames = [];

      for (const link of links) {
        const assetValue = getAssetValue(link);
        let allocatedValue = 0;

        if (link.link_type === 'FUNDING') {
          if (link.allocation_mode === 'FIXED_AMOUNT' && link.fixed_allocation_amount) {
            allocatedValue = Math.min(link.fixed_allocation_amount, assetValue);
          } else {
            allocatedValue = assetValue * (link.allocation_percent / 100);
          }
          linkedAssetsValue += allocatedValue;
        }
        if (link.asset_name) linkedAssetNames.push(link.asset_name);
      }

      // Calculate total progress based on mode
      let currentValue = 0;
      if (goal.progress_mode === 'AUTO') {
        currentValue = linkedAssetsValue;
      } else if (goal.progress_mode === 'MANUAL') {
        currentValue = goal.manual_current_amount || 0;
      } else if (goal.progress_mode === 'HYBRID') {
        currentValue = linkedAssetsValue + (goal.manual_current_amount || 0);
      }

      const progressPercent = goal.target_amount > 0
        ? Math.min((currentValue / goal.target_amount) * 100, 100)
        : 0;

      return {
        ...goal,
        current_value: currentValue,
        linked_assets_value: linkedAssetsValue,
        progress_percent: progressPercent,
        linked_assets_count: links.length,
        linked_assets_names: linkedAssetNames,
      };
    });

    res.json({ goals: enrichedGoals });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch goals' });
  }
});

// GET /api/goals/:id - Get single goal with full details
router.get('/:id', (req, res) => {
  try {
    const goal = db.prepare(`
      SELECT * FROM goals WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const progress = calculateGoalProgress(goal.id, req.user.id);

    res.json({
      goal: {
        ...goal,
        ...progress,
      }
    });
  } catch (error) {
    console.error('Error fetching goal:', error);
    res.status(500).json({ error: 'Failed to fetch goal' });
  }
});

// POST /api/goals - Create new goal
router.post('/', (req, res) => {
  try {
    const {
      name,
      category,
      target_amount,
      target_date,
      progress_mode = 'AUTO',
      manual_current_amount = 0,
      notes,
      linked_assets = [], // Array of { asset_id, allocation_percent, link_type }
    } = req.body;

    if (!name || !category || !target_amount) {
      return res.status(400).json({ error: 'Name, category, and target_amount are required' });
    }

    // Create goal
    const result = db.prepare(`
      INSERT INTO goals (user_id, name, category, target_amount, target_date, progress_mode, manual_current_amount, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      name,
      category.toUpperCase(),
      target_amount,
      target_date || null,
      progress_mode,
      manual_current_amount,
      notes || null
    );

    const goalId = result.lastInsertRowid;

    // Create asset links if provided
    if (linked_assets.length > 0) {
      // Validate allocation percentages don't exceed 100% per asset
      for (const link of linked_assets) {
        const allocationPercent = link.allocation_percent ?? 100;

        // Check existing allocations for this asset across all goals
        const existingAllocation = db.prepare(`
          SELECT COALESCE(SUM(allocation_percent), 0) as total
          FROM goal_asset_links gal
          JOIN goals g ON gal.goal_id = g.id
          WHERE gal.asset_id = ? AND g.user_id = ? AND g.status = 'ACTIVE'
        `).get(link.asset_id, req.user.id);

        const totalAllocation = (existingAllocation?.total || 0) + allocationPercent;
        if (totalAllocation > 100) {
          return res.status(400).json({
            error: `Asset allocation would exceed 100%. Available: ${100 - (existingAllocation?.total || 0)}%`
          });
        }
      }

      const insertLink = db.prepare(`
        INSERT INTO goal_asset_links (goal_id, asset_id, link_type, allocation_percent, initial_value_snapshot)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const link of linked_assets) {
        // Verify asset belongs to user
        const asset = db.prepare('SELECT * FROM assets WHERE id = ? AND user_id = ?')
          .get(link.asset_id, req.user.id);

        if (asset) {
          const assetValue = getAssetValue(asset);
          insertLink.run(
            goalId,
            link.asset_id,
            link.link_type || 'FUNDING',
            link.allocation_percent ?? 100,
            assetValue
          );
        }
      }
    }

    // Record initial contribution if manual amount provided
    if (manual_current_amount > 0) {
      db.prepare(`
        INSERT INTO goal_contributions (goal_id, contribution_type, amount, description)
        VALUES (?, 'MANUAL', ?, 'Initial contribution')
      `).run(goalId, manual_current_amount);
    }

    // Fetch created goal with progress
    const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(goalId);
    const progress = calculateGoalProgress(goalId, req.user.id);

    res.status(201).json({
      message: 'Goal created successfully',
      goal: { ...goal, ...progress }
    });
  } catch (error) {
    console.error('Error creating goal:', error);
    res.status(500).json({ error: 'Failed to create goal' });
  }
});

// PUT /api/goals/:id - Update goal
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const {
      name,
      category,
      target_amount,
      target_date,
      progress_mode,
      manual_current_amount,
      status,
      notes,
    } = req.body;

    // Validate manual_current_amount is not negative
    if (manual_current_amount !== undefined && manual_current_amount < 0) {
      return res.status(400).json({ error: 'Manual amount cannot be negative' });
    }

    // Validate target_amount is positive
    if (target_amount !== undefined && target_amount <= 0) {
      return res.status(400).json({ error: 'Target amount must be positive' });
    }

    // Track manual contribution changes
    if (manual_current_amount !== undefined && manual_current_amount !== existing.manual_current_amount) {
      const diff = manual_current_amount - (existing.manual_current_amount || 0);
      if (diff !== 0) {
        db.prepare(`
          INSERT INTO goal_contributions (goal_id, contribution_type, amount, description)
          VALUES (?, 'MANUAL', ?, ?)
        `).run(req.params.id, diff, diff > 0 ? 'Manual addition' : 'Manual adjustment');
      }
    }

    // Check if goal is being completed
    let completedAt = existing.completed_at;
    if (status === 'COMPLETED' && existing.status !== 'COMPLETED') {
      completedAt = new Date().toISOString();
    } else if (status !== 'COMPLETED') {
      completedAt = null;
    }

    db.prepare(`
      UPDATE goals SET
        name = COALESCE(?, name),
        category = COALESCE(?, category),
        target_amount = COALESCE(?, target_amount),
        target_date = ?,
        progress_mode = COALESCE(?, progress_mode),
        manual_current_amount = COALESCE(?, manual_current_amount),
        status = COALESCE(?, status),
        notes = ?,
        completed_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(
      name,
      category?.toUpperCase(),
      target_amount,
      target_date !== undefined ? target_date : existing.target_date,
      progress_mode,
      manual_current_amount,
      status,
      notes !== undefined ? notes : existing.notes,
      completedAt,
      req.params.id,
      req.user.id
    );

    const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id);
    const progress = calculateGoalProgress(goal.id, req.user.id);

    res.json({
      message: 'Goal updated successfully',
      goal: { ...goal, ...progress }
    });
  } catch (error) {
    console.error('Error updating goal:', error);
    res.status(500).json({ error: 'Failed to update goal' });
  }
});

// DELETE /api/goals/:id - Delete goal
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    res.json({ message: 'Goal deleted successfully' });
  } catch (error) {
    console.error('Error deleting goal:', error);
    res.status(500).json({ error: 'Failed to delete goal' });
  }
});

// ==================== ASSET LINKS ====================

// GET /api/goals/:id/links - Get all asset links for a goal
router.get('/:id/links', (req, res) => {
  try {
    const goal = db.prepare('SELECT id FROM goals WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const links = db.prepare(`
      SELECT gal.*, a.name as asset_name, a.asset_type, a.category as asset_category
      FROM goal_asset_links gal
      JOIN assets a ON gal.asset_id = a.id
      WHERE gal.goal_id = ?
    `).all(req.params.id);

    // Enrich with current values
    const enrichedLinks = links.map(link => {
      const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(link.asset_id);
      const assetValue = asset ? getAssetValue(asset) : 0;
      let allocatedValue = 0;

      if (link.link_type === 'FUNDING') {
        if (link.allocation_mode === 'FIXED_AMOUNT' && link.fixed_allocation_amount) {
          allocatedValue = Math.min(link.fixed_allocation_amount, assetValue);
        } else {
          allocatedValue = assetValue * (link.allocation_percent / 100);
        }
      }

      return {
        ...link,
        asset_value: assetValue,
        allocated_value: allocatedValue,
      };
    });

    res.json({ links: enrichedLinks });
  } catch (error) {
    console.error('Error fetching links:', error);
    res.status(500).json({ error: 'Failed to fetch links' });
  }
});

// POST /api/goals/:id/links - Add asset link to goal
router.post('/:id/links', (req, res) => {
  try {
    const goal = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const {
      asset_id,
      link_type = 'FUNDING',
      allocation_percent = 100,
      allocation_mode = 'PERCENT',
      fixed_allocation_amount,
    } = req.body;

    if (!asset_id) {
      return res.status(400).json({ error: 'asset_id is required' });
    }

    // Validate allocation_percent is a number between 0 and 100
    if (typeof allocation_percent !== 'number' || isNaN(allocation_percent)) {
      return res.status(400).json({ error: 'allocation_percent must be a valid number' });
    }
    if (allocation_percent < 0 || allocation_percent > 100) {
      return res.status(400).json({ error: 'allocation_percent must be between 0 and 100' });
    }

    // Verify asset belongs to user
    const asset = db.prepare('SELECT * FROM assets WHERE id = ? AND user_id = ?')
      .get(asset_id, req.user.id);

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Check for over-allocation
    const existingAllocations = getAssetAllocations(asset_id, req.user.id, req.params.id);
    const totalExisting = existingAllocations.reduce((sum, a) => sum + (a.allocation_percent || 0), 0);

    if (totalExisting + allocation_percent > 100) {
      return res.status(400).json({
        error: 'Over-allocation warning',
        message: `This asset already has ${totalExisting}% allocated to other goals. Maximum available: ${100 - totalExisting}%`,
        existing_allocations: existingAllocations,
        available_percent: 100 - totalExisting,
      });
    }

    // Check if link already exists
    const existingLink = db.prepare('SELECT id FROM goal_asset_links WHERE goal_id = ? AND asset_id = ?')
      .get(req.params.id, asset_id);

    if (existingLink) {
      return res.status(400).json({ error: 'Asset is already linked to this goal' });
    }

    const assetValue = getAssetValue(asset);

    const result = db.prepare(`
      INSERT INTO goal_asset_links (goal_id, asset_id, link_type, allocation_percent, allocation_mode, fixed_allocation_amount, initial_value_snapshot)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.params.id,
      asset_id,
      link_type,
      allocation_percent,
      allocation_mode,
      fixed_allocation_amount || null,
      assetValue
    );

    const link = db.prepare('SELECT * FROM goal_asset_links WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      message: 'Asset linked successfully',
      link: {
        ...link,
        asset_name: asset.name,
        asset_type: asset.asset_type,
        asset_value: assetValue,
      }
    });
  } catch (error) {
    console.error('Error creating link:', error);
    res.status(500).json({ error: 'Failed to create link' });
  }
});

// PUT /api/goals/:id/links/:linkId - Update asset link
router.put('/:id/links/:linkId', (req, res) => {
  try {
    const goal = db.prepare('SELECT id FROM goals WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const existingLink = db.prepare('SELECT * FROM goal_asset_links WHERE id = ? AND goal_id = ?')
      .get(req.params.linkId, req.params.id);

    if (!existingLink) {
      return res.status(404).json({ error: 'Link not found' });
    }

    const {
      link_type,
      allocation_percent,
      allocation_mode,
      fixed_allocation_amount,
    } = req.body;

    // Validate allocation_percent if provided
    if (allocation_percent !== undefined) {
      if (typeof allocation_percent !== 'number' || isNaN(allocation_percent)) {
        return res.status(400).json({ error: 'allocation_percent must be a valid number' });
      }
      if (allocation_percent < 0 || allocation_percent > 100) {
        return res.status(400).json({ error: 'allocation_percent must be between 0 and 100' });
      }
    }

    // Check for over-allocation if changing percent
    if (allocation_percent !== undefined && allocation_percent !== existingLink.allocation_percent) {
      const existingAllocations = getAssetAllocations(existingLink.asset_id, req.user.id, req.params.id);
      const totalExisting = existingAllocations.reduce((sum, a) => sum + (a.allocation_percent || 0), 0);

      if (totalExisting + allocation_percent > 100) {
        return res.status(400).json({
          error: 'Over-allocation warning',
          message: `This asset already has ${totalExisting}% allocated to other goals. Maximum available: ${100 - totalExisting}%`,
          available_percent: 100 - totalExisting,
        });
      }
    }

    db.prepare(`
      UPDATE goal_asset_links SET
        link_type = COALESCE(?, link_type),
        allocation_percent = COALESCE(?, allocation_percent),
        allocation_mode = COALESCE(?, allocation_mode),
        fixed_allocation_amount = ?
      WHERE id = ?
    `).run(
      link_type,
      allocation_percent,
      allocation_mode,
      fixed_allocation_amount !== undefined ? fixed_allocation_amount : existingLink.fixed_allocation_amount,
      req.params.linkId
    );

    const link = db.prepare(`
      SELECT gal.*, a.name as asset_name, a.asset_type
      FROM goal_asset_links gal
      JOIN assets a ON gal.asset_id = a.id
      WHERE gal.id = ?
    `).get(req.params.linkId);

    res.json({ message: 'Link updated successfully', link });
  } catch (error) {
    console.error('Error updating link:', error);
    res.status(500).json({ error: 'Failed to update link' });
  }
});

// DELETE /api/goals/:id/links/:linkId - Remove asset link
router.delete('/:id/links/:linkId', (req, res) => {
  try {
    const goal = db.prepare('SELECT id FROM goals WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const result = db.prepare('DELETE FROM goal_asset_links WHERE id = ? AND goal_id = ?')
      .run(req.params.linkId, req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Link not found' });
    }

    res.json({ message: 'Link removed successfully' });
  } catch (error) {
    console.error('Error deleting link:', error);
    res.status(500).json({ error: 'Failed to delete link' });
  }
});

// ==================== CONTRIBUTIONS ====================

// GET /api/goals/:id/contributions - Get contribution history
router.get('/:id/contributions', (req, res) => {
  try {
    const goal = db.prepare('SELECT id FROM goals WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const contributions = db.prepare(`
      SELECT gc.*, a.name as asset_name
      FROM goal_contributions gc
      LEFT JOIN assets a ON gc.source_asset_id = a.id
      WHERE gc.goal_id = ?
      ORDER BY gc.contribution_date DESC, gc.created_at DESC
    `).all(req.params.id);

    res.json({ contributions });
  } catch (error) {
    console.error('Error fetching contributions:', error);
    res.status(500).json({ error: 'Failed to fetch contributions' });
  }
});

// POST /api/goals/:id/contributions - Add manual contribution
router.post('/:id/contributions', (req, res) => {
  try {
    const goal = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const {
      amount,
      description,
      contribution_date,
    } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    // Insert contribution
    const result = db.prepare(`
      INSERT INTO goal_contributions (goal_id, contribution_type, amount, description, contribution_date)
      VALUES (?, 'MANUAL', ?, ?, ?)
    `).run(
      req.params.id,
      amount,
      description || null,
      contribution_date || new Date().toISOString().split('T')[0]
    );

    // Update manual_current_amount
    const newManualAmount = (goal.manual_current_amount || 0) + amount;
    db.prepare('UPDATE goals SET manual_current_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newManualAmount, req.params.id);

    const contribution = db.prepare('SELECT * FROM goal_contributions WHERE id = ?')
      .get(result.lastInsertRowid);

    res.status(201).json({
      message: 'Contribution added successfully',
      contribution,
      new_manual_amount: newManualAmount,
    });
  } catch (error) {
    console.error('Error adding contribution:', error);
    res.status(500).json({ error: 'Failed to add contribution' });
  }
});

// ==================== PROGRESS & HISTORY ====================

// GET /api/goals/:id/progress - Get current progress details
router.get('/:id/progress', (req, res) => {
  try {
    const goal = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const progress = calculateGoalProgress(goal.id, req.user.id);

    // Get recent contributions
    const recentContributions = db.prepare(`
      SELECT * FROM goal_contributions
      WHERE goal_id = ? AND contribution_date >= date('now', '-30 days')
      ORDER BY contribution_date DESC
    `).all(req.params.id);

    const thisMonthTotal = recentContributions
      .filter(c => c.contribution_date >= new Date().toISOString().slice(0, 7))
      .reduce((sum, c) => sum + c.amount, 0);

    res.json({
      goal,
      progress: {
        ...progress,
        remaining: goal.target_amount - (progress?.current_value || 0),
        this_month_contributions: thisMonthTotal,
      }
    });
  } catch (error) {
    console.error('Error fetching progress:', error);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

// GET /api/goals/:id/history - Get historical progress
router.get('/:id/history', (req, res) => {
  try {
    const goal = db.prepare('SELECT id FROM goals WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const { days = 30 } = req.query;

    const history = db.prepare(`
      SELECT * FROM goal_history
      WHERE goal_id = ?
      ORDER BY date DESC
      LIMIT ?
    `).all(req.params.id, parseInt(days));

    res.json({ history: history.reverse() });
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// POST /api/goals/snapshot - Record daily snapshot for all goals (called by cron or manually)
router.post('/snapshot', (req, res) => {
  try {
    const goals = db.prepare('SELECT * FROM goals WHERE user_id = ? AND status = ?')
      .all(req.user.id, 'ACTIVE');

    const today = new Date().toISOString().split('T')[0];
    let snapshotCount = 0;

    for (const goal of goals) {
      const progress = calculateGoalProgress(goal.id, req.user.id);

      if (progress) {
        db.prepare(`
          INSERT OR REPLACE INTO goal_history (goal_id, date, current_value, progress_percent, linked_assets_value, manual_value)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          goal.id,
          today,
          progress.current_value,
          progress.progress_percent,
          progress.linked_assets_value,
          progress.manual_value
        );
        snapshotCount++;
      }
    }

    res.json({ message: `Snapshot recorded for ${snapshotCount} goals` });
  } catch (error) {
    console.error('Error recording snapshot:', error);
    res.status(500).json({ error: 'Failed to record snapshot' });
  }
});

// ==================== UTILITY ENDPOINTS ====================

// GET /api/goals/asset-allocations/:assetId - Get all goal allocations for an asset
router.get('/asset-allocations/:assetId', (req, res) => {
  try {
    const asset = db.prepare('SELECT * FROM assets WHERE id = ? AND user_id = ?')
      .get(req.params.assetId, req.user.id);

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const allocations = getAssetAllocations(req.params.assetId, req.user.id);
    const totalAllocated = allocations.reduce((sum, a) => sum + (a.allocation_percent || 0), 0);
    const assetValue = getAssetValue(asset);

    res.json({
      asset_id: asset.id,
      asset_name: asset.name,
      asset_value: assetValue,
      total_allocated_percent: totalAllocated,
      available_percent: 100 - totalAllocated,
      allocations: allocations.map(a => ({
        goal_id: a.goal_id,
        goal_name: a.goal_name,
        allocation_percent: a.allocation_percent,
        allocated_value: assetValue * (a.allocation_percent / 100),
        link_type: a.link_type,
      })),
    });
  } catch (error) {
    console.error('Error fetching allocations:', error);
    res.status(500).json({ error: 'Failed to fetch allocations' });
  }
});

// POST /api/goals/migrate - Migrate goals from localStorage (one-time)
router.post('/migrate', (req, res) => {
  try {
    const { goals: localGoals } = req.body;

    if (!localGoals || !Array.isArray(localGoals)) {
      return res.status(400).json({ error: 'Invalid goals data' });
    }

    let migratedCount = 0;
    const migratedGoals = [];

    for (const localGoal of localGoals) {
      // Check if goal already exists (by name for this user)
      const existing = db.prepare('SELECT id FROM goals WHERE user_id = ? AND name = ?')
        .get(req.user.id, localGoal.name);

      if (existing) {
        continue; // Skip already migrated goals
      }

      // Create goal
      const result = db.prepare(`
        INSERT INTO goals (user_id, name, category, target_amount, target_date, progress_mode, manual_current_amount, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.user.id,
        localGoal.name,
        localGoal.category || 'CUSTOM',
        localGoal.target_amount || 0,
        localGoal.target_date || null,
        'AUTO', // Default to AUTO mode for migrated goals
        localGoal.current_amount || 0,
        localGoal.notes || null,
        localGoal.created_at || new Date().toISOString()
      );

      const goalId = result.lastInsertRowid;

      // Migrate linked assets if any
      if (localGoal.linked_assets && Array.isArray(localGoal.linked_assets)) {
        for (const assetId of localGoal.linked_assets) {
          const asset = db.prepare('SELECT * FROM assets WHERE id = ? AND user_id = ?')
            .get(assetId, req.user.id);

          if (asset) {
            const assetValue = getAssetValue(asset);
            db.prepare(`
              INSERT OR IGNORE INTO goal_asset_links (goal_id, asset_id, link_type, allocation_percent, initial_value_snapshot)
              VALUES (?, ?, 'FUNDING', 100, ?)
            `).run(goalId, assetId, assetValue);
          }
        }
      }

      migratedGoals.push({ old_id: localGoal.id, new_id: goalId, name: localGoal.name });
      migratedCount++;
    }

    res.json({
      message: `Migrated ${migratedCount} goals successfully`,
      migrated: migratedGoals,
    });
  } catch (error) {
    console.error('Error migrating goals:', error);
    res.status(500).json({ error: 'Failed to migrate goals' });
  }
});

export default router;
