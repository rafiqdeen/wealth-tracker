import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PageSpinner } from '../components/apple';
import { spring, tapScale, panelVariants } from '../utils/animations';
import SidebarItem from '../components/shared/SidebarItem';
import useInsightsData from '../hooks/useInsightsData';
import {
  AssetAllocationCard,
  RiskDiversificationCard,
  BenchmarkComparisonCard,
  LiquidityAnalysisCard,
  GainersLosersCard,
  TaxImplicationsCard,
} from '../components/insights';

const SIDEBAR_ITEMS = [
  {
    id: 'asset_allocation',
    label: 'Allocation',
    color: '#3B82F6',
    icon: (props) => (
      <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
      </svg>
    ),
  },
  {
    id: 'risk_diversification',
    label: 'Risk',
    color: '#059669',
    icon: (props) => (
      <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
  {
    id: 'benchmark_comparison',
    label: 'Benchmark',
    color: '#8B5CF6',
    icon: (props) => (
      <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    id: 'liquidity_analysis',
    label: 'Liquidity',
    color: '#06B6D4',
    icon: (props) => (
      <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
  },
  {
    id: 'gainers_losers',
    label: 'Gainers & Losers',
    color: '#F59E0B',
    icon: (props) => (
      <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
  },
  {
    id: 'tax_implications',
    label: 'Tax',
    color: '#EF4444',
    icon: (props) => (
      <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" />
      </svg>
    ),
  },
];


function renderDetailPanel(activeCard, data) {
  switch (activeCard) {
    case 'asset_allocation':
      return (
        <AssetAllocationCard
          key="asset_allocation"
          allocationView={data.allocationView}
          setAllocationView={data.setAllocationView}
          activeAllocation={data.activeAllocation}
          totalCurrentValue={data.totalCurrentValue}
          totalInvested={data.totalInvested}
          totalGainPercent={data.totalGainPercent}
          categoryAllocation={data.categoryAllocation}
          meaningfulCategories={data.meaningfulCategories}
          assetsCount={data.assets.length}
        />
      );
    case 'risk_diversification':
      return (
        <RiskDiversificationCard
          key="risk_diversification"
          assetsCount={data.assets.length}
          diversificationScore={data.diversificationScore}
          diversificationLevel={data.diversificationLevel}
          concentrationSubScore={data.concentrationSubScore}
          categoryBalanceSubScore={data.categoryBalanceSubScore}
          assetSpreadSubScore={data.assetSpreadSubScore}
          largestHoldingWeight={data.largestHoldingWeight}
          largestHoldingName={data.largestHoldingName}
          meaningfulCategories={data.meaningfulCategories}
          missingCategories={data.missingCategories}
          riskRecommendation={data.riskRecommendation}
        />
      );
    case 'benchmark_comparison':
      return (
        <BenchmarkComparisonCard
          key="benchmark_comparison"
          assetsCount={data.assets.length}
          benchmarks={data.benchmarks}
          beatsBenchmark={data.beatsBenchmark}
          equityXIRR={data.equityXIRR}
          totalGainPercent={data.totalGainPercent}
          niftyReturn={data.niftyReturn}
          equityHoldingYears={data.equityHoldingYears}
          equityTotalReturn={data.equityTotalReturn}
          categoryReturns={data.categoryAllocation}
        />
      );
    case 'liquidity_analysis':
      return (
        <LiquidityAnalysisCard
          key="liquidity_analysis"
          assetsCount={data.assets.length}
          liquidPercent={data.liquidPercent}
          lockedPercent={data.lockedPercent}
          instantlyLiquidPercent={data.instantlyLiquidPercent}
          marketLiquidPercent={data.marketLiquidPercent}
          instantlyLiquidValue={data.instantlyLiquidValue}
          marketLiquidValue={data.marketLiquidValue}
          liquidValue={data.liquidValue}
          lockedValue={data.lockedValue}
          liquidAssets={data.liquidAssets}
          lockedAssets={data.lockedAssets}
          emergencyMonths={data.emergencyMonths}
          emergencyMonthsSafe={data.emergencyMonthsSafe}
          upcomingMaturity={data.upcomingMaturity}
          allMaturities={data.allMaturities}
          liquidityTierDetail={data.liquidityTierDetail}
          monthlyExpense={data.monthlyExpense}
          editingExpense={data.editingExpense}
          setEditingExpense={data.setEditingExpense}
          expenseInput={data.expenseInput}
          setExpenseInput={data.setExpenseInput}
          savingExpense={data.savingExpense}
          saveMonthlyExpense={data.saveMonthlyExpense}
          getAssetValue={data.boundGetAssetValue}
        />
      );
    case 'gainers_losers':
      return (
        <GainersLosersCard
          key="gainers_losers"
          assetsWithReturns={data.assetsWithReturns}
          topPerformers={data.topPerformers}
          assetsInLoss={data.assetsInLoss}
        />
      );
    case 'tax_implications':
      return (
        <TaxImplicationsCard
          key="tax_implications"
          hasEquityAssets={data.hasEquityAssets}
          ltcgGain={data.ltcgGain}
          stcgGain={data.stcgGain}
          ltcgLoss={data.ltcgLoss}
          stcgLoss={data.stcgLoss}
          ltcgAssetCount={data.ltcgAssetCount}
          stcgAssetCount={data.stcgAssetCount}
          ltcgTax={data.ltcgTax}
          stcgTax={data.stcgTax}
          ltcgExemptionUsed={data.ltcgExemptionUsed}
          ltcgExemptionRemaining={data.ltcgExemptionRemaining}
          ltcgExemptionPercent={data.ltcgExemptionPercent}
          taxableInterest={data.taxableInterest}
          taxExemptInterest={data.taxExemptInterest}
          realEstateCG={data.realEstateCG}
          taxBreakdownByAsset={data.taxBreakdownByAsset}
        />
      );
    default:
      return null;
  }
}

export default function Insights() {
  const data = useInsightsData();
  const [activeCard, setActiveCard] = useState('asset_allocation');

  if (data.loading) {
    return (
      <div className="p-4 md:px-12 md:py-6 flex-1 flex flex-col">
        <PageSpinner message="Loading assets..." />
      </div>
    );
  }

  const showPriceLoading = data.pricesLoading && !data.pricesLoaded;
  const visibleSidebarItems = SIDEBAR_ITEMS.filter(item => data.isCardVisible(item.id));

  // If active card got hidden, switch to first visible
  if (!data.isCardVisible(activeCard) && visibleSidebarItems.length > 0) {
    setActiveCard(visibleSidebarItems[0].id);
  }

  return (
    <div className="p-4 md:px-12 md:py-6 flex flex-col">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.gentle}
        className="mb-4 shrink-0"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] font-bold text-[var(--label-primary)]" style={{ fontFamily: 'var(--font-display)' }}>Portfolio Insights</h1>
            {showPriceLoading && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-[var(--fill-quaternary)] rounded-full text-[11px] text-[var(--label-tertiary)]">
                <span className="w-1.5 h-1.5 bg-[var(--system-blue)] rounded-full animate-pulse" />
                Fetching prices...
              </span>
            )}
          </div>
          <button
            onClick={data.openManageModal}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[var(--label-secondary)] hover:text-[var(--label-primary)] hover:bg-[var(--fill-tertiary)] rounded-lg transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0Z" />
            </svg>
            <span className="text-[13px] font-medium">Manage</span>
          </button>
        </div>
      </motion.div>

      {/* Mobile Tabs */}
      <div className="md:hidden overflow-x-auto flex gap-1.5 pb-3 shrink-0 -mx-1 px-1">
        {visibleSidebarItems.map(item => (
          <motion.button
            key={item.id}
            whileTap={tapScale}
            onClick={() => setActiveCard(item.id)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-medium transition-all ${
              activeCard === item.id
                ? 'text-white shadow-sm'
                : 'bg-[var(--fill-tertiary)] text-[var(--label-secondary)]'
            }`}
            style={activeCard === item.id ? { backgroundColor: item.color } : undefined}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </motion.button>
        ))}
      </div>

      {/* Sidebar + Detail Panel */}
      <div className="flex gap-0 flex-1">
        {/* Sidebar - hidden on mobile */}
        <nav className="hidden md:flex w-[220px] shrink-0 flex-col gap-1 pr-4 border-r border-[var(--separator-opaque)] mr-0 py-1 sticky top-0 self-start">
          {visibleSidebarItems.map(item => (
            <SidebarItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              active={activeCard === item.id}
              activeColor={item.color}
              onClick={() => setActiveCard(item.id)}
            />
          ))}
        </nav>

        {/* Detail Panel */}
        <div className="flex-1 md:pl-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeCard}
              variants={panelVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {renderDetailPanel(activeCard, data)}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Manage Cards Modal */}
      <AnimatePresence>
        {data.showManageModal && data.pendingPrefs && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={data.cancelPreferences}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="bg-[var(--bg-primary)] rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-[var(--separator-opaque)]">
                <h2 className="text-[17px] font-semibold text-[var(--label-primary)]">Manage Insight Cards</h2>
                <p className="text-[13px] text-[var(--label-tertiary)] mt-0.5">Choose which cards to display</p>
              </div>
              <div className="p-4 overflow-y-auto max-h-[50vh]">
                <div className="space-y-1">
                  {data.CARD_CONFIG.map((card) => (
                    <label key={card.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--fill-quaternary)] transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={data.pendingPrefs[card.id] !== false}
                        onChange={() => data.togglePendingPref(card.id)}
                        className="w-5 h-5 rounded border-2 border-[var(--separator-opaque)] text-[var(--system-blue)] focus:ring-[var(--system-blue)] focus:ring-offset-0 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-[var(--label-primary)]">{card.name}</p>
                        <p className="text-[12px] text-[var(--label-tertiary)]">{card.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="px-5 py-4 border-t border-[var(--separator-opaque)] flex items-center justify-between">
                <p className="text-[12px] text-[var(--label-tertiary)]">
                  {Object.values(data.pendingPrefs).filter(Boolean).length} of {data.CARD_CONFIG.length} cards selected
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={data.cancelPreferences} disabled={data.savingPrefs} className="px-4 py-2 text-[13px] font-medium text-[var(--label-secondary)] hover:bg-[var(--fill-quaternary)] rounded-lg transition-colors disabled:opacity-50">
                    Cancel
                  </button>
                  <button onClick={data.savePreferences} disabled={data.savingPrefs} className="px-4 py-2 text-[13px] font-medium text-white bg-[var(--system-blue)] hover:bg-[var(--system-blue)]/90 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2">
                    {data.savingPrefs ? (
                      <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</>
                    ) : 'Save'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
