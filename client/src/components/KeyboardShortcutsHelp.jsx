import { motion, AnimatePresence } from 'framer-motion';
import { KEYBOARD_SHORTCUTS } from '../hooks/useKeyboardShortcuts';

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0 },
};

function KeyBadge({ children }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 bg-[var(--fill-tertiary)] border border-[var(--separator)]/30 rounded-md text-[12px] font-medium text-[var(--label-secondary)] shadow-sm">
      {children}
    </kbd>
  );
}

export default function KeyboardShortcutsHelp({ isOpen, onClose }) {
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
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-[var(--bg-primary)] rounded-2xl shadow-2xl z-[101] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--separator)]/30">
              <h2 className="text-[17px] font-semibold text-[var(--label-primary)]">Keyboard Shortcuts</h2>
              <button
                onClick={onClose}
                className="p-2 -mr-2 text-[var(--label-tertiary)] hover:text-[var(--label-secondary)] hover:bg-[var(--fill-tertiary)] rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
              {KEYBOARD_SHORTCUTS.map((group, i) => (
                <div key={group.category} className={i > 0 ? 'mt-5' : ''}>
                  <h3 className="text-[11px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider mb-3">
                    {group.category}
                  </h3>
                  <div className="space-y-2.5">
                    {group.shortcuts.map((shortcut, j) => (
                      <div key={j} className="flex items-center justify-between">
                        <span className="text-[14px] text-[var(--label-secondary)]">
                          {shortcut.description}
                        </span>
                        <div className="flex items-center gap-1">
                          {shortcut.keys.map((key, k) => (
                            <span key={k} className="flex items-center gap-1">
                              <KeyBadge>
                                {key === 'Cmd' ? '⌘' : key === 'Ctrl' ? 'Ctrl' : key}
                              </KeyBadge>
                              {k < shortcut.keys.length - 1 && shortcut.keys.length === 2 && shortcut.keys[0] !== 'g' && (
                                <span className="text-[11px] text-[var(--label-quaternary)]">+</span>
                              )}
                              {k < shortcut.keys.length - 1 && shortcut.keys[0] === 'g' && (
                                <span className="text-[11px] text-[var(--label-quaternary)]">then</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-[var(--fill-tertiary)]/50 border-t border-[var(--separator)]/30">
              <p className="text-[12px] text-[var(--label-tertiary)] text-center">
                Press <KeyBadge>?</KeyBadge> to toggle this help
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
