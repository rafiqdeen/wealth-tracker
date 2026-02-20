import { useEffect, useRef } from 'react';
import { motion, useSpring, useTransform, useInView } from 'framer-motion';

/**
 * AnimatedNumber - Animates a number counting up/down with spring physics
 *
 * @param {number} value - The target number to animate to
 * @param {string} format - Format type: 'currency', 'compact', 'percent', 'number'
 * @param {string} className - Additional CSS classes
 * @param {number} duration - Animation duration in seconds
 * @param {boolean} animate - Whether to animate (useful for disabling on preference)
 */
export default function AnimatedNumber({
  value = 0,
  format = 'number',
  className = '',
  duration = 0.8,
  animate = true,
  prefix = '',
  suffix = '',
  decimals = 0,
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });

  const spring = useSpring(0, {
    stiffness: 100,
    damping: 30,
    duration: duration * 1000,
  });

  const display = useTransform(spring, (current) => {
    const num = Math.abs(current);
    const sign = value < 0 ? '-' : (value > 0 && prefix.includes('+') ? '+' : '');
    const cleanPrefix = prefix.replace('+', '').replace('-', '');

    switch (format) {
      case 'currency':
        return `${sign}₹${formatIndian(num, decimals)}`;
      case 'compact':
        return `${sign}${cleanPrefix}${formatCompactNum(num)}`;
      case 'percent':
        return `${sign}${num.toFixed(decimals || 1)}%`;
      default:
        return `${sign}${cleanPrefix}${num.toFixed(decimals)}${suffix}`;
    }
  });

  useEffect(() => {
    if (isInView && animate) {
      spring.set(Math.abs(value));
    } else if (!animate) {
      spring.set(Math.abs(value));
    }
  }, [spring, value, isInView, animate]);

  // Format number in Indian numbering system
  function formatIndian(num, dec = 0) {
    if (num >= 10000000) return (num / 10000000).toFixed(1) + ' Cr';
    if (num >= 100000) return (num / 100000).toFixed(1) + ' L';
    if (num >= 1000) return (num / 1000).toFixed(1) + ' K';
    return num.toLocaleString('en-IN', { maximumFractionDigits: dec });
  }

  // Compact format
  function formatCompactNum(num) {
    if (num >= 10000000) return (num / 10000000).toFixed(1) + ' Cr';
    if (num >= 100000) return (num / 100000).toFixed(1) + ' L';
    if (num >= 1000) return '₹' + (num / 1000).toFixed(1) + ' K';
    return '₹' + num.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }

  return (
    <motion.span ref={ref} className={className}>
      {display}
    </motion.span>
  );
}

/**
 * AnimatedCounter - Simple counter that counts up from 0
 */
export function AnimatedCounter({
  value = 0,
  className = '',
  duration = 0.6,
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  const spring = useSpring(0, {
    stiffness: 100,
    damping: 30,
    duration: duration * 1000,
  });

  const display = useTransform(spring, (current) =>
    Math.round(current).toLocaleString('en-IN')
  );

  useEffect(() => {
    if (isInView) {
      spring.set(value);
    }
  }, [spring, value, isInView]);

  return (
    <motion.span ref={ref} className={className}>
      {display}
    </motion.span>
  );
}

/**
 * PnLDisplay - Displays P&L with color and animation
 */
export function PnLDisplay({
  value = 0,
  percent,
  format = 'compact',
  className = '',
  showSign = true,
  size = 'md', // sm, md, lg
}) {
  const isPositive = value >= 0;
  const colorClass = isPositive ? 'text-[var(--system-green)]' : 'text-[var(--system-red)]';

  const sizeClasses = {
    sm: 'text-[14px]',
    md: 'text-[16px]',
    lg: 'text-[18px]',
  };

  return (
    <span className={`font-semibold ${colorClass} ${sizeClasses[size]} ${className}`}>
      {showSign && (isPositive ? '+' : '')}
      <AnimatedNumber
        value={value}
        format={format}
        prefix={showSign ? (isPositive ? '+' : '-') : ''}
      />
      {percent !== undefined && (
        <span className="ml-1">
          ({isPositive ? '+' : ''}{percent.toFixed(1)}%)
        </span>
      )}
    </span>
  );
}
