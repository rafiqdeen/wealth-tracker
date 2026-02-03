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
