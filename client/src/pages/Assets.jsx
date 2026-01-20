import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { assetService, priceService, ASSET_CONFIG } from '../services/assets';
import { Card, SearchInput, AssetsSkeleton, BottomSheet } from '../components/apple';
import QuickAddTransaction from '../components/QuickAddTransaction';
import { spring, staggerContainer, staggerItem } from '../utils/animations';
import { categoryColors } from '../constants/theme';
import { formatCurrency, formatCompact } from '../utils/formatting';
import { calculateFixedIncomeValue, getCompoundingFrequency } from '../utils/interest';
import { useToast } from '../context/ToastContext';

export default function Assets() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [prices, setPrices] = useState({});
  const [expandedCategories, setExpandedCategories] = useState({});
  const [expandedAssets, setExpandedAssets] = useState({});
  const [fixedIncomeCalcs, setFixedIncomeCalcs] = useState({});
  const [fixedIncomeLoading, setFixedIncomeLoading] = useState(false);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [selectedAssetForTxn, setSelectedAssetForTxn] = useState(null);
  const [highlightedAssetId, setHighlightedAssetId] = useState(null);
  const [selectedFilter, setSelectedFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('value'); // value, returns, name, recent
  const [transactionDates, setTransactionDates] = useState({}); // First purchase dates
  const [openMenuId, setOpenMenuId] = useState(null); // Track which kebab menu is open
  const assetRefs = useRef({});
  const menuRef = useRef(null);

  // Handle highlight from search
  const highlightParam = searchParams.get('highlight');

  useEffect(() => {
    fetchAssets();
  }, []);

  // Scroll to and highlight asset when coming from search
  useEffect(() => {
    if (highlightParam && !loading && assets.length > 0) {
      const assetId = parseInt(highlightParam);

      // Find the asset's category and expand it
      const asset = assets.find(a => a.id === assetId);
      if (asset) {
        // Expand the category containing this asset
        setExpandedCategories(prev => ({
          ...prev,
          [asset.category]: true
        }));

        // Set highlighted state
        setHighlightedAssetId(assetId);

        // Scroll to the asset after a brief delay for category expansion
        setTimeout(() => {
          const element = assetRefs.current[assetId];
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);

        // Remove highlight after animation
        setTimeout(() => {
          setHighlightedAssetId(null);
          // Clear the URL param
          setSearchParams({});
        }, 2500);
      }
    }
  }, [highlightParam, loading, assets, setSearchParams]);

  // Close kebab menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpenMenuId(null);
      }
    };
    if (openMenuId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuId]);

  const fetchAssets = async () => {
    try {
      const response = await assetService.getAll();
      const assetList = response.data.assets;
      setAssets(assetList);

      const equityAssets = assetList.filter(a => a.category === 'EQUITY' && a.symbol);
      if (equityAssets.length > 0) {
        fetchPrices(equityAssets);
        // Fetch first transaction dates for holding period
        fetchTransactionDates(equityAssets);
      }

      const fixedIncomeAssets = assetList.filter(a => a.category === 'FIXED_INCOME' && a.interest_rate);
      if (fixedIncomeAssets.length > 0) {
        fetchFixedIncomeCalculations(fixedIncomeAssets);
        fetchTransactionDates(fixedIncomeAssets);
      }
    } catch (error) {
      console.error('Error fetching assets:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactionDates = async (assetList) => {
    try {
      const dates = {};
      await Promise.all(
        assetList.map(async (asset) => {
          const txnResponse = await assetService.getTransactions(asset.id);
          const transactions = txnResponse.data.transactions || [];
          if (transactions.length > 0) {
            // Sort by date ascending and get the first one
            const sorted = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
            dates[asset.id] = {
              firstDate: sorted[0].date,
              lastDate: sorted[sorted.length - 1].date,
              count: transactions.length
            };
          }
        })
      );
      setTransactionDates(prev => ({ ...prev, ...dates }));
    } catch (error) {
      console.error('Error fetching transaction dates:', error);
    }
  };

  const fetchFixedIncomeCalculations = async (fixedIncomeAssets) => {
    setFixedIncomeLoading(true);
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
    } finally {
      setFixedIncomeLoading(false);
    }
  };

  const fetchPrices = async (equityAssets) => {
    try {
      const symbols = equityAssets.map(a => ({
        symbol: a.asset_type === 'MUTUAL_FUND' ? a.symbol : `${a.symbol}.${a.exchange === 'BSE' ? 'BO' : 'NS'}`,
        type: a.asset_type === 'MUTUAL_FUND' ? 'mf' : 'stock'
      }));
      const response = await priceService.getBulkPrices(symbols);
      setPrices(response.data.prices || {});
    } catch (error) {
      console.error('Error fetching prices:', error);
    }
  };

  const handleDelete = async (id, name, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Delete "${name}"?`)) return;
    try {
      await assetService.delete(id);
      setAssets(assets.filter((a) => a.id !== id));
      toast.success(`"${name}" deleted successfully`);
    } catch (error) {
      toast.error('Failed to delete asset');
    }
  };

  // Asset value calculations
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
    if (asset.quantity && asset.avg_buy_price) return asset.quantity * asset.avg_buy_price;
    if (asset.principal) return asset.principal;
    if (asset.current_value) return asset.current_value;
    if (asset.purchase_price) return asset.purchase_price;
    if (asset.balance) return asset.balance;
    return 0;
  };

  const getInterestEarned = (asset) => {
    if (asset.category === 'FIXED_INCOME') {
      const calc = fixedIncomeCalcs[asset.id];
      if (calc) return calc.interest;
    }
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

  const getGainLoss = (asset) => getAssetValue(asset) - getInvestedValue(asset);
  const getGainPercent = (asset) => {
    const invested = getInvestedValue(asset);
    return invested > 0 ? ((getAssetValue(asset) - invested) / invested) * 100 : 0;
  };

  const getCurrentPrice = (asset) => {
    if (asset.category === 'EQUITY' && asset.symbol) {
      const priceKey = asset.asset_type === 'MUTUAL_FUND' ? asset.symbol : `${asset.symbol}.${asset.exchange === 'BSE' ? 'BO' : 'NS'}`;
      return prices[priceKey]?.price || asset.avg_buy_price || 0;
    }
    return asset.avg_buy_price || 0;
  };

  // Day's change for equity assets
  const getDayChange = (asset) => {
    if (asset.category === 'EQUITY' && asset.symbol) {
      const priceKey = asset.asset_type === 'MUTUAL_FUND' ? asset.symbol : `${asset.symbol}.${asset.exchange === 'BSE' ? 'BO' : 'NS'}`;
      const priceData = prices[priceKey];
      if (priceData?.changePercent && asset.quantity) {
        const currentValue = asset.quantity * (priceData.price || 0);
        const dayChangeAmount = (currentValue * priceData.changePercent) / (100 + priceData.changePercent);
        return {
          amount: dayChangeAmount,
          percent: priceData.changePercent
        };
      }
    }
    return { amount: 0, percent: 0 };
  };

  // Calculate holding period
  const getHoldingPeriod = (assetId) => {
    const txnData = transactionDates[assetId];
    if (!txnData?.firstDate) return null;

    const firstDate = new Date(txnData.firstDate);
    const now = new Date();
    const diffMs = now - firstDate;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 30) return `${diffDays}d`;
    if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months}mo`;
    }
    const years = Math.floor(diffDays / 365);
    const remainingMonths = Math.floor((diffDays % 365) / 30);
    if (remainingMonths === 0) return `${years}y`;
    return `${years}y ${remainingMonths}mo`;
  };

  // Get exchange badge text
  const getExchangeBadge = (asset) => {
    if (asset.category !== 'EQUITY') return null;
    if (asset.asset_type === 'MUTUAL_FUND') return 'MF';
    return asset.exchange || 'NSE';
  };

  // Filter options - only show categories with assets
  const filterOptions = [
    { value: 'ALL', label: 'All' },
    { value: 'EQUITY_STOCKS', label: 'Stocks' },
    { value: 'EQUITY_MF', label: 'Mutual Funds' },
    { value: 'FIXED_INCOME', label: 'Fixed Income' },
    { value: 'REAL_ESTATE', label: 'Real Estate' },
    { value: 'PHYSICAL', label: 'Gold & Physical' },
    { value: 'SAVINGS', label: 'Savings' },
    { value: 'CRYPTO', label: 'Crypto' },
    { value: 'INSURANCE', label: 'Insurance' },
    { value: 'OTHER', label: 'Other' },
  ];

  // Sort options
  const sortOptions = [
    { value: 'value', label: 'Value (High to Low)' },
    { value: 'returns', label: 'Returns (%)' },
    { value: 'name', label: 'Name (A-Z)' },
    { value: 'dayChange', label: "Today's Change" },
  ];

  // Filtering and grouping
  const filteredAssets = assets.filter((asset) => {
    // Search filter
    const matchesSearch = !searchTerm ||
      asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.symbol?.toLowerCase().includes(searchTerm.toLowerCase());

    // Category filter
    let matchesCategory = selectedFilter === 'ALL';
    if (!matchesCategory) {
      if (selectedFilter === 'EQUITY_STOCKS') {
        matchesCategory = asset.category === 'EQUITY' && asset.asset_type !== 'MUTUAL_FUND';
      } else if (selectedFilter === 'EQUITY_MF') {
        matchesCategory = asset.category === 'EQUITY' && asset.asset_type === 'MUTUAL_FUND';
      } else {
        matchesCategory = asset.category === selectedFilter;
      }
    }

    return matchesSearch && matchesCategory;
  });

  const groupedAssets = filteredAssets.reduce((groups, asset) => {
    let groupKey = asset.category;
    if (asset.category === 'EQUITY') {
      groupKey = asset.asset_type === 'MUTUAL_FUND' ? 'EQUITY_MF' : 'EQUITY_STOCKS';
    }
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(asset);
    return groups;
  }, {});

  // Sort assets based on selected sort option
  Object.keys(groupedAssets).forEach(key => {
    groupedAssets[key].sort((a, b) => {
      switch (sortBy) {
        case 'returns':
          return getGainPercent(b) - getGainPercent(a);
        case 'name':
          return a.name.localeCompare(b.name);
        case 'dayChange':
          return getDayChange(b).percent - getDayChange(a).percent;
        case 'value':
        default:
          return getAssetValue(b) - getAssetValue(a);
      }
    });
  });

  const visualGroupConfig = {
    EQUITY_STOCKS: { label: 'Stocks', color: 'var(--system-blue)' },
    EQUITY_MF: { label: 'Mutual Funds', color: 'var(--system-purple)' },
    FIXED_INCOME: { label: 'Fixed Income', color: 'var(--system-green)' },
    REAL_ESTATE: { label: 'Real Estate', color: 'var(--system-orange)' },
    PHYSICAL: { label: 'Physical Assets', color: 'var(--system-yellow)' },
    SAVINGS: { label: 'Savings', color: 'var(--system-teal)' },
    CRYPTO: { label: 'Crypto', color: 'var(--system-pink)' },
    INSURANCE: { label: 'Insurance', color: 'var(--system-indigo)' },
    OTHER: { label: 'Other', color: 'var(--system-gray)' },
  };

  // SVG icons for each category - matching Dashboard
  const getCategoryIcon = (category) => {
    switch (category) {
      case 'EQUITY_STOCKS':
        // Trending up arrow
        return <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />;
      case 'EQUITY_MF':
        // Pie chart for diversified funds
        return <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
        </>;
      case 'FIXED_INCOME':
        // Bank building
        return <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />;
      case 'REAL_ESTATE':
        // Home/Building
        return <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5l-1.5-.5M6.75 7.364V3h-3v18m3-13.636l10.5-3.819" />;
      case 'PHYSICAL':
        // Gold/Gem sparkles
        return <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />;
      case 'SAVINGS':
        // Wallet
        return <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />;
      case 'CRYPTO':
        // Stacked coins
        return <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />;
      case 'INSURANCE':
        // Shield with checkmark
        return <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />;
      default:
        // Briefcase for OTHER
        return <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />;
    }
  };

  const totalCurrentValue = filteredAssets.reduce((sum, asset) => sum + getAssetValue(asset), 0);
  const totalInvestedValue = filteredAssets.reduce((sum, asset) => sum + getInvestedValue(asset), 0);
  const totalGainLoss = totalCurrentValue - totalInvestedValue;
  const totalGainPercent = totalInvestedValue > 0 ? (totalGainLoss / totalInvestedValue) * 100 : 0;

  // Calculate total day's change
  const totalDayChange = filteredAssets.reduce((sum, asset) => sum + getDayChange(asset).amount, 0);
  const totalDayChangePercent = totalCurrentValue > 0 ? (totalDayChange / (totalCurrentValue - totalDayChange)) * 100 : 0;

  // Find top gainer and loser (by day's change percent)
  const equityAssets = filteredAssets.filter(a => a.category === 'EQUITY');
  const sortedByDayChange = [...equityAssets].sort((a, b) => getDayChange(b).percent - getDayChange(a).percent);
  const topGainer = sortedByDayChange.length > 0 ? sortedByDayChange[0] : null;
  const topLoser = sortedByDayChange.length > 0 ? sortedByDayChange[sortedByDayChange.length - 1] : null;

  // Portfolio weight helper
  const getPortfolioWeight = (asset) => {
    const value = getAssetValue(asset);
    return totalCurrentValue > 0 ? (value / totalCurrentValue) * 100 : 0;
  };

  // Category allocation for pie chart in filter panel
  const categoryAllocation = Object.entries(
    filteredAssets.reduce((acc, asset) => {
      let groupKey = asset.category;
      if (asset.category === 'EQUITY') {
        groupKey = asset.asset_type === 'MUTUAL_FUND' ? 'EQUITY_MF' : 'EQUITY_STOCKS';
      }
      acc[groupKey] = (acc[groupKey] || 0) + getAssetValue(asset);
      return acc;
    }, {})
  ).map(([key, value]) => ({
    key,
    label: visualGroupConfig[key]?.label || key,
    color: visualGroupConfig[key]?.color || 'var(--system-gray)',
    value,
    percent: totalCurrentValue > 0 ? (value / totalCurrentValue) * 100 : 0,
  })).sort((a, b) => b.value - a.value);

  // Expand/collapse helpers
  const isCategoryExpanded = (category) => expandedCategories[category] !== false;
  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({ ...prev, [category]: !isCategoryExpanded(category) }));
  };

  const isAssetExpanded = (assetId) => expandedAssets[assetId] === true;
  const toggleAsset = (assetId, e) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedAssets(prev => ({ ...prev, [assetId]: !isAssetExpanded(assetId) }));
  };

  const openAddTransaction = (asset, e) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedAssetForTxn(asset);
    setShowAddTransaction(true);
  };

  const handleTransactionSuccess = () => {
    setShowAddTransaction(false);
    setSelectedAssetForTxn(null);
    fetchAssets(); // Refresh data
  };

  // Format quantity based on asset type
  const formatQty = (asset) => {
    if (!asset.quantity) return '-';
    return asset.asset_type === 'MUTUAL_FUND'
      ? asset.quantity.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
      : asset.quantity.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  };

  if (loading) {
    return (
      <div className="p-5 md:p-6">
        <AssetsSkeleton />
      </div>
    );
  }

  // Get category counts for filter panel
  const getCategoryCount = (filterValue) => {
    if (filterValue === 'ALL') return assets.length;
    return assets.filter(asset => {
      if (filterValue === 'EQUITY_STOCKS') {
        return asset.category === 'EQUITY' && asset.asset_type !== 'MUTUAL_FUND';
      } else if (filterValue === 'EQUITY_MF') {
        return asset.category === 'EQUITY' && asset.asset_type === 'MUTUAL_FUND';
      }
      return asset.category === filterValue;
    }).length;
  };

  return (
    <div className="p-4 md:p-6 h-full overflow-auto">
      {/* Split Mini Cards - Portfolio Summary (4 cards, 2 lines each) */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.gentle}
        className="mb-4 grid grid-cols-2 lg:grid-cols-4 gap-3"
      >
        {/* Card 1: Portfolio Value */}
        <Card padding="px-4 py-3">
          <p className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide font-medium">Portfolio Value</p>
          <p className="text-[22px] font-bold text-[var(--label-primary)] tracking-tight tabular-nums mt-1">
            {formatCurrency(totalCurrentValue)}
            <span className="text-[12px] font-medium text-[var(--label-tertiary)] ml-2">{filteredAssets.length} assets</span>
          </p>
        </Card>

        {/* Card 2: Invested */}
        <Card padding="px-4 py-3">
          <p className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide font-medium">Invested</p>
          <p className="text-[22px] font-bold text-[var(--label-primary)] tracking-tight tabular-nums mt-1">
            {formatCurrency(totalInvestedValue)}
          </p>
        </Card>

        {/* Card 3: Total Returns */}
        <Card padding="px-4 py-3">
          <p className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide font-medium">Total Returns</p>
          <p className="mt-1">
            <span className={`text-[22px] font-bold tabular-nums ${totalGainLoss >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
              {totalGainLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(totalGainLoss))}
            </span>
            <span className={`text-[13px] font-semibold ml-2 ${totalGainPercent >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
              {totalGainPercent >= 0 ? '+' : ''}{totalGainPercent.toFixed(1)}%
            </span>
          </p>
        </Card>

        {/* Card 4: Today's Change */}
        <Card padding="px-4 py-3" className={totalDayChange !== 0 ? (totalDayChange >= 0 ? 'bg-[#059669]/5' : 'bg-[#DC2626]/5') : ''}>
          <p className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide font-medium">Today</p>
          {totalDayChange !== 0 ? (
            <p className="mt-1">
              <span className={`text-[22px] font-bold tabular-nums ${totalDayChange >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                {totalDayChange >= 0 ? '+' : '-'}{formatCurrency(Math.abs(totalDayChange))}
              </span>
              <span className={`text-[13px] font-semibold ml-2 ${totalDayChangePercent >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                {totalDayChangePercent >= 0 ? '+' : ''}{totalDayChangePercent.toFixed(2)}%
              </span>
            </p>
          ) : (
            <p className="text-[22px] font-bold text-[var(--label-quaternary)] tabular-nums mt-1">—</p>
          )}
        </Card>
      </motion.div>

      {/* Filter Tabs + Search + Sort Bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="mb-4"
      >
        <Card padding="p-0">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 p-3.5">
            {/* Horizontal Filter Tabs */}
            <div className="flex-1 overflow-x-auto">
              <div className="flex gap-1.5">
                {filterOptions.map((option) => {
                  const count = getCategoryCount(option.value);
                  if (count === 0 && option.value !== 'ALL') return null;
                  const isSelected = selectedFilter === option.value;

                  return (
                    <button
                      key={option.value}
                      onClick={() => setSelectedFilter(option.value)}
                      className={`px-4 py-2 rounded-lg text-[14px] font-semibold whitespace-nowrap transition-colors ${
                        isSelected
                          ? 'bg-[var(--label-primary)] text-white'
                          : 'text-[var(--label-primary)] hover:bg-[var(--fill-tertiary)]'
                      }`}
                    >
                      {option.label}
                      {option.value !== 'ALL' && (
                        <span className={`ml-1.5 text-[12px] ${isSelected ? 'text-white/80' : 'text-[var(--label-tertiary)]'}`}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Search + Sort */}
            <div className="flex items-center gap-2.5">
              {/* Search */}
              <div className="relative">
                <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search..."
                  className="w-[180px] pl-10 pr-3 py-2.5 bg-[var(--bg-tertiary)] border-none rounded-lg text-[14px] text-[var(--label-primary)] placeholder:text-[var(--label-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--chart-primary)]/30"
                />
              </div>

              {/* Sort */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-2.5 bg-[var(--bg-tertiary)] border-none rounded-lg text-[14px] font-medium text-[var(--label-primary)] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--chart-primary)]/30"
              >
                {sortOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Main Content Area - Responsive Hybrid Layout */}
      <div className="flex gap-4">
        {/* Left Side - Asset Categories (Full width on < xl, 75% on xl+) */}
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="flex-1 xl:flex-[3] space-y-3 min-w-0"
        >
        {Object.entries(groupedAssets).map(([category, categoryAssets], categoryIndex) => {
          const config = visualGroupConfig[category] || categoryColors[category] || {};
          const groupColor = config.color || 'var(--system-gray)';
          const groupLabel = config.label || ASSET_CONFIG[category]?.label || category;
          const categoryTotal = categoryAssets.reduce((sum, a) => sum + getAssetValue(a), 0);
          const categoryInvested = categoryAssets.reduce((sum, a) => sum + getInvestedValue(a), 0);
          const categoryGain = categoryTotal - categoryInvested;
          const categoryGainPercent = categoryInvested > 0 ? (categoryGain / categoryInvested) * 100 : 0;
          const categoryDayChange = categoryAssets.reduce((sum, a) => sum + getDayChange(a).amount, 0);
          const categoryWeight = totalCurrentValue > 0 ? (categoryTotal / totalCurrentValue) * 100 : 0;
          const isExpanded = isCategoryExpanded(category);

          return (
            <motion.div
              key={category}
              variants={staggerItem}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.gentle, delay: categoryIndex * 0.03 }}
            >
              <Card padding="p-0" className="overflow-hidden">
                {/* Category Header - Compact with Inline Allocation */}
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center gap-4 px-4 py-3.5 bg-[var(--bg-primary)] hover:bg-[var(--fill-tertiary)]/60 transition-colors"
                >
                  {/* Expand Icon */}
                  <motion.div
                    animate={{ rotate: isExpanded ? 90 : 0 }}
                    transition={spring.snappy}
                    className="text-[var(--label-secondary)]"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </motion.div>

                  {/* Category Icon + Name */}
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: groupColor }}
                    >
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        {getCategoryIcon(category)}
                      </svg>
                    </div>
                    <div className="text-left">
                      <p className="text-[15px] font-semibold text-[var(--label-primary)]">{groupLabel}</p>
                      <p className="text-[13px] text-[var(--label-secondary)]">{categoryAssets.length} {categoryAssets.length === 1 ? 'asset' : 'assets'}</p>
                    </div>
                  </div>

                  {/* Allocation Bar - Inline (narrower) */}
                  <div className="hidden md:flex items-center gap-3 mx-4 flex-1 max-w-md">
                    <div className="flex-1 h-2 bg-[var(--fill-tertiary)] rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${categoryWeight}%` }}
                        transition={spring.gentle}
                        className="h-full rounded-full"
                        style={{ backgroundColor: groupColor }}
                      />
                    </div>
                    <span className="text-[12px] font-semibold text-[var(--label-primary)] w-12 text-right tabular-nums">
                      {categoryWeight.toFixed(1)}%
                    </span>
                  </div>

                  {/* Value + Returns + Day Change - All in one line */}
                  <div className="flex items-center gap-3 ml-auto">
                    <p className="text-[16px] font-bold text-[var(--label-primary)] tabular-nums">{formatCompact(categoryTotal)}</p>
                    <span className={`text-[14px] font-semibold tabular-nums ${categoryGain >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                      {categoryGain >= 0 ? '+' : ''}{categoryGainPercent.toFixed(1)}%
                    </span>
                    {categoryDayChange !== 0 && (category === 'EQUITY_STOCKS' || category === 'EQUITY_MF') && (
                      <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium tabular-nums ${
                        categoryDayChange >= 0
                          ? 'bg-[#059669]/15 text-[#059669]'
                          : 'bg-[#DC2626]/15 text-[#DC2626]'
                      }`}>
                        {categoryDayChange >= 0 ? '↑' : '↓'}{Math.abs(categoryDayChange / categoryTotal * 100).toFixed(2)}%
                      </span>
                    )}
                  </div>
                </button>

                {/* Asset List - Table Style */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={spring.gentle}
                      className="overflow-hidden"
                    >
                      {/* Table Header */}
                      <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2.5 bg-[var(--bg-tertiary)] border-y border-[var(--separator-opaque)] text-[12px] font-semibold text-[var(--label-secondary)] uppercase tracking-wide">
                        <div className="col-span-4">Asset</div>
                        <div className="col-span-2 text-right">Qty / Avg</div>
                        <div className="col-span-2 text-right">Current</div>
                        <div className="col-span-2 text-right">P&L</div>
                        <div className="col-span-1 text-right">Today</div>
                        <div className="col-span-1 text-right"></div>
                      </div>

                      {/* Asset Rows */}
                      <div className="divide-y divide-[var(--separator-opaque)]">
                        {categoryAssets.map((asset) => {
                          const currentValue = getAssetValue(asset);
                          const investedValue = getInvestedValue(asset);
                          const gainLoss = getGainLoss(asset);
                          const gainPercent = getGainPercent(asset);
                          const currentPrice = getCurrentPrice(asset);
                          const isRowExpanded = isAssetExpanded(asset.id);
                          const isFixedIncome = asset.category === 'FIXED_INCOME';
                          const dayChange = getDayChange(asset);
                          const portfolioWeight = getPortfolioWeight(asset);
                          const holdingPeriod = getHoldingPeriod(asset.id);
                          const exchangeBadge = getExchangeBadge(asset);
                          const isHighlighted = highlightedAssetId === asset.id;

                          return (
                            <div
                              key={asset.id}
                              ref={el => assetRefs.current[asset.id] = el}
                              className={`transition-all duration-300 ${
                                isRowExpanded ? 'bg-[var(--fill-tertiary)]/30' : ''
                              } ${isHighlighted ? 'bg-[var(--chart-primary)]/10 ring-2 ring-[var(--chart-primary)] ring-inset animate-pulse' : ''}`}
                            >
                              {/* Main Row - Click to Expand */}
                              <div
                                onClick={(e) => toggleAsset(asset.id, e)}
                                className="grid grid-cols-12 gap-3 px-4 py-3.5 cursor-pointer hover:bg-[var(--fill-tertiary)]/60 transition-colors items-center"
                              >
                                {/* Asset Name + Symbol */}
                                <div className="col-span-12 md:col-span-4 flex items-center gap-2.5">
                                  <motion.div
                                    animate={{ rotate: isRowExpanded ? 90 : 0 }}
                                    transition={spring.snappy}
                                    className="text-[var(--label-tertiary)] hidden md:block"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                    </svg>
                                  </motion.div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <p className="text-[15px] font-semibold text-[var(--label-primary)] truncate">{asset.name}</p>
                                      {exchangeBadge && (
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                          exchangeBadge === 'MF'
                                            ? 'bg-[var(--system-purple)]/15 text-[var(--system-purple)]'
                                            : 'bg-[var(--chart-primary)]/15 text-[var(--chart-primary)]'
                                        }`}>
                                          {exchangeBadge}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[13px] text-[var(--label-secondary)] mt-0.5">
                                      {asset.symbol || asset.asset_type?.replace(/_/g, ' ')}
                                      {holdingPeriod && <span className="ml-1.5 text-[var(--label-tertiary)]">• {holdingPeriod}</span>}
                                    </p>
                                  </div>
                                </div>

                                {/* Qty + Avg Price */}
                                <div className="hidden md:block col-span-2 text-right">
                                  <p className="text-[14px] font-medium text-[var(--label-primary)] tabular-nums">
                                    {asset.quantity ? formatQty(asset) : '—'}
                                  </p>
                                  <p className="text-[13px] text-[var(--label-secondary)] tabular-nums mt-0.5">
                                    {isFixedIncome
                                      ? `@ ${asset.interest_rate}% p.a.`
                                      : asset.avg_buy_price
                                        ? `@ ₹${asset.avg_buy_price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                                        : ''
                                    }
                                  </p>
                                </div>

                                {/* Current Value + LTP */}
                                <div className="col-span-6 md:col-span-2 text-right">
                                  <p className="text-[15px] font-bold text-[var(--label-primary)] tabular-nums">{formatCompact(currentValue)}</p>
                                  <p className="text-[13px] text-[var(--label-secondary)] tabular-nums mt-0.5">
                                    {!isFixedIncome && currentPrice > 0 ? `LTP ₹${currentPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : `${portfolioWeight.toFixed(1)}% wt`}
                                  </p>
                                </div>

                                {/* P&L */}
                                <div className="col-span-3 md:col-span-2 text-right">
                                  <p className={`text-[15px] font-semibold tabular-nums ${gainLoss >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                                    {gainLoss >= 0 ? '+' : ''}{formatCompact(gainLoss)}
                                  </p>
                                  <p className={`text-[13px] font-medium tabular-nums mt-0.5 ${gainPercent >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                                    {gainPercent >= 0 ? '+' : ''}{gainPercent.toFixed(2)}%
                                  </p>
                                </div>

                                {/* Day's Change */}
                                <div className="col-span-3 md:col-span-1 text-right">
                                  {asset.category === 'EQUITY' && dayChange.percent !== 0 ? (
                                    <>
                                      <p className={`text-[14px] font-semibold tabular-nums ${dayChange.percent >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                                        {dayChange.percent >= 0 ? '+' : ''}{dayChange.percent.toFixed(2)}%
                                      </p>
                                      <p className={`text-[12px] tabular-nums mt-0.5 ${dayChange.amount >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                                        {dayChange.amount >= 0 ? '+' : ''}{formatCompact(dayChange.amount)}
                                      </p>
                                    </>
                                  ) : (
                                    <p className="text-[14px] text-[var(--label-tertiary)]">—</p>
                                  )}
                                </div>

                                {/* Actions - Primary + Kebab */}
                                <div className="hidden md:flex col-span-1 items-center justify-end gap-1">
                                  {/* Primary Action: Add Transaction */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openAddTransaction(asset, e);
                                    }}
                                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-[var(--chart-primary)]/10 text-[var(--chart-primary)] hover:bg-[var(--chart-primary)]/20 transition-colors"
                                    title="Add Transaction"
                                  >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                    </svg>
                                  </button>

                                  {/* Kebab Menu */}
                                  <div className="relative" ref={openMenuId === asset.id ? menuRef : null}>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenMenuId(openMenuId === asset.id ? null : asset.id);
                                      }}
                                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[var(--fill-tertiary)] transition-colors text-[var(--label-tertiary)]"
                                      title="More actions"
                                    >
                                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                        <circle cx="12" cy="6" r="1.5" />
                                        <circle cx="12" cy="12" r="1.5" />
                                        <circle cx="12" cy="18" r="1.5" />
                                      </svg>
                                    </button>

                                    {/* Dropdown Menu */}
                                    <AnimatePresence>
                                      {openMenuId === asset.id && (
                                        <motion.div
                                          initial={{ opacity: 0, scale: 0.95, y: -5 }}
                                          animate={{ opacity: 1, scale: 1, y: 0 }}
                                          exit={{ opacity: 0, scale: 0.95, y: -5 }}
                                          transition={{ duration: 0.15 }}
                                          className="absolute right-0 top-full mt-1 z-50 bg-[var(--bg-primary)] rounded-xl shadow-lg border border-[var(--separator-opaque)] py-1 min-w-[140px]"
                                        >
                                          {(asset.category === 'EQUITY' || asset.category === 'FIXED_INCOME') && (
                                            <Link
                                              to={`/assets/${asset.id}/transactions`}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setOpenMenuId(null);
                                              }}
                                              className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-[var(--label-primary)] hover:bg-[var(--fill-tertiary)] transition-colors"
                                            >
                                              <svg className="w-4 h-4 text-[var(--label-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                              </svg>
                                              History
                                            </Link>
                                          )}
                                          <Link
                                            to={`/assets/edit/${asset.id}`}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setOpenMenuId(null);
                                            }}
                                            className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-[var(--label-primary)] hover:bg-[var(--fill-tertiary)] transition-colors"
                                          >
                                            <svg className="w-4 h-4 text-[var(--label-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                                            </svg>
                                            Edit
                                          </Link>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setOpenMenuId(null);
                                              handleDelete(asset.id, asset.name, e);
                                            }}
                                            className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-[var(--system-red)] hover:bg-[var(--system-red)]/10 transition-colors"
                                          >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                            </svg>
                                            Delete
                                          </button>
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </div>
                                </div>
                              </div>

                              {/* Expanded Details */}
                              <AnimatePresence>
                                {isRowExpanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={spring.gentle}
                                    className="overflow-hidden"
                                  >
                                    <div className="px-4 pb-4 pt-1">
                                      <div className="bg-[var(--bg-secondary)] rounded-xl p-4">
                                        {/* Stats Grid */}
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                          <div>
                                            <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wide mb-0.5">Invested</p>
                                            <p className="text-[14px] font-medium text-[var(--label-primary)] tabular-nums">{formatCurrency(investedValue)}</p>
                                          </div>
                                          <div>
                                            <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wide mb-0.5">Current</p>
                                            <p className="text-[14px] font-medium text-[var(--label-primary)] tabular-nums">{formatCurrency(currentValue)}</p>
                                          </div>
                                          <div>
                                            <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wide mb-0.5">Returns</p>
                                            <p className={`text-[14px] font-medium tabular-nums ${gainLoss >= 0 ? 'text-[var(--chart-positive)]' : 'text-[var(--chart-negative)]'}`}>
                                              {gainLoss >= 0 ? '+' : ''}{formatCurrency(gainLoss)} ({gainPercent.toFixed(2)}%)
                                            </p>
                                          </div>
                                          <div>
                                            <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wide mb-0.5">Weight</p>
                                            <p className="text-[14px] font-medium text-[var(--label-primary)] tabular-nums">{portfolioWeight.toFixed(2)}%</p>
                                          </div>
                                        </div>

                                        {/* Extra Info */}
                                        {isFixedIncome && asset.maturity_date && (
                                          <div className="flex items-center gap-4 py-2 border-t border-[var(--separator)]/30 text-[12px]">
                                            <span className="text-[var(--label-tertiary)]">
                                              Matures: {new Date(asset.maturity_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </span>
                                          </div>
                                        )}

                                        {transactionDates[asset.id] && (
                                          <div className="flex items-center gap-4 py-2 border-t border-[var(--separator)]/30 text-[12px] text-[var(--label-tertiary)]">
                                            <span>{transactionDates[asset.id].count} transactions</span>
                                            <span>•</span>
                                            <span>Since {new Date(transactionDates[asset.id].firstDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>
                                          </div>
                                        )}

                                        {/* Action Buttons - Mobile Only */}
                                        <div className="flex gap-2 mt-3 pt-3 border-t border-[var(--separator)]/30 md:hidden">
                                          <button
                                            onClick={(e) => openAddTransaction(asset, e)}
                                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-[var(--chart-primary)] text-white rounded-lg text-[13px] font-medium hover:opacity-90 transition-opacity"
                                          >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                            </svg>
                                            Add Txn
                                          </button>
                                          {(asset.category === 'EQUITY' || asset.category === 'FIXED_INCOME') && (
                                            <Link
                                              to={`/assets/${asset.id}/transactions`}
                                              onClick={(e) => e.stopPropagation()}
                                              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-[var(--fill-tertiary)] text-[var(--label-primary)] rounded-lg text-[13px] font-medium"
                                            >
                                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                              </svg>
                                              History
                                            </Link>
                                          )}
                                          <Link
                                            to={`/assets/edit/${asset.id}`}
                                            onClick={(e) => e.stopPropagation()}
                                            className="flex items-center justify-center px-3 py-2 bg-[var(--fill-tertiary)] text-[var(--label-primary)] rounded-lg text-[13px] font-medium"
                                          >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                                            </svg>
                                          </Link>
                                          <button
                                            onClick={(e) => handleDelete(asset.id, asset.name, e)}
                                            className="flex items-center justify-center px-3 py-2 bg-[var(--system-red)]/10 text-[var(--system-red)] rounded-lg text-[13px] font-medium"
                                          >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                            </svg>
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          );
        })}

        {/* Empty State */}
        {Object.keys(groupedAssets).length === 0 && (
          <motion.div variants={staggerItem}>
            <Card padding="p-12" className="text-center">
              <div className="w-14 h-14 bg-[var(--fill-tertiary)] rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-[var(--label-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <h3 className="text-[16px] font-semibold text-[var(--label-primary)] mb-1">
                {searchTerm || selectedFilter !== 'ALL' ? 'No matching assets' : 'No assets yet'}
              </h3>
              <p className="text-[13px] text-[var(--label-secondary)] mb-4">
                {searchTerm ? 'Try a different search term' : selectedFilter !== 'ALL' ? 'No assets in this category' : 'Start by adding your first asset'}
              </p>
              {(searchTerm || selectedFilter !== 'ALL') ? (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedFilter('ALL');
                  }}
                  className="px-4 py-2 text-[13px] font-medium text-[var(--chart-primary)] hover:bg-[var(--chart-primary)]/10 rounded-lg transition-colors"
                >
                  Clear filters
                </button>
              ) : (
                <Link to="/assets/add">
                  <button className="px-4 py-2 bg-[var(--chart-primary)] text-white text-[13px] font-medium rounded-lg hover:opacity-90 transition-opacity">
                    Add Asset
                  </button>
                </Link>
              )}
            </Card>
          </motion.div>
        )}
      </motion.div>

        {/* Right Side - Stats Panel (Hidden on < xl, 25% on xl+) */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={spring.gentle}
          className="hidden xl:block xl:flex-1 space-y-4 shrink-0"
        >
          {/* Quick Stats Card */}
          <Card padding="p-0">
            <div className="px-4 py-3 border-b border-[var(--separator-opaque)]">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-[var(--chart-primary)]/10 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-[var(--chart-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                </div>
                <span className="text-[14px] font-semibold text-[var(--label-primary)]">Quick Stats</span>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[12px] text-[var(--label-tertiary)]">Total Assets</span>
                <span className="text-[14px] font-semibold text-[var(--label-primary)] tabular-nums">{filteredAssets.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[12px] text-[var(--label-tertiary)]">Today's Change</span>
                <span className={`text-[14px] font-semibold tabular-nums ${totalDayChange >= 0 ? 'text-[var(--chart-positive)]' : 'text-[var(--chart-negative)]'}`}>
                  {totalDayChange >= 0 ? '+' : ''}{formatCompact(totalDayChange)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[12px] text-[var(--label-tertiary)]">Invested</span>
                <span className="text-[14px] font-semibold text-[var(--label-primary)] tabular-nums">{formatCompact(totalInvestedValue)}</span>
              </div>

              {/* Top Gainer */}
              {topGainer && getDayChange(topGainer).percent > 0 && (
                <div className="pt-3 border-t border-[var(--separator-opaque)]">
                  <p className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide mb-1.5">Top Gainer</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-[var(--label-primary)] truncate">{topGainer.name}</span>
                    <span className="text-[12px] font-semibold text-[var(--chart-positive)] tabular-nums shrink-0">
                      +{getDayChange(topGainer).percent.toFixed(2)}%
                    </span>
                  </div>
                </div>
              )}

              {/* Top Loser */}
              {topLoser && getDayChange(topLoser).percent < 0 && (
                <div className={`${topGainer && getDayChange(topGainer).percent > 0 ? '' : 'pt-3 border-t border-[var(--separator-opaque)]'}`}>
                  <p className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide mb-1.5">Top Loser</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-[var(--label-primary)] truncate">{topLoser.name}</span>
                    <span className="text-[12px] font-semibold text-[var(--chart-negative)] tabular-nums shrink-0">
                      {getDayChange(topLoser).percent.toFixed(2)}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Allocation Card */}
          <Card padding="p-0">
            <div className="px-4 py-3 border-b border-[var(--separator-opaque)]">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-[var(--system-green)]/10 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-[var(--system-green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
                  </svg>
                </div>
                <span className="text-[14px] font-semibold text-[var(--label-primary)]">Allocation</span>
              </div>
            </div>
            <div className="p-4">
              {categoryAllocation.length > 0 ? (
                <>
                  {/* Horizontal Stacked Bar */}
                  <div className="mb-4">
                    <div className="h-2.5 rounded-full overflow-hidden flex bg-[var(--fill-tertiary)]">
                      {categoryAllocation.map((cat, index) => (
                        <motion.div
                          key={cat.key}
                          initial={{ width: 0 }}
                          animate={{ width: `${cat.percent}%` }}
                          transition={{ duration: 0.6, delay: index * 0.05, ease: [0.4, 0, 0.2, 1] }}
                          style={{ backgroundColor: cat.color }}
                          className="h-full"
                          title={`${cat.label}: ${cat.percent.toFixed(1)}%`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="space-y-2">
                    {categoryAllocation.map((cat) => (
                      <div key={cat.key} className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: cat.color }} />
                          <span className="text-[12px] text-[var(--label-secondary)] truncate">{cat.label}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] text-[var(--label-tertiary)] tabular-nums">{formatCompact(cat.value)}</span>
                          <span className="text-[12px] font-semibold text-[var(--label-primary)] w-11 text-right tabular-nums">
                            {cat.percent.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Total */}
                  <div className="mt-4 pt-3 border-t border-[var(--separator-opaque)]">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-medium text-[var(--label-tertiary)]">Total</span>
                      <span className="text-[14px] font-bold text-[var(--label-primary)] tabular-nums">{formatCompact(totalCurrentValue)}</span>
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
      </div>

      {/* Quick Add Transaction Bottom Sheet */}
      <BottomSheet
        isOpen={showAddTransaction}
        onClose={() => {
          setShowAddTransaction(false);
          setSelectedAssetForTxn(null);
        }}
        title="Add Transaction"
      >
        {selectedAssetForTxn && (
          <QuickAddTransaction
            asset={selectedAssetForTxn}
            onSuccess={handleTransactionSuccess}
            onCancel={() => {
              setShowAddTransaction(false);
              setSelectedAssetForTxn(null);
            }}
          />
        )}
      </BottomSheet>
    </div>
  );
}
