/**
 * Interest calculation utilities for Fixed Income assets
 */

/**
 * Calculate compound interest for a single deposit
 * @param {number} principal - Deposit amount
 * @param {number} rate - Annual interest rate (e.g., 7.1 for 7.1%)
 * @param {Date|string} depositDate - Date of deposit
 * @param {Date|string} asOfDate - Calculate value as of this date (default: today)
 * @param {number} compoundingFrequency - Times per year (1 = annual, 4 = quarterly, 12 = monthly)
 * @returns {number} Current value with interest
 */
export function calculateCompoundInterest(principal, rate, depositDate, asOfDate = new Date(), compoundingFrequency = 1) {
  const start = new Date(depositDate);
  const end = new Date(asOfDate);

  // Calculate years (can be fractional)
  const years = (end - start) / (365.25 * 24 * 60 * 60 * 1000);

  if (years <= 0) return principal;

  const r = rate / 100;
  const n = compoundingFrequency;

  // A = P(1 + r/n)^(nt)
  const amount = principal * Math.pow(1 + r / n, n * years);

  return amount;
}

/**
 * Calculate total current value for multiple deposits with compound interest
 * @param {Array} transactions - Array of {total_amount, transaction_date}
 * @param {number} rate - Annual interest rate
 * @param {Date} asOfDate - Calculate value as of this date
 * @param {number} compoundingFrequency - Times per year
 * @returns {object} { principal, interest, currentValue }
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

  const interest = totalCurrentValue - totalPrincipal;

  return {
    principal: totalPrincipal,
    interest: interest,
    currentValue: totalCurrentValue,
    interestPercent: totalPrincipal > 0 ? (interest / totalPrincipal) * 100 : 0
  };
}

/**
 * Get compounding frequency for different asset types
 * @param {string} assetType - PPF, FD, RD, etc.
 * @returns {number} Compounding frequency per year
 */
export function getCompoundingFrequency(assetType) {
  const frequencies = {
    PPF: 1,      // Annual compounding
    FD: 4,       // Quarterly (most banks)
    RD: 4,       // Quarterly
    NSC: 1,      // Annual
    KVP: 1,      // Annual
    EPF: 1,      // Annual
    VPF: 1,      // Annual
  };
  return frequencies[assetType] || 1;
}

/**
 * Format interest calculation summary
 * @param {object} calculation - Result from calculateFixedIncomeValue
 * @returns {string} Formatted summary
 */
export function formatInterestSummary(calculation) {
  const { principal, interest, currentValue, interestPercent } = calculation;
  return {
    principal: principal.toFixed(2),
    interest: interest.toFixed(2),
    currentValue: currentValue.toFixed(2),
    interestPercent: interestPercent.toFixed(2)
  };
}

/**
 * Calculate CAGR (Compound Annual Growth Rate)
 * Simple formula: (Ending Value / Beginning Value)^(1/years) - 1
 * @param {number} beginValue - Initial investment value
 * @param {number} endValue - Current/final value
 * @param {number} years - Number of years (can be fractional)
 * @returns {number} CAGR as a percentage (e.g., 12.5 for 12.5%)
 */
export function calculateCAGR(beginValue, endValue, years) {
  if (beginValue <= 0 || years <= 0) return 0;
  const cagr = (Math.pow(endValue / beginValue, 1 / years) - 1) * 100;
  return isFinite(cagr) ? cagr : 0;
}

/**
 * Calculate XIRR (Extended Internal Rate of Return)
 * Uses Newton-Raphson iteration method
 * @param {Array} cashFlows - Array of { amount, date } where negative = outflow, positive = inflow
 * @param {number} guess - Initial guess for rate (default 0.1 = 10%)
 * @returns {number} XIRR as a percentage (e.g., 15.3 for 15.3%)
 */
export function calculateXIRR(cashFlows, guess = 0.1) {
  if (!cashFlows || cashFlows.length < 2) return 0;

  // Sort by date
  const sorted = [...cashFlows].sort((a, b) => new Date(a.date) - new Date(b.date));
  const firstDate = new Date(sorted[0].date);

  // Convert to days from first date
  const values = sorted.map(cf => ({
    amount: cf.amount,
    days: (new Date(cf.date) - firstDate) / (1000 * 60 * 60 * 24)
  }));

  // Newton-Raphson iteration
  const MAX_ITERATIONS = 100;
  const TOLERANCE = 1e-7;
  let rate = guess;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let npv = 0;
    let dnpv = 0;

    for (const v of values) {
      const factor = Math.pow(1 + rate, v.days / 365);
      npv += v.amount / factor;
      dnpv -= (v.days / 365) * v.amount / (factor * (1 + rate));
    }

    if (Math.abs(npv) < TOLERANCE) {
      return rate * 100;
    }

    const newRate = rate - npv / dnpv;

    if (!isFinite(newRate) || Math.abs(newRate - rate) < TOLERANCE) {
      return rate * 100;
    }

    rate = newRate;
  }

  return rate * 100;
}

