import { useState } from 'react';
import { motion } from 'framer-motion';
import { formatCurrency, formatCompact } from '../../utils/formatting';

export default function TaxSummaryReport({
  taxableInterestIncome, taxExemptInterestIncome, totalInterestIncome,
  totalDividendIncome, totalCapitalGains, totalTaxableIncome,
  fixedIncomeAssets,
}) {
  const [showAllAssets, setShowAllAssets] = useState(false);
  const hasAnyData = (totalTaxableIncome || 0) > 0 || (taxExemptInterestIncome || 0) > 0 || (taxableInterestIncome || 0) > 0 || (totalCapitalGains || 0) > 0;

  if (!hasAnyData) {
    return (
      <div className="py-16 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#EF4444]/10 to-[#DC2626]/5 border border-[#EF4444]/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-[#EF4444]/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" />
          </svg>
        </div>
        <p className="text-[14px] font-medium text-[var(--label-secondary)] mb-1">No Tax Data</p>
        <p className="text-[12px] text-[var(--label-tertiary)]">Add income-generating assets to see tax summary</p>
      </div>
    );
  }

  const assetList = fixedIncomeAssets || [];
  const displayAssets = showAllAssets ? assetList : assetList.slice(0, 5);

  return (
    <div>
      {/* Title */}
      <div className="mb-6">
        <h2 className="text-[18px] font-bold text-[var(--label-primary)]">Tax Summary</h2>
        <p className="text-[13px] text-[var(--label-tertiary)] mt-0.5">Estimated tax for current financial year</p>
      </div>

      {/* Hero: Total Taxable Income */}
      <div className="mb-6 p-5 bg-gradient-to-br from-[#EF4444]/10 to-[#DC2626]/5 border border-[#EF4444]/20 rounded-2xl text-center">
        <p className="text-[12px] font-semibold text-[var(--label-secondary)] uppercase tracking-wide mb-2">Total Taxable Income</p>
        <p className="text-[40px] font-bold text-[#EF4444] tabular-nums leading-none">{formatCurrency(totalTaxableIncome || 0)}</p>
      </div>

      {/* 2-col grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Income Breakdown */}
        <div>
          <h4 className="text-[13px] font-semibold text-[var(--label-secondary)] uppercase tracking-wide mb-3">Income Breakdown</h4>
          <div className="space-y-3">
            {/* Taxable Interest */}
            <div className="p-3.5 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/60">
              <p className="text-[12px] text-[var(--label-tertiary)] mb-1">Taxable Interest</p>
              <p className="text-[22px] font-bold text-[var(--label-primary)] tabular-nums">{formatCompact(taxableInterestIncome || 0)}</p>
              <p className="text-[10px] text-[var(--label-quaternary)] mt-1">FD, RD interest — taxed at slab rate</p>
            </div>

            {/* Capital Gains */}
            <div className="p-3.5 bg-gradient-to-br from-[#F59E0B]/8 to-[#D97706]/4 border border-[#F59E0B]/15 rounded-xl">
              <p className="text-[12px] text-[var(--label-tertiary)] mb-1">Capital Gains (Unrealized)</p>
              <p className="text-[22px] font-bold text-[var(--label-primary)] tabular-nums">{formatCompact(totalCapitalGains || 0)}</p>
              <p className="text-[10px] text-[var(--label-quaternary)] mt-1">Equity gains — tax on sell only</p>
            </div>

            {/* Tax-Exempt Interest */}
            {(taxExemptInterestIncome || 0) > 0 && (
              <div className="p-3.5 bg-[#059669]/8 border border-[#059669]/15 rounded-xl">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-[12px] text-[var(--label-tertiary)]">Tax-Exempt Interest</p>
                  <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-[#10B981]/15 text-[#10B981]">EXEMPT</span>
                </div>
                <p className="text-[22px] font-bold text-[#059669] tabular-nums">{formatCompact(taxExemptInterestIncome)}</p>
                <p className="text-[10px] text-[#059669]/70 mt-1">PPF, EPF, VPF, SSY (EEE instruments)</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Interest Details */}
        {assetList.length > 0 && (
          <div>
            <h4 className="text-[13px] font-semibold text-[var(--label-secondary)] uppercase tracking-wide mb-3">Interest Details</h4>
            {/* Table header */}
            <div className="flex items-center gap-2 px-2 pb-2 border-b border-[var(--separator-opaque)] text-[10px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wide">
              <span className="flex-1 min-w-0">Asset</span>
              <span className="w-16 text-right shrink-0">Principal</span>
              <span className="w-16 text-right shrink-0">Interest</span>
              <span className="w-14 text-center shrink-0">Status</span>
            </div>
            <div className="space-y-0.5 mt-1">
              {displayAssets.map((asset, idx) => (
                <div key={idx} className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-[var(--fill-quaternary)] transition-colors">
                  <div className="flex-1 min-w-0 flex items-center gap-1.5">
                    <span className="text-[12px] font-medium text-[var(--label-primary)] truncate">{asset.name}</span>
                    <span className="px-1.5 py-0.5 text-[8px] font-semibold rounded bg-[var(--fill-tertiary)] text-[var(--label-tertiary)] uppercase shrink-0">
                      {asset.asset_type}
                    </span>
                  </div>
                  <span className="w-16 text-right text-[11px] text-[var(--label-tertiary)] tabular-nums shrink-0">
                    {formatCompact(asset.principal)}
                  </span>
                  <span className="w-16 text-right text-[11px] font-semibold text-[#059669] tabular-nums shrink-0">
                    {formatCompact(asset.interest)}
                  </span>
                  <span className="w-14 text-center shrink-0">
                    {asset.isTaxExempt ? (
                      <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-[#10B981]/15 text-[#10B981]">EXEMPT</span>
                    ) : (
                      <span className="px-1.5 py-0.5 text-[8px] font-semibold rounded bg-[var(--fill-tertiary)] text-[var(--label-tertiary)]">TAXABLE</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            {assetList.length > 5 && (
              <button
                onClick={() => setShowAllAssets(!showAllAssets)}
                className="mt-2 text-[12px] font-medium text-[var(--system-blue)] hover:text-[var(--system-blue)]/80 transition-colors"
              >
                {showAllAssets ? 'Show less' : `Show all ${assetList.length} assets`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <div className="mt-6 p-3 bg-[var(--fill-quaternary)] rounded-xl md:col-span-2">
        <div className="flex items-start gap-2">
          <svg className="w-4 h-4 text-[var(--label-quaternary)] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <p className="text-[11px] text-[var(--label-quaternary)] leading-relaxed">
            Estimated summary for reference only. Capital gains shown are unrealized. Please consult a tax professional for accurate calculations and filing.
          </p>
        </div>
      </div>
    </div>
  );
}
