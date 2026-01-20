import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { assetService } from '../services/assets';

export default function SearchModal({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [assets, setAssets] = useState([]);
  const [filteredAssets, setFilteredAssets] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Fetch assets on mount
  useEffect(() => {
    const fetchAssets = async () => {
      try {
        const response = await assetService.getAll();
        setAssets(response.data.assets || []);
      } catch (error) {
        console.error('Error fetching assets:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchAssets();
  }, []);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Filter assets based on query
  useEffect(() => {
    if (!query.trim()) {
      setFilteredAssets(assets.slice(0, 8));
    } else {
      const lowerQuery = query.toLowerCase();
      const filtered = assets.filter(asset =>
        asset.name?.toLowerCase().includes(lowerQuery) ||
        asset.symbol?.toLowerCase().includes(lowerQuery) ||
        asset.category?.toLowerCase().includes(lowerQuery) ||
        asset.asset_type?.toLowerCase().includes(lowerQuery)
      );
      setFilteredAssets(filtered.slice(0, 8));
    }
    setSelectedIndex(0);
  }, [query, assets]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev =>
            prev < filteredAssets.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => prev > 0 ? prev - 1 : 0);
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredAssets[selectedIndex]) {
            handleSelect(filteredAssets[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredAssets, selectedIndex, onClose]);

  const handleSelect = (asset) => {
    onClose();
    // Navigate to assets page with highlight parameter
    navigate(`/assets?highlight=${asset.id}`);
  };

  const quickLinks = [
    { label: 'Dashboard', path: '/', icon: 'M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25' },
    { label: 'All Assets', path: '/assets', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
    { label: 'Add Asset', path: '/assets/add', icon: 'M12 4v16m8-8H4' },
    { label: 'Goals', path: '/goals', icon: 'M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5' },
  ];

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-xl bg-[var(--bg-primary)] rounded-2xl shadow-2xl z-[101] overflow-hidden"
          >
            {/* Search Input */}
            <div className="flex items-center gap-3 p-4 border-b border-[var(--separator-opaque)]">
              <svg className="w-5 h-5 text-[var(--label-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search assets, pages..."
                className="flex-1 bg-transparent text-[15px] text-[var(--label-primary)] placeholder:text-[var(--label-tertiary)] border-none [&:focus]:outline-none [&:focus-visible]:outline-none"
                style={{ outline: 'none', boxShadow: 'none' }}
              />
              <kbd className="text-[11px] text-[var(--label-quaternary)] bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded border border-[var(--separator-opaque)]">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-[400px] overflow-y-auto">
              {/* Quick Links */}
              {!query && (
                <div className="p-2">
                  <p className="px-3 py-2 text-[11px] font-medium text-[var(--label-tertiary)] uppercase tracking-wider">
                    Quick Links
                  </p>
                  {quickLinks.map((link, index) => (
                    <button
                      key={link.path}
                      onClick={() => {
                        onClose();
                        navigate(link.path);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--fill-tertiary)] transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[var(--fill-tertiary)] flex items-center justify-center">
                        <svg className="w-4 h-4 text-[var(--label-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={link.icon} />
                        </svg>
                      </div>
                      <span className="text-[14px] text-[var(--label-primary)]">{link.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Assets */}
              {(query || assets.length > 0) && (
                <div className="p-2">
                  <p className="px-3 py-2 text-[11px] font-medium text-[var(--label-tertiary)] uppercase tracking-wider">
                    {query ? 'Results' : 'Recent Assets'}
                  </p>
                  {loading ? (
                    <div className="px-3 py-8 text-center">
                      <p className="text-[13px] text-[var(--label-tertiary)]">Loading...</p>
                    </div>
                  ) : filteredAssets.length > 0 ? (
                    filteredAssets.map((asset, index) => (
                      <button
                        key={asset.id}
                        onClick={() => handleSelect(asset)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left ${
                          index === selectedIndex
                            ? 'bg-[var(--chart-primary)]/10'
                            : 'hover:bg-[var(--fill-tertiary)]'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-[var(--fill-tertiary)] flex items-center justify-center">
                          <span className="text-[12px] font-semibold text-[var(--label-secondary)]">
                            {asset.symbol?.slice(0, 2) || asset.name?.slice(0, 2) || '??'}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-medium text-[var(--label-primary)] truncate">
                            {asset.name}
                          </p>
                          <p className="text-[12px] text-[var(--label-tertiary)]">
                            {asset.symbol || asset.asset_type?.replace('_', ' ')}
                          </p>
                        </div>
                        <span className="text-[11px] text-[var(--label-quaternary)] bg-[var(--fill-tertiary)] px-2 py-0.5 rounded">
                          {asset.category}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-8 text-center">
                      <p className="text-[13px] text-[var(--label-tertiary)]">
                        {query ? 'No assets found' : 'No assets yet'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-3 bg-[var(--fill-tertiary)]/50 border-t border-[var(--separator-opaque)]">
              <div className="flex items-center gap-4 text-[11px] text-[var(--label-tertiary)]">
                <span className="flex items-center gap-1">
                  <kbd className="bg-[var(--bg-primary)] px-1.5 py-0.5 rounded border border-[var(--separator-opaque)]">↑↓</kbd>
                  Navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="bg-[var(--bg-primary)] px-1.5 py-0.5 rounded border border-[var(--separator-opaque)]">↵</kbd>
                  Select
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
