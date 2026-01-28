import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { assetService, ASSET_CONFIG } from '../services/assets';
import { Card, PageSpinner } from '../components/apple';
import { spring, staggerContainer, staggerItem } from '../utils/animations';
import { categoryColors } from '../constants/theme';
import { formatCurrency, formatCompact } from '../utils/formatting';
import { calculateFixedIncomeValue, getCompoundingFrequency, generateRecurringDepositSchedule } from '../utils/interest';
import { usePrices } from '../context/PriceContext';

// Configuration constants
const DEFAULT_MONTHLY_EXPENSE = 50000; // Used for emergency fund calculation

// Benchmark returns for comparison (approximate annual returns)
// These are static approximations - ideally fetch real-time data
const BENCHMARKS = {
  NIFTY_50_1Y: 8.5,      // Nifty 50 historical avg ~12-15%, but varies yearly
  FD_RETURNS: 7.25,      // Current FD rates (2024-25)
  INFLATION: 5.0,        // CPI inflation target
};

/**
 * Get the price key for an asset to lookup in the prices object
 * Handles both mutual funds (use symbol directly) and stocks (symbol.exchange)
 */
function getPriceKey(asset) {
  if (!asset.symbol) return null;
  if (asset.asset_type === 'MUTUAL_FUND') {
    return asset.symbol;
  }
  // Default to NSE if exchange is not specified
  const exchange = asset.exchange === 'BSE' ? 'BO' : 'NS';
  return `${asset.symbol}.${exchange}`;
}

