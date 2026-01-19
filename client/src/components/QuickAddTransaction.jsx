import { useState } from 'react';
import { motion } from 'framer-motion';
import { transactionService } from '../services/transactions';
import { Button } from './apple';
import { spring, tapScale } from '../utils/animations';
import { formatCurrency } from '../utils/formatting';
import { useToast } from '../context/ToastContext';

export default function QuickAddTransaction({ asset, onSuccess, onCancel }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    type: 'BUY',
    quantity: '',
    price: '',
    date: new Date().toISOString().split('T')[0],
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const totalAmount = (parseFloat(formData.quantity) || 0) * (parseFloat(formData.price) || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.quantity || !formData.price) {
      toast.error('Please enter quantity and price');
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

  const inputClass = "w-full px-4 py-3 bg-[var(--fill-tertiary)] border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--system-blue)] transition-all text-[var(--label-primary)] placeholder-[var(--label-tertiary)] text-[15px]";
  const labelClass = "block text-[13px] font-medium text-[var(--label-secondary)] mb-2";

  return (
    <form onSubmit={handleSubmit} className="p-5 space-y-5">
      {/* Asset Info */}
      <div className="bg-[var(--fill-tertiary)] rounded-xl p-4">
        <p className="text-[15px] font-semibold text-[var(--label-primary)]">{asset.name}</p>
        <p className="text-[13px] text-[var(--label-tertiary)]">
          {asset.symbol} {asset.exchange && `• ${asset.exchange}`}
        </p>
      </div>

      {/* Transaction Type Toggle */}
      <div>
        <label className={labelClass}>Transaction Type</label>
        <div className="flex gap-2">
          <motion.button
            type="button"
            whileTap={tapScale}
            onClick={() => setFormData(prev => ({ ...prev, type: 'BUY' }))}
            className={`flex-1 py-3 px-4 rounded-xl font-medium text-[15px] transition-all ${
              formData.type === 'BUY'
                ? 'bg-[var(--system-green)] text-white'
                : 'bg-[var(--fill-tertiary)] text-[var(--label-secondary)]'
            }`}
          >
            Buy
          </motion.button>
          <motion.button
            type="button"
            whileTap={tapScale}
            onClick={() => setFormData(prev => ({ ...prev, type: 'SELL' }))}
            className={`flex-1 py-3 px-4 rounded-xl font-medium text-[15px] transition-all ${
              formData.type === 'SELL'
                ? 'bg-[var(--system-orange)] text-white'
                : 'bg-[var(--fill-tertiary)] text-[var(--label-secondary)]'
            }`}
          >
            Sell
          </motion.button>
        </div>
      </div>

      {/* Quantity & Price */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Quantity</label>
          <input
            type="number"
            name="quantity"
            value={formData.quantity}
            onChange={handleChange}
            step={asset.asset_type === 'MUTUAL_FUND' ? '0.001' : '1'}
            placeholder="0"
            className={inputClass}
            required
            autoFocus
          />
        </div>
        <div>
          <label className={labelClass}>Price per Unit</label>
          <input
            type="number"
            name="price"
            value={formData.price}
            onChange={handleChange}
            step="0.01"
            placeholder="0.00"
            className={inputClass}
            required
          />
        </div>
      </div>

      {/* Date */}
      <div>
        <label className={labelClass}>Transaction Date</label>
        <input
          type="date"
          name="date"
          value={formData.date}
          onChange={handleChange}
          className={inputClass}
          max={new Date().toISOString().split('T')[0]}
        />
      </div>

      {/* Total Preview */}
      <div className="bg-[var(--fill-tertiary)] rounded-xl p-4">
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-[var(--label-tertiary)]">Total Amount</span>
          <span className={`text-[20px] font-semibold ${
            formData.type === 'BUY' ? 'text-[var(--system-green)]' : 'text-[var(--system-orange)]'
          }`}>
            {formData.type === 'BUY' ? '-' : '+'}{formatCurrency(totalAmount)}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="gray" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="filled"
          loading={loading}
          className={`flex-1 ${
            formData.type === 'BUY' ? '!bg-[var(--system-green)]' : '!bg-[var(--system-orange)]'
          }`}
        >
          Record {formData.type === 'BUY' ? 'Buy' : 'Sell'}
        </Button>
      </div>
    </form>
  );
}
