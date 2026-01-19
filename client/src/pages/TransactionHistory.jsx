import { useState, useEffect } from 'react';
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)]">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="mb-6">
            <Skeleton width="60px" height="1rem" rounded="sm" className="mb-3" />
            <Skeleton width="200px" height="2rem" rounded="md" className="mb-2" />
            <Skeleton width="150px" height="1rem" rounded="sm" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-[var(--bg-primary)] rounded-2xl border border-[var(--separator)]/10 p-5">
                <Skeleton width="80px" height="0.625rem" rounded="sm" className="mb-2" />
                <Skeleton width="100px" height="1.5rem" rounded="md" />
              </div>
            ))}
          </div>
          <div className="bg-[var(--bg-primary)] rounded-2xl border border-[var(--separator)]/10">
            <div className="px-5 py-4 border-b border-[var(--separator)]/30">
              <Skeleton width="150px" height="1.25rem" rounded="md" />
            </div>
            {[1, 2, 3, 4, 5].map(i => (
              <SkeletonRow key={i} columns={6} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !asset) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)]">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring.gentle}
          >
            <div className="bg-[var(--system-red)]/10 text-[var(--system-red)] px-6 py-4 rounded-2xl text-[15px]">
              {error || 'Asset not found'}
            </div>
            <Link
              to="/assets"
              className="mt-6 inline-flex items-center gap-2 text-[var(--system-blue)] text-[15px]"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Assets
            </Link>
          </motion.div>
        </div>
      </div>
    );
  }

  const gainPercent = getGainPercent();
  const isFixedIncome = asset?.category === 'FIXED_INCOME';

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
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      <div className="max-w-6xl mx-auto px-4 py-6">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.gentle}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6"
        >
          <div>
            <Link
              to="/assets"
              className="inline-flex items-center gap-1 text-[15px] text-[var(--system-blue)] mb-3"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Assets
            </Link>
            <h1 className="text-[28px] font-semibold text-[var(--label-primary)]">
              {isFixedIncome ? 'Deposit History' : 'Transaction History'}
            </h1>
            <p className="text-[15px] text-[var(--label-secondary)] mt-0.5">
              {asset.name}{asset.symbol && !isFixedIncome ? ` • ${asset.symbol}` : ''}
              {isFixedIncome && asset.institution ? ` • ${asset.institution}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* CSV Import Button - Only for Equity */}
            {!isFixedIncome && (
              <Button
                variant="gray"
                onClick={() => setShowCSVImport(true)}
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                }
              >
                <span className="hidden sm:inline">Import CSV</span>
              </Button>
            )}
            <Link to="/assets/add" state={{
              symbol: asset.symbol,
              assetType: asset.asset_type,
              exchange: asset.exchange,
              category: asset.category,
              assetId: asset.id
            }}>
              <Button
                variant="filled"
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                }
              >
                {isFixedIncome ? 'Add Deposit' : 'Add Transaction'}
              </Button>
            </Link>
          </div>
        </motion.div>

        {/* Summary Cards */}
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
        >
          {/* Holdings Card */}
          <motion.div variants={staggerItem} className="col-span-2">
            <Card padding="p-5" hoverable>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[13px] font-medium text-[var(--label-tertiary)] uppercase tracking-wide">
                    {isFixedIncome ? 'Current Value' : 'Current Holdings'}
                  </p>
                  <p className="text-[34px] font-semibold text-[var(--label-primary)] tracking-tight">
                    {isFixedIncome
                      ? formatCurrency(interestCalc?.currentValue || summary?.total_invested || 0)
                      : formatNumber(summary?.current_quantity || 0)}
                  </p>
                  {!isFixedIncome && <p className="text-[13px] text-[var(--label-tertiary)]">units</p>}
                  {isFixedIncome && interestCalc && (
                    <p className="text-[13px] text-[var(--system-green)]">
                      includes ₹{formatCompact(interestCalc.interest)} interest
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-medium text-[var(--label-tertiary)] uppercase tracking-wide">
                    {isFixedIncome ? 'Total Deposited' : 'Avg Buy Price'}
                  </p>
                  <p className="text-[20px] font-semibold text-[var(--label-primary)]">
                    {isFixedIncome ? formatCurrency(interestCalc?.principal || summary?.total_invested || 0) : formatPrice(summary?.avg_buy_price)}
                  </p>
                  {isFixedIncome && (
                    <p className="text-[13px] text-[var(--label-tertiary)]">{transactions.length} deposits</p>
                  )}
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Interest Earned Card (for Fixed Income) / Invested Card (for Equity) */}
          <motion.div variants={staggerItem}>
            <Card padding="p-5" className="h-full" hoverable>
              <p className="text-[11px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider mb-2">
                {isFixedIncome ? 'Interest Earned' : 'Total Invested'}
              </p>
              <p className={`text-[22px] font-semibold ${isFixedIncome ? 'text-[var(--system-green)]' : 'text-[var(--label-primary)]'}`}>
                {isFixedIncome
                  ? `+${formatCompact(interestCalc?.interest || 0)}`
                  : formatCompact(summary?.total_invested)}
              </p>
              {isFixedIncome && interestCalc && (
                <p className="text-[13px] text-[var(--system-green)]">+{interestCalc.interestPercent.toFixed(1)}%</p>
              )}
            </Card>
          </motion.div>

          {/* Realized Gain Card / Interest Rate Card */}
          <motion.div variants={staggerItem}>
            {isFixedIncome ? (
              <Card padding="p-5" className="h-full bg-[var(--system-blue)]">
                <p className="text-[11px] font-semibold text-white/80 uppercase tracking-wider mb-2">Interest Rate</p>
                <p className="text-[22px] font-semibold text-white">{asset?.interest_rate || 7.1}% p.a.</p>
                <p className="text-[13px] text-white/70">Compounded annually</p>
              </Card>
            ) : (
              <Card
                padding="p-5"
                className={`h-full ${
                  (summary?.total_realized_gain || 0) >= 0
                    ? 'bg-[var(--system-green)]'
                    : 'bg-[var(--system-amber)]'
                }`}
              >
                <p className="text-[11px] font-semibold text-white/80 uppercase tracking-wider mb-2">Realized P&L</p>
                <p className="text-[22px] font-semibold text-white">
                  {(summary?.total_realized_gain || 0) >= 0 ? '+' : ''}{formatCompact(summary?.total_realized_gain || 0)}
                </p>
              </Card>
            )}
          </motion.div>
        </motion.div>

        {/* Stats Row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.2 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6"
        >
          <Card padding="p-4" hoverable>
            <p className="text-[11px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider mb-1">
              {isFixedIncome ? 'Start Date' : 'Total Bought'}
            </p>
            <p className="text-[17px] font-semibold text-[var(--label-primary)]">
              {isFixedIncome
                ? (asset?.start_date ? formatDate(asset.start_date) : formatDate(transactions[transactions.length - 1]?.transaction_date))
                : formatNumber(summary?.total_bought || 0)}
            </p>
            {!isFixedIncome && <p className="text-[11px] text-[var(--label-tertiary)]">units</p>}
          </Card>
          <Card padding="p-4" hoverable>
            <p className="text-[11px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider mb-1">
              {isFixedIncome ? 'Maturity Date' : 'Total Sold'}
            </p>
            <p className="text-[17px] font-semibold text-[var(--label-primary)]">
              {isFixedIncome
                ? (asset?.maturity_date ? formatDate(asset.maturity_date) : '—')
                : formatNumber(summary?.total_sold || 0)}
            </p>
            {!isFixedIncome && <p className="text-[11px] text-[var(--label-tertiary)]">units</p>}
          </Card>
          <Card padding="p-4" hoverable>
            <p className="text-[11px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider mb-1">
              {isFixedIncome ? 'Deposits' : 'Transactions'}
            </p>
            <p className="text-[17px] font-semibold text-[var(--label-primary)]">{transactions.length}</p>
            <p className="text-[11px] text-[var(--label-tertiary)]">total</p>
          </Card>
          <Card padding="p-4" hoverable>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider mb-1">
                  {isFixedIncome ? 'Total Return' : 'Return'}
                </p>
                <p className={`text-[17px] font-semibold text-[var(--system-green)]`}>
                  {isFixedIncome
                    ? `+${(interestCalc?.interestPercent || 0).toFixed(1)}%`
                    : `${gainPercent >= 0 ? '+' : ''}${gainPercent.toFixed(1)}%`}
                </p>
              </div>
              {(isFixedIncome ? interestCalc?.principal : summary?.total_invested) > 0 && (
                <div className="w-12">
                  <ProgressBar
                    value={Math.min(Math.abs(isFixedIncome ? interestCalc?.interestPercent || 0 : gainPercent), 100)}
                    max={100}
                    color="var(--system-green)"
                    height={4}
                  />
                </div>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Transactions List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.3 }}
        >
          <Card padding="p-0">
            <div className="px-5 py-4 border-b border-[var(--separator)]/30">
              <h2 className="text-[17px] font-semibold text-[var(--label-primary)]">All Transactions</h2>
              <p className="text-[13px] text-[var(--label-tertiary)] mt-0.5">{transactions.length} transaction{transactions.length !== 1 ? 's' : ''}</p>
            </div>

            {transactions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-[var(--fill-tertiary)]/50">
                      <th className="px-5 py-3 text-left text-[12px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider">Date</th>
                      <th className="px-5 py-3 text-left text-[12px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider">Type</th>
                      {!isFixedIncome && (
                        <th className="px-5 py-3 text-right text-[12px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider">Qty</th>
                      )}
                      {!isFixedIncome && (
                        <th className="px-5 py-3 text-right text-[12px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider">Price</th>
                      )}
                      <th className="px-5 py-3 text-right text-[12px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider">
                        {isFixedIncome ? 'Amount' : 'Total'}
                      </th>
                      {!isFixedIncome && (
                        <th className="px-5 py-3 text-right text-[12px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider">Gain/Loss</th>
                      )}
                      <th className="px-5 py-3 text-left text-[12px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider">Notes</th>
                      <th className="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--separator)]/30">
                    <AnimatePresence>
                      {transactions.map((txn, index) => (
                        <motion.tr
                          key={txn.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ ...spring.snappy, delay: Math.min(index * ANIMATION.STAGGER_DELAY, ANIMATION.STAGGER_DELAY_MAX) }}
                          className="hover:bg-[var(--fill-tertiary)]/30 transition-colors"
                        >
                          <td className="px-5 py-3.5 whitespace-nowrap text-[13px] text-[var(--label-primary)] font-medium">
                            {formatDate(txn.transaction_date)}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                              txn.type === 'BUY'
                                ? 'bg-[var(--system-green)]/10 text-[var(--system-green)]'
                                : 'bg-[var(--system-orange)]/10 text-[var(--system-orange)]'
                            }`}>
                              {isFixedIncome ? 'DEPOSIT' : txn.type}
                            </span>
                            {txn.is_initial_holding === 1 && (
                              <span className="ml-2 text-[11px] text-[var(--label-tertiary)]">(Initial)</span>
                            )}
                          </td>
                          {!isFixedIncome && (
                            <td className="px-5 py-3.5 whitespace-nowrap text-[13px] text-[var(--label-primary)] text-right font-medium">
                              {formatNumber(txn.quantity)}
                            </td>
                          )}
                          {!isFixedIncome && (
                            <td className="px-5 py-3.5 whitespace-nowrap text-[13px] text-[var(--label-secondary)] text-right">
                              {formatPrice(txn.price)}
                            </td>
                          )}
                          <td className="px-5 py-3.5 whitespace-nowrap text-[13px] font-semibold text-[var(--label-primary)] text-right">
                            {formatCurrency(txn.total_amount)}
                          </td>
                          {!isFixedIncome && (
                            <td className="px-5 py-3.5 whitespace-nowrap text-[13px] text-right">
                              {txn.type === 'SELL' && txn.realized_gain !== null ? (
                                <span className={`font-semibold ${txn.realized_gain >= 0 ? 'text-[var(--system-green)]' : 'text-[var(--system-amber)]'}`}>
                                  {txn.realized_gain >= 0 ? '+' : ''}{formatCurrency(txn.realized_gain)}
                                </span>
                              ) : (
                                <span className="text-[var(--label-quaternary)]">—</span>
                              )}
                            </td>
                          )}
                          <td className="px-5 py-3.5 text-[13px] text-[var(--label-tertiary)] max-w-[150px] truncate">
                            {txn.notes || <span className="text-[var(--label-quaternary)]">—</span>}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-right">
                            <motion.button
                              whileTap={tapScale}
                              onClick={() => handleDelete(txn.id)}
                              className="text-[var(--label-tertiary)] hover:text-[var(--system-red)] transition-colors p-2 rounded-lg hover:bg-[var(--system-red)]/10"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </motion.button>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-6 py-16 text-center">
                <div className="w-16 h-16 bg-[var(--fill-tertiary)] rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-[var(--label-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <h3 className="text-[17px] font-semibold text-[var(--label-primary)] mb-1">No transactions yet</h3>
                <p className="text-[15px] text-[var(--label-secondary)] mb-6">Record your first buy or sell transaction</p>
                <Link to="/assets/add" state={{ symbol: asset.symbol, assetType: asset.asset_type, exchange: asset.exchange }}>
                  <Button
                    variant="filled"
                    icon={
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    }
                  >
                    Add Transaction
                  </Button>
                </Link>
              </div>
            )}
          </Card>
        </motion.div>
      </div>

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
