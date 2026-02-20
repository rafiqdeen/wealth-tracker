import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { assetService } from '../services/assets';
import { goalService, GOAL_CATEGORIES } from '../services/goals';
import { Card, PageSpinner } from '../components/apple';
import { spring, tapScale, panelVariants } from '../utils/animations';
import { getAssetValue as getAssetValuePure, getInvestedValue as getInvestedValuePure } from '../utils/portfolio';
import SidebarItem from '../components/shared/SidebarItem';
import { categoryColors } from '../constants/theme';
import { formatCurrency } from '../utils/formatting';
import { calculateFixedIncomeValue, getCompoundingFrequency, generateRecurringDepositSchedule } from '../utils/interest';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { usePrices } from '../context/PriceContext';
import { metalService, PURITY_FACTORS } from '../services/metals';
import {
  PortfolioSummaryReport,
  HoldingsReport,
  PerformanceReport,
  GoalProgressReport,
  TaxSummaryReport,
  TransactionHistoryReport,
} from '../components/reports';

const SIDEBAR_ITEMS = [
  {
    id: 'portfolio-summary',
    label: 'Portfolio',
    icon: (props) => (
      <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
      </svg>
    ),
    color: 'var(--chart-primary)',
  },
  {
    id: 'holdings',
    label: 'Holdings',
    icon: (props) => (
      <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
    color: 'var(--system-green)',
  },
  {
    id: 'performance',
    label: 'Performance',
    icon: (props) => (
      <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
    color: 'var(--system-purple)',
  },
  {
    id: 'goals',
    label: 'Goals',
    icon: (props) => (
      <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
      </svg>
    ),
    color: 'var(--system-amber)',
  },
  {
    id: 'tax',
    label: 'Tax Summary',
    icon: (props) => (
      <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    color: 'var(--system-red)',
  },
  {
    id: 'transactions',
    label: 'Transactions',
    icon: (props) => (
      <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: 'var(--chart-primary)',
  },
];

const REPORT_TITLES = {
  'portfolio-summary': 'Portfolio Summary',
  'holdings': 'Holdings Report',
  'performance': 'Performance Analysis',
  'goals': 'Goal Progress Report',
  'tax': 'Tax Summary',
  'transactions': 'Transaction History',
};

// Colors for asset type breakdown
const groupColors = {
  EQUITY_STOCKS: 'var(--chart-primary)',
  EQUITY_MF: 'var(--system-purple)',
  ETF: 'var(--chart-primary)',
  MUTUAL_FUND: 'var(--system-purple)',
  STOCK: 'var(--chart-primary)',
  FD: 'var(--system-green)',
  PPF: 'var(--system-green)',
  RD: '#0D9488',
  EPF: '#0D9488',
  NPS: 'var(--chart-primary)',
  BONDS: 'var(--chart-primary)',
  GOLD: 'var(--system-amber)',
  SILVER: '#78716C',
  LAND: '#C2622D',
  PROPERTY: 'var(--system-red)',
  REIT: '#C2622D',
  SAVINGS_ACCOUNT: 'var(--system-purple)',
  CRYPTOCURRENCY: 'var(--system-red)',
  LIC: 'var(--chart-primary)',
  OTHER: '#6B7280',
};

export default function Reports() {
  const toast = useToast();
  const { user } = useAuth();
  const { prices, fetchPrices } = usePrices();

  const [loading, setLoading] = useState(true);
  const [activeReport, setActiveReport] = useState('portfolio-summary');

  // Raw data
  const [assets, setAssets] = useState([]);
  const [goals, setGoals] = useState([]);
  const [fixedIncomeCalcs, setFixedIncomeCalcs] = useState({});
  const [metalPrices, setMetalPrices] = useState({});

  // Lazy-loaded transaction data
  const [transactionsData, setTransactionsData] = useState(null);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const transactionsFetched = useRef(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [assetsRes, goalsRes] = await Promise.all([
        assetService.getAll(),
        goalService.getAll(),
      ]);
      const assetList = assetsRes.data.assets || [];
      setAssets(assetList);
      setGoals(goalsRes.data.goals || []);

      // Fetch prices for equity assets via shared PriceContext
      const equityAssets = assetList.filter(a => a.category === 'EQUITY' && a.symbol);
      if (equityAssets.length > 0) {
        try {
          await fetchPrices(equityAssets);
        } catch (e) {
          console.error('Failed to fetch prices:', e);
        }
      }

      // Fetch metal prices for gold/silver
      const hasGold = assetList.some(a => a.category === 'PHYSICAL' && a.asset_type === 'GOLD');
      const hasSilver = assetList.some(a => a.category === 'PHYSICAL' && a.asset_type === 'SILVER');
      if (hasGold || hasSilver) {
        try {
          const fetches = [];
          if (hasGold) fetches.push(metalService.getPrice('gold').then(r => ({ metal: 'gold', data: r.data })));
          if (hasSilver) fetches.push(metalService.getPrice('silver').then(r => ({ metal: 'silver', data: r.data })));
          const results = await Promise.all(fetches);
          const mp = {};
          for (const { metal, data } of results) {
            mp[metal] = { pricePerGram24K: data.pricePerGram24K, purityPrices: data.purityPrices };
          }
          setMetalPrices(mp);
        } catch (e) {
          console.error('Error fetching metal prices:', e);
        }
      }

      // Calculate Fixed Income values
      const fixedIncomeAssetsList = assetList.filter(a => a.category === 'FIXED_INCOME' && a.interest_rate);
      if (fixedIncomeAssetsList.length > 0) {
        const calcs = {};
        const recurringDepositTypes = ['PPF', 'RD', 'EPF', 'VPF', 'SSY'];

        await Promise.all(fixedIncomeAssetsList.map(async (asset) => {
          try {
            const txnRes = await assetService.getTransactions(asset.id);
            const transactions = txnRes.data.transactions || [];
            const compoundingFreq = getCompoundingFrequency(asset.asset_type);
            const isRecurring = recurringDepositTypes.includes(asset.asset_type);

            if (transactions.length > 0) {
              if (asset.asset_type === 'PPF') {
                const ppfResult = generateRecurringDepositSchedule(transactions, asset.interest_rate, asset.start_date);
                if (ppfResult) {
                  calcs[asset.id] = {
                    principal: ppfResult.summary.totalDeposited,
                    currentValue: ppfResult.summary.currentValue,
                    interest: ppfResult.summary.totalInterest,
                  };
                }
              } else {
                const calculation = calculateFixedIncomeValue(transactions, asset.interest_rate, new Date(), compoundingFreq);
                calcs[asset.id] = calculation;
              }
            } else if (asset.principal) {
              if (!isRecurring) {
                const startDate = asset.start_date || asset.created_at?.split('T')[0] || new Date().toISOString().split('T')[0];
                const fakeTransaction = [{ type: 'BUY', total_amount: asset.principal, transaction_date: startDate }];
                const calculation = calculateFixedIncomeValue(fakeTransaction, asset.interest_rate, new Date(), compoundingFreq);
                calcs[asset.id] = calculation;
              } else {
                calcs[asset.id] = { principal: asset.principal, currentValue: asset.principal, interest: 0 };
              }
            }
          } catch (e) {
            console.error(`Failed to calculate for asset ${asset.id}:`, e);
          }
        }));

        setFixedIncomeCalcs(calcs);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Helper functions
  const valueDeps = useMemo(() => ({ prices, fixedIncomeCalcs, metalPrices, PURITY_FACTORS }), [prices, fixedIncomeCalcs, metalPrices]);
  const getAssetValue = useCallback((asset) => getAssetValuePure(asset, valueDeps), [valueDeps]);
  const getInvestedValue = useCallback((asset) => getInvestedValuePure(asset, { fixedIncomeCalcs }), [fixedIncomeCalcs]);

  // Eagerly computed report data
  const reportData = useMemo(() => {
    if (loading) return {};
    const generatedAt = new Date().toISOString();

    // Portfolio metrics
    let totalInvested = 0;
    let totalCurrentValue = 0;
    const categoryBreakdown = {};
    const assetTypeBreakdown = {};

    assets.forEach(asset => {
      const invested = getInvestedValue(asset);
      const currentValue = getAssetValue(asset) || 0;
      const category = asset.category || 'OTHER';
      const assetType = asset.asset_type || 'OTHER';

      totalInvested += invested;
      totalCurrentValue += currentValue;

      if (!categoryBreakdown[category]) {
        categoryBreakdown[category] = { invested: 0, current: 0, count: 0, color: categoryColors[category]?.color || '#6B7280' };
      }
      categoryBreakdown[category].invested += invested;
      categoryBreakdown[category].current += currentValue;
      categoryBreakdown[category].count += 1;

      if (!assetTypeBreakdown[assetType]) {
        assetTypeBreakdown[assetType] = { invested: 0, current: 0, count: 0, color: groupColors[assetType] || '#6B7280', category };
      }
      assetTypeBreakdown[assetType].invested += invested;
      assetTypeBreakdown[assetType].current += currentValue;
      assetTypeBreakdown[assetType].count += 1;
    });

    const totalGain = totalCurrentValue - totalInvested;
    const totalGainPercent = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

    let totalInterestEarned = 0;
    Object.values(fixedIncomeCalcs).forEach(calc => {
      if (calc.interest) totalInterestEarned += calc.interest;
    });

    // Holdings
    const holdingsAssets = assets.map(asset => {
      const invested = getInvestedValue(asset);
      const currentValue = getAssetValue(asset) || 0;
      return {
        ...asset,
        typeName: asset.asset_type,
        invested,
        currentValue,
        gain: currentValue - invested,
        gainPercent: invested > 0 ? ((currentValue - invested) / invested) * 100 : 0,
      };
    }).sort((a, b) => b.currentValue - a.currentValue);

    // Performance
    const assetPerformance = assets.map(asset => {
      const invested = getInvestedValue(asset);
      const currentValue = getAssetValue(asset) || 0;
      const gain = currentValue - invested;
      const gainPercent = invested > 0 ? (gain / invested) * 100 : 0;
      return { ...asset, invested, currentValue, gain, gainPercent };
    });
    const topPerformers = [...assetPerformance].sort((a, b) => b.gainPercent - a.gainPercent).slice(0, 5);
    const bottomPerformers = [...assetPerformance].sort((a, b) => a.gainPercent - b.gainPercent).slice(0, 5);
    const categoryPerformance = {};
    assetPerformance.forEach(asset => {
      const cat = asset.category || 'OTHER';
      if (!categoryPerformance[cat]) {
        categoryPerformance[cat] = { invested: 0, current: 0, gain: 0 };
      }
      categoryPerformance[cat].invested += asset.invested;
      categoryPerformance[cat].current += asset.currentValue;
      categoryPerformance[cat].gain += asset.gain;
    });

    // Goals
    const goalsData = goals.map(goal => ({
      ...goal,
      categoryConfig: GOAL_CATEGORIES[goal.category] || GOAL_CATEGORIES.CUSTOM,
      progress: goal.target_amount > 0 ? ((goal.current_value || 0) / goal.target_amount) * 100 : 0,
      remaining: goal.target_amount - (goal.current_value || 0),
    }));
    const goalsSummary = {
      total: goals.length,
      completed: goals.filter(g => (g.current_value || 0) >= g.target_amount).length,
      inProgress: goals.filter(g => g.current_value > 0 && g.current_value < g.target_amount).length,
      totalTarget: goals.reduce((sum, g) => sum + (g.target_amount || 0), 0),
      totalProgress: goals.reduce((sum, g) => sum + (g.current_value || 0), 0),
    };

    // Tax
    let taxableInterestIncome = 0;
    let taxExemptInterestIncome = 0;
    let totalCapitalGains = 0;
    const taxExemptTypes = ['PPF', 'EPF', 'VPF', 'SSY'];

    assets.filter(a => a.category === 'FIXED_INCOME').forEach(asset => {
      const calc = fixedIncomeCalcs[asset.id];
      const interest = calc?.interest || 0;
      if (taxExemptTypes.includes(asset.asset_type)) {
        taxExemptInterestIncome += interest;
      } else {
        taxableInterestIncome += interest;
      }
    });

    assets.filter(a => a.category === 'EQUITY').forEach(asset => {
      const invested = getInvestedValue(asset);
      const currentValue = getAssetValue(asset) || 0;
      if (currentValue > invested) {
        totalCapitalGains += (currentValue - invested);
      }
    });

    const fixedIncomeAssetsList = assets.filter(a => a.category === 'FIXED_INCOME').map(asset => {
      const calc = fixedIncomeCalcs[asset.id];
      const isTaxExempt = taxExemptTypes.includes(asset.asset_type);
      return {
        ...asset,
        principal: calc?.principal || asset.principal || 0,
        interest: calc?.interest || 0,
        isTaxExempt,
      };
    });

    // Category allocation with returnPercent for PortfolioSummaryReport
    const categoryAllocation = Object.entries(assetTypeBreakdown)
      .map(([name, data]) => {
        const returnPercent = data.invested > 0 ? ((data.current - data.invested) / data.invested) * 100 : 0;
        return {
          key: name,
          label: name.replace(/_/g, ' '),
          value: data.current,
          invested: data.invested,
          color: data.color,
          count: data.count,
          percent: totalCurrentValue > 0 ? (data.current / totalCurrentValue) * 100 : 0,
          returnPercent,
        };
      })
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);

    return {
      generatedAt,
      // Summary
      totalInvested,
      totalCurrentValue,
      totalGain,
      totalGainPercent,
      totalInterestEarned,
      assetCount: assets.length,
      // Portfolio
      categoryBreakdown,
      assetTypeBreakdown,
      categoryAllocation,
      // Holdings
      holdingsAssets,
      // Performance
      topPerformers,
      bottomPerformers,
      categoryPerformance,
      // Goals
      goalsData,
      goalsSummary,
      // Tax
      taxableInterestIncome,
      taxExemptInterestIncome,
      totalInterestIncome: taxableInterestIncome + taxExemptInterestIncome,
      totalDividendIncome: 0,
      totalCapitalGains,
      totalTaxableIncome: taxableInterestIncome + totalCapitalGains,
      fixedIncomeAssetsList,
    };
  }, [assets, goals, fixedIncomeCalcs, prices, metalPrices, loading, getAssetValue, getInvestedValue]);

  // Lazy-load transactions when tab is first selected
  useEffect(() => {
    if (activeReport === 'transactions' && !transactionsFetched.current && assets.length > 0) {
      transactionsFetched.current = true;
      setTransactionsLoading(true);

      const fetchTransactions = async () => {
        const allTransactions = [];
        await Promise.all(assets.map(async (asset) => {
          try {
            const txnRes = await assetService.getTransactions(asset.id);
            const transactions = txnRes.data.transactions || [];
            transactions.forEach(txn => {
              allTransactions.push({
                ...txn,
                assetName: asset.name,
                assetType: asset.asset_type,
                category: asset.category,
              });
            });
          } catch (e) {
            console.error(`Failed to fetch transactions for asset ${asset.id}:`, e);
          }
        }));

        allTransactions.sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));

        const totalBuys = allTransactions.filter(t => t.type === 'BUY').reduce((sum, t) => sum + (t.total_amount || 0), 0);
        const totalSells = allTransactions.filter(t => t.type === 'SELL').reduce((sum, t) => sum + (t.total_amount || 0), 0);

        setTransactionsData({
          transactions: allTransactions,
          summary: {
            totalTransactions: allTransactions.length,
            totalBuys,
            totalSells,
            netFlow: totalBuys - totalSells,
          },
          generatedAt: new Date().toISOString(),
        });
        setTransactionsLoading(false);
      };

      fetchTransactions();
    }
  }, [activeReport, assets]);

  // Export to CSV
  const exportToCSV = () => {
    let csvContent = '';
    const timestamp = new Date().toISOString().split('T')[0];

    if (activeReport === 'holdings' && reportData.holdingsAssets) {
      csvContent = 'Name,Type,Category,Invested,Current Value,Gain/Loss,Gain %\n';
      reportData.holdingsAssets.forEach(asset => {
        csvContent += `"${asset.name}","${asset.typeName}","${asset.category}",${asset.invested.toFixed(2)},${asset.currentValue.toFixed(2)},${asset.gain.toFixed(2)},${asset.gainPercent.toFixed(2)}%\n`;
      });
    } else if (activeReport === 'portfolio-summary') {
      csvContent = 'Metric,Value\n';
      csvContent += `Total Invested,${reportData.totalInvested?.toFixed(2) || 0}\n`;
      csvContent += `Current Value,${reportData.totalCurrentValue?.toFixed(2) || 0}\n`;
      csvContent += `Total Gain/Loss,${reportData.totalGain?.toFixed(2) || 0}\n`;
      csvContent += `Return %,${reportData.totalGainPercent?.toFixed(2) || 0}%\n`;
      csvContent += `Total Assets,${reportData.assetCount || 0}\n`;
    } else if (activeReport === 'transactions' && transactionsData?.transactions) {
      csvContent = 'Date,Asset,Type,Quantity,Amount\n';
      transactionsData.transactions.forEach(txn => {
        csvContent += `"${new Date(txn.transaction_date).toLocaleDateString('en-IN')}","${txn.assetName}","${txn.type}",${txn.quantity || ''},${(txn.total_amount || 0).toFixed(2)}\n`;
      });
    } else if (activeReport === 'performance') {
      csvContent = 'Metric,Value\n';
      csvContent += `Total Invested,${reportData.totalInvested?.toFixed(2) || 0}\n`;
      csvContent += `Current Value,${reportData.totalCurrentValue?.toFixed(2) || 0}\n`;
      csvContent += `Total Gain/Loss,${reportData.totalGain?.toFixed(2) || 0}\n`;
      csvContent += `Return %,${reportData.totalGainPercent?.toFixed(2) || 0}%\n`;
    } else if (activeReport === 'tax') {
      csvContent = 'Income Type,Amount\n';
      csvContent += `Taxable Interest,${(reportData.taxableInterestIncome || 0).toFixed(2)}\n`;
      csvContent += `Tax-Exempt Interest,${(reportData.taxExemptInterestIncome || 0).toFixed(2)}\n`;
      csvContent += `Capital Gains,${(reportData.totalCapitalGains || 0).toFixed(2)}\n`;
      csvContent += `Total Taxable,${(reportData.totalTaxableIncome || 0).toFixed(2)}\n`;
    } else if (activeReport === 'goals') {
      csvContent = 'Goal,Target,Current,Progress %\n';
      (reportData.goalsData || []).forEach(goal => {
        csvContent += `"${goal.name}",${(goal.target_amount || 0).toFixed(2)},${(goal.current_value || 0).toFixed(2)},${(goal.progress || 0).toFixed(1)}%\n`;
      });
    } else {
      csvContent = 'Report data not available for CSV export';
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${activeReport}-report-${timestamp}.csv`;
    link.click();
    toast.success('Report exported to CSV');
  };

  // Print report
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    const dateStr = new Date(reportData.generatedAt || Date.now()).toLocaleDateString('en-IN', { dateStyle: 'full' });
    const userName = user?.name || 'User';
    let content = '';

    // Color constants for print (matching app CSS vars)
    const C = { green: '#1A7A5C', red: '#C03744', amber: '#B8860B', blue: '#3D6B9E', purple: '#6B5CA5', gray: '#6B7280' };

    // Helper: progress bar HTML
    const progressBar = (percent, color) =>
      `<div class="progress-track"><div class="progress-fill" style="width:${Math.min(percent, 100)}%;background:${color}"></div></div>`;

    // Helper: badge HTML
    const badge = (text, variant = 'default') => {
      const styles = {
        buy: `background:${C.green}15;color:${C.green}`,
        sell: `background:${C.red}15;color:${C.red}`,
        exempt: `background:${C.green}15;color:${C.green}`,
        taxable: `background:#f1f5f9;color:${C.gray}`,
        default: `background:#f1f5f9;color:${C.gray}`,
        completed: `background:${C.green}15;color:${C.green}`,
        progress: `background:${C.amber}15;color:${C.amber}`,
      };
      return `<span class="badge" style="${styles[variant] || styles.default}">${text}</span>`;
    };

    if (activeReport === 'portfolio-summary') {
      const allocationData = (reportData.categoryAllocation || []).filter(d => d.value > 0);
      const bestCat = allocationData.length > 0 ? allocationData.reduce((b, c) => (c.returnPercent || 0) > (b.returnPercent || 0) ? c : b, allocationData[0]) : null;
      const worstCat = allocationData.length > 0 ? allocationData.reduce((w, c) => (c.returnPercent || 0) < (w.returnPercent || 0) ? c : w, allocationData[0]) : null;
      const gainIsPos = (reportData.totalGain || 0) >= 0;

      content = `
        <h1>Portfolio Summary</h1>
        <p class="subtitle">Generated for ${userName} on ${dateStr}</p>

        <div class="hero" style="background:linear-gradient(135deg,#f8fafc 0%,#f1f5f9 100%);border:1px solid #e2e8f0">
          <div class="hero-label">Total Portfolio Value</div>
          <div class="hero-value">${formatCurrency(reportData.totalCurrentValue || 0)}</div>
          <div class="hero-sub ${gainIsPos ? 'positive' : 'negative'}" style="font-size:15px;font-weight:600;margin-top:4px">
            ${gainIsPos ? '+' : ''}${formatCurrency(reportData.totalGain || 0)} (${gainIsPos ? '+' : ''}${(reportData.totalGainPercent || 0).toFixed(2)}%)
          </div>
        </div>

        <div class="stat-grid">
          <div class="stat-card"><div class="label">Invested</div><div class="value">${formatCurrency(reportData.totalInvested || 0)}</div></div>
          <div class="stat-card"><div class="label">Current Value</div><div class="value">${formatCurrency(reportData.totalCurrentValue || 0)}</div></div>
          <div class="stat-card"><div class="label">Total Gain/Loss</div><div class="value ${gainIsPos ? 'positive' : 'negative'}">${gainIsPos ? '+' : ''}${formatCurrency(reportData.totalGain || 0)}</div></div>
          <div class="stat-card"><div class="label">Assets</div><div class="value">${reportData.assetCount || 0}</div></div>
        </div>

        <h2>Asset Allocation</h2>
        <div class="alloc-list">
          ${allocationData.map(cat => {
            const retColor = (cat.returnPercent || 0) > 0 ? C.green : (cat.returnPercent || 0) < 0 ? C.red : C.gray;
            return `<div class="alloc-row">
              <div class="alloc-dot" style="background:${cat.color}"></div>
              <div class="alloc-name">${cat.label}</div>
              <div class="alloc-value">${formatCurrency(cat.value)}</div>
              <div class="alloc-pct">${cat.percent.toFixed(1)}%</div>
              <div class="alloc-ret" style="color:${retColor}">${(cat.returnPercent || 0) > 0 ? '+' : ''}${(cat.returnPercent || 0).toFixed(1)}%</div>
            </div>`;
          }).join('')}
        </div>

        ${bestCat && worstCat ? `
          <div class="two-col" style="margin-top:20px">
            <div class="highlight-card" style="background:${C.green}0D;border:1px solid ${C.green}25">
              <div class="hl-label" style="color:${C.green}">Best Category</div>
              <div class="hl-name">${bestCat.label}</div>
              <div class="hl-value" style="color:${C.green}">+${(bestCat.returnPercent || 0).toFixed(1)}%</div>
            </div>
            <div class="highlight-card" style="background:${C.red}0D;border:1px solid ${C.red}25">
              <div class="hl-label" style="color:${C.red}">Worst Category</div>
              <div class="hl-name">${worstCat.label}</div>
              <div class="hl-value" style="color:${C.red}">${(worstCat.returnPercent || 0).toFixed(1)}%</div>
            </div>
          </div>
        ` : ''}
      `;
    } else if (activeReport === 'holdings') {
      const sorted = [...(reportData.holdingsAssets || [])].sort((a, b) => b.currentValue - a.currentValue);
      const topHolding = sorted[0];
      const totalVal = sorted.reduce((s, a) => s + (a.currentValue || 0), 0);

      // Group by category
      const typeGroups = {};
      sorted.forEach(a => {
        const cat = a.category || 'OTHER';
        if (!typeGroups[cat]) typeGroups[cat] = { label: cat.replace(/_/g, ' '), count: 0, value: 0 };
        typeGroups[cat].count += 1;
        typeGroups[cat].value += a.currentValue || 0;
      });
      const typeList = Object.entries(typeGroups).map(([k, d]) => ({ ...d, key: k, pct: totalVal > 0 ? (d.value / totalVal) * 100 : 0 })).sort((a, b) => b.value - a.value);

      content = `
        <h1>Holdings Report</h1>
        <p class="subtitle">${sorted.length} assets as of ${dateStr}</p>

        ${topHolding ? `
          <div class="hero" style="background:linear-gradient(135deg,${C.green}0D 0%,${C.green}08 100%);border:1px solid ${C.green}25;text-align:left">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <div class="hl-label" style="color:${C.green};margin:0">Top Holding</div>
              ${badge(topHolding.typeName || topHolding.asset_type)}
            </div>
            <div style="font-size:16px;font-weight:600;color:#1a1d29;margin-bottom:4px">${topHolding.name}</div>
            <div style="display:flex;align-items:baseline;gap:12px">
              <span class="hero-value" style="font-size:32px">${formatCurrency(topHolding.currentValue)}</span>
              <span style="font-size:14px;font-weight:600;color:${(topHolding.gainPercent || 0) >= 0 ? C.green : C.red}">${(topHolding.gainPercent || 0) >= 0 ? '+' : ''}${(topHolding.gainPercent || 0).toFixed(1)}%</span>
            </div>
          </div>
        ` : ''}

        <h2>By Category</h2>
        <div class="alloc-list">
          ${typeList.map(g => `<div class="alloc-row">
            <div class="alloc-name">${g.label}</div>
            <div style="font-size:11px;color:${C.gray};background:#f1f5f9;padding:1px 6px;border-radius:4px;font-weight:600">${g.count}</div>
            <div class="alloc-value">${formatCurrency(g.value)}</div>
            <div class="alloc-pct">${g.pct.toFixed(1)}%</div>
          </div>`).join('')}
        </div>

        <h2>All Holdings</h2>
        <table>
          <thead><tr><th>Asset</th><th>Type</th><th class="r">Invested</th><th class="r">Current Value</th><th class="r">Gain/Loss</th><th class="r">Return</th></tr></thead>
          <tbody>${sorted.map(a => `<tr>
            <td>${a.name}</td>
            <td>${badge(a.typeName || a.asset_type)}</td>
            <td class="r">${formatCurrency(a.invested)}</td>
            <td class="r" style="font-weight:600">${formatCurrency(a.currentValue)}</td>
            <td class="r ${a.gain >= 0 ? 'positive' : 'negative'}">${a.gain >= 0 ? '+' : ''}${formatCurrency(a.gain)}</td>
            <td class="r ${a.gainPercent >= 0 ? 'positive' : 'negative'}" style="font-weight:600">${a.gainPercent >= 0 ? '+' : ''}${a.gainPercent.toFixed(1)}%</td>
          </tr>`).join('')}</tbody>
          <tfoot><tr>
            <td colspan="2"><strong>Total (${sorted.length} assets)</strong></td>
            <td class="r"><strong>${formatCurrency(reportData.totalInvested || 0)}</strong></td>
            <td class="r"><strong>${formatCurrency(reportData.totalCurrentValue || 0)}</strong></td>
            <td class="r ${(reportData.totalGain || 0) >= 0 ? 'positive' : 'negative'}"><strong>${(reportData.totalGain || 0) >= 0 ? '+' : ''}${formatCurrency(reportData.totalGain || 0)}</strong></td>
            <td class="r ${(reportData.totalGainPercent || 0) >= 0 ? 'positive' : 'negative'}"><strong>${(reportData.totalGainPercent || 0) >= 0 ? '+' : ''}${(reportData.totalGainPercent || 0).toFixed(1)}%</strong></td>
          </tr></tfoot>
        </table>
      `;
    } else if (activeReport === 'performance') {
      const topGainer = (reportData.topPerformers || [])[0];
      const gainers = (reportData.topPerformers || []).filter(a => (a.gainPercent || 0) > 0);
      const losers = (reportData.bottomPerformers || []).filter(a => (a.gainPercent || 0) < 0);
      const maxGain = Math.max(...gainers.map(a => Math.abs(a.gainPercent || 0)), 1);
      const maxLoss = Math.max(...losers.map(a => Math.abs(a.gainPercent || 0)), 1);

      content = `
        <h1>Performance Analysis</h1>
        <p class="subtitle">Generated for ${userName} on ${dateStr}</p>

        ${topGainer && (topGainer.gainPercent || 0) > 0 ? `
          <div class="hero" style="background:linear-gradient(135deg,${C.purple}0D 0%,${C.purple}08 100%);border:1px solid ${C.purple}25;text-align:left">
            <div class="hl-label" style="color:${C.purple};margin-bottom:8px">Top Performer</div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span style="font-size:16px;font-weight:600;color:#1a1d29">${topGainer.name}</span>
              ${badge(topGainer.asset_type)}
            </div>
            <div style="display:flex;align-items:baseline;gap:12px">
              <span class="hero-value" style="font-size:32px;color:${C.purple}">+${(topGainer.gainPercent || 0).toFixed(1)}%</span>
              <span style="font-size:14px;color:${C.purple}99">+${formatCurrency(topGainer.gain)}</span>
            </div>
          </div>
        ` : ''}

        <div class="stat-grid">
          <div class="stat-card"><div class="label">Invested</div><div class="value">${formatCurrency(reportData.totalInvested || 0)}</div></div>
          <div class="stat-card"><div class="label">Current Value</div><div class="value">${formatCurrency(reportData.totalCurrentValue || 0)}</div></div>
          <div class="stat-card"><div class="label">Total Gain/Loss</div><div class="value ${(reportData.totalGain || 0) >= 0 ? 'positive' : 'negative'}">${(reportData.totalGain || 0) >= 0 ? '+' : ''}${formatCurrency(reportData.totalGain || 0)}</div></div>
          <div class="stat-card"><div class="label">Overall Return</div><div class="value ${(reportData.totalGainPercent || 0) >= 0 ? 'positive' : 'negative'}">${(reportData.totalGainPercent || 0) >= 0 ? '+' : ''}${(reportData.totalGainPercent || 0).toFixed(2)}%</div></div>
        </div>

        <div class="two-col">
          <div>
            <h2 style="color:${C.green}">Top Gainers</h2>
            ${gainers.length > 0 ? gainers.map((a, i) => `<div class="performer-row">
              <div class="perf-rank">${i + 1}</div>
              <div class="perf-info">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
                  <span class="perf-name">${a.name} ${badge(a.asset_type)}</span>
                  <span class="positive" style="font-weight:700;font-size:13px">+${(a.gainPercent || 0).toFixed(1)}%</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:11px;color:${C.gray}">
                  <span>${formatCurrency(a.currentValue)}</span>
                  <span class="positive">+${formatCurrency(a.gain)}</span>
                </div>
                ${progressBar(Math.abs(a.gainPercent || 0) / maxGain * 100, C.green)}
              </div>
            </div>`).join('') : '<p style="color:#94a3b8;font-size:12px">No gainers</p>'}
          </div>
          <div>
            <h2 style="color:${C.red}">Top Losers</h2>
            ${losers.length > 0 ? losers.map((a, i) => `<div class="performer-row">
              <div class="perf-rank">${i + 1}</div>
              <div class="perf-info">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
                  <span class="perf-name">${a.name} ${badge(a.asset_type)}</span>
                  <span class="negative" style="font-weight:700;font-size:13px">${(a.gainPercent || 0).toFixed(1)}%</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:11px;color:${C.gray}">
                  <span>${formatCurrency(a.currentValue)}</span>
                  <span class="negative">${formatCurrency(a.gain)}</span>
                </div>
                ${progressBar(Math.abs(a.gainPercent || 0) / maxLoss * 100, C.red)}
              </div>
            </div>`).join('') : '<p style="color:#94a3b8;font-size:12px">No losers</p>'}
          </div>
        </div>

        <h2>Category Performance</h2>
        <table>
          <thead><tr><th>Category</th><th class="r">Invested</th><th class="r">Current</th><th class="r">Gain/Loss</th><th class="r">Return</th></tr></thead>
          <tbody>${Object.entries(reportData.categoryPerformance || {}).map(([cat, d]) => {
            const pct = d.invested > 0 ? ((d.current - d.invested) / d.invested) * 100 : 0;
            return `<tr>
              <td style="font-weight:500">${cat.replace(/_/g, ' ')}</td>
              <td class="r">${formatCurrency(d.invested)}</td>
              <td class="r" style="font-weight:600">${formatCurrency(d.current)}</td>
              <td class="r ${d.gain >= 0 ? 'positive' : 'negative'}">${d.gain >= 0 ? '+' : ''}${formatCurrency(d.gain)}</td>
              <td class="r ${pct >= 0 ? 'positive' : 'negative'}" style="font-weight:600">${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      `;
    } else if (activeReport === 'goals') {
      const totalGoals = reportData.goalsSummary?.total || 0;
      const completed = reportData.goalsSummary?.completed || 0;
      const totalTarget = reportData.goalsSummary?.totalTarget || 0;
      const totalProgress = reportData.goalsSummary?.totalProgress || 0;
      const overallPct = totalTarget > 0 ? Math.min((totalProgress / totalTarget) * 100, 100) : 0;
      const progressColor = overallPct >= 70 ? C.green : overallPct >= 40 ? C.amber : C.red;
      const level = overallPct >= 70 ? 'On Track' : overallPct >= 40 ? 'Needs Attention' : 'Getting Started';

      content = `
        <h1>Goal Progress Report</h1>
        <p class="subtitle">Generated on ${dateStr}</p>

        <div class="hero" style="background:linear-gradient(135deg,#f8fafc 0%,#f1f5f9 100%);border:1px solid #e2e8f0">
          <div class="hero-label">Overall Goal Progress</div>
          <div class="hero-value" style="color:${progressColor}">${overallPct.toFixed(0)}%</div>
          <div style="display:inline-block;padding:4px 14px;border-radius:20px;font-size:13px;font-weight:600;margin-top:6px;background:${progressColor}15;color:${progressColor}">${level}</div>
          <div style="max-width:300px;margin:12px auto 0">
            ${progressBar(overallPct, progressColor)}
          </div>
          <div style="display:flex;justify-content:space-between;max-width:300px;margin:6px auto 0;font-size:11px;color:${C.gray}">
            <span>${formatCurrency(totalProgress)} saved</span>
            <span>${formatCurrency(totalTarget)} target</span>
          </div>
        </div>

        <div class="stat-grid">
          <div class="stat-card"><div class="label">Total Goals</div><div class="value">${totalGoals}</div></div>
          <div class="stat-card" style="border-color:${C.green}30"><div class="label">Completed</div><div class="value positive">${completed}</div></div>
          <div class="stat-card"><div class="label">In Progress</div><div class="value">${reportData.goalsSummary?.inProgress || 0}</div></div>
          <div class="stat-card"><div class="label">Total Target</div><div class="value">${formatCurrency(totalTarget)}</div></div>
        </div>

        <h2>Individual Goals</h2>
        <div class="goals-list">
          ${(reportData.goalsData || []).map(goal => {
            const pct = goal.progress || 0;
            const goalColor = pct >= 100 ? C.green : pct >= 50 ? C.amber : C.gray;
            const statusLabel = pct >= 100 ? 'Completed' : pct >= 75 ? 'Almost' : pct >= 25 ? 'In Progress' : 'Started';
            const statusVar = pct >= 100 ? 'completed' : 'progress';
            return `<div class="goal-card">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span style="font-size:14px;font-weight:600;color:#1a1d29">${goal.name}</span>
                ${badge(statusLabel, statusVar)}
              </div>
              ${progressBar(pct, goalColor)}
              <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:11px;color:${C.gray}">
                <span>${formatCurrency(goal.current_value || 0)} saved</span>
                <span>Target: ${formatCurrency(goal.target_amount || 0)}</span>
              </div>
              <div style="text-align:right;font-size:13px;font-weight:700;color:${goalColor};margin-top:2px">${pct.toFixed(0)}%</div>
            </div>`;
          }).join('')}
        </div>
      `;
    } else if (activeReport === 'tax') {
      content = `
        <h1>Tax Summary</h1>
        <p class="subtitle">Indicative summary for ${userName} &mdash; ${dateStr}</p>

        <div class="hero" style="background:linear-gradient(135deg,${C.red}0D 0%,${C.red}08 100%);border:1px solid ${C.red}25">
          <div class="hero-label" style="color:${C.red}">Total Taxable Income</div>
          <div class="hero-value" style="color:${C.red}">${formatCurrency(reportData.totalTaxableIncome || 0)}</div>
        </div>

        <div class="two-col">
          <div>
            <h2>Income Breakdown</h2>
            <div class="tax-card" style="border:1px solid #e5e7eb;background:#f8fafc">
              <div class="tax-label">Taxable Interest</div>
              <div class="tax-value">${formatCurrency(reportData.taxableInterestIncome || 0)}</div>
              <div class="tax-note">FD, RD interest &mdash; taxed at slab rate</div>
            </div>
            <div class="tax-card" style="border:1px solid ${C.amber}25;background:${C.amber}08">
              <div class="tax-label">Capital Gains (Unrealized)</div>
              <div class="tax-value">${formatCurrency(reportData.totalCapitalGains || 0)}</div>
              <div class="tax-note">Equity gains &mdash; tax on sell only</div>
            </div>
            ${(reportData.taxExemptInterestIncome || 0) > 0 ? `
              <div class="tax-card" style="border:1px solid ${C.green}25;background:${C.green}08">
                <div style="display:flex;align-items:center;gap:6px">
                  <span class="tax-label" style="margin:0">Tax-Exempt Interest</span>
                  ${badge('EXEMPT', 'exempt')}
                </div>
                <div class="tax-value positive">${formatCurrency(reportData.taxExemptInterestIncome)}</div>
                <div class="tax-note" style="color:${C.green}99">PPF, EPF, VPF, SSY (EEE instruments)</div>
              </div>
            ` : ''}
          </div>
          <div>
            ${(reportData.fixedIncomeAssetsList || []).length > 0 ? `
              <h2>Interest Details</h2>
              <table>
                <thead><tr><th>Asset</th><th>Type</th><th class="r">Principal</th><th class="r">Interest</th><th style="text-align:center">Status</th></tr></thead>
                <tbody>${(reportData.fixedIncomeAssetsList || []).map(a => `<tr>
                  <td style="font-weight:500">${a.name}</td>
                  <td>${badge(a.asset_type)}</td>
                  <td class="r">${formatCurrency(a.principal)}</td>
                  <td class="r positive" style="font-weight:600">${formatCurrency(a.interest)}</td>
                  <td style="text-align:center">${a.isTaxExempt ? badge('Exempt', 'exempt') : badge('Taxable', 'taxable')}</td>
                </tr>`).join('')}</tbody>
              </table>
            ` : ''}
          </div>
        </div>
        <div class="disclaimer">This is an indicative summary only. Capital gains shown are unrealized. Consult a tax professional for accurate tax computations and filing.</div>
      `;
    } else if (activeReport === 'transactions') {
      const txns = transactionsData?.transactions || [];
      const txnSummary = transactionsData?.summary || {};

      content = `
        <h1>Transaction History</h1>
        <p class="subtitle">Generated on ${dateStr}</p>

        <div class="stat-grid stat-grid-2x2">
          <div class="stat-card"><div class="label">Total Transactions</div><div class="value">${txnSummary.totalTransactions || 0}</div></div>
          <div class="stat-card" style="border-color:${C.green}30;background:${C.green}08"><div class="label" style="color:${C.green}">Total Buys</div><div class="value">${formatCurrency(txnSummary.totalBuys || 0)}</div></div>
          <div class="stat-card" style="border-color:${C.red}30;background:${C.red}08"><div class="label" style="color:${C.red}">Total Sells</div><div class="value">${formatCurrency(txnSummary.totalSells || 0)}</div></div>
          <div class="stat-card"><div class="label">Net Flow</div><div class="value">${formatCurrency(txnSummary.netFlow || 0)}</div></div>
        </div>

        <h2>Transactions</h2>
        <table>
          <thead><tr><th>Date</th><th>Asset</th><th style="text-align:center">Type</th><th class="r">Qty</th><th class="r">Amount</th></tr></thead>
          <tbody>${txns.slice(0, 200).map(txn => `<tr>
            <td style="white-space:nowrap">${new Date(txn.transaction_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
            <td><span style="font-weight:500">${txn.assetName}</span> ${badge(txn.assetType)}</td>
            <td style="text-align:center">${badge(txn.type, txn.type === 'BUY' ? 'buy' : 'sell')}</td>
            <td class="r">${txn.quantity || '-'}</td>
            <td class="r" style="font-weight:600">${formatCurrency(txn.total_amount || 0)}</td>
          </tr>`).join('')}</tbody>
        </table>
        ${txns.length > 200 ? `<p style="margin-top:12px;font-size:11px;color:${C.gray}">Showing 200 of ${txns.length} transactions. Export to CSV for the complete list.</p>` : ''}
      `;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${REPORT_TITLES[activeReport] || 'Report'} - Wealth Tracker</title>
          <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet">
          <style>
            * { box-sizing: border-box; margin: 0; }
            body { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif; padding: 48px; color: #1a1d29; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            h1 { font-size: 28px; font-weight: 700; letter-spacing: -0.03em; margin: 0 0 4px; }
            h2 { font-size: 11px; font-weight: 700; margin: 28px 0 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; }
            .subtitle { color: #6b7280; font-size: 13px; margin-bottom: 24px; }

            /* Hero */
            .hero { padding: 24px 28px; border-radius: 16px; margin-bottom: 24px; text-align: center; }
            .hero-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; margin-bottom: 6px; }
            .hero-value { font-family: 'DM Serif Display', serif; font-size: 36px; font-weight: 400; letter-spacing: -0.02em; color: #1a1d29; }
            .hero-sub { margin-top: 4px; }

            /* Stat grid */
            .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 24px; }
            .stat-grid-2x2 { grid-template-columns: repeat(2, 1fr); }
            .stat-card { padding: 14px 16px; border-radius: 10px; border: 1px solid #e5e7eb; background: #f8fafc; }
            .stat-card .label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; margin-bottom: 4px; font-weight: 700; }
            .stat-card .value { font-family: 'DM Serif Display', serif; font-size: 18px; }

            /* Two-column */
            .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }

            /* Allocation rows */
            .alloc-list { margin-bottom: 8px; }
            .alloc-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
            .alloc-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
            .alloc-name { flex: 1; font-size: 13px; font-weight: 500; }
            .alloc-value { font-size: 12px; color: #6b7280; font-variant-numeric: tabular-nums; }
            .alloc-pct { font-size: 13px; font-weight: 700; width: 48px; text-align: right; font-variant-numeric: tabular-nums; }
            .alloc-ret { font-size: 11px; font-weight: 600; width: 52px; text-align: right; font-variant-numeric: tabular-nums; }

            /* Highlight cards */
            .highlight-card { padding: 16px; border-radius: 12px; }
            .hl-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
            .hl-name { font-size: 14px; font-weight: 600; color: #1a1d29; margin-bottom: 2px; }
            .hl-value { font-family: 'DM Serif Display', serif; font-size: 22px; }

            /* Performer rows */
            .performer-row { display: flex; gap: 10px; padding: 10px; background: #f8fafc; border-radius: 10px; border: 1px solid #f1f5f9; margin-bottom: 6px; }
            .perf-rank { font-size: 12px; font-weight: 700; color: #94a3b8; width: 18px; padding-top: 2px; text-align: center; flex-shrink: 0; font-variant-numeric: tabular-nums; }
            .perf-info { flex: 1; min-width: 0; }
            .perf-name { font-size: 13px; font-weight: 500; }

            /* Progress bar */
            .progress-track { height: 5px; background: #e5e7eb; border-radius: 3px; overflow: hidden; margin-top: 6px; }
            .progress-fill { height: 100%; border-radius: 3px; }

            /* Badges */
            .badge { display: inline-block; padding: 2px 6px; font-size: 8px; font-weight: 700; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.04em; vertical-align: middle; }

            /* Goal cards */
            .goals-list { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            .goal-card { padding: 14px; background: #f8fafc; border-radius: 10px; border: 1px solid #e5e7eb; }

            /* Tax cards */
            .tax-card { padding: 14px 16px; border-radius: 10px; margin-bottom: 8px; }
            .tax-label { font-size: 12px; color: #6b7280; margin-bottom: 4px; }
            .tax-value { font-family: 'DM Serif Display', serif; font-size: 20px; color: #1a1d29; margin-bottom: 2px; }
            .tax-note { font-size: 10px; color: #94a3b8; }

            /* Tables */
            table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
            th { padding: 8px 10px; text-align: left; border-bottom: 2px solid #e2e8f0; font-size: 9px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
            td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; font-variant-numeric: tabular-nums; }
            tfoot td { border-top: 2px solid #e2e8f0; border-bottom: none; background: #f8fafc; }
            .r { text-align: right; }

            /* Colors */
            .positive { color: #1A7A5C; }
            .negative { color: #C03744; }

            /* Disclaimer */
            .disclaimer { margin-top: 20px; padding: 12px 16px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; font-size: 11px; color: #92400e; line-height: 1.5; }

            /* Footer */
            .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }

            @media print {
              body { padding: 24px; }
              .hero, .stat-grid, .two-col, .highlight-card, .goal-card, .performer-row { break-inside: avoid; }
              tr { break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          ${content}
          <div class="footer">
            <span>Wealth Tracker &mdash; ${userName}</span>
            <span>${new Date().toLocaleDateString('en-IN', { dateStyle: 'full' })}</span>
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 300);
  };

  // Render the active detail panel
  const renderDetailPanel = () => {
    switch (activeReport) {
      case 'portfolio-summary':
        return (
          <PortfolioSummaryReport
            totalInvested={reportData.totalInvested}
            totalCurrentValue={reportData.totalCurrentValue}
            totalGain={reportData.totalGain}
            totalGainPercent={reportData.totalGainPercent}
            totalInterestEarned={reportData.totalInterestEarned}
            categoryBreakdown={reportData.categoryBreakdown}
            assetTypeBreakdown={reportData.assetTypeBreakdown}
            assetCount={reportData.assetCount}
            categoryAllocation={reportData.categoryAllocation}
          />
        );
      case 'holdings':
        return (
          <HoldingsReport
            assets={reportData.holdingsAssets}
          />
        );
      case 'performance':
        return (
          <PerformanceReport
            totalInvested={reportData.totalInvested}
            totalCurrentValue={reportData.totalCurrentValue}
            totalGain={reportData.totalGain}
            totalGainPercent={reportData.totalGainPercent}
            topPerformers={reportData.topPerformers}
            bottomPerformers={reportData.bottomPerformers}
            categoryPerformance={reportData.categoryPerformance}
            assetCount={reportData.assetCount}
          />
        );
      case 'goals':
        return (
          <GoalProgressReport
            goals={reportData.goalsData}
            summary={reportData.goalsSummary}
          />
        );
      case 'tax':
        return (
          <TaxSummaryReport
            taxableInterestIncome={reportData.taxableInterestIncome}
            taxExemptInterestIncome={reportData.taxExemptInterestIncome}
            totalInterestIncome={reportData.totalInterestIncome}
            totalDividendIncome={reportData.totalDividendIncome}
            totalCapitalGains={reportData.totalCapitalGains}
            totalTaxableIncome={reportData.totalTaxableIncome}
            fixedIncomeAssets={reportData.fixedIncomeAssetsList}
          />
        );
      case 'transactions':
        return (
          <TransactionHistoryReport
            transactions={transactionsData?.transactions}
            summary={transactionsData?.summary}
            loading={transactionsLoading}
          />
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:px-10 md:py-6 flex-1 flex flex-col">
        <PageSpinner message="Loading reports..." />
      </div>
    );
  }

  return (
    <div className="p-4 md:px-10 md:py-6 flex flex-col">
      {/* Mobile Tabs */}
      <div className="md:hidden overflow-x-auto flex gap-1.5 pb-3 shrink-0 -mx-1 px-1">
        {SIDEBAR_ITEMS.map(item => (
          <motion.button
            key={item.id}
            whileTap={tapScale}
            onClick={() => setActiveReport(item.id)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-[14px] font-medium transition-all ${
              activeReport === item.id
                ? 'bg-[var(--label-primary)] text-white shadow-sm'
                : 'bg-[var(--fill-tertiary)] text-[var(--label-secondary)]'
            }`}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </motion.button>
        ))}
      </div>

      {/* Sidebar + Detail Panel */}
      <div className="flex gap-0 flex-1">
        {/* Sidebar - hidden on mobile */}
        <nav className="hidden md:flex w-[220px] shrink-0 flex-col gap-1 pr-4 border-r border-[var(--separator-opaque)] mr-0 py-1 sticky top-0 self-start">
          {SIDEBAR_ITEMS.map(item => (
            <SidebarItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              active={activeReport === item.id}
              activeColor={item.color}
              onClick={() => setActiveReport(item.id)}
            />
          ))}
        </nav>

        {/* Detail Panel */}
        <div className="flex-1 md:pl-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeReport}
              variants={panelVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <Card padding="p-0" className="overflow-hidden">
                {/* Document Header */}
                <div className="px-6 py-4 border-b border-[var(--separator-opaque)] bg-[var(--bg-secondary)]">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-[18px] font-semibold text-[var(--label-primary)]" style={{ fontFamily: 'var(--font-display)' }}>
                        {REPORT_TITLES[activeReport]}
                      </h2>
                      <p className="text-[13px] text-[var(--label-tertiary)] mt-0.5">
                        Generated on {new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <motion.button
                        whileTap={tapScale}
                        onClick={exportToCSV}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[var(--label-tertiary)] hover:bg-[var(--fill-tertiary)] hover:text-[var(--label-primary)] transition-colors text-[13px] font-medium"
                        title="Export CSV"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        Export
                      </motion.button>
                      <motion.button
                        whileTap={tapScale}
                        onClick={handlePrint}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[var(--label-tertiary)] hover:bg-[var(--fill-tertiary)] hover:text-[var(--label-primary)] transition-colors text-[13px] font-medium"
                        title="Print"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
                        </svg>
                        Print
                      </motion.button>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  {renderDetailPanel()}
                </div>
              </Card>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
