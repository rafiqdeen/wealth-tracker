import { useState } from 'react';
import { motion } from 'framer-motion';
import { formatCurrency, formatCompact } from '../../utils/formatting';
import AssetTypeBadge from '../shared/AssetTypeBadge';

function PerformerRow({ item, index, isGain, maxPercent }) {
  const color = isGain ? 'var(--system-green)' : 'var(--system-red)';
  return (
    <div className="flex items-start gap-2.5 p-2.5 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/40">
      <span className="text-[13px] font-bold text-[var(--label-tertiary)] tabular-nums mt-0.5 w-5 shrink-0 text-center">{index + 1}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5 gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-[14px] font-medium text-[var(--label-primary)] truncate">{item.name}</p>
            <AssetTypeBadge type={item.asset_type} />
          </div>
          <p className="text-[14px] font-bold tabular-nums shrink-0" style={{ color }}>
            {isGain ? '+' : ''}{(item.gainPercent || 0).toFixed(1)}%
          </p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-[var(--label-tertiary)] tabular-nums">{formatCompact(item.currentValue)}</p>
          <p className="text-[12px] tabular-nums" style={{ color: `${color}99` }}>
            {isGain ? '+' : ''}{formatCompact(item.gain)}
          </p>
        </div>
        <div className="mt-1.5 h-1.5 bg-[var(--fill-tertiary)] rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: color }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(Math.abs(item.gainPercent || 0) / (maxPercent || 1) * 100, 100)}%` }}
            transition={{ duration: 0.5, delay: index * 0.08 }}
          />
        </div>
      </div>
    </div>
  );
}

const categoryColors = {
  EQUITY: 'var(--chart-primary)', FIXED_INCOME: 'var(--system-green)', PHYSICAL: 'var(--system-amber)',
  REAL_ESTATE: 'var(--system-red)', OTHER: '#6B7280', INSURANCE: 'var(--chart-primary)',
};

