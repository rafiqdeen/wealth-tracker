import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { assetService, priceService, ASSET_CONFIG } from '../services/assets';
import { Card, PageSpinner } from '../components/apple';
import { spring, staggerContainer, staggerItem } from '../utils/animations';
import { categoryColors } from '../constants/theme';
import { formatCurrency, formatCompact } from '../utils/formatting';
import { calculateFixedIncomeValue, getCompoundingFrequency } from '../utils/interest';

export default function Insights() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [prices, setPrices] = useState({});
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

      // Fetch prices for market assets
      const marketAssets = assetList.filter(a =>
        ['STOCK', 'MUTUAL_FUND', 'ETF', 'CRYPTO'].includes(a.asset_type)
      );

      if (marketAssets.length > 0) {
        const symbols = marketAssets.map(a => ({
          symbol: a.asset_type === 'MUTUAL_FUND' ? a.symbol : `${a.symbol}.${a.exchange === 'BSE' ? 'BO' : 'NS'}`,
          type: a.asset_type === 'MUTUAL_FUND' ? 'mf' : 'stock'
        }));
        const priceResponse = await priceService.getBulkPrices(symbols);
        setPrices(priceResponse.data.prices || {});
      }

      // Calculate fixed income values
      const fixedIncomeAssets = assetList.filter(a => a.category === 'FIXED_INCOME');
      if (fixedIncomeAssets.length > 0) {
        const calcs = {};
        fixedIncomeAssets.forEach(asset => {
          const startDate = new Date(asset.start_date || asset.purchase_date || asset.created_at);
          const maturityDate = asset.maturity_date ? new Date(asset.maturity_date) : null;
          const principal = asset.principal || asset.principal_amount || asset.invested_value || 0;
          const rate = asset.interest_rate || 0;
          const compounding = getCompoundingFrequency(asset.compounding_frequency);

          const result = calculateFixedIncomeValue(
            principal,
            rate,
            startDate,
            maturityDate,
            compounding
          );
          calcs[asset.id] = { ...result, principal };
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
      if (asset.symbol) {
        const priceKey = asset.asset_type === 'MUTUAL_FUND' ? asset.symbol : `${asset.symbol}.${asset.exchange === 'BSE' ? 'BO' : 'NS'}`;
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
    if (asset.category === 'FIXED_INCOME') {
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
    'PHYSICAL_ASSETS': { color: '#F59E0B', label: 'Physical Assets' },
    'SAVINGS': { color: '#8B5CF6', label: 'Savings' },
    'CRYPTO': { color: '#EC4899', label: 'Crypto' },
    'INSURANCE': { color: '#F472B6', label: 'Insurance' },
    'OTHER': { color: '#6B7280', label: 'Other' },
  };

  // ===== INSIGHT CALCULATIONS =====

  // Check if an equity asset has real market price (not fallback)
  const hasRealPrice = (asset) => {
    if (asset.category !== 'EQUITY') return true; // Non-equity always has "real" value
    if (!asset.symbol) return true; // No symbol = use avg_buy_price
    const priceKey = asset.asset_type === 'MUTUAL_FUND' ? asset.symbol : `${asset.symbol}.${asset.exchange === 'BSE' ? 'BO' : 'NS'}`;
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

  // Category icons mapping
  const categoryIcons = {
    'REAL_ESTATE': '🏠',
    'FIXED_INCOME': '💰',
    'EQUITY': '📊',
    'PHYSICAL_ASSETS': '🪙',
    'SAVINGS': '🏦',
    'CRYPTO': '₿',
    'INSURANCE': '🛡️',
    'OTHER': '📦',
  };

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
    { name: 'Nifty 50 (1Y)', value: 12.5 },
    { name: 'FD Returns', value: 7.0 },
    { name: 'Inflation', value: 5.5 },
  ];
  const beatsBenchmark = portfolioReturn > 12.5;

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
  const lockedCategories = ['FIXED_INCOME', 'REAL_ESTATE', 'PHYSICAL_ASSETS', 'INSURANCE'];

  const liquidAssets = assets.filter(a => liquidCategories.includes(a.category));
  const lockedAssets = assets.filter(a => lockedCategories.includes(a.category));

  const liquidValue = liquidAssets.reduce((sum, a) => sum + getAssetValue(a), 0);
  const lockedValue = lockedAssets.reduce((sum, a) => sum + getAssetValue(a), 0);
  const liquidPercent = totalCurrentValue > 0 ? (liquidValue / totalCurrentValue) * 100 : 0;
  const lockedPercent = totalCurrentValue > 0 ? (lockedValue / totalCurrentValue) * 100 : 0;

  const monthlyExpense = 50000;
  const emergencyMonths = liquidValue / monthlyExpense;

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
  const bottomPerformers = [...sortedByReturn].reverse().slice(0, 5).filter(a => a.returnPercent < topPerformers[topPerformers.length - 1]?.returnPercent);

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
        <PageSpinner message="Loading insights..." />
      </div>
    );
  }

  return (
    <div className="p-4 md:px-12 md:py-6">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.gentle}
        className="mb-6"
      >
        <h1 className="text-[22px] font-bold text-[var(--label-primary)] mb-1">Portfolio Insights</h1>
        <p className="text-[14px] text-[var(--label-secondary)]">
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
                    <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wide font-medium mb-3">Your Portfolio</p>

                    {/* Circular Chart */}
                    <div className="flex justify-center mb-4">
                      <div className="relative w-28 h-28">
                        <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r="38" fill="none" stroke="var(--fill-tertiary)" strokeWidth="7" />
                          <motion.circle
                            cx="50" cy="50" r="38"
                            fill="none"
                            stroke={totalGainPercent >= 0 ? '#059669' : '#DC2626'}
                            strokeWidth="7"
                            strokeLinecap="round"
                            strokeDasharray={`${Math.min(Math.abs(totalGainPercent), 100) * 2.39} 239`}
                            initial={{ strokeDasharray: '0 239' }}
                            animate={{ strokeDasharray: `${Math.min(Math.abs(totalGainPercent), 100) * 2.39} 239` }}
                            transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className={`text-[17px] font-bold tabular-nums ${totalGainPercent >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                            {totalGainPercent >= 0 ? '+' : ''}{totalGainPercent.toFixed(1)}%
                          </span>
                          <span className="text-[9px] text-[var(--label-tertiary)]">return</span>
                        </div>
                      </div>
                    </div>

                    {/* Value Flow */}
                    <div className="text-center mb-3">
                      <div className="flex items-center justify-center gap-2 text-[14px]">
                        <span className="text-[var(--label-secondary)] tabular-nums">{formatCompact(totalInvested)}</span>
                        <span className="text-[var(--label-quaternary)]">→</span>
                        <span className="text-[var(--label-primary)] font-semibold tabular-nums">{formatCompact(totalCurrentValue)}</span>
                      </div>
                      <p className={`text-[16px] font-bold tabular-nums mt-1 ${totalGain >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                        {totalGain >= 0 ? '+' : ''}{formatCompact(totalGain)}
                      </p>
                    </div>

                    {/* Badges */}
                    <div className="flex justify-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-[#059669]/10 rounded-md text-[11px] font-semibold text-[#059669]">
                        <span>▲</span> {assetsInProfit}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-[#DC2626]/10 rounded-md text-[11px] font-semibold text-[#DC2626]">
                        <span>▼</span> {assetsInLoss}
                      </span>
                      <span className="inline-flex items-center px-2 py-1 bg-[var(--fill-quaternary)] rounded-md text-[11px] font-medium text-[var(--label-secondary)]">
                        {assetsWithValidReturns.length > 0
                          ? (assetsWithValidReturns.reduce((sum, a) => sum + a.returnPercent, 0) / assetsWithValidReturns.length).toFixed(1)
                          : '—'}% avg
                      </span>
                    </div>
                  </div>

                  {/* Right Column: Top Performers */}
                  <div className="flex-1 p-4 flex flex-col">
                    <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wide font-medium mb-3">Top Performers</p>

                    {/* Performers List */}
                    <div className="flex-1 space-y-2">
                      {sortedByReturn.slice(0, 5).map((item, index) => (
                        <div key={item.asset.id} className="flex items-center gap-2.5">
                          {index < 3 ? (
                            <span className="text-[13px] w-5">
                              {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                            </span>
                          ) : (
                            <span className="w-5 h-5 rounded-full bg-[var(--fill-tertiary)] flex items-center justify-center text-[10px] font-semibold text-[var(--label-secondary)]">
                              {index + 1}
                            </span>
                          )}
                          <span className="flex-1 text-[13px] text-[var(--label-primary)] truncate">{item.asset.name}</span>
                          <span className={`text-[13px] font-semibold tabular-nums ${
                            item.returnPercent > 0 ? 'text-[#059669]' : item.returnPercent < 0 ? 'text-[#DC2626]' : 'text-[var(--label-tertiary)]'
                          }`}>
                            {item.returnPercent > 0 ? '+' : ''}{item.returnPercent.toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Bottom Summary */}
                    <div className="pt-3 mt-auto border-t border-[var(--separator-opaque)]">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[var(--label-tertiary)]">{assetsWithReturns.length} assets tracked</span>
                        <span className="text-[var(--label-tertiary)]">
                          Best: <span className="text-[#059669] font-semibold">+{bestPerformer?.returnPercent.toFixed(0)}%</span>
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

        {/* Allocation Card - Option 5: Compact Grid */}
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
                  <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wide">Diversity</p>
                  <p className={`text-[14px] font-bold ${
                    diversificationScore >= 70 ? 'text-[var(--system-green)]' :
                    diversificationScore >= 50 ? 'text-[var(--system-orange)]' :
                    'text-[var(--system-red)]'
                  }`}>
                    {diversificationScore} <span className="text-[10px] font-medium">{diversificationLevel}</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="p-0">
              {categoryAllocation.length > 0 ? (
                <div className="flex">
                  {/* Left Panel: Donut + Stacked Bar (70%) */}
                  <div className="w-[70%] p-4 border-r border-[var(--separator-opaque)]">
                    {/* Donut Chart with Return */}
                    <div className="flex items-center gap-4 mb-4">
                      <div className="relative w-24 h-24 shrink-0">
                        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                          {(() => {
                            let cumulativePercent = 0;
                            return categoryAllocation.map((cat, index) => {
                              const circumference = 2 * Math.PI * 38;
                              const strokeDasharray = `${(cat.percent / 100) * circumference} ${circumference}`;
                              const strokeDashoffset = -((cumulativePercent / 100) * circumference);
                              cumulativePercent += cat.percent;
                              return (
                                <motion.circle
                                  key={cat.key}
                                  cx="50" cy="50" r="38"
                                  fill="none"
                                  stroke={cat.color}
                                  strokeWidth="10"
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
                          <span className="text-[15px] font-bold text-[var(--label-primary)] tabular-nums">{formatCompact(totalCurrentValue)}</span>
                          <span className={`text-[12px] font-semibold tabular-nums ${totalGainPercent >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                            {totalGainPercent >= 0 ? '+' : ''}{totalGainPercent.toFixed(1)}%
                          </span>
                        </div>
                      </div>

                      {/* Mini Category Bars */}
                      <div className="flex-1 space-y-2">
                        {categoryAllocation.slice(0, 4).map((cat) => (
                          <div key={cat.key} className="flex items-center gap-2.5">
                            <span className="text-[14px] w-5">{categoryIcons[cat.key] || '📊'}</span>
                            <div className="flex-1 h-2.5 bg-[var(--fill-tertiary)] rounded-full overflow-hidden">
                              <motion.div
                                className="h-full rounded-full"
                                style={{ backgroundColor: cat.color }}
                                initial={{ width: 0 }}
                                animate={{ width: `${cat.percent}%` }}
                                transition={{ duration: 0.6, delay: 0.2 }}
                              />
                            </div>
                            <span className="text-[13px] font-semibold text-[var(--label-primary)] tabular-nums w-10 text-right">{cat.percent.toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Stacked Composition Bar */}
                    <div className="mb-4">
                      <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wide font-medium mb-2">Full Composition</p>
                      <div className="h-5 rounded-lg overflow-hidden flex">
                        {categoryAllocation.map((cat, index) => (
                          <motion.div
                            key={cat.key}
                            className="h-full relative group cursor-pointer"
                            style={{ backgroundColor: cat.color }}
                            initial={{ width: 0 }}
                            animate={{ width: `${cat.percent}%` }}
                            transition={{ duration: 0.6, delay: index * 0.1 }}
                          >
                            {/* Tooltip */}
                            <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-[var(--bg-elevated)] border border-[var(--separator-opaque)] rounded-lg px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg whitespace-nowrap z-10 pointer-events-none">
                              <p className="text-[12px] font-semibold text-[var(--label-primary)]">{cat.label}: {cat.percent.toFixed(1)}%</p>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>

                    {/* Largest Category + Warning */}
                    <div className="p-3.5 bg-[var(--fill-quaternary)] rounded-xl">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-[20px]">{categoryIcons[categoryAllocation[0]?.key] || '📊'}</span>
                          <div>
                            <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wide font-medium">Largest Category</p>
                            <p className="text-[15px] font-semibold text-[var(--label-primary)]">{categoryAllocation[0]?.label}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[20px] font-bold tabular-nums" style={{ color: categoryAllocation[0]?.color }}>
                            {categoryAllocation[0]?.percent.toFixed(0)}%
                          </p>
                          <p className="text-[12px] text-[var(--label-tertiary)] tabular-nums">{formatCompact(categoryAllocation[0]?.value || 0)}</p>
                        </div>
                      </div>
                      {categoryAllocation[0]?.percent > 40 && (
                        <div className="mt-2.5 pt-2.5 border-t border-[var(--separator-opaque)]">
                          <p className="text-[12px] text-[var(--system-orange)] flex items-center gap-1.5">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            Consider rebalancing — over 40% in one category
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Panel: Category Breakdown (30%) */}
                  <div className="w-[30%] p-4 flex flex-col bg-[var(--fill-quaternary)]/30">
                    <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wide font-medium mb-3">Returns</p>

                    <div className="flex-1 space-y-2.5">
                      {categoryAllocation.slice(0, 5).map((cat) => (
                        <div key={cat.key} className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                            <span className="text-[13px] text-[var(--label-primary)] truncate">{cat.label.split(' ')[0]}</span>
                          </div>
                          <span className={`text-[13px] font-semibold tabular-nums ${
                            cat.returnPercent > 0 ? 'text-[#059669]' : cat.returnPercent < 0 ? 'text-[#DC2626]' : 'text-[var(--label-tertiary)]'
                          }`}>
                            {cat.returnPercent > 0 ? '+' : ''}{cat.returnPercent.toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Bottom Summary */}
                    <div className="pt-3 mt-auto border-t border-[var(--separator-opaque)]">
                      <div className="text-center">
                        <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wide mb-1">Best</p>
                        <p className="text-[13px] font-bold text-[#059669]">
                          {categoryAllocation.reduce((best, cat) => cat.returnPercent > best.returnPercent ? cat : best, categoryAllocation[0])?.label?.split(' ')[0]}
                        </p>
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
                <>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="relative w-20 h-20">
                      <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                        <circle cx="40" cy="40" r="35" fill="none" stroke="var(--fill-tertiary)" strokeWidth="8" />
                        <motion.circle
                          cx="40" cy="40" r="35"
                          fill="none"
                          stroke={diversificationScore >= 70 ? 'var(--system-green)' : diversificationScore >= 50 ? 'var(--system-orange)' : 'var(--system-red)'}
                          strokeWidth="8"
                          strokeLinecap="round"
                          strokeDasharray={`${(diversificationScore / 100) * 220} 220`}
                          initial={{ strokeDasharray: '0 220' }}
                          animate={{ strokeDasharray: `${(diversificationScore / 100) * 220} 220` }}
                          transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-[18px] font-bold text-[var(--label-primary)] tabular-nums">{diversificationScore}</span>
                        <span className="text-[9px] text-[var(--label-tertiary)] uppercase tracking-wide">Score</span>
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold mb-1 ${
                        diversificationLevel === 'Good' ? 'bg-[var(--system-green)]/15 text-[var(--system-green)]' :
                        diversificationLevel === 'Moderate' ? 'bg-[var(--system-orange)]/15 text-[var(--system-orange)]' :
                        'bg-[var(--system-red)]/15 text-[var(--system-red)]'
                      }`}>
                        {diversificationLevel}
                      </div>
                      <p className="text-[12px] text-[var(--label-secondary)]">
                        {diversificationLevel === 'Good' ? 'Well diversified portfolio' :
                         diversificationLevel === 'Moderate' ? 'Consider adding variety' :
                         'High concentration risk'}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between py-2 px-3 bg-[var(--fill-quaternary)] rounded-lg">
                      <span className="text-[12px] text-[var(--label-secondary)]">Top 3 Concentration</span>
                      <span className={`text-[13px] font-semibold tabular-nums ${top3Concentration > 70 ? 'text-[var(--system-red)]' : 'text-[var(--label-primary)]'}`}>
                        {top3Concentration.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2 px-3 bg-[var(--fill-quaternary)] rounded-lg">
                      <span className="text-[12px] text-[var(--label-secondary)]">Asset Categories</span>
                      <span className="text-[13px] font-semibold text-[var(--label-primary)] tabular-nums">{uniqueCategories}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 px-3 bg-[var(--fill-quaternary)] rounded-lg">
                      <span className="text-[12px] text-[var(--label-secondary)]">Total Holdings</span>
                      <span className="text-[13px] font-semibold text-[var(--label-primary)] tabular-nums">{totalAssetCount}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-4 text-center">
                  <p className="text-[13px] text-[var(--label-tertiary)]">Add assets to see risk analysis</p>
                </div>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Benchmark Comparison Card - Horizontal Bar Chart */}
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
                  <p className="text-[11px] text-[var(--label-tertiary)]">
                    {beatsBenchmark ? '✓ Outperforming market' : 'Below market returns'}
                  </p>
                </div>
              </div>
            </div>
            <div className="p-4">
              {assets.length > 0 ? (
                <>
                  {/* Visual Bar Chart */}
                  <div className="flex items-end justify-around gap-3 mb-4" style={{ height: '140px' }}>
                    {benchmarks.map((b, index) => {
                      const maxReturn = Math.max(...benchmarks.map(x => Math.abs(x.value)), 15);
                      const barHeightPx = Math.max((Math.abs(b.value) / maxReturn) * 100, 15);
                      const barColors = {
                        'Your Portfolio': b.value >= 0 ? '#3B82F6' : '#DC2626',
                        'Nifty 50 (1Y)': '#10B981',
                        'FD Returns': '#F59E0B',
                        'Inflation': '#EF4444',
                      };
                      return (
                        <div key={b.name} className="flex flex-col items-center flex-1 h-full justify-end">
                          {/* Value label */}
                          <span className="text-[11px] font-bold tabular-nums mb-1" style={{ color: barColors[b.name] }}>
                            {b.value >= 0 ? '+' : ''}{b.value.toFixed(0)}%
                          </span>
                          {/* Bar */}
                          <motion.div
                            className="w-10 rounded-t-lg relative group cursor-pointer"
                            style={{ backgroundColor: barColors[b.name] || '#6B7280' }}
                            initial={{ height: 0 }}
                            animate={{ height: barHeightPx }}
                            transition={{ duration: 0.8, delay: index * 0.15, ease: [0.4, 0, 0.2, 1] }}
                          >
                            {/* Tooltip on hover */}
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[var(--bg-primary)] border border-[var(--separator-opaque)] rounded-lg px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg whitespace-nowrap z-10">
                              <p className="text-[11px] font-semibold text-[var(--label-primary)]">{b.name}: {b.value >= 0 ? '+' : ''}{b.value.toFixed(1)}%</p>
                            </div>
                          </motion.div>
                          {/* Label */}
                          <p className="text-[9px] text-[var(--label-tertiary)] mt-2 text-center leading-tight max-w-[60px]">
                            {b.name.replace(' (1Y)', '').replace('Your ', '')}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  {/* Summary */}
                  <div className="pt-3 border-t border-[var(--separator-opaque)]">
                    <div className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg ${
                      beatsBenchmark ? 'bg-[#10B981]/10' : 'bg-[var(--fill-quaternary)]'
                    }`}>
                      {beatsBenchmark ? (
                        <svg className="w-4 h-4 text-[#10B981]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-[var(--label-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                      )}
                      <span className={`text-[12px] font-medium ${beatsBenchmark ? 'text-[#10B981]' : 'text-[var(--label-secondary)]'}`}>
                        {beatsBenchmark ? 'Beating Nifty 50 by ' : 'Below Nifty 50 by '}
                        {Math.abs(portfolioReturn - 12.5).toFixed(1)}%
                      </span>
                    </div>
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
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
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
                  {/* Visual Split Bar */}
                  <div className="mb-4">
                    <div className="h-4 rounded-full overflow-hidden bg-[var(--fill-tertiary)] flex">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${liquidPercent}%` }}
                        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                        className="h-full bg-[var(--system-blue)] relative"
                      >
                        {liquidPercent > 15 && (
                          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white">
                            {liquidPercent.toFixed(0)}%
                          </span>
                        )}
                      </motion.div>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${lockedPercent}%` }}
                        transition={{ duration: 0.6, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
                        className="h-full bg-[var(--system-gray-3)] relative"
                      >
                        {lockedPercent > 15 && (
                          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white">
                            {lockedPercent.toFixed(0)}%
                          </span>
                        )}
                      </motion.div>
                    </div>
                  </div>

                  {/* Liquid & Locked Asset Types */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {/* Liquid Assets */}
                    <div className="p-2.5 bg-[var(--system-blue)]/5 rounded-xl border border-[var(--system-blue)]/10">
                      <div className="flex items-center gap-1.5 mb-2">
                        <div className="w-2 h-2 rounded-full bg-[var(--system-blue)]" />
                        <span className="text-[10px] font-semibold text-[var(--system-blue)] uppercase tracking-wide">Liquid</span>
                      </div>
                      <p className="text-[14px] font-bold text-[var(--label-primary)] tabular-nums mb-1">{formatCompact(liquidValue)}</p>
                      <div className="space-y-0.5">
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
                                <span className="text-[9px] text-[var(--label-tertiary)]">{ASSET_CONFIG[type]?.label || type.replace(/_/g, ' ')}</span>
                                <span className="text-[9px] font-medium text-[var(--label-secondary)] tabular-nums">{formatCompact(value)}</span>
                              </div>
                            ));
                        })()}
                      </div>
                    </div>

                    {/* Locked Assets */}
                    <div className="p-2.5 bg-[var(--system-gray)]/5 rounded-xl border border-[var(--system-gray)]/10">
                      <div className="flex items-center gap-1.5 mb-2">
                        <div className="w-2 h-2 rounded-full bg-[var(--system-gray-3)]" />
                        <span className="text-[10px] font-semibold text-[var(--system-gray)] uppercase tracking-wide">Locked</span>
                      </div>
                      <p className="text-[14px] font-bold text-[var(--label-primary)] tabular-nums mb-1">{formatCompact(lockedValue)}</p>
                      <div className="space-y-0.5">
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
                                <span className="text-[9px] text-[var(--label-tertiary)]">{ASSET_CONFIG[type]?.label || type.replace(/_/g, ' ')}</span>
                                <span className="text-[9px] font-medium text-[var(--label-secondary)] tabular-nums">{formatCompact(value)}</span>
                              </div>
                            ));
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Emergency Coverage */}
                  <div className="p-3 bg-[var(--fill-quaternary)] rounded-xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wide">Emergency Fund</p>
                        <p className={`text-[18px] font-bold tabular-nums ${
                          emergencyMonths >= 6 ? 'text-[var(--system-green)]' :
                          emergencyMonths >= 3 ? 'text-[var(--system-orange)]' :
                          'text-[var(--system-red)]'
                        }`}>
                          {emergencyMonths.toFixed(1)} mo
                        </p>
                      </div>
                      <div className={`px-2 py-1 rounded-full text-[10px] font-semibold ${
                        emergencyMonths >= 6 ? 'bg-[var(--system-green)]/15 text-[var(--system-green)]' :
                        emergencyMonths >= 3 ? 'bg-[var(--system-orange)]/15 text-[var(--system-orange)]' :
                        'bg-[var(--system-red)]/15 text-[var(--system-red)]'
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
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[var(--system-pink)] flex items-center justify-center shadow-sm">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--label-primary)]">Holding Period Analysis</h3>
                  <p className="text-[11px] text-[var(--label-tertiary)]">
                    {assetsWithAge.length > 0 ? `Avg. ${avgHoldingYears.toFixed(1)} years holding` : 'Investment timeline'}
                  </p>
                </div>
              </div>
            </div>
            <div className="p-4">
              {assetsWithAge.length > 0 ? (
                <>
                  <div className="space-y-3 mb-4">
                    {[
                      { label: '< 1 Year', count: holdingBuckets.lessThan1Year, color: 'var(--system-orange)' },
                      { label: '1-3 Years', count: holdingBuckets.oneToThreeYears, color: 'var(--system-blue)' },
                      { label: '3+ Years', count: holdingBuckets.moreThan3Years, color: 'var(--system-green)' },
                    ].map((bucket, index) => {
                      const maxCount = Math.max(holdingBuckets.lessThan1Year, holdingBuckets.oneToThreeYears, holdingBuckets.moreThan3Years, 1);
                      const barWidth = (bucket.count / maxCount) * 100;
                      return (
                        <div key={bucket.label}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[12px] text-[var(--label-secondary)]">{bucket.label}</span>
                            <span className="text-[13px] font-semibold text-[var(--label-primary)] tabular-nums">{bucket.count} assets</span>
                          </div>
                          <div className="h-2 rounded-full overflow-hidden bg-[var(--fill-tertiary)]">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${barWidth}%` }}
                              transition={{ duration: 0.6, delay: index * 0.1, ease: [0.4, 0, 0.2, 1] }}
                              className="h-full rounded-full"
                              style={{ backgroundColor: bucket.color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {oldestAsset && (
                      <div className="p-3 bg-[var(--fill-quaternary)] rounded-xl">
                        <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wide mb-1">Oldest Holding</p>
                        <p className="text-[12px] font-semibold text-[var(--label-primary)] truncate">{oldestAsset.asset.name}</p>
                        <p className="text-[11px] text-[var(--system-green)] font-medium">{oldestAsset.ageInYears.toFixed(1)} years</p>
                      </div>
                    )}
                    {newestAsset && (
                      <div className="p-3 bg-[var(--fill-quaternary)] rounded-xl">
                        <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wide mb-1">Newest Holding</p>
                        <p className="text-[12px] font-semibold text-[var(--label-primary)] truncate">{newestAsset.asset.name}</p>
                        <p className="text-[11px] text-[var(--system-orange)] font-medium">
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
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 11l5-5m0 0l5 5m-5-5v12" />
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
                  <div>
                    <p className="text-[11px] text-[#059669] uppercase tracking-wide font-semibold mb-2 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                      </svg>
                      Top Gainers
                    </p>
                    <div className="space-y-1.5">
                      {topPerformers.slice(0, 3).map((item, index) => (
                        <div key={item.asset.id} className="flex items-center justify-between py-1.5 px-2.5 bg-[#059669]/5 rounded-lg border border-[#059669]/10">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-bold text-[#059669] w-4">{index + 1}</span>
                            <p className="text-[12px] font-medium text-[var(--label-primary)] truncate">{item.asset.name}</p>
                          </div>
                          <p className="text-[12px] font-bold text-[#059669] tabular-nums shrink-0 ml-2">
                            +{item.returnPercent.toFixed(1)}%
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Top Losers */}
                  {assetsInLoss > 0 && (
                    <div>
                      <p className="text-[11px] text-[#DC2626] uppercase tracking-wide font-semibold mb-2 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                        Top Losers
                      </p>
                      <div className="space-y-1.5">
                        {[...assetsWithReturns].filter(a => a.returnPercent < 0).sort((a, b) => a.returnPercent - b.returnPercent).slice(0, 3).map((item, index) => (
                          <div key={item.asset.id} className="flex items-center justify-between py-1.5 px-2.5 bg-[#DC2626]/5 rounded-lg border border-[#DC2626]/10">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[10px] font-bold text-[#DC2626] w-4">{index + 1}</span>
                              <p className="text-[12px] font-medium text-[var(--label-primary)] truncate">{item.asset.name}</p>
                            </div>
                            <p className="text-[12px] font-bold text-[#DC2626] tabular-nums shrink-0 ml-2">
                              {item.returnPercent.toFixed(1)}%
                            </p>
                          </div>
                        ))}
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
                  <div className="grid grid-cols-3 gap-1.5 mb-4" style={{ minHeight: '140px' }}>
                    {assetTypeBreakdown.slice(0, 6).map((item, index) => {
                      // Calculate grid span based on percentage
                      const isLarge = item.percent >= 30;
                      const isMedium = item.percent >= 15 && item.percent < 30;
                      return (
                        <motion.div
                          key={item.type}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.4, delay: index * 0.08 }}
                          className={`relative rounded-xl p-2.5 flex flex-col justify-between cursor-pointer group overflow-hidden ${
                            isLarge ? 'col-span-2 row-span-2' : isMedium ? 'col-span-1 row-span-2' : 'col-span-1 row-span-1'
                          }`}
                          style={{
                            backgroundColor: item.color,
                            minHeight: isLarge ? '100px' : isMedium ? '80px' : '50px'
                          }}
                        >
                          {/* Gradient overlay for depth */}
                          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />

                          {/* Content */}
                          <div className="relative z-10">
                            <p className={`font-bold text-white tabular-nums ${isLarge ? 'text-[20px]' : isMedium ? 'text-[16px]' : 'text-[14px]'}`}>
                              {item.percent.toFixed(0)}%
                            </p>
                          </div>
                          <div className="relative z-10">
                            <p className={`font-medium text-white/90 truncate ${isLarge ? 'text-[12px]' : 'text-[10px]'}`}>
                              {item.label}
                            </p>
                            {(isLarge || isMedium) && (
                              <p className="text-[9px] text-white/70 tabular-nums">{formatCompact(item.value)}</p>
                            )}
                          </div>

                          {/* Hover tooltip */}
                          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="bg-black/80 text-white text-[9px] px-1.5 py-0.5 rounded-md">
                              {formatCompact(item.value)}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Legend for smaller items */}
                  {assetTypeBreakdown.length > 6 && (
                    <div className="pt-3 border-t border-[var(--separator-opaque)]">
                      <p className="text-[10px] text-[var(--label-tertiary)] mb-2">Other Types</p>
                      <div className="flex flex-wrap gap-2">
                        {assetTypeBreakdown.slice(6).map((item) => (
                          <div key={item.type} className="flex items-center gap-1.5 px-2 py-1 bg-[var(--fill-quaternary)] rounded-md">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="text-[10px] text-[var(--label-secondary)]">{item.label}</span>
                            <span className="text-[10px] font-medium text-[var(--label-primary)] tabular-nums">{item.percent.toFixed(0)}%</span>
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
                  <div className="p-4 bg-[var(--fill-quaternary)] rounded-xl mb-4">
                    <p className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide mb-1">Total Interest Earned</p>
                    <p className="text-[24px] font-bold text-[#10B981] tabular-nums">{formatCurrency(interestIncome)}</p>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between py-2 px-3 bg-[var(--fill-quaternary)] rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#059669]" />
                        <span className="text-[12px] text-[var(--label-secondary)]">Tax-Exempt (PPF, EPF, SSY)</span>
                      </div>
                      <span className="text-[13px] font-semibold text-[#059669] tabular-nums">{formatCurrency(taxExemptIncome)}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 px-3 bg-[var(--fill-quaternary)] rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[var(--system-gray)]" />
                        <span className="text-[12px] text-[var(--label-secondary)]">Taxable (FD, RD, etc.)</span>
                      </div>
                      <span className="text-[13px] font-semibold text-[var(--label-primary)] tabular-nums">{formatCurrency(taxableIncome)}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-4 text-center">
                  <p className="text-[13px] text-[var(--label-tertiary)]">No interest income data</p>
                  <p className="text-[11px] text-[var(--label-quaternary)] mt-1">Add fixed income assets to track</p>
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
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="p-3 bg-[var(--fill-quaternary)] rounded-xl">
                      <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wide mb-1">LTCG (1Y+)</p>
                      <p className="text-[16px] font-bold text-[var(--label-primary)] tabular-nums">{formatCompact(ltcgGain)}</p>
                      <p className="text-[10px] text-[var(--label-tertiary)]">{ltcgAssets.length} assets</p>
                    </div>
                    <div className="p-3 bg-[var(--fill-quaternary)] rounded-xl">
                      <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wide mb-1">STCG (&lt;1Y)</p>
                      <p className="text-[16px] font-bold text-[var(--label-primary)] tabular-nums">{formatCompact(stcgGain)}</p>
                      <p className="text-[10px] text-[var(--label-tertiary)]">{stcgAssets.length} assets</p>
                    </div>
                  </div>
                  <div className="p-3 bg-[#EF4444]/5 border border-[#EF4444]/20 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[12px] text-[var(--label-secondary)]">Estimated Tax Liability</span>
                      <span className="text-[15px] font-bold text-[#EF4444] tabular-nums">{formatCurrency(ltcgTax + stcgTax)}</span>
                    </div>
                    <div className="space-y-1 text-[10px] text-[var(--label-tertiary)]">
                      <div className="flex justify-between">
                        <span>LTCG @ 12.5% (above ₹1.25L)</span>
                        <span className="tabular-nums">{formatCurrency(ltcgTax)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>STCG @ 20%</span>
                        <span className="tabular-nums">{formatCurrency(stcgTax)}</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-[var(--label-quaternary)] mt-3 text-center">
                    *Unrealized gains. Tax applies only on sale.
                  </p>
                </>
              ) : (
                <div className="py-4 text-center">
                  <p className="text-[13px] text-[var(--label-tertiary)]">No equity assets found</p>
                  <p className="text-[11px] text-[var(--label-quaternary)] mt-1">Add stocks/MFs to see tax impact</p>
                </div>
              )}
            </div>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}
