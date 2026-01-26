import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const sheetVariants = {
  hidden: { y: '100%' },
  visible: { y: 0 },
};

export default function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  maxHeight = '85vh',
  maxWidth,
}) {
  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEscape);
    }
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Desktop modal variants (centered, scales in)
  const desktopSheetVariants = {
    hidden: { opacity: 0, scale: 0.95, y: 20 },
    visible: { opacity: 1, scale: 1, y: 0 },
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
            onClick={onClose}
          />

          {/* Sheet - Centered modal on desktop when maxWidth is set */}
          <motion.div
            variants={maxWidth ? desktopSheetVariants : sheetVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            className={`fixed z-[70] bg-[var(--bg-primary)] shadow-2xl ${
              maxWidth
                ? 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl w-[calc(100%-32px)]'
                : 'bottom-0 left-0 right-0 rounded-t-3xl'
            }`}
            style={{
              maxHeight,
              ...(maxWidth && { maxWidth })
            }}
          >
            {/* Handle bar - only show on mobile/non-maxWidth */}
            {!maxWidth && (
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 rounded-full bg-[var(--fill-secondary)]" />
              </div>
            )}

            {/* Header */}
            {title && (
              <div className={`flex items-center justify-between px-5 border-b border-[var(--separator)]/30 ${maxWidth ? 'py-4' : 'pb-3'}`}>
                <h2 className="text-[17px] font-semibold text-[var(--label-primary)]">{title}</h2>
                <button
                  onClick={onClose}
                  className="p-2 -mr-2 text-[var(--label-tertiary)] hover:text-[var(--label-secondary)] hover:bg-[var(--fill-tertiary)] rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* Content */}
            <div className="overflow-y-auto" style={{ maxHeight: `calc(${maxHeight} - ${maxWidth ? '70px' : '60px'})` }}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
