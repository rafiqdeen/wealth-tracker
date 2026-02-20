import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { assetService, priceService, ASSET_CONFIG } from '../services/assets';
import { portfolioService } from '../services/portfolio';
import { goalService, GOAL_CATEGORIES } from '../services/goals';
import { Card, Button, DashboardSkeleton, AnimatedNumber } from '../components/apple';
import { spring, staggerContainer, staggerItem, tapScale } from '../utils/animations';
import { getAssetValue as getAssetValuePure, getInvestedValue as getInvestedValuePure } from '../utils/portfolio';
import { categoryColors } from '../constants/theme';
import { formatCurrency, formatCompact, formatPercent, formatPrice } from '../utils/formatting';
import { calculateFixedIncomeValue, getCompoundingFrequency, calculateXIRRFromTransactions, yearsBetweenDates, calculateCAGR, debugXIRR, generateRecurringDepositSchedule } from '../utils/interest';
import { printPortfolioReport } from '../utils/export';
import { useAuth } from '../context/AuthContext';
import { usePrices } from '../context/PriceContext';
import { metalService, PURITY_FACTORS } from '../services/metals';
import { CombinedFreshnessBadge } from '../components/PriceFreshness';

export default function Dashboard() {
  const { user } = useAuth();
  const { prices, loading: pricesLoading, lastUpdated, marketStatus, fetchPrices, refreshPrices } = usePrices();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cumulativeData, setCumulativeData] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('ALL');
  const [investmentSummary, setInvestmentSummary] = useState(null);
  const [fixedIncomeCalcs, setFixedIncomeCalcs] = useState({}); // Store calculated values for Fixed Income assets
  const [portfolioXIRR, setPortfolioXIRR] = useState(null);
  const [allTransactions, setAllTransactions] = useState([]);
  const [xirrDebugInfo, setXirrDebugInfo] = useState(null);
  const [showXirrDebug, setShowXirrDebug] = useState(false);
  const [goals, setGoals] = useState([]);
  const [pricesLoaded, setPricesLoaded] = useState(false);
  const [metalPrices, setMetalPrices] = useState({});

  // Refs to prevent race conditions
  const fetchRequestId = useRef(0);
  const periodRequestId = useRef(0);
  const isMounted = useRef(true);
  const snapshotTimeoutRef = useRef(null);
  const hasRecordedSnapshot = useRef(false);
  const initialFetchStarted = useRef(false);

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

  // Initial data fetch (guard against React StrictMode double-invocation)
  useEffect(() => {
    if (initialFetchStarted.current) return;
    initialFetchStarted.current = true;
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

    if (forceRefresh) {
      setRefreshing(true);
      setPricesLoaded(false);
    }
    try {
      // Step 1: Fetch assets, chart data, and goals in parallel
      const [assetsRes, chartRes, goalsRes] = await Promise.all([
        assetService.getAll(),
        portfolioService.getCumulativeInvestments(selectedPeriod),
        goalService.getAll().catch(() => ({ data: { goals: [] } }))
      ]);

      // Check if this request is still valid (no newer request started)
      if (fetchRequestId.current !== currentRequestId || !isMounted.current) {
        return; // Discard stale response
      }

      const assetList = assetsRes.data.assets;
      setAssets(assetList);
      setCumulativeData(chartRes.data.data || []);
      setInvestmentSummary(chartRes.data.summary || null);
      setGoals(goalsRes.data?.goals || []);

      // Step 2: Separate equity and fixed income assets
      const equityAssets = assetList.filter(a => a.category === 'EQUITY' && a.symbol);
      const fixedIncomeAssets = assetList.filter(a => a.category === 'FIXED_INCOME' && a.interest_rate);

      // ===== METAL PRICES: Fetch for gold/silver current value =====
      const hasGold = assetList.some(a => a.category === 'PHYSICAL' && a.asset_type === 'GOLD');
      const hasSilver = assetList.some(a => a.category === 'PHYSICAL' && a.asset_type === 'SILVER');
      if (hasGold || hasSilver) {
        try {
          const fetches = [];
          if (hasGold) fetches.push(metalService.getPrice('gold').then(r => ({ metal: 'gold', data: r.data })));
          if (hasSilver) fetches.push(metalService.getPrice('silver').then(r => ({ metal: 'silver', data: r.data })));
          const results = await Promise.all(fetches);
          if (fetchRequestId.current === currentRequestId && isMounted.current) {
            const mp = {};
            for (const { metal, data } of results) {
              mp[metal] = { pricePerGram24K: data.pricePerGram24K, purityPrices: data.purityPrices };
            }
            setMetalPrices(mp);
          }
        } catch (e) {
          console.error('Error fetching metal prices:', e);
        }
      }

      // ===== FIXED INCOME: Fetch and process independently (don't wait for prices) =====
      if (fixedIncomeAssets.length > 0) {

        // Fetch Fixed Income transactions
        const fixedIncomeTransactions = await Promise.all(
          fixedIncomeAssets.map(asset =>
            assetService.getTransactions(asset.id)
              .then(res => ({ asset, transactions: res.data.transactions || [] }))
              .catch(() => ({ asset, transactions: [] }))
          )
        );

        // Check validity before processing
        if (fetchRequestId.current === currentRequestId && isMounted.current) {
          const recurringDepositTypes = ['PPF', 'RD', 'EPF', 'VPF', 'SSY'];
          const calcs = {};

          fixedIncomeTransactions.forEach(({ asset, transactions }) => {
            const compoundingFreq = getCompoundingFrequency(asset.asset_type);
            const isRecurring = recurringDepositTypes.includes(asset.asset_type);

            if (transactions.length > 0) {
              if (asset.asset_type === 'PPF') {
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
                const calculation = calculateFixedIncomeValue(transactions, asset.interest_rate, new Date(), compoundingFreq);
                calcs[asset.id] = calculation;
              }
            } else if (asset.principal) {
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
      }

      // ===== EQUITY: Fetch prices and transactions (can be slow due to rate limiting) =====
      let transactionMap = {};
      if (equityAssets.length > 0) {

        // Fetch equity transactions
        const equityTransactionPromises = equityAssets.map(asset =>
          assetService.getTransactions(asset.id)
            .then(res => ({ id: asset.id, transactions: res.data.transactions || [] }))
            .catch(() => ({ id: asset.id, transactions: [] }))
        );

        // Fetch prices using PriceContext (handles caching, backup, rate limiting)
        const pricePromise = fetchPrices(equityAssets, forceRefresh);

        // Wait for both prices and transactions
        const [fetchedPrices, ...transactionResults] = await Promise.all([
          pricePromise,
          ...equityTransactionPromises
        ]);

        // Check validity
        if (fetchRequestId.current !== currentRequestId || !isMounted.current) {
          return;
        }

        // fetchedPrices now contains the complete merged prices from PriceContext
        // Use it directly for XIRR calculation to avoid race condition with React state
        const priceData = fetchedPrices;
        setPricesLoaded(true);

        // Build transaction map for XIRR
        transactionResults.forEach(({ id, transactions }) => {
          transactionMap[id] = transactions;
        });

        // Process XIRR calculation
        const allTxns = [];
        equityAssets.forEach(asset => {
          const transactions = transactionMap[asset.id] || [];
          allTxns.push(...transactions);
        });

        if (allTxns.length > 0) {
          setAllTransactions(allTxns);

          // Calculate current portfolio value for equity
          // Only use actual market prices, not fallback to avg_buy_price
          let totalCurrentValue = 0;
          let hasAllPrices = true;

          equityAssets.forEach(asset => {
            if (asset.quantity && asset.symbol) {
              const priceKey = asset.asset_type === 'MUTUAL_FUND' ? asset.symbol : `${asset.symbol}.${asset.exchange === 'BSE' ? 'BO' : 'NS'}`;
              const marketPrice = priceData[priceKey]?.price;

              if (marketPrice) {
                totalCurrentValue += asset.quantity * marketPrice;
              } else {
                hasAllPrices = false;
              }
            }
          });

          // Only calculate XIRR if we have actual market prices
          // Otherwise XIRR will be misleading
          if (hasAllPrices && totalCurrentValue > 0) {
            const xirr = calculateXIRRFromTransactions(allTxns, totalCurrentValue);
            setPortfolioXIRR(isFinite(xirr) ? xirr : null);

            // Store debug info for XIRR breakdown
            const debug = debugXIRR(allTxns, totalCurrentValue);
            setXirrDebugInfo(debug);
          } else {
            // Don't show XIRR if prices aren't available
            setPortfolioXIRR(null);
            setXirrDebugInfo(null);
          }
        } else {
          setPortfolioXIRR(null);
        }
      } else {
        // No equity assets, mark prices as loaded
        setPricesLoaded(true);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Trigger server-side price sync first (refreshes prices in database)
      await priceService.triggerSync();
    } catch (error) {
      console.error('Error syncing prices:', error);
    }
    // Then refresh client data
    await fetchData(true);
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
        const priceData = prices[priceKey];
        const price = (priceData && !priceData.unavailable && typeof priceData.price === 'number' && priceData.price > 0)
          ? priceData.price : 0;
        currentValue = (asset.quantity || 0) * price;
        invested = (asset.quantity || 0) * (asset.avg_buy_price || 0);
      } else if (asset.category === 'FIXED_INCOME') {
        const calc = fixedIncomeCalcs[asset.id];
        currentValue = calc?.currentValue || asset.principal || 0;
        invested = calc?.principal || asset.principal || 0;
      } else if (asset.category === 'REAL_ESTATE' && asset.appreciation_rate && asset.purchase_price && asset.purchase_date) {
        // Calculate appreciated value for Real Estate
        const purchasePrice = parseFloat(asset.purchase_price);
        const rate = parseFloat(asset.appreciation_rate) / 100;
        const purchaseDate = new Date(asset.purchase_date);
        const today = new Date();
        const years = (today - purchaseDate) / (365.25 * 24 * 60 * 60 * 1000);
        currentValue = Math.round(purchasePrice * Math.pow(1 + rate, Math.max(0, years)));
        invested = purchasePrice;
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


  // Calculate appreciated value for Real Estate
  const getAppreciatedValue = (asset) => {
    if (asset.category !== 'REAL_ESTATE' || !asset.appreciation_rate || !asset.purchase_price || !asset.purchase_date) {
      return null;
    }
    const purchasePrice = parseFloat(asset.purchase_price);
    const rate = parseFloat(asset.appreciation_rate) / 100;
    const purchaseDate = new Date(asset.purchase_date);
    const today = new Date();
    const years = (today - purchaseDate) / (365.25 * 24 * 60 * 60 * 1000);
    if (years < 0) return purchasePrice;
    return Math.round(purchasePrice * Math.pow(1 + rate, years));
  };

  // Helper to get price key for an asset
  const getPriceKey = (asset) => {
    if (asset.category !== 'EQUITY' || !asset.symbol) return null;
    return asset.asset_type === 'MUTUAL_FUND' ? asset.symbol : `${asset.symbol}.${asset.exchange === 'BSE' ? 'BO' : 'NS'}`;
  };

  // Check if price is available for an equity asset (matches Assets.jsx logic)
  const isPriceAvailable = (asset) => {
    if (asset.category === 'EQUITY' && asset.symbol) {
      const priceKey = getPriceKey(asset);
      const priceData = priceKey ? prices[priceKey] : null;
      return priceData && !priceData.unavailable && typeof priceData.price === 'number' && priceData.price > 0;
    }
    return true; // Non-equity assets always have a value
  };

  const valueDeps = { prices, fixedIncomeCalcs, metalPrices, PURITY_FACTORS };
  const getAssetValue = (asset) => getAssetValuePure(asset, valueDeps);
  const getInvestedValue = (asset) => getInvestedValuePure(asset, { fixedIncomeCalcs });

  const getCurrentPrice = (asset) => {
    const priceKey = getPriceKey(asset);
    const priceData = priceKey ? prices[priceKey] : null;
    if (priceData && typeof priceData.price === 'number' && priceData.price > 0) {
      return priceData.price;
    }
    return asset.avg_buy_price || 0;
  };

  const getPriceChange = (asset) => {
    const priceKey = getPriceKey(asset);
    const priceData = priceKey ? prices[priceKey] : null;
    if (priceData && typeof priceData.changePercent === 'number') {
      return priceData.changePercent;
    }
    return 0;
  };

  // Calculate totals — exclude equity assets without prices (matches Assets.jsx)
  const assetsWithPrice = assets.filter(isPriceAvailable);
  const totalValue = assetsWithPrice.reduce((sum, asset) => sum + (getAssetValue(asset) || 0), 0);
  const totalInvested = assetsWithPrice.reduce((sum, asset) => sum + (getInvestedValue(asset) || 0), 0);
  const totalPnL = totalValue - totalInvested;
  const totalPnLPercent = totalInvested > 0 && isFinite(totalPnL / totalInvested)
    ? (totalPnL / totalInvested) * 100
    : 0;

  // Day's change (from equity assets using previousClose)
  const dayChange = assets
    .filter(a => a.category === 'EQUITY')
    .reduce((sum, asset) => {
      const priceKey = getPriceKey(asset);
      const priceData = priceKey ? prices[priceKey] : null;
      if (priceData && typeof priceData.price === 'number' && asset.quantity) {
        const changePercent = typeof priceData.changePercent === 'number' ? priceData.changePercent : 0;
        const previousClose = priceData.previousClose || (priceData.price / (1 + changePercent / 100));
        return sum + asset.quantity * (priceData.price - previousClose);
      }
      return sum;
    }, 0);
  const dayChangePercent = totalValue > 0 && isFinite(dayChange / totalValue)
    ? (dayChange / totalValue) * 100
    : 0;

  // Holdings sorted by value
  const holdings = [...assets]
    .map(asset => {
      const currentValue = getAssetValue(asset);
      const investedValue = getInvestedValue(asset);
      const hasPrice = currentValue !== null;
      const effectiveValue = currentValue ?? investedValue; // for display/sorting when price unavailable
      return {
        ...asset,
        currentValue: effectiveValue,
        investedValue,
        currentPrice: getCurrentPrice(asset),
        pnl: hasPrice ? effectiveValue - investedValue : 0,
        pnlPercent: (hasPrice && investedValue > 0)
          ? ((effectiveValue - investedValue) / investedValue) * 100
          : 0,
        dayChange: getPriceChange(asset),
        priceUnavailable: !hasPrice && asset.category === 'EQUITY',
      };
    })
    .sort((a, b) => b.currentValue - a.currentValue);

  // Category breakdown for pie chart (split EQUITY into Stocks and MF visually)
  const categoryBreakdown = Object.entries(
    assetsWithPrice.reduce((acc, asset) => {
      const value = getAssetValue(asset) || 0;
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
  // Only include assets with available prices (matches Assets.jsx totals)
  const categorySummary = Object.entries(
    assetsWithPrice.reduce((acc, asset) => {
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
      const currentValue = getAssetValue(asset) || 0;
      const investedValue = getInvestedValue(asset);
      acc[groupKey].assets.push(asset);
      acc[groupKey].current += currentValue;
      acc[groupKey].invested += investedValue;
      // Day change for equity assets
      if (asset.category === 'EQUITY') {
        const priceKey = getPriceKey(asset);
        const priceData = priceKey ? prices[priceKey] : null;
        if (priceData && typeof priceData.price === 'number' && asset.quantity) {
          const changePercent = typeof priceData.changePercent === 'number' ? priceData.changePercent : 0;
          const previousClose = priceData.previousClose || (priceData.price / (1 + changePercent / 100));
          acc[groupKey].dayChange += asset.quantity * (priceData.price - previousClose);
        }
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

    const isEquityCategory = groupKey === 'EQUITY_STOCKS' || groupKey === 'EQUITY_MF';
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
      isEquity: isEquityCategory,
    };
  }).sort((a, b) => b.current - a.current);

  // ===== Goals Summary for Progress Card =====
  const activeGoals = goals.filter(g => g.status === 'ACTIVE');
  const completedGoals = goals.filter(g => g.status === 'COMPLETED');
  const goalsThisYear = completedGoals.filter(g => {
    const completedDate = g.completed_at ? new Date(g.completed_at) : null;
    return completedDate && completedDate.getFullYear() === new Date().getFullYear();
  });

  // ===== Upcoming Maturities =====
  const upcomingMaturities = assets
    .filter(asset => {
      if (!asset.maturity_date) return false;
      const maturityDate = new Date(asset.maturity_date);
      const today = new Date();
      const daysUntilMaturity = Math.ceil((maturityDate - today) / (1000 * 60 * 60 * 24));
      // Show maturities within next 180 days (6 months)
      return daysUntilMaturity > 0 && daysUntilMaturity <= 180;
    })
    .map(asset => {
      const maturityDate = new Date(asset.maturity_date);
      const today = new Date();
      const daysUntilMaturity = Math.ceil((maturityDate - today) / (1000 * 60 * 60 * 24));

      // Calculate actual maturity value (principal + interest at maturity date)
      let maturityValue = asset.principal || 0;
      if (asset.principal && asset.interest_rate && asset.start_date && asset.maturity_date) {
        const principal = parseFloat(asset.principal);
        const rate = parseFloat(asset.interest_rate) / 100;
        const startDate = new Date(asset.start_date);
        const endDate = new Date(asset.maturity_date);
        const years = (endDate - startDate) / (365.25 * 24 * 60 * 60 * 1000);

        // Use quarterly compounding for FDs (most common in India)
        const n = asset.asset_type === 'FD' ? 4 : 1;
        maturityValue = principal * Math.pow(1 + rate / n, n * years);
      }

      return {
        ...asset,
        daysUntilMaturity,
        maturityValue: Math.round(maturityValue),
        formattedDate: maturityDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      };
    })
    .sort((a, b) => a.daysUntilMaturity - b.daysUntilMaturity);

  const totalMaturityValue = upcomingMaturities.reduce((sum, m) => sum + m.maturityValue, 0);

  // Record snapshot when data is loaded with debouncing
  // Only record after prices are loaded to avoid recording incorrect values
  useEffect(() => {
    if (!loading && pricesLoaded && !hasRecordedSnapshot.current) {
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
  }, [loading, pricesLoaded, totalValue, totalInvested, dayChange, recordSnapshot]);

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
      <div className="p-4 md:px-12 md:py-6">
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <div className="p-4 md:px-12 md:py-6">
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
              {/* Portfolio Summary Card - Gradient Style */}
              <Card padding="p-0" className="overflow-hidden">
                <div className="p-5 bg-gradient-to-br from-[var(--chart-primary)]/10 via-[var(--chart-primary)]/5 to-transparent">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-medium text-[var(--label-tertiary)] uppercase tracking-wide">Portfolio Value</span>
                    <button
                      onClick={handleRefresh}
                      disabled={refreshing}
                      className="p-1.5 rounded-lg text-[var(--label-tertiary)] hover:bg-[var(--bg-primary)]/50 transition-colors disabled:opacity-50"
                      title="Sync prices"
                    >
                      {refreshing ? (
                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                      )}
                    </button>
                  </div>

                  {/* Hero Value */}
                  <p className="text-[48px] font-bold text-[var(--label-primary)] tracking-tight leading-none" style={{ fontFamily: 'var(--font-display)' }}>
                    <AnimatedNumber value={totalValue} format="compact" />
                  </p>

                  {/* Returns Percentage & Freshness Badge */}
                  <div className="flex items-center gap-2 mt-2 mb-4">
                    <span className={`text-[18px] font-bold tracking-tight ${totalPnL >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                      {totalPnL >= 0 ? '+' : ''}{totalPnLPercent.toFixed(1)}%
                    </span>
                    {lastUpdated && (
                      <CombinedFreshnessBadge
                        lastUpdated={lastUpdated}
                        source={marketStatus?.isOpen ? 'live' : 'cached'}
                        marketStatus={marketStatus}
                      />
                    )}
                  </div>

                  {/* Divider */}
                  <div className="h-px bg-[var(--separator-opaque)]/50 mb-4" />

                  {/* Metrics Row */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide mb-0.5">Invested</p>
                      <p className="text-[18px] font-bold text-[var(--label-primary)] tracking-tight">
                        <AnimatedNumber value={totalInvested} format="compact" />
                      </p>
                    </div>
                    <div className="h-8 w-px bg-[var(--separator-opaque)]/50" />
                    <div className="text-right">
                      <p className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide mb-0.5">Returns</p>
                      <p className={`text-[18px] font-bold tracking-tight ${totalPnL >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                        {totalPnL >= 0 ? '+' : ''}<AnimatedNumber value={Math.abs(totalPnL)} format="compact" />
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              {/* XIRR Card */}
              <Card
                padding="p-0"
                className={`overflow-hidden ${portfolioXIRR !== null ? 'cursor-pointer group' : ''}`}
                onClick={() => portfolioXIRR !== null && setShowXirrDebug(true)}
              >
                <div className={`p-4 flex items-center gap-3 transition-all ${portfolioXIRR !== null ? 'hover:brightness-[0.98]' : ''}`}
                  style={{
                    background: portfolioXIRR !== null
                      ? portfolioXIRR >= 0
                        ? 'linear-gradient(to right, rgba(5, 150, 105, 0.08), rgba(5, 150, 105, 0.03), transparent)'
                        : 'linear-gradient(to right, rgba(220, 38, 38, 0.08), rgba(220, 38, 38, 0.03), transparent)'
                      : undefined
                  }}
                >
                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    portfolioXIRR !== null
                      ? portfolioXIRR >= 0 ? 'bg-[#059669]/15' : 'bg-[#DC2626]/15'
                      : 'bg-[var(--fill-tertiary)]'
                  }`}>
                    <svg className={`w-5 h-5 ${
                      portfolioXIRR !== null
                        ? portfolioXIRR >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'
                        : 'text-[var(--label-tertiary)]'
                    }`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                    </svg>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-[var(--label-tertiary)] uppercase tracking-wide mb-0.5">XIRR</p>
                    {portfolioXIRR !== null ? (
                      <p className={`text-[22px] font-bold tracking-tight leading-none ${portfolioXIRR >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                        {portfolioXIRR >= 0 ? '+' : ''}{portfolioXIRR.toFixed(1)}%
                        <span className="text-[12px] font-medium text-[var(--label-tertiary)] ml-1">p.a.</span>
                      </p>
                    ) : (
                      <p className="text-[22px] font-bold text-[var(--label-quaternary)]">—</p>
                    )}
                  </div>

                  {/* Chevron - indicates tappable */}
                  {portfolioXIRR !== null && (
                    <div className="flex items-center gap-1 text-[var(--label-quaternary)] group-hover:text-[var(--label-secondary)] transition-colors">
                      <span className="text-[11px] hidden sm:inline">Details</span>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </div>
                  )}
                </div>
              </Card>

              {/* Allocation - Donut Chart */}
              <Card padding="p-0" className="overflow-hidden">
                <div className="flex items-center gap-3 py-3.5 px-4 bg-gradient-to-r from-[var(--system-green)]/10 via-[var(--system-green)]/5 to-transparent">
                  <div className="w-9 h-9 rounded-xl bg-[var(--system-green)] flex items-center justify-center shadow-sm">
                    <svg className="w-[18px] h-[18px] text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
                    </svg>
                  </div>
                  <span className="text-[15px] font-semibold text-[var(--label-primary)]">Allocation</span>
                </div>
                <div className="p-4">
                  {categoryBreakdown.length > 0 ? (
                    <>
                      {/* Donut Chart */}
                      <div className="relative flex justify-center">
                        <div className="w-[200px] h-[200px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={categoryBreakdown}
                                cx="50%"
                                cy="50%"
                                innerRadius={62}
                                outerRadius={90}
                                paddingAngle={2}
                                dataKey="value"
                                stroke="none"
                                animationBegin={0}
                                animationDuration={800}
                              >
                                {categoryBreakdown.map((entry, index) => (
                                  <Cell
                                    key={`cell-${index}`}
                                    fill={entry.color}
                                    className="transition-all duration-200 hover:opacity-80"
                                    style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}
                                  />
                                ))}
                              </Pie>
                              <Tooltip
                                position={{ x: 0, y: -10 }}
                                wrapperStyle={{ top: 0, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none' }}
                                content={({ active, payload }) => {
                                  if (active && payload && payload.length) {
                                    const data = payload[0].payload;
                                    return (
                                      <div className="bg-[var(--bg-primary)] border border-[var(--separator-opaque)] rounded-xl px-3 py-2 shadow-lg whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: data.color }} />
                                          <p className="text-[12px] font-semibold text-[var(--label-primary)]">{data.name}</p>
                                        </div>
                                        <p className="text-[11px] text-[var(--label-secondary)] ml-[18px]">{formatCompact(data.value)} · {data.percent.toFixed(1)}%</p>
                                      </div>
                                    );
                                  }
                                  return null;
                                }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                          {/* Center Text */}
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-[10px] font-medium text-[var(--label-tertiary)] uppercase tracking-wide">Total</span>
                            <span className="text-[18px] font-bold text-[var(--label-primary)]">{formatCompact(totalValue)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Legend */}
                      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
                        {categoryBreakdown.map((cat) => (
                          <div key={cat.name} className="flex items-center gap-2 group cursor-default">
                            <div
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-2 ring-transparent group-hover:ring-[var(--label-tertiary)]/20 transition-all"
                              style={{ backgroundColor: cat.color }}
                            />
                            <span className="text-[11px] text-[var(--label-secondary)] truncate flex-1">{cat.name}</span>
                            <span className="text-[11px] font-semibold text-[var(--label-primary)]">
                              {cat.percent.toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="py-6 text-center">
                      <p className="text-[13px] text-[var(--label-tertiary)]">No allocation data</p>
                    </div>
                  )}
                </div>
              </Card>

              {/* Goals Progress Card - Modern Stacked List */}
              {activeGoals.length > 0 && (
                <Card padding="p-0" className="overflow-hidden">
                  {/* Header */}
                  <Link to="/goals" className="block">
                    <div className="flex items-center gap-3 py-3.5 px-4 bg-gradient-to-r from-[#FF9500]/10 via-[#FF9500]/5 to-transparent">
                      <div className="w-9 h-9 rounded-xl bg-[#FF9500] flex items-center justify-center shadow-sm">
                        <svg className="w-[18px] h-[18px] text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                        </svg>
                      </div>
                      <span className="text-[15px] font-semibold text-[var(--label-primary)]">Goals</span>
                      <div className="flex items-center gap-1.5 ml-auto">
                        <span className="text-[12px] font-medium text-[var(--label-tertiary)]">{activeGoals.length} Active</span>
                        <svg className="w-4 h-4 text-[var(--label-quaternary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </div>
                    </div>
                  </Link>

                  {/* Goals List */}
                  <div className="divide-y divide-[var(--separator-opaque)]/50">
                    {activeGoals.slice(0, 3).map((goal) => {
                      const progressPercent = goal.target_amount > 0
                        ? Math.min(100, ((goal.current_value || 0) / goal.target_amount) * 100)
                        : 0;
                      const categoryConfig = GOAL_CATEGORIES[goal.category] || GOAL_CATEGORIES.CUSTOM;

                      // Calculate status based on target date and progress (only show if notable)
                      const getGoalStatus = () => {
                        if (!goal.target_date) {
                          if (progressPercent >= 100) return { text: 'Completed', icon: '✓', color: '#10B981' };
                          if (progressPercent >= 75) return { text: 'Almost there', icon: '✓', color: '#10B981' };
                          return null; // No status for regular progress
                        }

                        const targetDate = new Date(goal.target_date);
                        const today = new Date();
                        const totalDays = (targetDate - new Date(goal.created_at)) / (1000 * 60 * 60 * 24);
                        const elapsedDays = (today - new Date(goal.created_at)) / (1000 * 60 * 60 * 24);
                        const expectedProgress = totalDays > 0 ? (elapsedDays / totalDays) * 100 : 0;
                        const daysLeft = Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24));

                        // Format time remaining
                        let timeText = '';
                        if (daysLeft < 0) {
                          timeText = 'Overdue';
                        } else if (daysLeft === 0) {
                          timeText = 'Due today';
                        } else if (daysLeft < 30) {
                          timeText = `${daysLeft}d left`;
                        } else if (daysLeft < 365) {
                          const months = Math.floor(daysLeft / 30);
                          timeText = `${months}mo left`;
                        } else {
                          const years = Math.floor(daysLeft / 365);
                          const months = Math.floor((daysLeft % 365) / 30);
                          timeText = months > 0 ? `${years}y ${months}mo` : `${years}y left`;
                        }

                        if (progressPercent >= 100) {
                          return { text: 'Completed', icon: '✓', color: '#10B981' };
                        } else if (daysLeft < 0) {
                          return { text: timeText, icon: '⚠', color: '#EF4444' };
                        } else if (progressPercent >= expectedProgress + 10) {
                          return { text: `Ahead · ${timeText}`, icon: '✓', color: '#10B981' };
                        } else if (progressPercent < expectedProgress - 10) {
                          return { text: `Behind · ${timeText}`, icon: '⚠', color: '#F59E0B' };
                        }
                        // On track - just show time remaining
                        return { text: timeText, icon: '→', color: 'var(--label-tertiary)' };
                      };

                      const status = getGoalStatus();

                      // Category icons (SVG)
                      const getCategoryIcon = () => {
                        const iconClass = "w-4 h-4";
                        switch (goal.category) {
                          case 'EMERGENCY_FUND':
                            return (
                              <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                              </svg>
                            );
                          case 'RETIREMENT':
                            return (
                              <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                              </svg>
                            );
                          case 'FIRE':
                            return (
                              <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
                              </svg>
                            );
                          case 'HOME':
                            return (
                              <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                              </svg>
                            );
                          case 'EDUCATION':
                            return (
                              <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
                              </svg>
                            );
                          case 'VACATION':
                            return (
                              <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                              </svg>
                            );
                          case 'CAR':
                            return (
                              <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                              </svg>
                            );
                          case 'WEDDING':
                            return (
                              <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                              </svg>
                            );
                          default:
                            return (
                              <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            );
                        }
                      };

                      return (
                        <div key={goal.id} className="px-4 py-2.5 hover:bg-[var(--fill-tertiary)]/30 transition-colors">
                          <div className="flex gap-2.5 items-center">
                            {/* Icon Badge */}
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                              style={{ backgroundColor: `${categoryConfig.color}15`, color: categoryConfig.color }}
                            >
                              {getCategoryIcon()}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              {/* Name and Amount */}
                              <div className="flex items-center justify-between">
                                <span className="text-[13px] font-semibold text-[var(--label-primary)] truncate">
                                  {goal.name}
                                </span>
                                <span className="text-[11px] ml-2 shrink-0">
                                  <span className="font-semibold text-[var(--label-primary)]">{formatCompact(goal.current_value || 0)}</span>
                                  <span className="font-medium text-[var(--label-quaternary)] mx-0.5">/</span>
                                  <span className="font-semibold text-[var(--label-secondary)]">{formatCompact(goal.target_amount)}</span>
                                </span>
                              </div>

                              {/* Progress Bar + Percentage */}
                              <div className="flex items-center gap-2 mt-1">
                                <div className="flex-1 h-[5px] bg-[var(--fill-tertiary)] rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all duration-700 ease-out"
                                    style={{
                                      width: `${progressPercent}%`,
                                      backgroundColor: categoryConfig.color
                                    }}
                                  />
                                </div>
                                <span
                                  className="text-[12px] font-bold shrink-0 w-9 text-right"
                                  style={{ color: categoryConfig.color }}
                                >
                                  {progressPercent.toFixed(0)}%
                                </span>
                              </div>

                              {/* Status - only if notable */}
                              {status && (
                                <div className="mt-1">
                                  <span
                                    className="text-[10px] font-medium"
                                    style={{ color: status.color }}
                                  >
                                    {status.icon} {status.text}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Footer - More Goals */}
                  {activeGoals.length > 3 && (
                    <Link to="/goals" className="block px-4 py-2.5 border-t border-[var(--separator-opaque)]/50 bg-[var(--fill-tertiary)]/20 hover:bg-[var(--fill-tertiary)]/40 transition-colors">
                      <p className="text-[12px] font-medium text-[var(--chart-primary)] text-center">
                        +{activeGoals.length - 3} more goals →
                      </p>
                    </Link>
                  )}
                </Card>
              )}

              {/* Upcoming Maturities Card */}
              {upcomingMaturities.length > 0 && (
                <Card padding="p-0" className="overflow-hidden">
                  <div className="flex items-center gap-3 py-3.5 px-4 bg-gradient-to-r from-[#EC4899]/10 via-[#EC4899]/5 to-transparent">
                    <div className="w-9 h-9 rounded-xl bg-[#EC4899] flex items-center justify-center shadow-sm">
                      <svg className="w-[18px] h-[18px] text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                      </svg>
                    </div>
                    <span className="text-[15px] font-semibold text-[var(--label-primary)]">Maturities</span>
                  </div>

                  {/* Maturity List */}
                  <div className="divide-y divide-[var(--separator-opaque)]/50">
                    {upcomingMaturities.slice(0, 3).map((asset) => {
                      const isUrgent = asset.daysUntilMaturity <= 30;
                      const isSoon = asset.daysUntilMaturity <= 60;
                      return (
                        <div key={asset.id} className="px-4 py-2.5 hover:bg-[var(--fill-tertiary)]/30 transition-colors">
                          <div className="flex items-center gap-2.5">
                            {/* Days Badge */}
                            <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center shrink-0 ${
                              isUrgent ? 'bg-[#EF4444]/10' : isSoon ? 'bg-[#F59E0B]/10' : 'bg-[var(--fill-tertiary)]'
                            }`}>
                              <span className={`text-[13px] font-bold leading-none ${
                                isUrgent ? 'text-[#EF4444]' : isSoon ? 'text-[#F59E0B]' : 'text-[var(--label-primary)]'
                              }`}>
                                {asset.daysUntilMaturity}
                              </span>
                              <span className={`text-[9px] font-medium ${
                                isUrgent ? 'text-[#EF4444]' : isSoon ? 'text-[#F59E0B]' : 'text-[var(--label-tertiary)]'
                              }`}>
                                days
                              </span>
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="text-[13px] font-semibold text-[var(--label-primary)] truncate">
                                  {asset.name}
                                </span>
                                <span className="text-[12px] font-semibold text-[var(--label-primary)] ml-2 shrink-0">
                                  {formatCompact(asset.maturityValue)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between mt-0.5">
                                <span className="text-[11px] text-[var(--label-tertiary)]">
                                  {asset.asset_type} • {asset.institution || 'N/A'}
                                </span>
                                <span className="text-[10px] text-[var(--label-tertiary)]">
                                  {asset.formattedDate}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Footer */}
                  {upcomingMaturities.length > 3 && (
                    <Link to="/assets" className="block px-4 py-2.5 border-t border-[var(--separator-opaque)]/50 bg-[var(--fill-tertiary)]/20 hover:bg-[var(--fill-tertiary)]/40 transition-colors">
                      <p className="text-[12px] font-medium text-[var(--chart-primary)] text-center">
                        +{upcomingMaturities.length - 3} more →
                      </p>
                    </Link>
                  )}
                </Card>
              )}
            </motion.div>

            {/* Right Column - Chart + Category Performance */}
            <motion.div variants={staggerItem} className="lg:col-span-9 space-y-4">
              <Card padding="p-0" className="overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between py-3.5 px-5 bg-gradient-to-r from-[var(--chart-primary)]/10 via-[var(--chart-primary)]/5 to-transparent">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[var(--chart-primary)] flex items-center justify-center shadow-sm">
                      <svg className="w-[18px] h-[18px] text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                      </svg>
                    </div>
                    <span className="text-[15px] font-semibold text-[var(--label-primary)]">Investment Journey</span>
                  </div>
                  {/* Export Button */}
                  <button
                    onClick={handleExportPDF}
                    disabled={assets.length === 0}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--fill-tertiary)] border border-[var(--separator-opaque)] text-[var(--label-primary)] hover:bg-[var(--fill-secondary)] transition-colors disabled:opacity-50 text-[13px] font-semibold"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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

                  {/* Period Selector - Sliding Pill */}
                  {assets.length > 0 && (
                    <div className="flex gap-1 p-1 bg-[var(--fill-tertiary)]/50 rounded-lg w-fit">
                      {periods.map((period) => (
                        <motion.button
                          key={period}
                          whileTap={tapScale}
                          onClick={() => handlePeriodChange(period)}
                          className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors relative z-10 ${
                            selectedPeriod === period
                              ? 'text-[var(--label-primary)]'
                              : 'text-[var(--label-tertiary)] hover:text-[var(--label-secondary)]'
                          }`}
                        >
                          {selectedPeriod === period && (
                            <motion.div
                              layoutId="periodIndicator"
                              className="absolute inset-0 bg-[var(--bg-primary)] rounded-md shadow-sm"
                              transition={{ type: "spring", stiffness: 400, damping: 30 }}
                              style={{ zIndex: -1 }}
                            />
                          )}
                          {period}
                        </motion.button>
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
              <Card padding="p-0" className="hidden lg:block overflow-hidden">
                <div className="flex items-center justify-between py-3.5 px-4 bg-gradient-to-r from-[var(--system-purple)]/10 via-[var(--system-purple)]/5 to-transparent">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[var(--system-purple)] flex items-center justify-center shadow-sm">
                      <svg className="w-[18px] h-[18px] text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    </div>
                    <span className="text-[15px] font-semibold text-[var(--label-primary)]">Holdings</span>
                    <span className="text-[12px] text-[var(--label-tertiary)]">({holdings.length} assets)</span>
                  </div>
                  <Link to="/assets" className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--fill-tertiary)] border border-[var(--separator-opaque)] text-[var(--label-primary)] hover:bg-[var(--fill-secondary)] transition-colors text-[13px] font-semibold">
                    View All
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
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
                              {cat.isEquity && !pricesLoaded ? (
                                <div className="flex items-center justify-end gap-2">
                                  <svg className="w-4 h-4 animate-spin text-[var(--label-tertiary)]" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                  </svg>
                                  <span className="text-[12px] text-[var(--label-tertiary)]">Loading...</span>
                                </div>
                              ) : (
                                <>
                                  <p className={`text-[14px] font-semibold ${cat.pnl >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                                    {cat.pnl >= 0 ? '+' : ''}{formatCompact(cat.pnl)}
                                  </p>
                                  <p className={`text-[11px] ${cat.pnlPercent >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                                    {cat.pnlPercent >= 0 ? '+' : ''}{cat.pnlPercent.toFixed(1)}%
                                  </p>
                                </>
                              )}
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
