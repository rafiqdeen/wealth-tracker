/**
 * Server-side interest calculation utilities for Fixed Income assets.
 * Ported from client/src/utils/interest.js to enable accurate
 * goal progress calculations for PPF, FD, and other Fixed Income assets.
 */

const DAYS_IN_YEAR = 365;

/**
 * Calculate compound interest for a single deposit
 */
export function calculateCompoundInterest(principal, rate, depositDate, asOfDate = new Date(), compoundingFrequency = 4) {
  const start = new Date(depositDate);
  const end = new Date(asOfDate);
  const days = (end - start) / (1000 * 60 * 60 * 24);
  const years = days / DAYS_IN_YEAR;
  if (years <= 0) return principal;
  const r = rate / 100;
  const n = compoundingFrequency;
  return principal * Math.pow(1 + r / n, n * years);
}

/**
 * Calculate total current value for multiple deposits with compound interest
 */
export function calculateFixedIncomeValue(transactions, rate, asOfDate = new Date(), compoundingFrequency = 1) {
  let totalPrincipal = 0;
  let totalCurrentValue = 0;
  for (const txn of transactions) {
    const amount = parseFloat(txn.total_amount) || 0;
    if (txn.type === 'BUY' || !txn.type) {
      totalPrincipal += amount;
      totalCurrentValue += calculateCompoundInterest(amount, rate, txn.transaction_date, asOfDate, compoundingFrequency);
    }
  }
  return {
    principal: totalPrincipal,
    interest: totalCurrentValue - totalPrincipal,
    currentValue: totalCurrentValue,
  };
}

/**
 * Get compounding frequency for different asset types
 */
export function getCompoundingFrequency(assetType) {
  const frequencies = {
    PPF: 1, FD: 4, RD: 4, NSC: 1, KVP: 1, EPF: 1, VPF: 1,
  };
  return frequencies[assetType] || 1;
}

/**
 * Get Financial Year for a given date (Indian FY: April to March)
 */
export function getFinancialYear(date) {
  const d = new Date(date);
  const month = d.getMonth();
  const year = d.getFullYear();
  const startYear = month < 3 ? year - 1 : year;
  const endYear = startYear + 1;
  return {
    fy: `${startYear}-${String(endYear).slice(2)}`,
    startYear,
    endYear,
    start: new Date(startYear, 3, 1),
    end: new Date(endYear, 2, 31),
  };
}

/**
 * Generate FY-wise interest schedule for recurring deposits (PPF, EPF, etc.)
 * Matches the client-side PPF bank method calculation exactly.
 */
export function generateRecurringDepositSchedule(transactions, rate, accountStartDate) {
  if (!transactions || transactions.length === 0) return null;

  const today = new Date();
  const currentFY = getFinancialYear(today);

  const deposits = transactions
    .filter(t => t.type === 'BUY' || !t.type)
    .map(t => ({ amount: parseFloat(t.total_amount) || 0, date: new Date(t.transaction_date) }))
    .sort((a, b) => a.date - b.date);

  if (deposits.length === 0) return null;

  const firstDepositFY = getFinancialYear(deposits[0].date);
  const r = rate / 100;

  // Group deposits by Financial Year with monthly breakdown
  const depositsByFY = {};
  for (const dep of deposits) {
    const fy = getFinancialYear(dep.date);
    if (!depositsByFY[fy.fy]) {
      depositsByFY[fy.fy] = { deposits: [], totalDeposited: 0, monthlyDeposits: {} };
    }
    depositsByFY[fy.fy].deposits.push(dep);
    depositsByFY[fy.fy].totalDeposited += dep.amount;

    const fyMonth = dep.date.getMonth() >= 3
      ? dep.date.getMonth() - 3
      : dep.date.getMonth() + 9;
    const depositDay = dep.date.getDate();

    if (!depositsByFY[fy.fy].monthlyDeposits[fyMonth]) {
      depositsByFY[fy.fy].monthlyDeposits[fyMonth] = { amount: 0, beforeFifth: 0, afterFifth: 0 };
    }
    depositsByFY[fy.fy].monthlyDeposits[fyMonth].amount += dep.amount;
    if (depositDay <= 5) {
      depositsByFY[fy.fy].monthlyDeposits[fyMonth].beforeFifth += dep.amount;
    } else {
      depositsByFY[fy.fy].monthlyDeposits[fyMonth].afterFifth += dep.amount;
    }
  }

  const calculateWeightedInterest = (fyData, openingBalance, annualRate, isCurrentFY, monthsElapsedInCurrentFY) => {
    const monthsForOpening = isCurrentFY ? monthsElapsedInCurrentFY : 12;
    let totalInterest = openingBalance * annualRate * (monthsForOpening / 12);

    for (let fyMonth = 0; fyMonth < 12; fyMonth++) {
      const monthData = fyData?.monthlyDeposits?.[fyMonth];
      if (!monthData) continue;
      const monthsRemaining = 12 - fyMonth;
      const effectiveMonthsForBeforeFifth = isCurrentFY
        ? Math.max(0, Math.min(monthsRemaining, monthsElapsedInCurrentFY - fyMonth))
        : monthsRemaining;
      const effectiveMonthsForAfterFifth = isCurrentFY
        ? Math.max(0, Math.min(monthsRemaining - 1, monthsElapsedInCurrentFY - fyMonth - 1))
        : Math.max(0, monthsRemaining - 1);
      totalInterest += monthData.beforeFifth * annualRate * (effectiveMonthsForBeforeFifth / 12);
      totalInterest += monthData.afterFifth * annualRate * (effectiveMonthsForAfterFifth / 12);
    }
    return totalInterest;
  };

  let openingBalance = 0;
  let cumulativeDeposits = 0;
  let cumulativeInterest = 0;
  const schedule = [];

  for (let year = firstDepositFY.startYear; year <= currentFY.startYear; year++) {
    const fyLabel = `${year}-${String(year + 1).slice(2)}`;
    const fyData = depositsByFY[fyLabel];
    const fyEnd = new Date(year + 1, 2, 31);

    const depositsThisFY = fyData?.totalDeposited || 0;
    cumulativeDeposits += depositsThisFY;

    const isCurrent = year === currentFY.startYear;
    let monthsElapsed = 12;

    if (isCurrent) {
      if (today.getMonth() >= 3) {
        monthsElapsed = today.getMonth() - 3 + 1;
      } else {
        monthsElapsed = today.getMonth() + 9 + 1;
      }
    }

    const interestEarned = calculateWeightedInterest(fyData, openingBalance, r, isCurrent, monthsElapsed);
    cumulativeInterest += interestEarned;
    const closingBalance = openingBalance + depositsThisFY + interestEarned;

    schedule.push({
      fy: fyLabel,
      status: isCurrent ? 'current' : (fyEnd < today ? 'completed' : 'upcoming'),
      openingBalance,
      depositsThisFY,
      interestEarned,
      closingBalance,
    });

    openingBalance = closingBalance;
  }

  const lastCompletedFY = schedule.filter(s => s.status === 'completed');
  const currentFYEntry = schedule.find(s => s.status === 'current');

  const bankBalance = lastCompletedFY.length > 0
    ? lastCompletedFY[lastCompletedFY.length - 1].closingBalance + (currentFYEntry?.depositsThisFY || 0)
    : (currentFYEntry?.depositsThisFY || 0);

  const lastEntry = schedule[schedule.length - 1];
  const totalPrincipal = cumulativeDeposits;
  const estimatedValue = lastEntry?.closingBalance || totalPrincipal;
  const totalCreditedInterest = bankBalance - totalPrincipal;

  return {
    summary: {
      totalDeposited: totalPrincipal,
      totalInterest: totalCreditedInterest,
      currentValue: bankBalance,
      estimatedValue,
      currentFYAccruedInterest: currentFYEntry?.interestEarned || 0,
      interestPercent: totalPrincipal > 0 ? (totalCreditedInterest / totalPrincipal) * 100 : 0,
    },
  };
}

