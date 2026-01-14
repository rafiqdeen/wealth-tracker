import { motion } from 'framer-motion';
import { spring, tapScale } from '../../utils/animations';
import Spinner from './Spinner';

export default function Button({
  children,
  variant = "filled", // filled | tinted | gray | plain | destructive
  size = "md",        // sm | md | lg
  disabled = false,
  loading = false,
  fullWidth = false,
  icon,
  iconPosition = "left",
  onClick,
  type = "button",
  className = "",
  ...props
}) {
  const variants = {
    filled: "bg-[var(--system-blue)] text-white hover:bg-[#0066d6]",
    tinted: "bg-[var(--system-blue)]/10 text-[var(--system-blue)] hover:bg-[var(--system-blue)]/15",
    gray: "bg-[var(--fill-primary)] text-[var(--label-primary)] hover:bg-[var(--fill-secondary)]",
    plain: "bg-transparent text-[var(--system-blue)] hover:bg-[var(--system-blue)]/5",
    destructive: "bg-[var(--system-red)] text-white hover:bg-[#e6352b]",
    destructiveTinted: "bg-[var(--system-red)]/10 text-[var(--system-red)] hover:bg-[var(--system-red)]/15",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-[15px] rounded-lg",
    md: "px-4 py-2.5 text-[17px] rounded-[10px]",
    lg: "px-6 py-3.5 text-[17px] rounded-xl",
  };

  const content = (
    <>
      {loading ? (
        <Spinner size="sm" color={variant === 'filled' || variant === 'destructive' ? 'white' : 'blue'} />
      ) : (
        <>
          {icon && iconPosition === "left" && <span className="mr-2">{icon}</span>}
          {children}
          {icon && iconPosition === "right" && <span className="ml-2">{icon}</span>}
        </>
      )}
    </>
  );

  return (
    <motion.button
      whileTap={!disabled && !loading ? tapScale : undefined}
      transition={spring.snappy}
      disabled={disabled || loading}
      onClick={onClick}
      type={type}
      className={`
        ${variants[variant]}
        ${sizes[size]}
        font-semibold
        inline-flex items-center justify-center
        transition-colors duration-150
        focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--system-blue)] focus-visible:ring-offset-2
        ${fullWidth ? 'w-full' : ''}
        ${disabled || loading ? 'opacity-40 cursor-not-allowed' : ''}
        ${className}
      `}
      {...props}
    >
      {content}
    </motion.button>
  );
}

// Icon-only button
export function IconButton({
  icon,
  variant = "gray",
  size = "md",
  disabled = false,
  onClick,
  label,
  className = "",
  ...props
}) {
  const variants = {
    filled: "bg-[var(--system-blue)] text-white",
    gray: "bg-[var(--fill-primary)] text-[var(--label-primary)] hover:bg-[var(--fill-secondary)]",
    plain: "bg-transparent text-[var(--label-secondary)] hover:bg-[var(--fill-tertiary)]",
  };

  const sizes = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-12 h-12",
  };

  return (
    <motion.button
      whileTap={!disabled ? tapScale : undefined}
      transition={spring.snappy}
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className={`
        ${variants[variant]}
        ${sizes[size]}
        rounded-full
        inline-flex items-center justify-center
        transition-colors duration-150
        focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--system-blue)] focus-visible:ring-offset-2
        ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
        ${className}
      `}
      {...props}
    >
      {icon}
    </motion.button>
  );
}

// Link-style button
export function TextButton({
  children,
  onClick,
  disabled = false,
  destructive = false,
  className = "",
  ...props
}) {
  return (
    <motion.button
      whileTap={!disabled ? { scale: 0.98 } : undefined}
      onClick={onClick}
      disabled={disabled}
      className={`
        text-[17px] font-normal
        focus:outline-none focus-visible:underline
        ${destructive ? 'text-[var(--system-red)]' : 'text-[var(--system-blue)]'}
        ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </motion.button>
  );
}
