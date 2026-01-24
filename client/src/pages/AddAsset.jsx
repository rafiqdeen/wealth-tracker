import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { assetService, ASSET_CONFIG } from '../services/assets';
import { Card, Button } from '../components/apple';
import { spring } from '../utils/animations';
import { categoryColors, CategoryIcon } from '../constants/theme';
import {
  formatCurrency,
  formatIndianNumber,
  parseIndianNumber,
  calculateMaturityValue,
  calculateTenureYears
} from '../utils/formatting';
import StockAutocomplete from '../components/StockAutocomplete';
import { useToast } from '../context/ToastContext';

// Local storage keys
const DRAFT_KEY = 'wealth_tracker_add_asset_draft';
const INSTITUTIONS_KEY = 'wealth_tracker_institutions';
const RECENT_CATEGORIES_KEY = 'wealth_tracker_recent_categories';

// Category card configuration with icons and colors
const CATEGORY_CARDS = [
  { key: 'EQUITY', label: 'Equity', description: 'Stocks & Mutual Funds', gradient: 'from-blue-500/15 to-blue-600/5', iconBg: 'bg-[#4F7DF3]' },
  { key: 'FIXED_INCOME', label: 'Fixed Income', description: 'FD, PPF, Bonds', gradient: 'from-emerald-500/15 to-emerald-600/5', iconBg: 'bg-[#22C55E]' },
  { key: 'REAL_ESTATE', label: 'Real Estate', description: 'Property & Land', gradient: 'from-amber-500/15 to-amber-600/5', iconBg: 'bg-[#F59E0B]' },
  { key: 'PHYSICAL', label: 'Physical Assets', description: 'Gold, Silver, Art', gradient: 'from-orange-500/15 to-orange-600/5', iconBg: 'bg-[#F97316]' },
  { key: 'SAVINGS', label: 'Savings', description: 'Bank Accounts', gradient: 'from-teal-500/15 to-teal-600/5', iconBg: 'bg-[#14B8A6]' },
  { key: 'CRYPTO', label: 'Cryptocurrency', description: 'Bitcoin, Ethereum', gradient: 'from-indigo-500/15 to-indigo-600/5', iconBg: 'bg-[#6366F1]' },
  { key: 'INSURANCE', label: 'Insurance', description: 'Life, ULIP Policies', gradient: 'from-pink-500/15 to-pink-600/5', iconBg: 'bg-[#EC4899]' },
  { key: 'OTHER', label: 'Other', description: 'Miscellaneous', gradient: 'from-gray-500/15 to-gray-600/5', iconBg: 'bg-[#6B7280]' },
];

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

// Default interest rates (government-set rates as of 2024)
const FIXED_INCOME_DEFAULTS = {
  PPF: { rate: 7.1, tenure: 15, compounding: 1 },
  EPF: { rate: 8.25, tenure: null, compounding: 1 },
  VPF: { rate: 8.25, tenure: null, compounding: 1 },
  NPS: { rate: null, tenure: null },
  NSC: { rate: 7.7, tenure: 5, compounding: 1 },
  KVP: { rate: 7.5, tenure: 10, compounding: 1 },
  FD: { rate: 7.0, compounding: 4 },
  RD: { rate: 6.5, compounding: 4 },
  BONDS: { rate: 7.5, compounding: 2 },
};

const getInitialFormData = () => ({
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
  start_date: new Date().toISOString().split('T')[0], // Default to today
  maturity_date: '',
  institution: '',
  purchase_price: '',
  current_value: '',
  location: '',
  area_sqft: '',
  balance: '',
  weight_grams: '',
  purity: '22K', // Default to most common
  premium: '',
  sum_assured: '',
  policy_number: '',
  purchase_date: new Date().toISOString().split('T')[0], // Default to today
  notes: '',
  tenure_months: '',
  monthly_deposit: '',
  pran_number: '',
});

