import { motion } from 'framer-motion';
import { spring } from '../../utils/animations';

export default function ProgressBar({
  value = 0,
  max = 100,
  color = "var(--system-blue)",
  backgroundColor = "var(--system-gray-5)",
  height = 6,
  showLabel = false,
  labelPosition = "right", // right | top | bottom
  animated = true,
  className = "",
  label, // accessible label for screen readers
}) {
  const percent = Math.min(Math.max((value / max) * 100, 0), 100);

  const Label = () => (
    <span className="text-[14px] font-medium text-[var(--label-secondary)]" aria-hidden="true">
      {percent.toFixed(0)}%
    </span>
  );

  return (
    <div className={className}>
      {showLabel && labelPosition === "top" && (
        <div className="mb-1.5 flex justify-end">
          <Label />
        </div>
      )}
      <div className="flex items-center gap-3">
        <div
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={label || `${percent.toFixed(0)}% complete`}
          className="flex-1 rounded-full overflow-hidden"
          style={{ backgroundColor, height }}
        >
          <motion.div
            initial={animated ? { width: 0 } : { width: `${percent}%` }}
            animate={{ width: `${percent}%` }}
            transition={animated ? spring.gentle : { duration: 0 }}
            style={{ backgroundColor: color, height: '100%' }}
            className="rounded-full"
          />
        </div>
        {showLabel && labelPosition === "right" && <Label />}
      </div>
      {showLabel && labelPosition === "bottom" && (
        <div className="mt-1.5 flex justify-end">
          <Label />
        </div>
      )}
    </div>
  );
}

// Segmented progress bar (for multi-category)
export function SegmentedProgressBar({
  segments = [], // [{ value, color, label }]
  height = 8,
  showLabels = false,
  className = "",
  ariaLabel = "Distribution breakdown",
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className={className}>
      <div
        role="img"
        aria-label={ariaLabel}
        className="flex rounded-full overflow-hidden bg-[var(--system-gray-5)]"
        style={{ height }}
      >
        {segments.map((segment, index) => {
          const percent = total > 0 ? (segment.value / total) * 100 : 0;
          return (
            <motion.div
              key={index}
              initial={{ width: 0 }}
              animate={{ width: `${percent}%` }}
              transition={{ ...spring.gentle, delay: index * 0.05 }}
              style={{ backgroundColor: segment.color }}
              className="h-full first:rounded-l-full last:rounded-r-full"
              aria-hidden="true"
            />
          );
        })}
      </div>
      {showLabels && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3" role="list">
          {segments.map((segment, index) => (
            <div key={index} className="flex items-center gap-2" role="listitem">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: segment.color }}
                aria-hidden="true"
              />
              <span className="text-[14px] text-[var(--label-secondary)]">
                {segment.label}
              </span>
              <span className="text-[14px] font-medium text-[var(--label-primary)]">
                {((segment.value / total) * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Circular progress (minimal, Apple Watch style)
export function CircularProgress({
  value = 0,
  max = 100,
  size = 44,
  strokeWidth = 4,
  color = "var(--system-blue)",
  backgroundColor = "var(--system-gray-5)",
  showValue = false,
  label, // accessible label for screen readers
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const percent = Math.min(Math.max((value / max) * 100, 0), 100);
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label || `${percent.toFixed(0)}% complete`}
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="transform -rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={backgroundColor}
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={spring.gentle}
        />
      </svg>
      {showValue && (
        <span className="absolute text-[12px] font-semibold text-[var(--label-primary)]" aria-hidden="true">
          {percent.toFixed(0)}
        </span>
      )}
    </div>
  );
}