/**
 * Calculate XIRR (Extended Internal Rate of Return) using Newton-Raphson iteration.
 * @param {Array} cashFlows - Array of { amount, date } where negative = outflow, positive = inflow
 * @param {number} guess - Initial guess for rate (default 0.1 = 10%)
 * @returns {number} XIRR as a percentage (e.g., 15.3 for 15.3%)
 */
export function calculateXIRR(cashFlows, guess = 0.1) {
  if (!cashFlows || cashFlows.length < 2) return 0;

  const sorted = [...cashFlows].sort((a, b) => new Date(a.date) - new Date(b.date));
  const firstDate = new Date(sorted[0].date);

  const values = sorted.map(cf => ({
    amount: cf.amount,
    days: (new Date(cf.date) - firstDate) / (1000 * 60 * 60 * 24),
  }));

  const MAX_ITERATIONS = 100;
  const TOLERANCE = 1e-7;
  let rate = guess;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let npv = 0;
    let dnpv = 0;

    for (const v of values) {
      const factor = Math.pow(1 + rate, v.days / DAYS_IN_YEAR);
      npv += v.amount / factor;
      dnpv -= (v.days / DAYS_IN_YEAR) * v.amount / (factor * (1 + rate));
    }

    if (Math.abs(npv) < TOLERANCE) return rate * 100;
    if (Math.abs(dnpv) < 1e-10) return rate * 100;

    const newRate = rate - npv / dnpv;
    if (!isFinite(newRate) || Math.abs(newRate - rate) < TOLERANCE) return rate * 100;
    rate = newRate;
  }

  return rate * 100;
}

/**
 * Calculate XIRR from transaction array and current value.
 * @param {Array} transactions - Array of { total_amount, transaction_date, type }
 * @param {number} currentValue - Current portfolio value
 * @param {Date} asOfDate - Date to calculate as of
 * @returns {number} XIRR as a percentage
 */
export function calculateXIRRFromTransactions(transactions, currentValue, asOfDate = new Date()) {
  if (!transactions || transactions.length === 0) return 0;

  const cashFlows = [];
  for (const txn of transactions) {
    const amount = parseFloat(txn.total_amount) || 0;
    if (amount > 0) {
      cashFlows.push({
        amount: txn.type === 'SELL' ? amount : -amount,
        date: txn.transaction_date,
      });
    }
  }

  if (currentValue > 0) {
    const endDate = asOfDate instanceof Date
      ? asOfDate.toISOString().split('T')[0]
      : asOfDate;
    cashFlows.push({ amount: currentValue, date: endDate });
  }

  return calculateXIRR(cashFlows);
}
