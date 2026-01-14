import { motion } from 'framer-motion';
import { spring, tapScale } from '../../utils/animations';

export default function Card({
  children,
  className = "",
  hoverable = false,
  tappable = false,
  padding = "p-4",
  glow = false, // New: adds subtle glow on hover
  onClick,
  as: Component = "div",
  ...props
}) {
  const MotionComponent = motion[Component] || motion.div;
  const isInteractive = !!onClick || hoverable;

  // Enhanced hover animation with lift and optional glow
  const hoverAnimation = hoverable ? {
    y: -2,
    boxShadow: glow
      ? '0 8px 30px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,122,255,0.1)'
      : '0 8px 30px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.08)',
  } : undefined;

  return (
    <MotionComponent
      whileHover={hoverAnimation}
      whileTap={tappable ? tapScale : undefined}
      transition={spring.snappy}
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
        border border-[var(--separator)]/10
        shadow-[0_1px_2px_rgba(0,0,0,0.04),0_2px_8px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.06)]
        transition-shadow duration-300
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

// Glass card with frosted effect
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
        bg-[var(--bg-primary)]/70
        ${blurClasses[blur]}
        rounded-2xl
        border border-white/20
        shadow-[0_4px_24px_rgba(0,0,0,0.08)]
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
        rounded-xl
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
      <p className="text-[13px] font-medium text-[var(--label-secondary)] uppercase tracking-wide mb-2">
        {label}
      </p>
      <p className="text-[28px] font-light text-[var(--label-primary)] tracking-tight">
        {value}
      </p>
      {trendValue && (
        <p className={`text-[13px] font-medium mt-1 ${isPositive ? 'text-[var(--system-green)]' : 'text-[var(--system-red)]'}`}>
          {isPositive ? '↑' : '↓'} {trendValue}
        </p>
      )}
    </Card>
  );
}
