/**
 * Price Freshness Indicator Component
 *
 * Shows how fresh the price data is with color-coded indicators:
 * - Green: Fresh (< 1 hour old)
 * - Amber: Stale (1-6 hours old)
 * - Red: Old (> 6 hours old)
 *
 * Also shows the data source (Live, Cached, BSE, Google, Backup)
 */

import { useMemo } from 'react';

// Freshness thresholds in milliseconds
const FRESH_THRESHOLD = 60 * 60 * 1000;      // 1 hour
const STALE_THRESHOLD = 6 * 60 * 60 * 1000;  // 6 hours

/**
 * Get freshness info based on last update time
 */
function getFreshnessInfo(lastUpdated) {
  if (!lastUpdated) {
    return {
      status: 'unknown',
      color: 'var(--label-quaternary)',
      bgColor: 'var(--bg-tertiary)',
      label: 'Unknown'
    };
  }

  const now = Date.now();
  const updateTime = lastUpdated instanceof Date ? lastUpdated.getTime() : new Date(lastUpdated).getTime();
  const age = now - updateTime;

  if (age < FRESH_THRESHOLD) {
    return {
      status: 'fresh',
      color: '#059669',        // Green
      bgColor: 'rgba(5, 150, 105, 0.1)',
      label: 'Fresh'
    };
  } else if (age < STALE_THRESHOLD) {
    return {
      status: 'stale',
      color: '#D97706',        // Amber
      bgColor: 'rgba(217, 119, 6, 0.1)',
      label: 'Stale'
    };
  } else {
    return {
      status: 'old',
      color: '#DC2626',        // Red
      bgColor: 'rgba(220, 38, 38, 0.1)',
      label: 'Old'
    };
  }
}

/**
 * Format relative time (e.g., "2 min ago", "3 hours ago")
 */
function formatRelativeTime(date) {
  if (!date) return '';

  const now = Date.now();
  const time = date instanceof Date ? date.getTime() : new Date(date).getTime();
  const diffMs = now - time;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

/**
 * Get source label for display
 */
function getSourceLabel(source) {
  const sourceMap = {
    yahoo: 'Yahoo',
    bse: 'BSE',
    google: 'Google',
    mfapi: 'MFAPI',
    cached: 'Cached',
    stale: 'Backup',
    live: 'Live',
    close: 'Close'
  };
  return sourceMap[source?.toLowerCase()] || source || 'Live';
}

/**
 * Compact freshness indicator (dot only)
 */
export function FreshnessDot({ lastUpdated, size = 8, className = '' }) {
  const freshness = useMemo(() => getFreshnessInfo(lastUpdated), [lastUpdated]);

  return (
    <span
      className={`inline-block rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: freshness.color,
        boxShadow: `0 0 ${size / 2}px ${freshness.color}40`
      }}
      title={`${freshness.label} - ${formatRelativeTime(lastUpdated)}`}
    />
  );
}

/**
 * Badge showing freshness status and time
 */
export function FreshnessBadge({ lastUpdated, source, showSource = true, className = '' }) {
  const freshness = useMemo(() => getFreshnessInfo(lastUpdated), [lastUpdated]);
  const relativeTime = useMemo(() => formatRelativeTime(lastUpdated), [lastUpdated]);
  const sourceLabel = useMemo(() => getSourceLabel(source), [source]);

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${className}`}
      style={{
        backgroundColor: freshness.bgColor,
        color: freshness.color
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: freshness.color }}
      />
      <span>{relativeTime}</span>
      {showSource && source && (
        <>
          <span style={{ opacity: 0.5 }}>|</span>
          <span>{sourceLabel}</span>
        </>
      )}
    </span>
  );
}

/**
 * Combined badge showing freshness, source, and market status in one unified badge
 */
export function CombinedFreshnessBadge({ lastUpdated, source, marketStatus, className = '' }) {
  const freshness = useMemo(() => getFreshnessInfo(lastUpdated), [lastUpdated]);
  const relativeTime = useMemo(() => formatRelativeTime(lastUpdated), [lastUpdated]);
  const sourceLabel = useMemo(() => getSourceLabel(source), [source]);

  // Determine market status label
  const marketLabel = marketStatus?.isOpen ? 'Live' : (marketStatus?.reason || 'Closed');

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${className}`}
      style={{
        background: `linear-gradient(135deg, ${freshness.color}12, ${freshness.color}06)`,
        border: `1px solid ${freshness.color}18`
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{
          backgroundColor: freshness.color,
          boxShadow: `0 0 4px ${freshness.color}60`
        }}
      />
      <span style={{ color: freshness.color, fontWeight: 600 }}>{relativeTime}</span>
      <span style={{ color: 'var(--label-quaternary)' }}>·</span>
      <span style={{ color: 'var(--label-tertiary)' }}>{sourceLabel}</span>
      <span style={{ color: 'var(--label-quaternary)' }}>·</span>
      <span style={{ color: 'var(--label-tertiary)' }}>{marketLabel}</span>
    </span>
  );
}

/**
 * Full freshness indicator with label and time
 */
export function PriceFreshness({
  lastUpdated,
  source,
  marketStatus,
  variant = 'inline', // 'inline' | 'badge' | 'compact'
  className = ''
}) {
  const freshness = useMemo(() => getFreshnessInfo(lastUpdated), [lastUpdated]);
  const relativeTime = useMemo(() => formatRelativeTime(lastUpdated), [lastUpdated]);
  const sourceLabel = useMemo(() => getSourceLabel(source), [source]);

  if (variant === 'compact') {
    return <FreshnessDot lastUpdated={lastUpdated} className={className} />;
  }

  if (variant === 'badge') {
    return <FreshnessBadge lastUpdated={lastUpdated} source={source} className={className} />;
  }

  // Default: inline variant
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] ${className}`}>
      <FreshnessDot lastUpdated={lastUpdated} size={6} />
      <span style={{ color: 'var(--label-tertiary)' }}>
        {relativeTime}
        {source && (
          <span style={{ opacity: 0.7 }}> ({sourceLabel})</span>
        )}
      </span>
      {marketStatus && !marketStatus.isOpen && (
        <span
          className="px-1.5 py-0.5 rounded text-[9px] font-medium"
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--label-tertiary)'
          }}
        >
          {marketStatus.reason || 'Closed'}
        </span>
      )}
    </span>
  );
}

export default PriceFreshness;