export default function AddAsset() {
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState(getInitialFormData());
  const [validationErrors, setValidationErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [existingAssets, setExistingAssets] = useState([]);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [savedInstitutions, setSavedInstitutions] = useState([]);
  const [showInstitutionSuggestions, setShowInstitutionSuggestions] = useState(false);
  const [recentCategories, setRecentCategories] = useState([]);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [successState, setSuccessState] = useState(null);

  // Load saved data on mount
  useEffect(() => {
    // Load existing assets for duplicate detection
    const loadExistingAssets = async () => {
      try {
        const response = await assetService.getAll();
        setExistingAssets(response.data.assets || []);
      } catch (err) {
        console.error('Failed to load existing assets:', err);
      }
    };
    loadExistingAssets();

    // Load saved institutions from localStorage
    const savedInst = localStorage.getItem(INSTITUTIONS_KEY);
    if (savedInst) {
      setSavedInstitutions(JSON.parse(savedInst));
    }

    // Load recent categories
    const recentCats = localStorage.getItem(RECENT_CATEGORIES_KEY);
    if (recentCats) {
      setRecentCategories(JSON.parse(recentCats));
    }

    // Check for saved draft
    const savedDraft = localStorage.getItem(DRAFT_KEY);
    if (savedDraft) {
      const draft = JSON.parse(savedDraft);
      // Only show modal if draft has meaningful data
      if (draft.category && (draft.name || draft.principal || draft.balance)) {
        setShowDraftModal(true);
      }
    }
  }, []);

  // Auto-save draft on form changes
  useEffect(() => {
    const hasData = formData.category || formData.name || formData.principal || formData.balance;
    if (hasData && !successState) {
      const timer = setTimeout(() => {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(formData));
      }, 1000); // Debounce 1 second
      return () => clearTimeout(timer);
    }
  }, [formData, successState]);

  // Apply defaults when asset type changes
  useEffect(() => {
    if (formData.category === 'FIXED_INCOME' && formData.asset_type) {
      const defaults = FIXED_INCOME_DEFAULTS[formData.asset_type];
      if (defaults && defaults.rate) {
        setFormData(prev => ({
          ...prev,
          interest_rate: prev.interest_rate || defaults.rate.toString(),
        }));
      }
    }
  }, [formData.asset_type, formData.category]);

  // Check for duplicate when name/symbol changes
  useEffect(() => {
    if (formData.category === 'EQUITY' && formData.symbol) {
      const duplicate = existingAssets.find(
        a => a.symbol?.toLowerCase() === formData.symbol.toLowerCase() &&
             a.category === 'EQUITY'
      );
      if (duplicate) {
        setDuplicateWarning({
          asset: duplicate,
          message: `You already have ${duplicate.name} in your portfolio`,
        });
      } else {
        setDuplicateWarning(null);
      }
    } else if (formData.name && formData.category) {
      const duplicate = existingAssets.find(
        a => a.name?.toLowerCase() === formData.name.toLowerCase() &&
             a.category === formData.category
      );
      if (duplicate) {
        setDuplicateWarning({
          asset: duplicate,
          message: `You already have "${duplicate.name}" in ${ASSET_CONFIG[formData.category]?.label}`,
        });
      } else {
        setDuplicateWarning(null);
      }
    } else {
      setDuplicateWarning(null);
    }
  }, [formData.symbol, formData.name, formData.category, existingAssets]);

  // Validate field
  const validateField = useCallback((name, value) => {
    const errors = {};
    const requiredFields = VALIDATION_RULES[formData.category] || [];

    if (requiredFields.includes(name) && !value) {
      errors[name] = 'This field is required';
    }

    // Specific validations
    if (name === 'interest_rate' && value && (parseFloat(value) < 0 || parseFloat(value) > 50)) {
      errors[name] = 'Interest rate must be between 0-50%';
    }
    if (name === 'quantity' && value && parseFloat(value) <= 0) {
      errors[name] = 'Quantity must be greater than 0';
    }
    if (name === 'price' && value && parseFloat(value) <= 0) {
      errors[name] = 'Price must be greater than 0';
    }

    return errors;
  }, [formData.category]);

  // Handle field blur for validation
  const handleBlur = (name) => {
    setTouched(prev => ({ ...prev, [name]: true }));
    const errors = validateField(name, formData[name]);
    setValidationErrors(prev => ({ ...prev, ...errors }));
  };

  // Validate entire form
  const validateForm = useCallback(() => {
    const errors = {};
    const requiredFields = VALIDATION_RULES[formData.category] || [];

    requiredFields.forEach(field => {
      if (!formData[field]) {
        errors[field] = 'This field is required';
      }
    });

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  // Calculate form completion percentage
  const completionPercentage = useMemo(() => {
    if (!formData.category || !formData.asset_type) return 0;

    const requiredFields = VALIDATION_RULES[formData.category] || [];
    const filledFields = requiredFields.filter(f => formData[f]);
    const baseCompletion = (filledFields.length / requiredFields.length) * 100;

    // Add bonus for optional fields
    let bonus = 0;
    if (formData.notes) bonus += 5;
    if (formData.purchase_date || formData.start_date) bonus += 5;

    return Math.min(100, Math.round(baseCompletion + bonus));
  }, [formData]);

  // Calculate maturity for fixed income
  const maturityCalculation = useMemo(() => {
    if (formData.category !== 'FIXED_INCOME') return null;
    if (!formData.principal || !formData.interest_rate) return null;

    const tenure = calculateTenureYears(formData.start_date, formData.maturity_date);
    if (tenure <= 0) return null;

    const defaults = FIXED_INCOME_DEFAULTS[formData.asset_type] || { compounding: 4 };
    return calculateMaturityValue(
      parseIndianNumber(formData.principal),
      formData.interest_rate,
      tenure,
      defaults.compounding
    );
  }, [formData.category, formData.principal, formData.interest_rate, formData.start_date, formData.maturity_date, formData.asset_type]);

  const handleCategorySelect = (category) => {
    setFormData(prev => ({
      ...prev,
      category,
      asset_type: '',
      name: '',
      symbol: '',
    }));
    setValidationErrors({});
    setTouched({});
    setDuplicateWarning(null);
  };

  const handleTypeSelect = (type) => {
    setFormData(prev => ({
      ...prev,
      asset_type: type,
      name: '',
      symbol: '',
    }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    // Clear validation error when user starts typing
    if (validationErrors[name]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  // Handle currency input with formatting
  const handleCurrencyChange = (e) => {
    const { name, value } = e.target;
    // Remove existing commas and non-numeric (except decimal)
    const rawValue = value.replace(/[^0-9.]/g, '');
    setFormData(prev => ({ ...prev, [name]: rawValue }));
  };

  // Format display value for currency inputs
  const getFormattedValue = (value) => {
    if (!value) return '';
    return formatIndianNumber(value);
  };

  const handleInstitutionChange = (e) => {
    const { value } = e.target;
    setFormData(prev => ({ ...prev, institution: value }));
    setShowInstitutionSuggestions(value.length > 0);
  };

  const selectInstitution = (inst) => {
    setFormData(prev => ({ ...prev, institution: inst }));
    setShowInstitutionSuggestions(false);
  };

  const filteredInstitutions = useMemo(() => {
    if (!formData.institution) return [];
    const search = formData.institution.toLowerCase();
    return savedInstitutions.filter(i => i.toLowerCase().includes(search)).slice(0, 5);
  }, [formData.institution, savedInstitutions]);

  const saveInstitution = (institution) => {
    if (!institution) return;
    const updated = [...new Set([institution, ...savedInstitutions])].slice(0, 20);
    setSavedInstitutions(updated);
    localStorage.setItem(INSTITUTIONS_KEY, JSON.stringify(updated));
  };

  const saveRecentCategory = (category, type) => {
    const key = `${category}:${type}`;
    const updated = [key, ...recentCategories.filter(c => c !== key)].slice(0, 3);
    setRecentCategories(updated);
    localStorage.setItem(RECENT_CATEGORIES_KEY, JSON.stringify(updated));
  };

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
  };

  const loadDraft = () => {
    const savedDraft = localStorage.getItem(DRAFT_KEY);
    if (savedDraft) {
      setFormData(JSON.parse(savedDraft));
    }
    setShowDraftModal(false);
  };

  const discardDraft = () => {
    clearDraft();
    setShowDraftModal(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!validateForm()) {
      toast.error('Please fill in all required fields');
      return;
    }

    setLoading(true);

    try {
      // Save institution for future suggestions
      if (formData.institution) {
        saveInstitution(formData.institution);
      }

      // Save recent category
      saveRecentCategory(formData.category, formData.asset_type);

      // Prepare data (parse formatted numbers)
      const preparedData = {
        ...formData,
        principal: parseIndianNumber(formData.principal),
        purchase_price: parseIndianNumber(formData.purchase_price),
        current_value: parseIndianNumber(formData.current_value),
        balance: parseIndianNumber(formData.balance),
        premium: parseIndianNumber(formData.premium),
        sum_assured: parseIndianNumber(formData.sum_assured),
        monthly_deposit: parseIndianNumber(formData.monthly_deposit),
      };

      if (formData.category === 'EQUITY') {
        const assetData = {
          category: preparedData.category,
          asset_type: preparedData.asset_type,
          name: preparedData.name,
          symbol: preparedData.symbol,
          exchange: preparedData.exchange,
          quantity: 0,
          avg_buy_price: 0,
          purchase_date: preparedData.purchase_date,
          notes: preparedData.notes,
        };

        const assetResponse = await assetService.create(assetData);
        const assetId = assetResponse.data.asset.id;

        if (preparedData.quantity && preparedData.price) {
          const { transactionService } = await import('../services/transactions');
          await transactionService.create({
            asset_id: assetId,
            type: preparedData.transaction_type,
            quantity: parseFloat(preparedData.quantity),
            price: parseFloat(preparedData.price),
            transaction_date: preparedData.purchase_date || new Date().toISOString().split('T')[0],
            notes: preparedData.notes,
          });
        }
      } else {
        await assetService.create(preparedData);
      }

      // Clear draft on success
      clearDraft();

      // Show success state instead of navigating
      setSuccessState({
        name: formData.name || 'Asset',
        category: formData.category,
        asset_type: formData.asset_type,
      });

      toast.success(`${formData.name || 'Asset'} added successfully`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add asset');
    } finally {
      setLoading(false);
    }
  };

  const handleAddAnother = (sameCategory = false) => {
    const newFormData = getInitialFormData();
    if (sameCategory && successState) {
      newFormData.category = successState.category;
      newFormData.asset_type = successState.asset_type;
    }
    setFormData(newFormData);
    setSuccessState(null);
    setValidationErrors({});
    setTouched({});
    setDuplicateWarning(null);
  };

  const getPreviewValue = () => {
    const { category, quantity, price, principal, purchase_price, current_value, balance } = formData;
    if (category === 'EQUITY' || category === 'CRYPTO') {
      return quantity && price ? parseFloat(quantity) * parseFloat(price) : 0;
    }
    if (category === 'FIXED_INCOME') return parseFloat(parseIndianNumber(principal)) || 0;
    if (category === 'SAVINGS') return parseFloat(parseIndianNumber(balance)) || 0;
    return parseFloat(parseIndianNumber(current_value)) || parseFloat(parseIndianNumber(purchase_price)) || 0;
  };

  const inputClass = (fieldName) => {
    const hasError = touched[fieldName] && validationErrors[fieldName];
    return `w-full px-4 py-3 bg-[var(--bg-primary)] border ${hasError ? 'border-[var(--system-red)]' : 'border-[var(--separator-opaque)]'} rounded-xl focus:outline-none focus:ring-2 ${hasError ? 'focus:ring-[var(--system-red)]/30 focus:border-[var(--system-red)]' : 'focus:ring-[var(--chart-primary)]/30 focus:border-[var(--chart-primary)]'} transition-all text-[var(--label-primary)] placeholder-[var(--label-tertiary)] text-[15px]`;
  };

  const selectClass = `w-full px-4 py-3 pr-10 bg-[var(--bg-primary)] border border-[var(--separator-opaque)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--chart-primary)]/30 focus:border-[var(--chart-primary)] transition-all text-[var(--label-primary)] text-[15px] appearance-none cursor-pointer bg-no-repeat bg-[right_12px_center] bg-[length:20px_20px] bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%238E8E93' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19.5 8.25l-7.5 7.5-7.5-7.5'/%3E%3C/svg%3E")]`;

  const labelClass = (fieldName, required = false) => {
    const hasError = touched[fieldName] && validationErrors[fieldName];
    return `block text-[13px] font-medium ${hasError ? 'text-[var(--system-red)]' : 'text-[var(--label-secondary)]'} mb-2${required ? " after:content-['*'] after:ml-0.5 after:text-[var(--system-red)]" : ''}`;
  };

  const selectedCategoryConfig = CATEGORY_CARDS.find(c => c.key === formData.category);
  const selectedType = ASSET_CONFIG[formData.category]?.types.find(t => t.value === formData.asset_type);
  const requiredFields = VALIDATION_RULES[formData.category] || [];

  // Parse recent categories for quick access
  const recentCategoryItems = useMemo(() => {
    return recentCategories.map(rc => {
      const [cat, type] = rc.split(':');
      const categoryConfig = CATEGORY_CARDS.find(c => c.key === cat);
      const typeConfig = ASSET_CONFIG[cat]?.types.find(t => t.value === type);
      return { category: cat, type, categoryConfig, typeConfig };
    }).filter(item => item.categoryConfig && item.typeConfig);
  }, [recentCategories]);

  // Success State View
  if (successState) {
    const successCategoryConfig = CATEGORY_CARDS.find(c => c.key === successState.category);
    return (
      <div className="h-full overflow-auto">
        <div className="max-w-2xl mx-auto p-4 md:px-8 md:py-12">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={spring.gentle}
          >
            <Card padding="p-0" className="overflow-hidden text-center">
              <div className={`p-8 bg-gradient-to-br ${successCategoryConfig?.gradient || 'from-green-500/15 to-green-600/5'}`}>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ ...spring.snappy, delay: 0.2 }}
                  className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--system-green)] flex items-center justify-center"
                >
                  <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </motion.div>
                <h2 className="text-[20px] font-bold text-[var(--label-primary)] mb-2">
                  Asset Added Successfully!
                </h2>
                <p className="text-[15px] text-[var(--label-secondary)]">
                  {successState.name} has been added to your portfolio
                </p>
              </div>

              <div className="p-6 space-y-3">
                <Button
                  variant="filled"
                  className="w-full"
                  onClick={() => handleAddAnother(true)}
                  icon={
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  }
                >
                  Add Another {ASSET_CONFIG[successState.category]?.types.find(t => t.value === successState.asset_type)?.label}
                </Button>

                <Button
                  variant="gray"
                  className="w-full"
                  onClick={() => handleAddAnother(false)}
                >
                  Add Different Asset
                </Button>

                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => navigate('/assets')}
                >
                  View All Assets
                </Button>
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    );
  }

  const renderCategoryFields = () => {
    const { category, asset_type } = formData;
    if (!category || !asset_type) return null;

    switch (category) {
      case 'EQUITY':
        return (
          <>
            {/* Transaction Type & Purchase Date Row */}
            <div className="grid grid-cols-2 gap-4 mb-5">
              {/* Transaction Type Toggle - iOS Segmented Control */}
              <div>
                <label className={labelClass('transaction_type')}>Transaction Type</label>
                <div className="flex p-1 bg-[var(--fill-tertiary)] rounded-xl h-[46px]">
                  {['BUY', 'SELL'].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, transaction_type: type }))}
                      className={`flex-1 rounded-lg text-[14px] font-semibold transition-all ${
                        formData.transaction_type === type
                          ? type === 'BUY'
                            ? 'bg-[var(--system-green)] text-white shadow-sm'
                            : 'bg-[var(--system-orange)] text-white shadow-sm'
                          : 'text-[var(--label-secondary)] hover:text-[var(--label-primary)]'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Purchase Date */}
              <div>
                <label className={labelClass('purchase_date')}>Purchase Date</label>
                <input
                  type="date"
                  name="purchase_date"
                  value={formData.purchase_date}
                  onChange={handleChange}
                  className={inputClass('purchase_date')}
                />
              </div>
            </div>

            {/* Asset Name with Autocomplete */}
            <div className="mb-5">
              <label className={labelClass('name', true)}>
                {asset_type === 'MUTUAL_FUND' ? 'Mutual Fund Name' : 'Stock Name'}
              </label>
              <StockAutocomplete
                value={formData.name}
                assetType={asset_type}
                onChange={(value) => setFormData(prev => ({ ...prev, name: value }))}
                onSelect={(item) => {
                  const cleanSymbol = item.symbol.replace(/\.(NS|BO)$/, '');
                  const exchange = item.symbol.endsWith('.NS') ? 'NSE' : item.symbol.endsWith('.BO') ? 'BSE' : item.exchange;
                  setFormData(prev => ({
                    ...prev,
                    name: item.name,
                    symbol: asset_type === 'MUTUAL_FUND' ? item.symbol : cleanSymbol,
                    exchange: exchange || prev.exchange
                  }));
                }}
                placeholder={asset_type === 'MUTUAL_FUND' ? 'Search mutual fund...' : 'Search stock...'}
              />
              {touched.name && validationErrors.name && (
                <p className="text-[12px] text-[var(--system-red)] mt-1">{validationErrors.name}</p>
              )}
            </div>

            {/* Duplicate Warning */}
            <AnimatePresence>
              {duplicateWarning && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-5"
                >
                  <div className="bg-[var(--system-orange)]/10 border border-[var(--system-orange)]/30 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-[var(--system-orange)] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div className="flex-1">
                        <p className="text-[14px] font-medium text-[var(--label-primary)]">{duplicateWarning.message}</p>
                        <p className="text-[13px] text-[var(--label-secondary)] mt-1">
                          Holdings: {duplicateWarning.asset.quantity} units @ {formatCurrency(duplicateWarning.asset.avg_buy_price)}
                        </p>
                        <button
                          type="button"
                          onClick={() => navigate(`/assets/${duplicateWarning.asset.id}`)}
                          className="text-[13px] text-[var(--chart-primary)] font-medium mt-2 hover:underline"
                        >
                          View existing asset →
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass('symbol', true)}>Symbol</label>
                <input
                  type="text"
                  name="symbol"
                  value={formData.symbol}
                  onChange={handleChange}
                  onBlur={() => handleBlur('symbol')}
                  placeholder={asset_type === 'MUTUAL_FUND' ? 'AMFI Code' : 'e.g., RELIANCE'}
                  className={inputClass('symbol')}
                />
                {touched.symbol && validationErrors.symbol && (
                  <p className="text-[12px] text-[var(--system-red)] mt-1">{validationErrors.symbol}</p>
                )}
              </div>
              {asset_type !== 'MUTUAL_FUND' && (
                <div>
                  <label className={labelClass('exchange')}>Exchange</label>
                  <select name="exchange" value={formData.exchange} onChange={handleChange} className={selectClass}>
                    <option value="NSE">NSE</option>
                    <option value="BSE">BSE</option>
                  </select>
                </div>
              )}
              <div>
                <label className={labelClass('quantity')}>Quantity</label>
                <input
                  type="number"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleChange}
                  onBlur={() => handleBlur('quantity')}
                  step="0.0001"
                  placeholder="0"
                  className={inputClass('quantity')}
                />
                {touched.quantity && validationErrors.quantity && (
                  <p className="text-[12px] text-[var(--system-red)] mt-1">{validationErrors.quantity}</p>
                )}
              </div>
              <div>
                <label className={labelClass('price')}>Price per Unit</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                  <input
                    type="text"
                    name="price"
                    value={getFormattedValue(formData.price)}
                    onChange={handleCurrencyChange}
                    onBlur={() => handleBlur('price')}
                    placeholder="0.00"
                    className={`${inputClass('price')} pl-8`}
                  />
                </div>
                {touched.price && validationErrors.price && (
                  <p className="text-[12px] text-[var(--system-red)] mt-1">{validationErrors.price}</p>
                )}
              </div>
            </div>
          </>
        );

      case 'FIXED_INCOME':
        const isNPS = asset_type === 'NPS';
        const isRD = asset_type === 'RD';
        const defaults = FIXED_INCOME_DEFAULTS[asset_type];
        return (
          <>
            <div className="mb-5">
              <label className={labelClass('name', true)}>{isNPS ? 'Investment Name' : isRD ? 'RD Name' : 'Deposit Name'}</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                onBlur={() => handleBlur('name')}
                placeholder={isNPS ? 'e.g., NPS Tier 1' : isRD ? 'e.g., SBI RD' : 'e.g., SBI FD 2024'}
                className={inputClass('name')}
                required
              />
              {touched.name && validationErrors.name && (
                <p className="text-[12px] text-[var(--system-red)] mt-1">{validationErrors.name}</p>
              )}
            </div>

            {/* Government Rate Reference */}
            {defaults?.rate && (
              <div className="mb-5 px-4 py-3 bg-[var(--chart-primary)]/5 border border-[var(--chart-primary)]/20 rounded-xl">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-[var(--chart-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-[13px] text-[var(--label-secondary)]">
                    Current {asset_type} rate: <span className="font-semibold text-[var(--chart-primary)]">{defaults.rate}% p.a.</span>
                    {defaults.tenure && ` • ${defaults.tenure} years tenure`}
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {isNPS && (
                <div>
                  <label className={labelClass('pran_number')}>PRAN Number</label>
                  <input type="text" name="pran_number" value={formData.pran_number} onChange={handleChange} placeholder="Enter PRAN" className={inputClass('pran_number')} />
                </div>
              )}
              <div className="relative">
                <label className={labelClass('institution')}>{isNPS ? 'Fund Manager' : 'Institution'}</label>
                <input
                  type="text"
                  name="institution"
                  value={formData.institution}
                  onChange={handleInstitutionChange}
                  onFocus={() => setShowInstitutionSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowInstitutionSuggestions(false), 200)}
                  placeholder={isNPS ? 'e.g., SBI, HDFC' : 'e.g., SBI, HDFC Bank'}
                  className={inputClass('institution')}
                  autoComplete="off"
                />
                {/* Institution Suggestions */}
                <AnimatePresence>
                  {showInstitutionSuggestions && filteredInstitutions.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute z-20 w-full mt-1 bg-[var(--bg-primary)] border border-[var(--separator-opaque)] rounded-xl shadow-lg overflow-hidden"
                    >
                      {filteredInstitutions.map((inst, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => selectInstitution(inst)}
                          className="w-full px-4 py-2 text-left text-[14px] text-[var(--label-primary)] hover:bg-[var(--fill-tertiary)] transition-colors"
                        >
                          {inst}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div>
                <label className={labelClass('principal', true)}>{isRD ? 'Monthly Deposit' : 'Principal Amount'}</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                  <input
                    type="text"
                    name={isRD ? 'monthly_deposit' : 'principal'}
                    value={getFormattedValue(isRD ? formData.monthly_deposit : formData.principal)}
                    onChange={handleCurrencyChange}
                    onBlur={() => handleBlur('principal')}
                    placeholder="0"
                    className={`${inputClass('principal')} pl-8`}
                  />
                </div>
                {touched.principal && validationErrors.principal && (
                  <p className="text-[12px] text-[var(--system-red)] mt-1">{validationErrors.principal}</p>
                )}
              </div>
              {!isNPS && (
                <div>
                  <label className={labelClass('interest_rate')}>Interest Rate (% p.a.)</label>
                  <input
                    type="number"
                    name="interest_rate"
                    value={formData.interest_rate}
                    onChange={handleChange}
                    onBlur={() => handleBlur('interest_rate')}
                    step="0.01"
                    placeholder={defaults?.rate ? defaults.rate.toString() : '0.00'}
                    className={inputClass('interest_rate')}
                  />
                  {touched.interest_rate && validationErrors.interest_rate && (
                    <p className="text-[12px] text-[var(--system-red)] mt-1">{validationErrors.interest_rate}</p>
                  )}
                </div>
              )}
              <div>
                <label className={labelClass('start_date')}>Start Date</label>
                <input type="date" name="start_date" value={formData.start_date} onChange={handleChange} className={inputClass('start_date')} />
              </div>
              {!isNPS && (
                <div>
                  <label className={labelClass('maturity_date')}>Maturity Date</label>
                  <input type="date" name="maturity_date" value={formData.maturity_date} onChange={handleChange} className={inputClass('maturity_date')} />
                </div>
              )}
            </div>

            {/* Maturity Calculator */}
            <AnimatePresence>
              {maturityCalculation && maturityCalculation.maturityValue > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-5"
                >
                  <div className="p-4 bg-[var(--system-green)]/5 border border-[var(--system-green)]/20 rounded-xl">
                    <p className="text-[12px] font-medium text-[var(--label-tertiary)] uppercase tracking-wide mb-3">Maturity Projection</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[12px] text-[var(--label-tertiary)]">Maturity Value</p>
                        <p className="text-[18px] font-bold text-[var(--system-green)]">{formatCurrency(maturityCalculation.maturityValue)}</p>
                      </div>
                      <div>
                        <p className="text-[12px] text-[var(--label-tertiary)]">Interest Earned</p>
                        <p className="text-[18px] font-bold text-[var(--chart-primary)]">{formatCurrency(maturityCalculation.interestEarned)}</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        );

      case 'REAL_ESTATE':
        return (
          <>
            <div className="mb-5">
              <label className={labelClass('name', true)}>Property Name</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                onBlur={() => handleBlur('name')}
                placeholder="e.g., Apartment in Mumbai"
                className={inputClass('name')}
                required
              />
              {touched.name && validationErrors.name && (
                <p className="text-[12px] text-[var(--system-red)] mt-1">{validationErrors.name}</p>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass('purchase_price')}>Purchase Price</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                  <input
                    type="text"
                    name="purchase_price"
                    value={getFormattedValue(formData.purchase_price)}
                    onChange={handleCurrencyChange}
                    placeholder="0"
                    className={`${inputClass('purchase_price')} pl-8`}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass('current_value')}>Current Value</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                  <input
                    type="text"
                    name="current_value"
                    value={getFormattedValue(formData.current_value)}
                    onChange={handleCurrencyChange}
                    placeholder="0"
                    className={`${inputClass('current_value')} pl-8`}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass('location')}>Location</label>
                <input type="text" name="location" value={formData.location} onChange={handleChange} placeholder="City, State" className={inputClass('location')} />
              </div>
              <div>
                <label className={labelClass('area_sqft')}>Area (sq.ft)</label>
                <input
                  type="text"
                  name="area_sqft"
                  value={getFormattedValue(formData.area_sqft)}
                  onChange={handleCurrencyChange}
                  placeholder="0"
                  className={inputClass('area_sqft')}
                />
              </div>
            </div>
          </>
        );

      case 'PHYSICAL':
        return (
          <>
            <div className="mb-5">
              <label className={labelClass('name', true)}>Asset Name</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                onBlur={() => handleBlur('name')}
                placeholder={`e.g., ${asset_type === 'GOLD' ? 'Gold Coins' : asset_type === 'SILVER' ? 'Silver Bars' : 'Car'}`}
                className={inputClass('name')}
                required
              />
              {touched.name && validationErrors.name && (
                <p className="text-[12px] text-[var(--system-red)] mt-1">{validationErrors.name}</p>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(asset_type === 'GOLD' || asset_type === 'SILVER') && (
                <>
                  <div>
                    <label className={labelClass('weight_grams')}>Weight (grams)</label>
                    <input type="number" name="weight_grams" value={formData.weight_grams} onChange={handleChange} step="0.01" placeholder="0.00" className={inputClass('weight_grams')} />
                  </div>
                  <div>
                    <label className={labelClass('purity')}>Purity</label>
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
                <label className={labelClass('purchase_price')}>Purchase Price</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                  <input
                    type="text"
                    name="purchase_price"
                    value={getFormattedValue(formData.purchase_price)}
                    onChange={handleCurrencyChange}
                    placeholder="0"
                    className={`${inputClass('purchase_price')} pl-8`}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass('current_value')}>Current Value</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                  <input
                    type="text"
                    name="current_value"
                    value={getFormattedValue(formData.current_value)}
                    onChange={handleCurrencyChange}
                    placeholder="0"
                    className={`${inputClass('current_value')} pl-8`}
                  />
                </div>
              </div>
            </div>
          </>
        );

      case 'SAVINGS':
        return (
          <>
            <div className="mb-5">
              <label className={labelClass('name', true)}>Account Name</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                onBlur={() => handleBlur('name')}
                placeholder="e.g., SBI Savings Account"
                className={inputClass('name')}
                required
              />
              {touched.name && validationErrors.name && (
                <p className="text-[12px] text-[var(--system-red)] mt-1">{validationErrors.name}</p>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass('balance')}>Current Balance</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                  <input
                    type="text"
                    name="balance"
                    value={getFormattedValue(formData.balance)}
                    onChange={handleCurrencyChange}
                    placeholder="0"
                    className={`${inputClass('balance')} pl-8`}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass('interest_rate')}>Interest Rate (% p.a.)</label>
                <input type="number" name="interest_rate" value={formData.interest_rate} onChange={handleChange} step="0.01" placeholder="0.00" className={inputClass('interest_rate')} />
              </div>
              <div className="md:col-span-2 relative">
                <label className={labelClass('institution')}>Bank/Institution</label>
                <input
                  type="text"
                  name="institution"
                  value={formData.institution}
                  onChange={handleInstitutionChange}
                  onFocus={() => setShowInstitutionSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowInstitutionSuggestions(false), 200)}
                  placeholder="e.g., SBI, HDFC Bank"
                  className={inputClass('institution')}
                  autoComplete="off"
                />
                {/* Institution Suggestions */}
                <AnimatePresence>
                  {showInstitutionSuggestions && filteredInstitutions.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute z-20 w-full mt-1 bg-[var(--bg-primary)] border border-[var(--separator-opaque)] rounded-xl shadow-lg overflow-hidden"
                    >
                      {filteredInstitutions.map((inst, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => selectInstitution(inst)}
                          className="w-full px-4 py-2 text-left text-[14px] text-[var(--label-primary)] hover:bg-[var(--fill-tertiary)] transition-colors"
                        >
                          {inst}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </>
        );

      case 'CRYPTO':
        return (
          <>
            <div className="mb-5">
              <label className={labelClass('name', true)}>Cryptocurrency Name</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                onBlur={() => handleBlur('name')}
                placeholder="e.g., Bitcoin"
                className={inputClass('name')}
                required
              />
              {touched.name && validationErrors.name && (
                <p className="text-[12px] text-[var(--system-red)] mt-1">{validationErrors.name}</p>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass('symbol')}>Symbol</label>
                <input type="text" name="symbol" value={formData.symbol} onChange={handleChange} placeholder="e.g., BTC, ETH" className={inputClass('symbol')} />
              </div>
              <div>
                <label className={labelClass('institution')}>Exchange/Wallet</label>
                <input type="text" name="institution" value={formData.institution} onChange={handleChange} placeholder="e.g., WazirX, Binance" className={inputClass('institution')} />
              </div>
              <div>
                <label className={labelClass('quantity')}>Quantity</label>
                <input type="number" name="quantity" value={formData.quantity} onChange={handleChange} step="0.00000001" placeholder="0.00000000" className={inputClass('quantity')} />
              </div>
              <div>
                <label className={labelClass('price')}>Avg Buy Price</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                  <input
                    type="text"
                    name="price"
                    value={getFormattedValue(formData.price)}
                    onChange={handleCurrencyChange}
                    placeholder="0.00"
                    className={`${inputClass('price')} pl-8`}
                  />
                </div>
              </div>
            </div>
          </>
        );

      case 'INSURANCE':
        return (
          <>
            <div className="mb-5">
              <label className={labelClass('name', true)}>Policy Name</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                onBlur={() => handleBlur('name')}
                placeholder="e.g., LIC Jeevan Anand"
                className={inputClass('name')}
                required
              />
              {touched.name && validationErrors.name && (
                <p className="text-[12px] text-[var(--system-red)] mt-1">{validationErrors.name}</p>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass('policy_number')}>Policy Number</label>
                <input type="text" name="policy_number" value={formData.policy_number} onChange={handleChange} placeholder="Policy number" className={inputClass('policy_number')} />
              </div>
              <div className="relative">
                <label className={labelClass('institution')}>Institution</label>
                <input
                  type="text"
                  name="institution"
                  value={formData.institution}
                  onChange={handleInstitutionChange}
                  onFocus={() => setShowInstitutionSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowInstitutionSuggestions(false), 200)}
                  placeholder="e.g., LIC, ICICI Prudential"
                  className={inputClass('institution')}
                  autoComplete="off"
                />
              </div>
              <div>
                <label className={labelClass('premium')}>Premium/year</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                  <input
                    type="text"
                    name="premium"
                    value={getFormattedValue(formData.premium)}
                    onChange={handleCurrencyChange}
                    placeholder="0"
                    className={`${inputClass('premium')} pl-8`}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass('sum_assured')}>Sum Assured</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                  <input
                    type="text"
                    name="sum_assured"
                    value={getFormattedValue(formData.sum_assured)}
                    onChange={handleCurrencyChange}
                    placeholder="0"
                    className={`${inputClass('sum_assured')} pl-8`}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass('current_value')}>Current Value</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                  <input
                    type="text"
                    name="current_value"
                    value={getFormattedValue(formData.current_value)}
                    onChange={handleCurrencyChange}
                    placeholder="For ULIP/endowment"
                    className={`${inputClass('current_value')} pl-8`}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass('maturity_date')}>Maturity Date</label>
                <input type="date" name="maturity_date" value={formData.maturity_date} onChange={handleChange} className={inputClass('maturity_date')} />
              </div>
            </div>
          </>
        );

      case 'OTHER':
        return (
          <>
            <div className="mb-5">
              <label className={labelClass('name', true)}>Asset Name</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                onBlur={() => handleBlur('name')}
                placeholder="Enter asset name"
                className={inputClass('name')}
                required
              />
              {touched.name && validationErrors.name && (
                <p className="text-[12px] text-[var(--system-red)] mt-1">{validationErrors.name}</p>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass('current_value')}>Current Value</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                  <input
                    type="text"
                    name="current_value"
                    value={getFormattedValue(formData.current_value)}
                    onChange={handleCurrencyChange}
                    placeholder="0"
                    className={`${inputClass('current_value')} pl-8`}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass('purchase_price')}>Purchase Price</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                  <input
                    type="text"
                    name="purchase_price"
                    value={getFormattedValue(formData.purchase_price)}
                    onChange={handleCurrencyChange}
                    placeholder="0"
                    className={`${inputClass('purchase_price')} pl-8`}
                  />
                </div>
              </div>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="h-full overflow-auto">
      {/* Draft Recovery Modal */}
      <AnimatePresence>
        {showDraftModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-[var(--bg-primary)] rounded-2xl p-6 max-w-md w-full shadow-xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[var(--chart-primary)]/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-[var(--chart-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-[16px] font-semibold text-[var(--label-primary)]">Continue where you left off?</h3>
                  <p className="text-[13px] text-[var(--label-tertiary)]">You have an unsaved draft</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="gray" className="flex-1" onClick={discardDraft}>
                  Start Fresh
                </Button>
                <Button variant="filled" className="flex-1" onClick={loadDraft}>
                  Continue
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-6xl mx-auto p-4 md:px-8 md:py-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.gentle}
          className="mb-6"
        >
          <Link to="/assets" className="inline-flex items-center gap-1.5 text-[13px] text-[var(--label-tertiary)] hover:text-[var(--chart-primary)] mb-4 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Assets
          </Link>
          <h1 className="text-[24px] font-bold text-[var(--label-primary)]">Add New Asset</h1>
          <p className="text-[14px] text-[var(--label-secondary)] mt-1">Choose a category and fill in the details</p>
        </motion.div>

        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
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
          {/* Left Column - Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Recent Categories Quick Access */}
            {recentCategoryItems.length > 0 && !formData.category && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={spring.gentle}
              >
                <p className="text-[12px] font-medium text-[var(--label-tertiary)] uppercase tracking-wide mb-2">Recent</p>
                <div className="flex flex-wrap gap-2">
                  {recentCategoryItems.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          category: item.category,
                          asset_type: item.type,
                        }));
                      }}
                      className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-primary)] border border-[var(--separator-opaque)] rounded-xl hover:bg-[var(--fill-tertiary)] transition-colors"
                    >
                      <div className={`w-6 h-6 rounded-lg ${item.categoryConfig?.iconBg} flex items-center justify-center`}>
                        <span className="text-white text-sm">
                          <CategoryIcon category={item.category} />
                        </span>
                      </div>
                      <span className="text-[13px] font-medium text-[var(--label-primary)]">{item.typeConfig?.label}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Category Selection Grid */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.gentle, delay: 0.05 }}
            >
              <Card padding="p-0" className="overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--separator-opaque)]">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[var(--chart-primary)] flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-[15px] font-semibold text-[var(--label-primary)]">Select Category</h2>
                      <p className="text-[12px] text-[var(--label-tertiary)]">What type of asset are you adding?</p>
                    </div>
                  </div>
                </div>

                <div className="p-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {CATEGORY_CARDS.map((cat, index) => (
                      <motion.button
                        key={cat.key}
                        type="button"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.03 }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleCategorySelect(cat.key)}
                        className={`relative p-4 rounded-xl text-left transition-all ${
                          formData.category === cat.key
                            ? `bg-gradient-to-br ${cat.gradient} ring-2 ring-[var(--chart-primary)] shadow-sm`
                            : 'bg-[var(--fill-tertiary)] hover:bg-[var(--fill-secondary)]'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl ${cat.iconBg} flex items-center justify-center mb-3 shadow-sm`}>
                          <span className="text-white">
                            <CategoryIcon category={cat.key} />
                          </span>
                        </div>
                        <p className="text-[14px] font-semibold text-[var(--label-primary)] mb-0.5">{cat.label}</p>
                        <p className="text-[11px] text-[var(--label-tertiary)] leading-tight">{cat.description}</p>

                        {formData.category === cat.key && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[var(--chart-primary)] flex items-center justify-center"
                          >
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </motion.div>
                        )}
                      </motion.button>
                    ))}
                  </div>
                </div>
              </Card>
            </motion.div>

            {/* Type Selection Chips */}
            <AnimatePresence mode="wait">
              {formData.category && ASSET_CONFIG[formData.category]?.types.length > 0 && (
                <motion.div
                  key="type-section"
                  initial={{ opacity: 0, y: 20, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -10, height: 0 }}
                  transition={spring.gentle}
                >
                  <Card padding="p-0" className="overflow-hidden">
                    <div className={`px-5 py-4 border-b border-[var(--separator-opaque)] bg-gradient-to-r ${selectedCategoryConfig?.gradient || 'from-gray-500/10 to-transparent'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg ${selectedCategoryConfig?.iconBg || 'bg-gray-500'} flex items-center justify-center shadow-sm`}>
                          <span className="text-white">
                            <CategoryIcon category={formData.category} />
                          </span>
                        </div>
                        <div>
                          <h2 className="text-[15px] font-semibold text-[var(--label-primary)]">Select Type</h2>
                          <p className="text-[12px] text-[var(--label-tertiary)]">Choose the specific asset type</p>
                        </div>
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="flex flex-wrap gap-2">
                        {ASSET_CONFIG[formData.category].types.map((type, index) => (
                          <motion.button
                            key={type.value}
                            type="button"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.05 }}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => handleTypeSelect(type.value)}
                            className={`px-4 py-2.5 rounded-xl text-[14px] font-medium transition-all ${
                              formData.asset_type === type.value
                                ? `${selectedCategoryConfig?.iconBg || 'bg-[var(--chart-primary)]'} text-white shadow-sm`
                                : 'bg-[var(--fill-tertiary)] text-[var(--label-primary)] hover:bg-[var(--fill-secondary)]'
                            }`}
                          >
                            {type.label}
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Form Section */}
            <AnimatePresence mode="wait">
              {formData.category && formData.asset_type && (
                <motion.div
                  key="form-section"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={spring.gentle}
                >
                  <form onSubmit={handleSubmit}>
                    <Card padding="p-0" className="overflow-hidden">
                      {/* Form Header */}
                      <div className={`px-5 py-4 border-b border-[var(--separator-opaque)] bg-gradient-to-r ${selectedCategoryConfig?.gradient || 'from-gray-500/10 to-transparent'}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg ${selectedCategoryConfig?.iconBg || 'bg-gray-500'} flex items-center justify-center shadow-sm`}>
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </div>
                          <div>
                            <h2 className="text-[15px] font-semibold text-[var(--label-primary)]">Asset Details</h2>
                            <p className="text-[12px] text-[var(--label-tertiary)]">
                              {selectedType?.label} • {ASSET_CONFIG[formData.category]?.label}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Form Fields */}
                      <div className="p-5">
                        {renderCategoryFields()}

                        {/* Common Fields */}
                        <div className="mt-6 pt-5 border-t border-[var(--separator-opaque)]">
                          {formData.category !== 'FIXED_INCOME' && formData.category !== 'EQUITY' && (
                            <div className="mb-4">
                              <label className={labelClass('purchase_date')}>Purchase Date</label>
                              <input
                                type="date"
                                name="purchase_date"
                                value={formData.purchase_date}
                                onChange={handleChange}
                                className={`${inputClass('purchase_date')} max-w-[200px]`}
                              />
                            </div>
                          )}
                          <div>
                            <label className={labelClass('notes')}>Notes (optional)</label>
                            <textarea
                              name="notes"
                              value={formData.notes}
                              onChange={handleChange}
                              rows={2}
                              placeholder="Add any additional notes..."
                              className={`${inputClass('notes')} resize-none`}
                            />
                          </div>
                        </div>

                        {/* Submit Buttons */}
                        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-[var(--separator-opaque)]">
                          <Button variant="gray" type="button" onClick={() => navigate('/assets')}>
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
                            {formData.category === 'EQUITY' ? `Record ${formData.transaction_type}` : 'Add Asset'}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right Column - Preview Card */}
          <div className="lg:col-span-1">
            <div className="sticky top-6">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...spring.gentle, delay: 0.1 }}
              >
                <Card padding="p-0" className="overflow-hidden" glow>
                  {/* Preview Header */}
                  <div className={`p-5 bg-gradient-to-br ${
                    formData.category
                      ? `${selectedCategoryConfig?.gradient || 'from-gray-500/15 to-gray-600/5'}`
                      : 'from-[var(--chart-primary)]/10 via-[var(--chart-primary)]/5 to-transparent'
                  }`}>
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
                  {formData.category && formData.asset_type && (
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
                  )}

                  {/* Preview Details */}
                  <div className="p-5 space-y-4">
                    {/* Asset Icon + Type */}
                    <div className="flex items-center gap-3 pb-4 border-b border-[var(--separator-opaque)]">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                          formData.category ? selectedCategoryConfig?.iconBg : 'bg-[var(--fill-tertiary)]'
                        }`}
                      >
                        {formData.category ? (
                          <span className="text-white">
                            <CategoryIcon category={formData.category} />
                          </span>
                        ) : (
                          <svg className="w-6 h-6 text-[var(--label-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold text-[var(--label-primary)] truncate">
                          {selectedType?.label || 'Select type'}
                        </p>
                        <p className="text-[13px] text-[var(--label-tertiary)]">
                          {formData.category ? ASSET_CONFIG[formData.category]?.label : 'Category'}
                        </p>
                      </div>
                    </div>

                    {/* Details List */}
                    <div className="space-y-3">
                      {formData.category === 'EQUITY' && (
                        <div className="flex justify-between items-center">
                          <span className="text-[13px] text-[var(--label-tertiary)]">Transaction</span>
                          <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-lg ${
                            formData.transaction_type === 'BUY'
                              ? 'bg-[var(--system-green)]/15 text-[var(--system-green)]'
                              : 'bg-[var(--system-orange)]/15 text-[var(--system-orange)]'
                          }`}>
                            {formData.transaction_type}
                          </span>
                        </div>
                      )}

                      {formData.symbol && (
                        <div className="flex justify-between items-center">
                          <span className="text-[13px] text-[var(--label-tertiary)]">Symbol</span>
                          <span className="text-[13px] font-semibold text-[var(--label-primary)] bg-[var(--fill-tertiary)] px-2 py-0.5 rounded-md">{formData.symbol}</span>
                        </div>
                      )}

                      {formData.quantity && (
                        <div className="flex justify-between items-center">
                          <span className="text-[13px] text-[var(--label-tertiary)]">Quantity</span>
                          <span className="text-[13px] font-medium text-[var(--label-primary)]">{formData.quantity}</span>
                        </div>
                      )}

                      {formData.price && (
                        <div className="flex justify-between items-center">
                          <span className="text-[13px] text-[var(--label-tertiary)]">Price</span>
                          <span className="text-[13px] font-medium text-[var(--label-primary)]">{formatCurrency(parseFloat(formData.price))}</span>
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
                          <span className="text-[13px] font-semibold text-[var(--system-green)]">{formData.interest_rate}% p.a.</span>
                        </div>
                      )}

                      {/* Maturity Preview for Fixed Income */}
                      {maturityCalculation && maturityCalculation.maturityValue > 0 && (
                        <div className="pt-3 mt-3 border-t border-[var(--separator-opaque)]">
                          <div className="flex justify-between items-center">
                            <span className="text-[13px] text-[var(--label-tertiary)]">Est. Maturity</span>
                            <span className="text-[13px] font-bold text-[var(--system-green)]">{formatCurrency(maturityCalculation.maturityValue)}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Empty State Hint */}
                    {!formData.category && (
                      <div className="text-center py-4">
                        <p className="text-[13px] text-[var(--label-tertiary)]">
                          Select a category to get started
                        </p>
                      </div>
                    )}

                    {formData.category && !formData.asset_type && (
                      <div className="text-center py-4">
                        <p className="text-[13px] text-[var(--label-tertiary)]">
                          Now select the asset type
                        </p>
                      </div>
                    )}

                    {/* Auto-save indicator */}
                    {formData.category && formData.asset_type && (
                      <div className="pt-3 mt-3 border-t border-[var(--separator-opaque)]">
                        <div className="flex items-center gap-2 text-[12px] text-[var(--label-quaternary)]">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Draft auto-saved</span>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
