import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { assetService, priceService, ASSET_CONFIG } from '../services/assets';
import { goalService, GOAL_CATEGORIES } from '../services/goals';
import { Card, Button } from '../components/apple';
import { tapScale } from '../utils/animations';
import { categoryColors } from '../constants/theme';
import { formatCurrency, formatCompact } from '../utils/formatting';
import { calculateFixedIncomeValue, getCompoundingFrequency, generateRecurringDepositSchedule } from '../utils/interest';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

// Report type definitions
const REPORT_TYPES = {
  PORTFOLIO_SUMMARY: {
    id: 'portfolio-summary',
    title: 'Portfolio Summary',
    description: 'Complete overview of your net worth and asset allocation',
    icon: 'pie-chart',
    color: '#3B82F6',
  },
  HOLDINGS: {
    id: 'holdings',
    title: 'Holdings Report',
    description: 'Detailed breakdown of all your assets and investments',
    icon: 'list',
    color: '#10B981',
  },
  PERFORMANCE: {
    id: 'performance',
    title: 'Performance Analysis',
    description: 'Returns, gains/losses, and portfolio performance metrics',
    icon: 'trending',
    color: '#8B5CF6',
  },
  GOALS: {
    id: 'goals',
    title: 'Goal Progress Report',
    description: 'Track progress towards your financial goals',
    icon: 'target',
    color: '#F59E0B',
  },
  TAX: {
    id: 'tax',
    title: 'Tax Summary',
    description: 'Capital gains, dividends, and interest income for tax filing',
    icon: 'document',
    color: '#EF4444',
  },
  TRANSACTIONS: {
    id: 'transactions',
    title: 'Transaction History',
    description: 'Complete history of all your buy/sell transactions',
    icon: 'clock',
    color: '#06B6D4',
  },
};

