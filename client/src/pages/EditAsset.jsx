import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { assetService, ASSET_CONFIG } from '../services/assets';
import { Card, Button, SkeletonCard, Skeleton } from '../components/apple';
import { spring, tapScale } from '../utils/animations';
import { categoryColors, CategoryIcon } from '../constants/theme';
import { formatCurrency } from '../utils/formatting';
import StockAutocomplete from '../components/StockAutocomplete';

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
      // Helper to round numbers to 2 decimal places for display
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

  const getPreviewValue = () => {
    const { category, quantity, avg_buy_price, principal, purchase_price, current_value, balance } = formData;

    if (category === 'EQUITY' || category === 'CRYPTO') {
      return quantity && avg_buy_price ? quantity * avg_buy_price : 0;
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
              <input type="number" name="avg_buy_price" value={formData.avg_buy_price} onChange={handleChange} step="0.01" placeholder="0.00" className={inputClass} />
            </div>
          </div>
        );

      case 'FIXED_INCOME':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Principal Amount</label>
              <input type="number" name="principal" value={formData.principal} onChange={handleChange} placeholder="0" className={inputClass} />
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
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Purchase Price</label>
              <input type="number" name="purchase_price" value={formData.purchase_price} onChange={handleChange} placeholder="0" className={inputClass} />
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
              <input type="number" name="purchase_price" value={formData.purchase_price} onChange={handleChange} placeholder="0" className={inputClass} />
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
              <input type="number" name="balance" value={formData.balance} onChange={handleChange} placeholder="0" className={inputClass} />
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
              <input type="number" name="avg_buy_price" value={formData.avg_buy_price} onChange={handleChange} step="0.01" placeholder="0.00" className={inputClass} />
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
              <input type="number" name="current_value" value={formData.current_value} onChange={handleChange} placeholder="0" className={inputClass} />
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)]">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="mb-8">
            <Skeleton width="60px" height="1rem" rounded="sm" className="mb-4" />
            <Skeleton width="150px" height="2rem" rounded="md" className="mb-2" />
            <Skeleton width="200px" height="1rem" rounded="sm" />
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

  const colors = categoryColors[formData.category] || categoryColors.OTHER;

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
          <h1 className="text-[28px] font-semibold text-[var(--label-primary)]">Edit Asset</h1>
          <p className="text-[15px] text-[var(--label-secondary)] mt-1">Update the details of your asset</p>
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

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.1 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        >
          {/* Main Form */}
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit}>
              <Card padding="p-6" hoverable>
                {/* Asset Type Header */}
                <div className="flex items-center gap-3 mb-6 pb-6 border-b border-[var(--separator)]/30">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors.bg}`}
                    style={{ color: colors.color }}
                  >
                    <CategoryIcon category={formData.category} />
                  </div>
                  <div>
                    <h2 className="font-semibold text-[15px] text-[var(--label-primary)]">
                      {ASSET_CONFIG[formData.category]?.types.find(t => t.value === formData.asset_type)?.label || formData.asset_type.replace(/_/g, ' ')}
                    </h2>
                    <p className="text-[13px] text-[var(--label-tertiary)]">{ASSET_CONFIG[formData.category]?.label || formData.category}</p>
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

                {/* Category-specific fields */}
                <div className="mb-6">
                  {renderCategoryFields()}
                </div>

                {/* Common fields */}
                <div className="space-y-5 pt-6 border-t border-[var(--separator)]/30">
                  <div>
                    <label className={labelClass}>Purchase Date</label>
                    <input type="date" name="purchase_date" value={formData.purchase_date} onChange={handleChange} className={inputClass} />
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
                <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-[var(--separator)]/30">
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
              </Card>
            </form>
          </div>

          {/* Preview Card */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              <Card padding="p-5" hoverable glow>
                <p className="text-[11px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider mb-4">Preview</p>

                <div className={`p-4 rounded-xl ${colors.bg} mb-4`}>
                  <div className="flex items-center gap-3">
                    <div style={{ color: colors.color }}>
                      <CategoryIcon category={formData.category} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[15px] text-[var(--label-primary)] truncate">{formData.name || 'Asset Name'}</p>
                      <p className="text-[13px] text-[var(--label-tertiary)]">
                        {ASSET_CONFIG[formData.category]?.types.find(t => t.value === formData.asset_type)?.label || formData.asset_type.replace(/_/g, ' ')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] text-[var(--label-tertiary)]">Category</span>
                    <span className="text-[13px] font-medium text-[var(--label-primary)]">
                      {ASSET_CONFIG[formData.category]?.label || formData.category}
                    </span>
                  </div>

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
      </div>
    </div>
  );
}
