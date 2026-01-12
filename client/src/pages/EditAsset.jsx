import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
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
    balance: '',
    weight_grams: '',
    purity: '',
    premium: '',
    sum_assured: '',
    policy_number: '',
    purchase_date: '',
    notes: '',
  });

  useEffect(() => {
    fetchAsset();
  }, [id]);

  const fetchAsset = async () => {
    try {
      const response = await assetService.getById(id);
      const asset = response.data.asset;
      setFormData({
        category: asset.category || '',
        asset_type: asset.asset_type || '',
        name: asset.name || '',
        symbol: asset.symbol || '',
        exchange: asset.exchange || 'NSE',
        quantity: asset.quantity || '',
        avg_buy_price: asset.avg_buy_price || '',
        principal: asset.principal || '',
        interest_rate: asset.interest_rate || '',
        start_date: asset.start_date || '',
        maturity_date: asset.maturity_date || '',
        institution: asset.institution || '',
        purchase_price: asset.purchase_price || '',
        current_value: asset.current_value || '',
        location: asset.location || '',
        area_sqft: asset.area_sqft || '',
        balance: asset.balance || '',
        weight_grams: asset.weight_grams || '',
        purity: asset.purity || '',
        premium: asset.premium || '',
        sum_assured: asset.sum_assured || '',
        policy_number: asset.policy_number || '',
        purchase_date: asset.purchase_date || '',
        notes: asset.notes || '',
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
      await assetService.update(id, formData);
      navigate('/assets');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update asset');
    } finally {
      setSaving(false);
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

  const getPreviewValue = () => {
    const { category, quantity, avg_buy_price, principal, purchase_price, current_value, balance } = formData;

    if (category === 'EQUITY' || category === 'CRYPTO') {
      return quantity && avg_buy_price ? quantity * avg_buy_price : 0;
    }
    if (category === 'FIXED_INCOME') return principal || 0;
    if (category === 'SAVINGS') return balance || 0;
    return current_value || purchase_price || 0;
  };

  const inputClass = "w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all";
  const labelClass = "block text-sm font-medium text-gray-700 mb-2";

  const renderCategoryFields = () => {
    const { category, asset_type } = formData;

    switch (category) {
      case 'EQUITY':
        return (
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
              <label className={labelClass}>Quantity</label>
              <input
                type="number"
                name="quantity"
                value={formData.quantity}
                onChange={handleChange}
                step="0.0001"
                placeholder="0"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Avg Buy Price (₹)</label>
              <input
                type="number"
                name="avg_buy_price"
                value={formData.avg_buy_price}
                onChange={handleChange}
                step="0.01"
                placeholder="0.00"
                className={inputClass}
              />
            </div>
          </div>
        );

      case 'FIXED_INCOME':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Principal Amount (₹)</label>
              <input
                type="number"
                name="principal"
                value={formData.principal}
                onChange={handleChange}
                placeholder="0"
                className={inputClass}
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
                  <label className={labelClass}>Weight (grams)</label>
                  <input
                    type="number"
                    name="weight_grams"
                    value={formData.weight_grams}
                    onChange={handleChange}
                    step="0.01"
                    placeholder="0.00"
                    className={inputClass}
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
              <label className={labelClass}>Current Balance (₹)</label>
              <input
                type="number"
                name="balance"
                value={formData.balance}
                onChange={handleChange}
                placeholder="0"
                className={inputClass}
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
              <label className={labelClass}>Symbol</label>
              <input
                type="text"
                name="symbol"
                value={formData.symbol}
                onChange={handleChange}
                placeholder="e.g., BTC, ETH"
                className={inputClass}
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
              <label className={labelClass}>Quantity</label>
              <input
                type="number"
                name="quantity"
                value={formData.quantity}
                onChange={handleChange}
                step="0.00000001"
                placeholder="0.00000000"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Avg Buy Price (₹)</label>
              <input
                type="number"
                name="avg_buy_price"
                value={formData.avg_buy_price}
                onChange={handleChange}
                step="0.01"
                placeholder="0.00"
                className={inputClass}
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

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-500">Loading asset...</p>
        </div>
      </div>
    );
  }

  const iconConfig = categoryIcons[formData.category] || categoryIcons.OTHER;

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
          <h1 className="text-3xl font-bold text-gray-900">Edit Asset</h1>
          <p className="text-gray-500 mt-1">Update the details of your asset</p>
        </div>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8">
            {/* Asset Type Header */}
            <div className="flex items-center gap-3 mb-6 pb-6 border-b border-gray-100">
              <span className={`text-2xl p-2 rounded-lg ${iconConfig.bg}`}>
                {iconConfig.icon}
              </span>
              <div>
                <h2 className="font-semibold text-gray-900">
                  {ASSET_CONFIG[formData.category]?.types.find(t => t.value === formData.asset_type)?.label || formData.asset_type.replace(/_/g, ' ')}
                </h2>
                <p className="text-gray-500 text-sm">{ASSET_CONFIG[formData.category]?.label || formData.category}</p>
              </div>
            </div>

            {/* Asset Name */}
            <div className="mb-6">
              <label className={labelClass}>Asset Name *</label>
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
            <div className="space-y-5 pt-6 border-t border-gray-100">
              <div>
                <label className={labelClass}>Purchase Date</label>
                <input
                  type="date"
                  name="purchase_date"
                  value={formData.purchase_date}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Notes</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Add any additional notes about this asset..."
                  className={`${inputClass} resize-none`}
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
                disabled={saving}
                className="px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Saving...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Save Changes
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

            <div className={`p-4 rounded-xl ${iconConfig.bg} mb-4`}>
              <div className="flex items-center gap-3">
                <span className="text-3xl">{iconConfig.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 truncate">
                    {formData.name || 'Asset Name'}
                  </p>
                  <p className="text-sm text-gray-500">
                    {ASSET_CONFIG[formData.category]?.types.find(t => t.value === formData.asset_type)?.label || formData.asset_type.replace(/_/g, ' ')}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Category</span>
                <span className="text-sm font-medium text-gray-900">
                  {ASSET_CONFIG[formData.category]?.label || formData.category}
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
    </div>
  );
}