// Report icon component
const ReportIcon = ({ type, className = "w-6 h-6" }) => {
  const icons = {
    'pie-chart': (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
      </svg>
    ),
    'list': (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
    'trending': (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
    'target': (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
      </svg>
    ),
    'document': (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    'clock': (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };
  return icons[type] || icons['document'];
};

export default function Reports() {
  const toast = useToast();
  const { user } = useAuth();
  const printRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportData, setReportData] = useState(null);

  // Raw data
  const [assets, setAssets] = useState([]);
  const [goals, setGoals] = useState([]);
  const [prices, setPrices] = useState({});
  const [fixedIncomeCalcs, setFixedIncomeCalcs] = useState({});

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

      // Fetch prices for equity assets
      const equityAssets = assetList.filter(a => a.category === 'EQUITY' && a.symbol);
      if (equityAssets.length > 0) {
        const symbols = equityAssets.map(a => ({
          symbol: a.asset_type === 'MUTUAL_FUND' ? a.symbol : `${a.symbol}.${a.exchange === 'BSE' ? 'BO' : 'NS'}`,
          type: a.asset_type === 'MUTUAL_FUND' ? 'mf' : 'stock'
        }));
        try {
          const priceRes = await priceService.getBulkPrices(symbols);
          setPrices(priceRes.data?.prices || {});
        } catch (e) {
          console.error('Failed to fetch prices:', e);
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

  // Helper functions matching Dashboard logic
  const getAssetValue = (asset) => {
    if (asset.category === 'EQUITY' && asset.quantity && asset.symbol) {
      const priceKey = asset.asset_type === 'MUTUAL_FUND' ? asset.symbol : `${asset.symbol}.${asset.exchange === 'BSE' ? 'BO' : 'NS'}`;
      const priceData = prices[priceKey];
      if (priceData?.price) return asset.quantity * priceData.price;
      if (asset.avg_buy_price) return asset.quantity * asset.avg_buy_price;
    }
    if (asset.category === 'FIXED_INCOME') {
      const calc = fixedIncomeCalcs[asset.id];
      if (calc) return calc.currentValue;
      if (asset.principal) return asset.principal;
    }
    if (asset.category === 'REAL_ESTATE' && asset.appreciation_rate && asset.purchase_price && asset.purchase_date) {
      const purchasePrice = parseFloat(asset.purchase_price);
      const rate = parseFloat(asset.appreciation_rate) / 100;
      const purchaseDate = new Date(asset.purchase_date);
      const today = new Date();
      const years = (today - purchaseDate) / (365.25 * 24 * 60 * 60 * 1000);
      if (years >= 0) return Math.round(purchasePrice * Math.pow(1 + rate, years));
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
    if (asset.category === 'FIXED_INCOME') {
      const calc = fixedIncomeCalcs[asset.id];
      if (calc) return calc.principal;
    }
    if (asset.principal) return asset.principal;
    if (asset.purchase_price) return asset.purchase_price;
    if (asset.balance) return asset.balance;
    return 0;
  };

  // Define colors for visual groups
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

  // Calculate portfolio metrics
  const calculatePortfolioMetrics = () => {
    let totalInvested = 0;
    let totalCurrentValue = 0;
    const categoryBreakdown = {};
    const assetTypeBreakdown = {};

    assets.forEach(asset => {
      const invested = getInvestedValue(asset);
      const currentValue = getAssetValue(asset);
      const category = asset.category || 'OTHER';
      const assetType = asset.asset_type || 'OTHER';

      totalInvested += invested;
      totalCurrentValue += currentValue;

      // Category breakdown
      if (!categoryBreakdown[category]) {
        categoryBreakdown[category] = {
          invested: 0,
          current: 0,
          count: 0,
          color: categoryColors[category]?.color || '#6B7280'
        };
      }
      categoryBreakdown[category].invested += invested;
      categoryBreakdown[category].current += currentValue;
      categoryBreakdown[category].count += 1;

      // Asset type breakdown
      if (!assetTypeBreakdown[assetType]) {
        assetTypeBreakdown[assetType] = {
          invested: 0,
          current: 0,
          count: 0,
          color: groupColors[assetType] || '#6B7280',
          category: category
        };
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

    return {
      totalInvested,
      totalCurrentValue,
      totalGain,
      totalGainPercent,
      totalInterestEarned,
      categoryBreakdown,
      assetTypeBreakdown,
      assetCount: assets.length,
      equityCount: assets.filter(a => a.category === 'EQUITY').length,
      fixedIncomeCount: assets.filter(a => a.category === 'FIXED_INCOME').length,
    };
  };

  // Generate report
  const generateReport = async (reportType) => {
    setGenerating(true);
    setSelectedReport(reportType);

    try {
      let data = { generatedAt: new Date().toISOString() };

      if (reportType.id === 'portfolio-summary') {
        data = {
          ...calculatePortfolioMetrics(),
          generatedAt: new Date().toISOString(),
          userName: user?.name || 'User',
        };
      } else if (reportType.id === 'holdings') {
        data = {
          assets: assets.map(asset => {
            const invested = getInvestedValue(asset);
            const currentValue = getAssetValue(asset);
            return {
              ...asset,
              typeName: asset.asset_type,
              invested,
              currentValue,
              gain: currentValue - invested,
              gainPercent: invested > 0 ? ((currentValue - invested) / invested) * 100 : 0,
            };
          }).sort((a, b) => b.currentValue - a.currentValue),
          generatedAt: new Date().toISOString(),
        };
      } else if (reportType.id === 'goals') {
        data = {
          goals: goals.map(goal => ({
            ...goal,
            categoryConfig: GOAL_CATEGORIES[goal.category] || GOAL_CATEGORIES.CUSTOM,
            progress: goal.target_amount > 0 ? ((goal.current_value || 0) / goal.target_amount) * 100 : 0,
            remaining: goal.target_amount - (goal.current_value || 0),
          })),
          summary: {
            total: goals.length,
            completed: goals.filter(g => (g.current_value || 0) >= g.target_amount).length,
            inProgress: goals.filter(g => g.current_value > 0 && g.current_value < g.target_amount).length,
            totalTarget: goals.reduce((sum, g) => sum + (g.target_amount || 0), 0),
            totalProgress: goals.reduce((sum, g) => sum + (g.current_value || 0), 0),
          },
          generatedAt: new Date().toISOString(),
        };
      } else if (reportType.id === 'performance') {
        // Calculate performance metrics
        const assetPerformance = assets.map(asset => {
          const invested = getInvestedValue(asset);
          const currentValue = getAssetValue(asset);
          const gain = currentValue - invested;
          const gainPercent = invested > 0 ? (gain / invested) * 100 : 0;
          return {
            ...asset,
            invested,
            currentValue,
            gain,
            gainPercent,
          };
        });

        const topPerformers = [...assetPerformance].sort((a, b) => b.gainPercent - a.gainPercent).slice(0, 5);
        const bottomPerformers = [...assetPerformance].sort((a, b) => a.gainPercent - b.gainPercent).slice(0, 5);

        const totalInvested = assetPerformance.reduce((sum, a) => sum + a.invested, 0);
        const totalCurrentValue = assetPerformance.reduce((sum, a) => sum + a.currentValue, 0);
        const totalGain = totalCurrentValue - totalInvested;
        const totalGainPercent = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

        // Category-wise performance
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

        data = {
          totalInvested,
          totalCurrentValue,
          totalGain,
          totalGainPercent,
          topPerformers,
          bottomPerformers,
          categoryPerformance,
          assetCount: assets.length,
          generatedAt: new Date().toISOString(),
        };
      } else if (reportType.id === 'tax') {
        // Calculate tax-related metrics
        let taxableInterestIncome = 0;
        let taxExemptInterestIncome = 0;
        let totalDividendIncome = 0;
        let totalCapitalGains = 0;

        // Tax-exempt instruments (EEE category - Exempt-Exempt-Exempt)
        const taxExemptTypes = ['PPF', 'EPF', 'VPF', 'SSY'];

        // Interest from Fixed Income - separate taxable vs tax-exempt
        assets.filter(a => a.category === 'FIXED_INCOME').forEach(asset => {
          const calc = fixedIncomeCalcs[asset.id];
          const interest = calc?.interest || 0;
          if (taxExemptTypes.includes(asset.asset_type)) {
            taxExemptInterestIncome += interest;
          } else {
            taxableInterestIncome += interest;
          }
        });

        // Capital gains from equity
        assets.filter(a => a.category === 'EQUITY').forEach(asset => {
          const invested = getInvestedValue(asset);
          const currentValue = getAssetValue(asset);
          if (currentValue > invested) {
            totalCapitalGains += (currentValue - invested);
          }
        });

        const fixedIncomeAssets = assets.filter(a => a.category === 'FIXED_INCOME').map(asset => {
          const calc = fixedIncomeCalcs[asset.id];
          const isTaxExempt = taxExemptTypes.includes(asset.asset_type);
          return {
            ...asset,
            principal: calc?.principal || asset.principal || 0,
            interest: calc?.interest || 0,
            isTaxExempt,
          };
        });

        data = {
          taxableInterestIncome,
          taxExemptInterestIncome,
          totalInterestIncome: taxableInterestIncome + taxExemptInterestIncome,
          totalDividendIncome,
          totalCapitalGains,
          totalTaxableIncome: taxableInterestIncome + totalDividendIncome + totalCapitalGains,
          fixedIncomeAssets,
          generatedAt: new Date().toISOString(),
        };
      } else if (reportType.id === 'transactions') {
        // Fetch all transactions
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

        // Sort by date descending
        allTransactions.sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));

        const totalBuys = allTransactions.filter(t => t.type === 'BUY').reduce((sum, t) => sum + (t.total_amount || 0), 0);
        const totalSells = allTransactions.filter(t => t.type === 'SELL').reduce((sum, t) => sum + (t.total_amount || 0), 0);

        data = {
          transactions: allTransactions,
          summary: {
            totalTransactions: allTransactions.length,
            totalBuys,
            totalSells,
            netFlow: totalBuys - totalSells,
          },
          generatedAt: new Date().toISOString(),
        };
      }

      setReportData(data);
    } catch (error) {
      console.error('Failed to generate report:', error);
      toast.error('Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  // Export to CSV
  const exportToCSV = () => {
    if (!reportData || !selectedReport) return;

    let csvContent = '';
    const timestamp = new Date().toISOString().split('T')[0];

    if (selectedReport.id === 'holdings' && reportData.assets) {
      csvContent = 'Name,Type,Category,Invested,Current Value,Gain/Loss,Gain %\n';
      reportData.assets.forEach(asset => {
        csvContent += `"${asset.name}","${asset.typeName}","${asset.category}",${asset.invested.toFixed(2)},${asset.currentValue.toFixed(2)},${asset.gain.toFixed(2)},${asset.gainPercent.toFixed(2)}%\n`;
      });
    } else if (selectedReport.id === 'portfolio-summary') {
      csvContent = 'Metric,Value\n';
      csvContent += `Total Invested,${reportData.totalInvested?.toFixed(2) || 0}\n`;
      csvContent += `Current Value,${reportData.totalCurrentValue?.toFixed(2) || 0}\n`;
      csvContent += `Total Gain/Loss,${reportData.totalGain?.toFixed(2) || 0}\n`;
      csvContent += `Return %,${reportData.totalGainPercent?.toFixed(2) || 0}%\n`;
      csvContent += `Total Assets,${reportData.assetCount || 0}\n`;
    } else {
      csvContent = 'Report data not available for CSV export';
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${selectedReport.id}-report-${timestamp}.csv`;
    link.click();
    toast.success('Report exported to CSV');
  };

  // Print report
  const handlePrint = () => {
    if (!reportData || !selectedReport) return;

    const printWindow = window.open('', '_blank');

    // Build print content based on report type
    let content = '';

    if (selectedReport.id === 'portfolio-summary') {
      const pieData = Object.entries(reportData.assetTypeBreakdown || {})
        .map(([name, data]) => ({ name: name.replace(/_/g, ' '), value: data.current, count: data.count }))
        .filter(d => d.value > 0)
        .sort((a, b) => b.value - a.value);

      content = `
        <h1>Portfolio Summary</h1>
        <p class="subtitle">Generated for ${reportData.userName} on ${new Date(reportData.generatedAt).toLocaleDateString('en-IN', { dateStyle: 'full' })}</p>

        <div class="summary-grid">
          <div class="summary-card">
            <div class="label">Total Invested</div>
            <div class="value">${formatCurrency(reportData.totalInvested || 0)}</div>
          </div>
          <div class="summary-card">
            <div class="label">Current Value</div>
            <div class="value">${formatCurrency(reportData.totalCurrentValue || 0)}</div>
          </div>
          <div class="summary-card">
            <div class="label">Total Gain/Loss</div>
            <div class="value ${(reportData.totalGain || 0) >= 0 ? 'positive' : 'negative'}">${(reportData.totalGain || 0) >= 0 ? '+' : ''}${formatCurrency(reportData.totalGain || 0)}</div>
          </div>
          <div class="summary-card">
            <div class="label">Returns</div>
            <div class="value ${(reportData.totalGainPercent || 0) >= 0 ? 'positive' : 'negative'}">${(reportData.totalGainPercent || 0) >= 0 ? '+' : ''}${(reportData.totalGainPercent || 0).toFixed(2)}%</div>
          </div>
        </div>

        <h2>Asset Allocation</h2>
        <table>
          <thead>
            <tr>
              <th>Asset Type</th>
              <th style="text-align: right;">Value</th>
              <th style="text-align: right;">Allocation</th>
            </tr>
          </thead>
          <tbody>
            ${pieData.map(entry => `
              <tr>
                <td>${entry.name} (${entry.count})</td>
                <td style="text-align: right;">${formatCurrency(entry.value)}</td>
                <td style="text-align: right;">${((entry.value / (reportData.totalCurrentValue || 1)) * 100).toFixed(1)}%</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td><strong>Total</strong></td>
              <td style="text-align: right;"><strong>${formatCurrency(reportData.totalCurrentValue || 0)}</strong></td>
              <td style="text-align: right;"><strong>100%</strong></td>
            </tr>
          </tfoot>
        </table>
      `;
    } else if (selectedReport.id === 'holdings') {
      content = `
        <h1>Holdings Report</h1>
        <p class="subtitle">As of ${new Date(reportData.generatedAt).toLocaleDateString('en-IN', { dateStyle: 'full' })}</p>

        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <th>Type</th>
              <th style="text-align: right;">Invested</th>
              <th style="text-align: right;">Current Value</th>
              <th style="text-align: right;">Gain/Loss</th>
            </tr>
          </thead>
          <tbody>
            ${(reportData.assets || []).map(asset => `
              <tr>
                <td>${asset.name}</td>
                <td>${asset.typeName}</td>
                <td style="text-align: right;">${formatCurrency(asset.invested)}</td>
                <td style="text-align: right;">${formatCurrency(asset.currentValue)}</td>
                <td style="text-align: right;" class="${asset.gain >= 0 ? 'positive' : 'negative'}">${asset.gain >= 0 ? '+' : ''}${formatCurrency(asset.gain)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (selectedReport.id === 'goals') {
      content = `
        <h1>Goal Progress Report</h1>
        <p class="subtitle">Generated on ${new Date(reportData.generatedAt).toLocaleDateString('en-IN', { dateStyle: 'full' })}</p>

        <div class="summary-grid">
          <div class="summary-card">
            <div class="label">Total Goals</div>
            <div class="value">${reportData.summary?.total || 0}</div>
          </div>
          <div class="summary-card">
            <div class="label">Completed</div>
            <div class="value positive">${reportData.summary?.completed || 0}</div>
          </div>
        </div>

        <h2>Goals</h2>
        <table>
          <thead>
            <tr>
              <th>Goal Name</th>
              <th style="text-align: right;">Target</th>
              <th style="text-align: right;">Current</th>
              <th style="text-align: right;">Progress</th>
            </tr>
          </thead>
          <tbody>
            ${(reportData.goals || []).map(goal => `
              <tr>
                <td>${goal.name}</td>
                <td style="text-align: right;">${formatCurrency(goal.target_amount || 0)}</td>
                <td style="text-align: right;">${formatCurrency(goal.current_value || 0)}</td>
                <td style="text-align: right;">${(goal.progress || 0).toFixed(0)}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${selectedReport?.title || 'Report'} - Wealth Tracker</title>
          <style>
            * { box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              padding: 40px;
              color: #1a1a1a;
              line-height: 1.5;
            }
            h1 { font-size: 24px; margin: 0 0 4px 0; }
            h2 { font-size: 16px; margin: 32px 0 16px 0; color: #374151; }
            .subtitle { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
            .summary-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 16px;
              margin-bottom: 24px;
            }
            .summary-card {
              padding: 16px;
              background: #f9fafb;
              border-radius: 8px;
              border: 1px solid #e5e7eb;
            }
            .summary-card .label {
              font-size: 11px;
              text-transform: uppercase;
              color: #6b7280;
              margin-bottom: 4px;
            }
            .summary-card .value {
              font-size: 20px;
              font-weight: 700;
            }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th {
              padding: 12px 8px;
              text-align: left;
              border-bottom: 2px solid #e5e7eb;
              font-size: 12px;
              color: #6b7280;
              text-transform: uppercase;
            }
            td {
              padding: 12px 8px;
              border-bottom: 1px solid #e5e7eb;
              font-size: 13px;
            }
            tfoot td {
              border-top: 2px solid #e5e7eb;
              border-bottom: none;
            }
            .positive { color: #059669; }
            .negative { color: #dc2626; }
            .footer {
              margin-top: 40px;
              padding-top: 16px;
              border-top: 1px solid #e5e7eb;
              font-size: 11px;
              color: #9ca3af;
            }
            @media print {
              body { padding: 20px; }
              .summary-grid { grid-template-columns: repeat(4, 1fr); }
            }
          </style>
        </head>
        <body>
          ${content}
          <div class="footer">
            Generated by Wealth Tracker on ${new Date().toLocaleDateString('en-IN', { dateStyle: 'full' })}
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

  // Render report content
  const renderReportContent = () => {
    if (!selectedReport || !reportData) return null;

    if (selectedReport.id === 'portfolio-summary') {
      const pieData = Object.entries(reportData.assetTypeBreakdown || {})
        .map(([name, data]) => ({
          name: name.replace(/_/g, ' '),
          value: data.current,
          color: data.color,
          count: data.count,
        }))
        .filter(d => d.value > 0)
        .sort((a, b) => b.value - a.value);

      return (
        <div ref={printRef} className="space-y-6">
          {/* Gradient Header */}
          <div className="-m-6 mb-0 px-6 py-4 bg-gradient-to-r from-[#3B82F6]/10 via-[#3B82F6]/5 to-transparent border-b border-[var(--separator-opaque)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#3B82F6' + '20', color: '#3B82F6' }}>
                <ReportIcon type="pie-chart" className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-[17px] font-semibold text-[var(--label-primary)]">Portfolio Summary</h2>
                <p className="text-[13px] text-[var(--label-tertiary)] mt-0.5">Complete overview of your net worth and asset allocation</p>
              </div>
            </div>
          </div>

          {/* Summary Cards with Gradients */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
            <Card padding="p-0" className="overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-[var(--chart-primary)]/10 via-[var(--chart-primary)]/5 to-transparent">
                <p className="text-[11px] text-[var(--label-secondary)] uppercase tracking-wide font-medium">Current Value</p>
                <p className="text-[20px] font-bold text-[var(--label-primary)] tabular-nums mt-1">{formatCurrency(reportData.totalCurrentValue || 0)}</p>
              </div>
            </Card>
            <Card padding="p-0" className="overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-[var(--system-gray)]/10 via-[var(--system-gray)]/5 to-transparent">
                <p className="text-[11px] text-[var(--label-secondary)] uppercase tracking-wide font-medium">Total Invested</p>
                <p className="text-[20px] font-bold text-[var(--label-primary)] tabular-nums mt-1">{formatCurrency(reportData.totalInvested || 0)}</p>
              </div>
            </Card>
            <Card padding="p-0" className="overflow-hidden">
              <div className={`px-4 py-3 bg-gradient-to-r ${(reportData.totalGain || 0) >= 0 ? 'from-[#059669]/10 via-[#059669]/5' : 'from-[#DC2626]/10 via-[#DC2626]/5'} to-transparent`}>
                <p className="text-[11px] text-[var(--label-secondary)] uppercase tracking-wide font-medium">Total Gain/Loss</p>
                <p className={`text-[20px] font-bold tabular-nums mt-1 ${(reportData.totalGain || 0) >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                  {(reportData.totalGain || 0) >= 0 ? '+' : ''}{formatCurrency(reportData.totalGain || 0)}
                </p>
              </div>
            </Card>
            <Card padding="p-0" className="overflow-hidden">
              <div className={`px-4 py-3 bg-gradient-to-r ${(reportData.totalGainPercent || 0) >= 0 ? 'from-[#059669]/10 via-[#059669]/5' : 'from-[#DC2626]/10 via-[#DC2626]/5'} to-transparent`}>
                <p className="text-[11px] text-[var(--label-secondary)] uppercase tracking-wide font-medium">Returns</p>
                <p className={`text-[20px] font-bold tabular-nums mt-1 ${(reportData.totalGainPercent || 0) >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                  {(reportData.totalGainPercent || 0) >= 0 ? '+' : ''}{(reportData.totalGainPercent || 0).toFixed(2)}%
                </p>
              </div>
            </Card>
          </div>

          <div>
            <h2 className="text-[15px] font-semibold text-[var(--label-primary)] mb-4">Asset Allocation</h2>
            <div className="flex flex-col md:flex-row gap-6 items-start">
              <div className="w-full md:w-[240px] h-[240px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="flex-1 w-full">
                <div className="border border-[var(--separator-opaque)] rounded-xl overflow-hidden">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="bg-[var(--fill-tertiary)]">
                        <th className="text-left py-2.5 px-3 font-semibold text-[var(--label-secondary)]">Asset Type</th>
                        <th className="text-right py-2.5 px-3 font-semibold text-[var(--label-secondary)]">Value</th>
                        <th className="text-right py-2.5 px-3 font-semibold text-[var(--label-secondary)]">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pieData.map((entry, index) => (
                        <tr key={index} className="border-t border-[var(--separator-opaque)]/50">
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
                              <span className="text-[var(--label-primary)]">{entry.name}</span>
                              <span className="text-[var(--label-quaternary)] text-[11px]">({entry.count})</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right text-[var(--label-primary)] font-medium tabular-nums">
                            {formatCurrency(entry.value)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-[var(--label-tertiary)] tabular-nums">
                            {((entry.value / (reportData.totalCurrentValue || 1)) * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* Generated date at bottom */}
          <p className="text-[12px] text-[var(--label-quaternary)] pt-4 border-t border-[var(--separator-opaque)]">
            Generated for {reportData.userName} on {new Date(reportData.generatedAt).toLocaleDateString('en-IN', { dateStyle: 'full' })}
          </p>
        </div>
      );
    }

    if (selectedReport.id === 'holdings') {
      return (
        <div ref={printRef} className="space-y-6">
          {/* Gradient Header */}
          <div className="-m-6 mb-0 px-6 py-4 bg-gradient-to-r from-[#10B981]/10 via-[#10B981]/5 to-transparent border-b border-[var(--separator-opaque)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#10B981' + '20', color: '#10B981' }}>
                <ReportIcon type="list" className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-[17px] font-semibold text-[var(--label-primary)]">Holdings Report</h2>
                <p className="text-[13px] text-[var(--label-tertiary)] mt-0.5">Detailed breakdown of all your assets and investments</p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto pt-2">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--separator-opaque)]">
                  <th className="text-left py-3 px-2 font-semibold text-[var(--label-secondary)]">Asset</th>
                  <th className="text-left py-3 px-2 font-semibold text-[var(--label-secondary)]">Type</th>
                  <th className="text-right py-3 px-2 font-semibold text-[var(--label-secondary)]">Invested</th>
                  <th className="text-right py-3 px-2 font-semibold text-[var(--label-secondary)]">Current</th>
                  <th className="text-right py-3 px-2 font-semibold text-[var(--label-secondary)]">Gain/Loss</th>
                </tr>
              </thead>
              <tbody>
                {(reportData.assets || []).map((asset, index) => (
                  <tr key={index} className="border-b border-[var(--separator-opaque)]/50">
                    <td className="py-3 px-2 text-[var(--label-primary)] font-medium">{asset.name}</td>
                    <td className="py-3 px-2 text-[var(--label-tertiary)]">{asset.typeName}</td>
                    <td className="py-3 px-2 text-right text-[var(--label-secondary)] tabular-nums">{formatCurrency(asset.invested)}</td>
                    <td className="py-3 px-2 text-right text-[var(--label-primary)] font-medium tabular-nums">{formatCurrency(asset.currentValue)}</td>
                    <td className={`py-3 px-2 text-right font-medium tabular-nums ${asset.gain >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                      {asset.gain >= 0 ? '+' : ''}{formatCurrency(asset.gain)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Generated date at bottom */}
          <p className="text-[12px] text-[var(--label-quaternary)] pt-4 border-t border-[var(--separator-opaque)]">
            Generated on {new Date(reportData.generatedAt).toLocaleDateString('en-IN', { dateStyle: 'full' })}
          </p>
        </div>
      );
    }

    if (selectedReport.id === 'goals') {
      return (
        <div ref={printRef} className="space-y-6">
          {/* Gradient Header */}
          <div className="-m-6 mb-0 px-6 py-4 bg-gradient-to-r from-[#F59E0B]/10 via-[#F59E0B]/5 to-transparent border-b border-[var(--separator-opaque)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#F59E0B' + '20', color: '#F59E0B' }}>
                <ReportIcon type="target" className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-[17px] font-semibold text-[var(--label-primary)]">Goal Progress Report</h2>
                <p className="text-[13px] text-[var(--label-tertiary)] mt-0.5">Track progress towards your financial goals</p>
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
            <Card padding="p-0" className="overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-[var(--chart-primary)]/10 via-[var(--chart-primary)]/5 to-transparent">
                <p className="text-[11px] text-[var(--label-secondary)] uppercase tracking-wide font-medium">Total Goals</p>
                <p className="text-[22px] font-bold text-[var(--label-primary)] mt-1">{reportData.summary?.total || 0}</p>
              </div>
            </Card>
            <Card padding="p-0" className="overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-[#059669]/10 via-[#059669]/5 to-transparent">
                <p className="text-[11px] text-[var(--label-secondary)] uppercase tracking-wide font-medium">Completed</p>
                <p className="text-[22px] font-bold text-[#059669] mt-1">{reportData.summary?.completed || 0}</p>
              </div>
            </Card>
            <Card padding="p-0" className="overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-[#F59E0B]/10 via-[#F59E0B]/5 to-transparent">
                <p className="text-[11px] text-[var(--label-secondary)] uppercase tracking-wide font-medium">In Progress</p>
                <p className="text-[22px] font-bold text-[#F59E0B] mt-1">{reportData.summary?.inProgress || 0}</p>
              </div>
            </Card>
            <Card padding="p-0" className="overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-[var(--system-gray)]/10 via-[var(--system-gray)]/5 to-transparent">
                <p className="text-[11px] text-[var(--label-secondary)] uppercase tracking-wide font-medium">Total Target</p>
                <p className="text-[18px] font-bold text-[var(--label-primary)] mt-1">{formatCurrency(reportData.summary?.totalTarget || 0)}</p>
              </div>
            </Card>
          </div>

          {/* Goals List */}
          <div className="space-y-3">
            {(reportData.goals || []).map((goal, index) => (
              <div key={index} className="p-4 rounded-xl border border-[var(--separator-opaque)]">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-[14px] font-semibold text-[var(--label-primary)]">{goal.name}</h3>
                  <span className="text-[13px] font-bold" style={{ color: goal.categoryConfig?.color || '#6B7280' }}>
                    {(goal.progress || 0).toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 bg-[var(--fill-tertiary)] rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(goal.progress || 0, 100)}%`, backgroundColor: goal.categoryConfig?.color || '#6B7280' }}
                  />
                </div>
                <div className="flex justify-between text-[12px]">
                  <span className="text-[var(--label-tertiary)]">{formatCurrency(goal.current_value || 0)} saved</span>
                  <span className="text-[var(--label-secondary)]">Target: {formatCurrency(goal.target_amount || 0)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Generated date at bottom */}
          <p className="text-[12px] text-[var(--label-quaternary)] pt-4 border-t border-[var(--separator-opaque)]">
            Generated on {new Date(reportData.generatedAt).toLocaleDateString('en-IN', { dateStyle: 'full' })}
          </p>
        </div>
      );
    }

    if (selectedReport.id === 'performance') {
      return (
        <div ref={printRef} className="space-y-6">
          {/* Gradient Header */}
          <div className="-m-6 mb-0 px-6 py-4 bg-gradient-to-r from-[#8B5CF6]/10 via-[#8B5CF6]/5 to-transparent border-b border-[var(--separator-opaque)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#8B5CF6' + '20', color: '#8B5CF6' }}>
                <ReportIcon type="trending" className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-[17px] font-semibold text-[var(--label-primary)]">Performance Analysis</h2>
                <p className="text-[13px] text-[var(--label-tertiary)] mt-0.5">Returns, gains/losses, and portfolio performance metrics</p>
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
            <Card padding="p-0" className="overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-[var(--chart-primary)]/10 via-[var(--chart-primary)]/5 to-transparent">
                <p className="text-[11px] text-[var(--label-secondary)] uppercase tracking-wide font-medium">Total Invested</p>
                <p className="text-[20px] font-bold text-[var(--label-primary)] tabular-nums mt-1">{formatCurrency(reportData.totalInvested || 0)}</p>
              </div>
            </Card>
            <Card padding="p-0" className="overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-[var(--system-gray)]/10 via-[var(--system-gray)]/5 to-transparent">
                <p className="text-[11px] text-[var(--label-secondary)] uppercase tracking-wide font-medium">Current Value</p>
                <p className="text-[20px] font-bold text-[var(--label-primary)] tabular-nums mt-1">{formatCurrency(reportData.totalCurrentValue || 0)}</p>
              </div>
            </Card>
            <Card padding="p-0" className="overflow-hidden">
              <div className={`px-4 py-3 bg-gradient-to-r ${(reportData.totalGain || 0) >= 0 ? 'from-[#059669]/10 via-[#059669]/5' : 'from-[#DC2626]/10 via-[#DC2626]/5'} to-transparent`}>
                <p className="text-[11px] text-[var(--label-secondary)] uppercase tracking-wide font-medium">Total Gain/Loss</p>
                <p className={`text-[20px] font-bold tabular-nums mt-1 ${(reportData.totalGain || 0) >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                  {(reportData.totalGain || 0) >= 0 ? '+' : ''}{formatCurrency(reportData.totalGain || 0)}
                </p>
              </div>
            </Card>
            <Card padding="p-0" className="overflow-hidden">
              <div className={`px-4 py-3 bg-gradient-to-r ${(reportData.totalGainPercent || 0) >= 0 ? 'from-[#059669]/10 via-[#059669]/5' : 'from-[#DC2626]/10 via-[#DC2626]/5'} to-transparent`}>
                <p className="text-[11px] text-[var(--label-secondary)] uppercase tracking-wide font-medium">Returns</p>
                <p className={`text-[20px] font-bold tabular-nums mt-1 ${(reportData.totalGainPercent || 0) >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                  {(reportData.totalGainPercent || 0) >= 0 ? '+' : ''}{(reportData.totalGainPercent || 0).toFixed(2)}%
                </p>
              </div>
            </Card>
          </div>

          {/* Top & Bottom Performers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-[15px] font-semibold text-[var(--label-primary)] mb-3">Top Performers</h3>
              <div className="space-y-2">
                {(reportData.topPerformers || []).map((asset, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-xl border border-[var(--separator-opaque)]">
                    <div>
                      <p className="text-[13px] font-medium text-[var(--label-primary)]">{asset.name}</p>
                      <p className="text-[11px] text-[var(--label-tertiary)]">{asset.asset_type}</p>
                    </div>
                    <span className={`text-[13px] font-bold ${asset.gainPercent >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                      {asset.gainPercent >= 0 ? '+' : ''}{asset.gainPercent.toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-[var(--label-primary)] mb-3">Bottom Performers</h3>
              <div className="space-y-2">
                {(reportData.bottomPerformers || []).map((asset, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-xl border border-[var(--separator-opaque)]">
                    <div>
                      <p className="text-[13px] font-medium text-[var(--label-primary)]">{asset.name}</p>
                      <p className="text-[11px] text-[var(--label-tertiary)]">{asset.asset_type}</p>
                    </div>
                    <span className={`text-[13px] font-bold ${asset.gainPercent >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                      {asset.gainPercent >= 0 ? '+' : ''}{asset.gainPercent.toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Category Performance */}
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--label-primary)] mb-3">Category-wise Performance</h3>
            <div className="border border-[var(--separator-opaque)] rounded-xl overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-[var(--fill-tertiary)]">
                    <th className="text-left py-2.5 px-3 font-semibold text-[var(--label-secondary)]">Category</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-[var(--label-secondary)]">Invested</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-[var(--label-secondary)]">Current</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-[var(--label-secondary)]">Gain/Loss</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(reportData.categoryPerformance || {}).map(([category, data], index) => (
                    <tr key={index} className="border-t border-[var(--separator-opaque)]/50">
                      <td className="py-2.5 px-3 text-[var(--label-primary)] font-medium">{category.replace(/_/g, ' ')}</td>
                      <td className="py-2.5 px-3 text-right text-[var(--label-secondary)] tabular-nums">{formatCurrency(data.invested)}</td>
                      <td className="py-2.5 px-3 text-right text-[var(--label-primary)] tabular-nums">{formatCurrency(data.current)}</td>
                      <td className={`py-2.5 px-3 text-right font-medium tabular-nums ${data.gain >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                        {data.gain >= 0 ? '+' : ''}{formatCurrency(data.gain)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Generated date at bottom */}
          <p className="text-[12px] text-[var(--label-quaternary)] pt-4 border-t border-[var(--separator-opaque)]">
            Generated on {new Date(reportData.generatedAt).toLocaleDateString('en-IN', { dateStyle: 'full' })}
          </p>
        </div>
      );
    }

    if (selectedReport.id === 'tax') {
      return (
        <div ref={printRef} className="space-y-6">
          {/* Gradient Header */}
          <div className="-m-6 mb-0 px-6 py-4 bg-gradient-to-r from-[#EF4444]/10 via-[#EF4444]/5 to-transparent border-b border-[var(--separator-opaque)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#EF4444' + '20', color: '#EF4444' }}>
                <ReportIcon type="document" className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-[17px] font-semibold text-[var(--label-primary)]">Tax Summary</h2>
                <p className="text-[13px] text-[var(--label-tertiary)] mt-0.5">Capital gains, dividends, and interest income for tax filing</p>
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2">
            <Card padding="p-0" className="overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-[#10B981]/10 via-[#10B981]/5 to-transparent">
                <p className="text-[11px] text-[var(--label-secondary)] uppercase tracking-wide font-medium">Taxable Interest</p>
                <p className="text-[20px] font-bold text-[var(--label-primary)] tabular-nums mt-1">{formatCurrency(reportData.taxableInterestIncome || 0)}</p>
              </div>
            </Card>
            <Card padding="p-0" className="overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-[#F59E0B]/10 via-[#F59E0B]/5 to-transparent">
                <p className="text-[11px] text-[var(--label-secondary)] uppercase tracking-wide font-medium">Capital Gains</p>
                <p className="text-[20px] font-bold text-[var(--label-primary)] tabular-nums mt-1">{formatCurrency(reportData.totalCapitalGains || 0)}</p>
              </div>
            </Card>
            <Card padding="p-0" className="overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-[#EF4444]/10 via-[#EF4444]/5 to-transparent">
                <p className="text-[11px] text-[var(--label-secondary)] uppercase tracking-wide font-medium">Total Taxable</p>
                <p className="text-[20px] font-bold text-[var(--label-primary)] tabular-nums mt-1">{formatCurrency(reportData.totalTaxableIncome || 0)}</p>
              </div>
            </Card>
          </div>

          {/* Tax Exempt Income */}
          {(reportData.taxExemptInterestIncome || 0) > 0 && (
            <div className="p-4 rounded-xl bg-[#059669]/5 border border-[#059669]/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-[#059669]">Tax-Exempt Interest Income</p>
                  <p className="text-[11px] text-[var(--label-tertiary)] mt-0.5">From PPF, EPF, VPF, SSY (EEE instruments)</p>
                </div>
                <p className="text-[20px] font-bold text-[#059669] tabular-nums">{formatCurrency(reportData.taxExemptInterestIncome || 0)}</p>
              </div>
            </div>
          )}

          {/* Interest Income Breakdown */}
          {(reportData.fixedIncomeAssets || []).length > 0 && (
            <div>
              <h3 className="text-[15px] font-semibold text-[var(--label-primary)] mb-3">Interest Income Breakdown</h3>
              <div className="border border-[var(--separator-opaque)] rounded-xl overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-[var(--fill-tertiary)]">
                      <th className="text-left py-2.5 px-3 font-semibold text-[var(--label-secondary)]">Asset</th>
                      <th className="text-left py-2.5 px-3 font-semibold text-[var(--label-secondary)]">Type</th>
                      <th className="text-right py-2.5 px-3 font-semibold text-[var(--label-secondary)]">Principal</th>
                      <th className="text-right py-2.5 px-3 font-semibold text-[var(--label-secondary)]">Interest Earned</th>
                      <th className="text-center py-2.5 px-3 font-semibold text-[var(--label-secondary)]">Tax Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reportData.fixedIncomeAssets || []).map((asset, index) => (
                      <tr key={index} className="border-t border-[var(--separator-opaque)]/50">
                        <td className="py-2.5 px-3 text-[var(--label-primary)] font-medium">{asset.name}</td>
                        <td className="py-2.5 px-3 text-[var(--label-tertiary)]">{asset.asset_type}</td>
                        <td className="py-2.5 px-3 text-right text-[var(--label-secondary)] tabular-nums">{formatCurrency(asset.principal)}</td>
                        <td className="py-2.5 px-3 text-right text-[#059669] font-medium tabular-nums">{formatCurrency(asset.interest)}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold ${asset.isTaxExempt ? 'bg-[#059669]/10 text-[#059669]' : 'bg-[var(--fill-tertiary)] text-[var(--label-secondary)]'}`}>
                            {asset.isTaxExempt ? 'Tax-Free' : 'Taxable'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <div className="p-4 rounded-xl bg-[var(--fill-tertiary)] border border-[var(--separator-opaque)]">
            <p className="text-[12px] text-[var(--label-tertiary)]">
              <span className="font-semibold text-[var(--label-secondary)]">Disclaimer:</span> This is an estimated summary for reference only.
              Please consult a tax professional for accurate tax calculations and filing. Capital gains shown are unrealized gains.
            </p>
          </div>

          {/* Generated date at bottom */}
          <p className="text-[12px] text-[var(--label-quaternary)] pt-4 border-t border-[var(--separator-opaque)]">
            Generated on {new Date(reportData.generatedAt).toLocaleDateString('en-IN', { dateStyle: 'full' })}
          </p>
        </div>
      );
    }

    if (selectedReport.id === 'transactions') {
      return (
        <div ref={printRef} className="space-y-6">
          {/* Gradient Header */}
          <div className="-m-6 mb-0 px-6 py-4 bg-gradient-to-r from-[#06B6D4]/10 via-[#06B6D4]/5 to-transparent border-b border-[var(--separator-opaque)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#06B6D4' + '20', color: '#06B6D4' }}>
                <ReportIcon type="clock" className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-[17px] font-semibold text-[var(--label-primary)]">Transaction History</h2>
                <p className="text-[13px] text-[var(--label-tertiary)] mt-0.5">Complete history of all your buy/sell transactions</p>
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
            <Card padding="p-0" className="overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-[var(--chart-primary)]/10 via-[var(--chart-primary)]/5 to-transparent">
                <p className="text-[11px] text-[var(--label-secondary)] uppercase tracking-wide font-medium">Total Transactions</p>
                <p className="text-[22px] font-bold text-[var(--label-primary)] mt-1">{reportData.summary?.totalTransactions || 0}</p>
              </div>
            </Card>
            <Card padding="p-0" className="overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-[#059669]/10 via-[#059669]/5 to-transparent">
                <p className="text-[11px] text-[var(--label-secondary)] uppercase tracking-wide font-medium">Total Buys</p>
                <p className="text-[20px] font-bold text-[#059669] tabular-nums mt-1">{formatCurrency(reportData.summary?.totalBuys || 0)}</p>
              </div>
            </Card>
            <Card padding="p-0" className="overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-[#DC2626]/10 via-[#DC2626]/5 to-transparent">
                <p className="text-[11px] text-[var(--label-secondary)] uppercase tracking-wide font-medium">Total Sells</p>
                <p className="text-[20px] font-bold text-[#DC2626] tabular-nums mt-1">{formatCurrency(reportData.summary?.totalSells || 0)}</p>
              </div>
            </Card>
            <Card padding="p-0" className="overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-[var(--system-gray)]/10 via-[var(--system-gray)]/5 to-transparent">
                <p className="text-[11px] text-[var(--label-secondary)] uppercase tracking-wide font-medium">Net Investment</p>
                <p className="text-[20px] font-bold text-[var(--label-primary)] tabular-nums mt-1">{formatCurrency(reportData.summary?.netFlow || 0)}</p>
              </div>
            </Card>
          </div>

          {/* Transactions Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--separator-opaque)]">
                  <th className="text-left py-3 px-2 font-semibold text-[var(--label-secondary)]">Date</th>
                  <th className="text-left py-3 px-2 font-semibold text-[var(--label-secondary)]">Asset</th>
                  <th className="text-left py-3 px-2 font-semibold text-[var(--label-secondary)]">Type</th>
                  <th className="text-right py-3 px-2 font-semibold text-[var(--label-secondary)]">Quantity</th>
                  <th className="text-right py-3 px-2 font-semibold text-[var(--label-secondary)]">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(reportData.transactions || []).slice(0, 50).map((txn, index) => (
                  <tr key={index} className="border-b border-[var(--separator-opaque)]/50">
                    <td className="py-3 px-2 text-[var(--label-tertiary)] tabular-nums">
                      {new Date(txn.transaction_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="py-3 px-2 text-[var(--label-primary)] font-medium">{txn.assetName}</td>
                    <td className="py-3 px-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold ${txn.type === 'BUY' ? 'bg-[#059669]/10 text-[#059669]' : 'bg-[#DC2626]/10 text-[#DC2626]'}`}>
                        {txn.type}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right text-[var(--label-secondary)] tabular-nums">{txn.quantity || '-'}</td>
                    <td className="py-3 px-2 text-right text-[var(--label-primary)] font-medium tabular-nums">{formatCurrency(txn.total_amount || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(reportData.transactions || []).length > 50 && (
              <p className="text-[12px] text-[var(--label-tertiary)] text-center py-3">
                Showing 50 of {reportData.transactions.length} transactions. Export to CSV for complete list.
              </p>
            )}
          </div>

          {/* Generated date at bottom */}
          <p className="text-[12px] text-[var(--label-quaternary)] pt-4 border-t border-[var(--separator-opaque)]">
            Generated on {new Date(reportData.generatedAt).toLocaleDateString('en-IN', { dateStyle: 'full' })}
          </p>
        </div>
      );
    }

    return (
      <div ref={printRef} className="text-center py-12">
        <p className="text-[var(--label-tertiary)]">Select a report to view</p>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="h-full overflow-auto">
        <div className="p-4 md:px-12 md:py-6">
          <div className="h-8 w-48 bg-[var(--fill-tertiary)] rounded-lg animate-pulse mb-2" />
          <div className="h-4 w-64 bg-[var(--fill-tertiary)] rounded animate-pulse mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-32 bg-[var(--fill-tertiary)] rounded-2xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-4 md:px-12 md:py-6">
        <div className="space-y-6">
          <div>
            <h1 className="text-[28px] font-bold text-[var(--label-primary)] tracking-tight">Reports</h1>
            <p className="text-[14px] text-[var(--label-tertiary)] mt-1">
              Generate, export, and print detailed financial reports
            </p>
          </div>

          {!selectedReport ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.values(REPORT_TYPES).map((report) => (
                <motion.button
                  key={report.id}
                  whileTap={tapScale}
                  onClick={() => generateReport(report)}
                  className="group p-5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--separator-opaque)] shadow-sm hover:shadow-md transition-all text-left"
                >
                  <div className="flex items-start gap-4">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: report.color + '15', color: report.color }}
                    >
                      <ReportIcon type={report.icon} className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[15px] font-semibold text-[var(--label-primary)] group-hover:text-[var(--system-blue)] transition-colors">
                        {report.title}
                      </h3>
                      <p className="text-[12px] text-[var(--label-tertiary)] mt-1 line-clamp-2">
                        {report.description}
                      </p>
                    </div>
                    <svg className="w-5 h-5 text-[var(--label-quaternary)] group-hover:text-[var(--system-blue)] transition-colors shrink-0 self-center" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </motion.button>
              ))}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4">
                <button
                  onClick={() => {
                    setSelectedReport(null);
                    setReportData(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--label-secondary)] hover:text-[var(--system-blue)] transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  All Reports
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={exportToCSV}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--fill-tertiary)] border border-[var(--separator-opaque)] text-[var(--label-primary)] hover:bg-[var(--fill-secondary)] transition-colors text-[13px] font-semibold"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Export
                  </button>
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--fill-tertiary)] border border-[var(--separator-opaque)] text-[var(--label-primary)] hover:bg-[var(--fill-secondary)] transition-colors text-[13px] font-semibold"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
                    </svg>
                    Print
                  </button>
                </div>
              </div>

              {generating ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-8 h-8 border-2 border-[var(--system-blue)] border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : (
                <Card padding="p-6">
                  {renderReportContent()}
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
