import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { downloadJSON, downloadCSV, exportAllData } from '../utils/export';
import { goalService } from '../services/goals';

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0 },
};

export default function DataBackup({ isOpen, onClose, assets = [] }) {
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

  const handleExportBackup = () => {
    try {
      const goals = goalService.getGoalsSync ? goalService.getGoalsSync() :
        JSON.parse(localStorage.getItem('wealthtracker_goals') || '[]');
      const transactions = JSON.parse(localStorage.getItem('wealthtracker_transactions') || '[]');

      exportAllData(assets, transactions, goals);
      setImportResult({ type: 'success', message: 'Backup exported successfully!' });
      setTimeout(() => setImportResult(null), 3000);
    } catch (error) {
      setImportResult({ type: 'error', message: 'Failed to export backup' });
    }
  };

  const handleExportCSV = () => {
    try {
      if (!assets || assets.length === 0) {
        setImportResult({ type: 'error', message: 'No assets to export' });
        return;
      }

      const csvData = assets.map(asset => ({
        Name: asset.name,
        Symbol: asset.symbol || '',
        Category: asset.category,
        Quantity: asset.quantity,
        'Buy Price': asset.buyPrice,
        'Current Price': asset.currentPrice || asset.buyPrice,
        'Buy Date': asset.buyDate,
        Notes: asset.notes || '',
      }));

      downloadCSV(csvData, 'wealthtracker-assets.csv');
      setImportResult({ type: 'success', message: 'CSV exported successfully!' });
      setTimeout(() => setImportResult(null), 3000);
    } catch (error) {
      setImportResult({ type: 'error', message: 'Failed to export CSV' });
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate backup format
      if (!data.version || !data.data) {
        throw new Error('Invalid backup file format');
      }

      // Import goals
      if (data.data.goals && Array.isArray(data.data.goals)) {
        localStorage.setItem('wealthtracker_goals', JSON.stringify(data.data.goals));
      }

      // Import transactions
      if (data.data.transactions && Array.isArray(data.data.transactions)) {
        localStorage.setItem('wealthtracker_transactions', JSON.stringify(data.data.transactions));
      }

      setImportResult({
        type: 'success',
        message: `Imported ${data.data.goals?.length || 0} goals and ${data.data.transactions?.length || 0} transactions. Refresh to see changes.`
      });
    } catch (error) {
      setImportResult({
        type: 'error',
        message: error.message || 'Failed to import backup file'
      });
    } finally {
      setImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleExportGoalsJSON = () => {
    try {
      const goals = JSON.parse(localStorage.getItem('wealthtracker_goals') || '[]');
      downloadJSON({ goals }, 'wealthtracker-goals.json');
      setImportResult({ type: 'success', message: 'Goals exported successfully!' });
      setTimeout(() => setImportResult(null), 3000);
    } catch (error) {
      setImportResult({ type: 'error', message: 'Failed to export goals' });
    }
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
              <h2 className="text-[17px] font-semibold text-[var(--label-primary)]">Data Backup</h2>
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
            <div className="px-5 py-4 space-y-4">
              {/* Status Message */}
              {importResult && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-3 rounded-xl text-[14px] ${
                    importResult.type === 'success'
                      ? 'bg-[var(--system-green)]/10 text-[var(--system-green)]'
                      : 'bg-[var(--system-red)]/10 text-[var(--system-red)]'
                  }`}
                >
                  {importResult.message}
                </motion.div>
              )}

              {/* Export Section */}
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider mb-3">
                  Export Data
                </h3>
                <div className="space-y-2">
                  <button
                    onClick={handleExportBackup}
                    className="w-full flex items-center gap-3 p-3 bg-[var(--fill-tertiary)]/50 hover:bg-[var(--fill-tertiary)] rounded-xl transition-colors text-left"
                  >
                    <div className="w-10 h-10 bg-[var(--system-blue)]/10 rounded-xl flex items-center justify-center">
                      <svg className="w-5 h-5 text-[var(--system-blue)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-[15px] font-medium text-[var(--label-primary)]">Full Backup (JSON)</p>
                      <p className="text-[13px] text-[var(--label-tertiary)]">Export all data for safekeeping</p>
                    </div>
                  </button>

                  <button
                    onClick={handleExportCSV}
                    className="w-full flex items-center gap-3 p-3 bg-[var(--fill-tertiary)]/50 hover:bg-[var(--fill-tertiary)] rounded-xl transition-colors text-left"
                  >
                    <div className="w-10 h-10 bg-[var(--system-green)]/10 rounded-xl flex items-center justify-center">
                      <svg className="w-5 h-5 text-[var(--system-green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-[15px] font-medium text-[var(--label-primary)]">Assets (CSV)</p>
                      <p className="text-[13px] text-[var(--label-tertiary)]">Export assets for spreadsheets</p>
                    </div>
                  </button>

                  <button
                    onClick={handleExportGoalsJSON}
                    className="w-full flex items-center gap-3 p-3 bg-[var(--fill-tertiary)]/50 hover:bg-[var(--fill-tertiary)] rounded-xl transition-colors text-left"
                  >
                    <div className="w-10 h-10 bg-[var(--system-purple)]/10 rounded-xl flex items-center justify-center">
                      <svg className="w-5 h-5 text-[var(--system-purple)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-[15px] font-medium text-[var(--label-primary)]">Goals (JSON)</p>
                      <p className="text-[13px] text-[var(--label-tertiary)]">Export financial goals</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Import Section */}
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider mb-3">
                  Import Data
                </h3>
                <button
                  onClick={handleImportClick}
                  disabled={importing}
                  className="w-full flex items-center gap-3 p-3 bg-[var(--fill-tertiary)]/50 hover:bg-[var(--fill-tertiary)] rounded-xl transition-colors text-left disabled:opacity-50"
                >
                  <div className="w-10 h-10 bg-[var(--system-orange)]/10 rounded-xl flex items-center justify-center">
                    {importing ? (
                      <svg className="w-5 h-5 text-[var(--system-orange)] animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-[var(--system-orange)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <p className="text-[15px] font-medium text-[var(--label-primary)]">
                      {importing ? 'Importing...' : 'Restore from Backup'}
                    </p>
                    <p className="text-[13px] text-[var(--label-tertiary)]">Import a JSON backup file</p>
                  </div>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-[var(--fill-tertiary)]/50 border-t border-[var(--separator)]/30">
              <p className="text-[12px] text-[var(--label-tertiary)] text-center">
                Backups include goals and transactions stored locally
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
