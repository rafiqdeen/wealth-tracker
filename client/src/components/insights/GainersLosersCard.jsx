import { useState } from 'react';
import { motion } from 'framer-motion';
import { formatCompact } from '../../utils/formatting';

function formatHoldingPeriod(years) {
  if (years === null || years === undefined) return null;
  if (years < 0.08) return `${Math.round(years * 365)} days`;
  if (years < 1) return `${(years * 12).toFixed(1)} months`;
  return `${years.toFixed(1)} years`;
}

function AssetTypeBadge({ type }) {
  const labels = {
    'STOCK': 'Stock', 'MUTUAL_FUND': 'MF', 'ETF': 'ETF', 'FD': 'FD',
    'PPF': 'PPF', 'EPF': 'EPF', 'RD': 'RD', 'GOLD': 'Gold', 'SILVER': 'Silver',
    'CRYPTOCURRENCY': 'Crypto', 'LAND': 'Land', 'PROPERTY': 'Property',
    'SAVINGS_ACCOUNT': 'Savings', 'LIC': 'LIC', 'NPS': 'NPS',
  };
  const label = labels[type] || type?.replace(/_/g, ' ') || '';
  return (
    <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-[var(--fill-tertiary)] text-[var(--label-tertiary)] uppercase tracking-wide shrink-0">
      {label}
    </span>
  );
}

function PerformerRow({ item, index, isGain }) {
  const color = isGain ? '#10B981' : '#EF4444';
  const holding = formatHoldingPeriod(item.holdingYears);

  return (
    <div className="flex items-start gap-2.5 p-2.5 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/40">
      <span className="text-[12px] font-bold text-[var(--label-tertiary)] tabular-nums mt-0.5 w-5 shrink-0 text-center">{index + 1}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5 gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-[13px] font-medium text-[var(--label-primary)] truncate">{item.asset.name}</p>
            <AssetTypeBadge type={item.asset.asset_type} />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <p className="text-[13px] font-bold tabular-nums" style={{ color }}>
              {isGain ? '+' : ''}{item.returnPercent.toFixed(1)}%
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {holding && <p className="text-[10px] text-[var(--label-tertiary)]">Held {holding}</p>}
          </div>
          <p className="text-[11px] tabular-nums" style={{ color: `${color}99` }}>
            {isGain ? '+' : ''}{formatCompact(item.returnAmount)}
          </p>
        </div>
        <div className="mt-1.5 h-1.5 bg-[var(--fill-tertiary)] rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: color }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(Math.abs(item.returnPercent), 100)}%` }}
            transition={{ duration: 0.5, delay: index * 0.08 }}
          />
        </div>
      </div>
    </div>
  );
}

export default function GainersLosersCard({ assetsWithReturns, topPerformers, assetsInLoss }) {
  const [showAllGainers, setShowAllGainers] = useState(false);
  const [showAllLosers, setShowAllLosers] = useState(false);

  const gainers = topPerformers.filter(a => a.returnPercent > 0);
  const losers = [...assetsWithReturns].filter(a => a.returnPercent < 0).sort((a, b) => a.returnPercent - b.returnPercent);
  const displayGainers = showAllGainers ? gainers : gainers.slice(0, 3);
  const displayLosers = showAllLosers ? losers : losers.slice(0, 3);
  const topGainer = gainers[0];

  if (assetsWithReturns.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--fill-quaternary)] flex items-center justify-center">
          <svg className="w-8 h-8 text-[var(--label-quaternary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
          </svg>
        </div>
        <p className="text-[14px] font-medium text-[var(--label-secondary)] mb-1">No Performance Data</p>
        <p className="text-[12px] text-[var(--label-tertiary)]">Add assets to see top performers</p>
      </div>
    );
  }

  return (
    <div>
      {/* Title */}
      <div className="mb-6">
        <h2 className="text-[18px] font-bold text-[var(--label-primary)]">Gainers & Losers</h2>
        <p className="text-[13px] text-[var(--label-tertiary)] mt-0.5">Best and worst performing assets</p>
      </div>

      {/* Hero: Featured Top Gainer */}
      {topGainer && (
        <div className="mb-6 p-5 bg-gradient-to-br from-[#10B981]/10 to-[#059669]/5 border border-[#10B981]/20 rounded-2xl">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-[#10B981]/15 flex items-center justify-center">
              <svg className="w-4 h-4 text-[#10B981]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
              </svg>
            </div>
            <span className="text-[12px] font-semibold text-[#10B981] uppercase tracking-wide">Top Performer</span>
            <AssetTypeBadge type={topGainer.asset.asset_type} />
          </div>
          <p className="text-[16px] font-semibold text-[var(--label-primary)] mb-1">{topGainer.asset.name}</p>
          <div className="flex items-baseline gap-3">
            <p className="text-[36px] font-bold text-[#10B981] tabular-nums leading-none">
              +{topGainer.returnPercent.toFixed(1)}%
            </p>
            <p className="text-[14px] text-[#10B981]/70 tabular-nums">
              +{formatCompact(topGainer.returnAmount)}
            </p>
          </div>
          {topGainer.holdingYears && (
            <p className="text-[12px] text-[var(--label-tertiary)] mt-2">
              Held for {formatHoldingPeriod(topGainer.holdingYears)}
            </p>
          )}
        </div>
      )}

      {/* Grid: 2 columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Top Gainers */}
        {gainers.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-md bg-[#10B981]/15 flex items-center justify-center">
                <svg className="w-3 h-3 text-[#10B981]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                </svg>
              </div>
              <h4 className="text-[13px] font-semibold text-[#10B981] uppercase tracking-wide">Top Gainers</h4>
            </div>
            <div className="space-y-2">
              {displayGainers.map((item, index) => (
                <PerformerRow key={item.asset.id} item={item} index={index} isGain={true} />
              ))}
            </div>
            {gainers.length > 3 && (
              <button
                onClick={() => setShowAllGainers(!showAllGainers)}
                className="mt-2 text-[12px] font-medium text-[#10B981] hover:text-[#059669] transition-colors"
              >
                {showAllGainers ? 'Show less' : `See all ${gainers.length} gainers`}
              </button>
            )}
          </div>
        )}

        {/* Right: Top Losers */}
        {losers.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-md bg-[#EF4444]/15 flex items-center justify-center">
                <svg className="w-3 h-3 text-[#EF4444]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                </svg>
              </div>
              <h4 className="text-[13px] font-semibold text-[#EF4444] uppercase tracking-wide">Top Losers</h4>
            </div>
            <div className="space-y-2">
              {displayLosers.map((item, index) => (
                <PerformerRow key={item.asset.id} item={item} index={index} isGain={false} />
              ))}
            </div>
            {losers.length > 3 && (
              <button
                onClick={() => setShowAllLosers(!showAllLosers)}
                className="mt-2 text-[12px] font-medium text-[#EF4444] hover:text-[#DC2626] transition-colors"
              >
                {showAllLosers ? 'Show less' : `See all ${losers.length} losers`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
