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
          const principal = asset.principal_amount || asset.invested_value || 0;
          const rate = asset.interest_rate || 0;
          const compounding = getCompoundingFrequency(asset.compounding_frequency);

          const result = calculateFixedIncomeValue(
            principal,
            rate,
            startDate,
            maturityDate,
            compounding
          );
          calcs[asset.id] = result;
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
    if (asset.category === 'FIXED_INCOME' && fixedIncomeCalcs[asset.id]) {
      return fixedIncomeCalcs[asset.id].currentValue;
    }
    if (asset.category === 'EQUITY' && asset.quantity && asset.symbol) {
      const priceKey = asset.asset_type === 'MUTUAL_FUND' ? asset.symbol : `${asset.symbol}.${asset.exchange === 'BSE' ? 'BO' : 'NS'}`;
      const priceData = prices[priceKey];
      if (priceData?.price) {
        return asset.quantity * priceData.price;
      }
      if (asset.avg_buy_price) {
        return asset.quantity * asset.avg_buy_price;
      }
    }
    return asset.current_value || asset.invested_value || 0;
  };

  const getInvestedValue = (asset) => {
    if (asset.category === 'FIXED_INCOME') {
      return asset.principal_amount || asset.invested_value || 0;
    }
    return asset.invested_value || 0;
  };

  // Calculate totals
  const totalCurrentValue = assets.reduce((sum, a) => sum + getAssetValue(a), 0);
  const totalInvested = assets.reduce((sum, a) => sum + getInvestedValue(a), 0);
  const totalGain = totalCurrentValue - totalInvested;
  const totalGainPercent = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

  // Visual group config
  const visualGroupConfig = {
    'EQUITY': { color: categoryColors.EQUITY?.color || 'var(--chart-primary)', label: 'Stocks & Funds' },
    'FIXED_INCOME': { color: categoryColors.FIXED_INCOME?.color || 'var(--system-green)', label: 'Fixed Income' },
    'REAL_ESTATE': { color: categoryColors.REAL_ESTATE?.color || 'var(--system-orange)', label: 'Real Estate' },
    'PHYSICAL_ASSETS': { color: categoryColors.PHYSICAL_ASSETS?.color || 'var(--system-amber)', label: 'Physical Assets' },
    'SAVINGS': { color: categoryColors.SAVINGS?.color || 'var(--system-teal)', label: 'Savings' },
    'CRYPTO': { color: categoryColors.CRYPTO?.color || 'var(--system-purple)', label: 'Crypto' },
    'INSURANCE': { color: categoryColors.INSURANCE?.color || 'var(--system-pink)', label: 'Insurance' },
    'OTHER': { color: categoryColors.OTHER?.color || 'var(--system-gray)', label: 'Other' },
  };

  // ===== INSIGHT CALCULATIONS =====

  // Assets with return calculations
  const assetsWithReturns = assets.map(asset => {
    const currentValue = getAssetValue(asset);
    const investedValue = getInvestedValue(asset);
    const returnAmount = currentValue - investedValue;
    const returnPercent = investedValue > 0 ? (returnAmount / investedValue) * 100 : 0;
    return { asset, currentValue, investedValue, returnAmount, returnPercent };
  }).filter(a => a.investedValue > 0);

  // Sorted by value for concentration analysis
  const sortedByValue = [...assetsWithReturns].sort((a, b) => b.currentValue - a.currentValue);

  // Best & Worst performers
  const sortedByReturn = [...assetsWithReturns].sort((a, b) => b.returnPercent - a.returnPercent);
  const bestPerformer = sortedByReturn[0];
  const worstPerformer = sortedByReturn[sortedByReturn.length - 1];

  // Profit/Loss stats
  const assetsInProfit = assetsWithReturns.filter(a => a.returnPercent > 0).length;
  const assetsInLoss = assetsWithReturns.filter(a => a.returnPercent < 0).length;
  const profitRatio = assetsWithReturns.length > 0 ? (assetsInProfit / assetsWithReturns.length) * 100 : 0;

  // Largest holding
  const largestHolding = sortedByValue[0];
  const getPortfolioWeight = (asset) => {
    const value = getAssetValue(asset);
    return totalCurrentValue > 0 ? (value / totalCurrentValue) * 100 : 0;
  };

  // Category allocation
  const categoryAllocation = Object.entries(
    assets.reduce((acc, asset) => {
      const category = asset.category;
      acc[category] = (acc[category] || 0) + getAssetValue(asset);
      return acc;
    }, {})
  ).map(([key, value]) => ({
    key,
    label: visualGroupConfig[key]?.label || ASSET_CONFIG[key]?.label || key,
    value,
    color: visualGroupConfig[key]?.color || 'var(--system-gray)',
    percent: totalCurrentValue > 0 ? (value / totalCurrentValue) * 100 : 0,
  })).sort((a, b) => b.value - a.value);

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
        {/* Portfolio Insights Card */}
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
                  <h3 className="text-[14px] font-semibold text-[var(--label-primary)]">Performance Overview</h3>
                  <p className="text-[11px] text-[var(--label-tertiary)]">Winners & losers</p>
                </div>
              </div>
            </div>
            <div className="p-4 space-y-4">
              {bestPerformer && (
                <div>
                  <p className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide mb-1.5">Best Performer</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-[var(--label-primary)] truncate">{bestPerformer.asset.name}</span>
                    <span className={`text-[12px] font-semibold tabular-nums shrink-0 ${bestPerformer.returnPercent >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                      {bestPerformer.returnPercent >= 0 ? '+' : ''}{bestPerformer.returnPercent.toFixed(1)}%
                    </span>
                  </div>
                </div>
              )}
              {worstPerformer && worstPerformer.returnPercent < 0 && (
                <div>
                  <p className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide mb-1.5">Needs Attention</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-[var(--label-primary)] truncate">{worstPerformer.asset.name}</span>
                    <span className="text-[12px] font-semibold text-[#DC2626] tabular-nums shrink-0">
                      {worstPerformer.returnPercent.toFixed(1)}%
                    </span>
                  </div>
                </div>
              )}
              {assetsWithReturns.length > 0 && (
                <div className="pt-3 border-t border-[var(--separator-opaque)]">
                  <p className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide mb-2">Profit / Loss</p>
                  <div className="h-2 rounded-full overflow-hidden flex bg-[var(--fill-tertiary)] mb-2">
                    {assetsInProfit > 0 && (
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${profitRatio}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                        className="h-full bg-[#059669]"
                      />
                    )}
                    {assetsInLoss > 0 && (
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${100 - profitRatio}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }}
                        className="h-full bg-[#DC2626]"
                      />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#059669] font-medium">{assetsInProfit} winning</span>
                    <span className="text-[var(--label-quaternary)]">{Math.round(profitRatio)}% success</span>
                    <span className="text-[#DC2626] font-medium">{assetsInLoss} losing</span>
                  </div>
                </div>
              )}
              {largestHolding && (
                <div className="pt-3 border-t border-[var(--separator-opaque)]">
                  <p className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide mb-1.5">Largest Holding</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-[var(--label-primary)] truncate">{largestHolding.asset.name}</span>
                    <span className="text-[12px] font-semibold text-[var(--label-primary)] tabular-nums shrink-0">
                      {formatCompact(largestHolding.currentValue)}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--label-tertiary)] mt-0.5">
                    {getPortfolioWeight(largestHolding.asset).toFixed(1)}% of portfolio
                  </p>
                </div>
              )}
              {assetsWithReturns.length === 0 && (
                <div className="py-4 text-center">
                  <p className="text-[13px] text-[var(--label-tertiary)]">Add assets to see insights</p>
                </div>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Allocation Card */}
        <motion.div variants={staggerItem}>
          <Card padding="p-0" className="overflow-hidden h-full">
            <div className="px-4 py-3.5 bg-gradient-to-r from-[var(--system-green)]/10 via-[var(--system-green)]/5 to-transparent border-b border-[var(--separator-opaque)] rounded-t-2xl">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[var(--system-green)] flex items-center justify-center shadow-sm">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--label-primary)]">Allocation</h3>
                  <p className="text-[11px] text-[var(--label-tertiary)]">By category</p>
                </div>
              </div>
            </div>
            <div className="p-4">
              {categoryAllocation.length > 0 ? (
                <>
                  <div className="space-y-4">
                    {categoryAllocation.map((cat, index) => (
                      <div key={cat.key}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: cat.color }}
                            />
                            <span className="text-[13px] font-medium text-[var(--label-primary)]">{cat.label}</span>
                          </div>
                          <span className="text-[13px] font-semibold text-[var(--label-primary)] tabular-nums">
                            {formatCompact(cat.value)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full overflow-hidden bg-[var(--fill-tertiary)]">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${cat.percent}%` }}
                              transition={{ duration: 0.6, delay: index * 0.08, ease: [0.4, 0, 0.2, 1] }}
                              style={{ backgroundColor: cat.color }}
                              className="h-full rounded-full"
                            />
                          </div>
                          <span className="text-[12px] font-medium text-[var(--label-tertiary)] tabular-nums w-10 text-right">
                            {cat.percent.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-3 border-t border-[var(--separator-opaque)]">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-medium text-[var(--label-tertiary)] uppercase tracking-wide">Total Portfolio</span>
                      <span className="text-[15px] font-bold text-[var(--label-primary)] tabular-nums">{formatCompact(totalCurrentValue)}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-4 text-center">
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
                  <p className="text-[11px] text-[var(--label-tertiary)]">
                    {beatsBenchmark ? 'Beating market' : 'Below market'} returns
                  </p>
                </div>
              </div>
            </div>
            <div className="p-4">
              {assets.length > 0 ? (
                <div className="space-y-3">
                  {benchmarks.map((b, index) => {
                    const maxReturn = Math.max(...benchmarks.map(x => Math.abs(x.value)), 1);
                    const barWidth = Math.abs(b.value) / maxReturn * 100;
                    const isNegative = b.value < 0;

                    return (
                      <div key={b.name}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[12px] ${b.isPortfolio ? 'font-semibold text-[var(--label-primary)]' : 'text-[var(--label-secondary)]'}`}>
                            {b.name}
                          </span>
                          <span className={`text-[13px] font-semibold tabular-nums ${
                            b.value >= 0 ? 'text-[var(--system-green)]' : 'text-[var(--system-red)]'
                          }`}>
                            {b.value >= 0 ? '+' : ''}{b.value.toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden bg-[var(--fill-tertiary)]">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${barWidth}%` }}
                            transition={{ duration: 0.6, delay: index * 0.1, ease: [0.4, 0, 0.2, 1] }}
                            className="h-full rounded-full"
                            style={{
                              backgroundColor: b.isPortfolio
                                ? (isNegative ? 'var(--system-red)' : 'var(--chart-primary)')
                                : 'var(--system-gray-3)',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-4 text-center">
                  <p className="text-[13px] text-[var(--label-tertiary)]">Add assets to compare</p>
                </div>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Category Exposure Card */}
        <motion.div variants={staggerItem}>
          <Card padding="p-0" className="overflow-hidden h-full">
            <div className="px-4 py-3.5 bg-gradient-to-r from-[var(--system-teal)]/10 via-[var(--system-teal)]/5 to-transparent border-b border-[var(--separator-opaque)] rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[var(--system-teal)] flex items-center justify-center shadow-sm">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--label-primary)]">Category Exposure</h3>
                  <p className="text-[11px] text-[var(--label-tertiary)]">
                    {isOverexposed ? `High ${highestExposure?.name || ''} exposure` : 'Balanced allocation'}
                  </p>
                </div>
              </div>
            </div>
            <div className="p-4">
              {categoryExposure.length > 0 ? (
                <div className="space-y-3">
                  {categoryExposure.slice(0, 5).map((cat, index) => (
                    <div key={cat.name}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                          <span className="text-[12px] text-[var(--label-secondary)]">{cat.name}</span>
                        </div>
                        <span className="text-[13px] font-semibold text-[var(--label-primary)] tabular-nums">
                          {cat.percent.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden bg-[var(--fill-tertiary)]">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${cat.percent}%` }}
                          transition={{ duration: 0.6, delay: index * 0.08, ease: [0.4, 0, 0.2, 1] }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center">
                  <p className="text-[13px] text-[var(--label-tertiary)]">No exposure data</p>
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
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[12px] text-[var(--label-secondary)]">Liquid vs Locked Assets</span>
                    </div>
                    <div className="h-3 rounded-full overflow-hidden bg-[var(--fill-tertiary)] flex">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${liquidPercent}%` }}
                        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                        className="h-full bg-[var(--system-blue)]"
                      />
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${lockedPercent}%` }}
                        transition={{ duration: 0.6, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
                        className="h-full bg-[var(--system-gray-3)]"
                      />
                    </div>
                    <div className="flex justify-between mt-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-[var(--system-blue)]" />
                        <span className="text-[11px] text-[var(--label-tertiary)]">Liquid {liquidPercent.toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-[var(--system-gray-3)]" />
                        <span className="text-[11px] text-[var(--label-tertiary)]">Locked {lockedPercent.toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 bg-[var(--fill-quaternary)] rounded-xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide">Emergency Coverage</p>
                        <p className={`text-[20px] font-bold tabular-nums ${
                          emergencyMonths >= 6 ? 'text-[var(--system-green)]' :
                          emergencyMonths >= 3 ? 'text-[var(--system-orange)]' :
                          'text-[var(--system-red)]'
                        }`}>
                          {emergencyMonths.toFixed(1)} months
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-[var(--label-tertiary)]">Liquid Value</p>
                        <p className="text-[14px] font-semibold text-[var(--label-primary)] tabular-nums">{formatCompact(liquidValue)}</p>
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
      </motion.div>
    </div>
  );
}
