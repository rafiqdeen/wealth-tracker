import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: -20 },
  visible: { opacity: 1, scale: 1, y: 0 },
};

export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  size = 'md', // sm, md, lg, xl
  showCloseButton = true,
}) {
  const modalRef = useRef(null);

  // Size classes
  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

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

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    };
    if (isOpen) {
      // Delay to prevent immediate close on open
      const timer = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);
      return () => {
        clearTimeout(timer);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
          />

          {/* Modal Container - Centered */}
          <div className="fixed inset-0 flex items-center justify-center z-[101] p-4">
            <motion.div
              ref={modalRef}
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className={`w-full ${sizeClasses[size]} bg-[var(--bg-primary)] rounded-2xl shadow-2xl overflow-hidden`}
            >
              {/* Header */}
              {(title || showCloseButton) && (
                <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-[var(--separator-opaque)]">
                  <div className="flex-1 min-w-0 pr-4">
                    {title && (
                      <h2 className="text-[18px] font-semibold text-[var(--label-primary)]">
                        {title}
                      </h2>
                    )}
                    {subtitle && (
                      <p className="text-[14px] text-[var(--label-tertiary)] mt-0.5">
                        {subtitle}
                      </p>
                    )}
                  </div>
                  {showCloseButton && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={onClose}
                      className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--fill-tertiary)] text-[var(--label-tertiary)] hover:bg-[var(--fill-secondary)] hover:text-[var(--label-secondary)] transition-colors shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </motion.button>
                  )}
                </div>
              )}

              {/* Content */}
              <div className="max-h-[calc(85vh-80px)] overflow-y-auto">
                {children}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

// Compact Modal variant for simpler dialogs
export function CompactModal({
  isOpen,
  onClose,
  children,
  size = 'sm',
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      showCloseButton={false}
      size={size}
    >
      {children}
    </Modal>
  );
}

// Confirmation Dialog
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default', // default, danger
}) {
  const buttonClass = variant === 'danger'
    ? 'bg-[var(--system-red)] text-white hover:bg-[var(--system-red)]/90'
    : 'bg-[var(--sidebar-active)] text-white hover:opacity-90';

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" showCloseButton={false}>
      <div className="p-5">
        {title && (
          <h3 className="text-[18px] font-semibold text-[var(--label-primary)] mb-2">
            {title}
          </h3>
        )}
        {message && (
          <p className="text-[15px] text-[var(--label-secondary)] mb-5">
            {message}
          </p>
        )}
        <div className="flex gap-3">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl font-medium text-[15px] bg-[var(--fill-tertiary)] text-[var(--label-primary)] hover:bg-[var(--fill-secondary)] transition-colors"
          >
            {cancelLabel}
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              onConfirm?.();
              onClose();
            }}
            className={`flex-1 py-2.5 px-4 rounded-xl font-medium text-[15px] transition-colors ${buttonClass}`}
          >
            {confirmLabel}
          </motion.button>
        </div>
      </div>
    </Modal>
  );
}
