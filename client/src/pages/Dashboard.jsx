import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { assetService, priceService, ASSET_CONFIG } from '../services/assets';
import { portfolioService } from '../services/portfolio';
import { Card, Button, DashboardSkeleton, AnimatedNumber } from '../components/apple';
import { spring, staggerContainer, staggerItem } from '../utils/animations';
import { categoryColors } from '../constants/theme';
import { formatCurrency, formatCompact, formatPercent, formatPrice } from '../utils/formatting';
import { calculateFixedIncomeValue, getCompoundingFrequency, calculateXIRRFromTransactions, yearsBetweenDates, calculateCAGR, debugXIRR } from '../utils/interest';
import { printPortfolioReport } from '../utils/export';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user } = useAuth();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [prices, setPrices] = useState({});
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [cumulativeData, setCumulativeData] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('ALL');
  const [investmentSummary, setInvestmentSummary] = useState(null);
  const [fixedIncomeCalcs, setFixedIncomeCalcs] = useState({}); // Store calculated values for Fixed Income assets
  const [portfolioXIRR, setPortfolioXIRR] = useState(null);
  const [allTransactions, setAllTransactions] = useState([]);
  const [xirrDebugInfo, setXirrDebugInfo] = useState(null);
  const [showXirrDebug, setShowXirrDebug] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedPeriod) {
      fetchCumulativeInvestments(selectedPeriod);
    }
  }, [selectedPeriod]);

  const fetchData = async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true);
    try {
      const assetsRes = await assetService.getAll();
      const assetList = assetsRes.data.assets;
      setAssets(assetList);

      const equityAssets = assetList.filter(a => a.category === 'EQUITY' && a.symbol);
      let priceData = {};
      if (equityAssets.length > 0) {
        const symbols = equityAssets.map(a => ({
          symbol: a.asset_type === 'MUTUAL_FUND' ? a.symbol : `${a.symbol}.${a.exchange === 'BSE' ? 'BO' : 'NS'}`,
          type: a.asset_type === 'MUTUAL_FUND' ? 'mf' : 'stock'
        }));

        // Clear cache first if force refresh
        if (forceRefresh) {
          await priceService.clearCache();
        }

        // Fetch prices (forceRefresh bypasses any remaining cache)
        const priceRes = await priceService.getBulkPrices(symbols, forceRefresh);
        priceData = priceRes.data.prices || {};
        setPrices(priceData);
        setLastUpdated(new Date());

        // Calculate portfolio XIRR
        calculatePortfolioXIRR(assetList, priceData);
      }

      // Fetch transactions for Fixed Income assets to calculate accurate interest
      const fixedIncomeAssets = assetList.filter(a => a.category === 'FIXED_INCOME' && a.interest_rate);
      if (fixedIncomeAssets.length > 0) {
        fetchFixedIncomeCalculations(fixedIncomeAssets);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchFixedIncomeCalculations = async (fixedIncomeAssets) => {
    try {
      const calcs = {};
      for (const asset of fixedIncomeAssets) {
        const txnResponse = await assetService.getTransactions(asset.id);
        const transactions = txnResponse.data.transactions || [];
        if (transactions.length > 0) {
          const compoundingFreq = getCompoundingFrequency(asset.asset_type);
          const calculation = calculateFixedIncomeValue(transactions, asset.interest_rate, new Date(), compoundingFreq);
          calcs[asset.id] = calculation;
        }
      }
      setFixedIncomeCalcs(calcs);
    } catch (error) {
      console.error('Error fetching Fixed Income calculations:', error);
    }
  };

  const calculatePortfolioXIRR = async (assetList, priceData) => {
    try {
      // Fetch transactions for equity assets to calculate XIRR
      const equityAssets = assetList.filter(a => a.category === 'EQUITY');
      if (equityAssets.length === 0) {
        setPortfolioXIRR(null);
        return;
      }

      // Collect all transactions from all equity assets
      const allTxns = [];
      for (const asset of equityAssets) {
        const txnResponse = await assetService.getTransactions(asset.id);
        const transactions = txnResponse.data.transactions || [];
        allTxns.push(...transactions);
      }

      if (allTxns.length === 0) {
        setPortfolioXIRR(null);
        return;
      }

      setAllTransactions(allTxns);

      // Calculate current portfolio value for equity
      let totalCurrentValue = 0;
      for (const asset of equityAssets) {
        if (asset.quantity && asset.symbol) {
          const priceKey = asset.asset_type === 'MUTUAL_FUND' ? asset.symbol : `${asset.symbol}.${asset.exchange === 'BSE' ? 'BO' : 'NS'}`;
          const price = priceData[priceKey]?.price || asset.avg_buy_price || 0;
          totalCurrentValue += asset.quantity * price;
        }
      }

      // Calculate XIRR and store debug info
      const xirr = calculateXIRRFromTransactions(allTxns, totalCurrentValue);
      setPortfolioXIRR(isFinite(xirr) ? xirr : null);

      // Store debug info for XIRR breakdown
      const debug = debugXIRR(allTxns, totalCurrentValue);
      setXirrDebugInfo(debug);
    } catch (error) {
      console.error('Error calculating portfolio XIRR:', error);
      setPortfolioXIRR(null);
      setXirrDebugInfo(null);
    }
  };

  const handleRefresh = () => {
    fetchData(true);
  };

  const handleExportPDF = () => {
    // Prepare assets with calculated values for export
    const assetsWithValues = assets.map(asset => {
      let currentValue = 0;
      let invested = 0;

      if (asset.category === 'EQUITY') {
        const priceKey = asset.asset_type === 'MUTUAL_FUND'
          ? asset.symbol
          : `${asset.symbol}.${asset.exchange === 'BSE' ? 'BO' : 'NS'}`;
        const price = prices[priceKey]?.price || asset.avg_buy_price || 0;
        currentValue = (asset.quantity || 0) * price;
        invested = (asset.quantity || 0) * (asset.avg_buy_price || 0);
      } else if (asset.category === 'FIXED_INCOME') {
        const calc = fixedIncomeCalcs[asset.id];
        currentValue = calc?.currentValue || asset.principal || 0;
        invested = calc?.principal || asset.principal || 0;
      } else {
        currentValue = asset.current_value || asset.balance || 0;
        invested = asset.purchase_price || asset.principal || asset.balance || 0;
      }

      return {
        ...asset,
        currentValue,
        invested,
        pnl: currentValue - invested,
      };
    });

    printPortfolioReport({
      user,
      totalValue,
      totalInvested,
      totalPnL,
      totalPnLPercent,
      categoryBreakdown,
      assets: assetsWithValues,
      generatedAt: new Date(),
    });
  };

  const getTimeAgo = (date) => {
    if (!date) return null;
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  const fetchCumulativeInvestments = async (period) => {
    try {
      const response = await portfolioService.getCumulativeInvestments(period);
      setCumulativeData(response.data.data || []);
      setInvestmentSummary(response.data.summary || null);
    } catch (error) {
      console.error('Error fetching cumulative investments:', error);
    }
  };

  const recordSnapshot = async (totalValue, totalInvested, dayChange) => {
    try {
      await portfolioService.recordSnapshot({ totalValue, totalInvested, dayChange });
      // Refresh history after recording
      fetchPortfolioHistory(selectedPeriod);
    } catch (error) {
      console.error('Error recording snapshot:', error);
    }
  };


  const getAssetValue = (asset) => {
    if (asset.category === 'EQUITY' && asset.quantity && asset.symbol) {
      const priceKey = asset.asset_type === 'MUTUAL_FUND' ? asset.symbol : `${asset.symbol}.${asset.exchange === 'BSE' ? 'BO' : 'NS'}`;
      const priceData = prices[priceKey];
      if (priceData?.price) return asset.quantity * priceData.price;
      if (asset.avg_buy_price) return asset.quantity * asset.avg_buy_price;
    }
    // For Fixed Income, use transaction-based calculation if available
    if (asset.category === 'FIXED_INCOME') {
      const calc = fixedIncomeCalcs[asset.id];
      if (calc) return calc.currentValue;
      // Fallback to principal if no transactions fetched yet
      if (asset.principal) return asset.principal;
    }
    if (asset.quantity && asset.avg_buy_price) return asset.quantity * asset.avg_buy_price;
    if (asset.principal) return asset.principal;
    if (asset.current_value) return asset.current_value;
    if (asset.purchase_price) return asset.purchase_price;
    if (asset.balance) return asset.balance;
    return 0;
  };

  const getInvestedValue = (asset) => {
    if (asset.quantity && asset.avg_buy_price) return asset.quantity * asset.avg_buy_price;
    // For Fixed Income, use calculated principal from transactions
    if (asset.category === 'FIXED_INCOME') {
      const calc = fixedIncomeCalcs[asset.id];
      if (calc) return calc.principal;
    }
    if (asset.principal) return asset.principal;
    if (asset.purchase_price) return asset.purchase_price;
    if (asset.balance) return asset.balance;
    return 0;
  };

  const getCurrentPrice = (asset) => {
    if (asset.category === 'EQUITY' && asset.symbol) {
      const priceKey = asset.asset_type === 'MUTUAL_FUND' ? asset.symbol : `${asset.symbol}.${asset.exchange === 'BSE' ? 'BO' : 'NS'}`;
      return prices[priceKey]?.price || asset.avg_buy_price || 0;
    }
    return asset.avg_buy_price || 0;
  };

  const getPriceChange = (asset) => {
    if (asset.category === 'EQUITY' && asset.symbol) {
      const priceKey = asset.asset_type === 'MUTUAL_FUND' ? asset.symbol : `${asset.symbol}.${asset.exchange === 'BSE' ? 'BO' : 'NS'}`;
      return prices[priceKey]?.changePercent || 0;
    }
    return 0;
  };

  // Calculate totals
  const totalValue = assets.reduce((sum, asset) => sum + getAssetValue(asset), 0);
  const totalInvested = assets.reduce((sum, asset) => sum + getInvestedValue(asset), 0);
  const totalPnL = totalValue - totalInvested;
  const totalPnLPercent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

  // Day's change (estimated from equity assets)
  const dayChange = assets
    .filter(a => a.category === 'EQUITY')
    .reduce((sum, asset) => {
      const value = getAssetValue(asset);
      const changePercent = getPriceChange(asset);
      return sum + (value * changePercent / 100);
    }, 0);
  const dayChangePercent = totalValue > 0 ? (dayChange / (totalValue - dayChange)) * 100 : 0;

  // Holdings sorted by value
  const holdings = [...assets]
    .map(asset => ({
      ...asset,
      currentValue: getAssetValue(asset),
      investedValue: getInvestedValue(asset),
      currentPrice: getCurrentPrice(asset),
      pnl: getAssetValue(asset) - getInvestedValue(asset),
      pnlPercent: getInvestedValue(asset) > 0
        ? ((getAssetValue(asset) - getInvestedValue(asset)) / getInvestedValue(asset)) * 100
        : 0,
      dayChange: getPriceChange(asset),
    }))
    .sort((a, b) => b.currentValue - a.currentValue);

  // Category breakdown for pie chart (split EQUITY into Stocks and MF visually)
  const categoryBreakdown = Object.entries(
    assets.reduce((acc, asset) => {
      const value = getAssetValue(asset);
      // For EQUITY, split by asset_type
      let groupKey = asset.category;
      if (asset.category === 'EQUITY') {
        groupKey = asset.asset_type === 'MUTUAL_FUND' ? 'EQUITY_MF' : 'EQUITY_STOCKS';
      }
      acc[groupKey] = (acc[groupKey] || 0) + value;
      return acc;
    }, {})
  ).map(([groupKey, value]) => {
    const groupConfig = {
      EQUITY_STOCKS: { name: 'Equity Stocks', color: 'var(--system-blue)' },
      EQUITY_MF: { name: 'Equity Mutual Funds', color: 'var(--system-purple)' },
    };
    return {
      name: groupConfig[groupKey]?.name || ASSET_CONFIG[groupKey]?.label || groupKey,
      value,
      color: groupConfig[groupKey]?.color || categoryColors[groupKey]?.color || 'var(--system-gray)',
      percent: totalValue > 0 ? (value / totalValue) * 100 : 0,
    };
  }).sort((a, b) => b.value - a.value);

  // Category summary for holdings table (split EQUITY into Stocks and Mutual Funds visually)
  const categorySummary = Object.entries(
    assets.reduce((acc, asset) => {
      // For EQUITY category, split by asset_type (STOCK vs MUTUAL_FUND)
      let groupKey = asset.category;
      if (asset.category === 'EQUITY') {
        groupKey = asset.asset_type === 'MUTUAL_FUND' ? 'EQUITY_MF' : 'EQUITY_STOCKS';
      }

      if (!acc[groupKey]) {
        acc[groupKey] = {
          category: groupKey,
          assets: [],
          current: 0,
          invested: 0,
          dayChange: 0,
        };
      }
      const currentValue = getAssetValue(asset);
      const investedValue = getInvestedValue(asset);
      acc[groupKey].assets.push(asset);
      acc[groupKey].current += currentValue;
      acc[groupKey].invested += investedValue;
      // Day change for equity assets
      if (asset.category === 'EQUITY') {
        const changePercent = getPriceChange(asset);
        acc[groupKey].dayChange += (currentValue * changePercent / 100);
      }
      return acc;
    }, {})
  ).map(([groupKey, data]) => {
    // Labels and colors for visual groups
    const groupConfig = {
      EQUITY_STOCKS: { label: 'Equity Stocks', color: 'var(--system-blue)' },
      EQUITY_MF: { label: 'Equity Mutual Funds', color: 'var(--system-purple)' },
      REAL_ESTATE: { label: 'Real Estate', color: categoryColors.REAL_ESTATE?.color },
      FIXED_INCOME: { label: 'Fixed Income', color: categoryColors.FIXED_INCOME?.color },
      PHYSICAL: { label: 'Physical Assets', color: categoryColors.PHYSICAL?.color },
      SAVINGS: { label: 'Savings', color: categoryColors.SAVINGS?.color },
      CRYPTO: { label: 'Cryptocurrency', color: categoryColors.CRYPTO?.color },
      INSURANCE: { label: 'Insurance', color: categoryColors.INSURANCE?.color },
      OTHER: { label: 'Other', color: categoryColors.OTHER?.color },
    };

    return {
      category: groupKey,
      label: groupConfig[groupKey]?.label || ASSET_CONFIG[groupKey]?.label || groupKey,
      color: groupConfig[groupKey]?.color || 'var(--system-gray)',
      assetCount: data.assets.length,
      current: data.current,
      invested: data.invested,
      pnl: data.current - data.invested,
      pnlPercent: data.invested > 0 ? ((data.current - data.invested) / data.invested) * 100 : 0,
      dayChange: data.dayChange,
      dayChangePercent: data.current > 0 ? (data.dayChange / (data.current - data.dayChange)) * 100 : 0,
    };
  }).sort((a, b) => b.current - a.current);

  // Record snapshot when data is loaded (even if ₹0 to track deletions)
  useEffect(() => {
    if (!loading) {
      recordSnapshot(totalValue, totalInvested, dayChange);
    }
  }, [loading, totalValue, totalInvested]);

  // Format chart data for cumulative investment line chart
  const chartData = cumulativeData.map((item) => {
    const dateObj = new Date(item.date);
    const monthLabel = dateObj.toLocaleString('en-IN', { month: 'short' });
    const yearLabel = dateObj.getFullYear().toString().slice(-2);

    return {
      date: item.date,
      displayDate: `${monthLabel} '${yearLabel}`,
      cumulative: item.cumulative,
    };
  });

  const periods = ['1W', '1M', '3M', '6M', '1Y', 'ALL'];

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)]">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <DashboardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="space-y-4"
        >
          {/* Portfolio Header with Last Updated */}
          <motion.div variants={staggerItem} className="flex items-center justify-between">
            <div>
              <h1 className="text-[28px] font-semibold text-[var(--label-primary)]">Dashboard</h1>
              <div className="flex items-center gap-2 mt-0.5">
                {lastUpdated ? (
                  <>
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--system-green)] animate-pulse" />
                    <span className="text-[13px] text-[var(--label-tertiary)]">
                      Updated {getTimeAgo(lastUpdated)}
                    </span>
                  </>
                ) : (
                  <span className="text-[13px] text-[var(--label-tertiary)]">Loading prices...</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Export Button */}
              <button
                onClick={handleExportPDF}
                disabled={assets.length === 0}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--fill-tertiary)] hover:bg-[var(--fill-secondary)] text-[var(--label-secondary)] transition-colors disabled:opacity-50"
                title="Export Report"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <span className="text-[14px] font-medium hidden sm:inline">Export</span>
              </button>

              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--fill-tertiary)] hover:bg-[var(--fill-secondary)] text-[var(--label-secondary)] transition-colors disabled:opacity-50"
              >
                <svg
                  className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                <span className="text-[14px] font-medium hidden sm:inline">
                  {refreshing ? 'Refreshing...' : 'Refresh'}
                </span>
              </button>
            </div>
          </motion.div>

          {/* KPI Cards Row */}
          <motion.div variants={staggerItem} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Current Value */}
            <Card padding="p-4" className="col-span-2 lg:col-span-1">
              <p className="text-[12px] font-medium text-[var(--label-tertiary)] uppercase tracking-wide mb-1">Current Value</p>
              <p className="text-[28px] font-semibold text-[var(--label-primary)] tracking-tight leading-none">
                {formatCompact(totalValue)}
              </p>
            </Card>

            {/* Invested */}
            <Card padding="p-4">
              <p className="text-[12px] font-medium text-[var(--label-tertiary)] uppercase tracking-wide mb-1">Invested</p>
              <p className="text-[20px] font-semibold text-[var(--label-primary)] tracking-tight leading-none">
                {formatCompact(totalInvested)}
              </p>
            </Card>

            {/* Total Returns */}
            <Card padding="p-4">
              <p className="text-[12px] font-medium text-[var(--label-tertiary)] uppercase tracking-wide mb-1">Total Returns</p>
              <p className={`text-[20px] font-semibold tracking-tight leading-none ${totalPnL >= 0 ? 'text-[var(--system-green)]' : 'text-[var(--system-amber)]'}`}>
                {totalPnL >= 0 ? '+' : ''}{formatCompact(totalPnL)}
              </p>
              <p className={`text-[12px] font-medium mt-0.5 ${totalPnL >= 0 ? 'text-[var(--system-green)]' : 'text-[var(--system-amber)]'}`}>
                {totalPnL >= 0 ? '+' : ''}{totalPnLPercent.toFixed(2)}%
              </p>
            </Card>

            {/* XIRR - Annualized Return */}
            <Card
              padding="p-4"
              className={portfolioXIRR !== null ? 'cursor-pointer hover:bg-[var(--fill-tertiary)]/30 transition-colors' : ''}
              onClick={() => portfolioXIRR !== null && setShowXirrDebug(true)}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <p className="text-[12px] font-medium text-[var(--label-tertiary)] uppercase tracking-wide">XIRR</p>
                <div className="group relative">
                  <svg className="w-3.5 h-3.5 text-[var(--label-quaternary)] cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                  </svg>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[var(--bg-primary)] shadow-lg rounded-lg text-[12px] text-[var(--label-secondary)] w-48 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-[var(--separator)]/30">
                    Annualized return considering actual investment dates and cash flows. Click to see breakdown.
                  </div>
                </div>
              </div>
              {portfolioXIRR !== null ? (
                <>
                  <p className={`text-[20px] font-semibold tracking-tight leading-none ${portfolioXIRR >= 0 ? 'text-[var(--system-blue)]' : 'text-[var(--system-amber)]'}`}>
                    {portfolioXIRR >= 0 ? '+' : ''}{portfolioXIRR.toFixed(2)}%
                  </p>
                  <p className="text-[11px] text-[var(--label-tertiary)] mt-0.5">p.a. (equity) · tap for details</p>
                </>
              ) : (
                <p className="text-[20px] font-semibold text-[var(--label-quaternary)]">—</p>
              )}
            </Card>

          </motion.div>

          {/* Portfolio Chart Section */}
          <motion.div variants={staggerItem}>
            <Card padding="p-0" className="overflow-hidden">
              <div className="p-5 pb-0">
                {/* Chart Header */}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-[17px] font-semibold text-[var(--label-primary)]">Investment Journey</h2>
                    <p className="text-[12px] text-[var(--label-tertiary)]">Cumulative amount invested over time</p>
                  </div>
                  {investmentSummary && investmentSummary.totalInvested > 0 && (
                    <div className="text-right">
                      <p className="text-[14px] font-semibold text-[var(--system-blue)]">{formatCompact(investmentSummary.totalInvested)}</p>
                      <p className="text-[11px] text-[var(--label-tertiary)]">total invested</p>
                    </div>
                  )}
                </div>
                {/* Period Selector */}
                {assets.length > 0 && (
                  <div className="flex gap-1 mb-2">
                    {periods.map((period) => (
                      <button
                        key={period}
                        onClick={() => setSelectedPeriod(period)}
                        className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                          selectedPeriod === period
                            ? 'bg-[var(--system-blue)] text-white'
                            : 'text-[var(--label-secondary)] hover:bg-[var(--fill-tertiary)]'
                        }`}
                      >
                        {period}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Area Chart - Cumulative Investments */}
              {chartData.length > 0 ? (
                <div className="h-[260px] mt-2 pr-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                      <defs>
                        <linearGradient id="cumulativeGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--system-blue)" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="var(--system-blue)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--separator)" opacity={0.3} vertical={false} />
                      <XAxis
                        dataKey="displayDate"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: 'var(--label-tertiary)' }}
                        dy={5}
                        interval={chartData.length > 12 ? Math.floor(chartData.length / 6) : 0}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: 'var(--label-tertiary)' }}
                        tickFormatter={(value) => {
                          if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
                          if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
                          if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
                          return `₹${value}`;
                        }}
                        width={55}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0) return null;
                          const data = payload[0]?.payload;
                          const cumulative = data?.cumulative || 0;
                          const rawDate = data?.date;

                          // Format the full date for tooltip
                          const dateLabel = rawDate
                            ? new Date(rawDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                            : '';

                          return (
                            <div style={{
                              background: 'var(--bg-primary)',
                              border: '1px solid var(--separator)',
                              borderRadius: '12px',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                              padding: '12px 16px',
                              minWidth: '140px'
                            }}>
                              <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--label-primary)', fontSize: 13 }}>{dateLabel}</div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--label-secondary)', fontSize: 12 }}>Total Invested</span>
                                <span style={{ fontWeight: 600, color: 'var(--system-blue)', fontSize: 13 }}>{formatCompact(cumulative)}</span>
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Area
                        type="stepAfter"
                        dataKey="cumulative"
                        stroke="var(--system-blue)"
                        strokeWidth={2}
                        fill="url(#cumulativeGradient)"
                        dot={false}
                        activeDot={{ r: 5, fill: 'var(--system-blue)' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[120px] flex flex-col items-center justify-center text-center mt-2">
                  <p className="text-[14px] text-[var(--label-tertiary)]">No investment data yet</p>
                  <p className="text-[12px] text-[var(--label-quaternary)] mt-1">Add assets with transactions to see your journey</p>
                </div>
              )}
            </Card>
          </motion.div>

          {/* Holdings & Allocation Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Holdings Table - Category Summary */}
            <motion.div variants={staggerItem} className="lg:col-span-2">
              <Card padding="p-0">
                <div className="flex items-center justify-between p-4 border-b border-[var(--separator)]/30">
                  <div>
                    <h2 className="text-[17px] font-semibold text-[var(--label-primary)]">Holdings</h2>
                    <p className="text-[13px] text-[var(--label-tertiary)]">{holdings.length} assets in {categoryBreakdown.length} categories</p>
                  </div>
                  <Link to="/assets" className="text-[15px] font-medium text-[var(--system-blue)]">
                    View Details
                  </Link>
                </div>

                {categoryBreakdown.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-[var(--fill-tertiary)]/50 text-[11px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider">
                          <th className="text-left px-4 py-2.5">Category</th>
                          <th className="text-right px-4 py-2.5 hidden sm:table-cell">Assets</th>
                          <th className="text-right px-4 py-2.5 hidden lg:table-cell">Invested</th>
                          <th className="text-right px-4 py-2.5">Current</th>
                          <th className="text-right px-4 py-2.5">P&L</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--separator)]/20">
                        {categorySummary.map((cat) => (
                          <Link
                            key={cat.category}
                            to="/assets"
                            className="contents"
                          >
                            <tr className="hover:bg-[var(--fill-tertiary)]/30 transition-colors cursor-pointer">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div
                                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                                    style={{ backgroundColor: cat.color }}
                                  >
                                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                      {cat.category === 'EQUITY_STOCKS' ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                                      ) : cat.category === 'EQUITY_MF' ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
                                      ) : cat.category === 'REAL_ESTATE' ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                                      ) : cat.category === 'FIXED_INCOME' ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      ) : (
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                      )}
                                    </svg>
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-[14px] font-medium text-[var(--label-primary)]">
                                      {cat.label}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="text-right px-4 py-3 hidden sm:table-cell">
                                <span className="text-[14px] text-[var(--label-secondary)]">
                                  {cat.assetCount}
                                </span>
                              </td>
                              <td className="text-right px-4 py-3 hidden lg:table-cell">
                                <span className="text-[14px] text-[var(--label-secondary)]">
                                  {formatCompact(cat.invested)}
                                </span>
                              </td>
                              <td className="text-right px-4 py-3">
                                <p className="text-[14px] font-semibold text-[var(--label-primary)]">
                                  {formatCompact(cat.current)}
                                </p>
                              </td>
                              <td className="text-right px-4 py-3">
                                <p className={`text-[14px] font-semibold ${cat.pnl >= 0 ? 'text-[var(--system-green)]' : 'text-[var(--system-amber)]'}`}>
                                  {cat.pnl >= 0 ? '+' : ''}{formatCompact(cat.pnl)}
                                </p>
                                <p className={`text-[11px] ${cat.pnlPercent >= 0 ? 'text-[var(--system-green)]' : 'text-[var(--system-amber)]'}`}>
                                  {cat.pnlPercent >= 0 ? '+' : ''}{cat.pnlPercent.toFixed(1)}%
                                </p>
                              </td>
                            </tr>
                          </Link>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <p className="text-[15px] text-[var(--label-tertiary)] mb-4">No holdings yet</p>
                    <Link to="/assets/add">
                      <Button variant="filled" size="sm">Add Asset</Button>
                    </Link>
                  </div>
                )}
              </Card>
            </motion.div>

            {/* Allocation - Horizontal Stacked Bar */}
            <motion.div variants={staggerItem}>
              <Card padding="p-4">
                <h2 className="text-[17px] font-semibold text-[var(--label-primary)] mb-4">Allocation</h2>

                {categoryBreakdown.length > 0 ? (
                  <>
                    {/* Horizontal Stacked Bar */}
                    <div className="mb-4">
                      <div className="h-4 rounded-full overflow-hidden flex bg-[var(--fill-tertiary)]">
                        {categoryBreakdown.map((cat, index) => (
                          <motion.div
                            key={cat.name}
                            initial={{ width: 0 }}
                            animate={{ width: `${cat.percent}%` }}
                            transition={{ duration: 0.6, delay: index * 0.05, ease: [0.4, 0, 0.2, 1] }}
                            style={{ backgroundColor: cat.color }}
                            className="h-full first:rounded-l-full last:rounded-r-full"
                            title={`${cat.name}: ${cat.percent.toFixed(1)}%`}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Legend with values */}
                    <div className="space-y-3">
                      {categoryBreakdown.map((cat) => (
                        <div key={cat.name} className="group">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2.5">
                              <div
                                className="w-3 h-3 rounded-sm"
                                style={{ backgroundColor: cat.color }}
                              />
                              <span className="text-[13px] text-[var(--label-primary)]">{cat.name}</span>
                            </div>
                            <span className="text-[13px] font-semibold text-[var(--label-primary)]">
                              {cat.percent.toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex items-center justify-between pl-5.5 ml-[22px]">
                            <span className="text-[12px] text-[var(--label-tertiary)]">
                              {formatCompact(cat.value)}
                            </span>
                            {/* Individual progress bar */}
                            <div className="w-16 h-1.5 rounded-full bg-[var(--fill-tertiary)] overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${cat.percent}%` }}
                                transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                                style={{ backgroundColor: cat.color }}
                                className="h-full rounded-full"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Total */}
                    <div className="mt-4 pt-3 border-t border-[var(--separator)]/30">
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-medium text-[var(--label-secondary)]">Total Portfolio</span>
                        <span className="text-[15px] font-semibold text-[var(--label-primary)]">{formatCompact(totalValue)}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-[15px] text-[var(--label-tertiary)] text-center py-8">No data</p>
                )}
              </Card>
            </motion.div>
          </div>

          {/* Empty State */}
          {assets.length === 0 && (
            <motion.div variants={staggerItem}>
              <Card padding="p-12" className="text-center">
                <div className="w-16 h-16 bg-[var(--fill-tertiary)] rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-[var(--label-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <h3 className="text-[20px] font-semibold text-[var(--label-primary)] mb-1">Start Tracking</h3>
                <p className="text-[15px] text-[var(--label-secondary)] mb-6 max-w-sm mx-auto">
                  Add your investments to track portfolio performance
                </p>
                <Link to="/assets/add">
                  <Button variant="filled" size="lg">Add Your First Asset</Button>
                </Link>
              </Card>
            </motion.div>
          )}
        </motion.div>

        {/* Floating Add Button */}
        <Link to="/assets/add">
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={spring.snappy}
            className="fixed bottom-6 right-6 w-14 h-14 bg-[var(--system-blue)] text-white rounded-full shadow-lg shadow-[var(--system-blue)]/30 flex items-center justify-center z-50"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </motion.div>
        </Link>

        {/* XIRR Debug Modal */}
        <AnimatePresence>
          {showXirrDebug && xirrDebugInfo && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
                onClick={() => setShowXirrDebug(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-[var(--bg-primary)] rounded-2xl shadow-2xl z-[101] overflow-hidden max-h-[85vh] flex flex-col"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--separator)]/30 shrink-0">
                  <h2 className="text-[17px] font-semibold text-[var(--label-primary)]">XIRR Calculation Breakdown</h2>
                  <button
                    onClick={() => setShowXirrDebug(false)}
                    className="p-2 -mr-2 text-[var(--label-tertiary)] hover:text-[var(--label-secondary)] hover:bg-[var(--fill-tertiary)] rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Content */}
                <div className="px-5 py-4 overflow-y-auto flex-1">
                  {/* Summary */}
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <div className="p-3 bg-[var(--fill-tertiary)]/50 rounded-xl">
                      <p className="text-[11px] text-[var(--label-tertiary)] uppercase mb-1">Total Invested</p>
                      <p className="text-[17px] font-semibold text-[var(--label-primary)]">
                        {formatCurrency(xirrDebugInfo.totalInvested)}
                      </p>
                    </div>
                    <div className="p-3 bg-[var(--fill-tertiary)]/50 rounded-xl">
                      <p className="text-[11px] text-[var(--label-tertiary)] uppercase mb-1">Current Value</p>
                      <p className="text-[17px] font-semibold text-[var(--label-primary)]">
                        {formatCurrency(xirrDebugInfo.currentValue)}
                      </p>
                    </div>
                    <div className="p-3 bg-[var(--fill-tertiary)]/50 rounded-xl">
                      <p className="text-[11px] text-[var(--label-tertiary)] uppercase mb-1">Absolute Return</p>
                      <p className={`text-[17px] font-semibold ${xirrDebugInfo.absoluteReturn >= 0 ? 'text-[var(--system-green)]' : 'text-[var(--system-amber)]'}`}>
                        {xirrDebugInfo.absoluteReturn >= 0 ? '+' : ''}{xirrDebugInfo.absoluteReturn.toFixed(2)}%
                      </p>
                    </div>
                    <div className="p-3 bg-[var(--system-blue)]/10 rounded-xl">
                      <p className="text-[11px] text-[var(--system-blue)] uppercase mb-1">XIRR (Annualized)</p>
                      <p className={`text-[17px] font-semibold ${xirrDebugInfo.xirr >= 0 ? 'text-[var(--system-blue)]' : 'text-[var(--system-amber)]'}`}>
                        {xirrDebugInfo.xirr >= 0 ? '+' : ''}{xirrDebugInfo.xirr.toFixed(2)}%
                      </p>
                    </div>
                  </div>

                  {/* Time Period */}
                  <div className="mb-5 p-3 bg-[var(--fill-tertiary)]/30 rounded-xl">
                    <div className="flex justify-between text-[13px]">
                      <span className="text-[var(--label-tertiary)]">First Investment</span>
                      <span className="text-[var(--label-primary)] font-medium">{xirrDebugInfo.firstDate}</span>
                    </div>
                    <div className="flex justify-between text-[13px] mt-1">
                      <span className="text-[var(--label-tertiary)]">Current Date</span>
                      <span className="text-[var(--label-primary)] font-medium">{xirrDebugInfo.lastDate}</span>
                    </div>
                    <div className="flex justify-between text-[13px] mt-1">
                      <span className="text-[var(--label-tertiary)]">Total Transactions</span>
                      <span className="text-[var(--label-primary)] font-medium">{xirrDebugInfo.transactionCount}</span>
                    </div>
                  </div>

                  {/* Cash Flows */}
                  <div>
                    <h3 className="text-[11px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider mb-3">
                      Cash Flows (First 20)
                    </h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {xirrDebugInfo.cashFlows.slice(0, 20).map((cf, idx) => (
                        <div key={idx} className="flex items-center justify-between py-2 px-3 bg-[var(--fill-tertiary)]/30 rounded-lg">
                          <div>
                            <p className="text-[13px] text-[var(--label-primary)]">{cf.date}</p>
                            <p className="text-[11px] text-[var(--label-tertiary)]">{cf.type}</p>
                          </div>
                          <p className={`text-[14px] font-medium ${cf.amount >= 0 ? 'text-[var(--system-green)]' : 'text-[var(--system-amber)]'}`}>
                            {cf.amount >= 0 ? '+' : ''}{formatCurrency(cf.amount)}
                          </p>
                        </div>
                      ))}
                      {xirrDebugInfo.cashFlows.length > 20 && (
                        <p className="text-[12px] text-[var(--label-tertiary)] text-center py-2">
                          ... and {xirrDebugInfo.cashFlows.length - 20} more transactions
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-3 bg-[var(--fill-tertiary)]/50 border-t border-[var(--separator)]/30 shrink-0">
                  <p className="text-[12px] text-[var(--label-tertiary)] text-center">
                    XIRR accounts for timing of each investment. Differences with Zerodha may be due to dividends not tracked here.
                  </p>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
