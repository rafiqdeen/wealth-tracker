import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { transactionService } from '../services/transactions';
import { assetService, priceService, ASSET_CONFIG } from '../services/assets';
import { Card, Skeleton, SkeletonRow, BottomSheet, Modal } from '../components/apple';
import { spring } from '../utils/animations';
import { ANIMATION, CategoryIcon } from '../constants/theme';
import { formatCurrency, formatCompact, formatNumber, formatDate, formatPrice } from '../utils/formatting';
import { calculateFixedIncomeValue, getCompoundingFrequency, calculateXIRRFromTransactions, generateRecurringDepositSchedule } from '../utils/interest';
import { useToast } from '../context/ToastContext';
import CSVImport from '../components/CSVImport';
import StockAutocomplete from '../components/StockAutocomplete';

// Category card configuration
const CATEGORY_CARDS = {
  EQUITY: { label: 'Equity', description: 'Stocks & Mutual Funds', gradient: 'from-blue-500/15 to-blue-600/5', iconBg: 'bg-[#4F7DF3]' },
  FIXED_INCOME: { label: 'Fixed Income', description: 'FD, PPF, Bonds', gradient: 'from-emerald-500/15 to-emerald-600/5', iconBg: 'bg-[#059669]' },
  REAL_ESTATE: { label: 'Real Estate', description: 'Property & Land', gradient: 'from-amber-500/15 to-amber-600/5', iconBg: 'bg-[#F59E0B]' },
  PHYSICAL: { label: 'Physical Assets', description: 'Gold, Silver, Art', gradient: 'from-orange-500/15 to-orange-600/5', iconBg: 'bg-[#F97316]' },
  SAVINGS: { label: 'Savings', description: 'Bank Accounts', gradient: 'from-teal-500/15 to-teal-600/5', iconBg: 'bg-[#14B8A6]' },
  CRYPTO: { label: 'Cryptocurrency', description: 'Bitcoin, Ethereum', gradient: 'from-indigo-500/15 to-indigo-600/5', iconBg: 'bg-[#6366F1]' },
  INSURANCE: { label: 'Insurance', description: 'Life, ULIP Policies', gradient: 'from-pink-500/15 to-pink-600/5', iconBg: 'bg-[#EC4899]' },
  OTHER: { label: 'Other', description: 'Miscellaneous', gradient: 'from-gray-500/15 to-gray-600/5', iconBg: 'bg-[#6B7280]' },
};

