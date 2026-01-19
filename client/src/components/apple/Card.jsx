import { motion } from 'framer-motion';
import { spring, tapScale, ease } from '../../utils/animations';

export default function Card({
  children,
  className = "",
  hoverable = false,
  tappable = false,
  padding = "p-4",
  glow = false,
  onClick,
  as: Component = "div",
  ...props
}) {
  const MotionComponent = motion[Component] || motion.div;
  const isInteractive = !!onClick || hoverable;

  // Subtle hover animation - minimal lift
  const hoverAnimation = hoverable ? {
    y: -1,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
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
        rounded-xl
        border border-[var(--separator)]/8
        shadow-[0_1px_2px_rgba(0,0,0,0.02),0_1px_4px_rgba(0,0,0,0.03)]
        transition-shadow duration-200
        ${padding}
        ${onClick ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--system-blue)] focus-visible:ring-offset-2' : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </MotionComponent>
  );
}

// Glass card with frosted effect - more subtle
export function GlassCard({
  children,
  className = "",
  padding = "p-4",
  blur = "md", // sm, md, lg, xl
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
        shadow-[0_1px_4px_rgba(0,0,0,0.04)]
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
        <h3 className="text-[17px] font-semibold text-[var(--label-primary)]">
          {title}
        </h3>
        {subtitle && (
          <p className="text-[13px] text-[var(--label-secondary)] mt-0.5">
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
  color = "var(--system-blue)",
  className = ""
}) {
  const isPositive = trend === 'up';

  return (
    <Card className={`${className}`} padding="p-5" hoverable>
      <p className="text-[12px] font-medium text-[var(--label-tertiary)] uppercase tracking-wide mb-2">
        {label}
      </p>
      <p className="text-[26px] font-semibold text-[var(--label-primary)] tracking-tight">
        {value}
      </p>
      {trendValue && (
        <p className={`text-[13px] font-medium mt-1 ${isPositive ? 'text-[var(--system-green)]' : 'text-[var(--system-amber)]'}`}>
          {isPositive ? '↑' : '↓'} {trendValue}
        </p>
      )}
    </Card>
  );
}
