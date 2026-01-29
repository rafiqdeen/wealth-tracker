import { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { spring, tapScale } from '../utils/animations';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import KeyboardShortcutsHelp from './KeyboardShortcutsHelp';
import DataBackup from './DataBackup';
import SearchModal from './SearchModal';
import { priceService } from '../services/assets';

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const { showHelp, setShowHelp } = useKeyboardShortcuts();
  const [showBackup, setShowBackup] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showProfilePopover, setShowProfilePopover] = useState(false);
  const [marketStatus, setMarketStatus] = useState(null);
  const profilePopoverRef = useRef(null);

  // Fetch market status on mount
  useEffect(() => {
    const fetchMarketStatus = async () => {
      try {
        const response = await priceService.getMarketStatus();
        setMarketStatus(response.data);
      } catch (error) {
        console.error('Failed to fetch market status:', error);
      }
    };
    fetchMarketStatus();
  }, []);

  // Close profile popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profilePopoverRef.current && !profilePopoverRef.current.contains(event.target)) {
        setShowProfilePopover(false);
      }
    };

    if (showProfilePopover) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfilePopover]);

  // Keyboard shortcut for search (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const navItems = [
    {
      path: '/',
      label: 'Dashboard',
      icon: (
        <svg className="w-[22px] h-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
      )
    },
    {
      path: '/assets',
      label: 'Assets',
      icon: (
        <svg className="w-[22px] h-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      )
    },
    {
      path: '/insights',
      label: 'Insights',
      icon: (
        <svg className="w-[22px] h-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      )
    },
    {
      path: '/goals',
      label: 'Goals',
      icon: (
        <svg className="w-[22px] h-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
        </svg>
      )
    },
    {
      path: '/reports',
      label: 'Reports',
      icon: (
        <svg className="w-[22px] h-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      )
    },
  ];

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="h-screen bg-[var(--bg-page)] flex overflow-hidden">
      {/* Skip to main content - Accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[var(--sidebar-active)] focus:text-white focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      {/* Sidebar - OUTSIDE the white container, in the page background */}
      <aside className="hidden md:flex flex-col items-center w-[82px] py-6 shrink-0">
        {/* Logo - Top */}
        <Link to="/" className="w-11 h-11 bg-[var(--sidebar-active)] rounded-xl flex items-center justify-center">
          <svg className="w-[22px] h-[22px] text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
          </svg>
        </Link>

        {/* Main Nav - VERTICALLY CENTERED in the middle */}
        <nav className="flex-1 flex flex-col items-center justify-center gap-2">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className="group relative"
            >
              <motion.div
                whileTap={tapScale}
                transition={spring.snappy}
                className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                  isActive(item.path)
                    ? 'bg-[var(--sidebar-active)] text-white'
                    : 'bg-[#DCDEE3] text-[#454954] hover:bg-[#d0d2d8] hover:text-[var(--label-primary)]'
                }`}
              >
                {item.icon}
              </motion.div>
              {/* Tooltip */}
              <div className="absolute left-full ml-3 px-3 py-1.5 bg-[var(--sidebar-active)] text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                {item.label}
              </div>
            </Link>
          ))}
        </nav>

        {/* Bottom Section - Settings and User */}
        <div className="flex flex-col items-center gap-2">
          {/* Backup & Export */}
          <motion.button
            whileTap={tapScale}
            transition={spring.snappy}
            onClick={() => setShowBackup(true)}
            className="group relative w-11 h-11 rounded-xl flex items-center justify-center bg-[#DCDEE3] text-[#454954] hover:bg-[#d0d2d8] hover:text-[var(--label-primary)] transition-all"
          >
            <svg className="w-[22px] h-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <div className="absolute left-full ml-3 px-3 py-1.5 bg-[var(--sidebar-active)] text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
              Backup & Export
            </div>
          </motion.button>

          {/* User Avatar */}
          <div className="relative mt-1" ref={profilePopoverRef}>
            <button
              onClick={() => setShowProfilePopover(!showProfilePopover)}
              className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold text-sm hover:opacity-90 transition-opacity overflow-hidden ring-2 ring-white/30"
            >
              {user?.name?.charAt(0).toUpperCase()}
            </button>

            {/* Profile Popover */}
            <AnimatePresence>
              {showProfilePopover && (
                <motion.div
                  initial={{ opacity: 0, x: -10, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-full ml-3 bottom-0 bg-[var(--bg-primary)] rounded-xl shadow-lg border border-[var(--separator-opaque)] p-3 z-50 min-w-[160px]"
                >
                  {/* User Info */}
                  <div className="flex items-center gap-3 mb-3 pb-3 border-b border-[var(--separator-opaque)]">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold text-xs">
                      {user?.name?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[var(--label-primary)] truncate">
                        {user?.name || 'User'}
                      </p>
                      <p className="text-[11px] text-[var(--label-tertiary)] truncate">
                        {user?.email || ''}
                      </p>
                    </div>
                  </div>

                  {/* Sign Out Button */}
                  <button
                    onClick={() => {
                      setShowProfilePopover(false);
                      logout();
                    }}
                    className="w-full py-2 px-3 rounded-lg bg-[var(--system-red)]/10 text-[var(--system-red)] hover:bg-[var(--system-red)]/20 transition-colors text-[13px] font-medium"
                  >
                    Sign Out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </aside>

      {/* Main Content Container - White card, SEPARATE from sidebar */}
      <div className="flex-1 p-4 md:py-5 md:pr-5 md:pl-0 overflow-hidden">
        <div className="bg-[var(--bg-primary)] rounded-2xl md:rounded-[24px] h-full flex flex-col shadow-sm">
          {/* Top Header */}
          <header className="h-[72px] px-4 md:px-12 flex items-center justify-between border-b border-[var(--separator-opaque)] shrink-0 relative">
            {/* Left: Greeting + Market Status */}
            <div className="z-10">
              <h1 className="text-[17px] font-semibold text-[var(--label-primary)]">
                Hi, {user?.name?.split(' ')[0] || 'there'}!
              </h1>
              <div className="flex items-center gap-2">
                <p className="text-[13px] text-[var(--label-tertiary)]">{dateStr}</p>
                {/* Market Status Badge - Compact pill with tooltip */}
                {marketStatus && !marketStatus.isOpen && (
                  <span
                    className="group relative inline-flex items-center gap-1.5 px-2 py-0.5 bg-amber-500/10 text-amber-600 text-[11px] font-medium rounded-full cursor-help"
                    title="Stock & mutual fund prices may be outdated"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                    {marketStatus.reason === 'Market Holiday' ? 'Market Holiday' :
                     marketStatus.reason === 'Weekend' ? 'Weekend' :
                     marketStatus.reason === 'Pre-market' ? 'Pre-market' :
                     marketStatus.reason === 'After-hours' ? 'After Hours' :
                     'Market Closed'} · Prices may be stale
                  </span>
                )}
              </div>
            </div>

            {/* Center: Search - Absolutely positioned for true center */}
            <button
              onClick={() => setShowSearch(true)}
              className="hidden lg:flex items-center gap-2.5 px-4 py-2.5 bg-[var(--bg-tertiary)] rounded-xl text-[var(--label-tertiary)] w-[360px] cursor-pointer hover:bg-[var(--fill-secondary)] transition-colors absolute left-1/2 -translate-x-1/2"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <span className="text-[14px]">Search assets, pages...</span>
              <span className="ml-auto text-[11px] text-[var(--label-quaternary)] bg-[var(--bg-primary)] px-1.5 py-0.5 rounded border border-[var(--separator-opaque)]">⌘K</span>
            </button>

            {/* Right: Actions */}
            <div className="flex items-center gap-1.5 z-10">
              {/* Backup - Mobile only */}
              <motion.button
                whileTap={tapScale}
                transition={spring.snappy}
                onClick={() => setShowBackup(true)}
                className="md:hidden p-2.5 text-[var(--label-tertiary)] hover:bg-[var(--fill-secondary)] rounded-xl transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </motion.button>

              {/* Primary Action Button */}
              <Link to="/assets/add">
                <motion.button
                  whileTap={tapScale}
                  transition={spring.snappy}
                  className="hidden md:flex items-center gap-2 px-5 py-2.5 bg-[var(--sidebar-active)] text-white rounded-xl font-medium text-[14px] hover:opacity-90 transition-opacity ml-1"
                >
                  Add Asset
                </motion.button>
              </Link>
            </div>
          </header>

          {/* Main Content */}
          <main id="main-content" tabIndex={-1} className="flex-1 overflow-auto pb-20 md:pb-0">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[var(--bg-primary)] border-t border-[var(--separator-opaque)] z-40">
        <div className="flex justify-around py-2 px-2">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className="flex flex-col items-center gap-0.5 py-1 px-4"
            >
              <motion.div
                whileTap={tapScale}
                transition={spring.snappy}
                className={`w-11 h-11 rounded-[14px] flex items-center justify-center transition-all ${
                  isActive(item.path)
                    ? 'bg-[var(--sidebar-active)] text-white'
                    : 'text-[var(--sidebar-icon)]'
                }`}
              >
                {item.icon}
              </motion.div>
              <span className={`text-[10px] font-medium ${
                isActive(item.path) ? 'text-[var(--label-primary)]' : 'text-[var(--label-tertiary)]'
              }`}>
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </nav>

      {/* Keyboard Shortcuts Help Modal */}
      <KeyboardShortcutsHelp isOpen={showHelp} onClose={() => setShowHelp(false)} />

      {/* Data Backup Modal */}
      <DataBackup isOpen={showBackup} onClose={() => setShowBackup(false)} />

      {/* Search Modal */}
      <SearchModal isOpen={showSearch} onClose={() => setShowSearch(false)} />
    </div>
  );
}
