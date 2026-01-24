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
import { metalService, calculateGoldValue, getPriceForPurity, formatPriceAge, PURITY_FACTORS } from '../services/metals';

// Local storage keys
const DRAFT_KEY = 'wealth_tracker_add_asset_draft';
const INSTITUTIONS_KEY = 'wealth_tracker_institutions';
const GOALS_KEY = 'wealth_tracker_goals';
const TAGS_KEY = 'wealth_tracker_tags';

// Step configuration
const STEPS = [
  { id: 1, label: 'Category', description: 'Choose asset type' },
  { id: 2, label: 'Type', description: 'Select specific type' },
  { id: 3, label: 'Details', description: 'Add to portfolio' },
];

// Predefined tags
const DEFAULT_TAGS = [
  { id: 'tax-saver', label: 'Tax Saver', color: 'emerald' },
  { id: 'high-risk', label: 'High Risk', color: 'red' },
  { id: 'low-risk', label: 'Low Risk', color: 'blue' },
  { id: 'emergency', label: 'Emergency Fund', color: 'amber' },
  { id: 'retirement', label: 'Retirement', color: 'purple' },
  { id: 'short-term', label: 'Short Term', color: 'teal' },
  { id: 'long-term', label: 'Long Term', color: 'indigo' },
];

// Predefined goals with SVG icons
const DEFAULT_GOALS = [
  { id: 'retirement', label: 'Retirement', color: 'bg-[#F59E0B]' },
  { id: 'house', label: 'Buy House', color: 'bg-[#22C55E]' },
  { id: 'education', label: 'Education', color: 'bg-[#6366F1]' },
  { id: 'emergency', label: 'Emergency', color: 'bg-[#EF4444]' },
  { id: 'vacation', label: 'Vacation', color: 'bg-[#06B6D4]' },
  { id: 'car', label: 'Buy Car', color: 'bg-[#8B5CF6]' },
  { id: 'wedding', label: 'Wedding', color: 'bg-[#EC4899]' },
  { id: 'other', label: 'Other', color: 'bg-[#6B7280]' },
];

// Goal Icon component
const GoalIcon = ({ goalId, className = "w-5 h-5" }) => {
  const icons = {
    retirement: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
      </svg>
    ),
    house: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
    education: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
      </svg>
    ),
    emergency: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    vacation: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
      </svg>
    ),
    car: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
    ),
    wedding: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
      </svg>
    ),
    other: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
      </svg>
    ),
  };
  return icons[goalId] || icons.other;
};

// Quick amount presets (in INR)
const AMOUNT_PRESETS = [
  { label: '+10K', value: 10000 },
  { label: '+50K', value: 50000 },
  { label: '+1L', value: 100000 },
  { label: '+5L', value: 500000 },
  { label: '+10L', value: 1000000 },
];

