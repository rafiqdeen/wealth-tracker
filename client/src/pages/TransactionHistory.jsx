import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { transactionService } from '../services/transactions';
import { Card, Button, Skeleton, SkeletonRow, ProgressBar, BottomSheet } from '../components/apple';
import { spring, staggerContainer, staggerItem, tapScale } from '../utils/animations';
import { ANIMATION } from '../constants/theme';
import { formatCurrency, formatCompact, formatNumber, formatDate, formatPrice } from '../utils/formatting';
import { calculateFixedIncomeValue, getCompoundingFrequency } from '../utils/interest';
import { useToast } from '../context/ToastContext';
import CSVImport from '../components/CSVImport';

export default function TransactionHistory() {
  const { id } = useParams();
  const toast = useToast();
  const [asset, setAsset] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [filterType, setFilterType] = useState('ALL');
  const [sortOrder, setSortOrder] = useState('latest');

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      const response = await transactionService.getByAsset(id);
      setAsset(response.data.asset);
      setTransactions(response.data.transactions);
      setSummary(response.data.summary);
    } catch (err) {
      setError('Failed to load transaction history');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (transactionId) => {
    if (!window.confirm('Delete this transaction? This will recalculate your holdings.')) {
      return;
    }

    try {
      await transactionService.delete(transactionId);
      toast.success('Transaction deleted');
      fetchData();
    } catch (err) {
      toast.error('Failed to delete transaction');
    }
  };

  const handleCSVImportSuccess = () => {
    setShowCSVImport(false);
    fetchData();
  };

  const getGainPercent = () => {
    if (!summary?.total_invested || summary.total_invested === 0) return 0;
    return ((summary.total_realized_gain || 0) / summary.total_invested) * 100;
  };

  // Get category color for gradient
  const getCategoryColor = () => {
    // Special case: Mutual Funds are under EQUITY category but have asset_type MUTUAL_FUND
    if (asset?.category === 'EQUITY' && asset?.asset_type === 'MUTUAL_FUND') {
      return '#8B5CF6'; // Purple for Mutual Funds
    }

    const colors = {
      'EQUITY': '#4F7DF3',      // Blue for stocks
      'FIXED_INCOME': '#22C55E', // Green
      'REAL_ESTATE': '#F59E0B', // Amber
      'GOLD': '#F97316',        // Orange
      'SAVINGS': '#14B8A6',     // Teal
      'CRYPTO': '#6366F1',      // Indigo
      'INSURANCE': '#EC4899',   // Pink
    };
    return colors[asset?.category] || '#4F7DF3';
  };

  // Filter and sort transactions
  const filteredTransactions = useMemo(() => {
    let result = [...transactions];

    // Filter by type
    if (filterType !== 'ALL') {
      result = result.filter(txn => txn.type === filterType);
    }

    // Sort
    result.sort((a, b) => {
      const dateA = new Date(a.transaction_date);
      const dateB = new Date(b.transaction_date);
      return sortOrder === 'latest' ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [transactions, filterType, sortOrder]);

  if (loading) {
    return (
      <div className="p-4 md:px-12 md:py-6 h-full overflow-auto">
        <Card padding="p-0" className="overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--separator-opaque)]">
            <Skeleton width="250px" height="1.5rem" rounded="md" className="mb-2" />
            <Skeleton width="180px" height="0.875rem" rounded="sm" />
          </div>
          <div className="px-5 py-3 border-b border-[var(--separator-opaque)] flex gap-6">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i}>
                <Skeleton width="60px" height="0.625rem" rounded="sm" className="mb-1" />
                <Skeleton width="80px" height="1.25rem" rounded="md" />
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-b border-[var(--separator-opaque)]">
            <Skeleton width="200px" height="2rem" rounded="lg" />
          </div>
          {[1, 2, 3, 4, 5, 6].map(i => (
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

  const gainPercent = getGainPercent();
  const isFixedIncome = asset?.category === 'FIXED_INCOME';
  const categoryColor = getCategoryColor();

  // Calculate interest for Fixed Income assets
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
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to Assets
                </Link>
                <h1 className="text-[20px] font-bold text-[var(--label-primary)]">
                  {asset.name}
                </h1>
                <p className="text-[13px] text-[var(--label-secondary)] mt-0.5">
                  {asset.symbol && !isFixedIncome ? `${asset.symbol} • ` : ''}
                  {isFixedIncome ? 'Deposit History' : 'Transaction History'}
                  {isFixedIncome && asset.institution ? ` • ${asset.institution}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
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

          {/* Compact Stats Strip */}
          <div className="px-5 py-3 border-b border-[var(--separator-opaque)] bg-[var(--fill-tertiary)]/30">
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              <div>
                <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wider font-medium">
                  {isFixedIncome ? 'Current Value' : 'Holdings'}
                </p>
                <p className="text-[17px] font-bold text-[var(--label-primary)] tabular-nums">
                  {isFixedIncome
                    ? formatCurrency(interestCalc?.currentValue || summary?.total_invested || 0)
                    : formatNumber(summary?.current_quantity || 0)}
                  {!isFixedIncome && <span className="text-[12px] font-medium text-[var(--label-tertiary)] ml-1">units</span>}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wider font-medium">
                  {isFixedIncome ? 'Deposited' : 'Avg Price'}
                </p>
                <p className="text-[17px] font-bold text-[var(--label-primary)] tabular-nums">
                  {isFixedIncome
                    ? formatCompact(interestCalc?.principal || summary?.total_invested || 0)
                    : formatPrice(summary?.avg_buy_price)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wider font-medium">
                  {isFixedIncome ? 'Interest' : 'Invested'}
                </p>
                <p className={`text-[17px] font-bold tabular-nums ${isFixedIncome ? 'text-[#059669]' : 'text-[var(--label-primary)]'}`}>
                  {isFixedIncome
                    ? `+${formatCompact(interestCalc?.interest || 0)}`
                    : formatCompact(summary?.total_invested)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wider font-medium">
                  {isFixedIncome ? 'Return' : 'Realized P&L'}
                </p>
                <p className={`text-[17px] font-bold tabular-nums ${
                  (isFixedIncome ? (interestCalc?.interestPercent || 0) : (summary?.total_realized_gain || 0)) >= 0
                    ? 'text-[#059669]'
                    : 'text-[#DC2626]'
                }`}>
                  {isFixedIncome
                    ? `+${(interestCalc?.interestPercent || 0).toFixed(1)}%`
                    : `${(summary?.total_realized_gain || 0) >= 0 ? '+' : ''}${formatCompact(summary?.total_realized_gain || 0)}`}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wider font-medium">Transactions</p>
                <p className="text-[17px] font-bold text-[var(--label-primary)] tabular-nums">{transactions.length}</p>
              </div>
            </div>
          </div>

          {/* Filter/Sort Row */}
          {transactions.length > 0 && (
            <div className="px-5 py-2.5 border-b border-[var(--separator-opaque)] flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-[var(--label-tertiary)]">Filter:</span>
                <div className="flex gap-1">
                  {['ALL', 'BUY', 'SELL'].map((type) => (
                    <button
                      key={type}
                      onClick={() => setFilterType(type)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                        filterType === type
                          ? type === 'BUY'
                            ? 'bg-[#059669]/15 text-[#059669]'
                            : type === 'SELL'
                              ? 'bg-[#DC2626]/15 text-[#DC2626]'
                              : 'bg-[var(--fill-secondary)] text-[var(--label-primary)]'
                          : 'text-[var(--label-tertiary)] hover:bg-[var(--fill-tertiary)]'
                      }`}
                    >
                      {type === 'ALL' ? 'All' : type}
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

          {/* Enhanced Table */}
          {filteredTransactions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-[var(--fill-tertiary)]/50">
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
                    <th className="px-5 py-2.5 w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--separator-opaque)]">
                  <AnimatePresence>
                    {filteredTransactions.map((txn, index) => (
                      <motion.tr
                        key={txn.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ ...spring.snappy, delay: Math.min(index * ANIMATION.STAGGER_DELAY, ANIMATION.STAGGER_DELAY_MAX) }}
                        className="group hover:bg-[var(--fill-tertiary)]/40 transition-colors"
                      >
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span className="text-[13px] font-medium text-[var(--label-primary)] tabular-nums">
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
                            <span className="ml-2 text-[10px] text-[var(--label-quaternary)]">Initial</span>
                          )}
                        </td>
                        {!isFixedIncome && (
                          <td className="px-5 py-3.5 whitespace-nowrap text-right">
                            <span className="text-[14px] font-semibold text-[var(--label-primary)] tabular-nums">
                              {formatNumber(txn.quantity)}
                            </span>
                          </td>
                        )}
                        {!isFixedIncome && (
                          <td className="px-5 py-3.5 whitespace-nowrap text-right">
                            <span className="text-[13px] text-[var(--label-secondary)] tabular-nums">
                              {formatPrice(txn.price)}
                            </span>
                          </td>
                        )}
                        <td className="px-5 py-3.5 whitespace-nowrap text-right">
                          <span className="text-[14px] font-bold text-[var(--label-primary)] tabular-nums">
                            {formatCurrency(txn.total_amount)}
                          </span>
                        </td>
                        {!isFixedIncome && (
                          <td className="px-5 py-3.5 whitespace-nowrap text-right">
                            {txn.type === 'SELL' && txn.realized_gain !== null ? (
                              <span className={`text-[13px] font-semibold tabular-nums ${txn.realized_gain >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                                {txn.realized_gain >= 0 ? '+' : ''}{formatCurrency(txn.realized_gain)}
                              </span>
                            ) : (
                              <span className="text-[var(--label-quaternary)]">—</span>
                            )}
                          </td>
                        )}
                        <td className="px-5 py-3.5 max-w-[180px]">
                          <span className="text-[12px] text-[var(--label-tertiary)] truncate block">
                            {txn.notes || <span className="text-[var(--label-quaternary)]">—</span>}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleDelete(txn.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--label-quaternary)] opacity-0 group-hover:opacity-100 hover:text-[#DC2626] hover:bg-[#DC2626]/10 transition-all"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </motion.button>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
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
        </Card>
      </motion.div>

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
