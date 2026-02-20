import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCompact, formatCurrency, formatDate } from '../../utils/formatting';

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--bg-primary)] border border-[var(--separator-opaque)] rounded-xl px-3 py-2 shadow-lg">
      {payload.map((p) => (
        <p key={p.dataKey} className="text-[11px] tabular-nums" style={{ color: p.fill }}>
          <span className="font-medium">{p.name}:</span> {p.value.toFixed(1)}%
        </p>
      ))}
    </div>
  );
}

const TYPE_LABELS = {
  'SAVINGS_ACCOUNT': 'Savings', 'STOCK': 'Stock', 'MUTUAL_FUND': 'MF', 'ETF': 'ETF',
  'CRYPTOCURRENCY': 'Crypto', 'FD': 'FD', 'PPF': 'PPF', 'EPF': 'EPF', 'RD': 'RD',
  'NPS': 'NPS', 'GOLD': 'Gold', 'SILVER': 'Silver', 'LIC': 'LIC',
  'LAND': 'Land', 'PROPERTY': 'Property',
};

function TierAssetList({ assets, color }) {
  const [expanded, setExpanded] = useState(false);
  if (!assets || assets.length === 0) return null;
  const display = expanded ? assets : assets.slice(0, 3);
  return (
    <div className="mt-2 pt-2 border-t border-[var(--separator-opaque)]/40">
      <div className="space-y-1">
        {display.map((a, i) => (
          <div key={i} className="flex items-center justify-between px-1 py-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] text-[var(--label-secondary)] truncate">{a.name}</span>
              <span className="px-1 py-0.5 text-[8px] font-semibold rounded bg-[var(--fill-tertiary)] text-[var(--label-tertiary)] uppercase shrink-0">
                {TYPE_LABELS[a.type] || a.type}
              </span>
            </div>
            <span className="text-[11px] font-semibold text-[var(--label-primary)] tabular-nums shrink-0 ml-2">{formatCompact(a.value)}</span>
          </div>
        ))}
      </div>
      {assets.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-[10px] font-medium transition-colors"
          style={{ color }}
        >
          {expanded ? 'Show less' : `+${assets.length - 3} more`}
        </button>
      )}
    </div>
  );
}

