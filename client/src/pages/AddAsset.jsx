import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { assetService, ASSET_CONFIG } from '../services/assets';
import StockAutocomplete from '../components/StockAutocomplete';

// Category icons mapping
const categoryIcons = {
  EQUITY: { icon: '📈', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-600' },
  FIXED_INCOME: { icon: '🏦', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-600' },
  REAL_ESTATE: { icon: '🏠', bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-600' },
  PHYSICAL: { icon: '💎', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-600' },
  SAVINGS: { icon: '💰', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-600' },
  CRYPTO: { icon: '₿', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-600' },
  INSURANCE: { icon: '🛡️', bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-600' },
  OTHER: { icon: '📦', bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-600' },
};

export default function AddAsset() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1); // 1: Category, 2: Type, 3: Details

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
    balance: '',
    weight_grams: '',
    purity: '',
    premium: '',
    sum_assured: '',
    policy_number: '',
    purchase_date: '',
    notes: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const selectCategory = (category) => {
    setFormData((prev) => ({
      ...prev,
      category,
      asset_type: '',
    }));
    setStep(2);
  };

  const selectType = (type) => {
    setFormData((prev) => ({
      ...prev,
      asset_type: type,
    }));
    setStep(3);
  };

  const goBack = () => {
    if (step === 2) {
      setFormData((prev) => ({ ...prev, category: '', asset_type: '' }));
      setStep(1);
    } else if (step === 3) {
      setFormData((prev) => ({ ...prev, asset_type: '' }));
      setStep(2);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await assetService.create(formData);
      navigate('/assets');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create asset');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    if (!value) return '₹0';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Calculate preview value based on form data
  const getPreviewValue = () => {
    const { category, quantity, avg_buy_price, principal, purchase_price, current_value, balance } = formData;

    if (category === 'EQUITY' || category === 'CRYPTO') {
      return quantity && avg_buy_price ? quantity * avg_buy_price : 0;
    }
    if (category === 'FIXED_INCOME') return principal || 0;
    if (category === 'SAVINGS') return balance || 0;
    return current_value || purchase_price || 0;
  };

  const renderCategoryFields = () => {
    const { category, asset_type } = formData;
    const inputClass = "w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all";
    const labelClass = "block text-sm font-medium text-gray-700 mb-2";

    switch (category) {
      case 'EQUITY':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Symbol *</label>
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
                  className={inputClass}
                >
                  <option value="NSE">NSE</option>
                  <option value="BSE">BSE</option>
                </select>
              </div>
            )}
            <div>
              <label className={labelClass}>Quantity *</label>
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
              <label className={labelClass}>Avg Buy Price (₹) *</label>
              <input
                type="number"
                name="avg_buy_price"
                value={formData.avg_buy_price}
                onChange={handleChange}
                step="0.01"
                placeholder="0.00"
                className={inputClass}
                required
              />
            </div>
          </div>
        );

      case 'FIXED_INCOME':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Principal Amount (₹) *</label>
              <input
                type="number"
                name="principal"
                value={formData.principal}
                onChange={handleChange}
                placeholder="0"
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Interest Rate (% p.a.)</label>
              <input
                type="number"
                name="interest_rate"
                value={formData.interest_rate}
                onChange={handleChange}
                step="0.01"
                placeholder="0.00"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Institution</label>
              <input
                type="text"
                name="institution"
                value={formData.institution}
                onChange={handleChange}
                placeholder="e.g., SBI, HDFC Bank"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Start Date</label>
              <input
                type="date"
                name="start_date"
                value={formData.start_date}
                onChange={handleChange}
                className={inputClass}
              />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Maturity Date</label>
              <input
                type="date"
                name="maturity_date"
                value={formData.maturity_date}
                onChange={handleChange}
                className={inputClass}
              />
            </div>
          </div>
        );

      case 'REAL_ESTATE':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Purchase Price (₹) *</label>
              <input
                type="number"
                name="purchase_price"
                value={formData.purchase_price}
                onChange={handleChange}
                placeholder="0"
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Current Value (₹)</label>
              <input
                type="number"
                name="current_value"
                value={formData.current_value}
                onChange={handleChange}
                placeholder="0"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Location</label>
              <input
                type="text"
                name="location"
                value={formData.location}
                onChange={handleChange}
                placeholder="City, State"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Area (sq.ft)</label>
              <input
                type="number"
                name="area_sqft"
                value={formData.area_sqft}
                onChange={handleChange}
                placeholder="0"
                className={inputClass}
              />
            </div>
          </div>
        );

      case 'PHYSICAL':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {(asset_type === 'GOLD' || asset_type === 'SILVER') && (
              <>
                <div>
                  <label className={labelClass}>Weight (grams) *</label>
                  <input
                    type="number"
                    name="weight_grams"
                    value={formData.weight_grams}
                    onChange={handleChange}
                    step="0.01"
                    placeholder="0.00"
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className={labelClass}>Purity</label>
                  <select
                    name="purity"
                    value={formData.purity}
                    onChange={handleChange}
                    className={inputClass}
                  >
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
              <label className={labelClass}>Purchase Price (₹) *</label>
              <input
                type="number"
                name="purchase_price"
                value={formData.purchase_price}
                onChange={handleChange}
                placeholder="0"
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Current Value (₹)</label>
              <input
                type="number"
                name="current_value"
                value={formData.current_value}
                onChange={handleChange}
                placeholder="0"
                className={inputClass}
              />
            </div>
          </div>
        );

      case 'SAVINGS':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Current Balance (₹) *</label>
              <input
                type="number"
                name="balance"
                value={formData.balance}
                onChange={handleChange}
                placeholder="0"
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Interest Rate (% p.a.)</label>
              <input
                type="number"
                name="interest_rate"
                value={formData.interest_rate}
                onChange={handleChange}
                step="0.01"
                placeholder="0.00"
                className={inputClass}
              />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Bank/Institution</label>
              <input
                type="text"
                name="institution"
                value={formData.institution}
                onChange={handleChange}
                placeholder="e.g., SBI, HDFC Bank"
                className={inputClass}
              />
            </div>
          </div>
        );

      case 'CRYPTO':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Symbol *</label>
              <input
                type="text"
                name="symbol"
                value={formData.symbol}
                onChange={handleChange}
                placeholder="e.g., BTC, ETH"
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Exchange/Wallet</label>
              <input
                type="text"
                name="institution"
                value={formData.institution}
                onChange={handleChange}
                placeholder="e.g., WazirX, Binance"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Quantity *</label>
              <input
                type="number"
                name="quantity"
                value={formData.quantity}
                onChange={handleChange}
                step="0.00000001"
                placeholder="0.00000000"
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Avg Buy Price (₹) *</label>
              <input
                type="number"
                name="avg_buy_price"
                value={formData.avg_buy_price}
                onChange={handleChange}
                step="0.01"
                placeholder="0.00"
                className={inputClass}
                required
              />
            </div>
          </div>
        );

      case 'INSURANCE':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Policy Number</label>
              <input
                type="text"
                name="policy_number"
                value={formData.policy_number}
                onChange={handleChange}
                placeholder="Policy number"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Institution</label>
              <input
                type="text"
                name="institution"
                value={formData.institution}
                onChange={handleChange}
                placeholder="e.g., LIC, ICICI Prudential"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Premium (₹/year)</label>
              <input
                type="number"
                name="premium"
                value={formData.premium}
                onChange={handleChange}
                placeholder="0"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Sum Assured (₹)</label>
              <input
                type="number"
                name="sum_assured"
                value={formData.sum_assured}
                onChange={handleChange}
                placeholder="0"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Current Value (₹)</label>
              <input
                type="number"
                name="current_value"
                value={formData.current_value}
                onChange={handleChange}
                placeholder="For ULIP/endowment policies"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Maturity Date</label>
              <input
                type="date"
                name="maturity_date"
                value={formData.maturity_date}
                onChange={handleChange}
                className={inputClass}
              />
            </div>
          </div>
        );

      case 'OTHER':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Current Value (₹) *</label>
              <input
                type="number"
                name="current_value"
                value={formData.current_value}
                onChange={handleChange}
                placeholder="0"
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Purchase Price (₹)</label>
              <input
                type="number"
                name="purchase_price"
                value={formData.purchase_price}
                onChange={handleChange}
                placeholder="0"
                className={inputClass}
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link to="/assets" className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1 mb-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Assets
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Add New Asset</h1>
          <p className="text-gray-500 mt-1">Track your wealth by adding a new asset to your portfolio</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
              step >= s
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-400'
            }`}>
              {step > s ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : s}
            </div>
            {s < 3 && (
              <div className={`w-16 sm:w-24 h-1 mx-2 rounded-full transition-all ${
                step > s ? 'bg-blue-600' : 'bg-gray-100'
              }`} />
            )}
          </div>
        ))}
        <span className="text-sm text-gray-500 ml-4 hidden sm:inline">
          {step === 1 && 'Select Category'}
          {step === 2 && 'Choose Type'}
          {step === 3 && 'Enter Details'}
        </span>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* Step 1: Category Selection */}
      {step === 1 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">What type of asset do you want to add?</h2>
          <p className="text-gray-500 text-sm mb-6">Select a category to continue</p>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Object.entries(ASSET_CONFIG).map(([key, config]) => {
              const iconConfig = categoryIcons[key];
              return (
                <button
                  key={key}
                  onClick={() => selectCategory(key)}
                  className={`p-5 rounded-xl border-2 transition-all hover:shadow-md hover:scale-[1.02] text-left ${iconConfig.bg} ${iconConfig.border} hover:border-current`}
                  style={{ '--tw-border-opacity': 1 }}
                >
                  <span className="text-3xl block mb-3">{iconConfig.icon}</span>
                  <span className={`font-semibold ${iconConfig.text}`}>{config.label}</span>
                  <span className="text-xs text-gray-500 block mt-1">{config.types.length} types</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 2: Type Selection */}
      {step === 2 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8">
          <button
            onClick={goBack}
            className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1 mb-4"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Change category
          </button>

          <div className="flex items-center gap-3 mb-6">
            <span className={`text-3xl p-3 rounded-xl ${categoryIcons[formData.category]?.bg}`}>
              {categoryIcons[formData.category]?.icon}
            </span>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {ASSET_CONFIG[formData.category]?.label}
              </h2>
              <p className="text-gray-500 text-sm">Select the specific type</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ASSET_CONFIG[formData.category]?.types.map((type) => (
              <button
                key={type.value}
                onClick={() => selectType(type.value)}
                className="p-4 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all text-left flex items-center gap-3 group"
              >
                <div className="w-10 h-10 rounded-lg bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center transition-colors">
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <span className="font-medium text-gray-700 group-hover:text-blue-700">{type.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Details Form */}
      {step === 3 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8">
              <button
                type="button"
                onClick={goBack}
                className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1 mb-4"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Change type
              </button>

              <div className="flex items-center gap-3 mb-6 pb-6 border-b border-gray-100">
                <span className={`text-2xl p-2 rounded-lg ${categoryIcons[formData.category]?.bg}`}>
                  {categoryIcons[formData.category]?.icon}
                </span>
                <div>
                  <h2 className="font-semibold text-gray-900">
                    {ASSET_CONFIG[formData.category]?.types.find(t => t.value === formData.asset_type)?.label}
                  </h2>
                  <p className="text-gray-500 text-sm">{ASSET_CONFIG[formData.category]?.label}</p>
                </div>
              </div>

              {/* Asset Name */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Asset Name *</label>
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
                    placeholder={formData.asset_type === 'MUTUAL_FUND' ? 'Search mutual fund by name...' : 'Search stock by company name...'}
                  />
                ) : (
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Enter a name for this asset"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    required
                  />
                )}
              </div>

              {/* Category-specific fields */}
              <div className="mb-6">
                {renderCategoryFields()}
              </div>

              {/* Common fields */}
              <div className="space-y-5 pt-6 border-t border-gray-100">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Purchase Date</label>
                  <input
                    type="date"
                    name="purchase_date"
                    value={formData.purchase_date}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Add any additional notes about this asset..."
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                  />
                </div>
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => navigate('/assets')}
                  className="px-6 py-3 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Adding...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Asset
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Preview Card */}
          <div className="lg:col-span-1">
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl border border-gray-200 p-6 sticky top-6">
              <h3 className="text-sm font-medium text-gray-500 mb-4">Preview</h3>

              <div className={`p-4 rounded-xl ${categoryIcons[formData.category]?.bg} mb-4`}>
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{categoryIcons[formData.category]?.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 truncate">
                      {formData.name || 'Asset Name'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {ASSET_CONFIG[formData.category]?.types.find(t => t.value === formData.asset_type)?.label}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Category</span>
                  <span className="text-sm font-medium text-gray-900">
                    {ASSET_CONFIG[formData.category]?.label}
                  </span>
                </div>

                {formData.symbol && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Symbol</span>
                    <span className="text-sm font-medium text-gray-900">{formData.symbol}</span>
                  </div>
                )}

                {formData.quantity && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Quantity</span>
                    <span className="text-sm font-medium text-gray-900">{formData.quantity}</span>
                  </div>
                )}

                {formData.institution && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Institution</span>
                    <span className="text-sm font-medium text-gray-900 truncate max-w-[150px]">{formData.institution}</span>
                  </div>
                )}

                {formData.interest_rate && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Interest Rate</span>
                    <span className="text-sm font-medium text-gray-900">{formData.interest_rate}% p.a.</span>
                  </div>
                )}

                <div className="pt-3 mt-3 border-t border-gray-200">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Estimated Value</span>
                    <span className="text-lg font-bold text-gray-900">
                      {formatCurrency(getPreviewValue())}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
