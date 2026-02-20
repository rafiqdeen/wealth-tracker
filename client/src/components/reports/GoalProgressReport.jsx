import { useState } from 'react';
import { motion } from 'framer-motion';
import { formatCurrency, formatCompact } from '../../utils/formatting';

export default function GoalProgressReport({ goals, summary }) {
  const [showAllGoals, setShowAllGoals] = useState(false);

  if (!goals || goals.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--fill-quaternary)] flex items-center justify-center">
          <svg className="w-8 h-8 text-[var(--label-quaternary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
          </svg>
        </div>
        <p className="text-[14px] font-medium text-[var(--label-secondary)] mb-1">No Goals</p>
        <p className="text-[12px] text-[var(--label-tertiary)]">Create goals to track your financial progress</p>
      </div>
    );
  }

  const totalGoals = summary?.total || goals.length;
  const completed = summary?.completed || 0;
  const totalTarget = summary?.totalTarget || 0;
  const totalProgress = summary?.totalProgress || 0;
  const overallPercent = totalTarget > 0 ? Math.min((totalProgress / totalTarget) * 100, 100) : 0;

  const scoreColor = overallPercent >= 70 ? '#10B981' : overallPercent >= 40 ? '#F59E0B' : '#EF4444';
  const circumference = 2 * Math.PI * 70;
  const strokeDasharray = `${(overallPercent / 100) * circumference} ${circumference}`;

  const level = overallPercent >= 70 ? 'On Track' : overallPercent >= 40 ? 'Needs Attention' : 'Getting Started';
  const levelColor = overallPercent >= 70 ? '#10B981' : overallPercent >= 40 ? '#F59E0B' : '#EF4444';

  const displayGoals = showAllGoals ? goals : goals.slice(0, 5);
  const behindSchedule = goals.filter(g => (g.progress || 0) < 50 && (g.progress || 0) > 0).length;

  return (
    <div>
      {/* Title */}
      <div className="mb-6">
        <h2 className="text-[18px] font-bold text-[var(--label-primary)]">Goal Progress</h2>
        <p className="text-[13px] text-[var(--label-tertiary)] mt-0.5">{totalGoals} goals, {completed} completed</p>
      </div>

      {/* Hero: SVG Circular Gauge */}
      <div className="flex justify-center mb-4">
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
            <span className="text-[42px] font-bold text-[var(--label-primary)] tabular-nums leading-none">{overallPercent.toFixed(0)}</span>
            <span className="text-[13px] text-[var(--label-tertiary)] mt-1">percent</span>
          </div>
        </div>
      </div>

      {/* Level Badge */}
      <div className="flex justify-center mb-6">
        <div className={`inline-flex px-4 py-1.5 rounded-full text-[13px] font-semibold`} style={{ backgroundColor: `${levelColor}20`, color: levelColor }}>
          {level}
        </div>
      </div>

      {/* 2-col grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Goals */}
        <div>
          <h4 className="text-[13px] font-semibold text-[var(--label-secondary)] uppercase tracking-wide mb-3">Goals</h4>
          <div className="space-y-2">
            {displayGoals.map((goal, index) => {
              const progress = goal.progress || 0;
              const progressColor = progress >= 100 ? '#10B981' : progress >= 50 ? '#F59E0B' : goal.categoryConfig?.color || '#6B7280';
              const statusLabel = progress >= 100 ? 'Completed' : progress >= 75 ? 'Almost' : progress >= 25 ? 'In Progress' : 'Started';
              const statusBg = progress >= 100 ? 'bg-[#10B981]/15 text-[#10B981]' : progress >= 50 ? 'bg-[#F59E0B]/15 text-[#F59E0B]' : 'bg-[var(--fill-tertiary)] text-[var(--label-tertiary)]';
              return (
                <div key={goal.id || index} className="p-3.5 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/60">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[13px] font-medium text-[var(--label-primary)] truncate mr-2">{goal.name}</p>
                    <span className={`px-1.5 py-0.5 text-[9px] font-semibold rounded uppercase tracking-wide shrink-0 ${statusBg}`}>
                      {statusLabel}
                    </span>
                  </div>
                  <div className="h-2 bg-[var(--fill-tertiary)] rounded-full overflow-hidden mb-2">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: progressColor }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(progress, 100)}%` }}
                      transition={{ duration: 0.6, delay: index * 0.08 }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[var(--label-tertiary)] tabular-nums">{formatCompact(goal.current_value || 0)} saved</span>
                    <span className="text-[var(--label-secondary)] tabular-nums">Target: {formatCompact(goal.target_amount || 0)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {goals.length > 5 && (
            <button
              onClick={() => setShowAllGoals(!showAllGoals)}
              className="mt-2 text-[12px] font-medium text-[var(--system-blue)] hover:text-[var(--system-blue)]/80 transition-colors"
            >
              {showAllGoals ? 'Show less' : `Show all ${goals.length} goals`}
            </button>
          )}
        </div>

        {/* Right: Summary */}
        <div>
          <h4 className="text-[13px] font-semibold text-[var(--label-secondary)] uppercase tracking-wide mb-3">Summary</h4>
          <div className="space-y-3">
            {/* Completed / Total */}
            <div className="p-3.5 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/60">
              <p className="text-[12px] text-[var(--label-tertiary)] mb-1">Completed</p>
              <div className="flex items-baseline gap-1">
                <span className="text-[28px] font-bold text-[#10B981] tabular-nums">{completed}</span>
                <span className="text-[14px] text-[var(--label-tertiary)] tabular-nums">/ {totalGoals}</span>
              </div>
            </div>

            {/* Total Saved vs Target */}
            <div className="p-3.5 bg-[var(--bg-secondary)] rounded-xl border border-[var(--separator-opaque)]/60">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[12px] text-[var(--label-tertiary)]">Total Saved vs Target</p>
                <p className="text-[13px] font-bold tabular-nums text-[var(--label-primary)]">{overallPercent.toFixed(0)}%</p>
              </div>
              <div className="h-2.5 bg-[var(--fill-tertiary)] rounded-full overflow-hidden mb-2">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: scoreColor }}
                  initial={{ width: 0 }}
                  animate={{ width: `${overallPercent}%` }}
                  transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--label-tertiary)]">
                <span className="tabular-nums">{formatCompact(totalProgress)} saved</span>
                <span className="tabular-nums">{formatCompact(totalTarget)} target</span>
              </div>
            </div>

            {/* Info callout if behind schedule */}
            {behindSchedule > 0 && (
              <div className="p-3 bg-[var(--system-orange)]/8 border border-[var(--system-orange)]/15 rounded-xl">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-[var(--system-orange)] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-[11px] text-[var(--system-orange)] leading-relaxed">
                    {behindSchedule} goal{behindSchedule !== 1 ? 's' : ''} below 50% — consider increasing your contributions
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
