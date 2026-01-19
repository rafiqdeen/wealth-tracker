import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { assetService, ASSET_CONFIG } from '../services/assets';
import { Card, Button } from '../components/apple';
import { spring, staggerContainer, staggerItem, tapScale } from '../utils/animations';
import { categoryColors, CategoryIcon } from '../constants/theme';
import { formatCurrency } from '../utils/formatting';
import StockAutocomplete from '../components/StockAutocomplete';
import { useToast } from '../context/ToastContext';

export default function AddAsset() {
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);

  // Track which auto-filled fields user wants to edit manually
  const [manualOverride, setManualOverride] = useState({
    interest_rate: false,
    maturity_date: false,
  });

  const [formData, setFormData] = useState({
    category: '',
    asset_type: '',
    transaction_type: 'BUY',
    name: '',
    symbol: '',
    exchange: 'NSE',
    quantity: '',
    price: '',
    principal: '',
    interest_rate: '',
    start_date: '',
    maturity_date: '',
    institution: '',
    purchase_price: '',
    current_value: '',
    location: '',
    area_sqft: '',
    balance: '',
    weight_grams: '',
    purity: '',
    premium: '',
    sum_assured: '',
    policy_number: '',
    purchase_date: '',
    notes: '',
    // FD/RD specific
    tenure_months: '',
    monthly_deposit: '',
    // NPS specific
    pran_number: '',
  });

  // Default rates for fixed income instruments (government-set or standard)
  const FIXED_INCOME_DEFAULTS = {
    PPF: { rate: 7.1, tenure: 15 },    // PPF: 7.1% p.a., 15 years
    EPF: { rate: 8.25, tenure: null },  // EPF: 8.25% p.a.
    VPF: { rate: 8.25, tenure: null },  // VPF: same as EPF
    NPS: { rate: null, tenure: null },  // NPS: market-linked
    NSC: { rate: 7.7, tenure: 5 },      // NSC: 7.7% p.a., 5 years
    KVP: { rate: 7.5, tenure: 9.58 },   // KVP: 7.5% p.a., ~115 months
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const updated = { ...prev, [name]: value };

      // Auto-calculate maturity date for fixed tenure instruments (PPF, NSC, KVP)
      if (name === 'start_date' && value && prev.category === 'FIXED_INCOME') {
        const defaults = FIXED_INCOME_DEFAULTS[prev.asset_type];
        if (defaults?.tenure) {
          const startDate = new Date(value);
          startDate.setFullYear(startDate.getFullYear() + Math.floor(defaults.tenure));
          const remainingMonths = (defaults.tenure % 1) * 12;
          if (remainingMonths > 0) {
            startDate.setMonth(startDate.getMonth() + Math.round(remainingMonths));
          }
          updated.maturity_date = startDate.toISOString().split('T')[0];
        }
        // Also calculate if tenure_months is already set for FD/RD
        if (['FD', 'RD'].includes(prev.asset_type) && prev.tenure_months) {
          const startDate = new Date(value);
          startDate.setMonth(startDate.getMonth() + parseInt(prev.tenure_months));
          updated.maturity_date = startDate.toISOString().split('T')[0];
        }
      }

      // Auto-calculate maturity when tenure_months changes for FD/RD
      if (name === 'tenure_months' && value && prev.start_date && ['FD', 'RD'].includes(prev.asset_type)) {
        const startDate = new Date(prev.start_date);
        startDate.setMonth(startDate.getMonth() + parseInt(value));
        updated.maturity_date = startDate.toISOString().split('T')[0];
      }

      return updated;
    });
  };

  const selectCategory = (category) => {
    setFormData((prev) => ({ ...prev, category, asset_type: '' }));
    setStep(2);
  };

  const selectType = (type) => {
    const defaults = FIXED_INCOME_DEFAULTS[type];
    setFormData((prev) => ({
      ...prev,
      asset_type: type,
      interest_rate: defaults?.rate || '',
    }));
    setStep(3);
  };

  const goBack = () => {
    if (step === 2) {
      setFormData((prev) => ({ ...prev, category: '', asset_type: '' }));
      setManualOverride({ interest_rate: false, maturity_date: false });
      setStep(1);
    } else if (step === 3) {
      setFormData((prev) => ({ ...prev, asset_type: '' }));
      setManualOverride({ interest_rate: false, maturity_date: false });
      setStep(2);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await assetService.create(formData);
      toast.success(`"${formData.name}" added successfully`);
      navigate('/assets');
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to create asset';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const getPreviewValue = () => {
    const { category, quantity, price, principal, purchase_price, current_value, balance } = formData;

    if (category === 'EQUITY' || category === 'CRYPTO') {
      return quantity && price ? quantity * price : 0;
    }
    if (category === 'FIXED_INCOME') return principal || 0;
    if (category === 'SAVINGS') return balance || 0;
    return current_value || purchase_price || 0;
  };

  const inputClass = "w-full px-4 py-3 bg-[var(--fill-tertiary)] border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--system-blue)]/50 transition-all text-[var(--label-primary)] placeholder-[var(--label-tertiary)] text-[15px]";
  const selectClass = `w-full px-4 py-3 pr-10 bg-[var(--fill-tertiary)] border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--system-blue)]/50 transition-all text-[var(--label-primary)] text-[15px] appearance-none cursor-pointer bg-no-repeat bg-[right_12px_center] bg-[length:20px_20px] bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%238E8E93' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19.5 8.25l-7.5 7.5-7.5-7.5'/%3E%3C/svg%3E")]`;
  const labelClass = "block text-[13px] font-medium text-[var(--label-secondary)] mb-2";

  const renderCategoryFields = () => {
    const { category, asset_type } = formData;

    switch (category) {
      case 'EQUITY':
        return (
          <div className="space-y-5">
            <div>
              <label className={labelClass}>Transaction Type</label>
              <div className="flex gap-2">
                <motion.button
                  type="button"
                  whileTap={tapScale}
                  onClick={() => setFormData(prev => ({ ...prev, transaction_type: 'BUY' }))}
                  className={`flex-1 py-3 px-4 rounded-xl font-medium text-[15px] transition-all ${
                    formData.transaction_type === 'BUY'
                      ? 'bg-[var(--system-green)] text-white'
                      : 'bg-[var(--fill-tertiary)] text-[var(--label-secondary)]'
                  }`}
                >
                  Buy
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={tapScale}
                  onClick={() => setFormData(prev => ({ ...prev, transaction_type: 'SELL' }))}
                  className={`flex-1 py-3 px-4 rounded-xl font-medium text-[15px] transition-all ${
                    formData.transaction_type === 'SELL'
                      ? 'bg-[var(--system-orange)] text-white'
                      : 'bg-[var(--fill-tertiary)] text-[var(--label-secondary)]'
                  }`}
                >
                  Sell
                </motion.button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>Symbol</label>
                <input
                  type="text"
                  name="symbol"
                  value={formData.symbol}
                  onChange={handleChange}
                  placeholder={asset_type === 'MUTUAL_FUND' ? 'AMFI Scheme Code' : 'e.g., RELIANCE'}
                  className={inputClass}
                  required
                />
              </div>
              {asset_type !== 'MUTUAL_FUND' && (
                <div>
                  <label className={labelClass}>Exchange</label>
                  <select
                    name="exchange"
                    value={formData.exchange}
                    onChange={handleChange}
                    className={selectClass}
                  >
                    <option value="NSE">NSE</option>
                    <option value="BSE">BSE</option>
                  </select>
                </div>
              )}
              <div>
                <label className={labelClass}>Quantity</label>
                <input
                  type="number"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleChange}
                  step="0.0001"
                  placeholder="0"
                  className={inputClass}
                  required
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
          </div>
        );

      case 'FIXED_INCOME': {
        const defaults = FIXED_INCOME_DEFAULTS[asset_type];
        const isGovernmentScheme = ['PPF', 'EPF', 'VPF', 'NSC', 'KVP'].includes(asset_type);
        const hasFixedTenure = defaults?.tenure != null;
        const isNPS = asset_type === 'NPS';
        const isFDorRD = ['FD', 'RD'].includes(asset_type);

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Principal/Investment Amount */}
            <div>
              <label className={labelClass}>
                {asset_type === 'RD' ? 'Monthly Deposit' : isNPS ? 'Current Value' : 'Principal Amount'}
              </label>
              <input type="number" name="principal" value={formData.principal} onChange={handleChange} placeholder="0" className={inputClass} required />
            </div>

            {/* Interest Rate - hide for NPS (market-linked), readonly for govt schemes (with edit option) */}
            {isNPS ? (
              <div>
                <label className={labelClass}>Returns</label>
                <div className={`${inputClass} bg-[var(--system-purple)]/5 flex items-center justify-between`}>
                  <span className="text-[var(--system-purple)]">Market-linked</span>
                  <span className="text-[11px] text-[var(--label-tertiary)]">Variable</span>
                </div>
              </div>
            ) : (
              <div>
                <label className={labelClass}>
                  Interest Rate (% p.a.)
                  {isGovernmentScheme && defaults?.rate && !manualOverride.interest_rate && (
                    <span className="text-[var(--system-green)] ml-1">• Govt. rate</span>
                  )}
                </label>
                {isGovernmentScheme && defaults?.rate && !manualOverride.interest_rate ? (
                  <div className={`${inputClass} bg-[var(--system-green)]/5 flex items-center justify-between`}>
                    <span>{formData.interest_rate}%</span>
                    <button
                      type="button"
                      onClick={() => setManualOverride(prev => ({ ...prev, interest_rate: true }))}
                      className="text-[11px] text-[var(--system-blue)] hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                ) : (
                  <input type="number" name="interest_rate" value={formData.interest_rate} onChange={handleChange} step="0.01" placeholder="0.00" className={inputClass} />
                )}
              </div>
            )}

            {/* Tenure dropdown for FD/RD */}
            {isFDorRD && (
              <div>
                <label className={labelClass}>Tenure</label>
                <select name="tenure_months" value={formData.tenure_months} onChange={handleChange} className={selectClass}>
                  <option value="">Select tenure</option>
                  <option value="3">3 Months</option>
                  <option value="6">6 Months</option>
                  <option value="12">1 Year</option>
                  <option value="18">18 Months</option>
                  <option value="24">2 Years</option>
                  <option value="36">3 Years</option>
                  <option value="60">5 Years</option>
                  <option value="84">7 Years</option>
                  <option value="120">10 Years</option>
                </select>
              </div>
            )}

            {/* PRAN for NPS */}
            {isNPS && (
              <div>
                <label className={labelClass}>PRAN Number</label>
                <input type="text" name="pran_number" value={formData.pran_number} onChange={handleChange} placeholder="12 digit PRAN" className={inputClass} />
              </div>
            )}

            {/* Institution - dropdown for PPF, text for others */}
            <div>
              <label className={labelClass}>{isNPS ? 'Fund Manager' : 'Institution'}</label>
              {asset_type === 'PPF' ? (
                <select name="institution" value={formData.institution} onChange={handleChange} className={selectClass}>
                  <option value="">Select bank/post office</option>
                  <option value="SBI">State Bank of India</option>
                  <option value="HDFC Bank">HDFC Bank</option>
                  <option value="ICICI Bank">ICICI Bank</option>
                  <option value="Axis Bank">Axis Bank</option>
                  <option value="Post Office">Post Office</option>
                  <option value="Other">Other</option>
                </select>
              ) : isNPS ? (
                <select name="institution" value={formData.institution} onChange={handleChange} className={selectClass}>
                  <option value="">Select fund manager</option>
                  <option value="SBI Pension Fund">SBI Pension Fund</option>
                  <option value="LIC Pension Fund">LIC Pension Fund</option>
                  <option value="UTI Retirement Solutions">UTI Retirement Solutions</option>
                  <option value="HDFC Pension Fund">HDFC Pension Fund</option>
                  <option value="ICICI Prudential PF">ICICI Prudential PF</option>
                  <option value="Kotak Pension Fund">Kotak Pension Fund</option>
                  <option value="Aditya Birla SL PF">Aditya Birla SL PF</option>
                </select>
              ) : (
                <input type="text" name="institution" value={formData.institution} onChange={handleChange} placeholder="e.g., SBI, HDFC Bank" className={inputClass} />
              )}
            </div>

            {/* Start Date - not needed for NPS */}
            {!isNPS && (
              <div>
                <label className={labelClass}>Start Date</label>
                <input type="date" name="start_date" value={formData.start_date} onChange={handleChange} className={inputClass} />
              </div>
            )}

            {/* Maturity Date - auto-calculated for fixed tenure, manual for FD/RD/BONDS, not for NPS/EPF/VPF */}
            {(hasFixedTenure || isFDorRD || asset_type === 'BONDS') && (
              <div className="md:col-span-2">
                <label className={labelClass}>
                  Maturity Date
                  {hasFixedTenure && !manualOverride.maturity_date && (
                    <span className="text-[var(--system-blue)] ml-1">• {defaults.tenure} years</span>
                  )}
                  {isFDorRD && formData.tenure_months && !manualOverride.maturity_date && (
                    <span className="text-[var(--system-blue)] ml-1">• Auto-calculated</span>
                  )}
                </label>
                {(hasFixedTenure || (isFDorRD && formData.tenure_months)) && formData.start_date && !manualOverride.maturity_date ? (
                  <div className={`${inputClass} bg-[var(--system-blue)]/5 flex items-center justify-between`}>
                    <span>{formData.maturity_date ? new Date(formData.maturity_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Select start date'}</span>
                    <button
                      type="button"
                      onClick={() => setManualOverride(prev => ({ ...prev, maturity_date: true }))}
                      className="text-[11px] text-[var(--system-blue)] hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                ) : (
                  <input type="date" name="maturity_date" value={formData.maturity_date} onChange={handleChange} className={inputClass} />
                )}
              </div>
            )}
          </div>
        );
      }

      case 'REAL_ESTATE':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Purchase Price</label>
              <input type="number" name="purchase_price" value={formData.purchase_price} onChange={handleChange} placeholder="0" className={inputClass} required />
            </div>
            <div>
              <label className={labelClass}>Current Value</label>
              <input type="number" name="current_value" value={formData.current_value} onChange={handleChange} placeholder="0" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Location</label>
              <input type="text" name="location" value={formData.location} onChange={handleChange} placeholder="City, State" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Area (sq.ft)</label>
              <input type="number" name="area_sqft" value={formData.area_sqft} onChange={handleChange} placeholder="0" className={inputClass} />
            </div>
          </div>
        );

      case 'PHYSICAL':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {(asset_type === 'GOLD' || asset_type === 'SILVER') && (
              <>
                <div>
                  <label className={labelClass}>Weight (grams)</label>
                  <input type="number" name="weight_grams" value={formData.weight_grams} onChange={handleChange} step="0.01" placeholder="0.00" className={inputClass} required />
                </div>
                <div>
                  <label className={labelClass}>Purity</label>
                  <select name="purity" value={formData.purity} onChange={handleChange} className={selectClass}>
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
              <input type="number" name="purchase_price" value={formData.purchase_price} onChange={handleChange} placeholder="0" className={inputClass} required />
            </div>
            <div>
              <label className={labelClass}>Current Value</label>
              <input type="number" name="current_value" value={formData.current_value} onChange={handleChange} placeholder="0" className={inputClass} />
            </div>
          </div>
        );

      case 'SAVINGS':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Current Balance</label>
              <input type="number" name="balance" value={formData.balance} onChange={handleChange} placeholder="0" className={inputClass} required />
            </div>
            <div>
              <label className={labelClass}>Interest Rate (% p.a.)</label>
              <input type="number" name="interest_rate" value={formData.interest_rate} onChange={handleChange} step="0.01" placeholder="0.00" className={inputClass} />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Bank/Institution</label>
              <input type="text" name="institution" value={formData.institution} onChange={handleChange} placeholder="e.g., SBI, HDFC Bank" className={inputClass} />
            </div>
          </div>
        );

      case 'CRYPTO':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Symbol</label>
              <input type="text" name="symbol" value={formData.symbol} onChange={handleChange} placeholder="e.g., BTC, ETH" className={inputClass} required />
            </div>
            <div>
              <label className={labelClass}>Exchange/Wallet</label>
              <input type="text" name="institution" value={formData.institution} onChange={handleChange} placeholder="e.g., WazirX, Binance" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Quantity</label>
              <input type="number" name="quantity" value={formData.quantity} onChange={handleChange} step="0.00000001" placeholder="0.00000000" className={inputClass} required />
            </div>
            <div>
              <label className={labelClass}>Price per Unit</label>
              <input type="number" name="price" value={formData.price} onChange={handleChange} step="0.01" placeholder="0.00" className={inputClass} required />
            </div>
          </div>
        );

      case 'INSURANCE':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Policy Number</label>
              <input type="text" name="policy_number" value={formData.policy_number} onChange={handleChange} placeholder="Policy number" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Institution</label>
              <input type="text" name="institution" value={formData.institution} onChange={handleChange} placeholder="e.g., LIC, ICICI Prudential" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Premium/year</label>
              <input type="number" name="premium" value={formData.premium} onChange={handleChange} placeholder="0" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Sum Assured</label>
              <input type="number" name="sum_assured" value={formData.sum_assured} onChange={handleChange} placeholder="0" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Current Value</label>
              <input type="number" name="current_value" value={formData.current_value} onChange={handleChange} placeholder="For ULIP/endowment" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Maturity Date</label>
              <input type="date" name="maturity_date" value={formData.maturity_date} onChange={handleChange} className={inputClass} />
            </div>
          </div>
        );

      case 'OTHER':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Current Value</label>
              <input type="number" name="current_value" value={formData.current_value} onChange={handleChange} placeholder="0" className={inputClass} required />
            </div>
            <div>
              <label className={labelClass}>Purchase Price</label>
              <input type="number" name="purchase_price" value={formData.purchase_price} onChange={handleChange} placeholder="0" className={inputClass} />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.gentle}
          className="mb-8"
        >
          <Link to="/assets" className="inline-flex items-center gap-1 text-[15px] text-[var(--system-blue)] mb-4">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Assets
          </Link>
          <h1 className="text-[28px] font-semibold text-[var(--label-primary)]">Add New Asset</h1>
          <p className="text-[15px] text-[var(--label-secondary)] mt-1">Track your wealth by adding a new asset</p>
        </motion.div>

        {/* Progress Steps */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...spring.gentle, delay: 0.1 }}
          className="flex items-center gap-2 mb-8"
        >
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <motion.div
                animate={{
                  backgroundColor: step >= s ? 'var(--system-blue)' : 'var(--fill-tertiary)',
                  color: step >= s ? '#fff' : 'var(--label-tertiary)'
                }}
                transition={spring.snappy}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold"
              >
                {step > s ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : s}
              </motion.div>
              {s < 3 && (
                <motion.div
                  animate={{ backgroundColor: step > s ? 'var(--system-blue)' : 'var(--fill-tertiary)' }}
                  transition={spring.snappy}
                  className="w-12 sm:w-20 h-1 mx-2 rounded-full"
                />
              )}
            </div>
          ))}
          <span className="text-[13px] text-[var(--label-tertiary)] ml-4 hidden sm:inline">
            {step === 1 && 'Select Category'}
            {step === 2 && 'Choose Type'}
            {step === 3 && 'Enter Details'}
          </span>
        </motion.div>

        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={spring.snappy}
              className="mb-6"
            >
              <div className="bg-[var(--system-red)]/10 text-[var(--system-red)] px-4 py-3 rounded-xl text-[15px] flex items-center gap-2">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step 1: Category Selection */}
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={spring.gentle}
            >
              <Card padding="p-6" hoverable>
                <h2 className="text-[17px] font-semibold text-[var(--label-primary)] mb-1">What type of asset?</h2>
                <p className="text-[15px] text-[var(--label-secondary)] mb-6">Select a category to continue</p>

                <motion.div
                  variants={staggerContainer}
                  initial="initial"
                  animate="animate"
                  className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
                >
                  {Object.entries(ASSET_CONFIG).map(([key, config]) => {
                    const colors = categoryColors[key];
                    const IconComponent = () => <CategoryIcon category={key} />;
                    return (
                      <motion.button
                        key={key}
                        variants={staggerItem}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => selectCategory(key)}
                        className={`p-4 rounded-xl border-2 border-transparent transition-all text-left ${colors.bg} hover:border-current`}
                        style={{ '--tw-border-opacity': 0.5 }}
                      >
                        <div className={`w-10 h-10 rounded-xl ${colors.bg} flex items-center justify-center mb-3`} style={{ color: colors.color }}>
                          <CategoryIcon category={key} />
                        </div>
                        <span className={`font-semibold text-[15px] ${colors.text}`}>{config.label}</span>
                        <span className="text-[13px] text-[var(--label-tertiary)] block mt-0.5">{config.types.length} types</span>
                      </motion.button>
                    );
                  })}
                </motion.div>
              </Card>
            </motion.div>
          )}

          {/* Step 2: Type Selection */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={spring.gentle}
            >
              <Card padding="p-6" hoverable>
                <motion.button
                  whileTap={tapScale}
                  onClick={goBack}
                  className="inline-flex items-center gap-1 text-[15px] text-[var(--system-blue)] mb-4"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Change category
                </motion.button>

                <div className="flex items-center gap-3 mb-6">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center ${categoryColors[formData.category]?.bg}`}
                    style={{ color: categoryColors[formData.category]?.color }}
                  >
                    <CategoryIcon category={formData.category} />
                  </div>
                  <div>
                    <h2 className="text-[17px] font-semibold text-[var(--label-primary)]">{ASSET_CONFIG[formData.category]?.label}</h2>
                    <p className="text-[15px] text-[var(--label-secondary)]">Select the specific type</p>
                  </div>
                </div>

                <motion.div
                  variants={staggerContainer}
                  initial="initial"
                  animate="animate"
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                >
                  {ASSET_CONFIG[formData.category]?.types.map((type) => (
                    <motion.button
                      key={type.value}
                      variants={staggerItem}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => selectType(type.value)}
                      className="p-4 rounded-xl bg-[var(--fill-tertiary)] hover:bg-[var(--fill-secondary)] transition-all text-left flex items-center gap-3 group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-[var(--bg-primary)] flex items-center justify-center transition-colors">
                        <svg className="w-5 h-5 text-[var(--label-tertiary)] group-hover:text-[var(--label-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <span className="font-medium text-[15px] text-[var(--label-primary)]">{type.label}</span>
                    </motion.button>
                  ))}
                </motion.div>
              </Card>
            </motion.div>
          )}

          {/* Step 3: Details Form */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={spring.gentle}
              className="grid grid-cols-1 lg:grid-cols-3 gap-6"
            >
              <div className="lg:col-span-2">
                <form onSubmit={handleSubmit}>
                  <Card padding="p-6" hoverable>
                    <motion.button
                      type="button"
                      whileTap={tapScale}
                      onClick={goBack}
                      className="inline-flex items-center gap-1 text-[15px] text-[var(--system-blue)] mb-4"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                      Change type
                    </motion.button>

                    <div className="flex items-center gap-3 mb-6 pb-6 border-b border-[var(--separator)]/30">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center ${categoryColors[formData.category]?.bg}`}
                        style={{ color: categoryColors[formData.category]?.color }}
                      >
                        <CategoryIcon category={formData.category} />
                      </div>
                      <div>
                        <h2 className="font-semibold text-[15px] text-[var(--label-primary)]">
                          {ASSET_CONFIG[formData.category]?.types.find(t => t.value === formData.asset_type)?.label}
                        </h2>
                        <p className="text-[13px] text-[var(--label-tertiary)]">{ASSET_CONFIG[formData.category]?.label}</p>
                      </div>
                    </div>

                    {/* Asset Name */}
                    <div className="mb-6">
                      <label className={labelClass}>Asset Name</label>
                      {formData.category === 'EQUITY' ? (
                        <StockAutocomplete
                          value={formData.name}
                          assetType={formData.asset_type}
                          onChange={(value) => setFormData(prev => ({ ...prev, name: value }))}
                          onSelect={(item) => {
                            const cleanSymbol = item.symbol.replace(/\.(NS|BO)$/, '');
                            const exchange = item.symbol.endsWith('.NS') ? 'NSE' : item.symbol.endsWith('.BO') ? 'BSE' : item.exchange;
                            setFormData(prev => ({
                              ...prev,
                              name: item.name,
                              symbol: formData.asset_type === 'MUTUAL_FUND' ? item.symbol : cleanSymbol,
                              exchange: exchange || prev.exchange
                            }));
                          }}
                          placeholder={formData.asset_type === 'MUTUAL_FUND' ? 'Search mutual fund...' : 'Search stock...'}
                        />
                      ) : (
                        <input
                          type="text"
                          name="name"
                          value={formData.name}
                          onChange={handleChange}
                          placeholder="Enter a name for this asset"
                          className={inputClass}
                          required
                        />
                      )}
                    </div>

                    <div className="mb-6">{renderCategoryFields()}</div>

                    {/* Common fields - hide Purchase Date for FIXED_INCOME since Start Date is used */}
                    <div className="space-y-5 pt-6 border-t border-[var(--separator)]/30">
                      {formData.category !== 'FIXED_INCOME' && (
                        <div>
                          <label className={labelClass}>Purchase Date</label>
                          <input type="date" name="purchase_date" value={formData.purchase_date} onChange={handleChange} className={inputClass} />
                        </div>
                      )}
                      <div>
                        <label className={labelClass}>Notes (optional)</label>
                        <textarea
                          name="notes"
                          value={formData.notes}
                          onChange={handleChange}
                          rows={2}
                          placeholder="Add any additional notes..."
                          className={`${inputClass} resize-none`}
                        />
                      </div>
                    </div>

                    {/* Buttons */}
                    <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-[var(--separator)]/30">
                      <Button variant="gray" onClick={() => navigate('/assets')}>
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        variant="filled"
                        loading={loading}
                        className={
                          formData.category === 'EQUITY' && formData.transaction_type === 'SELL'
                            ? '!bg-[var(--system-orange)]'
                            : formData.category === 'EQUITY' && formData.transaction_type === 'BUY'
                            ? '!bg-[var(--system-green)]'
                            : ''
                        }
                        icon={
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                        }
                      >
                        {formData.category === 'EQUITY' ? `Record ${formData.transaction_type === 'BUY' ? 'Buy' : 'Sell'}` : 'Add Asset'}
                      </Button>
                    </div>
                  </Card>
                </form>
              </div>

              {/* Preview Card */}
              <div className="lg:col-span-1">
                <div className="sticky top-24">
                  <Card padding="p-5" hoverable glow>
                    <p className="text-[11px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider mb-4">Preview</p>

                    <div className={`p-4 rounded-xl ${categoryColors[formData.category]?.bg} mb-4`}>
                      <div className="flex items-center gap-3">
                        <div style={{ color: categoryColors[formData.category]?.color }}>
                          <CategoryIcon category={formData.category} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[15px] text-[var(--label-primary)] truncate">{formData.name || 'Asset Name'}</p>
                          <p className="text-[13px] text-[var(--label-tertiary)]">
                            {ASSET_CONFIG[formData.category]?.types.find(t => t.value === formData.asset_type)?.label}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[13px] text-[var(--label-tertiary)]">Category</span>
                        <span className="text-[13px] font-medium text-[var(--label-primary)]">{ASSET_CONFIG[formData.category]?.label}</span>
                      </div>

                      {formData.category === 'EQUITY' && (
                        <div className="flex justify-between items-center">
                          <span className="text-[13px] text-[var(--label-tertiary)]">Transaction</span>
                          <span className={`text-[13px] font-medium px-2 py-0.5 rounded-lg ${
                            formData.transaction_type === 'BUY' ? 'bg-[var(--system-green)]/10 text-[var(--system-green)]' : 'bg-[var(--system-orange)]/10 text-[var(--system-orange)]'
                          }`}>
                            {formData.transaction_type}
                          </span>
                        </div>
                      )}

                      {formData.symbol && (
                        <div className="flex justify-between items-center">
                          <span className="text-[13px] text-[var(--label-tertiary)]">Symbol</span>
                          <span className="text-[13px] font-medium text-[var(--label-primary)]">{formData.symbol}</span>
                        </div>
                      )}

                      {formData.quantity && (
                        <div className="flex justify-between items-center">
                          <span className="text-[13px] text-[var(--label-tertiary)]">Quantity</span>
                          <span className="text-[13px] font-medium text-[var(--label-primary)]">{formData.quantity}</span>
                        </div>
                      )}

                      {formData.institution && (
                        <div className="flex justify-between items-center">
                          <span className="text-[13px] text-[var(--label-tertiary)]">Institution</span>
                          <span className="text-[13px] font-medium text-[var(--label-primary)] truncate max-w-[120px]">{formData.institution}</span>
                        </div>
                      )}

                      {formData.interest_rate && (
                        <div className="flex justify-between items-center">
                          <span className="text-[13px] text-[var(--label-tertiary)]">Interest Rate</span>
                          <span className="text-[13px] font-medium text-[var(--label-primary)]">{formData.interest_rate}% p.a.</span>
                        </div>
                      )}

                      <div className="pt-3 mt-3 border-t border-[var(--separator)]/30">
                        <div className="flex justify-between items-center">
                          <span className="text-[13px] text-[var(--label-tertiary)]">Estimated Value</span>
                          <span className="text-[20px] font-light text-[var(--label-primary)]">{formatCurrency(getPreviewValue())}</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
