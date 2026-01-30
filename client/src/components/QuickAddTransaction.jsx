import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { transactionService } from '../services/transactions';
import { tapScale } from '../utils/animations';
import { formatCurrency } from '../utils/formatting';
import { useToast } from '../context/ToastContext';

export default function QuickAddTransaction({ asset, onSuccess, onCancel }) {
  const toast = useToast();
  const quantityInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState({ quantity: false, price: false });
  const [formData, setFormData] = useState({
    type: 'BUY',
    quantity: '',
    price: '',
    date: new Date().toISOString().split('T')[0],
  });

  // Auto-focus quantity input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      quantityInputRef.current?.focus();
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleBlur = (field) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  // Validation logic
  const validation = useMemo(() => {
    const errors = {};
    const quantity = parseFloat(formData.quantity);
    const price = parseFloat(formData.price);
    const ownedQuantity = asset.quantity || 0;

    // Quantity validation
    if (formData.quantity === '') {
      errors.quantity = 'Required';
    } else if (isNaN(quantity) || quantity <= 0) {
      errors.quantity = 'Must be greater than 0';
    } else if (formData.type === 'SELL' && quantity > ownedQuantity) {
      errors.quantity = `Max ${ownedQuantity} available`;
    }

    // Price validation
    if (formData.price === '') {
      errors.price = 'Required';
    } else if (isNaN(price) || price <= 0) {
      errors.price = 'Must be greater than 0';
    }

    return {
      errors,
      isValid: Object.keys(errors).length === 0,
      ownedQuantity,
    };
  }, [formData, asset.quantity]);

  const totalAmount = (parseFloat(formData.quantity) || 0) * (parseFloat(formData.price) || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Mark all fields as touched to show errors
    setTouched({ quantity: true, price: true });

    if (!validation.isValid) {
      const firstError = validation.errors.quantity || validation.errors.price;
      toast.error(firstError);
      return;
    }

    setLoading(true);
    try {
      await transactionService.create({
        asset_id: asset.id,
        type: formData.type,
        quantity: parseFloat(formData.quantity),
        price: parseFloat(formData.price),
        total_amount: totalAmount,
        transaction_date: formData.date,
      });
      toast.success(`${formData.type === 'BUY' ? 'Buy' : 'Sell'} transaction recorded`);
      onSuccess?.();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to add transaction');
    } finally {
      setLoading(false);
    }
  };

  const isBuy = formData.type === 'BUY';
  const accentColor = isBuy ? '#059669' : '#DC2626';

  // Input classes with error state
  const getInputClass = (field) => {
    const hasError = touched[field] && validation.errors[field];
    return `w-full px-4 py-3 bg-[var(--fill-tertiary)] rounded-xl text-[17px] font-medium text-[var(--label-primary)] placeholder-[var(--label-quaternary)] border-2 focus:outline-none transition-all tabular-nums ${
      hasError
        ? 'border-[#DC2626]/50 focus:border-[#DC2626] focus:ring-2 focus:ring-[#DC2626]/20'
        : 'border-transparent focus:border-[var(--chart-primary)]/30 focus:ring-2 focus:ring-[var(--chart-primary)]/20'
    }`;
  };

  return (
    <form onSubmit={handleSubmit} className="p-5">
      {/* Asset Badge - Shows name + symbol/code */}
      <div className="flex justify-center mb-5">
        <div className="inline-flex flex-col items-center gap-0.5 px-4 py-2 bg-[var(--fill-tertiary)] rounded-xl">
          <span className="text-[14px] font-semibold text-[var(--label-primary)] text-center leading-tight">
            {asset.name}
          </span>
          <span className="text-[11px] text-[var(--label-tertiary)]">
            {asset.symbol}{asset.exchange && ` · ${asset.exchange}`}
          </span>
        </div>
      </div>

      {/* iOS-style Segmented Control - Snappy animation */}
      <div className="mb-5">
        <div className="relative flex p-1 bg-[var(--fill-tertiary)] rounded-xl">
          {/* Sliding background indicator */}
          <motion.div
            className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg shadow-sm"
            style={{ backgroundColor: accentColor }}
            initial={false}
            animate={{ x: isBuy ? 0 : '100%' }}
            transition={{ type: 'spring', stiffness: 700, damping: 30, mass: 0.5 }}
          />
          <button
            type="button"
            onClick={() => setFormData(prev => ({ ...prev, type: 'BUY' }))}
            className={`relative flex-1 py-2.5 text-[14px] font-semibold rounded-lg z-10 transition-colors duration-150 ${
              isBuy ? 'text-white' : 'text-[var(--label-secondary)]'
            }`}
          >
            Buy
          </button>
          <button
            type="button"
            onClick={() => setFormData(prev => ({ ...prev, type: 'SELL' }))}
            className={`relative flex-1 py-2.5 text-[14px] font-semibold rounded-lg z-10 transition-colors duration-150 ${
              !isBuy ? 'text-white' : 'text-[var(--label-secondary)]'
            }`}
          >
            Sell
          </button>
        </div>
      </div>

      {/* Available quantity hint for SELL */}
      <AnimatePresence>
        {!isBuy && validation.ownedQuantity > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mb-4 overflow-hidden"
          >
            <div className="flex items-center justify-between px-3 py-2 bg-[var(--fill-tertiary)] rounded-lg">
              <span className="text-[12px] text-[var(--label-tertiary)]">Available to sell</span>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, quantity: String(validation.ownedQuantity) }))}
                className="text-[12px] font-semibold text-[var(--chart-primary)] hover:underline"
              >
                {validation.ownedQuantity} units · Sell All
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quantity & Price Inputs */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] font-medium text-[var(--label-tertiary)] uppercase tracking-wider">
              Quantity
            </label>
            <AnimatePresence>
              {touched.quantity && validation.errors.quantity && (
                <motion.span
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="text-[10px] font-medium text-[#DC2626]"
                >
                  {validation.errors.quantity}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <input
            ref={quantityInputRef}
            type="number"
            name="quantity"
            value={formData.quantity}
            onChange={handleChange}
            onBlur={() => handleBlur('quantity')}
            step={asset.asset_type === 'MUTUAL_FUND' ? '0.001' : '1'}
            min="0"
            placeholder="0"
            className={getInputClass('quantity')}
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] font-medium text-[var(--label-tertiary)] uppercase tracking-wider">
              {asset.asset_type === 'MUTUAL_FUND' ? 'NAV Per Unit' : 'Price / Unit'}
            </label>
            <AnimatePresence>
              {touched.price && validation.errors.price && (
                <motion.span
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="text-[10px] font-medium text-[#DC2626]"
                >
                  {validation.errors.price}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <input
            type="number"
            name="price"
            value={formData.price}
            onChange={handleChange}
            onBlur={() => handleBlur('price')}
            step="0.01"
            min="0"
            placeholder="0.00"
            className={getInputClass('price')}
          />
        </div>
      </div>

      {/* Date Input */}
      <div className="mb-5">
        <label className="block text-[11px] font-medium text-[var(--label-tertiary)] uppercase tracking-wider mb-1.5">
          Transaction Date
        </label>
        <input
          type="date"
          name="date"
          value={formData.date}
          onChange={handleChange}
          className="w-full px-4 py-3 bg-[var(--fill-tertiary)] rounded-xl text-[15px] text-[var(--label-primary)] border-2 border-transparent focus:outline-none focus:border-[var(--chart-primary)]/30 focus:ring-2 focus:ring-[var(--chart-primary)]/20 transition-all"
          max={new Date().toISOString().split('T')[0]}
        />
      </div>

      {/* Large Prominent Total */}
      <motion.div
        className="rounded-2xl p-5 mb-5 text-center"
        style={{ backgroundColor: `${accentColor}08` }}
        animate={{ backgroundColor: `${accentColor}08` }}
        transition={{ duration: 0.2 }}
      >
        <motion.p
          className="text-[32px] font-bold tabular-nums tracking-tight"
          style={{ color: accentColor }}
          animate={{ color: accentColor }}
          transition={{ duration: 0.2 }}
        >
          {isBuy ? '+' : '−'}{formatCurrency(totalAmount)}
        </motion.p>
        <p className="text-[12px] text-[var(--label-tertiary)] mt-1 uppercase tracking-wide font-medium">
          Total Amount
        </p>
      </motion.div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <motion.button
          type="button"
          whileTap={tapScale}
          onClick={onCancel}
          className="flex-1 py-3 px-4 rounded-xl font-semibold text-[15px] bg-[var(--fill-tertiary)] text-[var(--label-primary)] hover:bg-[var(--fill-secondary)] transition-colors"
        >
          Cancel
        </motion.button>
        <motion.button
          type="submit"
          whileTap={!loading && validation.isValid ? tapScale : undefined}
          disabled={loading || !validation.isValid}
          className="flex-1 py-3 px-4 rounded-xl font-semibold text-[15px] text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: accentColor }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Recording...
            </span>
          ) : (
            `Record ${isBuy ? 'Buy' : 'Sell'}`
          )}
        </motion.button>
      </div>
    </form>
  );
}
