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
    color: '#3B82F6',
  },
  {
    id: 'holdings',
    label: 'Holdings',
    icon: (props) => (
      <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
    color: '#10B981',
  },
  {
    id: 'performance',
    label: 'Performance',
    icon: (props) => (
      <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
    color: '#8B5CF6',
  },
  {
    id: 'goals',
    label: 'Goals',
    icon: (props) => (
      <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
      </svg>
    ),
    color: '#F59E0B',
  },
  {
    id: 'tax',
    label: 'Tax Summary',
    icon: (props) => (
      <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    color: '#DC2626',
  },
  {
    id: 'transactions',
    label: 'Transactions',
    icon: (props) => (
      <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: '#06B6D4',
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
  EQUITY_STOCKS: '#3B82F6',
  EQUITY_MF: '#8B5CF6',
  ETF: '#06B6D4',
  MUTUAL_FUND: '#8B5CF6',
  STOCK: '#3B82F6',
  FD: '#10B981',
  PPF: '#059669',
  RD: '#14B8A6',
  EPF: '#0D9488',
  NPS: '#0891B2',
  BONDS: '#0E7490',
  GOLD: '#F59E0B',
  SILVER: '#78716C',
  LAND: '#EA580C',
  PROPERTY: '#DC2626',
  REIT: '#F97316',
  SAVINGS_ACCOUNT: '#A855F7',
  CRYPTOCURRENCY: '#EC4899',
  LIC: '#06B6D4',
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
    let content = '';

    if (activeReport === 'portfolio-summary') {
      const pieData = Object.entries(reportData.assetTypeBreakdown || {})
        .map(([name, data]) => ({ name: name.replace(/_/g, ' '), value: data.current, count: data.count }))
        .filter(d => d.value > 0)
        .sort((a, b) => b.value - a.value);

      content = `
        <h1>Portfolio Summary</h1>
        <p class="subtitle">Generated for ${user?.name || 'User'} on ${dateStr}</p>
        <div class="summary-grid">
          <div class="summary-card"><div class="label">Total Invested</div><div class="value">${formatCurrency(reportData.totalInvested || 0)}</div></div>
          <div class="summary-card"><div class="label">Current Value</div><div class="value">${formatCurrency(reportData.totalCurrentValue || 0)}</div></div>
          <div class="summary-card"><div class="label">Total Gain/Loss</div><div class="value ${(reportData.totalGain || 0) >= 0 ? 'positive' : 'negative'}">${(reportData.totalGain || 0) >= 0 ? '+' : ''}${formatCurrency(reportData.totalGain || 0)}</div></div>
          <div class="summary-card"><div class="label">Returns</div><div class="value ${(reportData.totalGainPercent || 0) >= 0 ? 'positive' : 'negative'}">${(reportData.totalGainPercent || 0) >= 0 ? '+' : ''}${(reportData.totalGainPercent || 0).toFixed(2)}%</div></div>
        </div>
        <h2>Asset Allocation</h2>
        <table><thead><tr><th>Asset Type</th><th class="r">Count</th><th class="r">Value</th><th class="r">Allocation</th></tr></thead>
        <tbody>${pieData.map(entry => `<tr><td>${entry.name}</td><td class="r">${entry.count}</td><td class="r">${formatCurrency(entry.value)}</td><td class="r">${((entry.value / (reportData.totalCurrentValue || 1)) * 100).toFixed(1)}%</td></tr>`).join('')}</tbody>
        <tfoot><tr><td><strong>Total</strong></td><td class="r"><strong>${reportData.assetCount || 0}</strong></td><td class="r"><strong>${formatCurrency(reportData.totalCurrentValue || 0)}</strong></td><td class="r"><strong>100%</strong></td></tr></tfoot></table>
      `;
    } else if (activeReport === 'holdings') {
      content = `
        <h1>Holdings Report</h1>
        <p class="subtitle">As of ${dateStr}</p>
        <table><thead><tr><th>Asset</th><th>Type</th><th class="r">Invested</th><th class="r">Current Value</th><th class="r">Gain/Loss</th><th class="r">Return %</th></tr></thead>
        <tbody>${(reportData.holdingsAssets || []).map(asset => `<tr><td>${asset.name}</td><td>${asset.typeName}</td><td class="r">${formatCurrency(asset.invested)}</td><td class="r">${formatCurrency(asset.currentValue)}</td><td class="r ${asset.gain >= 0 ? 'positive' : 'negative'}">${asset.gain >= 0 ? '+' : ''}${formatCurrency(asset.gain)}</td><td class="r ${asset.gainPercent >= 0 ? 'positive' : 'negative'}">${asset.gainPercent >= 0 ? '+' : ''}${asset.gainPercent.toFixed(1)}%</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="2"><strong>Total</strong></td><td class="r"><strong>${formatCurrency(reportData.totalInvested || 0)}</strong></td><td class="r"><strong>${formatCurrency(reportData.totalCurrentValue || 0)}</strong></td><td class="r ${(reportData.totalGain || 0) >= 0 ? 'positive' : 'negative'}"><strong>${(reportData.totalGain || 0) >= 0 ? '+' : ''}${formatCurrency(reportData.totalGain || 0)}</strong></td><td class="r ${(reportData.totalGainPercent || 0) >= 0 ? 'positive' : 'negative'}"><strong>${(reportData.totalGainPercent || 0) >= 0 ? '+' : ''}${(reportData.totalGainPercent || 0).toFixed(1)}%</strong></td></tr></tfoot></table>
      `;
    } else if (activeReport === 'performance') {
      content = `
        <h1>Performance Analysis</h1>
        <p class="subtitle">Generated for ${user?.name || 'User'} on ${dateStr}</p>
        <div class="summary-grid">
          <div class="summary-card"><div class="label">Total Invested</div><div class="value">${formatCurrency(reportData.totalInvested || 0)}</div></div>
          <div class="summary-card"><div class="label">Current Value</div><div class="value">${formatCurrency(reportData.totalCurrentValue || 0)}</div></div>
          <div class="summary-card"><div class="label">Total Gain/Loss</div><div class="value ${(reportData.totalGain || 0) >= 0 ? 'positive' : 'negative'}">${(reportData.totalGain || 0) >= 0 ? '+' : ''}${formatCurrency(reportData.totalGain || 0)}</div></div>
          <div class="summary-card"><div class="label">Overall Return</div><div class="value ${(reportData.totalGainPercent || 0) >= 0 ? 'positive' : 'negative'}">${(reportData.totalGainPercent || 0) >= 0 ? '+' : ''}${(reportData.totalGainPercent || 0).toFixed(2)}%</div></div>
        </div>
        <h2>Top Performers</h2>
        <table><thead><tr><th>Asset</th><th>Type</th><th class="r">Invested</th><th class="r">Current</th><th class="r">Return %</th></tr></thead>
        <tbody>${(reportData.topPerformers || []).map(a => `<tr><td>${a.name}</td><td>${a.asset_type}</td><td class="r">${formatCurrency(a.invested)}</td><td class="r">${formatCurrency(a.currentValue)}</td><td class="r positive">+${a.gainPercent.toFixed(1)}%</td></tr>`).join('')}</tbody></table>
        <h2>Bottom Performers</h2>
        <table><thead><tr><th>Asset</th><th>Type</th><th class="r">Invested</th><th class="r">Current</th><th class="r">Return %</th></tr></thead>
        <tbody>${(reportData.bottomPerformers || []).map(a => `<tr><td>${a.name}</td><td>${a.asset_type}</td><td class="r">${formatCurrency(a.invested)}</td><td class="r">${formatCurrency(a.currentValue)}</td><td class="r ${a.gainPercent >= 0 ? 'positive' : 'negative'}">${a.gainPercent >= 0 ? '+' : ''}${a.gainPercent.toFixed(1)}%</td></tr>`).join('')}</tbody></table>
        <h2>Category Performance</h2>
        <table><thead><tr><th>Category</th><th class="r">Invested</th><th class="r">Current</th><th class="r">Gain/Loss</th><th class="r">Return %</th></tr></thead>
        <tbody>${Object.entries(reportData.categoryPerformance || {}).map(([cat, d]) => { const pct = d.invested > 0 ? ((d.current - d.invested) / d.invested) * 100 : 0; return `<tr><td>${cat}</td><td class="r">${formatCurrency(d.invested)}</td><td class="r">${formatCurrency(d.current)}</td><td class="r ${d.gain >= 0 ? 'positive' : 'negative'}">${d.gain >= 0 ? '+' : ''}${formatCurrency(d.gain)}</td><td class="r ${pct >= 0 ? 'positive' : 'negative'}">${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%</td></tr>`; }).join('')}</tbody></table>
      `;
    } else if (activeReport === 'goals') {
      content = `
        <h1>Goal Progress Report</h1>
        <p class="subtitle">Generated on ${dateStr}</p>
        <div class="summary-grid">
          <div class="summary-card"><div class="label">Total Goals</div><div class="value">${reportData.goalsSummary?.total || 0}</div></div>
          <div class="summary-card"><div class="label">Completed</div><div class="value positive">${reportData.goalsSummary?.completed || 0}</div></div>
          <div class="summary-card"><div class="label">In Progress</div><div class="value">${reportData.goalsSummary?.inProgress || 0}</div></div>
          <div class="summary-card"><div class="label">Total Target</div><div class="value">${formatCurrency(reportData.goalsSummary?.totalTarget || 0)}</div></div>
        </div>
        <h2>Goals</h2>
        <table><thead><tr><th>Goal Name</th><th>Category</th><th class="r">Target</th><th class="r">Current</th><th class="r">Remaining</th><th class="r">Progress</th></tr></thead>
        <tbody>${(reportData.goalsData || []).map(goal => `<tr><td>${goal.name}</td><td>${goal.categoryConfig?.label || ''}</td><td class="r">${formatCurrency(goal.target_amount || 0)}</td><td class="r">${formatCurrency(goal.current_value || 0)}</td><td class="r">${formatCurrency(goal.remaining > 0 ? goal.remaining : 0)}</td><td class="r ${goal.progress >= 100 ? 'positive' : ''}">${(goal.progress || 0).toFixed(0)}%</td></tr>`).join('')}</tbody></table>
      `;
    } else if (activeReport === 'tax') {
      content = `
        <h1>Tax Summary</h1>
        <p class="subtitle">Indicative summary for ${user?.name || 'User'} &mdash; ${dateStr}</p>
        <div class="summary-grid">
          <div class="summary-card"><div class="label">Taxable Interest</div><div class="value">${formatCurrency(reportData.taxableInterestIncome || 0)}</div></div>
          <div class="summary-card"><div class="label">Tax-Exempt Interest</div><div class="value positive">${formatCurrency(reportData.taxExemptInterestIncome || 0)}</div></div>
          <div class="summary-card"><div class="label">Capital Gains</div><div class="value">${formatCurrency(reportData.totalCapitalGains || 0)}</div></div>
          <div class="summary-card"><div class="label">Total Taxable</div><div class="value">${formatCurrency(reportData.totalTaxableIncome || 0)}</div></div>
        </div>
        ${(reportData.fixedIncomeAssetsList || []).length > 0 ? `
          <h2>Fixed Income Breakdown</h2>
          <table><thead><tr><th>Asset</th><th>Type</th><th class="r">Principal</th><th class="r">Interest Earned</th><th>Tax Status</th></tr></thead>
          <tbody>${(reportData.fixedIncomeAssetsList || []).map(a => `<tr><td>${a.name}</td><td>${a.asset_type}</td><td class="r">${formatCurrency(a.principal)}</td><td class="r">${formatCurrency(a.interest)}</td><td>${a.isTaxExempt ? '<span class="positive">Exempt</span>' : 'Taxable'}</td></tr>`).join('')}</tbody></table>
        ` : ''}
        <div class="disclaimer">This is an indicative summary only. Consult a tax professional for accurate tax computations.</div>
      `;
    } else if (activeReport === 'transactions') {
      const txns = transactionsData?.transactions || [];
      const summary = transactionsData?.summary || {};
      content = `
        <h1>Transaction History</h1>
        <p class="subtitle">Generated on ${dateStr}</p>
        <div class="summary-grid">
          <div class="summary-card"><div class="label">Total Transactions</div><div class="value">${summary.totalTransactions || 0}</div></div>
          <div class="summary-card"><div class="label">Total Buys</div><div class="value">${formatCurrency(summary.totalBuys || 0)}</div></div>
          <div class="summary-card"><div class="label">Total Sells</div><div class="value">${formatCurrency(summary.totalSells || 0)}</div></div>
          <div class="summary-card"><div class="label">Net Flow</div><div class="value">${formatCurrency(summary.netFlow || 0)}</div></div>
        </div>
        <table><thead><tr><th>Date</th><th>Asset</th><th>Type</th><th class="r">Quantity</th><th class="r">Amount</th></tr></thead>
        <tbody>${txns.slice(0, 200).map(txn => `<tr><td>${new Date(txn.transaction_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td><td>${txn.assetName}</td><td><span class="${txn.type === 'BUY' ? 'positive' : 'negative'}">${txn.type}</span></td><td class="r">${txn.quantity || '-'}</td><td class="r">${formatCurrency(txn.total_amount || 0)}</td></tr>`).join('')}</tbody></table>
        ${txns.length > 200 ? `<p class="subtitle" style="margin-top:12px;">Showing 200 of ${txns.length} transactions</p>` : ''}
      `;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${REPORT_TITLES[activeReport] || 'Report'} - Wealth Tracker</title>
          <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700&display=swap" rel="stylesheet">
          <style>
            * { box-sizing: border-box; margin: 0; }
            body { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 48px; color: #1a1d29; line-height: 1.6; }
            h1 { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 4px 0; }
            h2 { font-size: 15px; font-weight: 600; margin: 32px 0 12px 0; color: #374151; text-transform: uppercase; letter-spacing: 0.04em; }
            .subtitle { color: #6b7280; font-size: 13px; margin-bottom: 28px; }
            .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
            .summary-card { padding: 16px 18px; background: #f8fafc; border-radius: 12px; border: 1px solid #e5e7eb; }
            .summary-card .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin-bottom: 6px; }
            .summary-card .value { font-size: 20px; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
            th { padding: 10px 12px; text-align: left; border-bottom: 2px solid #e2e8f0; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
            td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
            tfoot td { border-top: 2px solid #e2e8f0; border-bottom: none; background: #f8fafc; }
            .r { text-align: right; }
            .positive { color: #059669; }
            .negative { color: #dc2626; }
            .disclaimer { margin-top: 24px; padding: 12px 16px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; font-size: 12px; color: #92400e; }
            .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }
            @media print { body { padding: 20px; } .summary-grid { grid-template-columns: repeat(4, 1fr); } }
          </style>
        </head>
        <body>
          ${content}
          <div class="footer">
            <span>Wealth Tracker &mdash; ${user?.name || ''}</span>
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
    }, 250);
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
      <div className="p-4 md:px-12 md:py-6 flex-1 flex flex-col">
        <PageSpinner message="Loading reports..." />
      </div>
    );
  }

  return (
    <div className="p-4 md:px-12 md:py-6 flex flex-col">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.gentle}
        className="mb-4 shrink-0"
      >
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-bold text-[var(--label-primary)]" style={{ fontFamily: 'var(--font-display)' }}>Reports</h1>
          <div className="flex items-center gap-2">
            <motion.button
              whileTap={tapScale}
              onClick={exportToCSV}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--fill-tertiary)] border border-[var(--separator-opaque)] text-[var(--label-primary)] hover:bg-[var(--fill-secondary)] transition-colors text-[13px] font-semibold"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Export
            </motion.button>
            <motion.button
              whileTap={tapScale}
              onClick={handlePrint}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--fill-tertiary)] border border-[var(--separator-opaque)] text-[var(--label-primary)] hover:bg-[var(--fill-secondary)] transition-colors text-[13px] font-semibold"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
              </svg>
              Print
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Mobile Tabs */}
      <div className="md:hidden overflow-x-auto flex gap-1.5 pb-3 shrink-0 -mx-1 px-1">
        {SIDEBAR_ITEMS.map(item => (
          <motion.button
            key={item.id}
            whileTap={tapScale}
            onClick={() => setActiveReport(item.id)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-medium transition-all ${
              activeReport === item.id
                ? 'text-white shadow-sm'
                : 'bg-[var(--fill-tertiary)] text-[var(--label-secondary)]'
            }`}
            style={activeReport === item.id ? { backgroundColor: item.color } : undefined}
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
                      <h2 className="text-[17px] font-semibold text-[var(--label-primary)]" style={{ fontFamily: 'var(--font-display)' }}>
                        {REPORT_TITLES[activeReport]}
                      </h2>
                      <p className="text-[12px] text-[var(--label-tertiary)] mt-0.5">
                        Generated on {new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}
                      </p>
                    </div>
                    <span className="text-[10px] font-medium text-[var(--label-quaternary)] uppercase tracking-wider">Wealth Tracker</span>
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
