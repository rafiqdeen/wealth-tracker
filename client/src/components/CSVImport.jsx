import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { transactionService } from '../services/transactions';
import { Button } from './apple';
import { spring } from '../utils/animations';
import { useToast } from '../context/ToastContext';
import { formatCurrency } from '../utils/formatting';

// Expected CSV columns
const EXPECTED_COLUMNS = ['date', 'type', 'quantity', 'price'];
const SAMPLE_CSV = `date,type,quantity,price
2024-01-15,BUY,10,150.50
2024-02-20,BUY,5,155.00
2024-03-10,SELL,3,160.25`;

export default function CSVImport({ asset, onSuccess, onCancel }) {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  const [errors, setErrors] = useState([]);

  const parseCSV = (text) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      return { data: [], errors: ['CSV file must have a header row and at least one data row'] };
    }

    // Parse header
    const header = lines[0].toLowerCase().split(',').map(h => h.trim());

    // Check for required columns
    const missingColumns = EXPECTED_COLUMNS.filter(col => !header.includes(col));
    if (missingColumns.length > 0) {
      return { data: [], errors: [`Missing required columns: ${missingColumns.join(', ')}`] };
    }

    const columnIndices = {
      date: header.indexOf('date'),
      type: header.indexOf('type'),
      quantity: header.indexOf('quantity'),
      price: header.indexOf('price'),
    };

    const data = [];
    const parseErrors = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(',').map(v => v.trim());

      try {
        const date = values[columnIndices.date];
        const type = values[columnIndices.type]?.toUpperCase();
        const quantity = parseFloat(values[columnIndices.quantity]);
        const price = parseFloat(values[columnIndices.price]);

        // Validate date
        if (!date || isNaN(Date.parse(date))) {
          parseErrors.push(`Row ${i + 1}: Invalid date "${date}"`);
          continue;
        }

        // Validate type
        if (!['BUY', 'SELL'].includes(type)) {
          parseErrors.push(`Row ${i + 1}: Type must be BUY or SELL, got "${type}"`);
          continue;
        }

        // Validate numbers
        if (isNaN(quantity) || quantity <= 0) {
          parseErrors.push(`Row ${i + 1}: Invalid quantity "${values[columnIndices.quantity]}"`);
          continue;
        }

        if (isNaN(price) || price <= 0) {
          parseErrors.push(`Row ${i + 1}: Invalid price "${values[columnIndices.price]}"`);
          continue;
        }

        data.push({
          transaction_date: date,
          type,
          quantity,
          price,
          total_amount: quantity * price,
        });
      } catch (err) {
        parseErrors.push(`Row ${i + 1}: ${err.message}`);
      }
    }

    return { data, errors: parseErrors };
  };

  const handleFile = async (file) => {
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a CSV file');
      return;
    }

    setParsing(true);
    setErrors([]);

    try {
      const text = await file.text();
      const { data, errors: parseErrors } = parseCSV(text);

      if (parseErrors.length > 0) {
        setErrors(parseErrors);
      }

      if (data.length > 0) {
        setParsedData(data);
        toast.info(`Parsed ${data.length} transactions`);
      } else if (parseErrors.length === 0) {
        toast.error('No valid transactions found in CSV');
      }
    } catch (err) {
      toast.error('Failed to read CSV file');
      console.error('CSV parse error:', err);
    } finally {
      setParsing(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    handleFile(file);
  };

  const handleImport = async () => {
    if (!parsedData || parsedData.length === 0) return;

    setImporting(true);
    const results = { success: 0, failed: 0 };

    try {
      for (const txn of parsedData) {
        try {
          await transactionService.create({
            asset_id: asset.id,
            ...txn,
          });
          results.success++;
        } catch (err) {
          results.failed++;
          console.error('Failed to import transaction:', err);
        }
      }

      if (results.success > 0) {
        toast.success(`Imported ${results.success} transaction${results.success > 1 ? 's' : ''}`);
      }
      if (results.failed > 0) {
        toast.warning(`${results.failed} transaction${results.failed > 1 ? 's' : ''} failed to import`);
      }

      if (results.success > 0) {
        onSuccess?.();
      }
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transactions_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalBuy = parsedData?.filter(t => t.type === 'BUY').reduce((sum, t) => sum + t.total_amount, 0) || 0;
  const totalSell = parsedData?.filter(t => t.type === 'SELL').reduce((sum, t) => sum + t.total_amount, 0) || 0;

  return (
    <div className="p-5 space-y-5">
      {/* Asset Info */}
      <div className="bg-[var(--fill-tertiary)] rounded-xl p-4">
        <p className="text-[16px] font-semibold text-[var(--label-primary)]">{asset.name}</p>
        <p className="text-[14px] text-[var(--label-tertiary)]">Import transactions from CSV</p>
      </div>

      {/* Drop Zone */}
      {!parsedData && (
        <>
          <motion.div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            animate={{ borderColor: dragOver ? 'var(--system-blue)' : 'var(--separator)' }}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragOver ? 'bg-[var(--system-blue)]/5' : 'hover:bg-[var(--fill-tertiary)]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileInput}
              className="hidden"
            />
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[var(--fill-tertiary)] flex items-center justify-center">
              <svg className="w-6 h-6 text-[var(--label-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <p className="text-[16px] font-medium text-[var(--label-primary)] mb-1">
              {parsing ? 'Parsing...' : 'Drop CSV file here or click to browse'}
            </p>
            <p className="text-[14px] text-[var(--label-tertiary)]">
              Required columns: date, type, quantity, price
            </p>
          </motion.div>

          {/* Template Download */}
          <button
            onClick={downloadTemplate}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-[15px] text-[var(--system-blue)] hover:bg-[var(--system-blue)]/5 rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download CSV Template
          </button>
        </>
      )}

      {/* Parse Errors */}
      <AnimatePresence>
        {errors.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-[var(--system-red)]/10 rounded-xl p-4"
          >
            <p className="text-[14px] font-medium text-[var(--system-red)] mb-2">
              {errors.length} error{errors.length > 1 ? 's' : ''} found:
            </p>
            <ul className="text-[13px] text-[var(--system-red)] space-y-1 max-h-24 overflow-y-auto">
              {errors.slice(0, 5).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
              {errors.length > 5 && (
                <li>... and {errors.length - 5} more</li>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview */}
      {parsedData && parsedData.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.gentle}
          className="space-y-4"
        >
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[var(--fill-tertiary)] rounded-xl p-3 text-center">
              <p className="text-[12px] text-[var(--label-tertiary)] uppercase tracking-wide mb-0.5">Transactions</p>
              <p className="text-[18px] font-semibold text-[var(--label-primary)]">{parsedData.length}</p>
            </div>
            <div className="bg-[var(--system-green)]/10 rounded-xl p-3 text-center">
              <p className="text-[12px] text-[var(--system-green)] uppercase tracking-wide mb-0.5">Total Buy</p>
              <p className="text-[16px] font-semibold text-[var(--system-green)]">{formatCurrency(totalBuy)}</p>
            </div>
            <div className="bg-[var(--system-orange)]/10 rounded-xl p-3 text-center">
              <p className="text-[12px] text-[var(--system-orange)] uppercase tracking-wide mb-0.5">Total Sell</p>
              <p className="text-[16px] font-semibold text-[var(--system-orange)]">{formatCurrency(totalSell)}</p>
            </div>
          </div>

          {/* Transaction List Preview */}
          <div className="bg-[var(--fill-tertiary)] rounded-xl overflow-hidden max-h-48 overflow-y-auto">
            <table className="w-full text-[14px]">
              <thead className="bg-[var(--bg-secondary)] sticky top-0">
                <tr className="text-[12px] text-[var(--label-tertiary)] uppercase">
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-center px-3 py-2">Type</th>
                  <th className="text-right px-3 py-2">Qty</th>
                  <th className="text-right px-3 py-2">Price</th>
                  <th className="text-right px-3 py-2">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--separator)]/20">
                {parsedData.slice(0, 10).map((txn, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-[var(--label-primary)]">
                      {new Date(txn.transaction_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[12px] font-medium ${
                        txn.type === 'BUY'
                          ? 'bg-[var(--system-green)]/10 text-[var(--system-green)]'
                          : 'bg-[var(--system-orange)]/10 text-[var(--system-orange)]'
                      }`}>
                        {txn.type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-[var(--label-primary)]">{txn.quantity}</td>
                    <td className="px-3 py-2 text-right text-[var(--label-secondary)]">{txn.price.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-medium text-[var(--label-primary)]">{formatCurrency(txn.total_amount)}</td>
                  </tr>
                ))}
                {parsedData.length > 10 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-center text-[var(--label-tertiary)]">
                      ... and {parsedData.length - 10} more
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="gray"
              className="flex-1"
              onClick={() => {
                setParsedData(null);
                setErrors([]);
              }}
            >
              Clear
            </Button>
            <Button
              type="button"
              variant="filled"
              loading={importing}
              className="flex-1"
              onClick={handleImport}
            >
              Import {parsedData.length} Transactions
            </Button>
          </div>
        </motion.div>
      )}

      {/* Cancel button when no data */}
      {!parsedData && (
        <Button type="button" variant="gray" className="w-full" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  );
}