export default function LiquidityAnalysisCard({
  assetsCount, liquidPercent, lockedPercent,
  instantlyLiquidPercent, marketLiquidPercent,
  instantlyLiquidValue, marketLiquidValue,
  liquidValue, lockedValue,
  liquidAssets, lockedAssets,
  emergencyMonths, emergencyMonthsSafe, upcomingMaturity,
  allMaturities, liquidityTierDetail,
  monthlyExpense,
  editingExpense, setEditingExpense, expenseInput, setExpenseInput,
  savingExpense, saveMonthlyExpense, getAssetValue,
}) {
  const [showAllMaturities, setShowAllMaturities] = useState(false);
  const emergencyColor = emergencyMonths >= 6 ? '#10B981' : emergencyMonths >= 3 ? '#F59E0B' : '#EF4444';
  const emergencyLabel = emergencyMonths >= 6 ? 'Healthy' : emergencyMonths >= 3 ? 'Adequate' : 'Low';
  const maturities = allMaturities || [];
  const displayMaturities = showAllMaturities ? maturities : maturities.slice(0, 3);
  const tierDetail = liquidityTierDetail || { savings: [], market: [], locked: [] };

  if (assetsCount === 0) {
    return (
      <div className="py-16 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--fill-quaternary)] flex items-center justify-center">
          <svg className="w-8 h-8 text-[var(--label-quaternary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
          </svg>
        </div>
        <p className="text-[14px] font-medium text-[var(--label-secondary)] mb-1">No Liquidity Data</p>
        <p className="text-[12px] text-[var(--label-tertiary)]">Add assets to analyze liquidity</p>
      </div>
    );
  }

  // Chart data for stacked horizontal bar
  const stackedData = [
    { name: 'Portfolio', savings: instantlyLiquidPercent, market: marketLiquidPercent, locked: lockedPercent },
  ];

  return (
    <div>
      {/* Title */}
      <div className="mb-6">
        <h2 className="text-[18px] font-bold text-[var(--label-primary)]">Liquidity Analysis</h2>
        <p className="text-[13px] text-[var(--label-tertiary)] mt-0.5">
          {emergencyMonthsSafe >= 6 ? 'Good emergency coverage' : 'Build your liquidity buffer'}
        </p>
      </div>

      {/* Hero: Stacked horizontal bar */}
      <div className="mb-4">
        <div style={{ height: 60 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stackedData} layout="vertical" barSize={28}>
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis type="category" dataKey="name" hide />
              <Tooltip content={<CustomTooltip />} cursor={false} />
              <Bar dataKey="savings" stackId="a" fill="#10B981" name="Savings" radius={[8, 0, 0, 8]} isAnimationActive={true} animationDuration={600} />
              <Bar dataKey="market" stackId="a" fill="#3B82F6" name="Market Liquid" isAnimationActive={true} animationDuration={600} />
              <Bar dataKey="locked" stackId="a" fill="#9CA3AF" name="Locked" radius={[0, 8, 8, 0]} isAnimationActive={true} animationDuration={600} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* Legend */}
        <div className="flex items-center justify-center gap-5 mt-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
            <span className="text-[11px] text-[var(--label-tertiary)]">Savings {instantlyLiquidPercent.toFixed(0)}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#3B82F6]" />
            <span className="text-[11px] text-[var(--label-tertiary)]">Market {marketLiquidPercent.toFixed(0)}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#9CA3AF]" />
            <span className="text-[11px] text-[var(--label-tertiary)]">Locked {lockedPercent.toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {/* Grid: 2 columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Tier Values with asset detail */}
        <div>
          <h4 className="text-[13px] font-semibold text-[var(--label-secondary)] uppercase tracking-wide mb-3">Tier Values</h4>
          <div className="space-y-2.5">
            <div className="p-3.5 bg-[var(--bg-secondary)] rounded-xl border-l-4 border-[#10B981]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#10B981]">Savings (Instant)</span>
                <span className="text-[10px] text-[var(--label-tertiary)]">{tierDetail.savings.length} asset{tierDetail.savings.length !== 1 ? 's' : ''}</span>
              </div>
              <p className="text-[20px] font-bold text-[var(--label-primary)] tabular-nums mt-0.5">{formatCompact(instantlyLiquidValue)}</p>
              <TierAssetList assets={tierDetail.savings} color="#10B981" />
            </div>
            <div className="p-3.5 bg-[var(--bg-secondary)] rounded-xl border-l-4 border-[#3B82F6]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#3B82F6]">Market Liquid</span>
                <span className="text-[10px] text-[var(--label-tertiary)]">{tierDetail.market.length} asset{tierDetail.market.length !== 1 ? 's' : ''}</span>
              </div>
              <p className="text-[20px] font-bold text-[var(--label-primary)] tabular-nums mt-0.5">{formatCompact(marketLiquidValue)}</p>
              <TierAssetList assets={tierDetail.market} color="#3B82F6" />
            </div>
            <div className="p-3.5 bg-[var(--bg-secondary)] rounded-xl border-l-4 border-[#9CA3AF]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#6B7280]">Locked</span>
                <span className="text-[10px] text-[var(--label-tertiary)]">{tierDetail.locked.length} asset{tierDetail.locked.length !== 1 ? 's' : ''}</span>
              </div>
              <p className="text-[20px] font-bold text-[var(--label-primary)] tabular-nums mt-0.5">{formatCompact(lockedValue)}</p>
              <TierAssetList assets={tierDetail.locked} color="#6B7280" />
            </div>
          </div>

          {/* Monthly Expense */}
          <div className="mt-4 p-3 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/60">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[var(--label-tertiary)]">Monthly expenses</span>
              {editingExpense ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={expenseInput}
                    onChange={(e) => setExpenseInput(e.target.value)}
                    className="w-24 px-2 py-1 text-[13px] text-right tabular-nums bg-[var(--fill-tertiary)] border border-[var(--separator-opaque)] rounded-lg text-[var(--label-primary)] focus:outline-none focus:border-[var(--system-blue)]"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') saveMonthlyExpense(); if (e.key === 'Escape') setEditingExpense(false); }}
                  />
                  <button onClick={saveMonthlyExpense} disabled={savingExpense} className="px-2 py-1 text-[11px] font-medium text-white bg-[var(--system-blue)] rounded-md hover:bg-[var(--system-blue)]/90 disabled:opacity-50">
                    {savingExpense ? '...' : 'Save'}
                  </button>
                  <button onClick={() => setEditingExpense(false)} className="px-2 py-1 text-[11px] font-medium text-[var(--label-tertiary)] hover:text-[var(--label-primary)]">
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setExpenseInput(String(monthlyExpense)); setEditingExpense(true); }}
                  className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--label-primary)] tabular-nums hover:text-[var(--system-blue)] transition-colors"
                >
                  {formatCurrency(monthlyExpense)}
                  <svg className="w-3 h-3 text-[var(--label-quaternary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right: Emergency Fund + Maturity Schedule */}
        <div>
          <h4 className="text-[13px] font-semibold text-[var(--label-secondary)] uppercase tracking-wide mb-3">Emergency & Maturity</h4>
          <div className="space-y-3">
          {/* Emergency Fund */}
          <div className="p-4 rounded-xl border" style={{ backgroundColor: `${emergencyColor}08`, borderColor: `${emergencyColor}25` }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${emergencyColor}15` }}>
                  <svg className="w-5 h-5" style={{ color: emergencyColor }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <p className="text-[11px] text-[var(--label-tertiary)] font-semibold">Emergency Fund</p>
                  <p className="text-[10px] text-[var(--label-tertiary)]">(all liquid assets)</p>
                </div>
              </div>
              <div className="px-2.5 py-1 rounded-lg text-[11px] font-semibold" style={{ backgroundColor: `${emergencyColor}15`, color: emergencyColor }}>
                {emergencyLabel}
              </div>
            </div>
            <p className="text-[36px] font-bold tabular-nums leading-none" style={{ color: emergencyColor }}>
              {emergencyMonths.toFixed(1)}
            </p>
            <p className="text-[14px] font-medium text-[var(--label-secondary)] mt-1">months of expenses</p>
            {emergencyMonthsSafe > 0 && emergencyMonthsSafe !== emergencyMonths && (
              <p className="text-[11px] text-[var(--label-tertiary)] mt-2 tabular-nums">
                {emergencyMonthsSafe.toFixed(1)} months from savings alone
              </p>
            )}
          </div>

          {/* Maturity Schedule */}
          {maturities.length > 0 && (
            <div className="p-4 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/60">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[13px] font-semibold text-[var(--label-secondary)] uppercase tracking-wide">Maturity Schedule</h4>
                <span className="text-[11px] text-[var(--label-tertiary)]">{maturities.length} upcoming</span>
              </div>
              <div className="space-y-2.5">
                {displayMaturities.map((m, i) => {
                  const urgencyColor = m.daysUntil <= 30 ? '#EF4444' : m.daysUntil <= 90 ? '#F59E0B' : 'var(--system-orange)';
                  return (
                    <div key={i} className="flex items-start gap-3">
                      {/* Timeline dot */}
                      <div className="flex flex-col items-center mt-1.5">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: urgencyColor }} />
                        {i < displayMaturities.length - 1 && (
                          <div className="w-px h-full min-h-[24px] bg-[var(--separator-opaque)] mt-1" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 pb-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[13px] font-medium text-[var(--label-primary)] truncate">{m.name}</p>
                          <span className="text-[13px] font-bold text-[var(--label-primary)] tabular-nums shrink-0">{formatCompact(m.value)}</span>
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <p className="text-[11px] text-[var(--label-tertiary)] tabular-nums">{formatDate(m.maturity_date)}</p>
                          <span className="text-[11px] font-semibold tabular-nums" style={{ color: urgencyColor }}>
                            {m.daysUntil} day{m.daysUntil !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {m.interest_rate && (
                          <p className="text-[10px] text-[var(--label-quaternary)] mt-0.5">{m.interest_rate}% p.a.</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {maturities.length > 3 && (
                <button
                  onClick={() => setShowAllMaturities(!showAllMaturities)}
                  className="mt-2 text-[12px] font-medium text-[var(--system-blue)] hover:text-[var(--system-blue)]/80 transition-colors"
                >
                  {showAllMaturities ? 'Show less' : `Show all ${maturities.length} maturities`}
                </button>
              )}
              {maturities.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[var(--separator-opaque)]/40 flex items-center justify-between">
                  <span className="text-[11px] text-[var(--label-tertiary)]">Total maturing</span>
                  <span className="text-[13px] font-bold text-[var(--label-primary)] tabular-nums">
                    {formatCompact(maturities.reduce((s, m) => s + m.value, 0))}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Fallback: no maturities */}
          {maturities.length === 0 && (
            <div className="p-4 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/60">
              <p className="text-[12px] text-[var(--label-tertiary)]">No upcoming maturities</p>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