// Date presets
const DATE_PRESETS = [
  { label: 'Today', getValue: () => new Date().toISOString().split('T')[0] },
  { label: 'Start of FY', getValue: () => {
    const now = new Date();
    const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${year}-04-01`;
  }},
  { label: '1 Year Ago', getValue: () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split('T')[0];
  }},
];

// Institution suggestions by category
const INSTITUTION_SUGGESTIONS = {
  FIXED_INCOME: {
    PPF: ['SBI', 'Post Office', 'ICICI Bank', 'HDFC Bank', 'Axis Bank'],
    EPF: ['EPFO'],
    VPF: ['EPFO'],
    NPS: ['SBI Pension', 'HDFC Pension', 'ICICI Prudential', 'UTI Retirement'],
    FD: ['SBI', 'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Kotak Bank'],
    RD: ['SBI', 'Post Office', 'HDFC Bank', 'ICICI Bank'],
    NSC: ['Post Office'],
    KVP: ['Post Office'],
    BONDS: ['RBI', 'NHAI', 'REC', 'PFC', 'IRFC'],
  },
  SAVINGS: ['SBI', 'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Kotak Bank', 'Yes Bank'],
  INSURANCE: ['LIC', 'HDFC Life', 'ICICI Prudential', 'SBI Life', 'Max Life', 'Bajaj Allianz'],
  CRYPTO: ['WazirX', 'CoinDCX', 'Binance', 'Coinbase', 'ZebPay'],
};

// Minimum investment amounts
const MIN_INVESTMENTS = {
  PPF: { amount: 500, period: 'year', message: 'Min ₹500/year, Max ₹1.5L/year' },
  NPS: { amount: 1000, period: 'year', message: 'Min ₹1,000/year' },
  NSC: { amount: 1000, period: 'once', message: 'Min ₹1,000' },
  ELSS: { amount: 500, period: 'month', message: 'Min ₹500 SIP' },
};

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
  start_date: new Date().toISOString().split('T')[0],
  maturity_date: '',
  institution: '',
  purchase_price: '',
  current_value: '',
  location: '',
  area_sqft: '',
  appreciation_rate: '',
  balance: '',
  weight_grams: '',
  purity: '22K',
  premium: '',
  sum_assured: '',
  policy_number: '',
  purchase_date: new Date().toISOString().split('T')[0],
  notes: '',
  tenure_months: '',
  monthly_deposit: '',
  pran_number: '',
  // New fields
  tags: [],
  goal: '',
  is_sip: false,
  sip_amount: '',
  sip_date: '1', // Day of month
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
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [successState, setSuccessState] = useState(null);
  const [quickEntryMode, setQuickEntryMode] = useState(false);
  const [currentLivePrice, setCurrentLivePrice] = useState(null);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [showDatePresets, setShowDatePresets] = useState({});
  const [portfolioTotal, setPortfolioTotal] = useState(0);
  const [assetsLoading, setAssetsLoading] = useState(true);
  // Metal price state
  const [metalPrice, setMetalPrice] = useState(null);
  const [metalPriceLoading, setMetalPriceLoading] = useState(false);
  const [metalPriceError, setMetalPriceError] = useState(null);
  const [isValueOverridden, setIsValueOverridden] = useState(false);

  // Load saved data on mount
  useEffect(() => {
    // Load existing assets for duplicate detection and portfolio total
    const loadExistingAssets = async () => {
      setAssetsLoading(true);
      try {
        const response = await assetService.getAll();
        const assets = response.data.assets || [];
        setExistingAssets(assets);
        // Calculate portfolio total
        const total = assets.reduce((sum, a) => sum + (parseFloat(a.current_value) || 0), 0);
        setPortfolioTotal(total);
      } catch (err) {
        console.error('Failed to load existing assets:', err);
      } finally {
        setAssetsLoading(false);
      }
    };
    loadExistingAssets();

    // Load saved institutions from localStorage
    const savedInst = localStorage.getItem(INSTITUTIONS_KEY);
    if (savedInst) {
      setSavedInstitutions(JSON.parse(savedInst));
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

  // Fetch metal price when GOLD or SILVER is selected
  useEffect(() => {
    if (formData.category === 'PHYSICAL' && (formData.asset_type === 'GOLD' || formData.asset_type === 'SILVER')) {
      const metal = formData.asset_type.toLowerCase();
      setMetalPriceLoading(true);
      setMetalPriceError(null);

      metalService.getPrice(metal)
        .then(response => {
          setMetalPrice(response.data);
          setMetalPriceLoading(false);
        })
        .catch(error => {
          console.error('Failed to fetch metal price:', error);
          setMetalPriceError(error.response?.data?.error || 'Failed to fetch price');
          setMetalPriceLoading(false);
        });
    } else {
      setMetalPrice(null);
      setIsValueOverridden(false);
    }
  }, [formData.category, formData.asset_type]);

  // Auto-calculate current value when weight/purity changes (for gold/silver)
  useEffect(() => {
    if (
      formData.category === 'PHYSICAL' &&
      (formData.asset_type === 'GOLD' || formData.asset_type === 'SILVER') &&
      metalPrice?.pricePerGram24K &&
      formData.weight_grams &&
      formData.purity &&
      !isValueOverridden
    ) {
      const calculatedValue = calculateGoldValue(
        parseFloat(formData.weight_grams),
        formData.purity,
        metalPrice.pricePerGram24K
      );
      if (calculatedValue > 0) {
        setFormData(prev => ({ ...prev, current_value: calculatedValue.toString() }));
      }
    }
  }, [formData.weight_grams, formData.purity, metalPrice, formData.category, formData.asset_type, isValueOverridden]);

  // Handle manual override of current value
  const handleCurrentValueChange = (e) => {
    handleCurrencyChange(e);
    setIsValueOverridden(true);
  };

  // Reset to calculated value
  const resetToCalculatedValue = () => {
    if (metalPrice?.pricePerGram24K && formData.weight_grams && formData.purity) {
      const calculatedValue = calculateGoldValue(
        parseFloat(formData.weight_grams),
        formData.purity,
        metalPrice.pricePerGram24K
      );
      setFormData(prev => ({ ...prev, current_value: calculatedValue.toString() }));
      setIsValueOverridden(false);
    }
  };

  // Force refresh metal price
  const handleRefreshMetalPrice = async () => {
    if (!formData.asset_type) return;
    const metal = formData.asset_type.toLowerCase();
    setMetalPriceLoading(true);
    setMetalPriceError(null);

    try {
      const response = await metalService.refreshPrice(metal);
      setMetalPrice(response.data);
      setIsValueOverridden(false); // Recalculate with new price
      toast.success('Price refreshed successfully');
    } catch (error) {
      console.error('Failed to refresh price:', error);
      setMetalPriceError(error.response?.data?.error || 'Failed to refresh price');
      toast.error(error.response?.data?.error || 'Failed to refresh price');
    } finally {
      setMetalPriceLoading(false);
    }
  };

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

  // Calculate current step
  const currentStep = useMemo(() => {
    if (formData.category && formData.asset_type) return 3;
    if (formData.category) return 2;
    return 1;
  }, [formData.category, formData.asset_type]);

  // Calculate portfolio impact
  const portfolioImpact = useMemo(() => {
    const newValue = getPreviewValue();
    if (!newValue || !portfolioTotal) return null;
    const newTotal = portfolioTotal + newValue;
    const percentage = ((newValue / newTotal) * 100).toFixed(1);
    return { newTotal, percentage, currentTotal: portfolioTotal };
  }, [portfolioTotal, formData]);

  // Get institution suggestions based on category/type
  const institutionSuggestions = useMemo(() => {
    if (formData.category === 'FIXED_INCOME' && formData.asset_type) {
      return INSTITUTION_SUGGESTIONS.FIXED_INCOME[formData.asset_type] || [];
    }
    return INSTITUTION_SUGGESTIONS[formData.category] || [];
  }, [formData.category, formData.asset_type]);

  // Helper to get preview value (moved up for use in portfolioImpact)
  function getPreviewValue() {
    const { category, quantity, price, principal, purchase_price, current_value, balance } = formData;
    if (category === 'EQUITY' || category === 'CRYPTO') {
      return quantity && price ? parseFloat(quantity) * parseFloat(price) : 0;
    }
    if (category === 'FIXED_INCOME') return parseFloat(parseIndianNumber(principal)) || 0;
    if (category === 'SAVINGS') return parseFloat(parseIndianNumber(balance)) || 0;
    return parseFloat(parseIndianNumber(current_value)) || parseFloat(parseIndianNumber(purchase_price)) || 0;
  }

  // Handle adding quick amount to a field
  const handleQuickAmount = (fieldName, amount) => {
    const currentValue = parseFloat(parseIndianNumber(formData[fieldName])) || 0;
    const newValue = currentValue + amount;
    setFormData(prev => ({ ...prev, [fieldName]: newValue.toString() }));
  };

  // Handle date preset selection
  const handleDatePreset = (fieldName, getValue) => {
    setFormData(prev => ({ ...prev, [fieldName]: getValue() }));
    setShowDatePresets(prev => ({ ...prev, [fieldName]: false }));
  };

  // Toggle tag selection
  const toggleTag = (tagId) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.includes(tagId)
        ? prev.tags.filter(t => t !== tagId)
        : [...prev.tags, tagId]
    }));
  };

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

      // Calculate appreciated value and rate for Real Estate based on mode
      let calculatedCurrentValue = parseIndianNumber(formData.current_value);
      let calculatedAppreciationRate = formData.appreciation_rate ? parseFloat(formData.appreciation_rate) : null;

      if (formData.category === 'REAL_ESTATE' && formData.purchase_price && formData.purchase_date) {
        const purchasePrice = parseIndianNumber(formData.purchase_price);
        const purchaseDate = new Date(formData.purchase_date);
        const today = new Date();
        const years = (today - purchaseDate) / (365.25 * 24 * 60 * 60 * 1000);
        const calcMode = formData.real_estate_calc_mode || 'rate';

        if (calcMode === 'rate' && formData.appreciation_rate) {
          // Mode: Enter rate → Calculate value
          const rate = parseFloat(formData.appreciation_rate) / 100;
          calculatedCurrentValue = Math.round(purchasePrice * Math.pow(1 + rate, Math.max(0, years)));
        } else if (calcMode === 'value' && formData.current_value) {
          // Mode: Enter value → Calculate rate
          const currentValue = parseIndianNumber(formData.current_value);
          calculatedCurrentValue = currentValue;
          if (years > 0 && purchasePrice > 0) {
            calculatedAppreciationRate = Math.round((Math.pow(currentValue / purchasePrice, 1 / years) - 1) * 1000) / 10;
          }
        }
      }

      // Prepare data (parse formatted numbers)
      const preparedData = {
        ...formData,
        principal: parseIndianNumber(formData.principal),
        purchase_price: parseIndianNumber(formData.purchase_price),
        current_value: calculatedCurrentValue,
        balance: parseIndianNumber(formData.balance),
        premium: parseIndianNumber(formData.premium),
        sum_assured: parseIndianNumber(formData.sum_assured),
        monthly_deposit: parseIndianNumber(formData.monthly_deposit),
        appreciation_rate: calculatedAppreciationRate,
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
        value: getPreviewValue(),
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

  // Success State View
  if (successState) {
    const successCategoryConfig = CATEGORY_CARDS.find(c => c.key === successState.category);
    const successTypeConfig = ASSET_CONFIG[successState.category]?.types.find(t => t.value === successState.asset_type);
    const addedValue = successState.value || 0;

    return (
      <div className="h-full overflow-auto">
        <div className="max-w-md mx-auto p-4 md:px-8 md:py-12">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={spring.gentle}
          >
            <Card padding="p-0" className="overflow-hidden">
              {/* Success Header */}
              <div className="p-8 text-center">
                {/* Animated Success Icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ ...spring.snappy, delay: 0.1 }}
                  className="relative w-20 h-20 mx-auto mb-5"
                >
                  {/* Category Icon Background */}
                  <div className={`w-20 h-20 rounded-2xl ${successCategoryConfig?.iconBg || 'bg-[var(--system-green)]'} flex items-center justify-center shadow-lg`}>
                    <span className="text-white">
                      <CategoryIcon category={successState.category} className="w-10 h-10" />
                    </span>
                  </div>
                  {/* Success Badge */}
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ ...spring.snappy, delay: 0.3 }}
                    className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[var(--system-green)] flex items-center justify-center shadow-md border-2 border-[var(--bg-primary)]"
                  >
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </motion.div>
                </motion.div>

                {/* Value Added */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <p className="text-[13px] font-medium text-[var(--system-green)] uppercase tracking-wide mb-1">Added to Portfolio</p>
                  <h2 className="text-[32px] font-bold text-[var(--label-primary)] tracking-tight">
                    {formatCurrency(addedValue)}
                  </h2>
                </motion.div>
              </div>

              {/* Asset Summary Card */}
              <div className="mx-6 mb-6">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="bg-[var(--fill-tertiary)] rounded-xl p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl ${successCategoryConfig?.iconBg || 'bg-[var(--label-tertiary)]'} flex items-center justify-center shrink-0`}>
                      <span className="text-white">
                        <CategoryIcon category={successState.category} className="w-6 h-6" />
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold text-[var(--label-primary)] truncate">
                        {successState.name}
                      </p>
                      <p className="text-[13px] text-[var(--label-tertiary)]">
                        {successTypeConfig?.label} • {successCategoryConfig?.label}
                      </p>
                    </div>
                    {successState.symbol && (
                      <span className="px-2.5 py-1 bg-[var(--bg-primary)] rounded-lg text-[12px] font-semibold text-[var(--label-secondary)]">
                        {successState.symbol}
                      </span>
                    )}
                  </div>
                </motion.div>
              </div>

              {/* Action Buttons */}
              <div className="px-6 pb-6 space-y-3">
                <Button
                  variant="filled"
                  className="w-full !bg-[var(--chart-primary)]"
                  onClick={() => handleAddAnother(true)}
                  icon={
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  }
                >
                  Add Another {successTypeConfig?.label}
                </Button>

                <Button
                  variant="gray"
                  className="w-full"
                  onClick={() => handleAddAnother(false)}
                >
                  Add Different Asset
                </Button>

                <button
                  type="button"
                  onClick={() => navigate('/assets')}
                  className="w-full py-2.5 text-[14px] font-medium text-[var(--chart-primary)] hover:text-[var(--chart-primary)]/80 transition-colors"
                >
                  View All Assets →
                </button>
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
                {/* Quick Amount Buttons */}
                <div className="flex gap-1 mt-2">
                  {AMOUNT_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => handleQuickAmount(isRD ? 'monthly_deposit' : 'principal', preset.value)}
                      className="px-2 py-1 text-[10px] font-medium bg-[var(--fill-tertiary)] text-[var(--label-secondary)] rounded-md hover:bg-[var(--fill-secondary)] transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
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
        // Calculate values based on mode
        const calcMode = formData.real_estate_calc_mode || 'rate'; // 'rate' = enter rate, calc value | 'value' = enter value, calc rate

        // Calculate appreciated value (when mode is 'rate')
        const appreciatedValue = (() => {
          if (calcMode !== 'rate' || !formData.purchase_price || !formData.purchase_date || !formData.appreciation_rate) return null;
          const purchasePrice = parseIndianNumber(formData.purchase_price);
          const rate = parseFloat(formData.appreciation_rate) / 100;
          const purchaseDate = new Date(formData.purchase_date);
          const today = new Date();
          const years = (today - purchaseDate) / (365.25 * 24 * 60 * 60 * 1000);
          if (years <= 0) return purchasePrice;
          return Math.round(purchasePrice * Math.pow(1 + rate, years));
        })();

        // Calculate appreciation rate (when mode is 'value')
        const calculatedRate = (() => {
          if (calcMode !== 'value' || !formData.purchase_price || !formData.purchase_date || !formData.current_value) return null;
          const purchasePrice = parseIndianNumber(formData.purchase_price);
          const currentValue = parseIndianNumber(formData.current_value);
          const purchaseDate = new Date(formData.purchase_date);
          const today = new Date();
          const years = (today - purchaseDate) / (365.25 * 24 * 60 * 60 * 1000);
          if (years <= 0 || purchasePrice <= 0) return null;
          // Formula: rate = (currentValue/purchasePrice)^(1/years) - 1
          const rate = (Math.pow(currentValue / purchasePrice, 1 / years) - 1) * 100;
          return Math.round(rate * 10) / 10; // Round to 1 decimal
        })();

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

            {/* Calculation Mode Toggle */}
            <div className="mt-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[13px] font-medium text-[var(--label-secondary)]">Calculate By</span>
                <div className="flex items-center bg-[var(--fill-tertiary)] rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, real_estate_calc_mode: 'rate', current_value: '' }))}
                    className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all ${
                      calcMode === 'rate'
                        ? 'bg-[var(--bg-primary)] text-[var(--label-primary)] shadow-sm'
                        : 'text-[var(--label-secondary)] hover:text-[var(--label-primary)]'
                    }`}
                  >
                    Enter Rate
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, real_estate_calc_mode: 'value', appreciation_rate: '' }))}
                    className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all ${
                      calcMode === 'value'
                        ? 'bg-[var(--bg-primary)] text-[var(--label-primary)] shadow-sm'
                        : 'text-[var(--label-secondary)] hover:text-[var(--label-primary)]'
                    }`}
                  >
                    Enter Value
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass('appreciation_rate')}>
                    Appreciation Rate
                    {calcMode === 'value' && calculatedRate !== null && <span className="text-[var(--system-green)] ml-1">(Auto)</span>}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      name="appreciation_rate"
                      value={calcMode === 'value' && calculatedRate !== null ? calculatedRate : formData.appreciation_rate}
                      onChange={handleChange}
                      placeholder="6"
                      step="0.1"
                      min="0"
                      max="50"
                      readOnly={calcMode === 'value'}
                      className={`${inputClass('appreciation_rate')} pr-12 ${calcMode === 'value' ? 'bg-[var(--system-green)]/5' : ''}`}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">% p.a.</span>
                  </div>
                  {calcMode === 'rate' && (
                    <p className="text-[11px] text-[var(--label-tertiary)] mt-1">Typical: 5-8% for residential</p>
                  )}
                  {calcMode === 'value' && calculatedRate !== null && (
                    <p className="text-[11px] text-[var(--label-tertiary)] mt-1">Based on your current value estimate</p>
                  )}
                </div>
                <div>
                  <label className={labelClass('current_value')}>
                    Current Value
                    {calcMode === 'rate' && appreciatedValue && <span className="text-[var(--system-green)] ml-1">(Auto)</span>}
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                    <input
                      type="text"
                      name="current_value"
                      value={calcMode === 'rate' && appreciatedValue ? formatCurrency(appreciatedValue).replace('₹', '') : getFormattedValue(formData.current_value)}
                      onChange={handleCurrencyChange}
                      placeholder="0"
                      readOnly={calcMode === 'rate'}
                      className={`${inputClass('current_value')} pl-8 ${calcMode === 'rate' ? 'bg-[var(--system-green)]/5' : ''}`}
                    />
                  </div>
                  {calcMode === 'rate' && appreciatedValue && (
                    <p className="text-[11px] text-[var(--label-tertiary)] mt-1">Based on {formData.appreciation_rate}% annual growth</p>
                  )}
                  {calcMode === 'value' && (
                    <p className="text-[11px] text-[var(--label-tertiary)] mt-1">Enter estimated market value</p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        const isGoldOrSilver = asset_type === 'GOLD' || asset_type === 'SILVER';
        const metalName = asset_type === 'GOLD' ? 'Gold' : 'Silver';

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

            {/* Live Metal Price Card */}
            {isGoldOrSilver && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-5 p-4 bg-gradient-to-r from-amber-500/10 to-yellow-500/5 rounded-xl border border-amber-500/20"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-[var(--label-primary)]">Live {metalName} Rate</p>
                      <p className="text-[11px] text-[var(--label-tertiary)]">
                        {metalPrice ? `Updated: ${formatPriceAge(metalPrice.fetchedAt)}` : 'Fetching...'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRefreshMetalPrice}
                    disabled={metalPriceLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-amber-600 bg-amber-500/10 rounded-lg hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                  >
                    <svg className={`w-3.5 h-3.5 ${metalPriceLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                  </button>
                </div>

                {metalPriceLoading && !metalPrice && (
                  <div className="flex items-center gap-2 text-[13px] text-[var(--label-tertiary)]">
                    <div className="w-4 h-4 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                    Fetching current {metalName.toLowerCase()} price...
                  </div>
                )}

                {metalPriceError && !metalPrice && (
                  <div className="text-[13px] text-[var(--system-red)]">
                    {metalPriceError}
                  </div>
                )}

                {metalPrice && (
                  <div className="space-y-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[24px] font-bold text-[var(--label-primary)]">
                        {formatCurrency(metalPrice.pricePerGram24K, 2)}
                      </span>
                      <span className="text-[13px] text-[var(--label-tertiary)]">/gram (24K)</span>
                    </div>
                    {formData.purity && formData.purity !== '24K' && metalPrice.purityPrices?.[formData.purity] && (
                      <p className="text-[13px] text-[var(--label-secondary)]">
                        Your purity ({formData.purity}): <span className="font-semibold">{formatCurrency(metalPrice.purityPrices[formData.purity], 2)}/gram</span>
                      </p>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {isGoldOrSilver && (
                <>
                  <div>
                    <label className={labelClass('weight_grams')}>Weight (grams)</label>
                    <input
                      type="number"
                      name="weight_grams"
                      value={formData.weight_grams}
                      onChange={handleChange}
                      step="0.01"
                      placeholder="0.00"
                      className={inputClass('weight_grams')}
                    />
                  </div>
                  <div>
                    <label className={labelClass('purity')}>Purity</label>
                    <select
                      name="purity"
                      value={formData.purity}
                      onChange={(e) => {
                        handleChange(e);
                        setIsValueOverridden(false); // Recalculate on purity change
                      }}
                      className={selectClass}
                    >
                      <option value="">Select purity</option>
                      {asset_type === 'GOLD' ? (
                        <>
                          <option value="24K">24K (99.9%)</option>
                          <option value="22K">22K (91.6%)</option>
                          <option value="18K">18K (75%)</option>
                          <option value="14K">14K (58.5%)</option>
                        </>
                      ) : (
                        <>
                          <option value="999">999 Fine Silver</option>
                          <option value="925">925 Sterling</option>
                        </>
                      )}
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
                <label className={labelClass('current_value')}>
                  Current Value
                  {isGoldOrSilver && metalPrice && (
                    <span className="ml-2 text-[11px] font-normal text-[var(--system-green)]">
                      {isValueOverridden ? '(Manual)' : '(Auto-calculated)'}
                    </span>
                  )}
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]">₹</span>
                  <input
                    type="text"
                    name="current_value"
                    value={getFormattedValue(formData.current_value)}
                    onChange={handleCurrentValueChange}
                    placeholder="0"
                    className={`${inputClass('current_value')} pl-8 ${isGoldOrSilver && !isValueOverridden ? 'bg-[var(--system-green)]/5' : ''}`}
                  />
                  {isGoldOrSilver && isValueOverridden && metalPrice && (
                    <button
                      type="button"
                      onClick={resetToCalculatedValue}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-[var(--chart-primary)] hover:underline"
                    >
                      Reset
                    </button>
                  )}
                </div>
                {isGoldOrSilver && metalPrice && formData.weight_grams && formData.purity && !isValueOverridden && (
                  <p className="text-[11px] text-[var(--label-tertiary)] mt-1">
                    {formData.weight_grams}g × {formatCurrency(metalPrice.purityPrices?.[formData.purity] || metalPrice.pricePerGram24K, 2)} = {formatCurrency(parseFloat(formData.current_value) || 0)}
                  </p>
                )}
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
          <div className="flex items-center justify-between mb-4">
            <Link to="/assets" className="inline-flex items-center gap-1.5 text-[13px] text-[var(--label-tertiary)] hover:text-[var(--chart-primary)] transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back to Assets
            </Link>
            {/* Quick Entry Mode Toggle */}
            <button
              type="button"
              onClick={() => setQuickEntryMode(!quickEntryMode)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                quickEntryMode
                  ? 'bg-[var(--chart-primary)] text-white'
                  : 'bg-[var(--fill-tertiary)] text-[var(--label-secondary)] hover:bg-[var(--fill-secondary)]'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Quick Entry
            </button>
          </div>
          <h1 className="text-[24px] font-bold text-[var(--label-primary)]">Add New Asset</h1>
          <p className="text-[14px] text-[var(--label-secondary)] mt-1">
            {quickEntryMode ? 'Minimal fields for fast entry' : 'Choose a category and fill in the details'}
          </p>

          {/* Step Progress Indicator */}
          <div className="mt-6">
            <div className="flex items-center">
              {STEPS.map((step, index) => (
                <div key={step.id} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center min-w-[60px]">
                    <motion.div
                      initial={false}
                      animate={{
                        backgroundColor: currentStep >= step.id ? 'var(--chart-primary)' : 'var(--fill-tertiary)',
                        scale: currentStep === step.id ? 1.1 : 1,
                      }}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold transition-colors ${
                        currentStep >= step.id ? 'text-white' : 'text-[var(--label-tertiary)]'
                      }`}
                    >
                      {currentStep > step.id ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        step.id
                      )}
                    </motion.div>
                    <span className={`text-[11px] mt-1.5 font-medium text-center hidden sm:block ${
                      currentStep >= step.id ? 'text-[var(--label-primary)]' : 'text-[var(--label-tertiary)]'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div className="flex-1 mx-1 sm:mx-3 -mt-5 sm:-mt-5">
                      <div className="h-0.5 bg-[var(--fill-tertiary)] rounded-full overflow-hidden">
                        <motion.div
                          initial={false}
                          animate={{ width: currentStep > step.id ? '100%' : '0%' }}
                          transition={{ duration: 0.3 }}
                          className="h-full bg-[var(--chart-primary)]"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
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
                              <div className="flex items-center gap-2">
                                <input
                                  type="date"
                                  name="purchase_date"
                                  value={formData.purchase_date}
                                  onChange={handleChange}
                                  className={`${inputClass('purchase_date')} max-w-[180px]`}
                                />
                                {/* Date Presets */}
                                <div className="flex gap-1">
                                  {DATE_PRESETS.map((preset) => (
                                    <button
                                      key={preset.label}
                                      type="button"
                                      onClick={() => handleDatePreset('purchase_date', preset.getValue)}
                                      className="px-2 py-1.5 text-[11px] font-medium bg-[var(--fill-tertiary)] text-[var(--label-secondary)] rounded-lg hover:bg-[var(--fill-secondary)] transition-colors"
                                    >
                                      {preset.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Tags Selection */}
                          {!quickEntryMode && (
                            <div className="mb-4">
                              <label className="block text-[13px] font-medium text-[var(--label-secondary)] mb-2">
                                Tags (optional)
                              </label>
                              <div className="flex flex-wrap gap-2">
                                {DEFAULT_TAGS.map((tag) => (
                                  <button
                                    key={tag.id}
                                    type="button"
                                    onClick={() => toggleTag(tag.id)}
                                    className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                                      formData.tags.includes(tag.id)
                                        ? `bg-${tag.color}-500/20 text-${tag.color}-600 ring-1 ring-${tag.color}-500/30`
                                        : 'bg-[var(--fill-tertiary)] text-[var(--label-secondary)] hover:bg-[var(--fill-secondary)]'
                                    }`}
                                  >
                                    {formData.tags.includes(tag.id) && '✓ '}
                                    {tag.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Goal Linking */}
                          {!quickEntryMode && (
                            <div className="mb-4">
                              <label className="block text-[13px] font-medium text-[var(--label-secondary)] mb-2">
                                Link to Goal (optional)
                              </label>
                              <div className="grid grid-cols-4 gap-2">
                                {DEFAULT_GOALS.map((goal) => (
                                  <button
                                    key={goal.id}
                                    type="button"
                                    onClick={() => setFormData(prev => ({ ...prev, goal: prev.goal === goal.id ? '' : goal.id }))}
                                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl text-center transition-all ${
                                      formData.goal === goal.id
                                        ? 'bg-[var(--chart-primary)]/10 ring-2 ring-[var(--chart-primary)]'
                                        : 'bg-[var(--fill-tertiary)] hover:bg-[var(--fill-secondary)]'
                                    }`}
                                  >
                                    <div className={`w-9 h-9 rounded-xl ${goal.color} flex items-center justify-center shadow-sm`}>
                                      <span className="text-white">
                                        <GoalIcon goalId={goal.id} className="w-5 h-5" />
                                      </span>
                                    </div>
                                    <span className={`text-[11px] font-medium ${
                                      formData.goal === goal.id ? 'text-[var(--chart-primary)]' : 'text-[var(--label-secondary)]'
                                    }`}>
                                      {goal.label}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Notes */}
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
                          <span className="text-[13px] font-medium text-[var(--label-primary)]">{formatCurrency(parseFloat(formData.price), 2)}</span>
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

                      {/* Portfolio Impact */}
                      {portfolioImpact && getPreviewValue() > 0 && (
                        <div className="pt-3 mt-3 border-t border-[var(--separator-opaque)]">
                          <p className="text-[11px] font-medium text-[var(--label-tertiary)] uppercase tracking-wide mb-2">Portfolio Impact</p>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-[12px] text-[var(--label-tertiary)]">% of Portfolio</span>
                              <span className="text-[12px] font-semibold text-[var(--chart-primary)]">{portfolioImpact.percentage}%</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-[12px] text-[var(--label-tertiary)]">New Total</span>
                              <span className="text-[12px] font-medium text-[var(--label-primary)]">{formatCurrency(portfolioImpact.newTotal)}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Selected Goal */}
                      {formData.goal && (
                        <div className="pt-3 mt-3 border-t border-[var(--separator-opaque)]">
                          <div className="flex justify-between items-center">
                            <span className="text-[13px] text-[var(--label-tertiary)]">Goal</span>
                            <div className="flex items-center gap-2">
                              <div className={`w-6 h-6 rounded-lg ${DEFAULT_GOALS.find(g => g.id === formData.goal)?.color} flex items-center justify-center`}>
                                <span className="text-white">
                                  <GoalIcon goalId={formData.goal} className="w-3.5 h-3.5" />
                                </span>
                              </div>
                              <span className="text-[13px] font-medium text-[var(--label-primary)]">
                                {DEFAULT_GOALS.find(g => g.id === formData.goal)?.label}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Selected Tags */}
                      {formData.tags.length > 0 && (
                        <div className="pt-3 mt-3 border-t border-[var(--separator-opaque)]">
                          <span className="text-[12px] text-[var(--label-tertiary)]">Tags</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {formData.tags.map(tagId => {
                              const tag = DEFAULT_TAGS.find(t => t.id === tagId);
                              return tag ? (
                                <span key={tag.id} className="px-2 py-0.5 text-[10px] font-medium bg-[var(--fill-tertiary)] text-[var(--label-secondary)] rounded-md">
                                  {tag.label}
                                </span>
                              ) : null;
                            })}
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
