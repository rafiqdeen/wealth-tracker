import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { assetService, ASSET_CONFIG } from '../services/assets';
import { Card, SearchInput, AssetsSkeleton, Modal } from '../components/apple';
import QuickAddTransaction from '../components/QuickAddTransaction';
import { spring, staggerContainer, staggerItem } from '../utils/animations';
import { categoryColors } from '../constants/theme';
import { formatCurrency, formatCompact } from '../utils/formatting';
import { calculateFixedIncomeValue, getCompoundingFrequency, calculateXIRRFromTransactions, generateRecurringDepositSchedule } from '../utils/interest';
import { useToast } from '../context/ToastContext';
import { usePrices } from '../context/PriceContext';

export default function Assets() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const { prices, loading: pricesLoading, fetchPrices } = usePrices();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState({});
  const [expandedAssets, setExpandedAssets] = useState({});
  const [fixedIncomeCalcs, setFixedIncomeCalcs] = useState({});
  const [fixedIncomeLoading, setFixedIncomeLoading] = useState(false);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [selectedAssetForTxn, setSelectedAssetForTxn] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [highlightedAssetId, setHighlightedAssetId] = useState(null);
  const [selectedFilter, setSelectedFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('value'); // value, returns, name, recent
  const [transactionDates, setTransactionDates] = useState({}); // First purchase dates
  const [openMenuId, setOpenMenuId] = useState(null); // Track which kebab menu is open
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 }); // Position for portal dropdown
  const assetRefs = useRef({});
  const menuRef = useRef(null);
  const menuButtonRefs = useRef({}); // Track kebab button positions

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
      const fixedIncomeAssets = assetList.filter(a => a.category === 'FIXED_INCOME' && a.interest_rate);

      // Start all fetches in parallel for better performance
      const parallelFetches = [];

      if (equityAssets.length > 0) {
        // Use PriceContext's fetchPrices - must await to ensure prices are loaded
        // before calculating "Today's" change values
        parallelFetches.push(fetchPrices(equityAssets));
        parallelFetches.push(fetchTransactionDates(equityAssets));
      }

      if (fixedIncomeAssets.length > 0) {
        parallelFetches.push(fetchFixedIncomeCalculations(fixedIncomeAssets));
        parallelFetches.push(fetchTransactionDates(fixedIncomeAssets));
      }

      // Wait for all parallel fetches to complete before setting loading to false
      // This ensures prices are available for "Today's" change calculations
      if (parallelFetches.length > 0) {
        await Promise.all(parallelFetches);
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
            // Sort by date ascending and get the first one (field is transaction_date, not date)
            const sorted = [...transactions].sort((a, b) =>
              new Date(a.transaction_date || a.date) - new Date(b.transaction_date || b.date)
            );
            dates[asset.id] = {
              firstDate: sorted[0].transaction_date || sorted[0].date,
              lastDate: sorted[sorted.length - 1].transaction_date || sorted[sorted.length - 1].date,
              count: transactions.length,
              transactions: transactions // Store transactions for XIRR calculation
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
    const recurringDepositTypes = ['PPF', 'RD', 'EPF', 'VPF', 'SSY'];

    try {
      // Fetch all transactions in parallel for better performance
      const transactionResults = await Promise.all(
        fixedIncomeAssets.map(asset =>
          assetService.getTransactions(asset.id)
            .then(res => ({ asset, transactions: res.data.transactions || [] }))
            .catch(() => ({ asset, transactions: [] }))
        )
      );

      const calcs = {};
      for (const { asset, transactions } of transactionResults) {
        const compoundingFreq = getCompoundingFrequency(asset.asset_type);
        const isRecurring = recurringDepositTypes.includes(asset.asset_type);

        if (transactions.length > 0) {
          // Use PPF-specific calculation for PPF assets (FY-based with weighted monthly interest)
          if (asset.asset_type === 'PPF') {
            const ppfResult = generateRecurringDepositSchedule(transactions, asset.interest_rate, asset.start_date);
            if (ppfResult) {
              calcs[asset.id] = {
                principal: ppfResult.summary.totalDeposited,
                currentValue: ppfResult.summary.currentValue,  // Bank balance (credited interest only)
                estimatedValue: ppfResult.summary.estimatedValue,  // With accrued interest
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
          // For recurring deposits without transactions, can't accurately calculate interest
          if (isRecurring) {
            calcs[asset.id] = {
              principal: asset.principal,
              currentValue: asset.principal,
              interest: 0,
              interestPercent: 0,
              needsTransactions: true
            };
          } else {
            // For lump-sum deposits, use asset's principal and start_date
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
      }
      setFixedIncomeCalcs(calcs);
    } catch (error) {
      // Silent fail - calculations will show 0
    } finally {
      setFixedIncomeLoading(false);
    }
  };

  const handleDelete = (asset, e) => {
    e.preventDefault();
    e.stopPropagation();
    setAssetToDelete(asset);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!assetToDelete) return;
    setIsDeleting(true);
    try {
      await assetService.delete(assetToDelete.id);
      setAssets(assets.filter((a) => a.id !== assetToDelete.id));
      toast.success(`"${assetToDelete.name}" deleted successfully`);
      setShowDeleteConfirm(false);
      setAssetToDelete(null);
    } catch (error) {
      toast.error('Failed to delete asset');
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setAssetToDelete(null);
  };

  // Asset value calculations - returns null for equity if price unavailable
  const getAssetValue = (asset) => {
    if (asset.category === 'EQUITY' && asset.quantity && asset.symbol) {
      const priceKey = asset.asset_type === 'MUTUAL_FUND' ? asset.symbol : `${asset.symbol}.${asset.exchange === 'BSE' ? 'BO' : 'NS'}`;
      const priceData = prices[priceKey];
      // Return value only if price is available, otherwise null (never use buyPrice)
      if (priceData && !priceData.unavailable && typeof priceData.price === 'number' && priceData.price > 0) {
        return asset.quantity * priceData.price;
      }
      return null; // Price unavailable - don't use buyPrice
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

  // Returns null if price unavailable
  const getGainLoss = (asset) => {
    const value = getAssetValue(asset);
    if (value === null) return null;
    return value - getInvestedValue(asset);
  };

  // Returns null if price unavailable
  const getGainPercent = (asset) => {
    const value = getAssetValue(asset);
    if (value === null) return null;
    const invested = getInvestedValue(asset);
    return invested > 0 ? ((value - invested) / invested) * 100 : 0;
  };

  // Get current price - returns null if unavailable (never falls back to buyPrice)
  const getCurrentPrice = (asset) => {
    if (asset.category === 'EQUITY' && asset.symbol) {
      const priceKey = asset.asset_type === 'MUTUAL_FUND' ? asset.symbol : `${asset.symbol}.${asset.exchange === 'BSE' ? 'BO' : 'NS'}`;
      const priceData = prices[priceKey];
      // Return price only if valid, otherwise null (never buyPrice)
      if (priceData && !priceData.unavailable && typeof priceData.price === 'number' && priceData.price > 0) {
        return priceData.price;
      }
      return null; // Price unavailable
    }
    // Non-equity assets use their stored current_value
    return asset.current_value || asset.avg_buy_price || null;
  };

  // Check if price is available for an asset
  const isPriceAvailable = (asset) => {
    if (asset.category === 'EQUITY' && asset.symbol) {
      const priceKey = asset.asset_type === 'MUTUAL_FUND' ? asset.symbol : `${asset.symbol}.${asset.exchange === 'BSE' ? 'BO' : 'NS'}`;
      const priceData = prices[priceKey];
      return priceData && !priceData.unavailable && typeof priceData.price === 'number' && priceData.price > 0;
    }
    return true; // Non-equity assets always have value
  };

  // Day's change for equity assets
  const getDayChange = (asset) => {
    if (asset.category === 'EQUITY' && asset.symbol) {
      const priceKey = asset.asset_type === 'MUTUAL_FUND' ? asset.symbol : `${asset.symbol}.${asset.exchange === 'BSE' ? 'BO' : 'NS'}`;
      const priceData = prices[priceKey];
      // Simple: if we have valid price data, show the change
      if (priceData && typeof priceData.price === 'number' && priceData.price > 0 && asset.quantity) {
        const currentValue = asset.quantity * priceData.price;
        const changePercent = typeof priceData.changePercent === 'number' ? priceData.changePercent : 0;
        // Day change = currentValue × changePercent / 100
        const dayChangeAmount = currentValue * changePercent / 100;
        return {
          amount: dayChangeAmount,
          percent: changePercent,
          hasData: true  // We have price data, so show the change
        };
      }
    }
    return { amount: 0, percent: 0, hasData: false };
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

  // Calculate totals - exclude assets with unavailable prices
  const assetsWithPrice = filteredAssets.filter(asset => isPriceAvailable(asset));
  const assetsWithoutPrice = filteredAssets.filter(asset => asset.category === 'EQUITY' && asset.symbol && !isPriceAvailable(asset));
  const unavailableCount = assetsWithoutPrice.length;

  const totalCurrentValue = assetsWithPrice.reduce((sum, asset) => {
    const value = getAssetValue(asset);
    return sum + (value || 0);
  }, 0);
  const totalInvestedValue = assetsWithPrice.reduce((sum, asset) => sum + getInvestedValue(asset), 0);
  const totalGainLoss = totalCurrentValue - totalInvestedValue;
  const totalGainPercent = totalInvestedValue > 0 ? (totalGainLoss / totalInvestedValue) * 100 : 0;

  // Calculate total day's change (only for assets with price)
  const totalDayChange = assetsWithPrice.reduce((sum, asset) => sum + getDayChange(asset).amount, 0);
  const totalDayChangePercent = totalCurrentValue > 0 ? (totalDayChange / (totalCurrentValue - totalDayChange)) * 100 : 0;

  // Find top gainer and loser (by day's change percent)
  const equityAssets = filteredAssets.filter(a => a.category === 'EQUITY');
  const hasEquityAssets = equityAssets.length > 0;
  const sortedByDayChange = [...equityAssets].sort((a, b) => getDayChange(b).percent - getDayChange(a).percent);
  const topGainer = sortedByDayChange.length > 0 ? sortedByDayChange[0] : null;
  const topLoser = sortedByDayChange.length > 0 ? sortedByDayChange[sortedByDayChange.length - 1] : null;

  // Portfolio weight helper
  const getPortfolioWeight = (asset) => {
    const value = getAssetValue(asset);
    return totalCurrentValue > 0 ? (value / totalCurrentValue) * 100 : 0;
  };

  // Category allocation for filter panel
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
    <div className="p-4 md:px-12 md:py-6 h-full overflow-auto">
      {/* Page Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.gentle}
          className="mb-5"
        >
          <h1 className="text-[22px] font-bold text-[var(--label-primary)] mb-1">Assets</h1>
          <p className="text-[14px] text-[var(--label-secondary)]">
            Manage and track your investment portfolio
          </p>
        </motion.div>

      {/* Portfolio Summary Cards */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring.gentle, delay: 0.03 }}
        className="mb-4 grid grid-cols-2 lg:grid-cols-4 gap-3"
      >
        {/* Card 1: Portfolio Value */}
        <Card padding="p-0" className="overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-[var(--chart-primary)]/8 via-[var(--chart-primary)]/4 to-transparent">
            <p className="text-[11px] text-[var(--label-secondary)] uppercase tracking-wide font-medium">Portfolio Value</p>
            <p className="text-[22px] font-bold text-[var(--label-primary)] tracking-tight tabular-nums mt-1">
              {formatCurrency(totalCurrentValue)}
            </p>
            <p className="text-[12px] font-medium text-[var(--label-tertiary)] mt-0.5">
              {filteredAssets.length} assets
              {unavailableCount > 0 && (
                <span className="text-[#F59E0B] ml-1">({unavailableCount} excluded)</span>
              )}
            </p>
          </div>
        </Card>

        {/* Card 2: Invested */}
        <Card padding="p-0" className="overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-[var(--system-gray)]/8 via-[var(--system-gray)]/4 to-transparent">
            <p className="text-[11px] text-[var(--label-secondary)] uppercase tracking-wide font-medium">Invested</p>
            <p className="text-[22px] font-bold text-[var(--label-primary)] tracking-tight tabular-nums mt-1">
              {formatCurrency(totalInvestedValue)}
            </p>
            <p className="text-[12px] font-medium text-[var(--label-tertiary)] mt-0.5">Cost basis</p>
          </div>
        </Card>

        {/* Card 3: Total Returns */}
        <Card padding="p-0" className="overflow-hidden">
          <div className={`px-4 py-3 bg-gradient-to-r ${hasEquityAssets && pricesLoading ? 'from-[var(--system-gray)]/8 via-[var(--system-gray)]/4' : totalGainLoss >= 0 ? 'from-[#059669]/10 via-[#059669]/5' : 'from-[#DC2626]/10 via-[#DC2626]/5'} to-transparent`}>
            <p className="text-[11px] text-[var(--label-secondary)] uppercase tracking-wide font-medium">Total Returns</p>
            {hasEquityAssets && pricesLoading ? (
              <>
                <div className="flex items-center gap-2 mt-2">
                  <svg className="w-5 h-5 animate-spin text-[var(--label-tertiary)]" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="text-[14px] text-[var(--label-tertiary)]">Fetching prices...</span>
                </div>
                <p className="text-[12px] text-[var(--label-quaternary)] mt-1">Equity P&L loading</p>
              </>
            ) : (
              <>
                <p className={`text-[22px] font-bold tabular-nums mt-1 ${totalGainLoss >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                  {totalGainLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(totalGainLoss))}
                </p>
                <p className={`text-[12px] font-semibold mt-0.5 ${totalGainPercent >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                  {totalGainPercent >= 0 ? '+' : ''}{totalGainPercent.toFixed(2)}% all time
                </p>
              </>
            )}
          </div>
        </Card>

        {/* Card 4: Today's Change */}
        <Card padding="p-0" className="overflow-hidden">
          <div className={`px-4 py-3 bg-gradient-to-r ${hasEquityAssets && pricesLoading ? 'from-[var(--system-gray)]/8 via-[var(--system-gray)]/4' : totalDayChange !== 0 ? (totalDayChange >= 0 ? 'from-[#059669]/10 via-[#059669]/5' : 'from-[#DC2626]/10 via-[#DC2626]/5') : 'from-[var(--system-gray)]/8 via-[var(--system-gray)]/4'} to-transparent`}>
            <p className="text-[11px] text-[var(--label-secondary)] uppercase tracking-wide font-medium">Today</p>
            {hasEquityAssets && pricesLoading ? (
              <>
                <div className="flex items-center gap-2 mt-2">
                  <svg className="w-5 h-5 animate-spin text-[var(--label-tertiary)]" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="text-[14px] text-[var(--label-tertiary)]">Fetching...</span>
                </div>
                <p className="text-[12px] text-[var(--label-quaternary)] mt-1">Day change loading</p>
              </>
            ) : totalDayChange !== 0 ? (
              <>
                <p className={`text-[22px] font-bold tabular-nums mt-1 ${totalDayChange >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                  {totalDayChange >= 0 ? '+' : '-'}{formatCurrency(Math.abs(totalDayChange))}
                </p>
                <p className={`text-[12px] font-semibold mt-0.5 ${totalDayChangePercent >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                  {totalDayChangePercent >= 0 ? '+' : ''}{totalDayChangePercent.toFixed(2)}% today
                </p>
              </>
            ) : (
              <>
                <p className="text-[22px] font-bold text-[var(--label-quaternary)] tabular-nums mt-1">—</p>
                <p className="text-[12px] font-medium text-[var(--label-tertiary)] mt-0.5">Market closed</p>
              </>
            )}
          </div>
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

      {/* Main Content Area */}
      <div>
        {/* Asset Categories */}
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="space-y-3"
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
                {/* Category Header - Gradient Background */}
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center gap-4 px-4 py-3.5 transition-all hover:brightness-[0.98]"
                  style={{
                    background: `linear-gradient(to right, color-mix(in srgb, ${groupColor} 12%, transparent), color-mix(in srgb, ${groupColor} 6%, transparent), transparent)`
                  }}
                >
                  {/* Expand Icon - More Prominent */}
                  <motion.div
                    animate={{ rotate: isExpanded ? 90 : 0 }}
                    transition={spring.snappy}
                    className="w-6 h-6 rounded-md bg-[var(--bg-primary)]/60 flex items-center justify-center"
                    style={{ color: groupColor }}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </motion.div>

                  {/* Category Icon + Name */}
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm"
                      style={{ backgroundColor: groupColor }}
                    >
                      <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        {getCategoryIcon(category)}
                      </svg>
                    </div>
                    <div className="text-left">
                      <p className="text-[15px] font-semibold text-[var(--label-primary)]">{groupLabel}</p>
                      <p className="text-[12px] text-[var(--label-secondary)]">{categoryAssets.length} {categoryAssets.length === 1 ? 'asset' : 'assets'}</p>
                    </div>
                  </div>

                  {/* Allocation Bar - Inline (narrower) */}
                  <div className="hidden md:flex items-center gap-3 mx-4 flex-1 max-w-md">
                    <div className="flex-1 h-1.5 bg-[var(--bg-primary)]/50 rounded-full overflow-hidden">
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
                    <p className="text-[17px] font-bold text-[var(--label-primary)] tabular-nums">{formatCompact(categoryTotal)}</p>
                    {(category === 'EQUITY_STOCKS' || category === 'EQUITY_MF') && pricesLoading ? (
                      <div className="flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 animate-spin text-[var(--label-tertiary)]" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      </div>
                    ) : (
                      <span className={`text-[14px] font-semibold tabular-nums ${categoryGain >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                        {categoryGain >= 0 ? '+' : ''}{categoryGainPercent.toFixed(1)}%
                      </span>
                    )}
                    {categoryDayChange !== 0 && (category === 'EQUITY_STOCKS' || category === 'EQUITY_MF') && (
                      <span className={`text-[13px] px-2.5 py-1 rounded-lg font-semibold tabular-nums ${
                        categoryDayChange >= 0
                          ? 'bg-[#059669]/12 text-[#059669]'
                          : 'bg-[#DC2626]/12 text-[#DC2626]'
                      }`}>
                        {categoryDayChange >= 0 ? '↑' : '↓'}{formatCompact(Math.abs(categoryDayChange))} ({Math.abs(categoryDayChange / categoryTotal * 100).toFixed(2)}%)
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
                      style={{ overflow: 'visible' }}
                    >
                      {/* Table Header */}
                      <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2 bg-[var(--fill-tertiary)]/40 border-y border-[var(--separator-opaque)] text-[10px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                        <div className="col-span-4">Asset</div>
                        <div className="col-span-2 text-right">Invested</div>
                        <div className="col-span-2 text-right">Current</div>
                        <div className="col-span-2 text-right">P&L</div>
                        <div className="col-span-2 text-right">Today</div>
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
                                className="group grid grid-cols-12 gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--fill-tertiary)]/50 transition-all items-center border-l-2 border-transparent hover:border-l-2"
                                style={{ '--hover-border-color': groupColor }}
                                onMouseEnter={(e) => e.currentTarget.style.borderLeftColor = groupColor}
                                onMouseLeave={(e) => e.currentTarget.style.borderLeftColor = 'transparent'}
                              >
                                {/* Asset Name + Symbol */}
                                <div className="col-span-12 md:col-span-4 flex items-center gap-2.5">
                                  <motion.div
                                    animate={{ rotate: isRowExpanded ? 90 : 0 }}
                                    transition={spring.snappy}
                                    className="hidden md:flex w-5 h-5 rounded items-center justify-center text-[var(--label-tertiary)] group-hover:text-[var(--label-secondary)] group-hover:bg-[var(--fill-tertiary)] transition-all"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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

                                {/* Invested Value */}
                                <div className="hidden md:block col-span-2 text-right">
                                  <p className="text-[15px] font-semibold text-[var(--label-primary)] tabular-nums">
                                    {formatCompact(investedValue)}
                                  </p>
                                  <p className="text-[13px] text-[var(--label-secondary)] tabular-nums mt-0.5">
                                    {isFixedIncome
                                      ? `@ ${asset.interest_rate}% p.a.`
                                      : asset.quantity
                                        ? `${formatQty(asset)} units`
                                        : ''
                                    }
                                  </p>
                                </div>

                                {/* Current Value + LTP */}
                                <div className="col-span-6 md:col-span-2 text-right">
                                  {currentValue === null ? (
                                    <>
                                      <p className="text-[14px] font-medium text-[#F59E0B]">Price Unavailable</p>
                                      <p className="text-[12px] text-[var(--label-tertiary)] mt-0.5">Excluded from totals</p>
                                    </>
                                  ) : (
                                    <>
                                      <p className="text-[15px] font-bold text-[var(--label-primary)] tabular-nums">{formatCompact(currentValue)}</p>
                                      <p className="text-[13px] text-[var(--label-secondary)] tabular-nums mt-0.5">
                                        {!isFixedIncome && currentPrice ? `LTP ₹${currentPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : `${portfolioWeight.toFixed(1)}% wt`}
                                      </p>
                                    </>
                                  )}
                                </div>

                                {/* P&L */}
                                <div className="col-span-3 md:col-span-2 text-right">
                                  {currentValue === null ? (
                                    <p className="text-[14px] text-[var(--label-tertiary)]">—</p>
                                  ) : asset.category === 'EQUITY' && pricesLoading ? (
                                    <div className="flex items-center justify-end gap-2">
                                      <svg className="w-4 h-4 animate-spin text-[var(--label-tertiary)]" viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                      </svg>
                                      <span className="text-[12px] text-[var(--label-tertiary)]">Loading</span>
                                    </div>
                                  ) : (
                                    <>
                                      <p className={`text-[15px] font-semibold tabular-nums ${gainLoss >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                                        {gainLoss >= 0 ? '+' : ''}{formatCompact(gainLoss)}
                                      </p>
                                      <p className={`text-[13px] font-medium tabular-nums mt-0.5 ${gainPercent >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                                        {gainPercent >= 0 ? '+' : ''}{gainPercent.toFixed(2)}%
                                      </p>
                                    </>
                                  )}
                                </div>

                                {/* Day's Change */}
                                <div className="col-span-3 md:col-span-2 text-right">
                                  {asset.category === 'EQUITY' && dayChange.hasData ? (
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
                              </div>

                              {/* Expanded Details - Clean Modern Design */}
                              <AnimatePresence>
                                {isRowExpanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={spring.gentle}
                                    className="overflow-hidden"
                                  >
                                    <div className="pb-4 pt-2 border-t border-dashed border-[var(--separator)]">
                                      {/* Main Content Row - Aligned with asset title */}
                                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 py-3 px-4 md:pl-[52px] md:pr-6">

                                        {/* Left: Holdings & Returns Info - Single Row */}
                                        <div className="flex flex-wrap items-center gap-5">
                                          {/* Holdings Info - Qty, Avg, LTP */}
                                          {!isFixedIncome && asset.quantity && (
                                            <div className="flex items-center gap-4 px-4 py-2.5 bg-[var(--fill-tertiary)]/50 rounded-xl">
                                              <div className="flex items-center gap-2">
                                                <span className="text-[12px] text-[var(--label-tertiary)] font-medium">Qty</span>
                                                <span className="text-[15px] font-bold text-[var(--label-primary)] tabular-nums">{formatQty(asset)}</span>
                                              </div>
                                              <span className="text-[var(--label-quaternary)] text-[15px]">×</span>
                                              <div className="flex items-center gap-2">
                                                <span className="text-[12px] text-[var(--label-tertiary)] font-medium">Avg</span>
                                                <span className="text-[15px] font-semibold text-[var(--label-primary)] tabular-nums">₹{asset.avg_buy_price?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                                              </div>
                                              {currentPrice > 0 && (
                                                <>
                                                  <span className="text-[var(--label-quaternary)] text-[15px]">→</span>
                                                  <div className="flex items-center gap-2">
                                                    <span className="text-[12px] text-[var(--label-tertiary)] font-medium">LTP</span>
                                                    <span className="text-[15px] font-semibold text-[var(--label-primary)] tabular-nums">₹{currentPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                                                  </div>
                                                </>
                                              )}
                                            </div>
                                          )}

                                          {/* Fixed Income Rate Info */}
                                          {isFixedIncome && (
                                            <div className="flex items-center gap-4 px-4 py-2.5 bg-[var(--fill-tertiary)]/50 rounded-xl">
                                              <div className="flex items-center gap-2">
                                                <span className="text-[12px] text-[var(--label-tertiary)] font-medium">Principal</span>
                                                <span className="text-[15px] font-bold text-[var(--label-primary)] tabular-nums">{formatCurrency(asset.principal)}</span>
                                              </div>
                                              <span className="text-[var(--label-quaternary)] text-[15px]">@</span>
                                              <div className="flex items-center gap-2">
                                                <span className="text-[12px] text-[var(--label-tertiary)] font-medium">Rate</span>
                                                <span className="text-[15px] font-semibold text-[var(--system-green)] tabular-nums">{asset.interest_rate}% p.a.</span>
                                              </div>
                                            </div>
                                          )}

                                          {/* Separator */}
                                          <div className="hidden sm:block h-10 w-px bg-[var(--separator)]"></div>

                                          {/* Returns */}
                                          <div className="flex items-center gap-2">
                                            <span className="text-[12px] text-[var(--label-tertiary)] font-semibold uppercase">Returns</span>
                                            <span className={`text-[16px] font-bold tabular-nums ${gainLoss >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                                              {gainLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(gainLoss))}
                                              <span className="text-[13px] font-semibold ml-1.5 opacity-80">({gainPercent >= 0 ? '+' : ''}{gainPercent.toFixed(2)}%)</span>
                                            </span>
                                          </div>

                                          {/* XIRR for Mutual Funds - only show if holding period >= 30 days */}
                                          {asset.asset_type === 'MUTUAL_FUND' && transactionDates[asset.id]?.transactions && currentValue > 0 && (() => {
                                            const txnData = transactionDates[asset.id];
                                            const firstDate = txnData.firstDate ? new Date(txnData.firstDate) : null;
                                            const holdingDays = firstDate ? Math.floor((new Date() - firstDate) / (1000 * 60 * 60 * 24)) : 0;

                                            // Only show XIRR for holdings >= 30 days
                                            if (holdingDays < 30) return null;

                                            const xirrRaw = calculateXIRRFromTransactions(txnData.transactions, currentValue);
                                            if (!xirrRaw || isNaN(xirrRaw)) return null;

                                            // Cap XIRR at ±999.99% for display
                                            const xirr = Math.min(Math.max(xirrRaw, -999.99), 999.99);
                                            const xirrPositive = xirr >= 0;
                                            const xirrCapped = Math.abs(xirrRaw) > 999.99;

                                            return (
                                              <div className="flex items-center gap-2 pl-4 border-l border-[var(--separator)]">
                                                <span className="text-[12px] text-[var(--label-tertiary)] font-semibold uppercase">XIRR</span>
                                                <span className={`text-[16px] font-bold tabular-nums ${xirrPositive ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                                                  {xirrPositive ? '+' : ''}{xirr.toFixed(2)}%{xirrCapped ? '+' : ''}
                                                </span>
                                              </div>
                                            );
                                          })()}

                                          {/* Portfolio Weight */}
                                          <div className="flex items-center gap-2 pl-4 border-l border-[var(--separator)]">
                                            <span className="text-[12px] text-[var(--label-tertiary)] font-semibold uppercase">Weight</span>
                                            <span className="text-[16px] font-bold text-[var(--label-primary)] tabular-nums">
                                              {portfolioWeight.toFixed(2)}%
                                            </span>
                                          </div>
                                        </div>

                                        {/* Right: Action Buttons - Primary + Secondary Group */}
                                        <div className="flex items-center gap-3">
                                          {/* Primary: Add Transaction */}
                                          <button
                                            onClick={(e) => openAddTransaction(asset, e)}
                                            className="h-10 px-4 flex items-center gap-2 text-[13px] font-semibold text-white bg-[var(--chart-primary)] hover:bg-[var(--chart-primary)]/90 rounded-xl transition-all shadow-sm hover:shadow-md active:scale-[0.98]"
                                            title="Add Transaction"
                                          >
                                            <svg className="w-[18px] h-[18px]" viewBox="0 0 20 20" fill="currentColor">
                                              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                                            </svg>
                                            Add
                                          </button>

                                          {/* Secondary: Manage + Delete Pill */}
                                          <div className="flex items-center h-10 bg-[var(--fill-tertiary)] rounded-xl overflow-hidden">
                                            {/* Manage */}
                                            <Link
                                              to={`/assets/${asset.id}`}
                                              onClick={(e) => e.stopPropagation()}
                                              className="h-full px-4 flex items-center gap-2 text-[13px] font-medium text-[var(--label-secondary)] hover:bg-[var(--fill-secondary)] hover:text-[var(--label-primary)] transition-colors"
                                            >
                                              <svg className="w-[18px] h-[18px]" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.992 6.992 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                                              </svg>
                                              Manage
                                            </Link>

                                            {/* Separator */}
                                            <div className="w-px h-5 bg-[var(--separator)]"></div>

                                            {/* Delete */}
                                            <button
                                              onClick={(e) => handleDelete(asset, e)}
                                              className="h-full px-4 flex items-center gap-2 text-[13px] font-medium text-[var(--label-secondary)] hover:bg-[var(--system-red)]/10 hover:text-[var(--system-red)] transition-colors"
                                            >
                                              <svg className="w-[18px] h-[18px]" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.519.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                                              </svg>
                                              Delete
                                            </button>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Footer: Metadata - Aligned with content */}
                                      <div className="flex items-center gap-2 text-[12px] text-[var(--label-tertiary)] pt-2 mx-4 md:ml-[52px] md:mr-6 border-t border-[var(--separator)]/20">
                                        {isFixedIncome && asset.maturity_date && (
                                          <>
                                            <span className="flex items-center gap-1">
                                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                                              </svg>
                                              Matures {new Date(asset.maturity_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </span>
                                            <span className="text-[var(--separator)]">•</span>
                                          </>
                                        )}
                                        {transactionDates[asset.id] ? (
                                          <>
                                            <span className="flex items-center gap-1">
                                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                                              </svg>
                                              {transactionDates[asset.id].count} transaction{transactionDates[asset.id].count !== 1 ? 's' : ''}
                                            </span>
                                            {transactionDates[asset.id].firstDate && (
                                              <>
                                                <span className="text-[var(--separator)]">•</span>
                                                <span>Since {new Date(transactionDates[asset.id].firstDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>
                                              </>
                                            )}
                                          </>
                                        ) : (
                                          <span className="text-[var(--label-quaternary)]">No transactions recorded</span>
                                        )}
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
      </div>

      {/* Quick Add Transaction Modal */}
      <Modal
        isOpen={showAddTransaction}
        onClose={() => {
          setShowAddTransaction(false);
          setSelectedAssetForTxn(null);
        }}
        title="Add Transaction"
        size="sm"
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
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={cancelDelete}
        title="Delete Asset"
        size="sm"
      >
        {assetToDelete && (
          <div className="p-1">
            {/* Warning Icon & Message */}
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-14 h-14 rounded-full bg-[var(--system-red)]/10 flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-[var(--system-red)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <h3 className="text-[17px] font-semibold text-[var(--label-primary)] mb-2">
                Delete "{assetToDelete.name}"?
              </h3>
              <p className="text-[14px] text-[var(--label-secondary)] leading-relaxed">
                This will permanently delete this asset and all its transaction history. This action cannot be undone.
              </p>
            </div>

            {/* Asset Details */}
            <div className="bg-[var(--fill-tertiary)] rounded-xl p-4 mb-6">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  assetToDelete.category === 'EQUITY' ? 'bg-[#4F7DF3]' :
                  assetToDelete.category === 'FIXED_INCOME' ? 'bg-[#22C55E]' :
                  assetToDelete.category === 'REAL_ESTATE' ? 'bg-[#F59E0B]' :
                  assetToDelete.category === 'GOLD' ? 'bg-[#EAB308]' :
                  assetToDelete.category === 'CASH' ? 'bg-[#6366F1]' :
                  'bg-[var(--system-gray)]'
                }`}>
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    {assetToDelete.category === 'EQUITY' ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                    ) : assetToDelete.category === 'FIXED_INCOME' ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                    ) : assetToDelete.category === 'REAL_ESTATE' ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5l-1.5-.5M6.75 7.364V3h-3v18m3-13.636l10.5-3.819" />
                    ) : assetToDelete.category === 'GOLD' ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                    )}
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-[var(--label-primary)] truncate">
                    {assetToDelete.name}
                  </p>
                  <p className="text-[13px] text-[var(--label-secondary)]">
                    {assetToDelete.category?.replace('_', ' ')} • {assetToDelete.asset_type?.replace('_', ' ') || 'Asset'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[15px] font-semibold text-[var(--label-primary)] tabular-nums">
                    {formatCurrency(getAssetValue(assetToDelete))}
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={cancelDelete}
                disabled={isDeleting}
                className="flex-1 h-12 px-4 text-[15px] font-semibold text-[var(--label-primary)] bg-[var(--fill-tertiary)] hover:bg-[var(--fill-secondary)] rounded-xl transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex-1 h-12 px-4 text-[15px] font-semibold text-white bg-[var(--system-red)] hover:bg-[#B91C1C] rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Deleting...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                    Delete Asset
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
