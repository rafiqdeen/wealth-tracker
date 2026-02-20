import { motion } from 'framer-motion';
import { spring, tapScale, ease } from '../../utils/animations';

export default function Card({
  children,
  className = "",
  hoverable = false,
  tappable = false,
  padding = "p-4",
  glow = false,
  elevation = "raised", // flush, raised, floating
  onClick,
  as: Component = "div",
  ...props
}) {
  const MotionComponent = motion[Component] || motion.div;
  const isInteractive = !!onClick || hoverable;

  const elevationClasses = {
    flush: 'shadow-none',
    raised: 'shadow-[var(--shadow-raised)]',
    floating: 'shadow-[var(--shadow-floating)]',
  };

  // Subtle hover animation - minimal lift
  const hoverAnimation = hoverable ? {
    y: -2,
    boxShadow: '0 4px 16px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)',
  } : undefined;

  return (
    <MotionComponent
      whileHover={hoverAnimation}
      whileTap={tappable ? tapScale : undefined}
      transition={{ duration: 0.2, ease: ease?.smooth || [0.4, 0, 0.2, 1] }}
      onClick={onClick}
      role={isInteractive && onClick ? "button" : undefined}
      tabIndex={isInteractive && onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(e);
        }
      } : undefined}
      className={`
        bg-[var(--bg-primary)]
        rounded-2xl
        border border-[var(--separator-opaque)]/40
        ${elevationClasses[elevation] || elevationClasses.raised}
        transition-all duration-200
        ${padding}
        ${onClick ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chart-primary)] focus-visible:ring-offset-2' : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </MotionComponent>
  );
}

// Glass card with frosted effect
export function GlassCard({
  children,
  className = "",
  padding = "p-4",
  blur = "md",
  ...props
}) {
  const blurClasses = {
    sm: 'backdrop-blur-sm',
    md: 'backdrop-blur-md',
    lg: 'backdrop-blur-lg',
    xl: 'backdrop-blur-xl',
  };

  return (
    <div
      className={`
        bg-[var(--bg-primary)]/80
        ${blurClasses[blur]}
        rounded-xl
        border border-[var(--separator)]/10
        shadow-[var(--shadow-raised)]
        ${padding}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}

// Inset grouped card style (like iOS Settings)
export function InsetCard({ children, className = "", ...props }) {
  return (
    <div
      className={`
        bg-[var(--bg-primary)]
        rounded-lg
        overflow-hidden
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}

// Card header component
export function CardHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h3 className="text-[18px] font-semibold text-[var(--label-primary)]">
          {title}
        </h3>
        {subtitle && (
          <p className="text-[14px] text-[var(--label-secondary)] mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

// Stat card for numbers
export function StatCard({
  label,
  value,
  trend,
  trendValue,
  color = "var(--chart-primary)",
  className = ""
}) {
  const isPositive = trend === 'up';

  return (
    <Card className={`${className}`} padding="p-5" hoverable>
      <p className="text-[13px] font-medium text-[var(--label-tertiary)] uppercase tracking-wide mb-2">
        {label}
      </p>
      <p className="text-[26px] font-semibold text-[var(--label-primary)] tracking-tight">
        {value}
      </p>
      {trendValue && (
        <p className={`text-[14px] font-medium mt-1 ${isPositive ? 'text-[var(--system-green)]' : 'text-[var(--system-red)]'}`}>
          {isPositive ? '↑' : '↓'} {trendValue}
        </p>
      )}
    </Card>
  );
}
