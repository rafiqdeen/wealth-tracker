// Apple-style spring animation configurations
// Mimics iOS UIKit spring physics

export const spring = {
  // Gentle - for page transitions, large movements (~250ms as per Apple HIG)
  gentle: {
    type: "spring",
    stiffness: 180,
    damping: 20,
    mass: 1
  },
  // Snappy - for buttons, small interactions (~150ms)
  snappy: {
    type: "spring",
    stiffness: 400,
    damping: 30,
    mass: 1
  },
};

// Page transition variants
export const pageVariants = {
  initial: {
    opacity: 0,
    y: 20,
    scale: 0.98
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: spring.gentle
  },
  exit: {
    opacity: 0,
    y: -10,
    scale: 0.99,
    transition: { duration: 0.15 }
  }
};

// Fade up animation (for cards, sections)
export const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: spring.gentle
  },
  exit: { opacity: 0, y: 10 }
};

// Fade in only
export const fadeIn = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.3 }
  },
  exit: { opacity: 0 }
};

// Scale fade (for modals, overlays)
export const scaleFade = {
  initial: { opacity: 0, scale: 0.95 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: spring.snappy
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.15 }
  }
};

// Stagger container - wrap children that should animate sequentially
export const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1
    }
  }
};

// Stagger item - use on children of staggerContainer
export const staggerItem = {
  initial: { opacity: 0, y: 15 },
  animate: {
    opacity: 1,
    y: 0,
    transition: spring.gentle
  }
};

// Button tap effect
export const tapScale = {
  scale: 0.97,
  transition: { duration: 0.1 }
};

// Card hover effect
export const cardHover = {
  y: -2,
  boxShadow: "0 8px 25px rgba(0, 0, 0, 0.08)",
  transition: spring.snappy
};

// List item hover
export const listItemHover = {
  backgroundColor: "rgba(0, 0, 0, 0.03)",
  transition: { duration: 0.15 }
};

// Slide from right (for drawers, sheets)
export const slideFromRight = {
  initial: { x: "100%" },
  animate: {
    x: 0,
    transition: spring.gentle
  },
  exit: {
    x: "100%",
    transition: { duration: 0.2 }
  }
};

// Slide from bottom (for bottom sheets)
export const slideFromBottom = {
  initial: { y: "100%" },
  animate: {
    y: 0,
    transition: spring.gentle
  },
  exit: {
    y: "100%",
    transition: { duration: 0.2 }
  }
};

// Number counting animation helper
export const countAnimation = {
  type: "spring",
  stiffness: 100,
  damping: 30
};

// Skeleton pulse animation (CSS keyframes alternative)
export const skeletonPulse = {
  animate: {
    opacity: [0.5, 1, 0.5],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: "easeInOut"
    }
  }
};

// Spinner rotation
export const spinnerRotate = {
  animate: {
    rotate: 360,
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: "linear"
    }
  }
};

// Progress bar animation
export const progressBar = (value) => ({
  initial: { width: 0 },
  animate: {
    width: `${value}%`,
    transition: spring.gentle
  }
});

// Checkbox check animation
export const checkmark = {
  initial: { pathLength: 0 },
  animate: {
    pathLength: 1,
    transition: { duration: 0.3, ease: "easeOut" }
  }
};
