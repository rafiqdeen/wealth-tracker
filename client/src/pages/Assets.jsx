import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { assetService, priceService, ASSET_CONFIG } from '../services/assets';
import { Card, Button, SearchInput, AssetsSkeleton, BottomSheet } from '../components/apple';
import QuickAddTransaction from '../components/QuickAddTransaction';
import { spring, staggerContainer, staggerItem } from '../utils/animations';
import { categoryColors } from '../constants/theme';
import { formatCurrency, formatCompact } from '../utils/formatting';
import { calculateFixedIncomeValue, getCompoundingFrequency } from '../utils/interest';
import { useToast } from '../context/ToastContext';

export default function Assets() {
  const navigate = useNavigate();
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

  useEffect(() => {
    fetchAssets();
  }, []);

  const fetchAssets = async () => {
    try {
      const response = await assetService.getAll();
      const assetList = response.data.assets;
      setAssets(assetList);

      const equityAssets = assetList.filter(a => a.category === 'EQUITY' && a.symbol);
      if (equityAssets.length > 0) {
        fetchPrices(equityAssets);
      }

      const fixedIncomeAssets = assetList.filter(a => a.category === 'FIXED_INCOME' && a.interest_rate);
      if (fixedIncomeAssets.length > 0) {
        fetchFixedIncomeCalculations(fixedIncomeAssets);
      }
    } catch (error) {
      console.error('Error fetching assets:', error);
    } finally {
      setLoading(false);
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

  // Filtering and grouping
  const filteredAssets = assets.filter((asset) => {
    if (!searchTerm) return true;
    return asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           asset.symbol?.toLowerCase().includes(searchTerm.toLowerCase());
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

  // Sort assets by current value (highest first)
  Object.keys(groupedAssets).forEach(key => {
    groupedAssets[key].sort((a, b) => getAssetValue(b) - getAssetValue(a));
  });

  const visualGroupConfig = {
    EQUITY_STOCKS: { label: 'Stocks', color: 'var(--system-blue)', icon: '📈' },
    EQUITY_MF: { label: 'Mutual Funds', color: 'var(--system-purple)', icon: '📊' },
    FIXED_INCOME: { label: 'Fixed Income', color: 'var(--system-green)', icon: '🏦' },
    REAL_ESTATE: { label: 'Real Estate', color: 'var(--system-orange)', icon: '🏠' },
    PHYSICAL: { label: 'Physical Assets', color: 'var(--system-yellow)', icon: '💎' },
    SAVINGS: { label: 'Savings', color: 'var(--system-teal)', icon: '💰' },
    CRYPTO: { label: 'Crypto', color: 'var(--system-pink)', icon: '₿' },
    INSURANCE: { label: 'Insurance', color: 'var(--system-indigo)', icon: '🛡️' },
    OTHER: { label: 'Other', color: 'var(--system-gray)', icon: '📦' },
  };

  const totalCurrentValue = filteredAssets.reduce((sum, asset) => sum + getAssetValue(asset), 0);
  const totalInvestedValue = filteredAssets.reduce((sum, asset) => sum + getInvestedValue(asset), 0);
  const totalGainLoss = totalCurrentValue - totalInvestedValue;
  const totalGainPercent = totalInvestedValue > 0 ? (totalGainLoss / totalInvestedValue) * 100 : 0;

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
      <div className="min-h-screen bg-[var(--bg-secondary)]">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <AssetsSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="space-y-4"
        >
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring.gentle}
            className="flex items-center justify-between"
          >
            <div>
              <h1 className="text-[28px] font-semibold text-[var(--label-primary)]">Assets</h1>
              <p className="text-[15px] text-[var(--label-secondary)]">{assets.length} holdings</p>
            </div>
            <Link to="/assets/add">
              <Button variant="filled" icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              }>
                Add
              </Button>
            </Link>
          </motion.div>

          {/* Portfolio Summary */}
          <motion.div variants={staggerItem}>
            <Card padding="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] text-[var(--label-tertiary)] mb-1">Total Value</p>
                  <p className="text-[32px] font-semibold text-[var(--label-primary)] tracking-tight leading-none">
                    {formatCurrency(totalCurrentValue)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] text-[var(--label-tertiary)] mb-1">Total Returns</p>
                  <p className={`text-[20px] font-semibold ${totalGainLoss >= 0 ? 'text-[var(--system-green)]' : 'text-[var(--system-amber)]'}`}>
                    {totalGainLoss >= 0 ? '+' : ''}{formatCompact(totalGainLoss)}
                  </p>
                  <p className={`text-[14px] font-medium ${totalGainPercent >= 0 ? 'text-[var(--system-green)]' : 'text-[var(--system-amber)]'}`}>
                    {totalGainPercent >= 0 ? '+' : ''}{totalGainPercent.toFixed(2)}%
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-[var(--separator)]/30">
                <div className="flex justify-between text-[14px]">
                  <span className="text-[var(--label-tertiary)]">Invested</span>
                  <span className="text-[var(--label-primary)] font-medium">{formatCompact(totalInvestedValue)}</span>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Search */}
          <motion.div variants={staggerItem}>
            <SearchInput
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClear={() => setSearchTerm('')}
              placeholder="Search assets..."
            />
          </motion.div>

          {/* Asset Categories */}
          {Object.entries(groupedAssets).map(([category, categoryAssets], categoryIndex) => {
            const config = visualGroupConfig[category] || categoryColors[category] || {};
            const groupColor = config.color || 'var(--system-gray)';
            const groupLabel = config.label || ASSET_CONFIG[category]?.label || category;
            const categoryTotal = categoryAssets.reduce((sum, a) => sum + getAssetValue(a), 0);
            const categoryInvested = categoryAssets.reduce((sum, a) => sum + getInvestedValue(a), 0);
            const categoryGain = categoryTotal - categoryInvested;
            const categoryGainPercent = categoryInvested > 0 ? (categoryGain / categoryInvested) * 100 : 0;
            const isExpanded = isCategoryExpanded(category);

            return (
              <motion.div
                key={category}
                variants={staggerItem}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring.gentle, delay: categoryIndex * 0.05 }}
              >
                <Card padding="p-0" className="overflow-hidden">
                  {/* Category Header */}
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full flex items-center justify-between px-4 py-3.5 bg-[var(--bg-primary)] hover:bg-[var(--fill-tertiary)]/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <motion.div
                        animate={{ rotate: isExpanded ? 90 : 0 }}
                        transition={spring.snappy}
                        className="text-[var(--label-tertiary)]"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </motion.div>
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm"
                        style={{ backgroundColor: groupColor }}
                      >
                        {config.icon || '📁'}
                      </div>
                      <div className="text-left">
                        <p className="text-[15px] font-semibold text-[var(--label-primary)]">{groupLabel}</p>
                        <p className="text-[12px] text-[var(--label-tertiary)]">{categoryAssets.length} {categoryAssets.length === 1 ? 'asset' : 'assets'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[15px] font-semibold text-[var(--label-primary)]">{formatCompact(categoryTotal)}</p>
                      <p className={`text-[13px] font-medium ${categoryGain >= 0 ? 'text-[var(--system-green)]' : 'text-[var(--system-amber)]'}`}>
                        {categoryGain >= 0 ? '+' : ''}{categoryGainPercent.toFixed(1)}%
                      </p>
                    </div>
                  </button>

                  {/* Asset List */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={spring.gentle}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-[var(--separator)]/30">
                          {categoryAssets.map((asset, index) => {
                            const currentValue = getAssetValue(asset);
                            const investedValue = getInvestedValue(asset);
                            const gainLoss = getGainLoss(asset);
                            const gainPercent = getGainPercent(asset);
                            const currentPrice = getCurrentPrice(asset);
                            const isRowExpanded = isAssetExpanded(asset.id);
                            const isFixedIncome = asset.category === 'FIXED_INCOME';

                            return (
                              <div
                                key={asset.id}
                                className={`border-b border-[var(--separator)]/20 last:border-b-0 ${isRowExpanded ? 'bg-[var(--fill-tertiary)]/30' : ''}`}
                              >
                                {/* Collapsed Row - Main Info */}
                                <div
                                  onClick={(e) => toggleAsset(asset.id, e)}
                                  className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-[var(--fill-tertiary)]/50 transition-colors"
                                >
                                  {/* Expand Icon */}
                                  <motion.div
                                    animate={{ rotate: isRowExpanded ? 90 : 0 }}
                                    transition={spring.snappy}
                                    className="text-[var(--label-quaternary)]"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                    </svg>
                                  </motion.div>

                                  {/* Asset Name */}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[15px] font-medium text-[var(--label-primary)] truncate">
                                      {asset.name}
                                    </p>
                                    <p className="text-[12px] text-[var(--label-tertiary)] truncate">
                                      {asset.category === 'EQUITY' && asset.quantity ? (
                                        // Show units and avg for equity
                                        <>
                                          {formatQty(asset)} units @ ₹{asset.avg_buy_price?.toFixed(2) || '—'}
                                        </>
                                      ) : asset.category === 'FIXED_INCOME' ? (
                                        // Show type and rate for fixed income
                                        <>
                                          {asset.asset_type} • {asset.interest_rate}% p.a.
                                        </>
                                      ) : (
                                        // Default: symbol or asset type
                                        asset.symbol || asset.asset_type.replace(/_/g, ' ')
                                      )}
                                    </p>
                                  </div>

                                  {/* Current Value & Returns */}
                                  <div className="text-right shrink-0">
                                    <p className="text-[15px] font-semibold text-[var(--label-primary)]">
                                      {formatCompact(currentValue)}
                                    </p>
                                    <div className="flex items-center justify-end gap-1.5">
                                      <span className={`text-[13px] font-medium ${gainLoss >= 0 ? 'text-[var(--system-green)]' : 'text-[var(--system-amber)]'}`}>
                                        {gainLoss >= 0 ? '+' : ''}{formatCompact(gainLoss)}
                                      </span>
                                      <span className={`text-[12px] px-1.5 py-0.5 rounded-md font-medium ${
                                        gainPercent >= 0
                                          ? 'bg-[var(--system-green)]/10 text-[var(--system-green)]'
                                          : 'bg-[var(--system-amber)]/10 text-[var(--system-amber)]'
                                      }`}>
                                        {gainPercent >= 0 ? '+' : ''}{gainPercent.toFixed(1)}%
                                      </span>
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
                                        {/* Details Grid */}
                                        <div className="bg-[var(--bg-secondary)] rounded-xl p-3.5">
                                          {isFixedIncome ? (
                                            // Fixed Income Details
                                            <div className="grid grid-cols-2 gap-4">
                                              <div>
                                                <p className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide mb-0.5">Deposited</p>
                                                {fixedIncomeLoading && !fixedIncomeCalcs[asset.id] ? (
                                                  <div className="h-5 w-20 bg-[var(--fill-tertiary)] rounded shimmer" />
                                                ) : (
                                                  <p className="text-[15px] font-medium text-[var(--label-primary)]">{formatCompact(investedValue)}</p>
                                                )}
                                              </div>
                                              <div>
                                                <p className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide mb-0.5">Interest Earned</p>
                                                {fixedIncomeLoading && !fixedIncomeCalcs[asset.id] ? (
                                                  <div className="h-5 w-20 bg-[var(--fill-tertiary)] rounded shimmer" />
                                                ) : (
                                                  <p className="text-[15px] font-medium text-[var(--system-green)]">+{formatCompact(getInterestEarned(asset))}</p>
                                                )}
                                              </div>
                                              <div>
                                                <p className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide mb-0.5">Interest Rate</p>
                                                <p className="text-[15px] font-medium text-[var(--system-blue)]">{asset.interest_rate}% p.a.</p>
                                              </div>
                                              <div>
                                                <p className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide mb-0.5">Type</p>
                                                <p className="text-[15px] font-medium text-[var(--label-primary)]">{asset.asset_type}</p>
                                              </div>
                                            </div>
                                          ) : (
                                            // Equity Details
                                            <div className="grid grid-cols-2 gap-4">
                                              <div>
                                                <p className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide mb-0.5">Quantity</p>
                                                <p className="text-[15px] font-medium text-[var(--label-primary)]">{formatQty(asset)}</p>
                                              </div>
                                              <div>
                                                <p className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide mb-0.5">Avg Cost</p>
                                                <p className="text-[15px] font-medium text-[var(--label-primary)]">
                                                  {asset.avg_buy_price ? `₹${asset.avg_buy_price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                                                </p>
                                              </div>
                                              <div>
                                                <p className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide mb-0.5">LTP</p>
                                                <p className="text-[15px] font-medium text-[var(--label-primary)]">
                                                  {currentPrice ? `₹${currentPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                                                </p>
                                              </div>
                                              <div>
                                                <p className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide mb-0.5">Invested</p>
                                                <p className="text-[15px] font-medium text-[var(--label-primary)]">{formatCompact(investedValue)}</p>
                                              </div>
                                            </div>
                                          )}

                                          {/* Progress Bar - Invested vs Current */}
                                          <div className="mt-4 pt-3 border-t border-[var(--separator)]/30">
                                            <div className="flex justify-between text-[12px] mb-2">
                                              <span className="text-[var(--label-tertiary)]">Invested → Current</span>
                                              <span className={`font-medium ${gainLoss >= 0 ? 'text-[var(--system-green)]' : 'text-[var(--system-amber)]'}`}>
                                                {gainLoss >= 0 ? '+' : ''}{gainPercent.toFixed(2)}%
                                              </span>
                                            </div>
                                            <div className="h-2 bg-[var(--fill-tertiary)] rounded-full overflow-hidden">
                                              <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${Math.min(100, Math.max(0, (investedValue / currentValue) * 100))}%` }}
                                                transition={spring.gentle}
                                                className="h-full bg-[var(--label-tertiary)] rounded-full"
                                              />
                                            </div>
                                            <div className="flex justify-between text-[11px] mt-1.5 text-[var(--label-tertiary)]">
                                              <span>{formatCompact(investedValue)}</span>
                                              <span className="font-medium text-[var(--label-primary)]">{formatCompact(currentValue)}</span>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex flex-wrap gap-2 mt-3">
                                          {/* Quick Add Transaction - Only for Equity */}
                                          {asset.category === 'EQUITY' && (
                                            <button
                                              onClick={(e) => openAddTransaction(asset, e)}
                                              className="flex items-center justify-center gap-2 px-3 py-2.5 bg-[var(--system-green)]/10 text-[var(--system-green)] rounded-xl text-[14px] font-medium hover:bg-[var(--system-green)]/20 transition-colors"
                                            >
                                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                              </svg>
                                              Add Txn
                                            </button>
                                          )}
                                          {(asset.category === 'EQUITY' || asset.category === 'FIXED_INCOME') && (
                                            <Link
                                              to={`/assets/${asset.id}/transactions`}
                                              onClick={(e) => e.stopPropagation()}
                                              className="flex-1"
                                            >
                                              <button className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-[var(--system-purple)]/10 text-[var(--system-purple)] rounded-xl text-[14px] font-medium hover:bg-[var(--system-purple)]/20 transition-colors">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                History
                                              </button>
                                            </Link>
                                          )}
                                          <Link
                                            to={`/assets/edit/${asset.id}`}
                                            onClick={(e) => e.stopPropagation()}
                                            className="flex-1"
                                          >
                                            <button className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-[var(--system-blue)]/10 text-[var(--system-blue)] rounded-xl text-[14px] font-medium hover:bg-[var(--system-blue)]/20 transition-colors">
                                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                                              </svg>
                                              Edit
                                            </button>
                                          </Link>
                                          <button
                                            onClick={(e) => handleDelete(asset.id, asset.name, e)}
                                            className="flex items-center justify-center px-3 py-2.5 bg-[var(--system-red)]/10 text-[var(--system-red)] rounded-xl text-[14px] font-medium hover:bg-[var(--system-red)]/20 transition-colors"
                                          >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                            </svg>
                                          </button>
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
                <div className="w-16 h-16 bg-[var(--fill-tertiary)] rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-[var(--label-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <h3 className="text-[20px] font-semibold text-[var(--label-primary)] mb-1">
                  {searchTerm ? 'No results found' : 'No assets yet'}
                </h3>
                <p className="text-[15px] text-[var(--label-secondary)] mb-6 max-w-sm mx-auto">
                  {searchTerm ? 'Try a different search term' : 'Start tracking your wealth by adding your first asset'}
                </p>
                {!searchTerm && (
                  <Link to="/assets/add">
                    <Button variant="filled" size="lg">
                      Add Your First Asset
                    </Button>
                  </Link>
                )}
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
            className="fixed bottom-6 right-6 w-14 h-14 bg-[var(--system-blue)] text-white rounded-full shadow-lg flex items-center justify-center z-50"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </motion.div>
        </Link>
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
