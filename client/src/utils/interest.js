/**
 * Interest calculation utilities for Fixed Income assets
 */

/**
 * Calculate compound interest for a single deposit (Quarterly Compounding)
 * @param {number} principal - Deposit amount
 * @param {number} rate - Annual interest rate (e.g., 7.1 for 7.1%)
 * @param {Date|string} depositDate - Date of deposit
 * @param {Date|string} asOfDate - Calculate value as of this date (default: today)
 * @param {number} compoundingFrequency - Times per year (default: 4 for quarterly)
 * @returns {number} Current value with interest
 */
export function calculateCompoundInterest(principal, rate, depositDate, asOfDate = new Date(), compoundingFrequency = 4) {
  const start = new Date(depositDate);
  const end = new Date(asOfDate);

  // Calculate years using 365 days (standard for Indian banks)
  const days = (end - start) / (1000 * 60 * 60 * 24);
  const years = days / 365;

  if (years <= 0) return principal;

  const r = rate / 100;
  const n = compoundingFrequency;

  // Compound Interest: A = P × (1 + r/n)^(n×t)
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
 * Generate interest schedule for Fixed Income assets (Quarterly Compounding)
 * @param {number} principal - Initial deposit amount
 * @param {number} rate - Annual interest rate (e.g., 7.1 for 7.1%)
 * @param {string|Date} startDate - Start date of the deposit
 * @param {string|Date} maturityDate - Maturity date (optional)
 * @param {number} compoundingFrequency - Times per year (1=annual, 4=quarterly, 12=monthly)
 * @returns {object} { schedule: Array, summary: object }
 */
export function generateCompoundingSchedule(principal, rate, startDate, maturityDate, compoundingFrequency = 4) {
  const start = new Date(startDate);
  const today = new Date();
  const maturity = maturityDate ? new Date(maturityDate) : null;
  const endDate = maturity || new Date(start.getFullYear() + 5, start.getMonth(), start.getDate()); // Default 5 years if no maturity

  const schedule = [];
  const r = rate / 100;
  const periodMonths = 12 / compoundingFrequency;
  const periodRate = r / compoundingFrequency;

  // Calculate total tenure in days and years
  const totalDays = (endDate - start) / (1000 * 60 * 60 * 24);
  const totalYears = totalDays / 365;

  // Compound Interest maturity value: A = P × (1 + r/n)^(n×t)
  const maturityValue = principal * Math.pow(1 + periodRate, compoundingFrequency * totalYears);
  const totalInterest = maturityValue - principal;

  let balance = principal;
  let cumulativeInterest = 0;
  let periodNumber = 0;

  // Helper to add months safely without date rollover issues
  const addMonths = (date, months) => {
    const result = new Date(date);
    const originalDay = date.getDate();
    result.setMonth(result.getMonth() + months);
    // If day changed (rolled over due to shorter month), set to last day of target month
    if (result.getDate() !== originalDay) {
      result.setDate(0); // Go to last day of previous month
    }
    return result;
  };

  // Get period label based on period number (sequential quarters)
  const getPeriodLabel = (periodNum, startMonth, startYear) => {
    if (compoundingFrequency === 1) {
      return `Year ${startYear + periodNum - 1}`;
    }
    if (compoundingFrequency === 4) {
      // Calculate which quarter this period falls in
      const monthsFromStart = (periodNum - 1) * periodMonths;
      const currentMonth = (startMonth + monthsFromStart) % 12;
      const yearsAdded = Math.floor((startMonth + monthsFromStart) / 12);
      const currentYear = startYear + yearsAdded;
      const quarter = Math.floor(currentMonth / 3) + 1;
      return `Q${quarter} ${currentYear}`;
    }
    if (compoundingFrequency === 12) {
      const monthsFromStart = periodNum - 1;
      const currentMonth = (startMonth + monthsFromStart) % 12;
      const yearsAdded = Math.floor((startMonth + monthsFromStart) / 12);
      const currentYear = startYear + yearsAdded;
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${monthNames[currentMonth]} ${currentYear}`;
    }
    return `Period ${periodNum}`;
  };

  const startMonth = start.getMonth();
  const startYear = start.getFullYear();
  let currentDate = new Date(start);

  while (currentDate < endDate) {
    periodNumber++;
    const periodStart = new Date(currentDate);

    // Generate label based on period number
    const label = getPeriodLabel(periodNumber, startMonth, startYear);

    // Move to next period date
    currentDate = addMonths(currentDate, periodMonths);
    const periodEnd = new Date(currentDate);

    // Cap periodEnd at maturity date
    const cappedPeriodEnd = maturity && periodEnd > maturity ? maturity : periodEnd;

    // Compound interest: interest on current balance
    const interestEarned = balance * periodRate;
    cumulativeInterest += interestEarned;
    const closingBalance = balance + interestEarned;

    const isPast = cappedPeriodEnd <= today;
    const isCurrent = periodStart <= today && cappedPeriodEnd > today;
    const isFuture = periodStart > today;

    schedule.push({
      period: periodNumber,
      label: label,
      startDate: periodStart.toISOString().split('T')[0],
      endDate: cappedPeriodEnd.toISOString().split('T')[0],
      openingBalance: balance,
      interestEarned: interestEarned,
      closingBalance: closingBalance,
      cumulativeInterest: cumulativeInterest,
      status: isPast ? 'completed' : isCurrent ? 'current' : 'upcoming'
    });

    balance = closingBalance;

    // Safety limit - max 60 periods (15 years quarterly)
    if (periodNumber >= 60) break;
  }

  // Calculate tenure progress
  const elapsedDays = Math.max(0, (today - start) / (1000 * 60 * 60 * 24));
  const progressPercent = totalDays ? Math.min(100, (elapsedDays / totalDays) * 100) : null;

  // Current value using compound interest (as of today)
  const yearsElapsed = elapsedDays / 365;
  const currentValue = principal * Math.pow(1 + periodRate, compoundingFrequency * yearsElapsed);
  const currentInterest = currentValue - principal;

  return {
    schedule,
    summary: {
      principal,
      rate,
      compoundingFrequency,
      startDate: start.toISOString().split('T')[0],
      maturityDate: maturity?.toISOString().split('T')[0] || null,
      maturityValue: maturityValue,
      totalInterest: totalInterest,
      currentValue,
      currentInterest,
      progressPercent,
      totalPeriods: schedule.length,
      completedPeriods: schedule.filter(p => p.status === 'completed').length
    }
  };
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

/**
 * Get Financial Year for a given date (Indian FY: April to March)
 * @param {Date|string} date - The date to get FY for
 * @returns {object} { fy: '2024-25', startYear: 2024, endYear: 2025, start: Date, end: Date }
 */
export function getFinancialYear(date) {
  const d = new Date(date);
  const month = d.getMonth(); // 0-11
  const year = d.getFullYear();

  // FY starts in April (month 3)
  // Jan-Mar belongs to previous FY
  const startYear = month < 3 ? year - 1 : year;
  const endYear = startYear + 1;

  return {
    fy: `${startYear}-${String(endYear).slice(2)}`,
    startYear,
    endYear,
    start: new Date(startYear, 3, 1), // April 1
    end: new Date(endYear, 2, 31)     // March 31
  };
}

/**
 * Generate FY-wise interest schedule for recurring deposits (PPF, EPF, VPF, etc.)
 *
 * PPF Interest Calculation (Actual Bank Method):
 * - Interest calculated monthly on minimum balance between 5th and month-end
 * - Deposits made by 5th earn interest for that month
 * - Deposits made after 5th earn interest from next month
 * - Interest credited annually on March 31st
 *
 * For monthly deposits made by 5th:
 * - April deposit: 12 months interest
 * - May deposit: 11 months interest
 * - ...
 * - March deposit: 1 month interest
 * - Total weight: 78 months out of 144 possible = 54.17% effective
 *
 * @param {Array} transactions - Array of {total_amount, transaction_date, type}
 * @param {number} rate - Annual interest rate (e.g., 7.1 for 7.1%)
 * @param {string|Date} accountStartDate - When the account was opened (for FY calculation)
 * @returns {object} { schedule: Array, summary: object }
 */
export function generateRecurringDepositSchedule(transactions, rate, accountStartDate) {
  if (!transactions || transactions.length === 0) {
    return null;
  }

  const today = new Date();
  const currentFY = getFinancialYear(today);

  // Get earliest transaction date or account start date
  const deposits = transactions
    .filter(t => t.type === 'BUY' || !t.type)
    .map(t => ({
      amount: parseFloat(t.total_amount) || 0,
      date: new Date(t.transaction_date)
    }))
    .sort((a, b) => a.date - b.date);

  if (deposits.length === 0) return null;

  const firstDepositFY = getFinancialYear(deposits[0].date);
  const r = rate / 100;

  // Group deposits by Financial Year with monthly breakdown
  const depositsByFY = {};
  for (const dep of deposits) {
    const fy = getFinancialYear(dep.date);
    if (!depositsByFY[fy.fy]) {
      depositsByFY[fy.fy] = {
        fy: fy.fy,
        startYear: fy.startYear,
        endYear: fy.endYear,
        fyStart: fy.start,
        fyEnd: fy.end,
        deposits: [],
        totalDeposited: 0,
        monthlyDeposits: {} // Track deposits by month for accurate interest
      };
    }
    depositsByFY[fy.fy].deposits.push(dep);
    depositsByFY[fy.fy].totalDeposited += dep.amount;

    // Track monthly deposits for weighted interest calculation
    // Month 0 = April, Month 11 = March (relative to FY)
    const fyMonth = dep.date.getMonth() >= 3
      ? dep.date.getMonth() - 3  // Apr(3)->0, May(4)->1, etc.
      : dep.date.getMonth() + 9; // Jan(0)->10, Feb(1)->11, Mar(2)->12
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

  /**
   * Calculate weighted interest for deposits in a FY
   * Each deposit earns interest based on which month it was made
   * and whether it was before or after the 5th
   */
  const calculateWeightedInterest = (fyData, openingBalance, annualRate, isCurrentFY, monthsElapsedInCurrentFY) => {
    // Opening balance earns full year interest (or pro-rated for current FY)
    const monthsForOpening = isCurrentFY ? monthsElapsedInCurrentFY : 12;
    let totalInterest = openingBalance * annualRate * (monthsForOpening / 12);

    // For each month's deposits, calculate weighted interest
    // Month 0 = April (12 months remaining), Month 11 = March (1 month remaining)
    for (let fyMonth = 0; fyMonth < 12; fyMonth++) {
      const monthData = fyData?.monthlyDeposits?.[fyMonth];
      if (!monthData) continue;

      // Months remaining in FY after this month
      const monthsRemaining = 12 - fyMonth;

      // For current FY, cap at months elapsed
      const effectiveMonthsForBeforeFifth = isCurrentFY
        ? Math.max(0, Math.min(monthsRemaining, monthsElapsedInCurrentFY - fyMonth))
        : monthsRemaining;

      const effectiveMonthsForAfterFifth = isCurrentFY
        ? Math.max(0, Math.min(monthsRemaining - 1, monthsElapsedInCurrentFY - fyMonth - 1))
        : Math.max(0, monthsRemaining - 1);

      // Deposits before 5th earn interest for remaining months including current
      totalInterest += monthData.beforeFifth * annualRate * (effectiveMonthsForBeforeFifth / 12);

      // Deposits after 5th earn interest for remaining months excluding current
      totalInterest += monthData.afterFifth * annualRate * (effectiveMonthsForAfterFifth / 12);
    }

    return totalInterest;
  };

  // Generate schedule from first FY to current FY
  const schedule = [];
  let openingBalance = 0;
  let cumulativeDeposits = 0;
  let cumulativeInterest = 0;

  // Iterate through all FYs from first deposit to current
  for (let year = firstDepositFY.startYear; year <= currentFY.startYear; year++) {
    const fyLabel = `${year}-${String(year + 1).slice(2)}`;
    const fyData = depositsByFY[fyLabel];
    const fyEnd = new Date(year + 1, 2, 31); // March 31 of end year
    const fyStart = new Date(year, 3, 1);    // April 1 of start year

    const depositsThisFY = fyData?.totalDeposited || 0;
    cumulativeDeposits += depositsThisFY;

    // Determine status and months elapsed
    const isCurrent = year === currentFY.startYear;
    const isPast = fyEnd < today;
    let status = 'completed';
    let monthsElapsed = 12;

    if (isCurrent) {
      status = 'current';
      // Calculate months elapsed in current FY (April = month 0)
      if (today.getMonth() >= 3) {
        monthsElapsed = today.getMonth() - 3 + 1; // Apr=1, May=2, etc.
      } else {
        monthsElapsed = today.getMonth() + 9 + 1; // Jan=10, Feb=11, Mar=12
      }
    }

    // Calculate weighted interest using PPF method
    const interestEarned = calculateWeightedInterest(fyData, openingBalance, r, isCurrent, monthsElapsed);
    cumulativeInterest += interestEarned;

    const closingBalance = openingBalance + depositsThisFY + interestEarned;

    schedule.push({
      fy: fyLabel,
      fyLabel: `FY ${fyLabel}`,
      startYear: year,
      endYear: year + 1,
      fyStart: fyStart.toISOString().split('T')[0],
      fyEnd: fyEnd.toISOString().split('T')[0],
      openingBalance,
      depositsThisFY,
      depositCount: fyData?.deposits?.length || 0,
      interestEarned,
      interestRate: rate,
      closingBalance,
      cumulativeDeposits,
      cumulativeInterest,
      status
    });

    // Next year's opening = this year's closing
    openingBalance = closingBalance;
  }

  // Calculate bank balance (credited interest only - excludes current FY accrued interest)
  // Bank PPF passbook shows balance with interest credited through March 31st
  const lastCompletedFY = schedule.filter(s => s.status === 'completed');
  const currentFYEntry = schedule.find(s => s.status === 'current');

  // Bank balance = last completed FY closing + current FY deposits (no accrued interest)
  const bankBalance = lastCompletedFY.length > 0
    ? lastCompletedFY[lastCompletedFY.length - 1].closingBalance + (currentFYEntry?.depositsThisFY || 0)
    : (currentFYEntry?.depositsThisFY || 0);

  // Estimated value = bank balance + current FY accrued interest
  const lastEntry = schedule[schedule.length - 1];
  const totalPrincipal = cumulativeDeposits;
  const estimatedValue = lastEntry?.closingBalance || totalPrincipal;
  const currentFYAccruedInterest = currentFYEntry?.interestEarned || 0;

  // For display: use bank balance as primary (matches passbook)
  const totalCreditedInterest = bankBalance - totalPrincipal;

  return {
    schedule,
    summary: {
      totalDeposited: totalPrincipal,
      totalInterest: totalCreditedInterest,  // Credited interest only
      currentValue: bankBalance,             // Bank balance (matches passbook)
      estimatedValue,                        // With accrued interest
      currentFYAccruedInterest,              // Current FY accrued (not yet credited)
      interestPercent: totalPrincipal > 0 ? (totalCreditedInterest / totalPrincipal) * 100 : 0,
      rate,
      totalYears: schedule.length,
      depositCount: deposits.length,
      firstDepositDate: deposits[0].date.toISOString().split('T')[0],
      currentFY: currentFY.fy
    }
  };
}
