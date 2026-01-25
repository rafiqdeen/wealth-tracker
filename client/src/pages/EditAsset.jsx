import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { assetService, ASSET_CONFIG } from '../services/assets';
import { Card, Button, SkeletonCard, Skeleton } from '../components/apple';
import { spring } from '../utils/animations';
import { categoryColors, CategoryIcon } from '../constants/theme';
import { formatCurrency } from '../utils/formatting';
import StockAutocomplete from '../components/StockAutocomplete';

// Category card configuration with icons and colors (matching AddAsset)
const CATEGORY_CARDS = {
  EQUITY: { label: 'Equity', description: 'Stocks & Mutual Funds', gradient: 'from-blue-500/15 to-blue-600/5', iconBg: 'bg-[#4F7DF3]' },
  FIXED_INCOME: { label: 'Fixed Income', description: 'FD, PPF, Bonds', gradient: 'from-emerald-500/15 to-emerald-600/5', iconBg: 'bg-[#22C55E]' },
  REAL_ESTATE: { label: 'Real Estate', description: 'Property & Land', gradient: 'from-amber-500/15 to-amber-600/5', iconBg: 'bg-[#F59E0B]' },
  PHYSICAL: { label: 'Physical Assets', description: 'Gold, Silver, Art', gradient: 'from-orange-500/15 to-orange-600/5', iconBg: 'bg-[#F97316]' },
  SAVINGS: { label: 'Savings', description: 'Bank Accounts', gradient: 'from-teal-500/15 to-teal-600/5', iconBg: 'bg-[#14B8A6]' },
  CRYPTO: { label: 'Cryptocurrency', description: 'Bitcoin, Ethereum', gradient: 'from-indigo-500/15 to-indigo-600/5', iconBg: 'bg-[#6366F1]' },
  INSURANCE: { label: 'Insurance', description: 'Life, ULIP Policies', gradient: 'from-pink-500/15 to-pink-600/5', iconBg: 'bg-[#EC4899]' },
  OTHER: { label: 'Other', description: 'Miscellaneous', gradient: 'from-gray-500/15 to-gray-600/5', iconBg: 'bg-[#6B7280]' },
};

// Validation rules per category
const VALIDATION_RULES = {
  EQUITY: ['name', 'symbol'],
  FIXED_INCOME: ['name', 'principal'],
  REAL_ESTATE: ['name'],
  PHYSICAL: ['name'],
  SAVINGS: ['name'],
  CRYPTO: ['name'],
  INSURANCE: ['name'],
  OTHER: ['name'],
};

