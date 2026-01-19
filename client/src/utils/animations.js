// Private Bank Digital - Calm, professional animations
// Reduced intensity for wealth management context

export const spring = {
  // Gentle - for page transitions, large movements
  gentle: {
    type: "spring",
    stiffness: 120,
    damping: 25,
    mass: 1
  },
  // Snappy - for buttons, small interactions
  snappy: {
    type: "spring",
    stiffness: 300,
    damping: 35,
    mass: 1
  },
};

// Smooth easing for non-spring animations
export const ease = {
  smooth: [0.4, 0, 0.2, 1],
  in: [0.4, 0, 1, 1],
  out: [0, 0, 0.2, 1],
};

// Page transition variants - subtle and professional
export const pageVariants = {
  initial: {
    opacity: 0,
    y: 8
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: ease.smooth
    }
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.15 }
  }
};

// Fade up animation (for cards, sections) - reduced movement
export const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.25,
      ease: ease.smooth
    }
  },
  exit: { opacity: 0, y: 5 }
};

// Fade in only
export const fadeIn = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.2, ease: ease.smooth }
  },
  exit: { opacity: 0 }
};

// Scale fade (for modals, overlays) - very subtle scale
export const scaleFade = {
  initial: { opacity: 0, scale: 0.98 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.2,
      ease: ease.smooth
    }
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: { duration: 0.15 }
  }
};

// Stagger container - reduced stagger delay
export const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.03,
      delayChildren: 0.05
    }
  }
};

// Stagger item - subtle movement
export const staggerItem = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.2,
      ease: ease.smooth
    }
  }
};

// Button tap effect - subtle
export const tapScale = {
  scale: 0.98,
  transition: { duration: 0.08 }
};

// Card hover effect - very subtle
export const cardHover = {
  y: -1,
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.06)",
  transition: { duration: 0.2, ease: ease.smooth }
};

// List item hover
export const listItemHover = {
  backgroundColor: "rgba(0, 0, 0, 0.02)",
  transition: { duration: 0.15 }
};

// Slide from right (for drawers, sheets)
export const slideFromRight = {
  initial: { x: "100%" },
  animate: {
    x: 0,
    transition: {
      duration: 0.25,
      ease: ease.smooth
    }
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
    transition: {
      duration: 0.25,
      ease: ease.smooth
    }
  },
  exit: {
    y: "100%",
    transition: { duration: 0.2 }
  }
};

// Number counting animation helper
export const countAnimation = {
  type: "spring",
  stiffness: 80,
  damping: 30
};

// Skeleton pulse animation
export const skeletonPulse = {
  animate: {
    opacity: [0.6, 1, 0.6],
    transition: {
      duration: 2,
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
    transition: {
      duration: 0.4,
      ease: ease.smooth
    }
  }
});

// Checkbox check animation
export const checkmark = {
  initial: { pathLength: 0 },
  animate: {
    pathLength: 1,
    transition: { duration: 0.25, ease: "easeOut" }
  }
};