// Price Comparison Indicator
function PriceCompareIndicator({ txnPrice, currentPrice, type }) {
  if (!currentPrice || !txnPrice || isNaN(currentPrice) || isNaN(txnPrice)) return null;
  const diff = ((currentPrice - txnPrice) / txnPrice) * 100;
  if (isNaN(diff)) return null;
  const isPositive = diff > 0;

  if (type === 'BUY') {
    return (
      <span
        className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${
          isPositive ? 'text-[#059669]' : 'text-[#DC2626]'
        }`}
        title={`Current price is ${isPositive ? 'above' : 'below'} your buy price`}
      >
        {isPositive ? (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
        ) : (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        )}
        {Math.abs(diff).toFixed(1)}%
      </span>
    );
  }
  return null;
}

export default function ManageAsset() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  // Asset & Transaction State
  const [asset, setAsset] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPrice, setCurrentPrice] = useState(null);

  // Metadata Form State
  const [metadataExpanded, setMetadataExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [formData, setFormData] = useState({
    category: '',
    asset_type: '',
    name: '',
    symbol: '',
    exchange: 'NSE',
    quantity: '',
    avg_buy_price: '',
    principal: '',
    interest_rate: '',
    start_date: '',
    maturity_date: '',
    institution: '',
    purchase_price: '',
    current_value: '',
    location: '',
    area_sqft: '',
    appreciation_rate: '',
    real_estate_calc_mode: 'rate',
    balance: '',
    weight_grams: '',
    purity: '',
    premium: '',
    sum_assured: '',
    policy_number: '',
    purchase_date: '',
    notes: '',
    created_at: '',
    updated_at: '',
  });

  // Transaction UI State
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [filterType, setFilterType] = useState('ALL');
  const [sortOrder, setSortOrder] = useState('latest');
  const [deleteModal, setDeleteModal] = useState({ show: false, transaction: null });
  const [deleting, setDeleting] = useState(false);
  const [editModal, setEditModal] = useState({ show: false, transaction: null });
  const [editForm, setEditForm] = useState({ quantity: '', price: '', notes: '', transaction_date: '' });
  const [txnSaving, setTxnSaving] = useState(false);

  // Input styles - matching Edit Transaction modal
  const inputClass = "w-full px-3 py-2.5 bg-[var(--fill-tertiary)] border border-[var(--separator-opaque)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--chart-primary)]/30 focus:border-[var(--chart-primary)] transition-all text-[var(--label-primary)] placeholder-[var(--label-quaternary)] text-[14px]";
  const selectClass = `w-full px-3 py-2.5 pr-10 bg-[var(--fill-tertiary)] border border-[var(--separator-opaque)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--chart-primary)]/30 focus:border-[var(--chart-primary)] transition-all text-[var(--label-primary)] text-[14px] appearance-none cursor-pointer bg-no-repeat bg-[right_12px_center] bg-[length:20px_20px] bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%238E8E93' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19.5 8.25l-7.5 7.5-7.5-7.5'/%3E%3C/svg%3E")]`;
  const labelClass = "block text-[12px] font-medium text-[var(--label-secondary)] mb-1.5";
  const readOnlyInputClass = "w-full px-3 py-2.5 bg-[var(--fill-tertiary)] border border-[var(--separator-opaque)] rounded-lg text-[var(--label-secondary)] text-[14px] cursor-not-allowed";

  useEffect(() => {
    fetchData();
  }, [id]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
      }

      if (e.key === 'Escape' && !deleteModal.show && !editModal.show && !showCSVImport) {
        if (hasUnsavedChanges) {
          if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
            navigate('/assets');
          }
        } else {
          navigate('/assets');
        }
      }

      if (e.key === 'n' || e.key === 'N') {
        if (!deleteModal.show && !editModal.show && !showCSVImport) {
          navigate('/assets/add', {
            state: {
              symbol: asset?.symbol,
              assetType: asset?.asset_type,
              exchange: asset?.exchange,
              category: asset?.category,
              assetId: asset?.id
            }
          });
        }
      }

      if ((e.key === 'e' || e.key === 'E') && !e.metaKey && !e.ctrlKey) {
        if (!deleteModal.show && !editModal.show && !showCSVImport && transactions.length > 0) {
          handleExportCSV();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [asset, deleteModal.show, editModal.show, showCSVImport, transactions, navigate, hasUnsavedChanges]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const fetchData = async () => {
    try {
      const response = await transactionService.getByAsset(id);
      const assetData = response.data.asset;
      setAsset(assetData);
      setTransactions(response.data.transactions);
      setSummary(response.data.summary);

      // Initialize form data
      const roundPrice = (val) => (val !== null && val !== undefined && val !== '') ? Math.round(val * 100) / 100 : '';
      setFormData({
        category: assetData.category || '',
        asset_type: assetData.asset_type || '',
        name: assetData.name || '',
        symbol: assetData.symbol || '',
        exchange: assetData.exchange || 'NSE',
        quantity: assetData.quantity || '',
        avg_buy_price: roundPrice(assetData.avg_buy_price),
        principal: assetData.principal || '',
        interest_rate: assetData.interest_rate || '',
        start_date: assetData.start_date || '',
        maturity_date: assetData.maturity_date || '',
        institution: assetData.institution || '',
        purchase_price: roundPrice(assetData.purchase_price),
        current_value: roundPrice(assetData.current_value),
        location: assetData.location || '',
        area_sqft: assetData.area_sqft || '',
        appreciation_rate: assetData.appreciation_rate || '',
        real_estate_calc_mode: assetData.appreciation_rate ? 'rate' : (assetData.current_value ? 'value' : 'rate'),
        balance: assetData.balance || '',
        weight_grams: assetData.weight_grams || '',
        purity: assetData.purity || '',
        premium: assetData.premium || '',
        sum_assured: assetData.sum_assured || '',
        policy_number: assetData.policy_number || '',
        purchase_date: assetData.purchase_date || '',
        notes: assetData.notes || '',
        created_at: assetData.created_at || '',
        updated_at: assetData.updated_at || '',
      });

      // Fetch current price for equity
      if (assetData?.category === 'EQUITY' && assetData?.symbol) {
        try {
          const isMutualFund = assetData.asset_type === 'MUTUAL_FUND';
          const type = isMutualFund ? 'mf' : 'stock';
          const symbol = isMutualFund
            ? assetData.symbol
            : `${assetData.symbol}.${assetData.exchange === 'BSE' ? 'BO' : 'NS'}`;

          const priceResponse = await priceService.getPrice(symbol, type);
          const fetchedPrice = priceResponse.data?.price?.price;
          if (fetchedPrice && !isNaN(fetchedPrice) && fetchedPrice > 0) {
            setCurrentPrice(fetchedPrice);
          }
        } catch {
          // Price fetch failed, continue without current price
        }
      }
    } catch {
      setError('Failed to load asset');
    } finally {
      setLoading(false);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setHasUnsavedChanges(true);
  };

  const handleSaveMetadata = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      let dataToSubmit = { ...formData };

      // Real estate calculation
      if (formData.category === 'REAL_ESTATE' && formData.purchase_price && formData.purchase_date) {
        const purchasePrice = parseFloat(formData.purchase_price);
        const purchaseDate = new Date(formData.purchase_date);
        const today = new Date();
        const years = (today - purchaseDate) / (365.25 * 24 * 60 * 60 * 1000);
        const calcMode = formData.real_estate_calc_mode || 'rate';

        if (calcMode === 'rate' && formData.appreciation_rate) {
          const rate = parseFloat(formData.appreciation_rate) / 100;
          dataToSubmit.current_value = Math.round(purchasePrice * Math.pow(1 + rate, Math.max(0, years)));
        } else if (calcMode === 'value' && formData.current_value) {
          const currentValue = parseFloat(formData.current_value);
          if (years > 0 && purchasePrice > 0) {
            dataToSubmit.appreciation_rate = Math.round((Math.pow(currentValue / purchasePrice, 1 / years) - 1) * 1000) / 10;
          }
        }
      }

      await assetService.update(id, dataToSubmit);
      toast.success('Asset updated successfully');
      setHasUnsavedChanges(false);
      fetchData(); // Refresh data
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update asset');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (transaction) => {
    setDeleteModal({ show: true, transaction });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModal.transaction) return;

    setDeleting(true);
    try {
      await transactionService.delete(deleteModal.transaction.id);
      toast.success('Transaction deleted');
      setDeleteModal({ show: false, transaction: null });
      fetchData();
    } catch {
      toast.error('Failed to delete transaction');
    } finally {
      setDeleting(false);
    }
  };

  const handleEditClick = (transaction) => {
    setEditForm({
      quantity: transaction.quantity?.toString() || '',
      price: transaction.price?.toString() || '',
      notes: transaction.notes || '',
      transaction_date: transaction.transaction_date?.split('T')[0] || ''
    });
    setEditModal({ show: true, transaction });
  };

  const handleEditSave = async () => {
    if (!editModal.transaction) return;

    setTxnSaving(true);
    try {
      await transactionService.update(editModal.transaction.id, {
        quantity: parseFloat(editForm.quantity) || editModal.transaction.quantity,
        price: parseFloat(editForm.price) || editModal.transaction.price,
        notes: editForm.notes,
        transaction_date: editForm.transaction_date || editModal.transaction.transaction_date
      });
      toast.success('Transaction updated');
      setEditModal({ show: false, transaction: null });
      fetchData();
    } catch {
      toast.error('Failed to update transaction');
    } finally {
      setTxnSaving(false);
    }
  };

  const handleCSVImportSuccess = () => {
    setShowCSVImport(false);
    fetchData();
  };

  const handleExportCSV = useCallback(() => {
    if (!asset || transactions.length === 0) return;

    const isFixedIncome = asset.category === 'FIXED_INCOME';
    const headers = isFixedIncome
      ? ['Date', 'Type', 'Amount', 'Notes']
      : ['Date', 'Type', 'Quantity', 'Price', 'Total', 'Gain/Loss', 'Notes'];

    const rows = transactions.map(txn => {
      if (isFixedIncome) {
        return [
          formatDate(txn.transaction_date),
          txn.type,
          txn.total_amount,
          `"${(txn.notes || '').replace(/"/g, '""')}"`
        ];
      }
      return [
        formatDate(txn.transaction_date),
        txn.type,
        txn.quantity,
        txn.price,
        txn.total_amount,
        txn.type === 'SELL' && txn.realized_gain !== null ? txn.realized_gain : '',
        `"${(txn.notes || '').replace(/"/g, '""')}"`
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${asset.symbol || asset.name}_transactions_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success('Transactions exported');
  }, [asset, transactions, toast]);

  // Get category color for gradient
  const getCategoryColor = () => {
    if (asset?.category === 'EQUITY' && asset?.asset_type === 'MUTUAL_FUND') {
      return '#8B5CF6';
    }
    const colors = {
      'EQUITY': '#4F7DF3',
      'FIXED_INCOME': '#059669',
      'REAL_ESTATE': '#F59E0B',
      'GOLD': '#F97316',
      'SAVINGS': '#14B8A6',
      'CRYPTO': '#6366F1',
      'INSURANCE': '#EC4899',
    };
    return colors[asset?.category] || '#4F7DF3';
  };

  // Transaction counts for filter badges
  const transactionCounts = useMemo(() => {
    const counts = { ALL: transactions.length, BUY: 0, SELL: 0 };
    transactions.forEach(txn => {
      if (txn.type === 'BUY') counts.BUY++;
      else if (txn.type === 'SELL') counts.SELL++;
    });
    return counts;
  }, [transactions]);

  // Filter, sort, and calculate running balance
  const processedTransactions = useMemo(() => {
    let result = [...transactions];

    if (filterType !== 'ALL') {
      result = result.filter(txn => txn.type === filterType);
    }

    result.sort((a, b) => {
      const dateA = new Date(a.transaction_date);
      const dateB = new Date(b.transaction_date);
      return sortOrder === 'latest' ? dateB - dateA : dateA - dateB;
    });

    const sortedByDate = [...transactions].sort((a, b) =>
      new Date(a.transaction_date) - new Date(b.transaction_date)
    );

    const balanceMap = {};
    let runningBalance = 0;
    sortedByDate.forEach(txn => {
      if (txn.type === 'BUY') {
        runningBalance += txn.quantity || 0;
      } else if (txn.type === 'SELL') {
        runningBalance -= txn.quantity || 0;
      }
      balanceMap[txn.id] = runningBalance;
    });

    return result.map(txn => ({
      ...txn,
      runningBalance: balanceMap[txn.id] || 0
    }));
  }, [transactions, filterType, sortOrder]);

  // Render category-specific fields for metadata form
  const renderCategoryFields = () => {
    const { category, asset_type } = formData;

    switch (category) {
      case 'EQUITY':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Symbol</label>
              <input type="text" name="symbol" value={formData.symbol} onChange={handleFormChange} placeholder={asset_type === 'MUTUAL_FUND' ? 'AMFI Scheme Code' : 'e.g., RELIANCE'} className={inputClass} />
            </div>
            {asset_type !== 'MUTUAL_FUND' && (
              <div>
                <label className={labelClass}>Exchange</label>
                <select name="exchange" value={formData.exchange} onChange={handleFormChange} className={selectClass}>
                  <option value="NSE">NSE</option>
                  <option value="BSE">BSE</option>
                </select>
              </div>
            )}
            {/* Read-only calculated fields for EQUITY */}
            <div className="md:col-span-2 bg-[var(--fill-tertiary)] rounded-xl p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Quantity <span className="text-[var(--label-quaternary)] font-normal">(calculated)</span></label>
                  <p className="text-[17px] font-semibold text-[var(--label-primary)] tabular-nums">{formData.quantity || '0'}</p>
                </div>
                <div>
                  <label className={labelClass}>Avg Buy Price <span className="text-[var(--label-quaternary)] font-normal">(calculated)</span></label>
                  <p className="text-[17px] font-semibold text-[var(--label-primary)] tabular-nums">{formData.avg_buy_price ? formatCurrency(formData.avg_buy_price) : '₹0'}</p>
                </div>
              </div>
              <p className="text-[12px] text-[var(--label-tertiary)] mt-3 flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
                Calculated from {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}. Edit transactions below to update these values.
              </p>
            </div>
          </div>
        );

      case 'FIXED_INCOME':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Principal Amount</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                <input type="number" name="principal" value={formData.principal} onChange={handleFormChange} placeholder="0" className={`${inputClass} pl-8`} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Interest Rate (% p.a.)</label>
              <input type="number" name="interest_rate" value={formData.interest_rate} onChange={handleFormChange} step="0.01" placeholder="0.00" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Institution</label>
              <input type="text" name="institution" value={formData.institution} onChange={handleFormChange} placeholder="e.g., SBI, HDFC Bank" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Start Date</label>
              <input type="date" name="start_date" value={formData.start_date} onChange={handleFormChange} className={inputClass} />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Maturity Date</label>
              <input type="date" name="maturity_date" value={formData.maturity_date} onChange={handleFormChange} className={inputClass} />
            </div>
          </div>
        );

      case 'REAL_ESTATE': {
        const calcMode = formData.real_estate_calc_mode || 'rate';
        return (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
              <div>
                <label className={labelClass}>Purchase Price</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                  <input type="number" name="purchase_price" value={formData.purchase_price} onChange={handleFormChange} placeholder="0" className={`${inputClass} pl-8`} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Purchase Date</label>
                <input type="date" name="purchase_date" value={formData.purchase_date} onChange={handleFormChange} className={inputClass} />
              </div>
            </div>
            <div className="mb-5 p-4 bg-[var(--fill-tertiary)]/50 rounded-xl">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[13px] font-semibold text-[var(--label-primary)]">Valuation Method</span>
                <div className="flex items-center bg-[var(--bg-primary)] rounded-lg p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => { setFormData(prev => ({ ...prev, real_estate_calc_mode: 'rate', current_value: '' })); setHasUnsavedChanges(true); }}
                    className={`px-4 py-2 text-[13px] font-semibold rounded-md transition-all ${
                      calcMode === 'rate' ? 'bg-[var(--chart-primary)] text-white shadow-sm' : 'text-[var(--label-secondary)] hover:text-[var(--label-primary)]'
                    }`}
                  >
                    Enter Rate
                  </button>
                  <button
                    type="button"
                    onClick={() => { setFormData(prev => ({ ...prev, real_estate_calc_mode: 'value', appreciation_rate: '' })); setHasUnsavedChanges(true); }}
                    className={`px-4 py-2 text-[13px] font-semibold rounded-md transition-all ${
                      calcMode === 'value' ? 'bg-[var(--chart-primary)] text-white shadow-sm' : 'text-[var(--label-secondary)] hover:text-[var(--label-primary)]'
                    }`}
                  >
                    Enter Value
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>Appreciation Rate {calcMode === 'value' && <span className="text-[var(--system-green)] ml-1 text-[11px]">(Auto)</span>}</label>
                  <div className="relative">
                    <input type="number" name="appreciation_rate" value={formData.appreciation_rate} onChange={handleFormChange} placeholder="6" step="0.1" readOnly={calcMode === 'value'} className={`${calcMode === 'value' ? readOnlyInputClass : inputClass} pr-16`} />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)] text-[13px]">% p.a.</span>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Current Value {calcMode === 'rate' && <span className="text-[var(--system-green)] ml-1 text-[11px]">(Auto)</span>}</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                    <input type="number" name="current_value" value={formData.current_value} onChange={handleFormChange} placeholder="0" readOnly={calcMode === 'rate'} className={`${calcMode === 'rate' ? readOnlyInputClass : inputClass} pl-8`} />
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>Location</label>
                <input type="text" name="location" value={formData.location} onChange={handleFormChange} placeholder="City, State" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Area (sq.ft)</label>
                <input type="number" name="area_sqft" value={formData.area_sqft} onChange={handleFormChange} placeholder="0" className={inputClass} />
              </div>
            </div>
          </>
        );
      }

      case 'PHYSICAL':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {(asset_type === 'GOLD' || asset_type === 'SILVER') && (
              <>
                <div>
                  <label className={labelClass}>Weight (grams)</label>
                  <input type="number" name="weight_grams" value={formData.weight_grams} onChange={handleFormChange} step="0.01" placeholder="0.00" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Purity</label>
                  <select name="purity" value={formData.purity} onChange={handleFormChange} className={selectClass}>
                    <option value="">Select purity</option>
                    <option value="24K">24K (99.9%)</option>
                    <option value="22K">22K (91.6%)</option>
                    <option value="18K">18K (75%)</option>
                    <option value="999">999 Silver</option>
                    <option value="925">925 Sterling</option>
                  </select>
                </div>
              </>
            )}
            <div>
              <label className={labelClass}>Purchase Price</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                <input type="number" name="purchase_price" value={formData.purchase_price} onChange={handleFormChange} placeholder="0" className={`${inputClass} pl-8`} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Current Value</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                <input type="number" name="current_value" value={formData.current_value} onChange={handleFormChange} placeholder="0" className={`${inputClass} pl-8`} />
              </div>
            </div>
          </div>
        );

      case 'SAVINGS':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Current Balance</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                <input type="number" name="balance" value={formData.balance} onChange={handleFormChange} placeholder="0" className={`${inputClass} pl-8`} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Interest Rate (% p.a.)</label>
              <input type="number" name="interest_rate" value={formData.interest_rate} onChange={handleFormChange} step="0.01" placeholder="0.00" className={inputClass} />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Bank/Institution</label>
              <input type="text" name="institution" value={formData.institution} onChange={handleFormChange} placeholder="e.g., SBI, HDFC Bank" className={inputClass} />
            </div>
          </div>
        );

      case 'CRYPTO':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Symbol</label>
              <input type="text" name="symbol" value={formData.symbol} onChange={handleFormChange} placeholder="e.g., BTC, ETH" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Exchange/Wallet</label>
              <input type="text" name="institution" value={formData.institution} onChange={handleFormChange} placeholder="e.g., WazirX, Binance" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Quantity</label>
              <input type="number" name="quantity" value={formData.quantity} onChange={handleFormChange} step="0.00000001" placeholder="0.00000000" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Avg Buy Price</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                <input type="number" name="avg_buy_price" value={formData.avg_buy_price} onChange={handleFormChange} step="0.01" placeholder="0.00" className={`${inputClass} pl-8`} />
              </div>
            </div>
          </div>
        );

      case 'INSURANCE':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Policy Number</label>
              <input type="text" name="policy_number" value={formData.policy_number} onChange={handleFormChange} placeholder="Policy number" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Institution</label>
              <input type="text" name="institution" value={formData.institution} onChange={handleFormChange} placeholder="e.g., LIC, ICICI Prudential" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Premium/year</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                <input type="number" name="premium" value={formData.premium} onChange={handleFormChange} placeholder="0" className={`${inputClass} pl-8`} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Sum Assured</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                <input type="number" name="sum_assured" value={formData.sum_assured} onChange={handleFormChange} placeholder="0" className={`${inputClass} pl-8`} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Current Value</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                <input type="number" name="current_value" value={formData.current_value} onChange={handleFormChange} placeholder="For ULIP/endowment" className={`${inputClass} pl-8`} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Maturity Date</label>
              <input type="date" name="maturity_date" value={formData.maturity_date} onChange={handleFormChange} className={inputClass} />
            </div>
          </div>
        );

      case 'OTHER':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Current Value</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                <input type="number" name="current_value" value={formData.current_value} onChange={handleFormChange} placeholder="0" className={`${inputClass} pl-8`} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Purchase Price</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                <input type="number" name="purchase_price" value={formData.purchase_price} onChange={handleFormChange} placeholder="0" className={`${inputClass} pl-8`} />
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:px-12 md:py-6 h-full overflow-auto">
        <Card padding="p-0" className="overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--separator-opaque)]">
            <Skeleton width="250px" height="1.5rem" rounded="md" className="mb-2" />
            <Skeleton width="180px" height="0.875rem" rounded="sm" />
          </div>
          <div className="px-5 py-3 border-b border-[var(--separator-opaque)]">
            <Skeleton width="100%" height="5rem" rounded="lg" />
          </div>
          {[1, 2, 3, 4, 5].map(i => (
            <SkeletonRow key={i} columns={7} />
          ))}
        </Card>
      </div>
    );
  }

  if (error || !asset) {
    return (
      <div className="p-4 md:px-12 md:py-6 h-full overflow-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring.gentle}>
          <Card padding="p-6" className="bg-[#DC2626]/10 border-[#DC2626]/20">
            <p className="text-[#DC2626] text-[15px] font-medium">{error || 'Asset not found'}</p>
          </Card>
          <Link to="/assets" className="mt-4 inline-flex items-center gap-1.5 text-[var(--chart-primary)] text-[14px] font-medium hover:underline">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Assets
          </Link>
        </motion.div>
      </div>
    );
  }

  const isFixedIncome = asset?.category === 'FIXED_INCOME';
  const categoryColor = getCategoryColor();
  const categoryConfig = CATEGORY_CARDS[formData.category];
  const selectedType = ASSET_CONFIG[formData.category]?.types.find(t => t.value === formData.asset_type);

  // Recurring deposit types
  const recurringDepositTypes = ['PPF', 'RD', 'EPF', 'VPF', 'SSY'];
  const isRecurringType = recurringDepositTypes.includes(asset?.asset_type);

  // Calculate Fixed Income values
  const getInterestCalc = () => {
    if (!isFixedIncome) return null;
    if (transactions.length > 0) {
      return calculateFixedIncomeValue(transactions, asset?.interest_rate || 7.1, new Date(), getCompoundingFrequency(asset?.asset_type));
    }
    if (asset?.principal) {
      if (isRecurringType) {
        return { principal: asset.principal, currentValue: asset.principal, interest: 0, interestPercent: 0, needsTransactions: true };
      }
      const startDate = asset.start_date || asset.created_at?.split('T')[0] || new Date().toISOString().split('T')[0];
      const fakeTransaction = [{ type: 'BUY', total_amount: asset.principal, transaction_date: startDate }];
      return calculateFixedIncomeValue(fakeTransaction, asset?.interest_rate || 7.1, new Date(), getCompoundingFrequency(asset?.asset_type));
    }
    return null;
  };
  const interestCalc = getInterestCalc();

  // Recurring deposit schedule
  const hasTransactions = transactions.length > 0;

  const recurringSchedule = isFixedIncome && isRecurringType && hasTransactions && asset?.interest_rate
    ? generateRecurringDepositSchedule(transactions, asset.interest_rate, asset.start_date)
    : null;

  // Calculate stats for sidebar
  const getStatsData = () => {
    const sortedByDateDesc = [...transactions].sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));
    const sortedByDateAsc = [...transactions].sort((a, b) => new Date(a.transaction_date) - new Date(b.transaction_date));

    const quantity = parseFloat(summary?.current_quantity || asset?.quantity) || 0;
    const avgBuyPrice = parseFloat(summary?.avg_buy_price || asset?.avg_buy_price) || 0;
    const latestTxnPrice = sortedByDateDesc.length > 0 ? parseFloat(sortedByDateDesc[0].price) : 0;
    const validCurrentPrice = currentPrice && !isNaN(currentPrice) ? currentPrice : 0;
    const effectivePrice = validCurrentPrice || latestTxnPrice || avgBuyPrice;

    // Calculate invested and current value based on asset category
    let invested, currentValueCalc;

    if (asset?.category === 'REAL_ESTATE' || asset?.category === 'PHYSICAL') {
      // Real Estate and Physical assets use purchase_price and current_value
      invested = parseFloat(asset?.purchase_price) || 0;
      currentValueCalc = parseFloat(asset?.current_value) || invested;
    } else if (asset?.category === 'SAVINGS') {
      // Savings use balance
      invested = parseFloat(asset?.balance) || 0;
      currentValueCalc = invested;
    } else {
      // Equity and others use quantity * price
      invested = quantity * avgBuyPrice;
      currentValueCalc = effectivePrice * quantity;
    }

    const gainLoss = currentValueCalc - invested;
    const returnPct = invested > 0 && !isNaN(gainLoss) ? (gainLoss / invested) * 100 : 0;
    const isPositive = gainLoss >= 0;
    const isPriceEstimated = !validCurrentPrice && latestTxnPrice > 0;

    let firstDate = sortedByDateAsc.length > 0 ? new Date(sortedByDateAsc[0].transaction_date) : null;
    if (!firstDate && isFixedIncome && asset?.start_date) firstDate = new Date(asset.start_date);
    if (!firstDate && (asset?.category === 'REAL_ESTATE' || asset?.category === 'PHYSICAL') && asset?.purchase_date) {
      firstDate = new Date(asset.purchase_date);
    }
    let holdingPeriod = '—';
    if (firstDate) {
      const days = Math.floor((new Date() - firstDate) / (1000 * 60 * 60 * 24));
      const years = Math.floor(days / 365);
      const months = Math.floor((days % 365) / 30);
      if (years > 0) holdingPeriod = `${years}y ${months}m`;
      else if (months > 0) holdingPeriod = `${months}m ${days % 30}d`;
      else holdingPeriod = `${days}d`;
    }

    const xirrRaw = currentValueCalc > 0 ? calculateXIRRFromTransactions(transactions, currentValueCalc) : 0;
    const holdingDays = firstDate ? Math.floor((new Date() - firstDate) / (1000 * 60 * 60 * 24)) : 0;
    const xirrValid = xirrRaw && !isNaN(xirrRaw) && holdingDays >= 30;
    const xirr = xirrValid ? Math.min(Math.max(xirrRaw, -999.99), 999.99) : 0;
    const xirrIsPositive = xirr >= 0;
    const xirrCapped = xirrValid && Math.abs(xirrRaw) > 999.99;

    // Fixed income specific
    const fiDeposited = recurringSchedule?.summary?.totalDeposited || interestCalc?.principal || invested;
    const fiCurrentValue = recurringSchedule?.summary?.currentValue || interestCalc?.currentValue || invested;
    const fiInterest = recurringSchedule?.summary?.totalInterest || interestCalc?.interest || 0;
    const fiInterestPercent = recurringSchedule?.summary?.interestPercent || interestCalc?.interestPercent || 0;
    const needsTxns = !recurringSchedule && interestCalc?.needsTransactions;

    return {
      quantity, avgBuyPrice, invested, currentValue: currentValueCalc, gainLoss, returnPct, isPositive, isPriceEstimated,
      holdingPeriod, holdingDays, xirr, xirrIsPositive, xirrCapped, xirrValid,
      fiDeposited, fiCurrentValue, fiInterest, fiInterestPercent, needsTxns
    };
  };
  const statsData = getStatsData();

  return (
    <div className="p-4 md:px-8 md:py-6 h-full overflow-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring.gentle}>
        {/* Single Unified Card with Sidebar + Main Content */}
        <Card padding="p-0" className="overflow-hidden">
          <div className="flex flex-col lg:flex-row min-h-[600px]">

            {/* LEFT SIDEBAR - Asset Info & Stats */}
            <div className="lg:w-[300px] xl:w-[320px] flex-shrink-0 border-b lg:border-b-0 lg:border-r border-[var(--separator-opaque)] bg-gradient-to-b from-[var(--fill-tertiary)]/50 to-transparent">
              <div className="p-5">
                {/* Back Button */}
                <Link
                  to="/assets"
                  className="inline-flex items-center gap-1.5 text-[13px] text-[var(--label-tertiary)] hover:text-[var(--chart-primary)] transition-colors mb-6"
                  title="Press Esc to go back"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to Assets
                </Link>

                {/* Asset Header with Enhanced Icon */}
                <div className="mb-6">
                  {/* Large Icon with Glow Effect */}
                  <div className="relative mb-4">
                    <div
                      className={`w-14 h-14 rounded-2xl ${categoryConfig?.iconBg || 'bg-gray-500'} flex items-center justify-center shadow-lg`}
                      style={{
                        boxShadow: `0 8px 24px -4px ${categoryColor}40, 0 4px 8px -2px ${categoryColor}30`
                      }}
                    >
                      <span className="text-white text-xl"><CategoryIcon category={formData.category} /></span>
                    </div>
                  </div>

                  {/* Asset Name & Type */}
                  <h1 className="text-[22px] font-bold text-[var(--label-primary)] leading-tight mb-1" style={{ fontFamily: 'var(--font-display)' }}>{asset.name}</h1>
                  <p className="text-[13px] text-[var(--label-secondary)]">
                    {selectedType?.label || formData.asset_type?.replace(/_/g, ' ')} • {categoryConfig?.label || formData.category}
                  </p>
                  {asset.symbol && !isFixedIncome && (
                    <p className="text-[12px] text-[var(--label-tertiary)] mt-1 font-mono">{asset.symbol}</p>
                  )}

                  {/* LTP Glass Card */}
                  {currentPrice && !isNaN(currentPrice) && !isFixedIncome && (
                    <div className="mt-4 p-3 bg-[var(--bg-primary)]/80 backdrop-blur-sm border border-[var(--separator-opaque)] rounded-xl">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide">Last Traded Price</span>
                      </div>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-[20px] font-bold text-[var(--label-primary)] tabular-nums">{formatPrice(currentPrice)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Stats Section */}
                <div className="space-y-4">
                  {!isFixedIncome ? (
                    <>
                      {/* Value Card */}
                      <div className="p-3 bg-[var(--bg-primary)]/60 border border-[var(--separator-opaque)] rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide">Invested</span>
                          <span className="text-[16px] font-semibold text-[var(--label-primary)] tabular-nums">{formatCompact(statsData.invested)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide">
                            Current {statsData.isPriceEstimated && <span className="text-[9px]">(est)</span>}
                          </span>
                          <span className="text-[16px] font-semibold text-[var(--label-primary)] tabular-nums">{formatCompact(statsData.currentValue)}</span>
                        </div>
                      </div>

                      {/* Performance Highlight Card with Gradient */}
                      <div
                        className={`p-3 rounded-xl border border-[var(--separator-opaque)] overflow-hidden ${statsData.isPositive ? 'bg-gradient-to-r from-[#059669]/12 via-[#059669]/6 to-transparent' : 'bg-gradient-to-r from-[#DC2626]/12 via-[#DC2626]/6 to-transparent'}`}
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide">P&L</span>
                            <span className={`text-[17px] font-bold tabular-nums ${statsData.isPositive ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                              {statsData.isPositive ? '+' : ''}{formatCompact(statsData.gainLoss)}
                            </span>
                          </div>

                          {/* Progress Bar */}
                          <div className="h-1.5 bg-[var(--bg-primary)]/60 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${statsData.isPositive ? 'bg-[#059669]' : 'bg-[#DC2626]'}`}
                              style={{ width: `${Math.min(Math.abs(statsData.returnPct), 100)}%` }}
                            />
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide">Return</span>
                            <span className={`text-[15px] font-bold tabular-nums ${statsData.isPositive ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                              {statsData.isPositive ? '+' : ''}{statsData.returnPct.toFixed(2)}%
                            </span>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide">
                              XIRR {statsData.holdingDays < 30 && <span className="text-[9px]">(30d+)</span>}
                            </span>
                            <span className={`text-[15px] font-bold tabular-nums ${statsData.xirrIsPositive ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                              {statsData.xirr ? `${statsData.xirrIsPositive ? '+' : ''}${statsData.xirr.toFixed(2)}%${statsData.xirrCapped ? '+' : ''}` : '—'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Details Card */}
                      <div className="p-3 bg-[var(--bg-primary)]/60 border border-[var(--separator-opaque)] rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide">Avg Price</span>
                          <span className="text-[15px] font-semibold text-[var(--label-primary)] tabular-nums">{formatPrice(statsData.avgBuyPrice)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide">Units</span>
                          <span className="text-[15px] font-semibold text-[var(--label-primary)] tabular-nums">{formatNumber(statsData.quantity, 2)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide">Holding</span>
                          <span className="text-[15px] font-semibold text-[var(--label-primary)] tabular-nums">{statsData.holdingPeriod}</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Fixed Income Stats */}
                      {statsData.needsTxns && (
                        <div className="px-3 py-2.5 bg-[var(--system-orange)]/10 border border-[var(--system-orange)]/20 rounded-xl">
                          <p className="text-[11px] text-[var(--system-orange)]">
                            Add periodic contributions to calculate accurate interest.
                          </p>
                        </div>
                      )}

                      {/* Value Card */}
                      <div className="p-3 bg-[var(--bg-primary)]/60 border border-[var(--separator-opaque)] rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide">Deposited</span>
                          <span className="text-[16px] font-semibold text-[var(--label-primary)] tabular-nums">{formatCompact(statsData.fiDeposited)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide">Current</span>
                          <span className="text-[16px] font-semibold text-[var(--label-primary)] tabular-nums">{statsData.needsTxns ? '—' : formatCompact(statsData.fiCurrentValue)}</span>
                        </div>
                      </div>

                      {/* Performance Highlight Card with Gradient */}
                      <div className="p-3 rounded-xl border border-[var(--separator-opaque)] overflow-hidden bg-gradient-to-r from-[#059669]/12 via-[#059669]/6 to-transparent">
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide">Interest</span>
                            <span className="text-[17px] font-bold text-[#059669] tabular-nums">{statsData.needsTxns ? '—' : `+${formatCompact(statsData.fiInterest)}`}</span>
                          </div>

                          {/* Progress Bar */}
                          {!statsData.needsTxns && (
                            <div className="h-1.5 bg-[var(--bg-primary)]/60 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-[#059669] transition-all"
                                style={{ width: `${Math.min(statsData.fiInterestPercent, 100)}%` }}
                              />
                            </div>
                          )}

                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide">Return</span>
                            <span className="text-[15px] font-bold text-[#059669] tabular-nums">{statsData.needsTxns ? '—' : `+${statsData.fiInterestPercent.toFixed(1)}%`}</span>
                          </div>
                        </div>
                      </div>

                      {/* Details Card */}
                      <div className="p-3 bg-[var(--bg-primary)]/60 border border-[var(--separator-opaque)] rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide">Holding</span>
                          <span className="text-[15px] font-semibold text-[var(--label-primary)] tabular-nums">{statsData.holdingPeriod}</span>
                        </div>
                        {asset.institution && (
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-[var(--label-tertiary)] uppercase tracking-wide">Institution</span>
                            <span className="text-[13px] font-medium text-[var(--label-primary)]">{asset.institution}</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Edit Asset Button */}
                <div className="mt-6">
                  <button
                    onClick={() => setMetadataExpanded(!metadataExpanded)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[var(--bg-primary)] border border-[var(--separator-opaque)] rounded-xl text-[13px] font-semibold text-[var(--label-primary)] hover:bg-[var(--fill-tertiary)] transition-all hover:shadow-sm"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                    </svg>
                    Edit Asset Details
                    {hasUnsavedChanges && (
                      <span className="px-1.5 py-0.5 bg-[var(--system-orange)]/15 text-[var(--system-orange)] text-[10px] font-semibold rounded">Unsaved</span>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT MAIN CONTENT - Transactions */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Transactions Header */}
              <div className="px-5 py-4 border-b border-[var(--separator-opaque)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-[17px] font-bold text-[var(--label-primary)]">
                    {isFixedIncome ? 'Deposits' : 'Transactions'}
                  </h2>
                  <p className="text-[12px] text-[var(--label-tertiary)] mt-0.5">
                    {transactions.length} record{transactions.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {transactions.length > 0 && (
                    <button
                      onClick={handleExportCSV}
                      className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--fill-tertiary)] border border-[var(--separator-opaque)] text-[var(--label-primary)] hover:bg-[var(--fill-secondary)] transition-colors text-[13px] font-semibold"
                      title="Export to CSV (E)"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      Export
                    </button>
                  )}
                  {!isFixedIncome && (
                    <button
                      onClick={() => setShowCSVImport(true)}
                      className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--fill-tertiary)] border border-[var(--separator-opaque)] text-[var(--label-primary)] hover:bg-[var(--fill-secondary)] transition-colors text-[13px] font-semibold"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                      Import
                    </button>
                  )}
                  <Link to="/assets/add" state={{ symbol: asset.symbol, assetType: asset.asset_type, exchange: asset.exchange, category: asset.category, assetId: asset.id }}>
                    <button
                      className="flex items-center gap-2 px-3.5 py-2 text-white rounded-xl text-[13px] font-semibold transition-colors hover:opacity-90 border border-transparent"
                      style={{ backgroundColor: categoryColor }}
                      title="Add Transaction (N)"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      {isFixedIncome ? 'Add Deposit' : 'Add'}
                    </button>
                  </Link>
                </div>
              </div>

            {/* Filter/Sort Row */}
            {transactions.length > 0 && (
              <div className="px-5 py-2.5 border-b border-[var(--separator-opaque)] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[var(--label-tertiary)]">Filter:</span>
                  <div className="flex gap-1">
                    {['ALL', 'BUY', 'SELL'].map((type) => (
                      <button key={type} onClick={() => setFilterType(type)} className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1.5 ${filterType === type ? type === 'BUY' ? 'bg-[#059669]/15 text-[#059669]' : type === 'SELL' ? 'bg-[#DC2626]/15 text-[#DC2626]' : 'bg-[var(--fill-secondary)] text-[var(--label-primary)]' : 'text-[var(--label-tertiary)] hover:bg-[var(--fill-tertiary)]'}`}>
                        {type === 'ALL' ? 'All' : isFixedIncome ? 'DEP' : type}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${filterType === type ? 'bg-white/30' : 'bg-[var(--fill-tertiary)]'}`}>{transactionCounts[type]}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[var(--label-tertiary)]">Sort:</span>
                  <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="px-2 py-1 rounded-md text-[12px] font-medium bg-[var(--fill-tertiary)] text-[var(--label-primary)] border-none outline-none cursor-pointer">
                    <option value="latest">Latest First</option>
                    <option value="oldest">Oldest First</option>
                  </select>
                </div>
              </div>
            )}

            {/* Transaction Table */}
            {processedTransactions.length > 0 ? (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-[var(--fill-tertiary)]/80 backdrop-blur-sm">
                        <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider">Date</th>
                        <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider">Type</th>
                        {!isFixedIncome && <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider">Qty</th>}
                        {!isFixedIncome && <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider">Price</th>}
                        <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider">{isFixedIncome ? 'Amount' : 'Total'}</th>
                        {!isFixedIncome && <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider">Gain/Loss</th>}
                        <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider">Notes</th>
                        <th className="px-5 py-2.5 w-20"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--separator-opaque)]">
                      <AnimatePresence>
                        {processedTransactions.map((txn, index) => (
                          <motion.tr key={txn.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ ...spring.snappy, delay: Math.min(index * ANIMATION.STAGGER_DELAY, ANIMATION.STAGGER_DELAY_MAX) }} className="group hover:bg-[var(--fill-tertiary)]/40 transition-colors">
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <span className="text-[14px] font-medium text-[var(--label-primary)] tabular-nums">{formatDate(txn.transaction_date)}</span>
                            </td>
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <span className={`inline-flex items-center justify-center w-14 py-1 rounded-md text-[11px] font-bold ${txn.type === 'BUY' ? 'bg-[#059669] text-white' : 'bg-[#DC2626] text-white'}`}>
                                {isFixedIncome ? 'DEP' : txn.type}
                              </span>
                              {txn.is_initial_holding === 1 && <span className="ml-2 text-[10px] text-[var(--label-quaternary)] cursor-help" title="This was recorded as an initial/existing holding">Initial</span>}
                            </td>
                            {!isFixedIncome && (
                              <td className="px-5 py-3.5 whitespace-nowrap text-right">
                                <span className="text-[15px] font-semibold text-[var(--label-primary)] tabular-nums">{formatNumber(txn.quantity)}</span>
                              </td>
                            )}
                            {!isFixedIncome && (
                              <td className="px-5 py-3.5 whitespace-nowrap text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <span className="text-[14px] text-[var(--label-secondary)] tabular-nums">{formatPrice(txn.price)}</span>
                                  <PriceCompareIndicator txnPrice={txn.price} currentPrice={currentPrice} type={txn.type} />
                                </div>
                              </td>
                            )}
                            <td className="px-5 py-3.5 whitespace-nowrap text-right">
                              <span className="text-[15px] font-bold text-[var(--label-primary)] tabular-nums">{formatCurrency(txn.total_amount)}</span>
                            </td>
                            {!isFixedIncome && (
                              <td className="px-5 py-3.5 whitespace-nowrap text-right">
                                {txn.type === 'SELL' && txn.realized_gain !== null ? (
                                  <span className={`text-[14px] font-semibold tabular-nums ${txn.realized_gain >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                                    {txn.realized_gain >= 0 ? '+' : ''}{formatCurrency(txn.realized_gain)}
                                  </span>
                                ) : <span className="text-[var(--label-quaternary)]">—</span>}
                              </td>
                            )}
                            <td className="px-5 py-3.5 max-w-[180px]">
                              <span className="text-[13px] text-[var(--label-tertiary)] truncate block cursor-help" title={txn.notes || 'No notes'}>
                                {txn.notes || <span className="text-[var(--label-quaternary)]">—</span>}
                              </span>
                            </td>
                            <td className="px-3 py-3.5 whitespace-nowrap">
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} onClick={() => handleEditClick(txn)} className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--label-quaternary)] hover:text-[var(--chart-primary)] hover:bg-[var(--chart-primary)]/10 transition-all" title="Edit transaction">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                                  </svg>
                                </motion.button>
                                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} onClick={() => handleDeleteClick(txn)} className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--label-quaternary)] hover:text-[#DC2626] hover:bg-[#DC2626]/10 transition-all" title="Delete transaction">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                  </svg>
                                </motion.button>
                              </div>
                            </td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden divide-y divide-[var(--separator-opaque)]">
                  {processedTransactions.map((txn, index) => (
                    <motion.div key={txn.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.snappy, delay: Math.min(index * 0.03, 0.15) }} className="px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md text-[11px] font-bold ${txn.type === 'BUY' ? 'bg-[#059669] text-white' : 'bg-[#DC2626] text-white'}`}>
                              {isFixedIncome ? 'DEPOSIT' : txn.type}
                            </span>
                            <span className="text-[13px] text-[var(--label-tertiary)]">{formatDate(txn.transaction_date)}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                            {!isFixedIncome && (
                              <>
                                <div>
                                  <p className="text-[10px] text-[var(--label-tertiary)] uppercase">Qty</p>
                                  <p className="text-[15px] font-semibold text-[var(--label-primary)] tabular-nums">{formatNumber(txn.quantity)}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-[var(--label-tertiary)] uppercase">Price</p>
                                  <p className="text-[14px] text-[var(--label-secondary)] tabular-nums">{formatPrice(txn.price)}</p>
                                </div>
                              </>
                            )}
                            <div>
                              <p className="text-[10px] text-[var(--label-tertiary)] uppercase">{isFixedIncome ? 'Amount' : 'Total'}</p>
                              <p className="text-[15px] font-bold text-[var(--label-primary)] tabular-nums">{formatCurrency(txn.total_amount)}</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <button onClick={() => handleEditClick(txn)} className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--label-quaternary)] hover:text-[var(--chart-primary)] hover:bg-[var(--chart-primary)]/10 transition-all">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                            </svg>
                          </button>
                          <button onClick={() => handleDeleteClick(txn)} className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--label-quaternary)] hover:text-[#DC2626] hover:bg-[#DC2626]/10 transition-all">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </>
            ) : transactions.length > 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-[14px] text-[var(--label-tertiary)]">No {filterType.toLowerCase()} transactions found</p>
                <button onClick={() => setFilterType('ALL')} className="mt-2 text-[13px] font-medium hover:underline" style={{ color: categoryColor }}>Show all transactions</button>
              </div>
            ) : (
              <div className="px-6 py-12 text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${categoryColor}15` }}>
                  <svg className="w-7 h-7" style={{ color: categoryColor }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <h3 className="text-[16px] font-semibold text-[var(--label-primary)] mb-1">No transactions yet</h3>
                <p className="text-[13px] text-[var(--label-secondary)] mb-4">Record your first {isFixedIncome ? 'deposit' : 'buy or sell transaction'}</p>
                <Link to="/assets/add" state={{ symbol: asset.symbol, assetType: asset.asset_type, exchange: asset.exchange, category: asset.category, assetId: asset.id }}>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="inline-flex items-center gap-2 px-4 py-2.5 text-white text-[13px] font-medium rounded-lg hover:opacity-90 transition-opacity" style={{ backgroundColor: categoryColor }}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    {isFixedIncome ? 'Add Deposit' : 'Add Transaction'}
                  </motion.button>
                </Link>
              </div>
            )}

              {/* Keyboard Shortcuts Hint */}
              {transactions.length > 0 && (
                <div className="hidden lg:flex px-5 py-2 border-t border-[var(--separator-opaque)] bg-[var(--fill-tertiary)]/30 items-center justify-center gap-6 text-[11px] text-[var(--label-quaternary)]">
                  <span><kbd className="px-1.5 py-0.5 bg-[var(--bg-primary)] rounded border border-[var(--separator-opaque)] font-mono">N</kbd> New</span>
                  <span><kbd className="px-1.5 py-0.5 bg-[var(--bg-primary)] rounded border border-[var(--separator-opaque)] font-mono">E</kbd> Export</span>
                  <span><kbd className="px-1.5 py-0.5 bg-[var(--bg-primary)] rounded border border-[var(--separator-opaque)] font-mono">Esc</kbd> Back</span>
                </div>
              )}
            </div>
            {/* End of RIGHT MAIN CONTENT */}

          </div>
          {/* End of flex container */}
        </Card>
      </motion.div>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={deleteModal.show} onClose={() => setDeleteModal({ show: false, transaction: null })} title="Delete Transaction" size="sm">
        <div className="p-5">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 rounded-full bg-[#DC2626]/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-[#DC2626]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <p className="text-[15px] text-[var(--label-primary)] mb-1">Are you sure you want to delete this transaction?</p>
              <p className="text-[13px] text-[var(--label-secondary)]">This will recalculate your holdings and cannot be undone.</p>
              {deleteModal.transaction && (
                <div className="mt-3 p-3 bg-[var(--fill-tertiary)] rounded-lg">
                  <p className="text-[12px] text-[var(--label-tertiary)]">
                    {deleteModal.transaction.type} • {formatDate(deleteModal.transaction.transaction_date)} • {formatCurrency(deleteModal.transaction.total_amount)}
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setDeleteModal({ show: false, transaction: null })} className="flex-1 px-4 py-2.5 bg-[var(--fill-tertiary)] hover:bg-[var(--fill-secondary)] text-[var(--label-primary)] rounded-lg text-[14px] font-medium transition-colors">Cancel</button>
            <button onClick={handleDeleteConfirm} disabled={deleting} className="flex-1 px-4 py-2.5 bg-[#DC2626] hover:bg-[#B91C1C] text-white rounded-lg text-[14px] font-medium transition-colors disabled:opacity-50">{deleting ? 'Deleting...' : 'Delete'}</button>
          </div>
        </div>
      </Modal>

      {/* Edit Transaction Modal */}
      <Modal isOpen={editModal.show} onClose={() => setEditModal({ show: false, transaction: null })} title="Edit Transaction" size="sm">
        <div className="p-5">
          {editModal.transaction && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md text-[11px] font-bold ${editModal.transaction.type === 'BUY' ? 'bg-[#059669] text-white' : 'bg-[#DC2626] text-white'}`}>{editModal.transaction.type}</span>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[var(--label-secondary)] mb-1.5">Date</label>
                <input type="date" value={editForm.transaction_date} onChange={(e) => setEditForm(prev => ({ ...prev, transaction_date: e.target.value }))} max={new Date().toISOString().split('T')[0]} className="w-full px-3 py-2.5 bg-[var(--fill-tertiary)] border border-[var(--separator-opaque)] rounded-lg text-[14px] text-[var(--label-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--chart-primary)]/30" />
              </div>
              {!isFixedIncome && (
                <>
                  <div>
                    <label className="block text-[12px] font-medium text-[var(--label-secondary)] mb-1.5">Quantity</label>
                    <input type="number" step="any" value={editForm.quantity} onChange={(e) => setEditForm(prev => ({ ...prev, quantity: e.target.value }))} className="w-full px-3 py-2.5 bg-[var(--fill-tertiary)] border border-[var(--separator-opaque)] rounded-lg text-[14px] text-[var(--label-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--chart-primary)]/30" />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[var(--label-secondary)] mb-1.5">Price</label>
                    <input type="number" step="any" value={editForm.price} onChange={(e) => setEditForm(prev => ({ ...prev, price: e.target.value }))} className="w-full px-3 py-2.5 bg-[var(--fill-tertiary)] border border-[var(--separator-opaque)] rounded-lg text-[14px] text-[var(--label-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--chart-primary)]/30" />
                  </div>
                </>
              )}
              <div>
                <label className="block text-[12px] font-medium text-[var(--label-secondary)] mb-1.5">Notes</label>
                <textarea value={editForm.notes} onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))} rows={3} placeholder="Add notes..." className="w-full px-3 py-2.5 bg-[var(--fill-tertiary)] border border-[var(--separator-opaque)] rounded-lg text-[14px] text-[var(--label-primary)] placeholder:text-[var(--label-quaternary)] focus:outline-none focus:ring-2 focus:ring-[var(--chart-primary)]/30 resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditModal({ show: false, transaction: null })} className="flex-1 px-4 py-2.5 bg-[var(--fill-tertiary)] hover:bg-[var(--fill-secondary)] text-[var(--label-primary)] rounded-lg text-[14px] font-medium transition-colors">Cancel</button>
                <button onClick={handleEditSave} disabled={txnSaving} className="flex-1 px-4 py-2.5 text-white rounded-lg text-[14px] font-medium transition-colors disabled:opacity-50" style={{ backgroundColor: categoryColor }}>{txnSaving ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Edit Asset Details Modal */}
      <Modal isOpen={metadataExpanded} onClose={() => setMetadataExpanded(false)} title="Edit Asset Details" size="lg">
        <form onSubmit={handleSaveMetadata} className="p-5">
          {/* Asset Name */}
          <div className="mb-6">
            <label className={labelClass}>Asset Name</label>
            {formData.category === 'EQUITY' ? (
              <StockAutocomplete
                value={formData.name}
                assetType={formData.asset_type}
                onChange={(value) => { setFormData(prev => ({ ...prev, name: value })); setHasUnsavedChanges(true); }}
                onSelect={(item) => {
                  const cleanSymbol = item.symbol.replace(/\.(NS|BO)$/, '');
                  const exchange = item.symbol.endsWith('.NS') ? 'NSE' : item.symbol.endsWith('.BO') ? 'BSE' : item.exchange;
                  setFormData(prev => ({
                    ...prev,
                    name: item.name,
                    symbol: formData.asset_type === 'MUTUAL_FUND' ? item.symbol : cleanSymbol,
                    exchange: exchange || prev.exchange
                  }));
                  setHasUnsavedChanges(true);
                }}
                placeholder={formData.asset_type === 'MUTUAL_FUND' ? 'Search mutual fund...' : 'Search stock...'}
              />
            ) : (
              <input type="text" name="name" value={formData.name} onChange={handleFormChange} placeholder="Enter a name for this asset" className={inputClass} required />
            )}
          </div>

          {/* Category-specific fields */}
          <div className="mb-6">{renderCategoryFields()}</div>

          {/* Common fields */}
          <div className="space-y-5 pt-5 border-t border-[var(--separator-opaque)]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>Purchase Date</label>
                <input type="date" name="purchase_date" value={formData.purchase_date} onChange={handleFormChange} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Added On <span className="text-[var(--label-quaternary)] font-normal ml-1">(read-only)</span></label>
                <div className="flex items-center px-3 py-2.5 bg-[var(--fill-tertiary)] border border-[var(--separator-opaque)] rounded-lg text-[14px] text-[var(--label-secondary)]">
                  {formData.created_at ? new Date(formData.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                </div>
              </div>
            </div>
            <div>
              <label className={labelClass}>Notes</label>
              <textarea name="notes" value={formData.notes} onChange={handleFormChange} rows={3} placeholder="Add any additional notes..." className={`${inputClass} resize-none`} />
            </div>
          </div>

          {/* Save Button */}
          <div className="flex gap-3 pt-4 mt-4 border-t border-[var(--separator-opaque)]">
            <button
              type="button"
              onClick={() => setMetadataExpanded(false)}
              className="flex-1 px-4 py-2.5 bg-[var(--fill-tertiary)] hover:bg-[var(--fill-secondary)] text-[var(--label-primary)] rounded-lg text-[14px] font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!hasUnsavedChanges || saving}
              className="flex-1 px-4 py-2.5 text-white rounded-lg text-[14px] font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: categoryColor }}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* CSV Import Bottom Sheet */}
      {!isFixedIncome && (
        <BottomSheet isOpen={showCSVImport} onClose={() => setShowCSVImport(false)} title="Import Transactions from CSV" maxHeight="80vh">
          {asset && <CSVImport asset={asset} onSuccess={handleCSVImportSuccess} onCancel={() => setShowCSVImport(false)} />}
        </BottomSheet>
      )}
    </div>
  );
}