export default function PerformanceReport({
  totalInvested, totalCurrentValue, totalGain, totalGainPercent,
  topPerformers, bottomPerformers, categoryPerformance,
  assetCount,
}) {
  const [showAllGainers, setShowAllGainers] = useState(false);
  const [showAllLosers, setShowAllLosers] = useState(false);

  if (assetCount === 0) {
    return (
      <div className="py-16 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--fill-quaternary)] flex items-center justify-center">
          <svg className="w-8 h-8 text-[var(--label-quaternary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
          </svg>
        </div>
        <p className="text-[15px] font-medium text-[var(--label-secondary)] mb-1">No Performance Data</p>
        <p className="text-[13px] text-[var(--label-tertiary)]">Add assets to see performance analysis</p>
      </div>
    );
  }

  const topGainer = (topPerformers || [])[0];
  const gainers = (topPerformers || []).filter(a => (a.gainPercent || 0) > 0);
  const losers = (bottomPerformers || []).filter(a => (a.gainPercent || 0) < 0);
  const displayGainers = showAllGainers ? gainers : gainers.slice(0, 5);
  const displayLosers = showAllLosers ? losers : losers.slice(0, 5);
  const maxGainPercent = Math.max(...gainers.map(a => Math.abs(a.gainPercent || 0)), 1);
  const maxLossPercent = Math.max(...losers.map(a => Math.abs(a.gainPercent || 0)), 1);

  // Category performance entries
  const catEntries = Object.entries(categoryPerformance || {}).map(([category, data]) => {
    const gainPercent = data.invested > 0 ? ((data.current - data.invested) / data.invested) * 100 : 0;
    const maxVal = Math.max(data.invested, data.current);
    return { category, ...data, gainPercent, label: category.replace(/_/g, ' '), color: categoryColors[category] || '#6B7280', maxVal };
  });
  const catMaxValue = Math.max(...catEntries.map(c => c.maxVal), 1);

  return (
    <div>
      {/* Hero: Top Performer */}
      {topGainer && (topGainer.gainPercent || 0) > 0 && (
        <div className="mb-6 p-5 bg-gradient-to-br from-[var(--system-purple)]/10 to-[var(--system-purple)]/5 border border-[var(--system-purple)]/20 rounded-2xl">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-[var(--system-purple)]/15 flex items-center justify-center">
              <svg className="w-4 h-4 text-[var(--system-purple)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
              </svg>
            </div>
            <span className="text-[13px] font-semibold text-[var(--system-purple)] uppercase tracking-wide">Top Performer</span>
            <AssetTypeBadge type={topGainer.asset_type} />
          </div>
          <p className="text-[16px] font-semibold text-[var(--label-primary)] mb-1">{topGainer.name}</p>
          <div className="flex items-baseline gap-3">
            <p className="text-[36px] font-bold text-[var(--system-purple)] tabular-nums leading-none" style={{ fontFamily: 'var(--font-display)' }}>
              +{(topGainer.gainPercent || 0).toFixed(1)}%
            </p>
            <p className="text-[15px] text-[var(--system-purple)]/70 tabular-nums">
              +{formatCompact(topGainer.gain)}
            </p>
          </div>
        </div>
      )}

      {/* 2-col grid: Gainers & Losers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Top Gainers */}
        {gainers.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-md bg-[var(--system-green)]/15 flex items-center justify-center">
                <svg className="w-3 h-3 text-[var(--system-green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                </svg>
              </div>
              <h4 className="text-[14px] font-semibold text-[var(--system-green)] uppercase tracking-wide">Top Gainers</h4>
            </div>
            <div className="space-y-2">
              {displayGainers.map((item, index) => (
                <PerformerRow key={item.id || index} item={item} index={index} isGain={true} maxPercent={maxGainPercent} />
              ))}
            </div>
            {gainers.length > 5 && (
              <button
                onClick={() => setShowAllGainers(!showAllGainers)}
                className="mt-2 text-[13px] font-medium text-[var(--system-green)] hover:text-[var(--system-green)] transition-colors"
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
              <div className="w-5 h-5 rounded-md bg-[var(--system-red)]/15 flex items-center justify-center">
                <svg className="w-3 h-3 text-[var(--system-red)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                </svg>
              </div>
              <h4 className="text-[14px] font-semibold text-[var(--system-red)] uppercase tracking-wide">Top Losers</h4>
            </div>
            <div className="space-y-2">
              {displayLosers.map((item, index) => (
                <PerformerRow key={item.id || index} item={item} index={index} isGain={false} maxPercent={maxLossPercent} />
              ))}
            </div>
            {losers.length > 5 && (
              <button
                onClick={() => setShowAllLosers(!showAllLosers)}
                className="mt-2 text-[13px] font-medium text-[var(--system-red)] hover:text-[var(--system-red)] transition-colors"
              >
                {showAllLosers ? 'Show less' : `See all ${losers.length} losers`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Category Performance - full width */}
      {catEntries.length > 0 && (
        <div className="mt-6">
          <h4 className="text-[14px] font-semibold text-[var(--label-secondary)] uppercase tracking-wide mb-3">Category Performance</h4>
          <div className="space-y-2">
            {catEntries.map((cat) => (
              <div key={cat.category} className="p-3 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/40">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                  <span className="flex-1 text-[14px] font-medium text-[var(--label-primary)] min-w-0">{cat.label}</span>
                  <span className="text-[12px] text-[var(--label-tertiary)] tabular-nums shrink-0">{formatCompact(cat.invested)}</span>
                  <svg className="w-3 h-3 text-[var(--label-quaternary)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                  <span className="text-[12px] font-semibold text-[var(--label-primary)] tabular-nums shrink-0">{formatCompact(cat.current)}</span>
                  <span className={`text-[13px] font-bold tabular-nums shrink-0 ${
                    cat.gain >= 0 ? 'text-[var(--system-green)]' : 'text-[var(--system-red)]'
                  }`}>
                    {cat.gain >= 0 ? '+' : ''}{formatCompact(cat.gain)}
                  </span>
                </div>
                <div className="h-1.5 bg-[var(--fill-tertiary)] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: cat.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(cat.current / catMaxValue) * 100}%` }}
                    transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overall Returns Callout */}
      <div className="mt-6 p-3 bg-[var(--fill-quaternary)] rounded-xl">
        <div className="flex items-start gap-2">
          <svg className="w-4 h-4 text-[var(--label-quaternary)] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <p className="text-[12px] text-[var(--label-quaternary)] leading-relaxed">
            Your portfolio returned <span className={`font-bold ${(totalGainPercent || 0) >= 0 ? 'text-[var(--system-green)]' : 'text-[var(--system-red)]'}`}>
              {(totalGainPercent || 0) >= 0 ? '+' : ''}{(totalGainPercent || 0).toFixed(2)}%
            </span> ({(totalGain || 0) >= 0 ? '+' : ''}{formatCompact(totalGain)}) across {assetCount} assets
          </p>
        </div>
      </div>
    </div>
  );
}
