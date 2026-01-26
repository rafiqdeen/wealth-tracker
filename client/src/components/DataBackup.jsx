import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../services/api';
import { formatDate } from '../utils/formatting';

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0 },
};

// Asset category field configurations
const CATEGORY_FIELDS = {
  EQUITY: ['symbol', 'exchange', 'quantity', 'avg_buy_price', 'purchase_date'],
  FIXED_INCOME: ['principal', 'interest_rate', 'start_date', 'maturity_date', 'institution'],
  REAL_ESTATE: ['purchase_price', 'current_value', 'location', 'area_sqft', 'appreciation_rate'],
  PHYSICAL: ['weight_grams', 'purity', 'purchase_price', 'purchase_date'],
  SAVINGS: ['balance', 'interest_rate', 'institution'],
  CRYPTO: ['symbol', 'quantity', 'avg_buy_price', 'exchange'],
  INSURANCE: ['premium', 'sum_assured', 'policy_number', 'start_date', 'maturity_date'],
  OTHER: ['purchase_price', 'current_value', 'purchase_date'],
};

export default function DataBackup({ isOpen, onClose, assets = [] }) {
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importOptions, setImportOptions] = useState({
    overwrite: false,
    importAssets: true,
    importGoals: true,
    importTransactions: true,
  });
  const fileInputRef = useRef(null);

  // Export full backup using server API
  const handleExportBackup = async () => {
    setExporting(true);
    setImportResult(null);
    try {
      const response = await api.get('/backup/export');
      const exportData = response.data;

      // Download as JSON
      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wealthtracker-backup-${formatDate(new Date()).replace(/\s/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setImportResult({
        type: 'success',
        message: `Backup exported: ${exportData.stats.assets} assets, ${exportData.stats.goals} goals, ${exportData.stats.transactions} transactions`,
      });
      setTimeout(() => setImportResult(null), 5000);
    } catch (error) {
      console.error('Export error:', error);
      setImportResult({
        type: 'error',
        message: error.response?.data?.error || 'Failed to export backup',
      });
    } finally {
      setExporting(false);
    }
  };

  // Export CSV with all asset-type specific fields
  const handleExportCSV = () => {
    try {
      if (!assets || assets.length === 0) {
        setImportResult({ type: 'error', message: 'No assets to export' });
        return;
      }

      // Build CSV data with all relevant fields based on category
      const csvData = assets.map(asset => {
        const base = {
          ID: asset.id,
          Name: asset.name,
          Category: asset.category,
          'Asset Type': asset.asset_type,
          Status: asset.status || 'ACTIVE',
          Notes: asset.notes || '',
          'Created At': asset.created_at || '',
        };

        // Add category-specific fields
        switch (asset.category) {
          case 'EQUITY':
          case 'CRYPTO':
            return {
              ...base,
              Symbol: asset.symbol || '',
              Exchange: asset.exchange || '',
              Quantity: asset.quantity || 0,
              'Avg Buy Price': asset.avg_buy_price || 0,
              'Purchase Date': asset.purchase_date || '',
              'Invested Value': (asset.quantity || 0) * (asset.avg_buy_price || 0),
            };

          case 'FIXED_INCOME':
            return {
              ...base,
              Principal: asset.principal || 0,
              'Interest Rate (%)': asset.interest_rate || 0,
              'Start Date': asset.start_date || '',
              'Maturity Date': asset.maturity_date || '',
              Institution: asset.institution || '',
            };

          case 'REAL_ESTATE':
            return {
              ...base,
              'Purchase Price': asset.purchase_price || 0,
              'Current Value': asset.current_value || 0,
              Location: asset.location || '',
              'Area (sqft)': asset.area_sqft || '',
              'Appreciation Rate (%)': asset.appreciation_rate || '',
              'Purchase Date': asset.purchase_date || '',
            };

          case 'PHYSICAL':
            return {
              ...base,
              'Weight (grams)': asset.weight_grams || '',
              Purity: asset.purity || '',
              'Purchase Price': asset.purchase_price || 0,
              'Purchase Date': asset.purchase_date || '',
            };

          case 'SAVINGS':
            return {
              ...base,
              Balance: asset.balance || 0,
              'Interest Rate (%)': asset.interest_rate || '',
              Institution: asset.institution || '',
            };

          case 'INSURANCE':
            return {
              ...base,
              Premium: asset.premium || 0,
              'Sum Assured': asset.sum_assured || 0,
              'Policy Number': asset.policy_number || '',
              'Start Date': asset.start_date || '',
              'Maturity Date': asset.maturity_date || '',
            };

          default:
            return {
              ...base,
              'Purchase Price': asset.purchase_price || asset.principal || 0,
              'Current Value': asset.current_value || asset.balance || 0,
              'Purchase Date': asset.purchase_date || '',
            };
        }
      });

      // Get all unique headers from all rows
      const allHeaders = new Set();
      csvData.forEach(row => Object.keys(row).forEach(key => allHeaders.add(key)));
      const headers = Array.from(allHeaders);

      // Build CSV string
      const csvRows = [
        headers.join(','),
        ...csvData.map(row =>
          headers.map(header => {
            const value = row[header];
            if (value === undefined || value === null) return '';
            if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          }).join(',')
        ),
      ];

      const csv = csvRows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wealthtracker-assets-${formatDate(new Date()).replace(/\s/g, '-')}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      setImportResult({ type: 'success', message: `CSV exported: ${assets.length} assets` });
      setTimeout(() => setImportResult(null), 3000);
    } catch (error) {
      console.error('CSV export error:', error);
      setImportResult({ type: 'error', message: 'Failed to export CSV' });
    }
  };

  // Export Goals with links as JSON
  const handleExportGoalsJSON = async () => {
    setExporting(true);
    try {
      const response = await api.get('/backup/export');
      const { goals, goalAssetLinks, goalContributions } = response.data.data;

      const exportData = {
        version: '2.0',
        exportedAt: new Date().toISOString(),
        goals,
        goalAssetLinks,
        goalContributions,
      };

      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wealthtracker-goals-${formatDate(new Date()).replace(/\s/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setImportResult({
        type: 'success',
        message: `Goals exported: ${goals.length} goals with ${goalAssetLinks.length} asset links`,
      });
      setTimeout(() => setImportResult(null), 3000);
    } catch (error) {
      console.error('Goals export error:', error);
      setImportResult({ type: 'error', message: 'Failed to export goals' });
    } finally {
      setExporting(false);
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
      const backupData = JSON.parse(text);

      // Validate backup format
      if (!backupData.version || !backupData.data) {
        throw new Error('Invalid backup file format. Please use a WealthTracker backup file.');
      }

      // Send to server for import
      const response = await api.post('/backup/import', {
        data: backupData.data,
        options: importOptions,
      });

      const { results } = response.data;

      const messages = [];
      if (results.assets.imported > 0) messages.push(`${results.assets.imported} assets`);
      if (results.goals.imported > 0) messages.push(`${results.goals.imported} goals`);
      if (results.transactions.imported > 0) messages.push(`${results.transactions.imported} transactions`);
      if (results.goalLinks.imported > 0) messages.push(`${results.goalLinks.imported} goal links`);

      const skipped = [];
      if (results.assets.skipped > 0) skipped.push(`${results.assets.skipped} assets`);
      if (results.goals.skipped > 0) skipped.push(`${results.goals.skipped} goals`);

      let message = messages.length > 0
        ? `Imported: ${messages.join(', ')}`
        : 'No new data to import';

      if (skipped.length > 0) {
        message += `. Skipped (already exist): ${skipped.join(', ')}`;
      }

      setImportResult({
        type: 'success',
        message: message + '. Refresh the page to see changes.',
      });
    } catch (error) {
      console.error('Import error:', error);
      setImportResult({
        type: 'error',
        message: error.response?.data?.error || error.message || 'Failed to import backup file',
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
            <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
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
                    disabled={exporting}
                    className="w-full flex items-center gap-3 p-3 bg-[var(--fill-tertiary)]/50 hover:bg-[var(--fill-tertiary)] rounded-xl transition-colors text-left disabled:opacity-50"
                  >
                    <div className="w-10 h-10 bg-[var(--system-blue)]/10 rounded-xl flex items-center justify-center">
                      {exporting ? (
                        <svg className="w-5 h-5 text-[var(--system-blue)] animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-[var(--system-blue)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="text-[15px] font-medium text-[var(--label-primary)]">Full Backup (JSON)</p>
                      <p className="text-[13px] text-[var(--label-tertiary)]">All assets, goals, transactions & history</p>
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
                      <p className="text-[13px] text-[var(--label-tertiary)]">All asset types with category-specific fields</p>
                    </div>
                  </button>

                  <button
                    onClick={handleExportGoalsJSON}
                    disabled={exporting}
                    className="w-full flex items-center gap-3 p-3 bg-[var(--fill-tertiary)]/50 hover:bg-[var(--fill-tertiary)] rounded-xl transition-colors text-left disabled:opacity-50"
                  >
                    <div className="w-10 h-10 bg-[var(--system-purple)]/10 rounded-xl flex items-center justify-center">
                      <svg className="w-5 h-5 text-[var(--system-purple)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-[15px] font-medium text-[var(--label-primary)]">Goals (JSON)</p>
                      <p className="text-[13px] text-[var(--label-tertiary)]">Goals with asset links & contributions</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Import Section */}
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider mb-3">
                  Import Data
                </h3>

                {/* Import Options */}
                <div className="mb-3 p-3 bg-[var(--fill-tertiary)]/30 rounded-xl space-y-2">
                  <label className="flex items-center gap-2 text-[13px] text-[var(--label-secondary)]">
                    <input
                      type="checkbox"
                      checked={importOptions.importAssets}
                      onChange={(e) => setImportOptions({ ...importOptions, importAssets: e.target.checked })}
                      className="w-4 h-4 rounded"
                    />
                    Import assets & transactions
                  </label>
                  <label className="flex items-center gap-2 text-[13px] text-[var(--label-secondary)]">
                    <input
                      type="checkbox"
                      checked={importOptions.importGoals}
                      onChange={(e) => setImportOptions({ ...importOptions, importGoals: e.target.checked })}
                      className="w-4 h-4 rounded"
                    />
                    Import goals & contributions
                  </label>
                  <label className="flex items-center gap-2 text-[13px] text-[var(--label-secondary)]">
                    <input
                      type="checkbox"
                      checked={importOptions.overwrite}
                      onChange={(e) => setImportOptions({ ...importOptions, overwrite: e.target.checked })}
                      className="w-4 h-4 rounded"
                    />
                    Overwrite existing data
                  </label>
                </div>

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
                Backups include all data from the server database
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