export default function EditAsset() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

  useEffect(() => {
    fetchAsset();
  }, [id]);

  const fetchAsset = async () => {
    try {
      const response = await assetService.getById(id);
      const asset = response.data.asset;
      const roundPrice = (val) => val ? Math.round(val * 100) / 100 : '';

      setFormData({
        category: asset.category || '',
        asset_type: asset.asset_type || '',
        name: asset.name || '',
        symbol: asset.symbol || '',
        exchange: asset.exchange || 'NSE',
        quantity: asset.quantity || '',
        avg_buy_price: roundPrice(asset.avg_buy_price),
        principal: asset.principal || '',
        interest_rate: asset.interest_rate || '',
        start_date: asset.start_date || '',
        maturity_date: asset.maturity_date || '',
        institution: asset.institution || '',
        purchase_price: roundPrice(asset.purchase_price),
        current_value: roundPrice(asset.current_value),
        location: asset.location || '',
        area_sqft: asset.area_sqft || '',
        appreciation_rate: asset.appreciation_rate || '',
        real_estate_calc_mode: asset.appreciation_rate ? 'rate' : (asset.current_value ? 'value' : 'rate'),
        balance: asset.balance || '',
        weight_grams: asset.weight_grams || '',
        purity: asset.purity || '',
        premium: asset.premium || '',
        sum_assured: asset.sum_assured || '',
        policy_number: asset.policy_number || '',
        purchase_date: asset.purchase_date || '',
        notes: asset.notes || '',
        created_at: asset.created_at || '',
        updated_at: asset.updated_at || '',
      });
    } catch (err) {
      setError('Failed to load asset');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      let dataToSubmit = { ...formData };

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
      navigate('/assets');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update asset');
    } finally {
      setSaving(false);
    }
  };

  const getPreviewValue = () => {
    const { category, quantity, avg_buy_price, principal, purchase_price, current_value, balance } = formData;

    if (category === 'EQUITY' || category === 'CRYPTO') {
      return quantity && avg_buy_price ? quantity * avg_buy_price : 0;
    }
    if (category === 'FIXED_INCOME') return principal || 0;
    if (category === 'SAVINGS') return balance || 0;

    if (category === 'REAL_ESTATE') {
      const calcMode = formData.real_estate_calc_mode || 'rate';
      if (calcMode === 'rate' && purchase_price && formData.purchase_date && formData.appreciation_rate) {
        const purchasePrice = parseFloat(purchase_price);
        const rate = parseFloat(formData.appreciation_rate) / 100;
        const purchaseDate = new Date(formData.purchase_date);
        const today = new Date();
        const years = (today - purchaseDate) / (365.25 * 24 * 60 * 60 * 1000);
        if (years > 0) {
          return Math.round(purchasePrice * Math.pow(1 + rate, years));
        }
        return purchasePrice;
      }
    }

    return current_value || purchase_price || 0;
  };

  // Calculate form completion percentage
  const completionPercentage = useMemo(() => {
    if (!formData.category) return 0;
    const requiredFields = VALIDATION_RULES[formData.category] || ['name'];
    const additionalFields = ['purchase_date'];
    const allFields = [...requiredFields, ...additionalFields];

    const filledCount = allFields.filter(field => {
      const value = formData[field];
      return value !== '' && value !== null && value !== undefined;
    }).length;

    return Math.round((filledCount / allFields.length) * 100);
  }, [formData]);

  // Input styles matching AddAsset
  const inputClass = "w-full px-4 py-3 bg-[var(--bg-primary)] border border-[var(--separator-opaque)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--chart-primary)]/30 focus:border-[var(--chart-primary)] transition-all text-[var(--label-primary)] placeholder-[var(--label-tertiary)] text-[15px]";
  const selectClass = `w-full px-4 py-3 pr-10 bg-[var(--bg-primary)] border border-[var(--separator-opaque)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--chart-primary)]/30 focus:border-[var(--chart-primary)] transition-all text-[var(--label-primary)] text-[15px] appearance-none cursor-pointer bg-no-repeat bg-[right_12px_center] bg-[length:20px_20px] bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%238E8E93' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19.5 8.25l-7.5 7.5-7.5-7.5'/%3E%3C/svg%3E")]`;
  const labelClass = "block text-[13px] font-medium text-[var(--label-secondary)] mb-2";

  const categoryConfig = CATEGORY_CARDS[formData.category];
  const selectedType = ASSET_CONFIG[formData.category]?.types.find(t => t.value === formData.asset_type);

  const renderCategoryFields = () => {
    const { category, asset_type } = formData;

    switch (category) {
      case 'EQUITY':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Symbol</label>
              <input type="text" name="symbol" value={formData.symbol} onChange={handleChange} placeholder={asset_type === 'MUTUAL_FUND' ? 'AMFI Scheme Code' : 'e.g., RELIANCE'} className={inputClass} />
            </div>
            {asset_type !== 'MUTUAL_FUND' && (
              <div>
                <label className={labelClass}>Exchange</label>
                <select name="exchange" value={formData.exchange} onChange={handleChange} className={selectClass}>
                  <option value="NSE">NSE</option>
                  <option value="BSE">BSE</option>
                </select>
              </div>
            )}
            <div>
              <label className={labelClass}>Quantity</label>
              <input type="number" name="quantity" value={formData.quantity} onChange={handleChange} step="0.0001" placeholder="0" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Avg Buy Price</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                <input type="number" name="avg_buy_price" value={formData.avg_buy_price} onChange={handleChange} step="0.01" placeholder="0.00" className={`${inputClass} pl-8`} />
              </div>
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
                <input type="number" name="principal" value={formData.principal} onChange={handleChange} placeholder="0" className={`${inputClass} pl-8`} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Interest Rate (% p.a.)</label>
              <input type="number" name="interest_rate" value={formData.interest_rate} onChange={handleChange} step="0.01" placeholder="0.00" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Institution</label>
              <input type="text" name="institution" value={formData.institution} onChange={handleChange} placeholder="e.g., SBI, HDFC Bank" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Start Date</label>
              <input type="date" name="start_date" value={formData.start_date} onChange={handleChange} className={inputClass} />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Maturity Date</label>
              <input type="date" name="maturity_date" value={formData.maturity_date} onChange={handleChange} className={inputClass} />
            </div>
          </div>
        );

      case 'REAL_ESTATE':
        const calcMode = formData.real_estate_calc_mode || 'rate';

        const appreciatedValue = (() => {
          if (calcMode !== 'rate' || !formData.purchase_price || !formData.purchase_date || !formData.appreciation_rate) return null;
          const purchasePrice = parseFloat(formData.purchase_price);
          const rate = parseFloat(formData.appreciation_rate) / 100;
          const purchaseDate = new Date(formData.purchase_date);
          const today = new Date();
          const years = (today - purchaseDate) / (365.25 * 24 * 60 * 60 * 1000);
          if (years <= 0) return purchasePrice;
          return Math.round(purchasePrice * Math.pow(1 + rate, years));
        })();

        const calculatedRate = (() => {
          if (calcMode !== 'value' || !formData.purchase_price || !formData.purchase_date || !formData.current_value) return null;
          const purchasePrice = parseFloat(formData.purchase_price);
          const currentValue = parseFloat(formData.current_value);
          const purchaseDate = new Date(formData.purchase_date);
          const today = new Date();
          const years = (today - purchaseDate) / (365.25 * 24 * 60 * 60 * 1000);
          if (years <= 0 || purchasePrice <= 0) return null;
          const rate = (Math.pow(currentValue / purchasePrice, 1 / years) - 1) * 100;
          return Math.round(rate * 10) / 10;
        })();

        return (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
              <div>
                <label className={labelClass}>Purchase Price</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                  <input type="number" name="purchase_price" value={formData.purchase_price} onChange={handleChange} placeholder="0" className={`${inputClass} pl-8`} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Purchase Date</label>
                <input type="date" name="purchase_date" value={formData.purchase_date} onChange={handleChange} className={inputClass} />
              </div>
            </div>

            {/* Calculation Mode Toggle */}
            <div className="mb-5 p-4 bg-[var(--fill-tertiary)]/50 rounded-xl">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[13px] font-semibold text-[var(--label-primary)]">Valuation Method</span>
                <div className="flex items-center bg-[var(--bg-primary)] rounded-lg p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, real_estate_calc_mode: 'rate', current_value: '' }))}
                    className={`px-4 py-2 text-[13px] font-semibold rounded-md transition-all ${
                      calcMode === 'rate'
                        ? 'bg-[var(--chart-primary)] text-white shadow-sm'
                        : 'text-[var(--label-secondary)] hover:text-[var(--label-primary)]'
                    }`}
                  >
                    Enter Rate
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, real_estate_calc_mode: 'value', appreciation_rate: '' }))}
                    className={`px-4 py-2 text-[13px] font-semibold rounded-md transition-all ${
                      calcMode === 'value'
                        ? 'bg-[var(--chart-primary)] text-white shadow-sm'
                        : 'text-[var(--label-secondary)] hover:text-[var(--label-primary)]'
                    }`}
                  >
                    Enter Value
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>
                    Appreciation Rate
                    {calcMode === 'value' && calculatedRate !== null && <span className="text-[var(--system-green)] ml-1 text-[11px]">(Auto-calculated)</span>}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      name="appreciation_rate"
                      value={calcMode === 'value' && calculatedRate !== null ? calculatedRate : formData.appreciation_rate}
                      onChange={handleChange}
                      placeholder="6"
                      step="0.1"
                      readOnly={calcMode === 'value'}
                      className={`${inputClass} pr-16 ${calcMode === 'value' ? 'bg-[var(--system-green)]/5 border-[var(--system-green)]/30' : ''}`}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)] text-[13px]">% p.a.</span>
                  </div>
                  {calcMode === 'rate' && (
                    <p className="text-[11px] text-[var(--label-tertiary)] mt-1.5">Typical: 5-8% for residential</p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>
                    Current Value
                    {calcMode === 'rate' && appreciatedValue && <span className="text-[var(--system-green)] ml-1 text-[11px]">(Auto-calculated)</span>}
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                    <input
                      type="number"
                      name="current_value"
                      value={calcMode === 'rate' && appreciatedValue ? appreciatedValue : formData.current_value}
                      onChange={handleChange}
                      placeholder="0"
                      readOnly={calcMode === 'rate'}
                      className={`${inputClass} pl-8 ${calcMode === 'rate' ? 'bg-[var(--system-green)]/5 border-[var(--system-green)]/30' : ''}`}
                    />
                  </div>
                  {calcMode === 'value' && (
                    <p className="text-[11px] text-[var(--label-tertiary)] mt-1.5">Enter estimated market value</p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>Location</label>
                <input type="text" name="location" value={formData.location} onChange={handleChange} placeholder="City, State" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Area (sq.ft)</label>
                <input type="number" name="area_sqft" value={formData.area_sqft} onChange={handleChange} placeholder="0" className={inputClass} />
              </div>
            </div>
          </>
        );

      case 'PHYSICAL':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {(asset_type === 'GOLD' || asset_type === 'SILVER') && (
              <>
                <div>
                  <label className={labelClass}>Weight (grams)</label>
                  <input type="number" name="weight_grams" value={formData.weight_grams} onChange={handleChange} step="0.01" placeholder="0.00" className={inputClass} />
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
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                <input type="number" name="purchase_price" value={formData.purchase_price} onChange={handleChange} placeholder="0" className={`${inputClass} pl-8`} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Current Value</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                <input type="number" name="current_value" value={formData.current_value} onChange={handleChange} placeholder="0" className={`${inputClass} pl-8`} />
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
                <input type="number" name="balance" value={formData.balance} onChange={handleChange} placeholder="0" className={`${inputClass} pl-8`} />
              </div>
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
              <input type="text" name="symbol" value={formData.symbol} onChange={handleChange} placeholder="e.g., BTC, ETH" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Exchange/Wallet</label>
              <input type="text" name="institution" value={formData.institution} onChange={handleChange} placeholder="e.g., WazirX, Binance" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Quantity</label>
              <input type="number" name="quantity" value={formData.quantity} onChange={handleChange} step="0.00000001" placeholder="0.00000000" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Avg Buy Price</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                <input type="number" name="avg_buy_price" value={formData.avg_buy_price} onChange={handleChange} step="0.01" placeholder="0.00" className={`${inputClass} pl-8`} />
              </div>
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
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                <input type="number" name="premium" value={formData.premium} onChange={handleChange} placeholder="0" className={`${inputClass} pl-8`} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Sum Assured</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                <input type="number" name="sum_assured" value={formData.sum_assured} onChange={handleChange} placeholder="0" className={`${inputClass} pl-8`} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Current Value</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                <input type="number" name="current_value" value={formData.current_value} onChange={handleChange} placeholder="For ULIP/endowment" className={`${inputClass} pl-8`} />
              </div>
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
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                <input type="number" name="current_value" value={formData.current_value} onChange={handleChange} placeholder="0" className={`${inputClass} pl-8`} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Purchase Price</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                <input type="number" name="purchase_price" value={formData.purchase_price} onChange={handleChange} placeholder="0" className={`${inputClass} pl-8`} />
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
      <div className="h-full overflow-auto bg-[var(--bg-secondary)]">
        <div className="max-w-6xl mx-auto p-4 md:px-8 md:py-6">
          <div className="mb-8">
            <Skeleton width="100px" height="1rem" rounded="md" className="mb-4" />
            <Skeleton width="200px" height="2rem" rounded="md" className="mb-2" />
            <Skeleton width="280px" height="1rem" rounded="md" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <SkeletonCard />
            </div>
            <div>
              <SkeletonCard />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-[var(--bg-secondary)]">
      <div className="max-w-6xl mx-auto p-4 md:px-8 md:py-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.gentle}
          className="mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <Link to="/assets" className="inline-flex items-center gap-1.5 text-[13px] text-[var(--label-tertiary)] hover:text-[var(--chart-primary)] transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back to Assets
            </Link>
          </div>
          <h1 className="text-[24px] font-bold text-[var(--label-primary)]">Edit Asset</h1>
          <p className="text-[14px] text-[var(--label-secondary)] mt-1">Update the details of your investment</p>
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
              <div className="bg-[var(--system-red)]/10 text-[var(--system-red)] px-4 py-3 rounded-xl text-[14px] flex items-center gap-2">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.gentle, delay: 0.05 }}
            className="lg:col-span-2"
          >
            <form onSubmit={handleSubmit}>
              <Card padding="p-0" className="overflow-hidden">
                {/* Form Header with Gradient */}
                <div className={`px-5 py-4 border-b border-[var(--separator-opaque)] bg-gradient-to-r ${categoryConfig?.gradient || 'from-gray-500/10 to-transparent'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${categoryConfig?.iconBg || 'bg-gray-500'} flex items-center justify-center shadow-sm`}>
                      <span className="text-white">
                        <CategoryIcon category={formData.category} />
                      </span>
                    </div>
                    <div>
                      <h2 className="text-[15px] font-semibold text-[var(--label-primary)]">
                        {selectedType?.label || formData.asset_type?.replace(/_/g, ' ')}
                      </h2>
                      <p className="text-[12px] text-[var(--label-tertiary)]">
                        {categoryConfig?.label || formData.category} • Edit details below
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-5">
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

                  {/* Category-specific fields */}
                  <div className="mb-6">
                    {renderCategoryFields()}
                  </div>

                  {/* Common fields */}
                  <div className="space-y-5 pt-5 border-t border-[var(--separator-opaque)]">
                    {/* Purchase Date and Added On - Two Column */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <label className={labelClass}>Purchase Date</label>
                        <input type="date" name="purchase_date" value={formData.purchase_date} onChange={handleChange} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>
                          Added On
                          <span className="text-[var(--label-quaternary)] font-normal ml-1">(read-only)</span>
                        </label>
                        <div className="flex items-center h-[46px] px-4 bg-[var(--fill-tertiary)] border border-[var(--separator-opaque)] rounded-xl text-[15px] text-[var(--label-secondary)]">
                          <svg className="w-4 h-4 mr-2 text-[var(--label-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {formData.created_at
                            ? new Date(formData.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : '—'
                          }
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Notes</label>
                      <textarea
                        name="notes"
                        value={formData.notes}
                        onChange={handleChange}
                        rows={3}
                        placeholder="Add any additional notes..."
                        className={`${inputClass} resize-none`}
                      />
                    </div>
                  </div>

                  {/* Buttons */}
                  <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-[var(--separator-opaque)]">
                    <Button variant="gray" onClick={() => navigate('/assets')}>
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="filled"
                      loading={saving}
                      icon={
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      }
                    >
                      Save Changes
                    </Button>
                  </div>
                </div>
              </Card>
            </form>
          </motion.div>

          {/* Preview Card */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...spring.gentle, delay: 0.1 }}
            className="lg:col-span-1"
          >
            <div className="sticky top-6">
              <Card padding="p-0" className="overflow-hidden" glow>
                {/* Preview Header with Gradient */}
                <div className={`p-5 bg-gradient-to-br ${categoryConfig?.gradient || 'from-[var(--chart-primary)]/10 via-[var(--chart-primary)]/5 to-transparent'}`}>
                  <p className="text-[11px] font-medium text-[var(--label-tertiary)] uppercase tracking-wide mb-3">Preview</p>

                  {/* Hero Value */}
                  <p className="text-[32px] font-bold text-[var(--label-primary)] tracking-tight leading-none mb-1">
                    {formatCurrency(getPreviewValue())}
                  </p>
                  <p className="text-[13px] text-[var(--label-secondary)]">
                    {formData.name || 'Asset Name'}
                  </p>
                </div>

                {/* Form Completion Progress */}
                <div className="px-5 py-3 border-b border-[var(--separator-opaque)]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] text-[var(--label-tertiary)]">Form completion</span>
                    <span className="text-[12px] font-medium text-[var(--label-primary)]">{completionPercentage}%</span>
                  </div>
                  <div className="h-1.5 bg-[var(--fill-tertiary)] rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-[var(--chart-primary)] rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${completionPercentage}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>

                {/* Preview Details */}
                <div className="p-5 space-y-4">
                  {/* Asset Icon + Type */}
                  <div className="flex items-center gap-3 pb-4 border-b border-[var(--separator-opaque)]">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${categoryConfig?.iconBg || 'bg-[var(--fill-tertiary)]'}`}>
                      <span className="text-white">
                        <CategoryIcon category={formData.category} />
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold text-[var(--label-primary)] truncate">
                        {selectedType?.label || formData.asset_type?.replace(/_/g, ' ')}
                      </p>
                      <p className="text-[13px] text-[var(--label-tertiary)]">
                        {categoryConfig?.label || formData.category}
                      </p>
                    </div>
                  </div>

                  {/* Details List */}
                  <div className="space-y-3">
                    {formData.symbol && (
                      <div className="flex justify-between items-center">
                        <span className="text-[13px] text-[var(--label-tertiary)]">Symbol</span>
                        <span className="text-[13px] font-semibold text-[var(--label-primary)] bg-[var(--fill-tertiary)] px-2 py-0.5 rounded-md">{formData.symbol}</span>
                      </div>
                    )}

                    {formData.exchange && formData.category === 'EQUITY' && formData.asset_type !== 'MUTUAL_FUND' && (
                      <div className="flex justify-between items-center">
                        <span className="text-[13px] text-[var(--label-tertiary)]">Exchange</span>
                        <span className="text-[13px] font-medium text-[var(--label-primary)]">{formData.exchange}</span>
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

                    {formData.appreciation_rate && formData.category === 'REAL_ESTATE' && (
                      <div className="flex justify-between items-center">
                        <span className="text-[13px] text-[var(--label-tertiary)]">Appreciation</span>
                        <span className="text-[13px] font-medium text-[var(--system-green)]">{formData.appreciation_rate}% p.a.</span>
                      </div>
                    )}

                    {formData.location && (
                      <div className="flex justify-between items-center">
                        <span className="text-[13px] text-[var(--label-tertiary)]">Location</span>
                        <span className="text-[13px] font-medium text-[var(--label-primary)] truncate max-w-[120px]">{formData.location}</span>
                      </div>
                    )}

                    {formData.purchase_date && (
                      <div className="flex justify-between items-center">
                        <span className="text-[13px] text-[var(--label-tertiary)]">Purchase Date</span>
                        <span className="text-[13px] font-medium text-[var(--label-primary)]">
                          {new Date(formData.purchase_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
