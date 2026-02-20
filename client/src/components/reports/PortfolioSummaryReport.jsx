import { useState } from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCurrency, formatCompact } from '../../utils/formatting';

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[var(--bg-primary)] border border-[var(--separator-opaque)] rounded-xl px-3 py-2 shadow-lg">
      <p className="text-[12px] font-semibold text-[var(--label-primary)]">{d.label}</p>
      <p className="text-[11px] text-[var(--label-secondary)] tabular-nums">{formatCompact(d.value)} ({d.percent.toFixed(1)}%)</p>
      {d.returnPercent !== undefined && (
        <p className={`text-[11px] font-semibold tabular-nums ${d.returnPercent >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
          {d.returnPercent >= 0 ? '+' : ''}{d.returnPercent.toFixed(1)}% return
        </p>
      )}
    </div>
  );
}

export default function PortfolioSummaryReport({
  totalInvested, totalCurrentValue, totalGain, totalGainPercent,
  totalInterestEarned, categoryBreakdown, assetTypeBreakdown,
  assetCount, categoryAllocation,
}) {
  const [showAllAllocation, setShowAllAllocation] = useState(false);

  if (assetCount === 0) {
    return (
      <div className="py-16 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--fill-quaternary)] flex items-center justify-center">
          <svg className="w-8 h-8 text-[var(--label-quaternary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
          </svg>
        </div>
        <p className="text-[14px] font-medium text-[var(--label-secondary)] mb-1">No Portfolio Data</p>
        <p className="text-[12px] text-[var(--label-tertiary)]">Add assets to see your portfolio summary</p>
      </div>
    );
  }

  const pieData = Object.entries(assetTypeBreakdown || {})
    .map(([name, data]) => {
      const invested = data.invested || 0;
      const current = data.current || 0;
      const returnPercent = invested > 0 ? ((current - invested) / invested) * 100 : 0;
      return {
        key: name,
        label: name.replace(/_/g, ' '),
        value: current,
        color: data.color,
        count: data.count,
        invested,
        percent: totalCurrentValue > 0 ? (current / totalCurrentValue) * 100 : 0,
        returnPercent,
      };
    })
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value);

  const allocationData = categoryAllocation || pieData;
  const displayAllocation = showAllAllocation ? allocationData : allocationData.slice(0, 5);
  const largestCat = allocationData[0];

  const bestCategory = allocationData.length > 0
    ? allocationData.reduce((best, cat) => (cat.returnPercent || 0) > (best.returnPercent || 0) ? cat : best, allocationData[0])
    : null;
  const worstCategory = allocationData.length > 0
    ? allocationData.reduce((worst, cat) => (cat.returnPercent || 0) < (worst.returnPercent || 0) ? cat : worst, allocationData[0])
    : null;

  return (
    <div>
      {/* Title */}
      <div className="mb-6">
        <h2 className="text-[18px] font-bold text-[var(--label-primary)]">Portfolio Summary</h2>
        <p className="text-[13px] text-[var(--label-tertiary)] mt-0.5">{assetCount} assets across your portfolio</p>
      </div>

      {/* Hero: Pie Chart with center overlay */}
      <div className="flex justify-center mb-6">
        <div className="relative w-[220px] h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={100}
                dataKey="value"
                paddingAngle={2}
                isAnimationActive={true}
                animationDuration={800}
                animationEasing="ease-out"
              >
                {pieData.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} stroke="none" />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[20px] font-bold text-[var(--label-primary)] tabular-nums">{formatCompact(totalCurrentValue)}</span>
            <span className={`text-[14px] font-semibold tabular-nums ${(totalGainPercent || 0) >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
              {(totalGainPercent || 0) >= 0 ? '+' : ''}{(totalGainPercent || 0).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* 2-col grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Allocation */}
        <div>
          <h4 className="text-[13px] font-semibold text-[var(--label-secondary)] uppercase tracking-wide mb-3">Allocation</h4>
          <div className="space-y-2">
            {displayAllocation.map((cat) => (
              <div key={cat.key || cat.label} className="p-2.5 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/40">
                <div className="flex items-center gap-2.5">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                  <span className="flex-1 text-[13px] text-[var(--label-primary)] truncate min-w-0 font-medium">{cat.label}</span>
                  <span className="text-[12px] text-[var(--label-tertiary)] tabular-nums shrink-0">{formatCompact(cat.value)}</span>
                  <span className="text-[13px] font-semibold text-[var(--label-secondary)] tabular-nums w-10 text-right shrink-0">
                    {cat.percent.toFixed(0)}%
                  </span>
                  <span className={`text-[11px] font-semibold tabular-nums w-14 text-right shrink-0 ${
                    (cat.returnPercent || 0) > 0 ? 'text-[#059669]' : (cat.returnPercent || 0) < 0 ? 'text-[#DC2626]' : 'text-[var(--label-tertiary)]'
                  }`}>
                    {(cat.returnPercent || 0) > 0 ? '+' : ''}{(cat.returnPercent || 0).toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
          {allocationData.length > 5 && (
            <button
              onClick={() => setShowAllAllocation(!showAllAllocation)}
              className="mt-2 text-[12px] font-medium text-[var(--system-blue)] hover:text-[var(--system-blue)]/80 transition-colors"
            >
              {showAllAllocation ? 'Show less' : `Show all ${allocationData.length} types`}
            </button>
          )}
        </div>

        {/* Right: Highlights */}
        <div>
          <h4 className="text-[13px] font-semibold text-[var(--label-secondary)] uppercase tracking-wide mb-3">Highlights</h4>
          <div className="space-y-3">
            {/* Largest Holding */}
            {largestCat && (
              <div className="p-4 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/60">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${largestCat.color}20` }}>
                      <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: largestCat.color }} />
                    </div>
                    <div>
                      <p className="text-[11px] text-[var(--label-tertiary)] font-medium">Largest Holding</p>
                      <p className="text-[15px] font-semibold text-[var(--label-primary)]">{largestCat.label}</p>
                    </div>
                  </div>
                  <p className="text-[28px] font-bold tabular-nums shrink-0" style={{ color: largestCat.color }}>
                    {largestCat.percent.toFixed(0)}%
                  </p>
                </div>
              </div>
            )}

            {/* Invested vs Current */}
            <div className="p-4 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/60">
              <p className="text-[12px] font-medium text-[var(--label-tertiary)] mb-2.5">Invested vs Current</p>
              <div className="space-y-2.5">
                {allocationData.filter(c => c.invested > 0).map(cat => (
                  <div key={cat.key || cat.label} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="flex-1 text-[11px] text-[var(--label-secondary)] truncate min-w-0">{cat.label}</span>
                    <span className="text-[10px] text-[var(--label-tertiary)] tabular-nums shrink-0">{formatCompact(cat.invested)}</span>
                    <svg className="w-3 h-3 text-[var(--label-quaternary)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                    <span className="text-[10px] font-semibold text-[var(--label-primary)] tabular-nums shrink-0">{formatCompact(cat.value)}</span>
                    <span className={`text-[10px] font-bold tabular-nums shrink-0 ${
                      (cat.returnPercent || 0) > 0 ? 'text-[#059669]' : (cat.returnPercent || 0) < 0 ? 'text-[#DC2626]' : 'text-[var(--label-tertiary)]'
                    }`}>
                      {(cat.returnPercent || 0) > 0 ? '+' : ''}{(cat.returnPercent || 0).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Best & Worst Category */}
            {bestCategory && worstCategory && (
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-[#059669]/8 border border-[#059669]/15 rounded-xl">
                  <p className="text-[10px] font-semibold text-[#059669] uppercase tracking-wide mb-1">Best Category</p>
                  <p className="text-[14px] font-semibold text-[var(--label-primary)] truncate">{bestCategory.label}</p>
                  <p className="text-[18px] font-bold text-[#059669] tabular-nums">+{(bestCategory.returnPercent || 0).toFixed(1)}%</p>
                  <p className="text-[10px] text-[#059669]/70 tabular-nums">+{formatCompact((bestCategory.value || 0) - (bestCategory.invested || 0))}</p>
                </div>
                <div className="p-3 bg-[#DC2626]/8 border border-[#DC2626]/15 rounded-xl">
                  <p className="text-[10px] font-semibold text-[#DC2626] uppercase tracking-wide mb-1">Worst Category</p>
                  <p className="text-[14px] font-semibold text-[var(--label-primary)] truncate">{worstCategory.label}</p>
                  <p className="text-[18px] font-bold text-[#DC2626] tabular-nums">{(worstCategory.returnPercent || 0).toFixed(1)}%</p>
                  <p className="text-[10px] text-[#DC2626]/70 tabular-nums">{formatCompact((worstCategory.value || 0) - (worstCategory.invested || 0))}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
