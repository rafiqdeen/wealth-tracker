import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { spring, tapScale } from '../utils/animations';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import KeyboardShortcutsHelp from './KeyboardShortcutsHelp';
import DataBackup from './DataBackup';

export default function Layout() {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme, isHighContrast, toggleContrastMode } = useTheme();
  const location = useLocation();
  const { showHelp, setShowHelp } = useKeyboardShortcuts();
  const [showBackup, setShowBackup] = useState(false);

  const navItems = [
    {
      path: '/',
      label: 'Dashboard',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
      )
    },
    {
      path: '/assets',
      label: 'Assets',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      )
    },
    {
      path: '/goals',
      label: 'Goals',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
        </svg>
      )
    },
  ];

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      {/* Skip to main content - Accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-[var(--system-blue)] focus:text-white focus:rounded-lg focus:text-[14px] focus:font-medium"
      >
        Skip to main content
      </a>

      {/* Navigation - Clean & Professional */}
      <nav className="bg-[var(--bg-primary)] border-b border-[var(--separator)]/20 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14">
            <div className="flex items-center">
              {/* Logo */}
              <Link to="/" className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-[var(--system-blue)] rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                  </svg>
                </div>
                <span className="text-[17px] font-semibold text-[var(--label-primary)] hidden sm:block">
                  WealthTracker
                </span>
              </Link>

              {/* Desktop Navigation */}
              <div className="hidden sm:flex sm:ml-8 sm:space-x-1">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                  >
                    <motion.div
                      whileTap={tapScale}
                      transition={spring.snappy}
                      className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-[15px] font-medium rounded-lg transition-colors ${
                        isActive(item.path)
                          ? 'bg-[var(--fill-primary)] text-[var(--label-primary)]'
                          : 'text-[var(--label-secondary)] hover:bg-[var(--fill-tertiary)]'
                      }`}
                    >
                      {item.icon}
                      {item.label}
                    </motion.div>
                  </Link>
                ))}
              </div>
            </div>

            {/* User Menu */}
            <div className="flex items-center gap-1">
              {/* Contrast Toggle */}
              <motion.button
                whileTap={tapScale}
                transition={spring.snappy}
                onClick={toggleContrastMode}
                className={`p-2 rounded-lg transition-colors ${
                  isHighContrast
                    ? 'bg-[var(--system-blue)]/10 text-[var(--system-blue)]'
                    : 'text-[var(--label-secondary)] hover:bg-[var(--fill-tertiary)]'
                }`}
                aria-label={isHighContrast ? 'Switch to calm mode' : 'Switch to high contrast'}
                title={isHighContrast ? 'Calm Mode' : 'High Contrast'}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
                </svg>
              </motion.button>

              {/* Theme Toggle */}
              <motion.button
                whileTap={tapScale}
                transition={spring.snappy}
                onClick={toggleTheme}
                className="p-2 text-[var(--label-secondary)] hover:bg-[var(--fill-tertiary)] rounded-lg transition-colors"
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDark ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                  </svg>
                )}
              </motion.button>

              {/* Backup Button */}
              <motion.button
                whileTap={tapScale}
                transition={spring.snappy}
                onClick={() => setShowBackup(true)}
                className="p-2 text-[var(--label-secondary)] hover:bg-[var(--fill-tertiary)] rounded-lg transition-colors"
                aria-label="Data backup"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>
              </motion.button>

              <div className="hidden sm:flex items-center gap-2.5 pr-3 border-r border-[var(--separator)]/50">
                <div className="w-7 h-7 bg-[var(--system-blue)] rounded-full flex items-center justify-center">
                  <span className="text-[13px] font-semibold text-white">
                    {user?.name?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-[15px] text-[var(--label-secondary)]">{user?.name}</span>
              </div>
              <motion.button
                whileTap={tapScale}
                transition={spring.snappy}
                onClick={logout}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[15px] font-medium text-[var(--label-secondary)] hover:bg-[var(--fill-tertiary)] rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                </svg>
                <span className="hidden sm:inline">Sign Out</span>
              </motion.button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Navigation - Clean */}
      <div className="sm:hidden bg-[var(--bg-primary)] border-b border-[var(--separator)]/20 sticky top-14 z-30">
        <div className="flex justify-around px-2 py-1.5">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
            >
              <motion.div
                whileTap={tapScale}
                transition={spring.snappy}
                className={`flex flex-col items-center gap-0.5 px-6 py-1.5 rounded-lg transition-colors ${
                  isActive(item.path)
                    ? 'bg-[var(--fill-primary)] text-[var(--system-blue)]'
                    : 'text-[var(--label-secondary)]'
                }`}
              >
                {item.icon}
                <span className="text-[11px] font-medium">{item.label}</span>
              </motion.div>
            </Link>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>

      {/* Keyboard Shortcuts Help Modal */}
      <KeyboardShortcutsHelp isOpen={showHelp} onClose={() => setShowHelp(false)} />

      {/* Data Backup Modal */}
      <DataBackup isOpen={showBackup} onClose={() => setShowBackup(false)} />
    </div>
  );
}
