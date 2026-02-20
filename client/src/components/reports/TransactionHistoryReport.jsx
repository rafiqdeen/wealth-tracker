import { useState } from 'react';
import { motion } from 'framer-motion';
import { formatCurrency, formatCompact } from '../../utils/formatting';

export default function TransactionHistoryReport({ transactions, summary, loading }) {
  const [showAll, setShowAll] = useState(false);

  if (loading) {
    return (
      <div className="py-16 flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[var(--chart-primary)] border-t-transparent rounded-full animate-spin" />
        <p className="text-[14px] text-[var(--label-tertiary)]">Loading transactions...</p>
      </div>
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--fill-quaternary)] flex items-center justify-center">
          <svg className="w-8 h-8 text-[var(--label-quaternary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-[15px] font-medium text-[var(--label-secondary)] mb-1">No Transactions</p>
        <p className="text-[13px] text-[var(--label-tertiary)]">Add transactions to see your history</p>
      </div>
    );
  }

  const displayTransactions = showAll ? transactions : transactions.slice(0, 20);

  return (
    <div>
      {/* Hero: Stat Blocks 2x2 */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="p-3.5 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/60">
          <p className="text-[12px] text-[var(--label-tertiary)] font-medium uppercase tracking-wide mb-1">Total Transactions</p>
          <p className="text-[22px] font-bold text-[var(--label-primary)] tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{summary?.totalTransactions || 0}</p>
        </div>
        <div className="p-3.5 bg-[var(--system-green)]/8 border border-[var(--system-green)]/15 rounded-xl">
          <p className="text-[12px] text-[var(--system-green)] font-medium uppercase tracking-wide mb-1">Total Buys</p>
          <p className="text-[20px] font-bold text-[var(--label-primary)] tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{formatCompact(summary?.totalBuys || 0)}</p>
        </div>
        <div className="p-3.5 bg-[var(--system-red)]/8 border border-[var(--system-red)]/15 rounded-xl">
          <p className="text-[12px] text-[var(--system-red)] font-medium uppercase tracking-wide mb-1">Total Sells</p>
          <p className="text-[20px] font-bold text-[var(--label-primary)] tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{formatCompact(summary?.totalSells || 0)}</p>
        </div>
        <div className="p-3.5 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/60">
          <p className="text-[12px] text-[var(--label-tertiary)] font-medium uppercase tracking-wide mb-1">Net Flow</p>
          <p className="text-[20px] font-bold text-[var(--label-primary)] tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{formatCompact(summary?.netFlow || 0)}</p>
        </div>
      </div>

      {/* Recent Transactions */}
      <div>
        <h4 className="text-[14px] font-semibold text-[var(--label-secondary)] uppercase tracking-wide mb-3">Recent Transactions</h4>
        {/* Table header */}
        <div className="flex items-center gap-2 px-2 pb-2 border-b border-[var(--separator-opaque)] text-[11px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wide">
          <span className="w-20 shrink-0">Date</span>
          <span className="flex-1 min-w-0">Asset</span>
          <span className="w-14 text-center shrink-0">Type</span>
          <span className="w-20 text-right shrink-0">Amount</span>
        </div>
        <div className="space-y-0.5 mt-1">
          {displayTransactions.map((txn, idx) => (
            <div key={idx} className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-[var(--fill-quaternary)] transition-colors">
              <span className="w-20 text-[12px] text-[var(--label-tertiary)] tabular-nums shrink-0">
                {new Date(txn.transaction_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
              <div className="flex-1 min-w-0 flex items-center gap-1.5">
                <span className="text-[13px] font-medium text-[var(--label-primary)] truncate">{txn.assetName}</span>
                <span className="px-1.5 py-0.5 text-[8px] font-semibold rounded bg-[var(--fill-tertiary)] text-[var(--label-tertiary)] uppercase shrink-0">
                  {txn.assetType}
                </span>
              </div>
              <span className="w-14 text-center shrink-0">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                  txn.type === 'BUY' ? 'bg-[var(--system-green)]/10 text-[var(--system-green)]' : 'bg-[var(--system-red)]/10 text-[var(--system-red)]'
                }`}>
                  {txn.type}
                </span>
              </span>
              <span className="w-20 text-right text-[13px] font-semibold text-[var(--label-primary)] tabular-nums shrink-0">
                {formatCompact(txn.total_amount || 0)}
              </span>
            </div>
          ))}
        </div>
        {transactions.length > 20 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="mt-2 text-[13px] font-medium text-[var(--system-blue)] hover:text-[var(--system-blue)]/80 transition-colors"
          >
            {showAll ? 'Show less' : `Show all ${transactions.length} transactions`}
          </button>
        )}
      </div>

      {/* Info callout for large lists */}
      {transactions.length > 50 && (
        <div className="mt-4 p-3 bg-[var(--fill-quaternary)] rounded-xl">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-[var(--label-quaternary)] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <p className="text-[12px] text-[var(--label-quaternary)] leading-relaxed">
              Export to CSV for the complete transaction history with all {transactions.length} entries
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
