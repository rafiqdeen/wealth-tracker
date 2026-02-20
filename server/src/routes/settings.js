import express from 'express';
import db from '../db/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticateToken);

// Default card preferences (6 cards)
const DEFAULT_CARD_PREFS = {
  asset_allocation: true,
  risk_diversification: true,
  benchmark_comparison: true,
  liquidity_analysis: true,
  gainers_losers: true,
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

    // Filter to only valid keys — skip unknown keys (handles migration from old 12-card prefs)
    const validKeys = Object.keys(DEFAULT_CARD_PREFS);
    const filteredPrefs = {};
    for (const key of Object.keys(prefs)) {
      if (!validKeys.includes(key)) {
        continue; // Skip unknown keys instead of returning 400
      }
      if (typeof prefs[key] !== 'boolean') {
        return res.status(400).json({ error: `Preference for ${key} must be boolean` });
      }
      filteredPrefs[key] = prefs[key];
    }

    const prefsJson = JSON.stringify(filteredPrefs);
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

    res.json({ success: true, prefs: filteredPrefs });
  } catch (error) {
    console.error('[Settings] Error updating insights card prefs:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// GET /api/settings/monthly-expense - Get user's monthly expense setting
router.get('/monthly-expense', async (req, res) => {
  try {
    const userId = req.user.id;

    const settings = await db.get(
      'SELECT monthly_expense FROM user_settings WHERE user_id = ?',
      [userId]
    );

    const monthlyExpense = settings?.monthly_expense ?? 50000;
    res.json({ monthlyExpense });
  } catch (error) {
    console.error('[Settings] Error fetching monthly expense:', error);
    res.status(500).json({ error: 'Failed to fetch monthly expense' });
  }
});

// PUT /api/settings/monthly-expense - Update user's monthly expense setting
router.put('/monthly-expense', async (req, res) => {
  try {
    const userId = req.user.id;
    const { monthlyExpense } = req.body;

    if (typeof monthlyExpense !== 'number' || monthlyExpense < 0) {
      return res.status(400).json({ error: 'monthlyExpense must be a non-negative number' });
    }

    const now = new Date().toISOString();

    const existing = await db.get(
      'SELECT id FROM user_settings WHERE user_id = ?',
      [userId]
    );

    if (existing) {
      await db.run(
        'UPDATE user_settings SET monthly_expense = ?, updated_at = ? WHERE user_id = ?',
        [Math.round(monthlyExpense), now, userId]
      );
    } else {
      await db.run(
        'INSERT INTO user_settings (user_id, monthly_expense, created_at, updated_at) VALUES (?, ?, ?, ?)',
        [userId, Math.round(monthlyExpense), now, now]
      );
    }

    res.json({ success: true, monthlyExpense: Math.round(monthlyExpense) });
  } catch (error) {
    console.error('[Settings] Error updating monthly expense:', error);
    res.status(500).json({ error: 'Failed to update monthly expense' });
  }
});

export default router;
