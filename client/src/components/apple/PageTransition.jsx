import { motion } from 'framer-motion';
import { pageVariants, fadeUp, staggerContainer, staggerItem, spring } from '../../utils/animations';

// Wrap entire page content for enter/exit animations
export default function PageTransition({ children, className = "" }) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageVariants}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Fade up animation for sections/cards
export function FadeUp({ children, delay = 0, className = "" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring.gentle, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Container for staggered children
export function StaggerContainer({ children, className = "" }) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={staggerContainer}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Child item that animates within StaggerContainer
export function StaggerItem({ children, className = "" }) {
  return (
    <motion.div
      variants={staggerItem}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Animated list wrapper
export function AnimatedList({ children, className = "" }) {
  return (
    <motion.ul
      initial="initial"
      animate="animate"
      variants={staggerContainer}
      className={`space-y-2 ${className}`}
    >
      {children}
    </motion.ul>
  );
}

// Animated list item
export function AnimatedListItem({ children, className = "", onClick }) {
  return (
    <motion.li
      variants={staggerItem}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      onClick={onClick}
      className={`${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </motion.li>
  );
}

// Fade in when visible (intersection observer)
export function FadeInWhenVisible({ children, className = "" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={spring.gentle}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Scale in animation
export function ScaleIn({ children, delay = 0, className = "" }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ ...spring.snappy, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
