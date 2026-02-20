import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCompact } from '../../utils/formatting';

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[var(--bg-primary)] border border-[var(--separator-opaque)] rounded-xl px-3 py-2 shadow-lg">
      <p className="text-[12px] font-semibold text-[var(--label-primary)]">{d.label}</p>
      <p className="text-[11px] text-[var(--label-secondary)] tabular-nums">{formatCompact(d.value)} ({d.percent.toFixed(1)}%)</p>
      <p className={`text-[11px] font-semibold tabular-nums ${d.returnPercent >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
        {d.returnPercent >= 0 ? '+' : ''}{d.returnPercent.toFixed(1)}% return
      </p>
    </div>
  );
}

export default function AssetAllocationCard({ allocationView, setAllocationView, activeAllocation, totalCurrentValue, totalInvested, totalGainPercent, categoryAllocation, meaningfulCategories, assetsCount }) {
  const rebalanceThreshold = meaningfulCategories > 0 ? (100 / meaningfulCategories) * 2 : 40;
  const largestCat = activeAllocation[0];
  const bestCategory = categoryAllocation?.length > 0
    ? categoryAllocation.reduce((best, cat) => cat.returnPercent > best.returnPercent ? cat : best, categoryAllocation[0])
    : null;
  const worstCategory = categoryAllocation?.length > 0
    ? categoryAllocation.reduce((worst, cat) => cat.returnPercent < worst.returnPercent ? cat : worst, categoryAllocation[0])
    : null;

  // Allocation target: equal weight across meaningful categories
  const targetPercent = meaningfulCategories > 0 ? 100 / meaningfulCategories : 0;

  // Compute deviation for category view
  const allocationWithDeviation = allocationView === 'Category'
    ? activeAllocation.map(cat => {
        const isSignificant = cat.percent > 5;
        const deviation = isSignificant ? cat.percent - targetPercent : 0;
        return { ...cat, deviation, isSignificant };
      })
    : activeAllocation.map(cat => ({ ...cat, deviation: 0, isSignificant: false }));

  // Count over/under-weighted categories
  const overWeighted = allocationWithDeviation.filter(c => c.deviation > 5).length;
  const underWeighted = allocationWithDeviation.filter(c => c.isSignificant && c.deviation < -5).length;

  if (activeAllocation.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--fill-quaternary)] flex items-center justify-center">
          <svg className="w-8 h-8 text-[var(--label-quaternary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
          </svg>
        </div>
        <p className="text-[14px] font-medium text-[var(--label-secondary)] mb-1">No Allocation Data</p>
        <p className="text-[12px] text-[var(--label-tertiary)]">Add assets to see your portfolio allocation</p>
      </div>
    );
  }

  return (
    <div>
      {/* Title */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-[18px] font-bold text-[var(--label-primary)]">Asset Allocation</h2>
          <p className="text-[13px] text-[var(--label-tertiary)] mt-0.5">{activeAllocation.length} {allocationView === 'Category' ? 'categories' : 'types'} across your portfolio</p>
        </div>
        <div className="flex gap-1 p-1 bg-[var(--fill-tertiary)]/50 rounded-lg">
          {['Category', 'Type'].map(view => (
            <button
              key={view}
              onClick={() => setAllocationView(view)}
              className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all ${
                allocationView === view
                  ? 'bg-[var(--bg-primary)] text-[var(--label-primary)] shadow-sm'
                  : 'text-[var(--label-tertiary)] hover:text-[var(--label-secondary)]'
              }`}
            >
              {view}
            </button>
          ))}
        </div>
      </div>

      {/* Hero: Recharts PieChart */}
      <div className="flex justify-center mb-6">
        <div className="relative w-[220px] h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={activeAllocation}
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
                {activeAllocation.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} stroke="none" />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          {/* Center label overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[20px] font-bold text-[var(--label-primary)] tabular-nums">{formatCompact(totalCurrentValue)}</span>
            <span className={`text-[14px] font-semibold tabular-nums ${totalGainPercent >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
              {totalGainPercent >= 0 ? '+' : ''}{totalGainPercent.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Grid: 2 columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Category Breakdown with deviation */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[13px] font-semibold text-[var(--label-secondary)] uppercase tracking-wide">
              {allocationView === 'Category' ? 'Categories' : 'Types'}
            </h4>
            {allocationView === 'Category' && targetPercent > 0 && (
              <span className="text-[10px] text-[var(--label-quaternary)]">Target: ~{targetPercent.toFixed(0)}% each</span>
            )}
          </div>
          <div className="space-y-2">
            {allocationWithDeviation.map((cat) => (
              <div key={cat.key} className="p-2.5 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/40">
                <div className="flex items-center gap-2.5">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                  <span className="flex-1 text-[13px] text-[var(--label-primary)] truncate min-w-0 font-medium">{cat.label}</span>
                  <span className="text-[12px] text-[var(--label-tertiary)] tabular-nums shrink-0">{formatCompact(cat.value)}</span>
                  <span className="text-[13px] font-semibold text-[var(--label-secondary)] tabular-nums w-10 text-right shrink-0">
                    {cat.percent.toFixed(0)}%
                  </span>
                  <span className={`text-[11px] font-semibold tabular-nums w-14 text-right shrink-0 ${
                    cat.returnPercent > 0 ? 'text-[#059669]' : cat.returnPercent < 0 ? 'text-[#DC2626]' : 'text-[var(--label-tertiary)]'
                  }`}>
                    {cat.returnPercent > 0 ? '+' : ''}{cat.returnPercent.toFixed(1)}%
                  </span>
                </div>
                {/* Deviation bar (category view only, significant categories only) */}
                {allocationView === 'Category' && cat.isSignificant && Math.abs(cat.deviation) > 2 && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1 bg-[var(--fill-tertiary)] rounded-full relative overflow-hidden">
                      {/* Target marker at center */}
                      <div className="absolute left-1/2 top-0 w-px h-full bg-[var(--label-quaternary)]" />
                      {/* Actual position */}
                      <div
                        className="absolute top-0 h-full rounded-full"
                        style={{
                          backgroundColor: cat.deviation > 0 ? '#F59E0B' : '#3B82F6',
                          left: cat.deviation > 0 ? '50%' : `${50 + (cat.deviation / targetPercent) * 25}%`,
                          width: `${Math.min(Math.abs(cat.deviation / targetPercent) * 25, 50)}%`,
                        }}
                      />
                    </div>
                    <span className={`text-[9px] font-semibold tabular-nums shrink-0 ${
                      cat.deviation > 5 ? 'text-[#F59E0B]' : cat.deviation < -5 ? 'text-[#3B82F6]' : 'text-[var(--label-quaternary)]'
                    }`}>
                      {cat.deviation > 0 ? '+' : ''}{cat.deviation.toFixed(0)}%
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Rebalance summary */}
          {allocationView === 'Category' && meaningfulCategories > 1 && (overWeighted > 0 || underWeighted > 0) && (
            <div className="mt-3 p-2.5 bg-[var(--fill-quaternary)] rounded-xl">
              <div className="flex items-center gap-2 text-[11px] text-[var(--label-tertiary)]">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                </svg>
                <span>
                  {overWeighted > 0 && <><span className="text-[#F59E0B] font-semibold">{overWeighted}</span> over-weighted</>}
                  {overWeighted > 0 && underWeighted > 0 && ', '}
                  {underWeighted > 0 && <><span className="text-[#3B82F6] font-semibold">{underWeighted}</span> under-weighted</>}
                  {' '}vs equal distribution
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right: Stats */}
        <div>
          <h4 className="text-[13px] font-semibold text-[var(--label-secondary)] uppercase tracking-wide mb-3">Highlights</h4>
          <div className="space-y-3">
          {/* Largest Holding */}
          <div className="p-4 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${largestCat?.color}20` }}>
                  <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: largestCat?.color }} />
                </div>
                <div>
                  <p className="text-[11px] text-[var(--label-tertiary)] font-medium">Largest Holding</p>
                  <p className="text-[15px] font-semibold text-[var(--label-primary)]">{largestCat?.label}</p>
                </div>
              </div>
              <p className="text-[28px] font-bold tabular-nums shrink-0" style={{ color: largestCat?.color }}>
                {largestCat?.percent?.toFixed(0) || 0}%
              </p>
            </div>
            {largestCat?.percent > rebalanceThreshold && meaningfulCategories > 1 && (
              <div className="mt-3 p-2.5 bg-[var(--system-orange)]/8 border border-[var(--system-orange)]/15 rounded-lg">
                <p className="text-[11px] text-[var(--system-orange)] flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>Consider rebalancing — balanced would be ~{Math.round(100 / meaningfulCategories)}% across {meaningfulCategories} categories</span>
                </p>
              </div>
            )}
          </div>

          {/* Invested vs Current */}
          <div className="p-4 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/60">
            <p className="text-[12px] font-medium text-[var(--label-tertiary)] mb-2.5">Invested vs Current</p>
            <div className="space-y-2.5">
              {categoryAllocation?.filter(c => c.invested > 0).map(cat => (
                <div key={cat.key} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                  <span className="flex-1 text-[11px] text-[var(--label-secondary)] truncate min-w-0">{cat.label}</span>
                  <span className="text-[10px] text-[var(--label-tertiary)] tabular-nums shrink-0">{formatCompact(cat.invested)}</span>
                  <svg className="w-3 h-3 text-[var(--label-quaternary)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                  <span className="text-[10px] font-semibold text-[var(--label-primary)] tabular-nums shrink-0">{formatCompact(cat.value)}</span>
                  <span className={`text-[10px] font-bold tabular-nums shrink-0 ${
                    cat.returnPercent > 0 ? 'text-[#059669]' : cat.returnPercent < 0 ? 'text-[#DC2626]' : 'text-[var(--label-tertiary)]'
                  }`}>
                    {cat.returnPercent > 0 ? '+' : ''}{cat.returnPercent.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Best & Worst */}
          {bestCategory && worstCategory && (
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-[#059669]/8 border border-[#059669]/15 rounded-xl">
                <p className="text-[10px] font-semibold text-[#059669] uppercase tracking-wide mb-1">Best Category</p>
                <p className="text-[14px] font-semibold text-[var(--label-primary)] truncate">{bestCategory.label}</p>
                <p className="text-[18px] font-bold text-[#059669] tabular-nums">+{bestCategory.returnPercent.toFixed(1)}%</p>
                <p className="text-[10px] text-[#059669]/70 tabular-nums">+{formatCompact(bestCategory.returnAmount)}</p>
              </div>
              <div className="p-3 bg-[#DC2626]/8 border border-[#DC2626]/15 rounded-xl">
                <p className="text-[10px] font-semibold text-[#DC2626] uppercase tracking-wide mb-1">Worst Category</p>
                <p className="text-[14px] font-semibold text-[var(--label-primary)] truncate">{worstCategory.label}</p>
                <p className="text-[18px] font-bold text-[#DC2626] tabular-nums">{worstCategory.returnPercent.toFixed(1)}%</p>
                <p className="text-[10px] text-[#DC2626]/70 tabular-nums">{formatCompact(worstCategory.returnAmount)}</p>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