/**
 * Calculate XIRR from transactions array (compatible with asset transactions)
 * @param {Array} transactions - Array of transaction objects with total_amount, transaction_date, type
 * @param {number} currentValue - Current value of the investment
 * @param {Date} asOfDate - Date to calculate XIRR as of
 * @returns {number} XIRR as a percentage
 */
export function calculateXIRRFromTransactions(transactions, currentValue, asOfDate = new Date()) {
  if (!transactions || transactions.length === 0) return 0;

  const cashFlows = [];

  // Add all transactions as cash outflows (negative for buys)
  for (const txn of transactions) {
    const amount = parseFloat(txn.total_amount) || 0;
    if (amount > 0) {
      cashFlows.push({
        amount: txn.type === 'SELL' ? amount : -amount,  // BUY is outflow (negative), SELL is inflow
        date: txn.transaction_date
      });
    }
  }

  // Add current value as final inflow (normalize to date string for consistency)
  if (currentValue > 0) {
    const endDate = asOfDate instanceof Date
      ? asOfDate.toISOString().split('T')[0]
      : asOfDate;
    cashFlows.push({
      amount: currentValue,
      date: endDate
    });
  }

  return calculateXIRR(cashFlows);
}

/**
 * Debug XIRR calculation - returns detailed breakdown
 * @param {Array} transactions - Array of transaction objects
 * @param {number} currentValue - Current portfolio value
 * @param {Date} asOfDate - Date to calculate as of
 * @returns {object} Debug info including cash flows, dates, and calculated XIRR
 */
export function debugXIRR(transactions, currentValue, asOfDate = new Date()) {
  if (!transactions || transactions.length === 0) {
    return { error: 'No transactions', xirr: 0 };
  }

  const cashFlows = [];
  let totalInvested = 0;
  let totalSold = 0;

  for (const txn of transactions) {
    const amount = parseFloat(txn.total_amount) || 0;
    if (amount > 0) {
      if (txn.type === 'SELL') {
        totalSold += amount;
        cashFlows.push({
          amount: amount,
          date: txn.transaction_date,
          type: 'SELL',
          description: `Sold for ₹${amount.toLocaleString('en-IN')}`
        });
      } else {
        totalInvested += amount;
        cashFlows.push({
          amount: -amount,
          date: txn.transaction_date,
          type: 'BUY',
          description: `Invested ₹${amount.toLocaleString('en-IN')}`
        });
      }
    }
  }

  const endDate = asOfDate instanceof Date
    ? asOfDate.toISOString().split('T')[0]
    : asOfDate;

  if (currentValue > 0) {
    cashFlows.push({
      amount: currentValue,
      date: endDate,
      type: 'CURRENT_VALUE',
      description: `Current value ₹${currentValue.toLocaleString('en-IN')}`
    });
  }

  // Sort by date
  const sorted = [...cashFlows].sort((a, b) => new Date(a.date) - new Date(b.date));

  const xirr = calculateXIRR(sorted.map(cf => ({ amount: cf.amount, date: cf.date })));

  return {
    cashFlows: sorted,
    totalInvested,
    totalSold,
    currentValue,
    netInvested: totalInvested - totalSold,
    totalReturns: currentValue + totalSold - totalInvested,
    absoluteReturn: totalInvested > 0 ? ((currentValue + totalSold - totalInvested) / totalInvested * 100) : 0,
    xirr,
    firstDate: sorted[0]?.date,
    lastDate: sorted[sorted.length - 1]?.date,
    transactionCount: transactions.length
  };
}

/**
 * Calculate absolute return percentage
 * @param {number} invested - Total invested amount
 * @param {number} currentValue - Current value
 * @returns {number} Absolute return as percentage
 */
export function calculateAbsoluteReturn(invested, currentValue) {
  if (invested <= 0) return 0;
  return ((currentValue - invested) / invested) * 100;
}

/**
 * Calculate years between two dates
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date (default: today)
 * @returns {number} Years (can be fractional)
 */
export function yearsBetweenDates(startDate, endDate = new Date()) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return (end - start) / (365.25 * 24 * 60 * 60 * 1000);
}
