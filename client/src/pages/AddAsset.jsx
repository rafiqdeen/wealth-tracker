import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { assetService, ASSET_CONFIG } from '../services/assets';
import { Card, Button } from '../components/apple';
import { spring, staggerContainer, staggerItem, tapScale } from '../utils/animations';
import { categoryColors, CategoryIcon } from '../constants/theme';
import { formatCurrency } from '../utils/formatting';
import StockAutocomplete from '../components/StockAutocomplete';

export default function AddAsset() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);

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
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const selectCategory = (category) => {
    setFormData((prev) => ({ ...prev, category, asset_type: '' }));
    setStep(2);
  };

  const selectType = (type) => {
    setFormData((prev) => ({ ...prev, asset_type: type }));
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

  const getPreviewValue = () => {
    const { category, quantity, price, principal, purchase_price, current_value, balance } = formData;

    if (category === 'EQUITY' || category === 'CRYPTO') {
      return quantity && price ? quantity * price : 0;
    }
    if (category === 'FIXED_INCOME') return principal || 0;
    if (category === 'SAVINGS') return balance || 0;
    return current_value || purchase_price || 0;
  };

  const inputClass = "w-full px-4 py-3 bg-[var(--fill-tertiary)] border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--system-blue)] transition-all text-[var(--label-primary)] placeholder-[var(--label-tertiary)] text-[15px]";
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

      case 'FIXED_INCOME':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Principal Amount</label>
              <input type="number" name="principal" value={formData.principal} onChange={handleChange} placeholder="0" className={inputClass} required />
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
                  <select name="purity" value={formData.purity} onChange={handleChange} className={inputClass}>
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
                        className={`p-4 rounded-2xl border-2 border-transparent transition-all text-left ${colors.bg} hover:border-current`}
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