export default function Insights() {
  const { prices, loading: pricesLoading, fetchPrices } = usePrices();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pricesLoaded, setPricesLoaded] = useState(false);
  const [fixedIncomeCalcs, setFixedIncomeCalcs] = useState({});
  const [transactionDates, setTransactionDates] = useState({});

  useEffect(() => {
    fetchAssets();
  }, []);

  const fetchAssets = async () => {
    try {
      setLoading(true);
      const response = await assetService.getAll();
      const assetList = response.data.assets || [];
      setAssets(assetList);

      // Fetch prices for market assets using PriceContext
      const marketAssets = assetList.filter(a =>
        ['STOCK', 'MUTUAL_FUND', 'ETF', 'CRYPTO'].includes(a.asset_type)
      );

      if (marketAssets.length > 0) {
        // Use PriceContext's fetchPrices - handles caching and loading internally
        await fetchPrices(marketAssets);
        setPricesLoaded(true);
      } else {
        setPricesLoaded(true); // No market assets, consider prices "loaded"
      }

      // Calculate fixed income values - fetch transactions like Dashboard does
      const fixedIncomeAssets = assetList.filter(a => a.category === 'FIXED_INCOME' && a.interest_rate);
      if (fixedIncomeAssets.length > 0) {
        // Fetch transactions for each fixed income asset
        const fixedIncomeTransactions = await Promise.all(
          fixedIncomeAssets.map(asset =>
            assetService.getTransactions(asset.id)
              .then(res => ({ asset, transactions: res.data.transactions || [] }))
              .catch(() => ({ asset, transactions: [] }))
          )
        );

        const recurringDepositTypes = ['PPF', 'RD', 'EPF', 'VPF', 'SSY'];
        const calcs = {};

        fixedIncomeTransactions.forEach(({ asset, transactions }) => {
          const compoundingFreq = getCompoundingFrequency(asset.asset_type);
          const isRecurring = recurringDepositTypes.includes(asset.asset_type);

          if (transactions.length > 0) {
            if (asset.asset_type === 'PPF') {
              // PPF uses special recurring deposit schedule
              const ppfResult = generateRecurringDepositSchedule(transactions, asset.interest_rate, asset.start_date);
              if (ppfResult) {
                calcs[asset.id] = {
                  principal: ppfResult.summary.totalDeposited,
                  currentValue: ppfResult.summary.currentValue,
                  estimatedValue: ppfResult.summary.estimatedValue,
                  interest: ppfResult.summary.totalInterest,
                  interestPercent: ppfResult.summary.interestPercent,
                  currentFYAccruedInterest: ppfResult.summary.currentFYAccruedInterest
                };
              }
            } else {
              // Other fixed income: FD, RD, NSC, etc.
              const calculation = calculateFixedIncomeValue(transactions, asset.interest_rate, new Date(), compoundingFreq);
              calcs[asset.id] = calculation;
            }
          } else if (asset.principal) {
            // No transactions - create fake transaction from principal
            if (isRecurring) {
              calcs[asset.id] = {
                principal: asset.principal,
                currentValue: asset.principal,
                interest: 0,
                interestPercent: 0,
                needsTransactions: true
              };
            } else {
              const startDate = asset.start_date || asset.created_at?.split('T')[0] || new Date().toISOString().split('T')[0];
              const fakeTransaction = [{
                type: 'BUY',
                total_amount: asset.principal,
                transaction_date: startDate
              }];
              const calculation = calculateFixedIncomeValue(fakeTransaction, asset.interest_rate, new Date(), compoundingFreq);
              calcs[asset.id] = calculation;
            }
          }
        });

        setFixedIncomeCalcs(calcs);
      }

      // Fetch first transaction dates for holding period analysis
      const dates = {};
      for (const asset of assetList) {
        if (asset.purchase_date || asset.start_date) {
          dates[asset.id] = asset.purchase_date || asset.start_date;
        }
      }
      setTransactionDates(dates);

    } catch (error) {
      console.error('Failed to fetch assets:', error);
    } finally {
      setLoading(false);
    }
  };

  // Helper functions
  const getAssetValue = (asset) => {
    // Fixed Income
    if (asset.category === 'FIXED_INCOME') {
      if (fixedIncomeCalcs[asset.id]) {
        return fixedIncomeCalcs[asset.id].currentValue;
      }
      return asset.principal || 0;
    }
    // Equity
    if (asset.category === 'EQUITY' && asset.quantity) {
      const priceKey = getPriceKey(asset);
      if (priceKey) {
        const priceData = prices[priceKey];
        if (priceData?.price) {
          return asset.quantity * priceData.price;
        }
      }
      if (asset.avg_buy_price) {
        return asset.quantity * asset.avg_buy_price;
      }
    }
    // Real Estate with appreciation
    if (asset.category === 'REAL_ESTATE' && asset.appreciation_rate && asset.purchase_price && asset.purchase_date) {
      const purchasePrice = parseFloat(asset.purchase_price);
      const rate = parseFloat(asset.appreciation_rate) / 100;
      const purchaseDate = new Date(asset.purchase_date);
      const today = new Date();
      const years = (today - purchaseDate) / (365.25 * 24 * 60 * 60 * 1000);
      if (years >= 0) {
        return Math.round(purchasePrice * Math.pow(1 + rate, years));
      }
    }
    // Fallbacks
    if (asset.quantity && asset.avg_buy_price) return asset.quantity * asset.avg_buy_price;
    if (asset.principal) return asset.principal;
    if (asset.current_value) return asset.current_value;
    if (asset.purchase_price) return asset.purchase_price;
    if (asset.balance) return asset.balance;
    return 0;
  };

  const getInvestedValue = (asset) => {
    // For Fixed Income, use calculated principal from transactions (like Dashboard)
    if (asset.category === 'FIXED_INCOME') {
      const calc = fixedIncomeCalcs[asset.id];
      if (calc) return calc.principal;
      return asset.principal || asset.principal_amount || 0;
    }
    if (asset.category === 'EQUITY' && asset.quantity && asset.avg_buy_price) {
      return asset.quantity * asset.avg_buy_price;
    }
    if (asset.category === 'REAL_ESTATE') {
      return asset.purchase_price || 0;
    }
    return asset.principal || asset.purchase_price || asset.balance || 0;
  };

  // Calculate totals
  const totalCurrentValue = assets.reduce((sum, a) => sum + getAssetValue(a), 0);
  const totalInvested = assets.reduce((sum, a) => sum + getInvestedValue(a), 0);
  const totalGain = totalCurrentValue - totalInvested;
  const totalGainPercent = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

  // Visual group config - using hex colors for SVG compatibility
  const visualGroupConfig = {
    'EQUITY': { color: '#3B82F6', label: 'Stocks & Funds' },
    'FIXED_INCOME': { color: '#10B981', label: 'Fixed Income' },
    'REAL_ESTATE': { color: '#06B6D4', label: 'Real Estate' },
    'PHYSICAL': { color: '#F59E0B', label: 'Physical Assets' },
    'SAVINGS': { color: '#8B5CF6', label: 'Savings' },
    'CRYPTO': { color: '#EC4899', label: 'Crypto' },
    'INSURANCE': { color: '#F472B6', label: 'Insurance' },
    'OTHER': { color: '#6B7280', label: 'Other' },
  };

  // ===== INSIGHT CALCULATIONS =====

  // Check if an equity asset has real market price (not fallback)
  const hasRealPrice = (asset) => {
    if (asset.category !== 'EQUITY') return true; // Non-equity always has "real" value
    const priceKey = getPriceKey(asset);
    if (!priceKey) return true; // No symbol = use avg_buy_price
    return prices[priceKey]?.price !== undefined;
  };

  // Assets with return calculations
  const assetsWithReturns = assets.map(asset => {
    const currentValue = getAssetValue(asset);
    const investedValue = getInvestedValue(asset);
    const returnAmount = currentValue - investedValue;
    const returnPercent = investedValue > 0 ? (returnAmount / investedValue) * 100 : 0;
    const hasPriceData = hasRealPrice(asset);
    return { asset, currentValue, investedValue, returnAmount, returnPercent, hasPriceData };
  }).filter(a => a.investedValue > 0);

  // For best/worst, only consider assets with real price data OR non-zero returns
  const assetsWithValidReturns = assetsWithReturns.filter(a =>
    a.hasPriceData || a.returnPercent !== 0
  );

  // Sorted by value for concentration analysis
  const sortedByValue = [...assetsWithReturns].sort((a, b) => b.currentValue - a.currentValue);

  // Best & Worst performers - only from assets with valid price data
  const sortedByReturn = [...assetsWithValidReturns].sort((a, b) => b.returnPercent - a.returnPercent);
  const bestPerformer = assetsWithValidReturns.length > 0
    ? assetsWithValidReturns.reduce((best, current) =>
        current.returnPercent > best.returnPercent ? current : best)
    : null;
  const worstPerformer = assetsWithValidReturns.length > 0
    ? assetsWithValidReturns.reduce((worst, current) =>
        current.returnPercent < worst.returnPercent ? current : worst)
    : null;

  // Profit/Loss stats - only count assets with valid price data
  const assetsInProfit = assetsWithValidReturns.filter(a => a.returnPercent > 0).length;
  const assetsInLoss = assetsWithValidReturns.filter(a => a.returnPercent < 0).length;
  // Count how many equity assets are missing prices
  const assetsMissingPrices = assetsWithReturns.filter(a => !a.hasPriceData).length;
  const profitRatio = assetsWithReturns.length > 0 ? (assetsInProfit / assetsWithReturns.length) * 100 : 0;

  // Largest holding
  const largestHolding = sortedByValue[0];
  const getPortfolioWeight = (asset) => {
    const value = getAssetValue(asset);
    return totalCurrentValue > 0 ? (value / totalCurrentValue) * 100 : 0;
  };

  // Category allocation with returns
  const categoryAllocation = Object.entries(
    assets.reduce((acc, asset) => {
      const category = asset.category;
      if (!acc[category]) {
        acc[category] = { current: 0, invested: 0 };
      }
      acc[category].current += getAssetValue(asset);
      acc[category].invested += getInvestedValue(asset);
      return acc;
    }, {})
  ).map(([key, data]) => {
    const returnAmount = data.current - data.invested;
    const returnPercent = data.invested > 0 ? (returnAmount / data.invested) * 100 : 0;
    return {
      key,
      label: visualGroupConfig[key]?.label || ASSET_CONFIG[key]?.label || key,
      value: data.current,
      invested: data.invested,
      returnAmount,
      returnPercent,
      color: visualGroupConfig[key]?.color || 'var(--system-gray)',
      percent: totalCurrentValue > 0 ? (data.current / totalCurrentValue) * 100 : 0,
    };
  }).sort((a, b) => b.value - a.value);

  // 1. Risk & Diversification
  const topHoldings = sortedByValue.slice(0, 3);
  const top3Concentration = topHoldings.reduce((sum, h) => sum + (h.currentValue / totalCurrentValue) * 100, 0);
  const uniqueCategories = new Set(assets.map(a => a.category)).size;
  const totalAssetCount = assets.length;

  const categoryScore = Math.min(uniqueCategories * 15, 30);
  const assetCountScore = Math.min(totalAssetCount * 3, 30);
  const concentrationScore = Math.max(40 - top3Concentration * 0.5, 0);
  const diversificationScore = Math.round(categoryScore + assetCountScore + concentrationScore);
  const diversificationLevel = diversificationScore >= 70 ? 'Good' : diversificationScore >= 50 ? 'Moderate' : 'Low';

  // 2. Benchmark Comparison
  const portfolioReturn = totalGainPercent;
  const benchmarks = [
    { name: 'Your Portfolio', value: portfolioReturn, isPortfolio: true },
    { name: 'Nifty 50 (1Y)', value: BENCHMARKS.NIFTY_50_1Y },
    { name: 'FD Returns', value: BENCHMARKS.FD_RETURNS },
    { name: 'Inflation', value: BENCHMARKS.INFLATION },
  ];
  const beatsBenchmark = portfolioReturn > BENCHMARKS.NIFTY_50_1Y;

  // 3. Category Exposure
  const categoryExposure = Object.entries(
    assets.reduce((acc, asset) => {
      const category = asset.category;
      acc[category] = (acc[category] || 0) + getAssetValue(asset);
      return acc;
    }, {})
  ).map(([key, value]) => ({
    name: key.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
    value,
    percent: totalCurrentValue > 0 ? (value / totalCurrentValue) * 100 : 0,
    color: visualGroupConfig[key]?.color || 'var(--system-gray)',
  })).sort((a, b) => b.percent - a.percent);

  const highestExposure = categoryExposure[0];
  const isOverexposed = highestExposure && highestExposure.percent > 50;

  // 4. Liquidity Analysis
  const liquidCategories = ['EQUITY', 'SAVINGS', 'CRYPTO'];
  const lockedCategories = ['FIXED_INCOME', 'REAL_ESTATE', 'PHYSICAL', 'INSURANCE'];

  const liquidAssets = assets.filter(a => liquidCategories.includes(a.category));
  const lockedAssets = assets.filter(a => lockedCategories.includes(a.category));

  const liquidValue = liquidAssets.reduce((sum, a) => sum + getAssetValue(a), 0);
  const lockedValue = lockedAssets.reduce((sum, a) => sum + getAssetValue(a), 0);
  const liquidPercent = totalCurrentValue > 0 ? (liquidValue / totalCurrentValue) * 100 : 0;
  const lockedPercent = totalCurrentValue > 0 ? (lockedValue / totalCurrentValue) * 100 : 0;

  // TODO: Make this user-configurable via settings
  const monthlyExpense = DEFAULT_MONTHLY_EXPENSE;
  const emergencyMonths = monthlyExpense > 0 ? liquidValue / monthlyExpense : 0;

  // 5. Holding Period Analysis
  const now = new Date();
  const assetsWithAge = assets
    .filter(a => a.purchase_date || a.start_date || transactionDates[a.id])
    .map(a => {
      const dateStr = a.purchase_date || a.start_date || transactionDates[a.id];
      const purchaseDate = new Date(dateStr);
      if (isNaN(purchaseDate.getTime())) {
        return null;
      }
      const ageInDays = (now - purchaseDate) / (1000 * 60 * 60 * 24);
      const ageInYears = ageInDays / 365;
      return { asset: a, ageInDays, ageInYears, purchaseDate };
    })
    .filter(a => a !== null);

  const avgHoldingYears = assetsWithAge.length > 0
    ? assetsWithAge.reduce((sum, a) => sum + a.ageInYears, 0) / assetsWithAge.length
    : 0;

  const holdingBuckets = {
    lessThan1Year: assetsWithAge.filter(a => a.ageInYears < 1).length,
    oneToThreeYears: assetsWithAge.filter(a => a.ageInYears >= 1 && a.ageInYears < 3).length,
    moreThan3Years: assetsWithAge.filter(a => a.ageInYears >= 3).length,
  };

  const sortedByAge = [...assetsWithAge].sort((a, b) => b.ageInDays - a.ageInDays);
  const oldestAsset = sortedByAge[0];
  const newestAsset = sortedByAge[sortedByAge.length - 1];

  // 6. Top/Bottom Performers (Top 5)
  const topPerformers = sortedByReturn.slice(0, 5);
  // Bottom performers: sort ascending and take assets with negative returns
  const bottomPerformers = [...assetsWithValidReturns]
    .filter(a => a.returnPercent < 0)
    .sort((a, b) => a.returnPercent - b.returnPercent)
    .slice(0, 5);

  // 7. Asset Type Breakdown
  const assetTypeBreakdown = Object.entries(
    assets.reduce((acc, asset) => {
      const type = asset.asset_type || 'OTHER';
      acc[type] = (acc[type] || 0) + getAssetValue(asset);
      return acc;
    }, {})
  ).map(([type, value]) => ({
    type,
    label: ASSET_CONFIG[type]?.label || type.replace(/_/g, ' '),
    value,
    percent: totalCurrentValue > 0 ? (value / totalCurrentValue) * 100 : 0,
    color: {
      'STOCK': '#3B82F6',
      'MUTUAL_FUND': '#8B5CF6',
      'ETF': '#06B6D4',
      'FD': '#10B981',
      'PPF': '#059669',
      'EPF': '#0D9488',
      'RD': '#14B8A6',
      'NPS': '#0891B2',
      'GOLD': '#F59E0B',
      'SILVER': '#78716C',
      'SAVINGS_ACCOUNT': '#A855F7',
      'REAL_ESTATE': '#EA580C',
      'LIC': '#EC4899',
    }[type] || '#6B7280',
  })).sort((a, b) => b.value - a.value);

  // 8. Income Summary (Interest from Fixed Income)
  const interestIncome = assets
    .filter(a => a.category === 'FIXED_INCOME' && fixedIncomeCalcs[a.id])
    .reduce((sum, a) => sum + (fixedIncomeCalcs[a.id]?.interest || 0), 0);

  // Tax-exempt income
  const taxExemptTypes = ['PPF', 'EPF', 'VPF', 'SSY'];
  const taxExemptIncome = assets
    .filter(a => a.category === 'FIXED_INCOME' && taxExemptTypes.includes(a.asset_type) && fixedIncomeCalcs[a.id])
    .reduce((sum, a) => sum + (fixedIncomeCalcs[a.id]?.interest || 0), 0);
  const taxableIncome = interestIncome - taxExemptIncome;

  // 9. Tax Implications (LTCG vs STCG based on holding period)
  const equityAssetsWithReturns = assetsWithReturns.filter(a => a.asset.category === 'EQUITY');
  const ltcgAssets = equityAssetsWithReturns.filter(a => {
    const age = assetsWithAge.find(x => x.asset.id === a.asset.id);
    return age && age.ageInYears >= 1;
  });
  const stcgAssets = equityAssetsWithReturns.filter(a => {
    const age = assetsWithAge.find(x => x.asset.id === a.asset.id);
    return age && age.ageInYears < 1;
  });

  const ltcgGain = ltcgAssets.reduce((sum, a) => sum + Math.max(0, a.returnAmount), 0);
  const stcgGain = stcgAssets.reduce((sum, a) => sum + Math.max(0, a.returnAmount), 0);
  const ltcgTax = Math.max(0, ltcgGain - 125000) * 0.125; // 12.5% LTCG above 1.25L exemption
  const stcgTax = stcgGain * 0.20; // 20% STCG

  if (loading) {
    return (
      <div className="p-4 md:px-12 md:py-6">
        <PageSpinner message="Loading assets..." />
      </div>
    );
  }

  // Show loading indicator while prices are being fetched
  const showPriceLoading = pricesLoading && !pricesLoaded;

  return (
    <div className="p-4 md:px-12 md:py-6">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.gentle}
        className="mb-6"
      >
        <div className="flex items-center gap-3">
          <h1 className="text-[22px] font-bold text-[var(--label-primary)]">Portfolio Insights</h1>
          {showPriceLoading && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-[var(--fill-quaternary)] rounded-full text-[11px] text-[var(--label-tertiary)]">
              <span className="w-1.5 h-1.5 bg-[var(--system-blue)] rounded-full animate-pulse" />
              Fetching prices...
            </span>
          )}
        </div>
        <p className="text-[14px] text-[var(--label-secondary)] mt-1">
          Analyze your portfolio performance, risk, and allocation
        </p>
      </motion.div>

      {/* Summary Stats */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring.gentle, delay: 0.05 }}
        className="mb-6"
      >
        <Card className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide mb-1">Total Value</p>
              <p className="text-[20px] font-bold text-[var(--label-primary)] tabular-nums">{formatCompact(totalCurrentValue)}</p>
            </div>
            <div>
              <p className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide mb-1">Total Invested</p>
              <p className="text-[20px] font-bold text-[var(--label-primary)] tabular-nums">{formatCompact(totalInvested)}</p>
            </div>
            <div>
              <p className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide mb-1">Total Returns</p>
              <p className={`text-[20px] font-bold tabular-nums ${totalGain >= 0 ? 'text-[var(--system-green)]' : 'text-[var(--system-red)]'}`}>
                {totalGain >= 0 ? '+' : ''}{formatCompact(totalGain)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide mb-1">Return %</p>
              <p className={`text-[20px] font-bold tabular-nums ${totalGainPercent >= 0 ? 'text-[var(--system-green)]' : 'text-[var(--system-red)]'}`}>
                {totalGainPercent >= 0 ? '+' : ''}{totalGainPercent.toFixed(1)}%
              </p>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Insight Cards Grid - 2 columns */}
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        {/* Portfolio Performance Card */}
        <motion.div variants={staggerItem}>
          <Card padding="p-0" className="overflow-hidden h-full">
            <div className="px-4 py-3.5 bg-gradient-to-r from-[var(--chart-primary)]/10 via-[var(--chart-primary)]/5 to-transparent border-b border-[var(--separator-opaque)] rounded-t-2xl">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[var(--chart-primary)] flex items-center justify-center shadow-sm">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--label-primary)]">Portfolio Performance</h3>
                  <p className="text-[11px] text-[var(--label-tertiary)]">Returns & key metrics</p>
                </div>
              </div>
            </div>
            <div className="p-0">
              {assetsWithReturns.length > 0 ? (
                <div className="flex">
                  {/* Left Column: Your Portfolio */}
                  <div className="flex-1 p-4 border-r border-[var(--separator-opaque)]">
                    <p className="text-[11px] text-[var(--label-tertiary)] font-semibold mb-3">Your Portfolio</p>

                    {/* Circular Chart */}
                    <div className="flex justify-center mb-4">
                      <div className="relative w-36 h-36">
                        <svg className="w-36 h-36 -rotate-90" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--fill-tertiary)" strokeWidth="6" />
                          <motion.circle
                            cx="50" cy="50" r="42"
                            fill="none"
                            stroke={totalGainPercent >= 0 ? '#059669' : '#DC2626'}
                            strokeWidth="6"
                            strokeLinecap="round"
                            strokeDasharray={`${Math.min(Math.abs(totalGainPercent), 100) * 2.64} 264`}
                            initial={{ strokeDasharray: '0 264' }}
                            animate={{ strokeDasharray: `${Math.min(Math.abs(totalGainPercent), 100) * 2.64} 264` }}
                            transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className={`text-[22px] font-bold tabular-nums ${totalGainPercent >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                            {totalGainPercent >= 0 ? '+' : ''}{totalGainPercent.toFixed(1)}%
                          </span>
                          <span className="text-[11px] text-[var(--label-tertiary)]">return</span>
                        </div>
                      </div>
                    </div>

                    {/* Value Flow */}
                    <div className="text-center mb-3">
                      <div className="flex items-center justify-center gap-2 text-[14px]">
                        <span className="text-[var(--label-secondary)] tabular-nums">{formatCompact(totalInvested)}</span>
                        <svg className="w-4 h-4 text-[var(--label-quaternary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                        </svg>
                        <span className="text-[var(--label-primary)] font-semibold tabular-nums">{formatCompact(totalCurrentValue)}</span>
                      </div>
                      <p className={`text-[16px] font-bold tabular-nums mt-1 ${totalGain >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                        {totalGain >= 0 ? '+' : ''}{formatCompact(totalGain)}
                      </p>
                    </div>

                    {/* Badges */}
                    <div className="flex justify-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#059669]/10 rounded-lg text-[12px] font-semibold text-[#059669]">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                        </svg>
                        {assetsInProfit}
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#DC2626]/10 rounded-lg text-[12px] font-semibold text-[#DC2626]">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                        {assetsInLoss}
                      </span>
                    </div>
                  </div>

                  {/* Right Column: Top Performers */}
                  <div className="flex-1 p-4 flex flex-col">
                    <p className="text-[11px] text-[var(--label-tertiary)] font-semibold mb-3">Top Performers</p>

                    {/* Performers List */}
                    <div className="flex-1 space-y-2">
                      {sortedByReturn.slice(0, 5).map((item, index) => {
                        const rankColors = ['#F59E0B', '#9CA3AF', '#CD7F32', 'var(--fill-tertiary)', 'var(--fill-tertiary)'];
                        const isTop3 = index < 3;
                        return (
                          <div key={item.asset.id} className="flex items-center gap-2.5">
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${isTop3 ? 'text-white' : 'text-[var(--label-secondary)]'}`}
                              style={{ backgroundColor: rankColors[index] }}
                            >
                              {index + 1}
                            </span>
                            <span className="flex-1 text-[13px] text-[var(--label-primary)] truncate">{item.asset.name}</span>
                            <span className={`text-[13px] font-semibold tabular-nums ${
                              item.returnPercent > 0 ? 'text-[#059669]' : item.returnPercent < 0 ? 'text-[#DC2626]' : 'text-[var(--label-tertiary)]'
                            }`}>
                              {item.returnPercent > 0 ? '+' : ''}{item.returnPercent.toFixed(1)}%
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Bottom Summary */}
                    <div className="pt-3 mt-auto border-t border-[var(--separator-opaque)]">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-[var(--label-tertiary)]">{assetsWithReturns.length} assets</span>
                        <span className="text-[var(--label-tertiary)]">
                          Best: <span className="text-[#059669] font-semibold">+{bestPerformer?.returnPercent?.toFixed(0) || 0}%</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-[13px] text-[var(--label-tertiary)]">Add assets to see performance</p>
                </div>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Allocation Card - Clean Two-Column Layout */}
        <motion.div variants={staggerItem}>
          <Card padding="p-0" className="overflow-hidden h-full">
            {/* Header with Diversification Score */}
            <div className="px-4 py-3.5 bg-gradient-to-r from-[var(--system-green)]/10 via-[var(--system-green)]/5 to-transparent border-b border-[var(--separator-opaque)] rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[var(--system-green)] flex items-center justify-center shadow-sm">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-[14px] font-semibold text-[var(--label-primary)]">Asset Allocation</h3>
                    <p className="text-[11px] text-[var(--label-tertiary)]">{categoryAllocation.length} categories</p>
                  </div>
                </div>
                {/* Diversification Badge */}
                <div className="text-right">
                  <p className="text-[11px] text-[var(--label-tertiary)] font-semibold">Diversity</p>
                  <p className={`text-[14px] font-bold ${
                    diversificationScore >= 70 ? 'text-[var(--system-green)]' :
                    diversificationScore >= 50 ? 'text-[var(--system-orange)]' :
                    'text-[var(--system-red)]'
                  }`}>
                    {diversificationScore} <span className="text-[11px] font-medium">{diversificationLevel}</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="p-0">
              {categoryAllocation.length > 0 ? (
                <div className="flex">
                  {/* Left Panel: Donut Chart + Largest Category */}
                  <div className="w-[55%] p-4 border-r border-[var(--separator-opaque)]">
                    {/* Donut Chart */}
                    <div className="flex justify-center mb-4">
                      <div className="relative w-36 h-36">
                        <svg className="w-36 h-36 -rotate-90" viewBox="0 0 100 100">
                          {(() => {
                            let cumulativePercent = 0;
                            return categoryAllocation.map((cat, index) => {
                              const circumference = 2 * Math.PI * 42;
                              const strokeDasharray = `${(cat.percent / 100) * circumference} ${circumference}`;
                              const strokeDashoffset = -((cumulativePercent / 100) * circumference);
                              cumulativePercent += cat.percent;
                              return (
                                <motion.circle
                                  key={cat.key}
                                  cx="50" cy="50" r="42"
                                  fill="none"
                                  stroke={cat.color}
                                  strokeWidth="8"
                                  strokeDasharray={strokeDasharray}
                                  strokeDashoffset={strokeDashoffset}
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  transition={{ duration: 0.5, delay: index * 0.1 }}
                                />
                              );
                            });
                          })()}
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-[18px] font-bold text-[var(--label-primary)] tabular-nums">{formatCompact(totalCurrentValue)}</span>
                          <span className={`text-[13px] font-semibold tabular-nums ${totalGainPercent >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                            {totalGainPercent >= 0 ? '+' : ''}{totalGainPercent.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Largest Category */}
                    <div className="p-3 bg-[var(--fill-quaternary)] rounded-xl">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${categoryAllocation[0]?.color}20` }}>
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: categoryAllocation[0]?.color }} />
                          </div>
                          <div>
                            <p className="text-[11px] text-[var(--label-tertiary)] font-semibold">Largest</p>
                            <p className="text-[14px] font-semibold text-[var(--label-primary)]">{categoryAllocation[0]?.label}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[18px] font-bold tabular-nums" style={{ color: categoryAllocation[0]?.color }}>
                            {categoryAllocation[0]?.percent?.toFixed(0) || 0}%
                          </p>
                        </div>
                      </div>
                      {categoryAllocation[0]?.percent > 40 && (
                        <div className="mt-2 pt-2 border-t border-[var(--separator-opaque)]">
                          <p className="text-[11px] text-[var(--system-orange)] flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            Consider rebalancing
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Panel: Category List with Allocation & Returns */}
                  <div className="w-[45%] p-4 flex flex-col">
                    <p className="text-[11px] text-[var(--label-tertiary)] font-semibold mb-3">Categories</p>

                    <div className="flex-1 space-y-2.5">
                      {categoryAllocation.map((cat) => (
                        <div key={cat.key} className="flex items-center gap-2.5">
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                          <span className="flex-1 text-[13px] text-[var(--label-primary)] truncate">{cat.label}</span>
                          <span className="text-[12px] font-semibold text-[var(--label-secondary)] tabular-nums w-10 text-right">
                            {cat.percent.toFixed(0)}%
                          </span>
                          <span className={`text-[12px] font-semibold tabular-nums w-14 text-right ${
                            cat.returnPercent > 0 ? 'text-[#059669]' : cat.returnPercent < 0 ? 'text-[#DC2626]' : 'text-[var(--label-tertiary)]'
                          }`}>
                            {cat.returnPercent > 0 ? '+' : ''}{cat.returnPercent.toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Bottom Summary */}
                    <div className="pt-3 mt-auto border-t border-[var(--separator-opaque)]">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-[var(--label-tertiary)]">Best performing</span>
                        <span className="text-[#059669] font-semibold">
                          {categoryAllocation.reduce((best, cat) => cat.returnPercent > best.returnPercent ? cat : best, categoryAllocation[0])?.label?.split(' ')[0]}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-[13px] text-[var(--label-tertiary)]">No allocation data</p>
                </div>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Risk & Diversification Card */}
        <motion.div variants={staggerItem}>
          <Card padding="p-0" className="overflow-hidden h-full">
            <div className="px-4 py-3.5 bg-gradient-to-r from-[var(--system-purple)]/10 via-[var(--system-purple)]/5 to-transparent border-b border-[var(--separator-opaque)] rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[var(--system-purple)] flex items-center justify-center shadow-sm">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--label-primary)]">Risk & Diversification</h3>
                  <p className="text-[11px] text-[var(--label-tertiary)]">Portfolio health score</p>
                </div>
              </div>
            </div>
            <div className="p-4">
              {assets.length > 0 ? (
                <div className="flex gap-4">
                  {/* Left: Score Gauge */}
                  <div className="flex flex-col items-center">
                    <div className="relative w-32 h-32">
                      <svg className="w-32 h-32 -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--fill-tertiary)" strokeWidth="6" />
                        <motion.circle
                          cx="50" cy="50" r="42"
                          fill="none"
                          stroke={diversificationScore >= 70 ? '#10B981' : diversificationScore >= 50 ? '#F59E0B' : '#EF4444'}
                          strokeWidth="6"
                          strokeLinecap="round"
                          strokeDasharray={`${(diversificationScore / 100) * 264} 264`}
                          initial={{ strokeDasharray: '0 264' }}
                          animate={{ strokeDasharray: `${(diversificationScore / 100) * 264} 264` }}
                          transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-[28px] font-bold text-[var(--label-primary)] tabular-nums">{diversificationScore}</span>
                        <span className="text-[11px] text-[var(--label-tertiary)]">Score</span>
                      </div>
                    </div>
                    <div className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-semibold mt-2 ${
                      diversificationLevel === 'Good' ? 'bg-[#10B981]/15 text-[#10B981]' :
                      diversificationLevel === 'Moderate' ? 'bg-[#F59E0B]/15 text-[#F59E0B]' :
                      'bg-[#EF4444]/15 text-[#EF4444]'
                    }`}>
                      {diversificationLevel}
                    </div>
                  </div>

                  {/* Right: Metrics with Progress Bars */}
                  <div className="flex-1 space-y-3">
                    {/* Concentration */}
                    <div className="p-2.5 bg-[var(--fill-quaternary)] rounded-xl">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[12px] text-[var(--label-secondary)]">Concentration</span>
                        <span className={`text-[13px] font-bold tabular-nums ${top3Concentration > 70 ? 'text-[#EF4444]' : top3Concentration > 50 ? 'text-[#F59E0B]' : 'text-[#10B981]'}`}>
                          {top3Concentration.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-2 bg-[var(--fill-tertiary)] rounded-full overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ backgroundColor: top3Concentration > 70 ? '#EF4444' : top3Concentration > 50 ? '#F59E0B' : '#10B981' }}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(top3Concentration, 100)}%` }}
                          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
                        />
                      </div>
                      <p className="text-[10px] text-[var(--label-tertiary)] mt-1">
                        {top3Concentration > 70 ? 'High risk' : top3Concentration > 50 ? 'Moderate' : 'Well spread'}
                      </p>
                    </div>

                    {/* Categories & Holdings */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2.5 bg-[var(--fill-quaternary)] rounded-xl text-center">
                        <p className="text-[20px] font-bold text-[var(--label-primary)] tabular-nums">{uniqueCategories}</p>
                        <p className="text-[10px] text-[var(--label-tertiary)]">Categories</p>
                      </div>
                      <div className="p-2.5 bg-[var(--fill-quaternary)] rounded-xl text-center">
                        <p className="text-[20px] font-bold text-[var(--label-primary)] tabular-nums">{totalAssetCount}</p>
                        <p className="text-[10px] text-[var(--label-tertiary)]">Holdings</p>
                      </div>
                    </div>

                    {/* Tip */}
                    <p className="text-[11px] text-[var(--label-tertiary)] px-1">
                      {diversificationLevel === 'Good' ? 'Portfolio is well diversified' :
                       diversificationLevel === 'Moderate' ? 'Consider adding more categories' :
                       'Reduce concentration in top holdings'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center">
                  <p className="text-[13px] text-[var(--label-tertiary)]">Add assets to see risk analysis</p>
                </div>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Benchmark Comparison Card */}
        <motion.div variants={staggerItem}>
          <Card padding="p-0" className="overflow-hidden h-full">
            <div className="px-4 py-3.5 bg-gradient-to-r from-[var(--system-orange)]/10 via-[var(--system-orange)]/5 to-transparent border-b border-[var(--separator-opaque)] rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[var(--system-orange)] flex items-center justify-center shadow-sm">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--label-primary)]">Benchmark Comparison</h3>
                  <p className="text-[11px] text-[var(--label-tertiary)] flex items-center gap-1">
                    {beatsBenchmark ? (
                      <>
                        <svg className="w-3 h-3 text-[#10B981]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        <span className="text-[#10B981]">Outperforming market</span>
                      </>
                    ) : 'Below market returns'}
                  </p>
                </div>
              </div>
            </div>
            <div className="p-4">
              {assets.length > 0 ? (
                <>
                  {/* Visual Bar Chart */}
                  <div className="flex items-end justify-around gap-4 mb-4" style={{ height: '150px' }}>
                    {benchmarks.map((b, index) => {
                      const maxReturn = Math.max(...benchmarks.map(x => Math.abs(x.value)), 20);
                      const barHeightPx = Math.max((Math.abs(b.value) / maxReturn) * 110, 20);
                      const isPortfolio = b.isPortfolio;
                      const barColors = {
                        'Your Portfolio': b.value >= 0 ? '#3B82F6' : '#DC2626',
                        'Nifty 50 (1Y)': '#10B981',
                        'FD Returns': '#F59E0B',
                        'Inflation': '#EF4444',
                      };
                      const barColor = barColors[b.name] || '#6B7280';
                      return (
                        <div key={b.name} className="flex flex-col items-center flex-1 h-full justify-end">
                          {/* Value label */}
                          <span className={`text-[13px] font-bold tabular-nums mb-1.5 ${isPortfolio ? '' : ''}`} style={{ color: barColor }}>
                            {b.value >= 0 ? '+' : ''}{b.value.toFixed(0)}%
                          </span>
                          {/* Bar */}
                          <motion.div
                            className={`w-14 rounded-t-xl relative group cursor-pointer ${isPortfolio ? 'shadow-lg' : ''}`}
                            style={{
                              backgroundColor: barColor,
                              boxShadow: isPortfolio ? `0 4px 14px ${barColor}40` : 'none',
                            }}
                            initial={{ height: 0 }}
                            animate={{ height: barHeightPx }}
                            transition={{ duration: 0.8, delay: index * 0.12, ease: [0.4, 0, 0.2, 1] }}
                          >
                            {/* Gradient overlay for depth */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-white/10 rounded-t-xl" />
                            {/* Tooltip on hover */}
                            <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-[var(--bg-elevated)] border border-[var(--separator-opaque)] rounded-lg px-2.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg whitespace-nowrap z-10">
                              <p className="text-[11px] font-semibold text-[var(--label-primary)]">{b.name}: {b.value >= 0 ? '+' : ''}{b.value.toFixed(1)}%</p>
                            </div>
                          </motion.div>
                          {/* Label */}
                          <p className={`text-[11px] mt-2 text-center leading-tight ${isPortfolio ? 'font-semibold text-[var(--label-primary)]' : 'text-[var(--label-tertiary)]'}`}>
                            {b.name.replace(' (1Y)', '').replace('Your ', '')}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  {/* Summary */}
                  <div className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl ${
                    beatsBenchmark ? 'bg-[#10B981]/10' : 'bg-[var(--fill-quaternary)]'
                  }`}>
                    {beatsBenchmark ? (
                      <svg className="w-4 h-4 text-[#10B981]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-[var(--label-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                      </svg>
                    )}
                    <span className={`text-[13px] font-semibold ${beatsBenchmark ? 'text-[#10B981]' : 'text-[var(--label-secondary)]'}`}>
                      {beatsBenchmark ? 'Beating Nifty 50 by ' : 'Below Nifty 50 by '}
                      {Math.abs(portfolioReturn - BENCHMARKS.NIFTY_50_1Y).toFixed(1)}%
                    </span>
                  </div>
                </>
              ) : (
                <div className="py-4 text-center">
                  <p className="text-[13px] text-[var(--label-tertiary)]">Add assets to compare</p>
                </div>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Liquidity Analysis Card */}
        <motion.div variants={staggerItem}>
          <Card padding="p-0" className="overflow-hidden h-full">
            <div className="px-4 py-3.5 bg-gradient-to-r from-[var(--system-blue)]/10 via-[var(--system-blue)]/5 to-transparent border-b border-[var(--separator-opaque)] rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[var(--system-blue)] flex items-center justify-center shadow-sm">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--label-primary)]">Liquidity Analysis</h3>
                  <p className="text-[11px] text-[var(--label-tertiary)]">
                    {emergencyMonths >= 6 ? 'Good emergency coverage' : 'Build liquidity buffer'}
                  </p>
                </div>
              </div>
            </div>
            <div className="p-4">
              {assets.length > 0 ? (
                <>
                  {/* Visual Split Bar with Labels Above */}
                  <div className="mb-4">
                    <div className="flex justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-[#3B82F6]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
                        </svg>
                        <span className="text-[12px] font-semibold text-[#3B82F6]">Liquid {liquidPercent.toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-semibold text-[#6B7280]">Locked {lockedPercent.toFixed(0)}%</span>
                        <svg className="w-3.5 h-3.5 text-[#6B7280]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                      </div>
                    </div>
                    <div className="h-3 rounded-full overflow-hidden bg-[var(--fill-tertiary)] flex">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${liquidPercent}%` }}
                        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                        className="h-full bg-gradient-to-r from-[#3B82F6] to-[#60A5FA] rounded-l-full"
                      />
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${lockedPercent}%` }}
                        transition={{ duration: 0.6, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
                        className="h-full bg-gradient-to-r from-[#9CA3AF] to-[#6B7280] rounded-r-full"
                      />
                    </div>
                  </div>

                  {/* Liquid & Locked Asset Types */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {/* Liquid Assets */}
                    <div className="p-3 bg-gradient-to-br from-[#3B82F6]/8 to-[#3B82F6]/3 rounded-xl border border-[#3B82F6]/15">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-lg bg-[#3B82F6]/15 flex items-center justify-center">
                          <svg className="w-3 h-3 text-[#3B82F6]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        </div>
                        <span className="text-[11px] font-semibold text-[#3B82F6]">Liquid</span>
                      </div>
                      <p className="text-[16px] font-bold text-[var(--label-primary)] tabular-nums mb-2">{formatCompact(liquidValue)}</p>
                      <div className="space-y-1">
                        {(() => {
                          const liquidByType = {};
                          liquidAssets.forEach(a => {
                            const type = a.asset_type || a.category;
                            liquidByType[type] = (liquidByType[type] || 0) + getAssetValue(a);
                          });
                          return Object.entries(liquidByType)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 3)
                            .map(([type, value]) => (
                              <div key={type} className="flex items-center justify-between">
                                <span className="text-[10px] text-[var(--label-tertiary)]">{ASSET_CONFIG[type]?.label || type.replace(/_/g, ' ')}</span>
                                <span className="text-[10px] font-semibold text-[var(--label-secondary)] tabular-nums">{formatCompact(value)}</span>
                              </div>
                            ));
                        })()}
                      </div>
                    </div>

                    {/* Locked Assets */}
                    <div className="p-3 bg-gradient-to-br from-[#6B7280]/8 to-[#6B7280]/3 rounded-xl border border-[#6B7280]/15">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-lg bg-[#6B7280]/15 flex items-center justify-center">
                          <svg className="w-3 h-3 text-[#6B7280]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                          </svg>
                        </div>
                        <span className="text-[11px] font-semibold text-[#6B7280]">Locked</span>
                      </div>
                      <p className="text-[16px] font-bold text-[var(--label-primary)] tabular-nums mb-2">{formatCompact(lockedValue)}</p>
                      <div className="space-y-1">
                        {(() => {
                          const lockedByType = {};
                          lockedAssets.forEach(a => {
                            const type = a.asset_type || a.category;
                            lockedByType[type] = (lockedByType[type] || 0) + getAssetValue(a);
                          });
                          return Object.entries(lockedByType)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 3)
                            .map(([type, value]) => (
                              <div key={type} className="flex items-center justify-between">
                                <span className="text-[10px] text-[var(--label-tertiary)]">{ASSET_CONFIG[type]?.label || type.replace(/_/g, ' ')}</span>
                                <span className="text-[10px] font-semibold text-[var(--label-secondary)] tabular-nums">{formatCompact(value)}</span>
                              </div>
                            ));
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Emergency Coverage */}
                  <div className={`p-3 rounded-xl border ${
                    emergencyMonths >= 6 ? 'bg-[#10B981]/8 border-[#10B981]/20' :
                    emergencyMonths >= 3 ? 'bg-[#F59E0B]/8 border-[#F59E0B]/20' :
                    'bg-[#EF4444]/8 border-[#EF4444]/20'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          emergencyMonths >= 6 ? 'bg-[#10B981]/15' :
                          emergencyMonths >= 3 ? 'bg-[#F59E0B]/15' :
                          'bg-[#EF4444]/15'
                        }`}>
                          <svg className={`w-5 h-5 ${
                            emergencyMonths >= 6 ? 'text-[#10B981]' :
                            emergencyMonths >= 3 ? 'text-[#F59E0B]' :
                            'text-[#EF4444]'
                          }`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-[11px] text-[var(--label-tertiary)] font-semibold">Emergency Fund</p>
                          <p className={`text-[22px] font-bold tabular-nums ${
                            emergencyMonths >= 6 ? 'text-[#10B981]' :
                            emergencyMonths >= 3 ? 'text-[#F59E0B]' :
                            'text-[#EF4444]'
                          }`}>
                            {emergencyMonths.toFixed(1)} <span className="text-[14px]">months</span>
                          </p>
                        </div>
                      </div>
                      <div className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                        emergencyMonths >= 6 ? 'bg-[#10B981]/15 text-[#10B981]' :
                        emergencyMonths >= 3 ? 'bg-[#F59E0B]/15 text-[#F59E0B]' :
                        'bg-[#EF4444]/15 text-[#EF4444]'
                      }`}>
                        {emergencyMonths >= 6 ? 'Healthy' : emergencyMonths >= 3 ? 'Adequate' : 'Low'}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-4 text-center">
                  <p className="text-[13px] text-[var(--label-tertiary)]">Add assets to analyze</p>
                </div>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Holding Period Analysis Card */}
        <motion.div variants={staggerItem}>
          <Card padding="p-0" className="overflow-hidden h-full">
            <div className="px-4 py-3.5 bg-gradient-to-r from-[var(--system-pink)]/10 via-[var(--system-pink)]/5 to-transparent border-b border-[var(--separator-opaque)] rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[var(--system-pink)] flex items-center justify-center shadow-sm">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-[14px] font-semibold text-[var(--label-primary)]">Holding Period Analysis</h3>
                    <p className="text-[11px] text-[var(--label-tertiary)]">Investment timeline</p>
                  </div>
                </div>
                {/* Average Holding Badge */}
                {assetsWithAge.length > 0 && (
                  <div className="text-right">
                    <p className="text-[11px] text-[var(--label-tertiary)] font-semibold">Average</p>
                    <p className="text-[14px] font-bold text-[var(--system-pink)]">{avgHoldingYears.toFixed(1)} yrs</p>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4">
              {assetsWithAge.length > 0 ? (
                <>
                  <div className="space-y-3 mb-4">
                    {[
                      { label: '< 1 Year', shortLabel: 'Short-term', count: holdingBuckets.lessThan1Year, color: '#F59E0B', icon: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z' },
                      { label: '1-3 Years', shortLabel: 'Medium-term', count: holdingBuckets.oneToThreeYears, color: '#3B82F6', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
                      { label: '3+ Years', shortLabel: 'Long-term', count: holdingBuckets.moreThan3Years, color: '#10B981', icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
                    ].map((bucket, index) => {
                      const totalAssets = holdingBuckets.lessThan1Year + holdingBuckets.oneToThreeYears + holdingBuckets.moreThan3Years;
                      const barWidth = totalAssets > 0 ? (bucket.count / totalAssets) * 100 : 0;
                      return (
                        <div key={bucket.label} className="flex items-center gap-3">
                          {/* Icon */}
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${bucket.color}15` }}>
                            <svg className="w-4 h-4" style={{ color: bucket.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d={bucket.icon} />
                            </svg>
                          </div>
                          {/* Bar and Label */}
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[12px] font-medium text-[var(--label-primary)]">{bucket.label}</span>
                              <span className="text-[12px] font-bold tabular-nums" style={{ color: bucket.color }}>{bucket.count}</span>
                            </div>
                            <div className="h-2.5 rounded-full overflow-hidden bg-[var(--fill-tertiary)]">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${barWidth}%` }}
                                transition={{ duration: 0.6, delay: index * 0.1, ease: [0.4, 0, 0.2, 1] }}
                                className="h-full rounded-full"
                                style={{ background: `linear-gradient(90deg, ${bucket.color}, ${bucket.color}CC)` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Oldest & Newest Holdings */}
                  <div className="grid grid-cols-2 gap-3">
                    {oldestAsset && (
                      <div className="p-3 bg-gradient-to-br from-[#10B981]/8 to-[#10B981]/3 rounded-xl border border-[#10B981]/15">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 rounded-lg bg-[#10B981]/15 flex items-center justify-center">
                            <svg className="w-3 h-3 text-[#10B981]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <span className="text-[10px] font-semibold text-[#10B981]">Oldest</span>
                        </div>
                        <p className="text-[12px] font-semibold text-[var(--label-primary)] truncate mb-0.5">{oldestAsset.asset.name}</p>
                        <p className="text-[13px] text-[#10B981] font-bold tabular-nums">{oldestAsset.ageInYears.toFixed(1)} years</p>
                      </div>
                    )}
                    {newestAsset && (
                      <div className="p-3 bg-gradient-to-br from-[#F59E0B]/8 to-[#F59E0B]/3 rounded-xl border border-[#F59E0B]/15">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 rounded-lg bg-[#F59E0B]/15 flex items-center justify-center">
                            <svg className="w-3 h-3 text-[#F59E0B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                            </svg>
                          </div>
                          <span className="text-[10px] font-semibold text-[#F59E0B]">Newest</span>
                        </div>
                        <p className="text-[12px] font-semibold text-[var(--label-primary)] truncate mb-0.5">{newestAsset.asset.name}</p>
                        <p className="text-[13px] text-[#F59E0B] font-bold tabular-nums">
                          {newestAsset.ageInYears < 1 ? `${Math.round(newestAsset.ageInDays)} days` : `${newestAsset.ageInYears.toFixed(1)} years`}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="py-4 text-center">
                  <p className="text-[13px] text-[var(--label-tertiary)]">No holding data available</p>
                </div>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Gainers & Losers Card */}
        <motion.div variants={staggerItem}>
          <Card padding="p-0" className="overflow-hidden h-full">
            <div className="px-4 py-3.5 bg-gradient-to-r from-[#059669]/10 via-[#059669]/5 to-transparent border-b border-[var(--separator-opaque)] rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#059669] flex items-center justify-center shadow-sm">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--label-primary)]">Gainers & Losers</h3>
                  <p className="text-[11px] text-[var(--label-tertiary)]">Best and worst performers</p>
                </div>
              </div>
            </div>
            <div className="p-4">
              {assetsWithReturns.length > 0 ? (
                <div className="space-y-4">
                  {/* Top Gainers */}
                  <div className="p-3 bg-gradient-to-br from-[#10B981]/8 to-[#10B981]/3 rounded-xl border border-[#10B981]/15">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded-lg bg-[#10B981]/15 flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-[#10B981]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                        </svg>
                      </div>
                      <span className="text-[11px] font-semibold text-[#10B981]">Top Gainers</span>
                    </div>
                    <div className="space-y-2">
                      {topPerformers.slice(0, 3).map((item, index) => {
                        const maxReturn = Math.max(...topPerformers.slice(0, 3).map(i => i.returnPercent), 1);
                        const barWidth = (item.returnPercent / maxReturn) * 100;
                        const rankColors = ['#F59E0B', '#9CA3AF', '#CD7F32'];
                        return (
                          <div key={item.asset.id} className="flex items-center gap-2.5">
                            <span
                              className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                              style={{ backgroundColor: rankColors[index] }}
                            >
                              {index + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-[12px] font-medium text-[var(--label-primary)] truncate">{item.asset.name}</p>
                                <p className="text-[12px] font-bold text-[#10B981] tabular-nums shrink-0 ml-2">
                                  +{item.returnPercent.toFixed(1)}%
                                </p>
                              </div>
                              <div className="h-1.5 bg-[#10B981]/20 rounded-full overflow-hidden">
                                <motion.div
                                  className="h-full bg-[#10B981] rounded-full"
                                  initial={{ width: 0 }}
                                  animate={{ width: `${barWidth}%` }}
                                  transition={{ duration: 0.5, delay: index * 0.1 }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Top Losers */}
                  {assetsInLoss > 0 && (
                    <div className="p-3 bg-gradient-to-br from-[#EF4444]/8 to-[#EF4444]/3 rounded-xl border border-[#EF4444]/15">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-6 h-6 rounded-lg bg-[#EF4444]/15 flex items-center justify-center">
                          <svg className="w-3.5 h-3.5 text-[#EF4444]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                          </svg>
                        </div>
                        <span className="text-[11px] font-semibold text-[#EF4444]">Top Losers</span>
                      </div>
                      <div className="space-y-2">
                        {(() => {
                          const losers = [...assetsWithReturns].filter(a => a.returnPercent < 0).sort((a, b) => a.returnPercent - b.returnPercent).slice(0, 3);
                          const maxLoss = Math.max(...losers.map(i => Math.abs(i.returnPercent)), 1);
                          return losers.map((item, index) => {
                            const barWidth = (Math.abs(item.returnPercent) / maxLoss) * 100;
                            const rankColors = ['#EF4444', '#F87171', '#FCA5A5'];
                            return (
                              <div key={item.asset.id} className="flex items-center gap-2.5">
                                <span
                                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                                  style={{ backgroundColor: rankColors[index] }}
                                >
                                  {index + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-1">
                                    <p className="text-[12px] font-medium text-[var(--label-primary)] truncate">{item.asset.name}</p>
                                    <p className="text-[12px] font-bold text-[#EF4444] tabular-nums shrink-0 ml-2">
                                      {item.returnPercent.toFixed(1)}%
                                    </p>
                                  </div>
                                  <div className="h-1.5 bg-[#EF4444]/20 rounded-full overflow-hidden">
                                    <motion.div
                                      className="h-full bg-[#EF4444] rounded-full"
                                      initial={{ width: 0 }}
                                      animate={{ width: `${barWidth}%` }}
                                      transition={{ duration: 0.5, delay: index * 0.1 }}
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-4 text-center">
                  <p className="text-[13px] text-[var(--label-tertiary)]">Add assets to see performers</p>
                </div>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Asset Type Breakdown Card - Treemap Style */}
        <motion.div variants={staggerItem}>
          <Card padding="p-0" className="overflow-hidden h-full">
            <div className="px-4 py-3.5 bg-gradient-to-r from-[#8B5CF6]/10 via-[#8B5CF6]/5 to-transparent border-b border-[var(--separator-opaque)] rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#8B5CF6] flex items-center justify-center shadow-sm">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--label-primary)]">Asset Type Breakdown</h3>
                  <p className="text-[11px] text-[var(--label-tertiary)]">{assetTypeBreakdown.length} different types</p>
                </div>
              </div>
            </div>
            <div className="p-4">
              {assetTypeBreakdown.length > 0 ? (
                <>
                  {/* Treemap-style Grid */}
                  <div className="grid grid-cols-3 gap-2 mb-3" style={{ minHeight: '150px' }}>
                    {assetTypeBreakdown.slice(0, 6).map((item, index) => {
                      // Calculate grid span based on percentage
                      const isLarge = item.percent >= 30;
                      const isMedium = item.percent >= 15 && item.percent < 30;
                      // Softer color palette
                      const softColors = {
                        '#4CAF50': '#22C55E', // Green
                        '#2196F3': '#3B82F6', // Blue
                        '#FF9800': '#F59E0B', // Orange
                        '#9C27B0': '#A855F7', // Purple
                        '#E91E63': '#EC4899', // Pink
                        '#00BCD4': '#06B6D4', // Cyan
                        '#8BC34A': '#84CC16', // Lime
                        '#FF5722': '#F97316', // Deep Orange
                      };
                      const displayColor = softColors[item.color] || item.color;
                      return (
                        <motion.div
                          key={item.type}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.4, delay: index * 0.08 }}
                          className={`relative rounded-xl p-3 flex flex-col justify-between cursor-pointer group overflow-hidden ${
                            isLarge ? 'col-span-2 row-span-2' : isMedium ? 'col-span-1 row-span-2' : 'col-span-1 row-span-1'
                          }`}
                          style={{
                            background: `linear-gradient(135deg, ${displayColor}, ${displayColor}DD)`,
                            minHeight: isLarge ? '110px' : isMedium ? '90px' : '55px'
                          }}
                        >
                          {/* Gradient overlay for depth */}
                          <div className="absolute inset-0 bg-gradient-to-br from-white/15 to-black/10 rounded-xl" />

                          {/* Content */}
                          <div className="relative z-10">
                            <p className={`font-bold text-white tabular-nums ${isLarge ? 'text-[24px]' : isMedium ? 'text-[18px]' : 'text-[15px]'}`}>
                              {item.percent.toFixed(0)}%
                            </p>
                          </div>
                          <div className="relative z-10">
                            <p className={`font-semibold text-white truncate ${isLarge ? 'text-[13px]' : 'text-[11px]'}`}>
                              {item.label}
                            </p>
                            <p className={`text-white/80 tabular-nums ${isLarge ? 'text-[11px]' : 'text-[9px]'}`}>
                              {formatCompact(item.value)}
                            </p>
                          </div>

                          {/* Hover effect */}
                          <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" />
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Legend for smaller items */}
                  {assetTypeBreakdown.length > 6 && (
                    <div className="pt-3 border-t border-[var(--separator-opaque)]">
                      <p className="text-[11px] text-[var(--label-tertiary)] font-semibold mb-2">Other Types</p>
                      <div className="flex flex-wrap gap-2">
                        {assetTypeBreakdown.slice(6).map((item) => (
                          <div key={item.type} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--fill-quaternary)] rounded-lg">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="text-[11px] text-[var(--label-secondary)]">{item.label}</span>
                            <span className="text-[11px] font-semibold text-[var(--label-primary)] tabular-nums">{item.percent.toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-4 text-center">
                  <p className="text-[13px] text-[var(--label-tertiary)]">No asset type data</p>
                </div>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Income Summary Card */}
        <motion.div variants={staggerItem}>
          <Card padding="p-0" className="overflow-hidden h-full">
            <div className="px-4 py-3.5 bg-gradient-to-r from-[#10B981]/10 via-[#10B981]/5 to-transparent border-b border-[var(--separator-opaque)] rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#10B981] flex items-center justify-center shadow-sm">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--label-primary)]">Income Summary</h3>
                  <p className="text-[11px] text-[var(--label-tertiary)]">Interest & passive income</p>
                </div>
              </div>
            </div>
            <div className="p-4">
              {interestIncome > 0 ? (
                <>
                  {/* Total Interest Hero Section */}
                  <div className="p-4 bg-gradient-to-br from-[#10B981]/10 to-[#059669]/5 border border-[#10B981]/20 rounded-xl mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-lg bg-[#10B981]/20 flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-[#10B981]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                        </svg>
                      </div>
                      <span className="text-[11px] font-semibold text-[var(--label-tertiary)]">Total Interest Earned</span>
                    </div>
                    <p className="text-[26px] font-bold text-[#10B981] tabular-nums">{formatCurrency(interestIncome)}</p>
                  </div>

                  {/* Income Breakdown */}
                  <div className="space-y-3">
                    {/* Tax-Exempt Income */}
                    <div className="p-3 bg-[#059669]/5 border border-[#059669]/15 rounded-xl">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-[#059669]/15 flex items-center justify-center">
                            <svg className="w-3.5 h-3.5 text-[#059669]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                            </svg>
                          </div>
                          <div>
                            <span className="text-[12px] font-medium text-[var(--label-primary)]">Tax-Exempt</span>
                            <p className="text-[10px] text-[var(--label-tertiary)]">PPF, EPF, SSY</p>
                          </div>
                        </div>
                        <span className="text-[14px] font-bold text-[#059669] tabular-nums">{formatCurrency(taxExemptIncome)}</span>
                      </div>
                    </div>

                    {/* Taxable Income */}
                    <div className="p-3 bg-[var(--fill-quaternary)] border border-[var(--separator-non-opaque)] rounded-xl">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-[var(--fill-tertiary)] flex items-center justify-center">
                            <svg className="w-3.5 h-3.5 text-[var(--label-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                            </svg>
                          </div>
                          <div>
                            <span className="text-[12px] font-medium text-[var(--label-primary)]">Taxable</span>
                            <p className="text-[10px] text-[var(--label-tertiary)]">FD, RD, etc.</p>
                          </div>
                        </div>
                        <span className="text-[14px] font-bold text-[var(--label-primary)] tabular-nums">{formatCurrency(taxableIncome)}</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-8 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#10B981]/10 to-[#059669]/5 border border-[#10B981]/20 flex items-center justify-center">
                    <svg className="w-8 h-8 text-[#10B981]/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-[14px] font-medium text-[var(--label-secondary)] mb-1">No Interest Income Yet</p>
                  <p className="text-[12px] text-[var(--label-tertiary)]">Add fixed deposits, PPF, or bonds<br />to track your passive income</p>
                </div>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Tax Implications Card */}
        <motion.div variants={staggerItem}>
          <Card padding="p-0" className="overflow-hidden h-full">
            <div className="px-4 py-3.5 bg-gradient-to-r from-[#EF4444]/10 via-[#EF4444]/5 to-transparent border-b border-[var(--separator-opaque)] rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#EF4444] flex items-center justify-center shadow-sm">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--label-primary)]">Tax Implications</h3>
                  <p className="text-[11px] text-[var(--label-tertiary)]">Equity capital gains estimate</p>
                </div>
              </div>
            </div>
            <div className="p-4">
              {equityAssetsWithReturns.length > 0 ? (
                <>
                  {/* LTCG and STCG Cards */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {/* LTCG Card - Green tint (lower tax) */}
                    <div className="p-3 bg-gradient-to-br from-[#059669]/8 to-[#10B981]/4 border border-[#059669]/15 rounded-xl">
                      <div className="flex items-center gap-1.5 mb-2">
                        <div className="w-5 h-5 rounded-md bg-[#059669]/15 flex items-center justify-center">
                          <svg className="w-3 h-3 text-[#059669]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <span className="text-[10px] font-semibold text-[#059669]">LTCG (1Y+)</span>
                      </div>
                      <p className="text-[18px] font-bold text-[var(--label-primary)] tabular-nums mb-0.5">{formatCompact(ltcgGain)}</p>
                      <p className="text-[10px] text-[var(--label-tertiary)]">{ltcgAssets.length} asset{ltcgAssets.length !== 1 ? 's' : ''} @ 12.5%</p>
                    </div>

                    {/* STCG Card - Orange tint (higher tax) */}
                    <div className="p-3 bg-gradient-to-br from-[#F59E0B]/8 to-[#D97706]/4 border border-[#F59E0B]/15 rounded-xl">
                      <div className="flex items-center gap-1.5 mb-2">
                        <div className="w-5 h-5 rounded-md bg-[#F59E0B]/15 flex items-center justify-center">
                          <svg className="w-3 h-3 text-[#F59E0B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <span className="text-[10px] font-semibold text-[#F59E0B]">STCG (&lt;1Y)</span>
                      </div>
                      <p className="text-[18px] font-bold text-[var(--label-primary)] tabular-nums mb-0.5">{formatCompact(stcgGain)}</p>
                      <p className="text-[10px] text-[var(--label-tertiary)]">{stcgAssets.length} asset{stcgAssets.length !== 1 ? 's' : ''} @ 20%</p>
                    </div>
                  </div>

                  {/* Tax Liability Section */}
                  <div className="p-3.5 bg-gradient-to-br from-[#EF4444]/10 to-[#DC2626]/5 border border-[#EF4444]/20 rounded-xl">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded-lg bg-[#EF4444]/15 flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-[#EF4444]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                        </svg>
                      </div>
                      <span className="text-[12px] font-semibold text-[var(--label-primary)]">Estimated Tax Liability</span>
                    </div>
                    <p className="text-[24px] font-bold text-[#EF4444] tabular-nums mb-3">{formatCurrency(ltcgTax + stcgTax)}</p>

                    {/* Tax Breakdown */}
                    <div className="space-y-2 pt-2 border-t border-[#EF4444]/15">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#059669]" />
                          <span className="text-[10px] text-[var(--label-tertiary)]">LTCG @ 12.5% (above ₹1.25L)</span>
                        </div>
                        <span className="text-[11px] font-semibold text-[var(--label-secondary)] tabular-nums">{formatCurrency(ltcgTax)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
                          <span className="text-[10px] text-[var(--label-tertiary)]">STCG @ 20%</span>
                        </div>
                        <span className="text-[11px] font-semibold text-[var(--label-secondary)] tabular-nums">{formatCurrency(stcgTax)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Disclaimer */}
                  <div className="flex items-start gap-2 mt-3 p-2 bg-[var(--fill-quaternary)] rounded-lg">
                    <svg className="w-3.5 h-3.5 text-[var(--label-quaternary)] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                    </svg>
                    <p className="text-[10px] text-[var(--label-quaternary)] leading-relaxed">
                      Unrealized gains. Tax applies only when you sell. Consult a tax advisor for accurate calculations.
                    </p>
                  </div>
                </>
              ) : (
                <div className="py-8 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#EF4444]/10 to-[#DC2626]/5 border border-[#EF4444]/20 flex items-center justify-center">
                    <svg className="w-8 h-8 text-[#EF4444]/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" />
                    </svg>
                  </div>
                  <p className="text-[14px] font-medium text-[var(--label-secondary)] mb-1">No Equity Assets</p>
                  <p className="text-[12px] text-[var(--label-tertiary)]">Add stocks or mutual funds<br />to see tax implications</p>
                </div>
              )}
            </div>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}
