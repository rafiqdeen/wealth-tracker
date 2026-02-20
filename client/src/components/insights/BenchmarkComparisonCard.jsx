import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { formatCompact } from '../../utils/formatting';

const BAR_COLORS = {
  'Your Equity': '#3B82F6',
  'Nifty 1Y': '#10B981',
  'Your FD Avg': '#F59E0B',
  'Inflation (est.)': '#EF4444',
};

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[var(--bg-primary)] border border-[var(--separator-opaque)] rounded-xl px-3 py-2 shadow-lg">
      <p className="text-[12px] font-semibold text-[var(--label-primary)]">{d.name}</p>
      <p className="text-[11px] font-bold tabular-nums" style={{ color: BAR_COLORS[d.name] || '#6B7280' }}>
        {d.value >= 0 ? '+' : ''}{d.value.toFixed(1)}%
      </p>
    </div>
  );
}

function CustomLabel(props) {
  const { x, y, width, value } = props;
  return (
    <text
      x={x + width / 2}
      y={y - 8}
      textAnchor="middle"
      className="fill-[var(--label-primary)]"
      style={{ fontSize: '12px', fontWeight: 700 }}
    >
      {value >= 0 ? '+' : ''}{value.toFixed(0)}%
    </text>
  );
}

export default function BenchmarkComparisonCard({
  assetsCount, benchmarks, beatsBenchmark, equityXIRR, totalGainPercent,
  niftyReturn, equityHoldingYears, equityTotalReturn, categoryReturns,
}) {
  const hasEquityXIRR = equityXIRR !== null;
  const hasNifty = niftyReturn !== null;
  const catReturns = (categoryReturns || []).filter(c => c.invested > 0);

  if (assetsCount === 0) {
    return (
      <div className="py-16 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--fill-quaternary)] flex items-center justify-center">
          <svg className="w-8 h-8 text-[var(--label-quaternary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        </div>
        <p className="text-[14px] font-medium text-[var(--label-secondary)] mb-1">No Benchmark Data</p>
        <p className="text-[12px] text-[var(--label-tertiary)]">Add assets to compare against benchmarks</p>
      </div>
    );
  }

  if (!hasEquityXIRR) {
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-[18px] font-bold text-[var(--label-primary)]">Benchmark Comparison</h2>
          <p className="text-[13px] text-[var(--label-tertiary)] mt-0.5">Compare your returns against market indices</p>
        </div>

        {/* Category Returns even without equity */}
        {catReturns.length > 0 && (
          <div className="mb-6">
            <h4 className="text-[13px] font-semibold text-[var(--label-secondary)] uppercase tracking-wide mb-3">Returns by Category</h4>
            <div className="space-y-2">
              {catReturns.map(cat => (
                <CategoryReturnRow key={cat.key} cat={cat} />
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-[var(--separator-opaque)] flex items-center justify-between">
              <span className="text-[12px] font-medium text-[var(--label-secondary)]">Overall Portfolio</span>
              <span className={`text-[14px] font-bold tabular-nums ${totalGainPercent >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                {totalGainPercent >= 0 ? '+' : ''}{totalGainPercent.toFixed(1)}%
              </span>
            </div>
          </div>
        )}

        <div className="py-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--fill-quaternary)] flex items-center justify-center">
            <svg className="w-8 h-8 text-[var(--label-quaternary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <p className="text-[14px] font-medium text-[var(--label-secondary)] mb-1">No equity transactions</p>
          <p className="text-[12px] text-[var(--label-tertiary)]">Add equity transactions to compare XIRR against benchmarks</p>
        </div>
      </div>
    );
  }

  const chartData = benchmarks.map(b => ({
    name: b.name,
    value: b.value,
    isPortfolio: b.isPortfolio || false,
  }));

  return (
    <div>
      {/* Title */}
      <div className="mb-6">
        <h2 className="text-[18px] font-bold text-[var(--label-primary)]">Benchmark Comparison</h2>
        <p className="text-[13px] text-[var(--label-tertiary)] mt-0.5">Compare your returns against market indices</p>
      </div>

      {/* Hero: Recharts BarChart */}
      <div className="mb-4 mx-auto max-w-[500px]" style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barCategoryGap="25%">
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: 'var(--label-tertiary)' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis hide />
            <Tooltip content={<CustomTooltip />} cursor={false} />
            <Bar dataKey="value" radius={[8, 8, 0, 0]} isAnimationActive={true} animationDuration={800}>
              {chartData.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={BAR_COLORS[entry.name] || '#6B7280'}
                  fillOpacity={entry.isPortfolio ? 1 : 0.75}
                />
              ))}
              <LabelList dataKey="value" content={<CustomLabel />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Performance Summary Banner */}
      {hasNifty && (
        <div className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl mb-4 ${beatsBenchmark ? 'bg-[#10B981]/10' : 'bg-[var(--fill-quaternary)]'}`}>
          {beatsBenchmark ? (
            <svg className="w-4 h-4 text-[#10B981]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-[var(--label-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
            </svg>
          )}
          <span className={`text-[13px] font-semibold ${beatsBenchmark ? 'text-[#10B981]' : 'text-[var(--label-secondary)]'}`}>
            {beatsBenchmark ? 'Beating Nifty 50 by ' : 'Below Nifty 50 by '}
            {Math.abs(equityXIRR - niftyReturn).toFixed(1)}%
          </span>
          {equityHoldingYears !== null && Math.abs(equityHoldingYears - 1) > 0.5 && (
            <span className="text-[10px] text-[var(--label-quaternary)]">*</span>
          )}
        </div>
      )}

      {/* Grid: 2 columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Your Returns + Nifty */}
        <div>
          <h4 className="text-[13px] font-semibold text-[var(--label-secondary)] uppercase tracking-wide mb-3">Your Returns</h4>
          <div className="space-y-3">
            <div className="p-3.5 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/60">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-5 h-5 rounded-md bg-[#3B82F6]/15 flex items-center justify-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#3B82F6]" />
                </div>
                <span className="text-[11px] text-[var(--label-tertiary)] font-medium">Equity XIRR</span>
              </div>
              <p className={`text-[22px] font-bold tabular-nums ${equityXIRR >= 0 ? 'text-[#3B82F6]' : 'text-[#DC2626]'}`}>
                {equityXIRR >= 0 ? '+' : ''}{equityXIRR.toFixed(1)}%
              </p>
              <div className="flex items-center gap-3 mt-1">
                {equityTotalReturn !== null && equityTotalReturn !== undefined && (
                  <span className={`text-[11px] tabular-nums ${equityTotalReturn >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                    {equityTotalReturn >= 0 ? '+' : ''}{equityTotalReturn.toFixed(1)}% absolute
                  </span>
                )}
                {equityHoldingYears !== null && (
                  <span className="text-[10px] text-[var(--label-tertiary)]">
                    {equityHoldingYears.toFixed(1)}y holding
                  </span>
                )}
              </div>
            </div>

            {hasNifty ? (
              <div className="p-3.5 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/60">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-5 h-5 rounded-md bg-[#10B981]/15 flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
                  </div>
                  <span className="text-[11px] text-[var(--label-tertiary)] font-medium">Nifty 50 (1Y)</span>
                </div>
                <p className={`text-[22px] font-bold tabular-nums ${niftyReturn >= 0 ? 'text-[#10B981]' : 'text-[#DC2626]'}`}>
                  {niftyReturn >= 0 ? '+' : ''}{niftyReturn.toFixed(1)}%
                </p>
                <p className="text-[10px] text-[var(--label-tertiary)] mt-1">Trailing 1-year return</p>
              </div>
            ) : (
              <div className="p-3.5 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/60 flex items-center justify-center py-6">
                <span className="text-[12px] text-[var(--label-tertiary)]">Nifty data unavailable</span>
              </div>
            )}

            {equityHoldingYears !== null && Math.abs(equityHoldingYears - 1) > 0.5 && (
              <p className="text-[10px] text-[var(--label-quaternary)]">
                * XIRR over {equityHoldingYears.toFixed(1)}y vs Nifty 1Y — not directly comparable
              </p>
            )}
          </div>
        </div>

        {/* Right: Category Returns */}
        <div>
          <h4 className="text-[13px] font-semibold text-[var(--label-secondary)] uppercase tracking-wide mb-3">Returns by Category</h4>
          {catReturns.length > 0 ? (
            <div className="space-y-2">
              {catReturns.map(cat => (
                <CategoryReturnRow key={cat.key} cat={cat} />
              ))}
              <div className="mt-2 pt-2.5 border-t border-[var(--separator-opaque)] flex items-center justify-between">
                <span className="text-[12px] font-medium text-[var(--label-secondary)]">Overall Portfolio</span>
                <div className="flex items-center gap-2.5">
                  <span className="text-[10px] text-[var(--label-tertiary)] tabular-nums">{formatCompact(catReturns.reduce((s, c) => s + c.value, 0))}</span>
                  <span className={`text-[13px] font-bold tabular-nums ${totalGainPercent >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                    {totalGainPercent >= 0 ? '+' : ''}{totalGainPercent.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/60">
              <p className="text-[12px] text-[var(--label-tertiary)]">No category data available</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryReturnRow({ cat }) {
  const maxBarPercent = 100;
  const barWidth = Math.min(Math.abs(cat.returnPercent), maxBarPercent);
  const isPositive = cat.returnPercent >= 0;
  return (
    <div className="p-2.5 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/40">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
          <span className="text-[12px] font-medium text-[var(--label-primary)] truncate">{cat.label}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[11px] text-[var(--label-tertiary)] tabular-nums">{formatCompact(cat.value)}</span>
          <span className={`text-[13px] font-bold tabular-nums ${isPositive ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
            {isPositive ? '+' : ''}{cat.returnPercent.toFixed(1)}%
          </span>
        </div>
      </div>
      <div className="h-1.5 bg-[var(--fill-tertiary)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${barWidth}%`,
            backgroundColor: isPositive ? '#059669' : '#DC2626',
          }}
        />
      </div>
    </div>
  );
}
