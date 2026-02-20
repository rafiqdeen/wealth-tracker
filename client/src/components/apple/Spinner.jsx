import { motion } from 'framer-motion';

export default function Spinner({
  size = "md", // sm | md | lg
  color = "blue", // blue | gray | white
  className = "",
  label = "Loading",
}) {
  const sizes = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-10 h-10",
  };

  const colors = {
    blue: "text-[var(--system-blue)]",
    gray: "text-[var(--system-gray)]",
    white: "text-white",
  };

  return (
    <motion.svg
      role="status"
      aria-label={label}
      className={`${sizes[size]} ${colors[color]} ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      animate={{ rotate: 360 }}
      transition={{
        duration: 1,
        repeat: Infinity,
        ease: "linear"
      }}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.2"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </motion.svg>
  );
}

// Full page loading spinner
export function PageSpinner({ message }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={message || "Loading"}
      className="flex-1 flex flex-col items-center justify-center gap-4"
    >
      <Spinner size="lg" label={message || "Loading"} />
      {message && (
        <p className="text-[15px] text-[var(--label-secondary)]" aria-hidden="true">{message}</p>
      )}
    </div>
  );
}

// Inline loading indicator
export function InlineSpinner({ size = "sm", label = "Loading" }) {
  return (
    <span className="inline-flex items-center" role="status" aria-busy="true">
      <Spinner size={size} label={label} />
    </span>
  );
}
