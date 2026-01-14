import { motion } from 'framer-motion';

/**
 * Skeleton - Animated placeholder for loading states
 */
export default function Skeleton({
  className = '',
  width,
  height,
  rounded = 'md', // none, sm, md, lg, full
  animate = true,
}) {
  const roundedClasses = {
    none: 'rounded-none',
    sm: 'rounded',
    md: 'rounded-lg',
    lg: 'rounded-xl',
    xl: 'rounded-2xl',
    full: 'rounded-full',
  };

  const style = {
    width: width || '100%',
    height: height || '1rem',
  };

  return (
    <motion.div
      className={`
        bg-[var(--fill-tertiary)]
        ${roundedClasses[rounded]}
        ${className}
      `}
      style={style}
      animate={animate ? {
        opacity: [0.5, 0.8, 0.5],
      } : undefined}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
}

/**
 * SkeletonText - Text line placeholder
 */
export function SkeletonText({
  lines = 1,
  className = '',
  lastLineWidth = '60%',
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height="0.875rem"
          width={i === lines - 1 && lines > 1 ? lastLineWidth : '100%'}
          rounded="sm"
        />
      ))}
    </div>
  );
}

/**
 * SkeletonCard - Full card loading placeholder
 */
export function SkeletonCard({ className = '' }) {
  return (
    <div className={`bg-[var(--bg-primary)] rounded-2xl border border-[var(--separator)]/10 p-4 ${className}`}>
      <div className="space-y-3">
        <Skeleton height="0.75rem" width="40%" rounded="sm" />
        <Skeleton height="2rem" width="60%" rounded="md" />
        <div className="flex gap-4 mt-4">
          <Skeleton height="0.75rem" width="25%" rounded="sm" />
          <Skeleton height="0.75rem" width="25%" rounded="sm" />
        </div>
      </div>
    </div>
  );
}

/**
 * SkeletonRow - Table row placeholder
 */
export function SkeletonRow({ columns = 4, className = '' }) {
  return (
    <div className={`flex items-center gap-4 px-4 py-3 ${className}`}>
      <div className="flex items-center gap-3 flex-1">
        <Skeleton width="2rem" height="2rem" rounded="lg" />
        <div className="flex-1 space-y-1.5">
          <Skeleton height="0.875rem" width="70%" rounded="sm" />
          <Skeleton height="0.75rem" width="40%" rounded="sm" />
        </div>
      </div>
      {Array.from({ length: columns - 1 }).map((_, i) => (
        <Skeleton key={i} width="4rem" height="1rem" rounded="sm" />
      ))}
    </div>
  );
}

/**
 * SkeletonChart - Chart placeholder
 */
export function SkeletonChart({ height = '200px', className = '' }) {
  return (
    <div className={`relative ${className}`} style={{ height }}>
      <Skeleton height="100%" rounded="lg" />
      <div className="absolute inset-0 flex items-end justify-around p-4 gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <motion.div
            key={i}
            className="bg-[var(--fill-secondary)] rounded-t"
            style={{
              width: '8%',
              height: `${30 + Math.random() * 50}%`,
            }}
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              delay: i * 0.1,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * DashboardSkeleton - Full dashboard loading state
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      {/* Portfolio card skeleton */}
      <div className="bg-[var(--bg-primary)] rounded-2xl border border-[var(--separator)]/10 p-5 pb-0">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
          <div className="space-y-2">
            <Skeleton height="0.75rem" width="100px" rounded="sm" />
            <Skeleton height="2.5rem" width="200px" rounded="md" />
            <Skeleton height="1rem" width="150px" rounded="sm" />
          </div>
          <div className="flex gap-6">
            <div className="space-y-1">
              <Skeleton height="0.625rem" width="50px" rounded="sm" />
              <Skeleton height="1.5rem" width="80px" rounded="md" />
            </div>
            <div className="space-y-1">
              <Skeleton height="0.625rem" width="50px" rounded="sm" />
              <Skeleton height="1.5rem" width="80px" rounded="md" />
            </div>
          </div>
        </div>
        <SkeletonChart height="200px" />
      </div>

      {/* Holdings and Allocation */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-[var(--bg-primary)] rounded-2xl border border-[var(--separator)]/10">
          <div className="p-4 border-b border-[var(--separator)]/20">
            <Skeleton height="1.25rem" width="100px" rounded="sm" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} columns={4} />
          ))}
        </div>
        <div className="bg-[var(--bg-primary)] rounded-2xl border border-[var(--separator)]/10 p-4">
          <Skeleton height="1.25rem" width="80px" rounded="sm" className="mb-4" />
          <div className="flex justify-center">
            <Skeleton width="150px" height="150px" rounded="full" />
          </div>
          <div className="space-y-2 mt-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton width="0.75rem" height="0.75rem" rounded="full" />
                  <Skeleton width="60px" height="0.75rem" rounded="sm" />
                </div>
                <Skeleton width="30px" height="0.75rem" rounded="sm" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * AssetsSkeleton - Assets page loading state
 */
export function AssetsSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonCard />
      <Skeleton height="2.5rem" rounded="lg" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-[var(--bg-primary)] rounded-2xl border border-[var(--separator)]/10">
          <div className="px-4 py-3 bg-[var(--fill-tertiary)]/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton width="1rem" height="1rem" rounded="sm" />
                <Skeleton width="0.625rem" height="0.625rem" rounded="full" />
                <Skeleton width="80px" height="1rem" rounded="sm" />
              </div>
              <Skeleton width="60px" height="1rem" rounded="sm" />
            </div>
          </div>
          {Array.from({ length: 3 }).map((_, j) => (
            <SkeletonRow key={j} columns={5} />
          ))}
        </div>
      ))}
    </div>
  );
}
