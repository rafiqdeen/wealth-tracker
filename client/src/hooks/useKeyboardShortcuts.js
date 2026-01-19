import { useEffect, useCallback, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * Global keyboard shortcuts hook
 */
export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showHelp, setShowHelp] = useState(false);

  const handleKeyDown = useCallback((e) => {
    // Don't trigger shortcuts when typing in inputs
    const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    const hasModifier = e.metaKey || e.ctrlKey || e.altKey;

    // Always allow ? for help
    if (e.key === '?' && !isTyping) {
      e.preventDefault();
      setShowHelp(prev => !prev);
      return;
    }

    // Skip if typing in an input field (except for specific shortcuts)
    if (isTyping) return;

    // Navigation shortcuts (no modifier needed)
    switch (e.key.toLowerCase()) {
      case 'g':
        // Wait for next key
        const handleSecondKey = (e2) => {
          switch (e2.key.toLowerCase()) {
            case 'd':
              e2.preventDefault();
              navigate('/');
              break;
            case 'a':
              e2.preventDefault();
              navigate('/assets');
              break;
            case 'g':
              e2.preventDefault();
              navigate('/goals');
              break;
            case 'n':
              e2.preventDefault();
              navigate('/assets/add');
              break;
          }
          window.removeEventListener('keydown', handleSecondKey);
        };
        window.addEventListener('keydown', handleSecondKey, { once: true });
        // Clear listener after timeout
        setTimeout(() => window.removeEventListener('keydown', handleSecondKey), 1000);
        break;

      case 'n':
        // New asset
        if (!hasModifier) {
          e.preventDefault();
          navigate('/assets/add');
        }
        break;

      case '/':
        // Focus search (if on assets page)
        if (location.pathname === '/assets') {
          e.preventDefault();
          const searchInput = document.querySelector('input[type="text"][placeholder*="Search"]');
          searchInput?.focus();
        }
        break;

      case 'escape':
        // Close any open modal/sheet
        setShowHelp(false);
        document.activeElement?.blur();
        break;

      case 'r':
        // Refresh data (on dashboard)
        if (location.pathname === '/' && !hasModifier) {
          e.preventDefault();
          const refreshBtn = document.querySelector('button[title], button:has(svg.animate-spin)');
          if (refreshBtn && refreshBtn.textContent.includes('Refresh')) {
            refreshBtn.click();
          }
        }
        break;
    }

    // Cmd/Ctrl shortcuts
    if (e.metaKey || e.ctrlKey) {
      switch (e.key.toLowerCase()) {
        case 'k':
          // Command palette / search
          e.preventDefault();
          if (location.pathname === '/assets') {
            const searchInput = document.querySelector('input[type="text"][placeholder*="Search"]');
            searchInput?.focus();
          }
          break;
      }
    }
  }, [navigate, location.pathname]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return { showHelp, setShowHelp };
}

// Keyboard shortcuts data for help display
export const KEYBOARD_SHORTCUTS = [
  {
    category: 'Navigation',
    shortcuts: [
      { keys: ['g', 'd'], description: 'Go to Dashboard' },
      { keys: ['g', 'a'], description: 'Go to Assets' },
      { keys: ['g', 'g'], description: 'Go to Goals' },
      { keys: ['g', 'n'], description: 'Add new asset' },
    ]
  },
  {
    category: 'Actions',
    shortcuts: [
      { keys: ['n'], description: 'New asset' },
      { keys: ['r'], description: 'Refresh data (Dashboard)' },
      { keys: ['/'], description: 'Focus search (Assets)' },
      { keys: ['Esc'], description: 'Close modal / blur' },
    ]
  },
  {
    category: 'General',
    shortcuts: [
      { keys: ['?'], description: 'Show keyboard shortcuts' },
      { keys: ['Cmd', 'K'], description: 'Quick search' },
    ]
  },
];
