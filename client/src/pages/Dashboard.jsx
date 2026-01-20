import { useState, useEffect, useRef, useCallback } from 'react';
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

  // Refs to prevent race conditions
  const fetchRequestId = useRef(0);
  const periodRequestId = useRef(0);
  const isMounted = useRef(true);
  const snapshotTimeoutRef = useRef(null);
  const hasRecordedSnapshot = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (snapshotTimeoutRef.current) {
        clearTimeout(snapshotTimeoutRef.current);
      }
    };
  }, []);

  // Initial data fetch
  useEffect(() => {
    fetchData();
  }, []);

  // Handle period changes (separate from initial fetch to avoid double-fetching)
  const handlePeriodChange = useCallback(async (period) => {
    if (period === selectedPeriod) return;

    setSelectedPeriod(period);

    // Increment request ID to invalidate any pending requests
    const currentRequestId = ++periodRequestId.current;

    try {
      const response = await portfolioService.getCumulativeInvestments(period);

      // Only update state if this is still the latest request and component is mounted
      if (periodRequestId.current === currentRequestId && isMounted.current) {
        setCumulativeData(response.data.data || []);
        setInvestmentSummary(response.data.summary || null);
      }
    } catch (error) {
      console.error('Error fetching cumulative investments:', error);
    }
  }, [selectedPeriod]);

  const fetchData = async (forceRefresh = false) => {
    // Increment request ID to track this specific request
    const currentRequestId = ++fetchRequestId.current;

    if (forceRefresh) setRefreshing(true);
    try {
      // Step 1: Fetch assets and chart data in parallel
      const [assetsRes, chartRes] = await Promise.all([
        assetService.getAll(),
        portfolioService.getCumulativeInvestments(selectedPeriod)
      ]);

      // Check if this request is still valid (no newer request started)
      if (fetchRequestId.current !== currentRequestId || !isMounted.current) {
        return; // Discard stale response
      }

      const assetList = assetsRes.data.assets;
      setAssets(assetList);
      setCumulativeData(chartRes.data.data || []);
      setInvestmentSummary(chartRes.data.summary || null);

      // Step 2: Prepare parallel fetches for prices and transactions
      const equityAssets = assetList.filter(a => a.category === 'EQUITY' && a.symbol);
      const fixedIncomeAssets = assetList.filter(a => a.category === 'FIXED_INCOME' && a.interest_rate);

      // Clear cache first if force refresh
      if (forceRefresh) {
        await priceService.clearCache();
      }

      // Price fetch promise
      let pricePromise = Promise.resolve({ data: { prices: {} } });
      if (equityAssets.length > 0) {
        const symbols = equityAssets.map(a => ({
          symbol: a.asset_type === 'MUTUAL_FUND' ? a.symbol : `${a.symbol}.${a.exchange === 'BSE' ? 'BO' : 'NS'}`,
          type: a.asset_type === 'MUTUAL_FUND' ? 'mf' : 'stock'
        }));
        pricePromise = priceService.getBulkPrices(symbols, forceRefresh);
      }

      // Fetch ALL transactions in parallel (both equity and fixed income)
      const allAssetIds = [...equityAssets, ...fixedIncomeAssets].map(a => a.id);
      const transactionPromises = allAssetIds.map(id =>
        assetService.getTransactions(id).then(res => ({ id, transactions: res.data.transactions || [] }))
      );

      // Execute prices and all transactions in parallel
      const [priceRes, ...transactionResults] = await Promise.all([
        pricePromise,
        ...transactionPromises
      ]);

      // Check again if this request is still valid after second batch of fetches
      if (fetchRequestId.current !== currentRequestId || !isMounted.current) {
        return; // Discard stale response
      }

      // Process price data
      const priceData = priceRes.data.prices || {};
      setPrices(priceData);
      if (equityAssets.length > 0) {
        setLastUpdated(new Date());
      }

      // Build transaction map
      const transactionMap = {};
      transactionResults.forEach(({ id, transactions }) => {
        transactionMap[id] = transactions;
      });

      // Process Fixed Income calculations
      if (fixedIncomeAssets.length > 0) {
        const calcs = {};
        fixedIncomeAssets.forEach(asset => {
          const transactions = transactionMap[asset.id] || [];
          if (transactions.length > 0) {
            const compoundingFreq = getCompoundingFrequency(asset.asset_type);
            const calculation = calculateFixedIncomeValue(transactions, asset.interest_rate, new Date(), compoundingFreq);
            calcs[asset.id] = calculation;
          }
        });
        setFixedIncomeCalcs(calcs);
      }

      // Process XIRR calculation
      if (equityAssets.length > 0) {
        const allTxns = [];
        equityAssets.forEach(asset => {
          const transactions = transactionMap[asset.id] || [];
          allTxns.push(...transactions);
        });

        if (allTxns.length > 0) {
          setAllTransactions(allTxns);

          // Calculate current portfolio value for equity
          let totalCurrentValue = 0;
          equityAssets.forEach(asset => {
            if (asset.quantity && asset.symbol) {
              const priceKey = asset.asset_type === 'MUTUAL_FUND' ? asset.symbol : `${asset.symbol}.${asset.exchange === 'BSE' ? 'BO' : 'NS'}`;
              const price = priceData[priceKey]?.price || asset.avg_buy_price || 0;
              totalCurrentValue += asset.quantity * price;
            }
          });

          // Calculate XIRR and store debug info
          const xirr = calculateXIRRFromTransactions(allTxns, totalCurrentValue);
          setPortfolioXIRR(isFinite(xirr) ? xirr : null);

          // Store debug info for XIRR breakdown
          const debug = debugXIRR(allTxns, totalCurrentValue);
          setXirrDebugInfo(debug);
        } else {
          setPortfolioXIRR(null);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
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

  // Record snapshot with debouncing to prevent multiple calls
  const recordSnapshot = useCallback(async (totalValue, totalInvested, dayChange) => {
    // Prevent recording if already recorded in this session or component unmounted
    if (hasRecordedSnapshot.current || !isMounted.current) return;

    try {
      await portfolioService.recordSnapshot({ totalValue, totalInvested, dayChange });
      hasRecordedSnapshot.current = true;
    } catch (error) {
      console.error('Error recording snapshot:', error);
    }
  }, []);


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

  // Category summary for holdings table (split EQUITY into Stocks and Mutual Funds, FIXED_INCOME by type)
  const categorySummary = Object.entries(
    assets.reduce((acc, asset) => {
      // For EQUITY category, split by asset_type (STOCK vs MUTUAL_FUND)
      let groupKey = asset.category;
      if (asset.category === 'EQUITY') {
        groupKey = asset.asset_type === 'MUTUAL_FUND' ? 'EQUITY_MF' : 'EQUITY_STOCKS';
      }
      // For FIXED_INCOME, split by asset_type (PPF, FD, RD, NPS, etc.)
      if (asset.category === 'FIXED_INCOME' && asset.asset_type) {
        groupKey = `FIXED_INCOME_${asset.asset_type}`;
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
      EQUITY_STOCKS: { label: 'Stocks', color: 'var(--system-blue)' },
      EQUITY_MF: { label: 'Mutual Funds', color: 'var(--system-purple)' },
      REAL_ESTATE: { label: 'Real Estate', color: categoryColors.REAL_ESTATE?.color },
      FIXED_INCOME: { label: 'Fixed Income', color: categoryColors.FIXED_INCOME?.color },
      // Fixed Income subtypes
      FIXED_INCOME_PPF: { label: 'Fixed Income (PPF)', color: categoryColors.FIXED_INCOME?.color },
      FIXED_INCOME_FD: { label: 'Fixed Income (FD)', color: categoryColors.FIXED_INCOME?.color },
      FIXED_INCOME_RD: { label: 'Fixed Income (RD)', color: categoryColors.FIXED_INCOME?.color },
      FIXED_INCOME_NPS: { label: 'Fixed Income (NPS)', color: categoryColors.FIXED_INCOME?.color },
      FIXED_INCOME_EPF: { label: 'Fixed Income (EPF)', color: categoryColors.FIXED_INCOME?.color },
      FIXED_INCOME_SSY: { label: 'Fixed Income (SSY)', color: categoryColors.FIXED_INCOME?.color },
      FIXED_INCOME_NSC: { label: 'Fixed Income (NSC)', color: categoryColors.FIXED_INCOME?.color },
      FIXED_INCOME_SCSS: { label: 'Fixed Income (SCSS)', color: categoryColors.FIXED_INCOME?.color },
      FIXED_INCOME_BOND: { label: 'Fixed Income (Bonds)', color: categoryColors.FIXED_INCOME?.color },
      FIXED_INCOME_OTHER: { label: 'Fixed Income (Other)', color: categoryColors.FIXED_INCOME?.color },
      PHYSICAL: { label: 'Physical Assets', color: categoryColors.PHYSICAL?.color },
      SAVINGS: { label: 'Savings', color: categoryColors.SAVINGS?.color },
      CRYPTO: { label: 'Cryptocurrency', color: categoryColors.CRYPTO?.color },
      INSURANCE: { label: 'Insurance', color: categoryColors.INSURANCE?.color },
      OTHER: { label: 'Other', color: categoryColors.OTHER?.color },
    };

    // For unknown Fixed Income types, generate label dynamically
    let label = groupConfig[groupKey]?.label;
    if (!label && groupKey.startsWith('FIXED_INCOME_')) {
      const type = groupKey.replace('FIXED_INCOME_', '');
      label = `Fixed Income (${type})`;
    }

    return {
      category: groupKey,
      label: label || ASSET_CONFIG[groupKey]?.label || groupKey,
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

  // Record snapshot when data is loaded with debouncing
  useEffect(() => {
    if (!loading && !hasRecordedSnapshot.current) {
      // Clear any existing timeout
      if (snapshotTimeoutRef.current) {
        clearTimeout(snapshotTimeoutRef.current);
      }

      // Debounce the snapshot recording to avoid rapid successive calls
      snapshotTimeoutRef.current = setTimeout(() => {
        if (isMounted.current) {
          recordSnapshot(totalValue, totalInvested, dayChange);
        }
      }, 500);
    }

    return () => {
      if (snapshotTimeoutRef.current) {
        clearTimeout(snapshotTimeoutRef.current);
      }
    };
  }, [loading, totalValue, totalInvested, dayChange, recordSnapshot]);

  // Format chart data for cumulative investment line chart
  // Scale proportionally so the chart ends at totalInvested while maintaining shape
  const chartData = (() => {
    if (cumulativeData.length === 0) return [];

    // Get the last cumulative value from API data
    const lastApiValue = cumulativeData[cumulativeData.length - 1]?.cumulative || 0;

    // Calculate scale factor to match totalInvested
    const scaleFactor = lastApiValue > 0 && totalInvested > 0
      ? totalInvested / lastApiValue
      : 1;

    return cumulativeData.map((item) => {
      const dateObj = new Date(item.date);
      const monthLabel = dateObj.toLocaleString('en-IN', { month: 'short' });
      const yearLabel = dateObj.getFullYear().toString().slice(-2);

      return {
        date: item.date,
        displayDate: `${monthLabel} '${yearLabel}`,
        cumulative: Math.round(item.cumulative * scaleFactor),
      };
    });
  })();

  const periods = ['1W', '1M', '3M', '6M', '1Y', 'ALL'];

  if (loading) {
    return (
      <div className="p-5 md:p-6">
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <div className="p-5 md:p-6">
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="space-y-5"
      >
          {/* Main Dashboard Grid - Desktop: 2 columns, Mobile: stacked */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

            {/* Left Column - Portfolio Summary + Holdings + Allocation */}
            <motion.div variants={staggerItem} className="lg:col-span-3 space-y-4">
              {/* Portfolio Summary Card - Apple Stocks Style */}
              <Card padding="p-5" className="relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--chart-primary)]/5 rounded-full -mr-12 -mt-12" />
                <div className="relative">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-medium text-[var(--label-tertiary)] uppercase tracking-wide">Portfolio Value</span>
                    <button
                      onClick={handleRefresh}
                      disabled={refreshing}
                      className="p-1.5 rounded-lg text-[var(--label-tertiary)] hover:bg-[var(--fill-tertiary)] transition-colors disabled:opacity-50"
                      title="Sync prices"
                    >
                      <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                      </svg>
                    </button>
                  </div>

                  {/* Hero Value */}
                  <p className="text-[32px] font-bold text-[var(--label-primary)] tracking-tight leading-none">
                    {formatCompact(totalValue)}
                  </p>

                  {/* Returns Badge */}
                  <div className="flex items-center gap-2 mt-2 mb-4">
                    <span className={`text-[13px] font-semibold ${totalPnL >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                      {totalPnL >= 0 ? '+' : ''}{formatCompact(totalPnL)} ({totalPnL >= 0 ? '+' : ''}{totalPnLPercent.toFixed(1)}%)
                    </span>
                    {lastUpdated && (
                      <span className="text-[11px] text-[var(--label-quaternary)]">
                        • {getTimeAgo(lastUpdated)}
                      </span>
                    )}
                  </div>

                  {/* Divider */}
                  <div className="h-px bg-[var(--separator-opaque)] mb-4" />

                  {/* Metrics Row */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide mb-0.5">Invested</p>
                      <p className="text-[17px] font-semibold text-[var(--label-primary)] tracking-tight">
                        {formatCompact(totalInvested)}
                      </p>
                    </div>
                    <div className="h-8 w-px bg-[var(--separator-opaque)]" />
                    <div className="text-right">
                      <p className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide mb-0.5">Returns</p>
                      <p className={`text-[17px] font-semibold tracking-tight ${totalPnL >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                        {totalPnL >= 0 ? '+' : ''}{formatCompact(totalPnL)}
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              {/* XIRR Card */}
              <Card
                padding="p-4"
                className={portfolioXIRR !== null ? 'cursor-pointer hover:bg-[var(--fill-tertiary)]/50 transition-colors group' : ''}
                onClick={() => portfolioXIRR !== null && setShowXirrDebug(true)}
              >
                <div className="flex items-center gap-3">
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-xl bg-[var(--chart-primary)]/10 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-[var(--chart-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                    </svg>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-[var(--label-tertiary)] uppercase tracking-wide mb-0.5">XIRR</p>
                    {portfolioXIRR !== null ? (
                      <p className={`text-[20px] font-bold tracking-tight leading-none ${portfolioXIRR >= 0 ? 'text-[var(--chart-primary)]' : 'text-[#DC2626]'}`}>
                        {portfolioXIRR >= 0 ? '+' : ''}{portfolioXIRR.toFixed(1)}%
                        <span className="text-[12px] font-medium text-[var(--label-tertiary)] ml-1">p.a.</span>
                      </p>
                    ) : (
                      <p className="text-[20px] font-bold text-[var(--label-quaternary)]">—</p>
                    )}
                  </div>

                  {/* Chevron - indicates tappable */}
                  {portfolioXIRR !== null && (
                    <div className="flex items-center gap-1 text-[var(--label-quaternary)] group-hover:text-[var(--label-tertiary)] transition-colors">
                      <span className="text-[11px] hidden sm:inline">Details</span>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </div>
                  )}
                </div>
              </Card>

              {/* Allocation */}
              <Card padding="p-0">
                <div className="flex items-center gap-3 py-3 px-4 border-b border-[var(--separator-opaque)]">
                  <div className="w-8 h-8 rounded-lg bg-[var(--system-green)]/10 flex items-center justify-center">
                    <svg className="w-4 h-4 text-[var(--system-green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
                    </svg>
                  </div>
                  <span className="text-[14px] font-semibold text-[var(--label-primary)]">Allocation</span>
                </div>
                <div className="p-4">

                {categoryBreakdown.length > 0 ? (
                  <>
                    {/* Horizontal Stacked Bar */}
                    <div className="mb-4">
                      <div className="h-3 rounded-full overflow-hidden flex bg-[var(--fill-tertiary)]">
                        {categoryBreakdown.map((cat, index) => (
                          <motion.div
                            key={cat.name}
                            initial={{ width: 0 }}
                            animate={{ width: `${cat.percent}%` }}
                            transition={{ duration: 0.6, delay: index * 0.05, ease: [0.4, 0, 0.2, 1] }}
                            style={{ backgroundColor: cat.color }}
                            className="h-full"
                            title={`${cat.name}: ${cat.percent.toFixed(1)}%`}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Legend */}
                    <div className="space-y-2.5">
                      {categoryBreakdown.map((cat) => (
                        <div key={cat.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: cat.color }} />
                            <span className="text-[12px] text-[var(--label-secondary)]">{cat.name}</span>
                          </div>
                          <span className="text-[12px] font-semibold text-[var(--label-primary)]">
                            {cat.percent.toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Total */}
                    <div className="mt-4 pt-3 border-t border-[var(--separator-opaque)]">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-medium text-[var(--label-tertiary)]">Total</span>
                        <span className="text-[14px] font-bold text-[var(--label-primary)]">{formatCompact(totalValue)}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="py-6 text-center">
                    <p className="text-[13px] text-[var(--label-tertiary)]">No allocation data</p>
                  </div>
                )}
                </div>
              </Card>
            </motion.div>

            {/* Right Column - Chart + Category Performance */}
            <motion.div variants={staggerItem} className="lg:col-span-9 space-y-4">
              <Card padding="p-0" className="overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between py-3 px-4 border-b border-[var(--separator-opaque)]">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[var(--chart-primary)]/10 flex items-center justify-center">
                      <svg className="w-4 h-4 text-[var(--chart-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                      </svg>
                    </div>
                    <span className="text-[14px] font-semibold text-[var(--label-primary)]">Investment Journey</span>
                  </div>
                  {/* Export Button */}
                  <button
                    onClick={handleExportPDF}
                    disabled={assets.length === 0}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--separator-opaque)] text-[var(--label-secondary)] hover:bg-[var(--fill-tertiary)] transition-colors disabled:opacity-50 text-[13px] font-medium"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Export
                  </button>
                </div>

                {/* Content */}
                <div className="p-5 pb-0">
                  {/* Amount + Badge + Legend - All on one line */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <p className="text-[28px] font-semibold text-[var(--label-primary)] tracking-tight leading-none">
                        {formatCurrency(totalInvested)}
                      </p>
                      {totalPnLPercent !== 0 && (
                        <span className={`text-[12px] font-semibold px-2 py-0.5 rounded ${totalPnL >= 0 ? 'bg-[#059669]/10 text-[#059669]' : 'bg-[#DC2626]/10 text-[#DC2626]'}`}>
                          {totalPnL >= 0 ? '+' : ''}{totalPnLPercent.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    {/* Legend */}
                    <div className="hidden md:flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-[var(--chart-primary)]" />
                        <span className="text-[11px] text-[var(--label-tertiary)]">Invested</span>
                      </div>
                    </div>
                  </div>

                  {/* Period Selector */}
                  {assets.length > 0 && (
                    <div className="flex gap-1 p-1 bg-[var(--fill-tertiary)]/50 rounded-lg w-fit">
                      {periods.map((period) => (
                        <button
                          key={period}
                          onClick={() => handlePeriodChange(period)}
                          className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
                            selectedPeriod === period
                              ? 'bg-[var(--bg-primary)] text-[var(--label-primary)] shadow-sm'
                              : 'text-[var(--label-tertiary)] hover:text-[var(--label-secondary)]'
                          }`}
                        >
                          {period}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Area Chart */}
                {chartData.length > 0 ? (
                  <div className="h-[300px] mt-4 pr-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                        <defs>
                          <linearGradient id="cumulativeGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--chart-primary)" stopOpacity={0.15} />
                            <stop offset="100%" stopColor="var(--chart-primary)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--separator-opaque)" opacity={0.5} vertical={false} />
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
                            const dateLabel = rawDate
                              ? new Date(rawDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                              : '';

                            return (
                              <div style={{
                                background: 'var(--bg-primary)',
                                border: '1px solid var(--separator-opaque)',
                                borderRadius: '12px',
                                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                                padding: '12px 16px',
                                minWidth: '140px'
                              }}>
                                <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--label-primary)', fontSize: 13 }}>{dateLabel}</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                                  <span style={{ color: 'var(--label-secondary)', fontSize: 12 }}>Invested</span>
                                  <span style={{ fontWeight: 600, color: 'var(--chart-primary)', fontSize: 13 }}>{formatCompact(cumulative)}</span>
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="cumulative"
                          stroke="var(--chart-primary)"
                          strokeWidth={2.5}
                          fill="url(#cumulativeGradient)"
                          dot={false}
                          activeDot={{ r: 5, fill: 'var(--chart-primary)', strokeWidth: 2, stroke: 'var(--bg-primary)' }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[200px] flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 bg-[var(--fill-tertiary)] rounded-xl flex items-center justify-center mb-3">
                      <svg className="w-6 h-6 text-[var(--label-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                      </svg>
                    </div>
                    <p className="text-[14px] text-[var(--label-tertiary)]">No investment data yet</p>
                    <p className="text-[12px] text-[var(--label-quaternary)] mt-1">Add assets with transactions to see your journey</p>
                  </div>
                )}
              </Card>

              {/* Holdings Table */}
              <Card padding="p-0" className="hidden lg:block">
                <div className="flex items-center justify-between py-3 px-4 border-b border-[var(--separator-opaque)]">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[var(--system-purple)]/10 flex items-center justify-center">
                      <svg className="w-4 h-4 text-[var(--system-purple)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    </div>
                    <span className="text-[14px] font-semibold text-[var(--label-primary)]">Holdings</span>
                    <span className="text-[12px] text-[var(--label-tertiary)]">({holdings.length} assets)</span>
                  </div>
                  <Link to="/assets" className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--separator-opaque)] text-[var(--label-secondary)] hover:bg-[var(--fill-tertiary)] transition-colors text-[13px] font-medium">
                    View All
                  </Link>
                </div>

                {categoryBreakdown.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-[11px] font-medium text-[var(--label-tertiary)] uppercase tracking-wider border-b border-[var(--separator-opaque)]/50">
                          <th className="text-left px-4 py-3 font-medium">Category</th>
                          <th className="text-right px-4 py-3 font-medium">Assets</th>
                          <th className="text-right px-4 py-3 font-medium">Invested</th>
                          <th className="text-right px-4 py-3 font-medium">Current</th>
                          <th className="text-right px-4 py-3 font-medium">P&L</th>
                          <th className="text-right px-4 py-3 font-medium">Weight</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--separator-opaque)]/50">
                        {categorySummary.map((cat) => (
                          <tr key={cat.category} className="hover:bg-[var(--fill-tertiary)]/30 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div
                                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                                  style={{ backgroundColor: cat.color }}
                                >
                                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    {cat.category === 'EQUITY_STOCKS' ? (
                                      // Trending up arrow
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                                    ) : cat.category === 'EQUITY_MF' ? (
                                      // Pie chart for diversified funds
                                      <>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
                                      </>
                                    ) : cat.category.startsWith('FIXED_INCOME') ? (
                                      // Bank building (for all Fixed Income types)
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
                                    ) : cat.category === 'REAL_ESTATE' ? (
                                      // Home/Building
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5l-1.5-.5M6.75 7.364V3h-3v18m3-13.636l10.5-3.819" />
                                    ) : cat.category === 'PHYSICAL' ? (
                                      // Gold/Gem
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                                    ) : cat.category === 'SAVINGS' ? (
                                      // Wallet
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
                                    ) : cat.category === 'CRYPTO' ? (
                                      // Currency/Crypto
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                                    ) : cat.category === 'INSURANCE' ? (
                                      // Shield
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                                    ) : (
                                      // Briefcase for OTHER
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
                                    )}
                                  </svg>
                                </div>
                                <span className="text-[14px] font-medium text-[var(--label-primary)]">{cat.label}</span>
                              </div>
                            </td>
                            <td className="text-right px-4 py-3">
                              <span className="text-[14px] text-[var(--label-secondary)]">{cat.assetCount}</span>
                            </td>
                            <td className="text-right px-4 py-3">
                              <span className="text-[14px] text-[var(--label-secondary)]">{formatCompact(cat.invested)}</span>
                            </td>
                            <td className="text-right px-4 py-3">
                              <span className="text-[14px] font-semibold text-[var(--label-primary)]">{formatCompact(cat.current)}</span>
                            </td>
                            <td className="text-right px-4 py-3">
                              <p className={`text-[14px] font-semibold ${cat.pnl >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                                {cat.pnl >= 0 ? '+' : ''}{formatCompact(cat.pnl)}
                              </p>
                              <p className={`text-[11px] ${cat.pnlPercent >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                                {cat.pnlPercent >= 0 ? '+' : ''}{cat.pnlPercent.toFixed(1)}%
                              </p>
                            </td>
                            <td className="text-right px-4 py-3">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 h-1.5 rounded-full bg-[var(--fill-tertiary)] overflow-hidden">
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      backgroundColor: cat.color,
                                      width: `${totalValue > 0 ? (cat.current / totalValue) * 100 : 0}%`
                                    }}
                                  />
                                </div>
                                <span className="text-[13px] font-medium text-[var(--label-primary)] w-12 text-right">
                                  {totalValue > 0 ? ((cat.current / totalValue) * 100).toFixed(1) : 0}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <div className="w-12 h-12 bg-[var(--fill-tertiary)] rounded-xl flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-[var(--label-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    </div>
                    <p className="text-[14px] text-[var(--label-secondary)] mb-1">No holdings yet</p>
                    <p className="text-[12px] text-[var(--label-tertiary)] mb-4">Add your first asset to start tracking</p>
                    <Link to="/assets/add">
                      <Button variant="filled" size="sm">Add Asset</Button>
                    </Link>
                  </div>
                )}
              </Card>
            </motion.div>
          </div>

          {/* Empty State */}
          {assets.length === 0 && (
            <motion.div variants={staggerItem}>
              <Card padding="p-12" className="text-center">
                <div className="w-16 h-16 bg-[var(--chart-primary)]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-[var(--chart-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--separator-opaque)] shrink-0">
                  <h2 className="text-[17px] font-semibold text-[var(--label-primary)]">XIRR Breakdown</h2>
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
                      <p className={`text-[17px] font-semibold ${xirrDebugInfo.absoluteReturn >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                        {xirrDebugInfo.absoluteReturn >= 0 ? '+' : ''}{xirrDebugInfo.absoluteReturn.toFixed(2)}%
                      </p>
                    </div>
                    <div className="p-3 bg-[var(--chart-primary)]/10 rounded-xl">
                      <p className="text-[11px] text-[var(--chart-primary)] uppercase mb-1">XIRR (Annualized)</p>
                      <p className={`text-[17px] font-semibold ${xirrDebugInfo.xirr >= 0 ? 'text-[var(--chart-primary)]' : 'text-[#DC2626]'}`}>
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
                          <p className={`text-[14px] font-medium ${cf.amount >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
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
                <div className="px-5 py-3 bg-[var(--fill-tertiary)]/50 border-t border-[var(--separator-opaque)] shrink-0">
                  <p className="text-[11px] text-[var(--label-tertiary)] text-center">
                    XIRR accounts for timing of investments. Differences with brokers may be due to dividends.
                  </p>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
    </div>
  );
}
