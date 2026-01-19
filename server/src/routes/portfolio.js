import express from 'express';
import db from '../db/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticateToken);

// Record today's portfolio snapshot
router.post('/snapshot', (req, res) => {
  try {
    const { totalValue, totalInvested, dayChange } = req.body;
    const today = new Date().toISOString().split('T')[0];

    // Upsert: Insert or update today's snapshot
    const stmt = db.prepare(`
      INSERT INTO portfolio_history (user_id, date, total_value, total_invested, day_change)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, date) DO UPDATE SET
        total_value = excluded.total_value,
        total_invested = excluded.total_invested,
        day_change = excluded.day_change,
        created_at = CURRENT_TIMESTAMP
    `);

    stmt.run(req.user.id, today, totalValue, totalInvested, dayChange || 0);

    res.json({ success: true, date: today });
  } catch (error) {
    console.error('Error recording snapshot:', error);
    res.status(500).json({ error: 'Failed to record snapshot' });
  }
});

// Get portfolio history
router.get('/history', (req, res) => {
  try {
    const { period } = req.query; // 1D, 1W, 1M, 3M, 6M, 1Y, ALL

    let dateFilter = '';
    const today = new Date();

    switch (period) {
      case '1W':
        const oneWeekAgo = new Date(today);
        oneWeekAgo.setDate(today.getDate() - 7);
        dateFilter = `AND date >= '${oneWeekAgo.toISOString().split('T')[0]}'`;
        break;
      case '1M':
        const oneMonthAgo = new Date(today);
        oneMonthAgo.setMonth(today.getMonth() - 1);
        dateFilter = `AND date >= '${oneMonthAgo.toISOString().split('T')[0]}'`;
        break;
      case '3M':
        const threeMonthsAgo = new Date(today);
        threeMonthsAgo.setMonth(today.getMonth() - 3);
        dateFilter = `AND date >= '${threeMonthsAgo.toISOString().split('T')[0]}'`;
        break;
      case '6M':
        const sixMonthsAgo = new Date(today);
        sixMonthsAgo.setMonth(today.getMonth() - 6);
        dateFilter = `AND date >= '${sixMonthsAgo.toISOString().split('T')[0]}'`;
        break;
      case '1Y':
        const oneYearAgo = new Date(today);
        oneYearAgo.setFullYear(today.getFullYear() - 1);
        dateFilter = `AND date >= '${oneYearAgo.toISOString().split('T')[0]}'`;
        break;
      case 'ALL':
      default:
        dateFilter = '';
    }

    const history = db.prepare(`
      SELECT date, total_value, total_invested, day_change
      FROM portfolio_history
      WHERE user_id = ? ${dateFilter}
      ORDER BY date ASC
    `).all(req.user.id);

    // Calculate performance metrics
    let performance = {
      startValue: 0,
      endValue: 0,
      absoluteChange: 0,
      percentChange: 0,
    };

    if (history.length > 0) {
      performance.startValue = history[0].total_value;
      performance.endValue = history[history.length - 1].total_value;
      performance.absoluteChange = performance.endValue - performance.startValue;
      performance.percentChange = performance.startValue > 0
        ? ((performance.endValue - performance.startValue) / performance.startValue) * 100
        : 0;
    }

    res.json({ history, performance });
  } catch (error) {
    console.error('Error fetching portfolio history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Clear portfolio history
router.delete('/history', (req, res) => {
  try {
    db.prepare('DELETE FROM portfolio_history WHERE user_id = ?').run(req.user.id);
    res.json({ success: true, message: 'Portfolio history cleared' });
  } catch (error) {
    console.error('Error clearing portfolio history:', error);
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

// Get latest snapshot
router.get('/latest', (req, res) => {
  try {
    const latest = db.prepare(`
      SELECT date, total_value, total_invested, day_change
      FROM portfolio_history
      WHERE user_id = ?
      ORDER BY date DESC
      LIMIT 1
    `).get(req.user.id);

    res.json({ snapshot: latest || null });
  } catch (error) {
    console.error('Error fetching latest snapshot:', error);
    res.status(500).json({ error: 'Failed to fetch latest snapshot' });
  }
});

// Backfill history from transactions - CLEARS ALL and rebuilds from scratch
// Accepts optional currentValue and currentInvested to project historical values
router.post('/backfill', (req, res) => {
  try {
    const { currentValue, currentInvested } = req.body;

    // Get all transactions for this user, ordered by date
    const transactions = db.prepare(`
      SELECT t.*, a.category, a.asset_type, a.name as asset_name
      FROM transactions t
      JOIN assets a ON t.asset_id = a.id
      WHERE t.user_id = ?
      ORDER BY t.transaction_date ASC
    `).all(req.user.id);

    if (transactions.length === 0) {
      return res.json({ message: 'No transactions to backfill from', backfilled: 0 });
    }

    // CLEAR ALL existing history - start fresh
    db.prepare('DELETE FROM portfolio_history WHERE user_id = ?').run(req.user.id);

    // Get the date range
    const firstTxnDate = new Date(transactions[0].transaction_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Generate monthly dates from first transaction to today (1st of each month)
    const monthlyDates = [];
    const currentDate = new Date(firstTxnDate.getFullYear(), firstTxnDate.getMonth(), 1);

    while (currentDate <= today) {
      monthlyDates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    // Always include today
    const todayStr = today.toISOString().split('T')[0];
    if (!monthlyDates.includes(todayStr)) {
      monthlyDates.push(todayStr);
    }

    // Use only monthly dates for a cleaner chart (not every transaction date)
    const allDates = monthlyDates;

    // Calculate total invested from transactions (for gain ratio calculation)
    const totalInvestedFromTxns = transactions.reduce((sum, t) => {
      return sum + (t.type === 'BUY' ? (t.total_amount || 0) : -(t.total_amount || 0));
    }, 0);

    // Calculate gain ratio: if we have current value, use it to project historical values
    // gainRatio = currentValue / currentInvested (e.g., 1.15 means 15% gain)
    const gainRatio = (currentValue && currentInvested && currentInvested > 0)
      ? currentValue / currentInvested
      : 1;

    // Insert statement
    const insertStmt = db.prepare(`
      INSERT INTO portfolio_history (user_id, date, total_value, total_invested, day_change)
      VALUES (?, ?, ?, ?, 0)
    `);

    let backfilledCount = 0;
    const debugData = [];

    for (const date of allDates) {
      // Calculate cumulative invested up to this date
      const txnsUpToDate = transactions.filter(t => t.transaction_date <= date);

      const investedUpToDate = txnsUpToDate.reduce((sum, t) => {
        // BUY adds to invested, SELL subtracts
        return sum + (t.type === 'BUY' ? (t.total_amount || 0) : -(t.total_amount || 0));
      }, 0);

      // Project value based on current gain ratio
      // This assumes proportional growth over time (simplified model)
      const projectedValue = investedUpToDate * gainRatio;

      insertStmt.run(req.user.id, date, projectedValue, investedUpToDate);
      backfilledCount++;

      // Debug: track first few and last few entries
      if (backfilledCount <= 3 || allDates.indexOf(date) >= allDates.length - 3) {
        debugData.push({ date, invested: investedUpToDate, value: projectedValue, txnCount: txnsUpToDate.length });
      }
    }

    res.json({
      message: 'Backfill complete - history rebuilt from transactions',
      backfilled: backfilledCount,
      totalTransactions: transactions.length,
      gainRatio: gainRatio.toFixed(4),
      dateRange: {
        from: allDates[0],
        to: allDates[allDates.length - 1]
      },
      debug: debugData
    });
  } catch (error) {
    console.error('Error backfilling history:', error);
    res.status(500).json({ error: 'Failed to backfill history' });
  }
});

// Get cumulative investment data for line chart
router.get('/cumulative-investments', (req, res) => {
  try {
    const { period } = req.query;

    // Get all transactions for this user, ordered by date
    const transactions = db.prepare(`
      SELECT t.transaction_date, t.type, t.total_amount
      FROM transactions t
      WHERE t.user_id = ?
      ORDER BY t.transaction_date ASC
    `).all(req.user.id);

    if (transactions.length === 0) {
      return res.json({ data: [], summary: { totalInvested: 0, firstDate: null, lastDate: null } });
    }

    // Apply period filter to get cutoff date
    let cutoffDate = null;
    if (period && period !== 'ALL') {
      const now = new Date();
      cutoffDate = new Date();

      switch (period) {
        case '1W':
          cutoffDate.setDate(now.getDate() - 7);
          break;
        case '1M':
          cutoffDate.setMonth(now.getMonth() - 1);
          break;
        case '3M':
          cutoffDate.setMonth(now.getMonth() - 3);
          break;
        case '6M':
          cutoffDate.setMonth(now.getMonth() - 6);
          break;
        case '1Y':
          cutoffDate.setFullYear(now.getFullYear() - 1);
          break;
      }
    }

    // Build cumulative data points
    // Group by date first (multiple transactions on same day)
    const dateMap = {};
    let runningTotal = 0;

    for (const txn of transactions) {
      const amount = txn.type === 'BUY' ? (txn.total_amount || 0) : -(txn.total_amount || 0);
      runningTotal += amount;

      // Store the cumulative total for each date
      dateMap[txn.transaction_date] = runningTotal;
    }

    // Convert to array
    let dataPoints = Object.entries(dateMap)
      .map(([date, cumulative]) => ({ date, cumulative }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Apply period filter
    if (cutoffDate) {
      const cutoffStr = cutoffDate.toISOString().split('T')[0];

      // Find the cumulative value just before cutoff (starting point)
      let startingValue = 0;
      for (const point of dataPoints) {
        if (point.date < cutoffStr) {
          startingValue = point.cumulative;
        } else {
          break;
        }
      }

      // Filter to only include points after cutoff
      dataPoints = dataPoints.filter(p => p.date >= cutoffStr);

      // If we have a starting value but no points at cutoff, add the cutoff point
      if (startingValue > 0 && (dataPoints.length === 0 || dataPoints[0].date > cutoffStr)) {
        dataPoints.unshift({ date: cutoffStr, cumulative: startingValue });
      }
    }

    // Add today's date with final cumulative if not already present
    const today = new Date().toISOString().split('T')[0];
    if (dataPoints.length > 0 && dataPoints[dataPoints.length - 1].date !== today) {
      dataPoints.push({ date: today, cumulative: runningTotal });
    }

    // Calculate summary
    const totalInvested = runningTotal;
    const firstDate = dataPoints.length > 0 ? dataPoints[0].date : null;
    const lastDate = dataPoints.length > 0 ? dataPoints[dataPoints.length - 1].date : null;

    res.json({
      data: dataPoints,
      summary: {
        totalInvested,
        firstDate,
        lastDate,
        dataPoints: dataPoints.length,
      }
    });
  } catch (error) {
    console.error('Error fetching cumulative investments:', error);
    res.status(500).json({ error: 'Failed to fetch cumulative investments' });
  }
});

// Get monthly investment breakdown for bar chart
router.get('/monthly-investments', (req, res) => {
  try {
    const { period } = req.query;

    // Get all transactions for this user
    const transactions = db.prepare(`
      SELECT t.transaction_date, t.type, t.total_amount
      FROM transactions t
      WHERE t.user_id = ?
      ORDER BY t.transaction_date ASC
    `).all(req.user.id);

    if (transactions.length === 0) {
      return res.json({ monthly: [], summary: { totalInvested: 0, months: 0 } });
    }

    // Group transactions by month
    const monthlyMap = {};

    for (const txn of transactions) {
      const date = new Date(txn.transaction_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyMap[monthKey]) {
        monthlyMap[monthKey] = { invested: 0, withdrawn: 0 };
      }

      if (txn.type === 'BUY') {
        monthlyMap[monthKey].invested += txn.total_amount || 0;
      } else {
        monthlyMap[monthKey].withdrawn += txn.total_amount || 0;
      }
    }

    // Convert to array and sort
    let monthly = Object.entries(monthlyMap)
      .map(([monthKey, data]) => ({
        month: monthKey,
        invested: data.invested,
        withdrawn: data.withdrawn,
        net: data.invested - data.withdrawn,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Apply period filter
    if (period && period !== 'ALL') {
      const now = new Date();
      let cutoffDate = new Date();

      switch (period) {
        case '1W':
          cutoffDate.setDate(now.getDate() - 7);
          break;
        case '1M':
          cutoffDate.setMonth(now.getMonth() - 1);
          break;
        case '3M':
          cutoffDate.setMonth(now.getMonth() - 3);
          break;
        case '6M':
          cutoffDate.setMonth(now.getMonth() - 6);
          break;
        case '1Y':
          cutoffDate.setFullYear(now.getFullYear() - 1);
          break;
      }

      const cutoffMonth = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}`;
      monthly = monthly.filter(m => m.month >= cutoffMonth);
    }

    // Calculate summary
    const totalInvested = monthly.reduce((sum, m) => sum + m.invested, 0);
    const totalWithdrawn = monthly.reduce((sum, m) => sum + m.withdrawn, 0);

    res.json({
      monthly,
      summary: {
        totalInvested,
        totalWithdrawn,
        netInvested: totalInvested - totalWithdrawn,
        months: monthly.length,
      }
    });
  } catch (error) {
    console.error('Error fetching monthly investments:', error);
    res.status(500).json({ error: 'Failed to fetch monthly investments' });
  }
});

// Debug endpoint - check transactions
router.get('/debug-transactions', (req, res) => {
  try {
    const transactions = db.prepare(`
      SELECT t.transaction_date, t.type, t.quantity, t.price, t.total_amount, a.name, a.category
      FROM transactions t
      JOIN assets a ON t.asset_id = a.id
      WHERE t.user_id = ?
      ORDER BY t.transaction_date ASC
    `).all(req.user.id);

    const history = db.prepare(`
      SELECT date, total_value, total_invested
      FROM portfolio_history
      WHERE user_id = ?
      ORDER BY date ASC
    `).all(req.user.id);

    res.json({
      transactionCount: transactions.length,
      transactions: transactions.slice(0, 10), // First 10
      transactionsLast: transactions.slice(-5), // Last 5
      historyCount: history.length,
      historyFirst: history.slice(0, 5),
      historyLast: history.slice(-5)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
