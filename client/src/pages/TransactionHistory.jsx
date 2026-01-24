import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { transactionService } from '../services/transactions';
import { priceService } from '../services/assets';
import { Card, Button, Skeleton, SkeletonRow, ProgressBar, BottomSheet, Modal } from '../components/apple';
import { spring, staggerContainer, staggerItem, tapScale } from '../utils/animations';
import { ANIMATION } from '../constants/theme';
import { formatCurrency, formatCompact, formatNumber, formatDate, formatPrice } from '../utils/formatting';
import { calculateFixedIncomeValue, getCompoundingFrequency, calculateXIRRFromTransactions } from '../utils/interest';
import { useToast } from '../context/ToastContext';
import CSVImport from '../components/CSVImport';

// Price Comparison Indicator
function PriceCompareIndicator({ txnPrice, currentPrice, type }) {
  // Validate both prices are valid numbers
  if (!currentPrice || !txnPrice || isNaN(currentPrice) || isNaN(txnPrice)) return null;

  const diff = ((currentPrice - txnPrice) / txnPrice) * 100;
  if (isNaN(diff)) return null;
  const isPositive = diff > 0;

  // For BUY: positive diff means price went up (good)
  // For SELL: we show what it would be worth now
  if (type === 'BUY') {
    return (
      <span
        className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${
          isPositive ? 'text-[#059669]' : 'text-[#DC2626]'
        }`}
        title={`Current price is ${isPositive ? 'above' : 'below'} your buy price`}
      >
        {isPositive ? (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
        ) : (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        )}
        {Math.abs(diff).toFixed(1)}%
      </span>
    );
  }

  return null;
}

export default function TransactionHistory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [asset, setAsset] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [filterType, setFilterType] = useState('ALL');
  const [sortOrder, setSortOrder] = useState('latest');
  const [currentPrice, setCurrentPrice] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ show: false, transaction: null });
  const [deleting, setDeleting] = useState(false);
  const [editModal, setEditModal] = useState({ show: false, transaction: null });
  const [editForm, setEditForm] = useState({ quantity: '', price: '', notes: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, [id]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
      }

      if (e.key === 'Escape' && !deleteModal.show && !editModal.show && !showCSVImport) {
        navigate('/assets');
      }

      if (e.key === 'n' || e.key === 'N') {
        if (!deleteModal.show && !editModal.show && !showCSVImport) {
          navigate('/assets/add', {
            state: {
              symbol: asset?.symbol,
              assetType: asset?.asset_type,
              exchange: asset?.exchange,
              category: asset?.category,
              assetId: asset?.id
            }
          });
        }
      }

      if ((e.key === 'e' || e.key === 'E') && !e.metaKey && !e.ctrlKey) {
        if (!deleteModal.show && !editModal.show && !showCSVImport && transactions.length > 0) {
          handleExportCSV();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [asset, deleteModal.show, editModal.show, showCSVImport, transactions, navigate]);

  const fetchData = async () => {
    try {
      const response = await transactionService.getByAsset(id);
      setAsset(response.data.asset);
      setTransactions(response.data.transactions);
      setSummary(response.data.summary);

      const assetData = response.data.asset;
      if (assetData?.category === 'EQUITY' && assetData?.symbol) {
        try {
          // Format symbol and type same as Assets page
          const isMutualFund = assetData.asset_type === 'MUTUAL_FUND';
          const type = isMutualFund ? 'mf' : 'stock';
          const symbol = isMutualFund
            ? assetData.symbol
            : `${assetData.symbol}.${assetData.exchange === 'BSE' ? 'BO' : 'NS'}`;

          const priceResponse = await priceService.getPrice(symbol, type);
          // API returns { price: { price: number, ... }, cached: boolean }
          const fetchedPrice = priceResponse.data?.price?.price;
          if (fetchedPrice && !isNaN(fetchedPrice) && fetchedPrice > 0) {
            setCurrentPrice(fetchedPrice);
          }
        } catch (priceErr) {
          console.log('Could not fetch current price');
        }
      }
    } catch (err) {
      setError('Failed to load transaction history');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (transaction) => {
    setDeleteModal({ show: true, transaction });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModal.transaction) return;

    setDeleting(true);
    try {
      await transactionService.delete(deleteModal.transaction.id);
      toast.success('Transaction deleted');
      setDeleteModal({ show: false, transaction: null });
      fetchData();
    } catch (err) {
      toast.error('Failed to delete transaction');
    } finally {
      setDeleting(false);
    }
  };

  const handleEditClick = (transaction) => {
    setEditForm({
      quantity: transaction.quantity?.toString() || '',
      price: transaction.price?.toString() || '',
      notes: transaction.notes || ''
    });
    setEditModal({ show: true, transaction });
  };

  const handleEditSave = async () => {
    if (!editModal.transaction) return;

    setSaving(true);
    try {
      await transactionService.update(editModal.transaction.id, {
        quantity: parseFloat(editForm.quantity) || editModal.transaction.quantity,
        price: parseFloat(editForm.price) || editModal.transaction.price,
        notes: editForm.notes
      });
      toast.success('Transaction updated');
      setEditModal({ show: false, transaction: null });
      fetchData();
    } catch (err) {
      toast.error('Failed to update transaction');
    } finally {
      setSaving(false);
    }
  };

  const handleCSVImportSuccess = () => {
    setShowCSVImport(false);
    fetchData();
  };

  const handleExportCSV = useCallback(() => {
    if (!asset || transactions.length === 0) return;

    const isFixedIncome = asset.category === 'FIXED_INCOME';
    const headers = isFixedIncome
      ? ['Date', 'Type', 'Amount', 'Notes']
      : ['Date', 'Type', 'Quantity', 'Price', 'Total', 'Gain/Loss', 'Notes'];

    const rows = transactions.map(txn => {
      if (isFixedIncome) {
        return [
          formatDate(txn.transaction_date),
          txn.type,
          txn.total_amount,
          `"${(txn.notes || '').replace(/"/g, '""')}"`
        ];
      }
      return [
        formatDate(txn.transaction_date),
        txn.type,
        txn.quantity,
        txn.price,
        txn.total_amount,
        txn.type === 'SELL' && txn.realized_gain !== null ? txn.realized_gain : '',
        `"${(txn.notes || '').replace(/"/g, '""')}"`
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${asset.symbol || asset.name}_transactions_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success('Transactions exported');
  }, [asset, transactions, toast]);

  // Get category color for gradient
  const getCategoryColor = () => {
    if (asset?.category === 'EQUITY' && asset?.asset_type === 'MUTUAL_FUND') {
      return '#8B5CF6';
    }
    const colors = {
      'EQUITY': '#4F7DF3',
      'FIXED_INCOME': '#22C55E',
      'REAL_ESTATE': '#F59E0B',
      'GOLD': '#F97316',
      'SAVINGS': '#14B8A6',
      'CRYPTO': '#6366F1',
      'INSURANCE': '#EC4899',
    };
    return colors[asset?.category] || '#4F7DF3';
  };

  // Transaction counts for filter badges
  const transactionCounts = useMemo(() => {
    const counts = { ALL: transactions.length, BUY: 0, SELL: 0 };
    transactions.forEach(txn => {
      if (txn.type === 'BUY') counts.BUY++;
      else if (txn.type === 'SELL') counts.SELL++;
    });
    return counts;
  }, [transactions]);

  // Filter, sort, and calculate running balance
  const processedTransactions = useMemo(() => {
    let result = [...transactions];

    if (filterType !== 'ALL') {
      result = result.filter(txn => txn.type === filterType);
    }

    result.sort((a, b) => {
      const dateA = new Date(a.transaction_date);
      const dateB = new Date(b.transaction_date);
      return sortOrder === 'latest' ? dateB - dateA : dateA - dateB;
    });

    const sortedByDate = [...transactions].sort((a, b) =>
      new Date(a.transaction_date) - new Date(b.transaction_date)
    );

    const balanceMap = {};
    let runningBalance = 0;
    sortedByDate.forEach(txn => {
      if (txn.type === 'BUY') {
        runningBalance += txn.quantity || 0;
      } else if (txn.type === 'SELL') {
        runningBalance -= txn.quantity || 0;
      }
      balanceMap[txn.id] = runningBalance;
    });

    return result.map(txn => ({
      ...txn,
      runningBalance: balanceMap[txn.id] || 0
    }));
  }, [transactions, filterType, sortOrder]);

  if (loading) {
    return (
      <div className="p-4 md:px-12 md:py-6 h-full overflow-auto">
        <Card padding="p-0" className="overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--separator-opaque)]">
            <Skeleton width="250px" height="1.5rem" rounded="md" className="mb-2" />
            <Skeleton width="180px" height="0.875rem" rounded="sm" />
          </div>
          <div className="px-5 py-3 border-b border-[var(--separator-opaque)]">
            <Skeleton width="100%" height="5rem" rounded="lg" />
          </div>
          <div className="px-5 py-3 border-b border-[var(--separator-opaque)] flex gap-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i}>
                <Skeleton width="60px" height="0.625rem" rounded="sm" className="mb-1" />
                <Skeleton width="80px" height="1.25rem" rounded="md" />
              </div>
            ))}
          </div>
          {[1, 2, 3, 4, 5].map(i => (
            <SkeletonRow key={i} columns={7} />
          ))}
        </Card>
      </div>
    );
  }

  if (error || !asset) {
    return (
      <div className="p-4 md:px-12 md:py-6 h-full overflow-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.gentle}
        >
          <Card padding="p-6" className="bg-[#DC2626]/10 border-[#DC2626]/20">
            <p className="text-[#DC2626] text-[15px] font-medium">{error || 'Asset not found'}</p>
          </Card>
          <Link
            to="/assets"
            className="mt-4 inline-flex items-center gap-1.5 text-[var(--chart-primary)] text-[14px] font-medium hover:underline"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Assets
          </Link>
        </motion.div>
      </div>
    );
  }

  const isFixedIncome = asset?.category === 'FIXED_INCOME';
  const categoryColor = getCategoryColor();

  const interestCalc = isFixedIncome && transactions.length > 0
    ? calculateFixedIncomeValue(
        transactions,
        asset?.interest_rate || 7.1,
        new Date(),
        getCompoundingFrequency(asset?.asset_type)
      )
    : null;

  return (
    <div className="p-4 md:px-12 md:py-6 h-full overflow-auto">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.gentle}
      >
        <Card padding="p-0" className="overflow-hidden">
          {/* Header Section with gradient */}
          <div
            className="px-5 py-4 border-b border-[var(--separator-opaque)]"
            style={{
              background: `linear-gradient(to right, ${categoryColor}12, ${categoryColor}06, transparent)`
            }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <Link
                  to="/assets"
                  className="inline-flex items-center gap-1 text-[12px] text-[var(--label-tertiary)] hover:text-[var(--chart-primary)] mb-2 transition-colors"
                  title="Press Esc to go back"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to Assets
                </Link>
                <div className="flex items-center gap-3">
                  <h1 className="text-[20px] font-bold text-[var(--label-primary)]">
                    {asset.name}
                  </h1>
                  {currentPrice && !isNaN(currentPrice) && !isFixedIncome && (
                    <span className="px-2 py-0.5 bg-[var(--fill-tertiary)] rounded-md text-[12px] font-medium text-[var(--label-secondary)]">
                      LTP: {formatPrice(currentPrice)}
                    </span>
                  )}
                </div>
                <p className="text-[13px] text-[var(--label-secondary)] mt-0.5">
                  {asset.symbol && !isFixedIncome ? `${asset.symbol} • ` : ''}
                  {isFixedIncome ? 'Deposit History' : 'Transaction History'}
                  {isFixedIncome && asset.institution ? ` • ${asset.institution}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {transactions.length > 0 && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleExportCSV}
                    className="flex items-center gap-1.5 px-3 py-2 bg-[var(--bg-primary)] border border-[var(--separator-opaque)] hover:bg-[var(--fill-tertiary)] text-[var(--label-primary)] rounded-lg text-[13px] font-medium transition-colors"
                    title="Export to CSV (E)"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span className="hidden sm:inline">Export</span>
                  </motion.button>
                )}
                {!isFixedIncome && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowCSVImport(true)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-[var(--bg-primary)] border border-[var(--separator-opaque)] hover:bg-[var(--fill-tertiary)] text-[var(--label-primary)] rounded-lg text-[13px] font-medium transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    <span className="hidden sm:inline">Import</span>
                  </motion.button>
                )}
                <Link to="/assets/add" state={{
                  symbol: asset.symbol,
                  assetType: asset.asset_type,
                  exchange: asset.exchange,
                  category: asset.category,
                  assetId: asset.id
                }}>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-1.5 px-3 py-2 text-white rounded-lg text-[13px] font-medium transition-opacity hover:opacity-90"
                    style={{ backgroundColor: categoryColor }}
                    title="Add Transaction (N)"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    {isFixedIncome ? 'Add Deposit' : 'Add'}
                  </motion.button>
                </Link>
              </div>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="px-5 py-4 border-b border-[var(--separator-opaque)]">
            {(() => {
              // Sort transactions by date (latest first for price fallback, earliest first for holding period)
              const sortedByDateDesc = [...transactions].sort((a, b) =>
                new Date(b.transaction_date) - new Date(a.transaction_date)
              );
              const sortedByDateAsc = [...transactions].sort((a, b) =>
                new Date(a.transaction_date) - new Date(b.transaction_date)
              );

              // Get values with validation
              const quantity = parseFloat(summary?.current_quantity || asset?.quantity) || 0;
              const avgBuyPrice = parseFloat(summary?.avg_buy_price || asset?.avg_buy_price) || 0;

              // Get latest transaction price as fallback for current value
              const latestTxnPrice = sortedByDateDesc.length > 0 ? parseFloat(sortedByDateDesc[0].price) : 0;

              // Use live price first, then latest transaction price (for MFs), then avg buy price
              const validCurrentPrice = currentPrice && !isNaN(currentPrice) ? currentPrice : 0;
              const effectivePrice = validCurrentPrice || latestTxnPrice || avgBuyPrice;

              // Invested = quantity × avg_buy_price (cost basis)
              const invested = quantity * avgBuyPrice;
              const currentValue = effectivePrice * quantity;

              // P&L calculation with validation
              const gainLoss = currentValue - invested;
              const returnPct = invested > 0 && !isNaN(gainLoss) ? (gainLoss / invested) * 100 : 0;
              const isPositive = gainLoss >= 0;

              // Is price estimated (using latest txn price instead of live price)?
              const isPriceEstimated = !validCurrentPrice && latestTxnPrice > 0;

              // Calculate holding period
              const firstTxnDate = sortedByDateAsc.length > 0 ? new Date(sortedByDateAsc[0].transaction_date) : null;
              let holdingPeriod = '—';
              if (firstTxnDate) {
                const days = Math.floor((new Date() - firstTxnDate) / (1000 * 60 * 60 * 24));
                const years = Math.floor(days / 365);
                const months = Math.floor((days % 365) / 30);
                if (years > 0) holdingPeriod = `${years}y ${months}m`;
                else if (months > 0) holdingPeriod = `${months}m ${days % 30}d`;
                else holdingPeriod = `${days}d`;
              }

              // Calculate XIRR with validation
              const xirrRaw = currentValue > 0 ? calculateXIRRFromTransactions(transactions, currentValue) : 0;
              const xirr = xirrRaw && !isNaN(xirrRaw) ? xirrRaw : 0;
              const xirrIsPositive = xirr >= 0;

              if (!isFixedIncome) {
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 md:gap-5">
                    {/* Row 1 */}
                    <div>
                      <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wider font-medium mb-1">
                        Invested
                      </p>
                      <p className="text-[17px] font-semibold text-[var(--label-primary)] tabular-nums">
                        {formatCompact(invested)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wider font-medium mb-1">
                        Current Value {isPriceEstimated && <span className="text-[8px] text-[var(--label-quaternary)]">(est.)</span>}
                      </p>
                      <p className="text-[17px] font-semibold text-[var(--label-primary)] tabular-nums">
                        {formatCompact(currentValue)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wider font-medium mb-1">
                        P&L
                      </p>
                      <p className={`text-[17px] font-semibold tabular-nums ${isPositive ? 'text-[#34C759]' : 'text-[#FF3B30]'}`}>
                        {`${isPositive ? '+' : ''}${formatCompact(gainLoss)}`}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wider font-medium mb-1">
                        Return
                      </p>
                      <p className={`text-[17px] font-semibold tabular-nums ${isPositive ? 'text-[#34C759]' : 'text-[#FF3B30]'}`}>
                        {`${isPositive ? '+' : ''}${returnPct.toFixed(2)}%`}
                      </p>
                    </div>
                    {/* Row 2 */}
                    <div>
                      <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wider font-medium mb-1">
                        XIRR
                      </p>
                      <p className={`text-[17px] font-semibold tabular-nums ${xirrIsPositive ? 'text-[#34C759]' : 'text-[#FF3B30]'}`}>
                        {xirr ? `${xirrIsPositive ? '+' : ''}${xirr.toFixed(2)}%` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wider font-medium mb-1">
                        Avg Price
                      </p>
                      <p className="text-[17px] font-semibold text-[var(--label-primary)] tabular-nums">
                        {formatPrice(summary?.avg_buy_price || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wider font-medium mb-1">
                        Units
                      </p>
                      <p className="text-[17px] font-semibold text-[var(--label-primary)] tabular-nums">
                        {formatNumber(quantity, 2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wider font-medium mb-1">
                        Holding
                      </p>
                      <p className="text-[17px] font-semibold text-[var(--label-primary)] tabular-nums">
                        {holdingPeriod}
                      </p>
                    </div>
                  </div>
                );
              } else {
                return (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 md:gap-6">
                    <div>
                      <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wider font-medium mb-1">
                        Deposited
                      </p>
                      <p className="text-[18px] font-semibold text-[var(--label-primary)] tabular-nums">
                        {formatCompact(interestCalc?.principal || invested)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wider font-medium mb-1">
                        Current Value
                      </p>
                      <p className="text-[18px] font-semibold text-[var(--label-primary)] tabular-nums">
                        {formatCompact(interestCalc?.currentValue || invested)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wider font-medium mb-1">
                        Interest
                      </p>
                      <p className="text-[18px] font-semibold text-[#34C759] tabular-nums">
                        +{formatCompact(interestCalc?.interest || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wider font-medium mb-1">
                        Return
                      </p>
                      <p className="text-[18px] font-semibold text-[#34C759] tabular-nums">
                        +{(interestCalc?.interestPercent || 0).toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wider font-medium mb-1">
                        Holding
                      </p>
                      <p className="text-[18px] font-semibold text-[var(--label-primary)] tabular-nums">
                        {holdingPeriod}
                      </p>
                    </div>
                  </div>
                );
              }
            })()}
          </div>

          {/* Filter/Sort Row */}
          {transactions.length > 0 && (
            <div className="px-5 py-2.5 border-b border-[var(--separator-opaque)] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-[var(--label-tertiary)]">Filter:</span>
                <div className="flex gap-1">
                  {['ALL', 'BUY', 'SELL'].map((type) => (
                    <button
                      key={type}
                      onClick={() => setFilterType(type)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1.5 ${
                        filterType === type
                          ? type === 'BUY'
                            ? 'bg-[#059669]/15 text-[#059669]'
                            : type === 'SELL'
                              ? 'bg-[#DC2626]/15 text-[#DC2626]'
                              : 'bg-[var(--fill-secondary)] text-[var(--label-primary)]'
                          : 'text-[var(--label-tertiary)] hover:bg-[var(--fill-tertiary)]'
                      }`}
                    >
                      {type === 'ALL' ? 'All' : isFixedIncome ? 'DEP' : type}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        filterType === type ? 'bg-white/30' : 'bg-[var(--fill-tertiary)]'
                      }`}>
                        {transactionCounts[type]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-[var(--label-tertiary)]">Sort:</span>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className="px-2 py-1 rounded-md text-[12px] font-medium bg-[var(--fill-tertiary)] text-[var(--label-primary)] border-none outline-none cursor-pointer"
                >
                  <option value="latest">Latest First</option>
                  <option value="oldest">Oldest First</option>
                </select>
              </div>
            </div>
          )}

          {/* Desktop Table View */}
          {processedTransactions.length > 0 ? (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-[var(--fill-tertiary)]/80 backdrop-blur-sm">
                      <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider">Date</th>
                      <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider">Type</th>
                      {!isFixedIncome && (
                        <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider">Qty</th>
                      )}
                      {!isFixedIncome && (
                        <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider">Price</th>
                      )}
                      <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider">
                        {isFixedIncome ? 'Amount' : 'Total'}
                      </th>
                      {!isFixedIncome && (
                        <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider">Gain/Loss</th>
                      )}
                      <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider">Notes</th>
                      <th className="px-5 py-2.5 w-20"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--separator-opaque)]">
                    <AnimatePresence>
                      {processedTransactions.map((txn, index) => (
                        <motion.tr
                          key={txn.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ ...spring.snappy, delay: Math.min(index * ANIMATION.STAGGER_DELAY, ANIMATION.STAGGER_DELAY_MAX) }}
                          className="group hover:bg-[var(--fill-tertiary)]/40 transition-colors"
                        >
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <span className="text-[14px] font-medium text-[var(--label-primary)] tabular-nums">
                                {formatDate(txn.transaction_date)}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center justify-center w-14 py-1 rounded-md text-[11px] font-bold ${
                                  txn.type === 'BUY'
                                    ? 'bg-[#059669] text-white'
                                    : 'bg-[#DC2626] text-white'
                                }`}
                              >
                                {isFixedIncome ? 'DEP' : txn.type}
                              </span>
                              {txn.is_initial_holding === 1 && (
                                <span
                                  className="ml-2 text-[10px] text-[var(--label-quaternary)] cursor-help"
                                  title="This was recorded as an initial/existing holding"
                                >
                                  Initial
                                </span>
                              )}
                            </td>
                            {!isFixedIncome && (
                              <td className="px-5 py-3.5 whitespace-nowrap text-right">
                                <span className="text-[15px] font-semibold text-[var(--label-primary)] tabular-nums">
                                  {formatNumber(txn.quantity)}
                                </span>
                              </td>
                            )}
                            {!isFixedIncome && (
                              <td className="px-5 py-3.5 whitespace-nowrap text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <span className="text-[14px] text-[var(--label-secondary)] tabular-nums">
                                    {formatPrice(txn.price)}
                                  </span>
                                  <PriceCompareIndicator
                                    txnPrice={txn.price}
                                    currentPrice={currentPrice}
                                    type={txn.type}
                                  />
                                </div>
                              </td>
                            )}
                            <td className="px-5 py-3.5 whitespace-nowrap text-right">
                              <span className="text-[15px] font-bold text-[var(--label-primary)] tabular-nums">
                                {formatCurrency(txn.total_amount)}
                              </span>
                            </td>
                            {!isFixedIncome && (
                              <td className="px-5 py-3.5 whitespace-nowrap text-right">
                                {txn.type === 'SELL' && txn.realized_gain !== null ? (
                                  <span className={`text-[14px] font-semibold tabular-nums ${txn.realized_gain >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                                    {txn.realized_gain >= 0 ? '+' : ''}{formatCurrency(txn.realized_gain)}
                                  </span>
                                ) : (
                                  <span className="text-[var(--label-quaternary)]">—</span>
                                )}
                              </td>
                            )}
                            <td className="px-5 py-3.5 max-w-[180px]">
                              <span
                                className="text-[13px] text-[var(--label-tertiary)] truncate block cursor-help"
                                title={txn.notes || 'No notes'}
                              >
                                {txn.notes || <span className="text-[var(--label-quaternary)]">—</span>}
                              </span>
                            </td>
                            <td className="px-3 py-3.5 whitespace-nowrap">
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <motion.button
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.95 }}
                                  onClick={() => handleEditClick(txn)}
                                  className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--label-quaternary)] hover:text-[var(--chart-primary)] hover:bg-[var(--chart-primary)]/10 transition-all"
                                  title="Edit transaction"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                                  </svg>
                                </motion.button>
                                <motion.button
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.95 }}
                                  onClick={() => handleDeleteClick(txn)}
                                  className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--label-quaternary)] hover:text-[#DC2626] hover:bg-[#DC2626]/10 transition-all"
                                  title="Delete transaction"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                  </svg>
                                </motion.button>
                              </div>
                            </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden divide-y divide-[var(--separator-opaque)]">
                {processedTransactions.map((txn, index) => (
                  <motion.div
                    key={txn.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...spring.snappy, delay: Math.min(index * 0.03, 0.15) }}
                    className="px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md text-[11px] font-bold ${
                              txn.type === 'BUY'
                                ? 'bg-[#059669] text-white'
                                : 'bg-[#DC2626] text-white'
                            }`}
                          >
                            {isFixedIncome ? 'DEPOSIT' : txn.type}
                          </span>
                          <span className="text-[13px] text-[var(--label-tertiary)]">
                            {formatDate(txn.transaction_date)}
                          </span>
                          {txn.is_initial_holding === 1 && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-[var(--fill-tertiary)] rounded text-[var(--label-quaternary)]">
                              Initial
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                          {!isFixedIncome && (
                            <div>
                              <p className="text-[10px] text-[var(--label-tertiary)] uppercase">Qty</p>
                              <p className="text-[15px] font-semibold text-[var(--label-primary)] tabular-nums">
                                {formatNumber(txn.quantity)}
                              </p>
                            </div>
                          )}
                          {!isFixedIncome && (
                            <div>
                              <p className="text-[10px] text-[var(--label-tertiary)] uppercase">Price</p>
                              <div className="flex items-center gap-1.5">
                                <p className="text-[14px] text-[var(--label-secondary)] tabular-nums">
                                  {formatPrice(txn.price)}
                                </p>
                                <PriceCompareIndicator
                                  txnPrice={txn.price}
                                  currentPrice={currentPrice}
                                  type={txn.type}
                                />
                              </div>
                            </div>
                          )}
                          <div>
                            <p className="text-[10px] text-[var(--label-tertiary)] uppercase">
                              {isFixedIncome ? 'Amount' : 'Total'}
                            </p>
                            <p className="text-[15px] font-bold text-[var(--label-primary)] tabular-nums">
                              {formatCurrency(txn.total_amount)}
                            </p>
                          </div>
                          {!isFixedIncome && txn.type === 'SELL' && txn.realized_gain !== null && (
                            <div>
                              <p className="text-[10px] text-[var(--label-tertiary)] uppercase">Gain/Loss</p>
                              <p className={`text-[15px] font-semibold tabular-nums ${txn.realized_gain >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                                {txn.realized_gain >= 0 ? '+' : ''}{formatCurrency(txn.realized_gain)}
                              </p>
                            </div>
                          )}
                        </div>

                        {txn.notes && (
                          <p className="mt-2 text-[13px] text-[var(--label-tertiary)] line-clamp-2">
                            {txn.notes}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => handleEditClick(txn)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--label-quaternary)] hover:text-[var(--chart-primary)] hover:bg-[var(--chart-primary)]/10 transition-all"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteClick(txn)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--label-quaternary)] hover:text-[#DC2626] hover:bg-[#DC2626]/10 transition-all"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </>
          ) : transactions.length > 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-[14px] text-[var(--label-tertiary)]">No {filterType.toLowerCase()} transactions found</p>
              <button
                onClick={() => setFilterType('ALL')}
                className="mt-2 text-[13px] font-medium hover:underline"
                style={{ color: categoryColor }}
              >
                Show all transactions
              </button>
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: `${categoryColor}15` }}
              >
                <svg className="w-7 h-7" style={{ color: categoryColor }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <h3 className="text-[16px] font-semibold text-[var(--label-primary)] mb-1">No transactions yet</h3>
              <p className="text-[13px] text-[var(--label-secondary)] mb-4">
                Record your first {isFixedIncome ? 'deposit' : 'buy or sell transaction'}
              </p>
              <Link to="/assets/add" state={{ symbol: asset.symbol, assetType: asset.asset_type, exchange: asset.exchange, category: asset.category, assetId: asset.id }}>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-white text-[13px] font-medium rounded-lg hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: categoryColor }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  {isFixedIncome ? 'Add Deposit' : 'Add Transaction'}
                </motion.button>
              </Link>
            </div>
          )}

          {/* Keyboard Shortcuts Hint */}
          {transactions.length > 0 && (
            <div className="hidden lg:flex px-5 py-2 border-t border-[var(--separator-opaque)] bg-[var(--fill-tertiary)]/30 items-center justify-center gap-6 text-[11px] text-[var(--label-quaternary)]">
              <span><kbd className="px-1.5 py-0.5 bg-[var(--bg-primary)] rounded border border-[var(--separator-opaque)] font-mono">N</kbd> New</span>
              <span><kbd className="px-1.5 py-0.5 bg-[var(--bg-primary)] rounded border border-[var(--separator-opaque)] font-mono">E</kbd> Export</span>
              <span><kbd className="px-1.5 py-0.5 bg-[var(--bg-primary)] rounded border border-[var(--separator-opaque)] font-mono">Esc</kbd> Back</span>
            </div>
          )}
        </Card>
      </motion.div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModal.show}
        onClose={() => setDeleteModal({ show: false, transaction: null })}
        title="Delete Transaction"
        size="sm"
      >
        <div className="p-5">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 rounded-full bg-[#DC2626]/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-[#DC2626]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <p className="text-[15px] text-[var(--label-primary)] mb-1">
                Are you sure you want to delete this transaction?
              </p>
              <p className="text-[13px] text-[var(--label-secondary)]">
                This will recalculate your holdings and cannot be undone.
              </p>
              {deleteModal.transaction && (
                <div className="mt-3 p-3 bg-[var(--fill-tertiary)] rounded-lg">
                  <p className="text-[12px] text-[var(--label-tertiary)]">
                    {deleteModal.transaction.type} • {formatDate(deleteModal.transaction.transaction_date)} • {formatCurrency(deleteModal.transaction.total_amount)}
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setDeleteModal({ show: false, transaction: null })}
              className="flex-1 px-4 py-2.5 bg-[var(--fill-tertiary)] hover:bg-[var(--fill-secondary)] text-[var(--label-primary)] rounded-lg text-[14px] font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="flex-1 px-4 py-2.5 bg-[#DC2626] hover:bg-[#B91C1C] text-white rounded-lg text-[14px] font-medium transition-colors disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Transaction Modal */}
      <Modal
        isOpen={editModal.show}
        onClose={() => setEditModal({ show: false, transaction: null })}
        title="Edit Transaction"
        size="sm"
      >
        <div className="p-5">
          {editModal.transaction && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <span
                  className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md text-[11px] font-bold ${
                    editModal.transaction.type === 'BUY'
                      ? 'bg-[#059669] text-white'
                      : 'bg-[#DC2626] text-white'
                  }`}
                >
                  {editModal.transaction.type}
                </span>
                <span className="text-[13px] text-[var(--label-tertiary)]">
                  {formatDate(editModal.transaction.transaction_date)}
                </span>
              </div>

              {!isFixedIncome && (
                <>
                  <div>
                    <label className="block text-[12px] font-medium text-[var(--label-secondary)] mb-1.5">
                      Quantity
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={editForm.quantity}
                      onChange={(e) => setEditForm(prev => ({ ...prev, quantity: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-[var(--fill-tertiary)] border border-[var(--separator-opaque)] rounded-lg text-[14px] text-[var(--label-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--chart-primary)]/30"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[var(--label-secondary)] mb-1.5">
                      Price
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={editForm.price}
                      onChange={(e) => setEditForm(prev => ({ ...prev, price: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-[var(--fill-tertiary)] border border-[var(--separator-opaque)] rounded-lg text-[14px] text-[var(--label-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--chart-primary)]/30"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-[12px] font-medium text-[var(--label-secondary)] mb-1.5">
                  Notes
                </label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  placeholder="Add notes..."
                  className="w-full px-3 py-2.5 bg-[var(--fill-tertiary)] border border-[var(--separator-opaque)] rounded-lg text-[14px] text-[var(--label-primary)] placeholder:text-[var(--label-quaternary)] focus:outline-none focus:ring-2 focus:ring-[var(--chart-primary)]/30 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setEditModal({ show: false, transaction: null })}
                  className="flex-1 px-4 py-2.5 bg-[var(--fill-tertiary)] hover:bg-[var(--fill-secondary)] text-[var(--label-primary)] rounded-lg text-[14px] font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditSave}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 text-white rounded-lg text-[14px] font-medium transition-colors disabled:opacity-50"
                  style={{ backgroundColor: categoryColor }}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* CSV Import Bottom Sheet */}
      {!isFixedIncome && (
        <BottomSheet
          isOpen={showCSVImport}
          onClose={() => setShowCSVImport(false)}
          title="Import Transactions from CSV"
          maxHeight="80vh"
        >
          {asset && (
            <CSVImport
              asset={asset}
              onSuccess={handleCSVImportSuccess}
              onCancel={() => setShowCSVImport(false)}
            />
          )}
        </BottomSheet>
      )}
    </div>
  );
}
