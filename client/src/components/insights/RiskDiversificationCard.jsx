import { motion } from 'framer-motion';

export default function RiskDiversificationCard({
  assetsCount, diversificationScore, diversificationLevel,
  concentrationSubScore, categoryBalanceSubScore, assetSpreadSubScore,
  largestHoldingWeight, largestHoldingName, meaningfulCategories,
  missingCategories, riskRecommendation,
}) {
  const scoreColor = diversificationScore >= 70 ? 'var(--system-green)' : diversificationScore >= 50 ? 'var(--system-amber)' : 'var(--system-red)';
  const circumference = 2 * Math.PI * 70;
  const strokeDasharray = `${(diversificationScore / 100) * circumference} ${circumference}`;

  if (assetsCount === 0) {
    return (
      <div className="py-16 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--fill-quaternary)] flex items-center justify-center">
          <svg className="w-8 h-8 text-[var(--label-quaternary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </div>
        <p className="text-[15px] font-medium text-[var(--label-secondary)] mb-1">No Risk Data</p>
        <p className="text-[13px] text-[var(--label-tertiary)]">Add assets to see risk analysis</p>
      </div>
    );
  }

  const subScores = [
    {
      label: 'Concentration',
      score: concentrationSubScore,
      max: 35,
      desc: largestHoldingName
        ? `${largestHoldingName} is ${largestHoldingWeight.toFixed(0)}%`
        : 'No assets',
    },
    {
      label: 'Category Balance',
      score: categoryBalanceSubScore,
      max: 35,
      desc: `${meaningfulCategories} meaningful categor${meaningfulCategories === 1 ? 'y' : 'ies'}`,
    },
    {
      label: 'Asset Spread',
      score: assetSpreadSubScore,
      max: 30,
      desc: `${assetsCount} holding${assetsCount !== 1 ? 's' : ''}`,
    },
  ];

  return (
    <div>
      {/* Title */}
      <div className="mb-6">
        <h2 className="text-[18px] font-bold text-[var(--label-primary)]">Risk & Diversification</h2>
        <p className="text-[14px] text-[var(--label-tertiary)] mt-0.5">Portfolio health and diversification score</p>
      </div>

      {/* Hero: Large SVG Gauge */}
      <div className="flex justify-center mb-8">
        <div className="relative w-[180px] h-[180px]">
          <svg className="w-[180px] h-[180px] -rotate-90" viewBox="0 0 160 160">
            <circle cx="80" cy="80" r="70" fill="none" stroke="var(--fill-tertiary)" strokeWidth="8" />
            <motion.circle
              cx="80" cy="80" r="70" fill="none"
              stroke={scoreColor}
              strokeWidth="8" strokeLinecap="round"
              initial={{ strokeDasharray: `0 ${circumference}` }}
              animate={{ strokeDasharray }}
              transition={{ duration: 1.2, ease: [0.4, 0, 0.2, 1] }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[42px] font-bold text-[var(--label-primary)] tabular-nums leading-none" style={{ fontFamily: 'var(--font-display)' }}>{diversificationScore}</span>
            <span className="text-[14px] text-[var(--label-tertiary)] mt-1">out of 100</span>
          </div>
        </div>
      </div>

      {/* Level Badge */}
      <div className="flex justify-center mb-6">
        <div className={`inline-flex px-4 py-1.5 rounded-full text-[14px] font-semibold ${
          diversificationLevel === 'Good' ? 'bg-[var(--system-green)]/15 text-[var(--system-green)]' :
          diversificationLevel === 'Moderate' ? 'bg-[var(--system-amber)]/15 text-[var(--system-amber)]' :
          'bg-[var(--system-red)]/15 text-[var(--system-red)]'
        }`}>
          {diversificationLevel} Diversification
        </div>
      </div>

      {/* Grid: 2 columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Sub-Scores */}
        <div>
          <h4 className="text-[14px] font-semibold text-[var(--label-secondary)] uppercase tracking-wide mb-3">Sub-Scores</h4>
          <div className="space-y-3">
            {subScores.map(item => (
              <div key={item.label} className="p-3.5 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/60">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[14px] font-medium text-[var(--label-primary)]">{item.label}</span>
                  <span className="text-[15px] font-bold tabular-nums text-[var(--label-primary)]">{item.score}/{item.max}</span>
                </div>
                <div className="h-2.5 bg-[var(--fill-tertiary)] rounded-full overflow-hidden mb-2">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: item.score / item.max > 0.7 ? 'var(--system-green)' : item.score / item.max > 0.4 ? 'var(--system-amber)' : 'var(--system-red)' }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(item.score / item.max) * 100}%` }}
                    transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
                  />
                </div>
                <p className="text-[12px] text-[var(--label-tertiary)]">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Portfolio Health + Recommendation */}
        <div>
          <h4 className="text-[14px] font-semibold text-[var(--label-secondary)] uppercase tracking-wide mb-3">Portfolio Health</h4>
          <div className="space-y-3">
            {largestHoldingName && (
              <div className="p-3.5 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/60">
                <p className="text-[13px] text-[var(--label-tertiary)] mb-1">Largest Holding</p>
                <div className="flex items-center justify-between">
                  <p className="text-[15px] font-semibold text-[var(--label-primary)] truncate mr-3">{largestHoldingName}</p>
                  <p className="text-[20px] font-bold tabular-nums shrink-0" style={{ color: largestHoldingWeight > 30 ? 'var(--system-amber)' : 'var(--system-green)', fontFamily: 'var(--font-display)' }}>
                    {largestHoldingWeight.toFixed(1)}%
                  </p>
                </div>
              </div>
            )}
            {missingCategories && missingCategories.length > 0 && (
              <div className="p-3.5 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/60">
                <p className="text-[13px] text-[var(--label-tertiary)] mb-2">Not invested in</p>
                <div className="flex flex-wrap gap-1.5">
                  {missingCategories.map(cat => (
                    <span key={cat} className="px-2 py-1 text-[12px] font-medium bg-[var(--fill-tertiary)] text-[var(--label-secondary)] rounded-lg">
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendation */}
            {riskRecommendation && (
              <div className="p-3 bg-[var(--system-blue)]/5 border border-[var(--system-blue)]/15 rounded-xl">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-[var(--system-blue)] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                  </svg>
                  <p className="text-[13px] text-[var(--label-secondary)] leading-relaxed">{riskRecommendation}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
