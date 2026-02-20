import { useState } from 'react';
import { motion } from 'framer-motion';
import { formatCompact, formatCurrency } from '../../utils/formatting';

const TYPE_LABELS = {
  'STOCK': 'Stock', 'MUTUAL_FUND': 'MF', 'ETF': 'ETF',
};

export default function TaxImplicationsCard({
  hasEquityAssets, ltcgGain, stcgGain, ltcgLoss, stcgLoss,
  ltcgAssetCount, stcgAssetCount, ltcgTax, stcgTax,
  ltcgExemptionUsed, ltcgExemptionRemaining, ltcgExemptionPercent,
  taxableInterest, taxExemptInterest, realEstateCG,
  taxBreakdownByAsset,
}) {
  const [showAllAssets, setShowAllAssets] = useState(false);
  const hasAnyTaxData = hasEquityAssets || taxableInterest > 0 || taxExemptInterest > 0 || realEstateCG > 0;
  const totalLoss = (ltcgLoss || 0) + (stcgLoss || 0);
  const totalTax = ltcgTax + stcgTax;
  const assetBreakdown = taxBreakdownByAsset || [];
  const displayAssets = showAllAssets ? assetBreakdown : assetBreakdown.slice(0, 5);

  if (!hasAnyTaxData) {
    return (
      <div className="py-16 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[var(--system-red)]/10 to-[var(--system-red)]/5 border border-[var(--system-red)]/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-[var(--system-red)]/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" />
          </svg>
        </div>
        <p className="text-[14px] font-medium text-[var(--label-secondary)] mb-1">No Tax Data</p>
        <p className="text-[13px] text-[var(--label-tertiary)]">Add equity, fixed income, or real estate<br />assets to see tax implications</p>
      </div>
    );
  }

  return (
    <div>
      {/* Title */}
      <div className="mb-6">
        <h2 className="text-[18px] font-bold text-[var(--label-primary)]">Tax Implications</h2>
        <p className="text-[14px] text-[var(--label-tertiary)] mt-0.5">Estimated capital gains and income tax</p>
      </div>

      {/* Hero: Total Tax */}
      {hasEquityAssets && (
        <div className="mb-6 p-5 bg-gradient-to-br from-[var(--system-red)]/10 to-[var(--system-red)]/5 border border-[var(--system-red)]/20 rounded-2xl text-center">
          <p className="text-[13px] font-semibold text-[var(--label-secondary)] uppercase tracking-wide mb-2">Estimated Equity Tax</p>
          <p className="text-[40px] font-bold text-[var(--system-red)] tabular-nums leading-none" style={{ fontFamily: 'var(--font-display)' }}>{formatCurrency(totalTax)}</p>
          <div className="flex items-center justify-center gap-4 mt-4">
            <div className="px-4 py-2 bg-[var(--bg-primary)]/60 rounded-xl">
              <p className="text-[11px] font-semibold text-[var(--system-green)] mb-0.5">LTCG @ 12.5%</p>
              <p className="text-[16px] font-bold text-[var(--label-primary)] tabular-nums">{formatCurrency(ltcgTax)}</p>
            </div>
            <div className="px-4 py-2 bg-[var(--bg-primary)]/60 rounded-xl">
              <p className="text-[11px] font-semibold text-[var(--system-amber)] mb-0.5">STCG @ 20%</p>
              <p className="text-[16px] font-bold text-[var(--label-primary)] tabular-nums">{formatCurrency(stcgTax)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Grid: 2 columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* LTCG Exemption */}
        {hasEquityAssets && (
          <div className="p-4 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/60">
            <h4 className="text-[14px] font-semibold text-[var(--label-secondary)] uppercase tracking-wide mb-3">LTCG Exemption</h4>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] text-[var(--label-tertiary)]">&#8377;1.25L annual exemption</span>
              <span className="text-[14px] font-bold tabular-nums text-[var(--label-primary)]">{ltcgExemptionPercent.toFixed(0)}%</span>
            </div>
            <div className="h-3 bg-[var(--fill-tertiary)] rounded-full overflow-hidden mb-3">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: ltcgExemptionPercent >= 100 ? 'var(--system-red)' : ltcgExemptionPercent >= 75 ? 'var(--system-amber)' : 'var(--system-green)' }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(ltcgExemptionPercent, 100)}%` }}
                transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
              />
            </div>
            <div className="flex items-center justify-between text-[12px] text-[var(--label-tertiary)]">
              <span className="tabular-nums">{formatCompact(ltcgExemptionUsed)} used</span>
              <span className="tabular-nums">{formatCompact(ltcgExemptionRemaining)} remaining</span>
            </div>
          </div>
        )}

        {/* Tax-Loss Harvesting */}
        {totalLoss > 0 ? (
          <div className="p-4 bg-[var(--chart-primary)]/5 border border-[var(--chart-primary)]/15 rounded-xl">
            <h4 className="text-[14px] font-semibold text-[var(--chart-primary)] uppercase tracking-wide mb-3">Tax-Loss Harvesting</h4>
            <p className="text-[22px] font-bold text-[var(--label-primary)] tabular-nums mb-1" style={{ fontFamily: 'var(--font-display)' }}>{formatCompact(totalLoss)}</p>
            <p className="text-[12px] text-[var(--label-tertiary)] mb-2">Unrealized losses can offset gains</p>
            {ltcgLoss > 0 && stcgLoss > 0 && (
              <div className="flex items-center gap-3 text-[12px] text-[var(--label-tertiary)] tabular-nums">
                <span>LTCG: {formatCompact(ltcgLoss)}</span>
                <span>STCG: {formatCompact(stcgLoss)}</span>
              </div>
            )}
          </div>
        ) : hasEquityAssets ? (
          <div className="p-4 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/60 flex flex-col justify-center">
            <h4 className="text-[14px] font-semibold text-[var(--label-secondary)] uppercase tracking-wide mb-2">Tax-Loss Harvesting</h4>
            <p className="text-[13px] text-[var(--label-tertiary)]">No unrealized losses to harvest</p>
          </div>
        ) : null}

        {/* LTCG/STCG Gains Detail */}
        {hasEquityAssets && (
          <>
            <div className="p-3.5 bg-gradient-to-br from-[var(--system-green)]/8 to-[var(--system-green)]/4 border border-[var(--system-green)]/15 rounded-xl">
              <div className="flex items-center gap-1.5 mb-2">
                <div className="w-5 h-5 rounded-md bg-[var(--system-green)]/15 flex items-center justify-center">
                  <svg className="w-3 h-3 text-[var(--system-green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="text-[12px] font-semibold text-[var(--system-green)]">LTCG (1Y+)</span>
              </div>
              <p className="text-[22px] font-bold text-[var(--label-primary)] tabular-nums mb-0.5" style={{ fontFamily: 'var(--font-display)' }}>{formatCompact(ltcgGain)}</p>
              <p className="text-[12px] text-[var(--label-tertiary)]">{ltcgAssetCount} asset{ltcgAssetCount !== 1 ? 's' : ''} @ 12.5% above &#8377;1.25L</p>
            </div>
            <div className="p-3.5 bg-gradient-to-br from-[var(--system-amber)]/8 to-[#D97706]/4 border border-[var(--system-amber)]/15 rounded-xl">
              <div className="flex items-center gap-1.5 mb-2">
                <div className="w-5 h-5 rounded-md bg-[var(--system-amber)]/15 flex items-center justify-center">
                  <svg className="w-3 h-3 text-[var(--system-amber)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="text-[12px] font-semibold text-[var(--system-amber)]">STCG (&lt;1Y)</span>
              </div>
              <p className="text-[22px] font-bold text-[var(--label-primary)] tabular-nums mb-0.5" style={{ fontFamily: 'var(--font-display)' }}>{formatCompact(stcgGain)}</p>
              <p className="text-[12px] text-[var(--label-tertiary)]">{stcgAssetCount} asset{stcgAssetCount !== 1 ? 's' : ''} @ 20%</p>
            </div>
          </>
        )}

        {/* Per-Asset Tax Breakdown */}
        {assetBreakdown.length > 0 && (
          <div className="p-4 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/60 md:col-span-2">
            <h4 className="text-[14px] font-semibold text-[var(--label-secondary)] uppercase tracking-wide mb-3">Per-Asset Breakdown</h4>
            {/* Table header */}
            <div className="flex items-center gap-2 px-2 pb-2 border-b border-[var(--separator-opaque)] text-[11px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wide">
              <span className="flex-1 min-w-0">Asset</span>
              <span className="w-16 text-right shrink-0">LTCG</span>
              <span className="w-16 text-right shrink-0">STCG</span>
              <span className="w-16 text-right shrink-0">Losses</span>
              <span className="w-20 text-right shrink-0">Net</span>
            </div>
            <div className="space-y-0.5 mt-1">
              {displayAssets.map((item, idx) => {
                const totalLosses = item.ltcgLoss + item.stcgLoss;
                return (
                  <div key={idx} className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-[var(--fill-quaternary)] transition-colors">
                    <div className="flex-1 min-w-0 flex items-center gap-1.5">
                      <span className="text-[13px] font-medium text-[var(--label-primary)] truncate">{item.name}</span>
                      <span className="px-1.5 py-0.5 text-[8px] font-semibold rounded bg-[var(--fill-tertiary)] text-[var(--label-tertiary)] uppercase shrink-0">
                        {TYPE_LABELS[item.type] || item.type}
                      </span>
                    </div>
                    <span className={`w-16 text-right text-[12px] tabular-nums shrink-0 ${item.ltcgGain > 0 ? 'text-[var(--system-green)] font-semibold' : 'text-[var(--label-quaternary)]'}`}>
                      {item.ltcgGain > 0 ? formatCompact(item.ltcgGain) : '-'}
                    </span>
                    <span className={`w-16 text-right text-[12px] tabular-nums shrink-0 ${item.stcgGain > 0 ? 'text-[var(--system-amber)] font-semibold' : 'text-[var(--label-quaternary)]'}`}>
                      {item.stcgGain > 0 ? formatCompact(item.stcgGain) : '-'}
                    </span>
                    <span className={`w-16 text-right text-[12px] tabular-nums shrink-0 ${totalLosses > 0 ? 'text-[var(--system-red)] font-semibold' : 'text-[var(--label-quaternary)]'}`}>
                      {totalLosses > 0 ? `-${formatCompact(totalLosses)}` : '-'}
                    </span>
                    <span className={`w-20 text-right text-[13px] font-bold tabular-nums shrink-0 ${
                      item.netGain > 0 ? 'text-[var(--system-green)]' : item.netGain < 0 ? 'text-[var(--system-red)]' : 'text-[var(--label-tertiary)]'
                    }`}>
                      {item.netGain > 0 ? '+' : ''}{formatCompact(item.netGain)}
                    </span>
                  </div>
                );
              })}
            </div>
            {assetBreakdown.length > 5 && (
              <button
                onClick={() => setShowAllAssets(!showAllAssets)}
                className="mt-2 text-[13px] font-medium text-[var(--system-blue)] hover:text-[var(--system-blue)]/80 transition-colors"
              >
                {showAllAssets ? 'Show less' : `Show all ${assetBreakdown.length} assets`}
              </button>
            )}
          </div>
        )}

        {/* Other Taxable Income */}
        {(taxableInterest > 0 || taxExemptInterest > 0 || realEstateCG > 0) && (
          <div className="p-4 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/60">
            <h4 className="text-[14px] font-semibold text-[var(--label-secondary)] uppercase tracking-wide mb-3">Other Taxable Income</h4>
            <div className="space-y-2.5">
              {taxableInterest > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[var(--label-tertiary)]">FD Interest (slab rate)</span>
                  <span className="text-[14px] font-semibold text-[var(--label-primary)] tabular-nums">{formatCompact(taxableInterest)}</span>
                </div>
              )}
              {realEstateCG > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[var(--label-tertiary)]">Real Estate CG</span>
                  <span className="text-[14px] font-semibold text-[var(--label-primary)] tabular-nums">{formatCompact(realEstateCG)}</span>
                </div>
              )}
              {taxExemptInterest > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] text-[var(--label-tertiary)]">PPF/EPF Interest</span>
                    <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-[var(--system-green)]/15 text-[var(--system-green)]">EXEMPT</span>
                  </div>
                  <span className="text-[14px] font-semibold text-[var(--label-primary)] tabular-nums">{formatCompact(taxExemptInterest)}</span>
                </div>
              )}
            </div>
            {(taxableInterest > 0 || realEstateCG > 0) && (
              <p className="text-[11px] text-[var(--label-quaternary)] mt-3 pt-2 border-t border-[var(--separator-opaque)]">
                FD interest and real estate gains are taxed at slab rates (not included in equity tax above)
              </p>
            )}
          </div>
        )}

        {/* Disclaimer */}
        <div className="p-3 bg-[var(--fill-quaternary)] rounded-xl md:col-span-2">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-[var(--label-quaternary)] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <p className="text-[12px] text-[var(--label-quaternary)] leading-relaxed">
              Per-lot FIFO basis. Unrealized gains — tax applies only when you sell. Consult a tax advisor for accurate calculations.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
