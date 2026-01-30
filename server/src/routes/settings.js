import express from 'express';
import db from '../db/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticateToken);

// Default card preferences (all enabled)
const DEFAULT_CARD_PREFS = {
  portfolio_performance: true,
  asset_allocation: true,
  risk_diversification: true,
  benchmark_comparison: true,
  liquidity_analysis: true,
  holding_period: true,
  gainers_losers: true,
  asset_type_breakdown: true,
  income_summary: true,
  tax_implications: true,
};

// GET /api/settings/insights-cards - Get user's insights card preferences
router.get('/insights-cards', async (req, res) => {
  try {
    const userId = req.user.id;

    const settings = await db.get(
      'SELECT insights_card_prefs FROM user_settings WHERE user_id = ?',
      [userId]
    );

    if (settings && settings.insights_card_prefs) {
      const prefs = JSON.parse(settings.insights_card_prefs);
      res.json({ prefs });
    } else {
      // Return defaults if no preferences saved
      res.json({ prefs: DEFAULT_CARD_PREFS });
    }
  } catch (error) {
    console.error('[Settings] Error fetching insights card prefs:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// PUT /api/settings/insights-cards - Update user's insights card preferences
router.put('/insights-cards', async (req, res) => {
  try {
    const userId = req.user.id;
    const { prefs } = req.body;

    if (!prefs || typeof prefs !== 'object') {
      return res.status(400).json({ error: 'Invalid preferences format' });
    }

    // Validate that all keys are valid card IDs
    const validKeys = Object.keys(DEFAULT_CARD_PREFS);
    for (const key of Object.keys(prefs)) {
      if (!validKeys.includes(key)) {
        return res.status(400).json({ error: `Invalid card ID: ${key}` });
      }
      if (typeof prefs[key] !== 'boolean') {
        return res.status(400).json({ error: `Preference for ${key} must be boolean` });
      }
    }

    const prefsJson = JSON.stringify(prefs);
    const now = new Date().toISOString();

    // Upsert: insert if not exists, update if exists
    const existing = await db.get(
      'SELECT id FROM user_settings WHERE user_id = ?',
      [userId]
    );

    if (existing) {
      await db.run(
        'UPDATE user_settings SET insights_card_prefs = ?, updated_at = ? WHERE user_id = ?',
        [prefsJson, now, userId]
      );
    } else {
      await db.run(
        'INSERT INTO user_settings (user_id, insights_card_prefs, created_at, updated_at) VALUES (?, ?, ?, ?)',
        [userId, prefsJson, now, now]
      );
    }

    res.json({ success: true, prefs });
  } catch (error) {
    console.error('[Settings] Error updating insights card prefs:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

export default router;
