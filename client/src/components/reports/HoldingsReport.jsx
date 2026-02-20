import { useState } from 'react';
import { motion } from 'framer-motion';
import { formatCurrency, formatCompact } from '../../utils/formatting';
import AssetTypeBadge from '../shared/AssetTypeBadge';

const groupColors = {
  EQUITY: 'var(--chart-primary)', FIXED_INCOME: 'var(--system-green)', PHYSICAL: 'var(--system-amber)',
  REAL_ESTATE: 'var(--system-red)', OTHER: '#6B7280', INSURANCE: 'var(--chart-primary)',
};

export default function HoldingsReport({ assets }) {
  const [showAllHoldings, setShowAllHoldings] = useState(false);
  const [showAllTypes, setShowAllTypes] = useState(false);

  if (!assets || assets.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--fill-quaternary)] flex items-center justify-center">
          <svg className="w-8 h-8 text-[var(--label-quaternary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
        </div>
        <p className="text-[15px] font-medium text-[var(--label-secondary)] mb-1">No Holdings</p>
        <p className="text-[13px] text-[var(--label-tertiary)]">Add assets to see your holdings report</p>
      </div>
    );
  }

  const sorted = [...assets].sort((a, b) => b.currentValue - a.currentValue);
  const topHolding = sorted[0];
  const topHoldings = sorted.slice(0, showAllHoldings ? sorted.length : 5);
  const maxGainPercent = Math.max(...sorted.map(a => Math.abs(a.gainPercent || 0)), 1);

  // Group by category
  const typeGroups = {};
  sorted.forEach(asset => {
    const cat = asset.category || 'OTHER';
    if (!typeGroups[cat]) {
      typeGroups[cat] = { label: cat.replace(/_/g, ' '), count: 0, value: 0, color: groupColors[cat] || '#6B7280' };
    }
    typeGroups[cat].count += 1;
    typeGroups[cat].value += asset.currentValue || 0;
  });
  const totalValue = sorted.reduce((sum, a) => sum + (a.currentValue || 0), 0);
  const typeGroupList = Object.entries(typeGroups)
    .map(([key, data]) => ({ key, ...data, percent: totalValue > 0 ? (data.value / totalValue) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
  const displayTypes = showAllTypes ? typeGroupList : typeGroupList.slice(0, 5);

  return (
    <div>
      {/* Hero: Top Holding */}
      {topHolding && (
        <div className="mb-6 p-5 bg-gradient-to-br from-[var(--system-green)]/10 to-[var(--system-green)]/5 border border-[var(--system-green)]/20 rounded-2xl">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-[var(--system-green)]/15 flex items-center justify-center">
              <svg className="w-4 h-4 text-[var(--system-green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
              </svg>
            </div>
            <span className="text-[13px] font-semibold text-[var(--system-green)] uppercase tracking-wide">Top Holding</span>
            <AssetTypeBadge type={topHolding.asset_type || topHolding.typeName} />
          </div>
          <p className="text-[16px] font-semibold text-[var(--label-primary)] mb-1">{topHolding.name}</p>
          <div className="flex items-baseline gap-3">
            <p className="text-[36px] font-bold text-[var(--label-primary)] tabular-nums leading-none" style={{ fontFamily: 'var(--font-display)' }}>
              {formatCompact(topHolding.currentValue)}
            </p>
            <p className={`text-[15px] font-semibold tabular-nums ${(topHolding.gainPercent || 0) >= 0 ? 'text-[var(--system-green)]/70' : 'text-[var(--system-red)]/70'}`}>
              {(topHolding.gainPercent || 0) >= 0 ? '+' : ''}{(topHolding.gainPercent || 0).toFixed(1)}%
            </p>
          </div>
        </div>
      )}

      {/* 2-col grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Top Holdings */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 rounded-md bg-[var(--system-green)]/15 flex items-center justify-center">
              <svg className="w-3 h-3 text-[var(--system-green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
              </svg>
            </div>
            <h4 className="text-[14px] font-semibold text-[var(--label-secondary)] uppercase tracking-wide">Top Holdings</h4>
          </div>
          <div className="space-y-2">
            {topHoldings.map((asset, index) => {
              const isGain = (asset.gainPercent || 0) >= 0;
              const color = isGain ? 'var(--system-green)' : 'var(--system-red)';
              return (
                <div key={asset.id || index} className="flex items-start gap-2.5 p-2.5 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/40">
                  <span className="text-[13px] font-bold text-[var(--label-tertiary)] tabular-nums mt-0.5 w-5 shrink-0 text-center">{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5 gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-[14px] font-medium text-[var(--label-primary)] truncate">{asset.name}</p>
                        <AssetTypeBadge type={asset.asset_type || asset.typeName} />
                      </div>
                      <p className="text-[14px] font-bold tabular-nums shrink-0" style={{ color }}>
                        {isGain ? '+' : ''}{(asset.gainPercent || 0).toFixed(1)}%
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] text-[var(--label-tertiary)] tabular-nums">{formatCompact(asset.currentValue)}</p>
                      <p className="text-[12px] tabular-nums" style={{ color: `${color}99` }}>
                        {isGain ? '+' : ''}{formatCompact(asset.gain)}
                      </p>
                    </div>
                    <div className="mt-1.5 h-1.5 bg-[var(--fill-tertiary)] rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(Math.abs(asset.gainPercent || 0) / maxGainPercent * 100, 100)}%` }}
                        transition={{ duration: 0.5, delay: index * 0.08 }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {sorted.length > 5 && (
            <button
              onClick={() => setShowAllHoldings(!showAllHoldings)}
              className="mt-2 text-[13px] font-medium text-[var(--system-green)] hover:text-[var(--system-green)] transition-colors"
            >
              {showAllHoldings ? 'Show less' : `See all ${sorted.length} holdings`}
            </button>
          )}
        </div>

        {/* Right: By Type */}
        <div>
          <h4 className="text-[14px] font-semibold text-[var(--label-secondary)] uppercase tracking-wide mb-3">By Type</h4>
          <div className="space-y-2">
            {displayTypes.map((group) => (
              <div key={group.key} className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-[var(--fill-quaternary)] transition-colors">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                <span className="flex-1 text-[14px] font-medium text-[var(--label-primary)] truncate min-w-0">{group.label}</span>
                <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-[var(--fill-tertiary)] text-[var(--label-tertiary)] uppercase tracking-wide shrink-0">
                  {group.count}
                </span>
                <span className="text-[13px] text-[var(--label-tertiary)] tabular-nums shrink-0">{formatCompact(group.value)}</span>
                <span className="text-[14px] font-semibold text-[var(--label-secondary)] tabular-nums w-10 text-right shrink-0">
                  {group.percent.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
          {typeGroupList.length > 5 && (
            <button
              onClick={() => setShowAllTypes(!showAllTypes)}
              className="mt-2 text-[13px] font-medium text-[var(--system-blue)] hover:text-[var(--system-blue)]/80 transition-colors"
            >
              {showAllTypes ? 'Show less' : `Show all ${typeGroupList.length} types`}
            </button>
          )}
        </div>
      </div>

      {/* All Holdings - full width */}
      <div className="mt-6">
        <h4 className="text-[14px] font-semibold text-[var(--label-secondary)] uppercase tracking-wide mb-3">All Holdings</h4>
        {/* Table header */}
        <div className="flex items-center gap-2 px-2 pb-2 border-b border-[var(--separator-opaque)] text-[11px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wide">
          <span className="flex-1 min-w-0">Asset</span>
          <span className="w-20 text-right shrink-0">Invested</span>
          <span className="w-20 text-right shrink-0">Current</span>
          <span className="w-20 text-right shrink-0">Gain/Loss</span>
        </div>
        <div className="space-y-0.5 mt-1">
          {sorted.slice(0, showAllHoldings ? sorted.length : 10).map((asset, idx) => (
            <div key={asset.id || idx} className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-[var(--fill-quaternary)] transition-colors">
              <div className="flex-1 min-w-0 flex items-center gap-1.5">
                <span className="text-[13px] font-medium text-[var(--label-primary)] truncate">{asset.name}</span>
                <AssetTypeBadge type={asset.asset_type || asset.typeName} />
              </div>
              <span className="w-20 text-right text-[12px] text-[var(--label-tertiary)] tabular-nums shrink-0">
                {formatCompact(asset.invested)}
              </span>
              <span className="w-20 text-right text-[12px] font-semibold text-[var(--label-primary)] tabular-nums shrink-0">
                {formatCompact(asset.currentValue)}
              </span>
              <span className={`w-20 text-right text-[13px] font-bold tabular-nums shrink-0 ${
                (asset.gain || 0) >= 0 ? 'text-[var(--system-green)]' : 'text-[var(--system-red)]'
              }`}>
                {(asset.gain || 0) >= 0 ? '+' : ''}{formatCompact(asset.gain)}
              </span>
            </div>
          ))}
        </div>
        {sorted.length > 10 && !showAllHoldings && (
          <button
            onClick={() => setShowAllHoldings(true)}
            className="mt-2 text-[13px] font-medium text-[var(--system-blue)] hover:text-[var(--system-blue)]/80 transition-colors"
          >
            Show all {sorted.length} holdings
          </button>
        )}
      </div>
    </div>
  );
}
