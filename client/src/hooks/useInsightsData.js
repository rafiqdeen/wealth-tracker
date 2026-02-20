import { useState, useEffect, useCallback } from 'react';
import { assetService, priceService, ASSET_CONFIG } from '../services/assets';
import { calculateFixedIncomeValue, getCompoundingFrequency, generateRecurringDepositSchedule, calculateXIRRFromTransactions } from '../utils/interest';
import { usePrices } from '../context/PriceContext';
import { metalService, PURITY_FACTORS } from '../services/metals';
import api from '../services/api';
import {
  getPriceKey,
  computeFIFOLots,
  getAssetValue as getAssetValuePure,
  getInvestedValue as getInvestedValuePure,
  VISUAL_GROUP_CONFIG,
} from '../utils/portfolio';

const STATIC_BENCHMARKS = { FD_RETURNS: 7.25, INFLATION: 5.0 };

export const CARD_CONFIG = [
  { id: 'asset_allocation', name: 'Asset Allocation', description: 'Category distribution' },
  { id: 'risk_diversification', name: 'Risk & Diversification', description: 'Portfolio health score' },
  { id: 'benchmark_comparison', name: 'Benchmark Comparison', description: 'Compare against indices' },
  { id: 'liquidity_analysis', name: 'Liquidity Analysis', description: 'Emergency fund coverage' },
  { id: 'gainers_losers', name: 'Gainers & Losers', description: 'Best and worst performers' },
  { id: 'tax_implications', name: 'Tax Implications', description: 'Capital gains estimate' },
];

const DEFAULT_CARD_PREFS = {
  asset_allocation: true,
  risk_diversification: true,
  benchmark_comparison: true,
  liquidity_analysis: true,
  gainers_losers: true,
  tax_implications: true,
};

export default function useInsightsData() {
  const { prices, loading: pricesLoading, fetchPrices } = usePrices();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pricesLoaded, setPricesLoaded] = useState(false);
  const [fixedIncomeCalcs, setFixedIncomeCalcs] = useState({});
  const [metalPrices, setMetalPrices] = useState({});

  const [allocationView, setAllocationView] = useState('Category');
  const [monthlyExpense, setMonthlyExpense] = useState(50000);
  const [editingExpense, setEditingExpense] = useState(false);
  const [expenseInput, setExpenseInput] = useState('');
  const [savingExpense, setSavingExpense] = useState(false);
  const [benchmarkData, setBenchmarkData] = useState(null);
  const [equityTransactions, setEquityTransactions] = useState({});

  const [cardPrefs, setCardPrefs] = useState(() => {
    const cached = localStorage.getItem('insights_card_prefs');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const merged = { ...DEFAULT_CARD_PREFS };
        for (const key of Object.keys(DEFAULT_CARD_PREFS)) {
          if (key in parsed) merged[key] = parsed[key];
        }
        return merged;
      } catch { return DEFAULT_CARD_PREFS; }
    }
    return DEFAULT_CARD_PREFS;
  });
  const [showManageModal, setShowManageModal] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [pendingPrefs, setPendingPrefs] = useState(null);

  // --- Effects ---

  useEffect(() => {
    fetchAssets();
    fetchCardPreferences();
  }, []);

  useEffect(() => {
    priceService.getBenchmark()
      .then(res => setBenchmarkData(res.data))
      .catch(err => console.error('Failed to fetch benchmark:', err));
  }, []);

  useEffect(() => {
    api.get('/settings/monthly-expense')
      .then(res => setMonthlyExpense(res.data.monthlyExpense))
      .catch(err => console.error('Failed to fetch monthly expense:', err));
  }, []);

  // --- Handlers ---

  const fetchCardPreferences = async () => {
    try {
      const response = await api.get('/settings/insights-cards');
      const serverPrefs = response.data.prefs;
      const merged = { ...DEFAULT_CARD_PREFS };
      for (const key of Object.keys(DEFAULT_CARD_PREFS)) {
        if (key in serverPrefs) merged[key] = serverPrefs[key];
      }
      setCardPrefs(merged);
      localStorage.setItem('insights_card_prefs', JSON.stringify(merged));
    } catch (error) {
      console.error('Failed to fetch card preferences:', error);
    }
  };

  const saveCardPreferences = async (prefs) => {
    await api.put('/settings/insights-cards', { prefs });
  };

  const openManageModal = () => {
    setPendingPrefs({ ...cardPrefs });
    setShowManageModal(true);
  };

  const togglePendingPref = (cardId) => {
    setPendingPrefs(prev => ({ ...prev, [cardId]: !prev[cardId] }));
  };

  const savePreferences = async () => {
    setSavingPrefs(true);
    try {
      await saveCardPreferences(pendingPrefs);
      localStorage.setItem('insights_card_prefs', JSON.stringify(pendingPrefs));
      setCardPrefs(pendingPrefs);
      setShowManageModal(false);
    } catch (error) {
      console.error('Failed to save preferences:', error);
    } finally {
      setSavingPrefs(false);
    }
  };

  const cancelPreferences = () => {
    setPendingPrefs(null);
    setShowManageModal(false);
  };

  const isCardVisible = useCallback((cardId) => {
    return cardPrefs[cardId] !== false;
  }, [cardPrefs]);

  const saveMonthlyExpense = async () => {
    const val = parseInt(expenseInput, 10);
    if (isNaN(val) || val < 0) return;
    setSavingExpense(true);
    try {
      await api.put('/settings/monthly-expense', { monthlyExpense: val });
      setMonthlyExpense(val);
      setEditingExpense(false);
    } catch (err) {
      console.error('Failed to save monthly expense:', err);
    } finally {
      setSavingExpense(false);
    }
  };

  const fetchAssets = async () => {
    try {
      setLoading(true);
      const response = await assetService.getAll();
      const assetList = response.data.assets || [];
      setAssets(assetList);

      const marketAssets = assetList.filter(a =>
        ['STOCK', 'MUTUAL_FUND', 'ETF', 'CRYPTO'].includes(a.asset_type)
      );
      if (marketAssets.length > 0) {
        await fetchPrices(marketAssets);
        setPricesLoaded(true);
      } else {
        setPricesLoaded(true);
      }

      const hasGold = assetList.some(a => a.category === 'PHYSICAL' && a.asset_type === 'GOLD');
      const hasSilver = assetList.some(a => a.category === 'PHYSICAL' && a.asset_type === 'SILVER');
      if (hasGold || hasSilver) {
        try {
          const fetches = [];
          if (hasGold) fetches.push(metalService.getPrice('gold').then(r => ({ metal: 'gold', data: r.data })));
          if (hasSilver) fetches.push(metalService.getPrice('silver').then(r => ({ metal: 'silver', data: r.data })));
          const results = await Promise.all(fetches);
          const mp = {};
          for (const { metal, data } of results) {
            mp[metal] = { pricePerGram24K: data.pricePerGram24K, purityPrices: data.purityPrices };
          }
          setMetalPrices(mp);
        } catch (e) {
          console.error('Error fetching metal prices:', e);
        }
      }

      const equityAssets = assetList.filter(a => a.category === 'EQUITY');
      if (equityAssets.length > 0) {
        const eqTxnResults = await Promise.all(
          equityAssets.map(asset =>
            assetService.getTransactions(asset.id)
              .then(res => ({ assetId: asset.id, transactions: res.data.transactions || [] }))
              .catch(() => ({ assetId: asset.id, transactions: [] }))
          )
        );
        const eqTxns = {};
        eqTxnResults.forEach(({ assetId, transactions }) => {
          if (transactions.length > 0) eqTxns[assetId] = transactions;
        });
        setEquityTransactions(eqTxns);
      }

      const fixedIncomeAssets = assetList.filter(a => a.category === 'FIXED_INCOME' && a.interest_rate);
      if (fixedIncomeAssets.length > 0) {
        const fixedIncomeTransactions = await Promise.all(
          fixedIncomeAssets.map(asset =>
            assetService.getTransactions(asset.id)
              .then(res => ({ asset, transactions: res.data.transactions || [] }))
              .catch(() => ({ asset, transactions: [] }))
          )
        );
        const recurringDepositTypes = ['PPF', 'RD', 'EPF', 'VPF', 'SSY'];
        const calcs = {};
        fixedIncomeTransactions.forEach(({ asset, transactions }) => {
          const compoundingFreq = getCompoundingFrequency(asset.asset_type);
          const isRecurring = recurringDepositTypes.includes(asset.asset_type);
          if (transactions.length > 0) {
            if (asset.asset_type === 'PPF') {
              const ppfResult = generateRecurringDepositSchedule(transactions, asset.interest_rate, asset.start_date);
              if (ppfResult) {
                calcs[asset.id] = {
                  principal: ppfResult.summary.totalDeposited,
                  currentValue: ppfResult.summary.currentValue,
                  estimatedValue: ppfResult.summary.estimatedValue,
                  interest: ppfResult.summary.totalInterest,
                  interestPercent: ppfResult.summary.interestPercent,
                  currentFYAccruedInterest: ppfResult.summary.currentFYAccruedInterest
                };
              }
            } else {
              const calculation = calculateFixedIncomeValue(transactions, asset.interest_rate, new Date(), compoundingFreq);
              calcs[asset.id] = calculation;
            }
          } else if (asset.principal) {
            if (isRecurring) {
              calcs[asset.id] = { principal: asset.principal, currentValue: asset.principal, interest: 0, interestPercent: 0, needsTransactions: true };
            } else {
              const startDate = asset.start_date || asset.created_at?.split('T')[0] || new Date().toISOString().split('T')[0];
              const fakeTransaction = [{ type: 'BUY', total_amount: asset.principal, transaction_date: startDate }];
              const calculation = calculateFixedIncomeValue(fakeTransaction, asset.interest_rate, new Date(), compoundingFreq);
              calcs[asset.id] = calculation;
            }
          }
        });
        setFixedIncomeCalcs(calcs);
      }
    } catch (error) {
      console.error('Failed to fetch assets:', error);
    } finally {
      setLoading(false);
    }
  };

  // --- Bound helpers ---

  const deps = { prices, fixedIncomeCalcs, metalPrices, PURITY_FACTORS };
  const boundGetAssetValue = (asset) => getAssetValuePure(asset, deps);
  const boundGetInvestedValue = (asset) => getInvestedValuePure(asset, { fixedIncomeCalcs });

  // --- Derived computations ---

  const now = new Date();
  const assetsWithValue = assets.filter(a => boundGetAssetValue(a) !== null);
  const totalCurrentValue = assetsWithValue.reduce((sum, a) => sum + (boundGetAssetValue(a) || 0), 0);
  const totalInvested = assetsWithValue.reduce((sum, a) => sum + boundGetInvestedValue(a), 0);
  const totalGain = totalCurrentValue - totalInvested;
  const totalGainPercent = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

  const hasRealPrice = (asset) => {
    if (asset.category !== 'EQUITY') return true;
    const priceKey = getPriceKey(asset);
    if (!priceKey) return true;
    return prices[priceKey]?.price !== undefined;
  };

  const assetsWithReturns = assets.map(asset => {
    const rawValue = boundGetAssetValue(asset);
    const currentValue = rawValue ?? 0;
    const investedValue = boundGetInvestedValue(asset);
    const returnAmount = rawValue !== null ? currentValue - investedValue : 0;
    const returnPercent = rawValue !== null && investedValue > 0 ? (returnAmount / investedValue) * 100 : 0;
    const hasPriceData = rawValue !== null && hasRealPrice(asset);
    // Holding period from earliest BUY transaction or start_date/purchase_date
    let holdingYears = null;
    const txns = equityTransactions[asset.id];
    if (txns && txns.length > 0) {
      const buys = txns.filter(t => t.type === 'BUY').map(t => new Date(t.transaction_date));
      if (buys.length > 0) {
        const earliest = new Date(Math.min(...buys));
        holdingYears = (now - earliest) / (365.25 * 24 * 60 * 60 * 1000);
      }
    }
    if (holdingYears === null) {
      const startStr = asset.start_date || asset.purchase_date;
      if (startStr) holdingYears = (now - new Date(startStr)) / (365.25 * 24 * 60 * 60 * 1000);
    }
    return { asset, currentValue, investedValue, returnAmount, returnPercent, hasPriceData, holdingYears };
  }).filter(a => a.investedValue > 0);

  const assetsWithValidReturns = assetsWithReturns.filter(a => a.hasPriceData || a.returnPercent !== 0);
  const sortedByValue = [...assetsWithReturns].sort((a, b) => b.currentValue - a.currentValue);
  const sortedByReturn = [...assetsWithValidReturns].sort((a, b) => b.returnPercent - a.returnPercent);
  const assetsInLoss = assetsWithValidReturns.filter(a => a.returnPercent < 0).length;

  // Category allocation
  const categoryAllocation = Object.entries(
    assets.reduce((acc, asset) => {
      const category = asset.category;
      if (!acc[category]) acc[category] = { current: 0, invested: 0 };
      acc[category].current += (boundGetAssetValue(asset) || 0);
      acc[category].invested += boundGetInvestedValue(asset);
      return acc;
    }, {})
  ).map(([key, data]) => {
    const returnAmount = data.current - data.invested;
    const returnPercent = data.invested > 0 ? (returnAmount / data.invested) * 100 : 0;
    return {
      key, label: VISUAL_GROUP_CONFIG[key]?.label || ASSET_CONFIG[key]?.label || key,
      value: data.current, invested: data.invested, returnAmount, returnPercent,
      color: VISUAL_GROUP_CONFIG[key]?.color || 'var(--system-gray)',
      percent: totalCurrentValue > 0 ? (data.current / totalCurrentValue) * 100 : 0,
    };
  }).sort((a, b) => b.value - a.value);

  // Type allocation
  const typeAllocation = Object.entries(
    assets.reduce((acc, asset) => {
      const type = asset.asset_type || 'OTHER';
      if (!acc[type]) acc[type] = { current: 0, invested: 0 };
      acc[type].current += (boundGetAssetValue(asset) || 0);
      acc[type].invested += boundGetInvestedValue(asset);
      return acc;
    }, {})
  ).map(([key, data]) => {
    const returnAmount = data.current - data.invested;
    const returnPercent = data.invested > 0 ? (returnAmount / data.invested) * 100 : 0;
    const typeColors = {
      'STOCK': '#3B82F6', 'MUTUAL_FUND': '#8B5CF6', 'ETF': '#06B6D4',
      'FD': '#10B981', 'PPF': '#059669', 'EPF': '#0D9488', 'RD': '#14B8A6',
      'NPS': '#0891B2', 'GOLD': '#F59E0B', 'SILVER': '#78716C',
      'SAVINGS_ACCOUNT': '#A855F7', 'LAND': '#EA580C', 'PROPERTY': '#F97316',
      'LIC': '#EC4899', 'CRYPTOCURRENCY': '#EC4899',
    };
    let label = key.replace(/_/g, ' ');
    for (const cat of Object.values(ASSET_CONFIG)) {
      const found = cat.types?.find(t => t.value === key);
      if (found) { label = found.label; break; }
    }
    return {
      key, label, value: data.current, invested: data.invested, returnAmount, returnPercent,
      color: typeColors[key] || '#6B7280',
      percent: totalCurrentValue > 0 ? (data.current / totalCurrentValue) * 100 : 0,
    };
  }).sort((a, b) => b.value - a.value);

  const activeAllocation = allocationView === 'Category' ? categoryAllocation : typeAllocation;

  // Risk & Diversification — HHI-based scoring
  const largestHoldingWeight = sortedByValue.length > 0 ? (sortedByValue[0].currentValue / totalCurrentValue) * 100 : 0;
  const largestHoldingName = sortedByValue.length > 0 ? sortedByValue[0].asset.name : '';

  // HHI at asset level
  const assetHHI = assetsWithValue.reduce((sum, a) => {
    const weight = (boundGetAssetValue(a) || 0) / (totalCurrentValue || 1);
    return sum + weight * weight;
  }, 0);
  const concentrationSubScore = Math.round(35 * (1 - assetHHI));

  // HHI at category level
  const categoryHHI = categoryAllocation.reduce((sum, c) => {
    const weight = c.percent / 100;
    return sum + weight * weight;
  }, 0);
  const categoryBalanceSubScore = Math.round(35 * (1 - categoryHHI));

  // Diminishing returns for asset count
  const assetSpreadSubScore = Math.round(30 * (1 - 1 / Math.sqrt(Math.max(assets.length, 1))));

  const diversificationScore = concentrationSubScore + categoryBalanceSubScore + assetSpreadSubScore;
  const diversificationLevel = diversificationScore >= 70 ? 'Good' : diversificationScore >= 50 ? 'Moderate' : 'Low';

  const meaningfulCategories = categoryAllocation.filter(c => c.percent > 5).length;
  const allCategoryKeys = Object.keys(VISUAL_GROUP_CONFIG).filter(k => k !== 'OTHER');
  const presentCategoryKeys = categoryAllocation.map(c => c.key);
  const missingCategories = allCategoryKeys
    .filter(k => !presentCategoryKeys.includes(k))
    .map(k => VISUAL_GROUP_CONFIG[k]?.label || k);

  const riskRecommendation = (() => {
    if (assets.length === 0) return '';
    if (largestHoldingWeight > 40) return `${largestHoldingName} is ${largestHoldingWeight.toFixed(0)}% of your portfolio — consider reducing concentration`;
    if (meaningfulCategories < 3) return `Only ${meaningfulCategories} asset categor${meaningfulCategories === 1 ? 'y' : 'ies'} — diversify across more categories`;
    if (diversificationScore >= 70) return 'Portfolio is well diversified across assets and categories';
    return 'Add more assets across different categories to improve diversification';
  })();

  // Benchmark Comparison
  const equityXIRR = (() => {
    const allEqTxns = [];
    let totalEqCurrentValue = 0;
    assets.filter(a => a.category === 'EQUITY').forEach(asset => {
      const txns = equityTransactions[asset.id];
      if (txns) allEqTxns.push(...txns);
      const val = boundGetAssetValue(asset);
      if (val) totalEqCurrentValue += val;
    });
    if (allEqTxns.length === 0 || totalEqCurrentValue === 0) return null;
    return calculateXIRRFromTransactions(allEqTxns, totalEqCurrentValue);
  })();

  const niftyReturn = benchmarkData?.niftyOneYearReturn ?? null;

  // Computed weighted-average FD rate from user's own FDs
  const fdAssets = assets.filter(a => a.asset_type === 'FD' && a.interest_rate);
  const computedFDRate = fdAssets.length > 0
    ? fdAssets.reduce((s, a) => s + a.interest_rate * (a.principal || 0), 0)
      / fdAssets.reduce((s, a) => s + (a.principal || 0), 0)
    : null;

  // Equity holding period
  const earliestEquityDate = (() => {
    let earliest = null;
    assets.filter(a => a.category === 'EQUITY').forEach(asset => {
      const txns = equityTransactions[asset.id];
      if (txns) {
        txns.forEach(t => {
          if (t.type === 'BUY') {
            const d = new Date(t.transaction_date);
            if (!earliest || d < earliest) earliest = d;
          }
        });
      }
    });
    return earliest;
  })();
  const equityHoldingYears = earliestEquityDate
    ? (now - earliestEquityDate) / (365.25 * 24 * 60 * 60 * 1000)
    : null;

  const benchmarks = [];
  if (equityXIRR !== null) {
    benchmarks.push({ name: 'Your Equity', value: equityXIRR, isPortfolio: true });
  }
  if (niftyReturn !== null) {
    benchmarks.push({ name: 'Nifty 1Y', value: niftyReturn });
  }
  if (computedFDRate !== null) {
    benchmarks.push({ name: 'Your FD Avg', value: computedFDRate });
  }
  benchmarks.push({ name: 'Inflation (est.)', value: 5.0 });

  const equityTotalReturn = (() => {
    const eqAssets = assets.filter(a => a.category === 'EQUITY');
    const eqInvested = eqAssets.reduce((sum, a) => sum + boundGetInvestedValue(a), 0);
    const eqCurrent = eqAssets.reduce((sum, a) => sum + (boundGetAssetValue(a) || 0), 0);
    if (eqInvested <= 0) return null;
    return ((eqCurrent - eqInvested) / eqInvested) * 100;
  })();

  const beatsBenchmark = equityXIRR !== null && niftyReturn !== null && equityXIRR > niftyReturn;

  // Liquidity Analysis — 3-tier model
  const instantlyLiquidAssets = assets.filter(a => a.category === 'SAVINGS');
  const marketLiquidAssets = assets.filter(a => ['EQUITY', 'CRYPTO'].includes(a.category));
  const lockedAssets = assets.filter(a => ['FIXED_INCOME', 'REAL_ESTATE', 'PHYSICAL', 'INSURANCE'].includes(a.category));

  const instantlyLiquidValue = instantlyLiquidAssets.reduce((sum, a) => sum + (boundGetAssetValue(a) || 0), 0);
  const marketLiquidValue = marketLiquidAssets.reduce((sum, a) => sum + (boundGetAssetValue(a) || 0), 0);
  const lockedValue = lockedAssets.reduce((sum, a) => sum + (boundGetAssetValue(a) || 0), 0);

  const liquidValue = instantlyLiquidValue + marketLiquidValue;
  const liquidAssets = [...instantlyLiquidAssets, ...marketLiquidAssets];
  const liquidPercent = totalCurrentValue > 0 ? (liquidValue / totalCurrentValue) * 100 : 0;
  const lockedPercent = totalCurrentValue > 0 ? (lockedValue / totalCurrentValue) * 100 : 0;
  const instantlyLiquidPercent = totalCurrentValue > 0 ? (instantlyLiquidValue / totalCurrentValue) * 100 : 0;
  const marketLiquidPercent = totalCurrentValue > 0 ? (marketLiquidValue / totalCurrentValue) * 100 : 0;

  const liquidityTierDetail = {
    savings: instantlyLiquidAssets.map(a => ({ name: a.name, value: boundGetAssetValue(a) || 0, type: a.asset_type })).filter(a => a.value > 0).sort((a, b) => b.value - a.value),
    market: marketLiquidAssets.map(a => ({ name: a.name, value: boundGetAssetValue(a) || 0, type: a.asset_type })).filter(a => a.value > 0).sort((a, b) => b.value - a.value),
    locked: lockedAssets.map(a => ({ name: a.name, value: boundGetAssetValue(a) || 0, type: a.asset_type })).filter(a => a.value > 0).sort((a, b) => b.value - a.value),
  };

  const emergencyMonthsSafe = monthlyExpense > 0 ? instantlyLiquidValue / monthlyExpense : 0;
  const emergencyMonths = monthlyExpense > 0 ? liquidValue / monthlyExpense : 0;

  // Upcoming maturity — earliest FD/RD with maturity_date > today
  const upcomingMaturity = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let nearest = null;
    assets.filter(a => a.category === 'FIXED_INCOME' && a.maturity_date).forEach(asset => {
      const matDate = new Date(asset.maturity_date);
      if (matDate > today) {
        if (!nearest || matDate < new Date(nearest.maturity_date)) {
          const daysUntil = Math.ceil((matDate - today) / (1000 * 60 * 60 * 24));
          nearest = { name: asset.name, maturity_date: asset.maturity_date, daysUntil, value: boundGetAssetValue(asset) || asset.principal || 0 };
        }
      }
    });
    return nearest;
  })();

  const allMaturities = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return assets
      .filter(a => a.category === 'FIXED_INCOME' && a.maturity_date)
      .map(asset => {
        const matDate = new Date(asset.maturity_date);
        if (matDate <= today) return null;
        const daysUntil = Math.ceil((matDate - today) / (1000 * 60 * 60 * 24));
        return {
          name: asset.name, maturity_date: asset.maturity_date, daysUntil,
          value: boundGetAssetValue(asset) || asset.principal || 0,
          asset_type: asset.asset_type, interest_rate: asset.interest_rate,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.daysUntil - b.daysUntil);
  })();

  // Gainers & Losers
  const topPerformers = sortedByReturn.slice(0, 5);

  // Tax Implications — FIFO per-lot with loss tracking
  let ltcgGain = 0, stcgGain = 0, ltcgLoss = 0, stcgLoss = 0, ltcgAssetCount = 0, stcgAssetCount = 0;
  const taxBreakdownByAsset = [];
  assets.filter(a => a.category === 'EQUITY').forEach(asset => {
    const txns = equityTransactions[asset.id];
    if (!txns || txns.length === 0) return;
    const lots = computeFIFOLots(txns);
    const priceKey = getPriceKey(asset);
    const currentPrice = prices[priceKey]?.price;
    if (!currentPrice) return;
    let assetLTCG = 0, assetSTCG = 0, assetLTCGLoss = 0, assetSTCGLoss = 0;
    lots.forEach(lot => {
      const buyDate = new Date(lot.date);
      const holdingDays = (now - buyDate) / (1000 * 60 * 60 * 24);
      const lotGain = lot.qty * (currentPrice - lot.price);
      if (holdingDays >= 365) {
        if (lotGain > 0) assetLTCG += lotGain;
        else assetLTCGLoss += Math.abs(lotGain);
      } else {
        if (lotGain > 0) assetSTCG += lotGain;
        else assetSTCGLoss += Math.abs(lotGain);
      }
    });
    if (assetLTCG > 0) { ltcgGain += assetLTCG; ltcgAssetCount++; }
    if (assetSTCG > 0) { stcgGain += assetSTCG; stcgAssetCount++; }
    ltcgLoss += assetLTCGLoss;
    stcgLoss += assetSTCGLoss;
    if (assetLTCG > 0 || assetSTCG > 0 || assetLTCGLoss > 0 || assetSTCGLoss > 0) {
      taxBreakdownByAsset.push({
        name: asset.name, type: asset.asset_type,
        ltcgGain: assetLTCG, stcgGain: assetSTCG,
        ltcgLoss: assetLTCGLoss, stcgLoss: assetSTCGLoss,
        netGain: (assetLTCG + assetSTCG) - (assetLTCGLoss + assetSTCGLoss),
      });
    }
  });
  taxBreakdownByAsset.sort((a, b) => Math.abs(b.netGain) - Math.abs(a.netGain));
  const ltcgTax = Math.max(0, ltcgGain - 125000) * 0.125;
  const stcgTax = stcgGain * 0.20;
  const hasEquityAssets = assets.filter(a => a.category === 'EQUITY').length > 0;

  // LTCG Exemption visualization
  const ltcgExemptionUsed = Math.min(ltcgGain, 125000);
  const ltcgExemptionRemaining = Math.max(0, 125000 - ltcgGain);
  const ltcgExemptionPercent = (ltcgExemptionUsed / 125000) * 100;

  // FD/Fixed income interest taxation
  const taxExemptTypes = ['PPF', 'EPF', 'VPF', 'SSY'];
  let taxableInterest = 0, taxExemptInterest = 0;
  assets.filter(a => a.category === 'FIXED_INCOME').forEach(asset => {
    const interest = fixedIncomeCalcs[asset.id]?.interest || 0;
    if (taxExemptTypes.includes(asset.asset_type)) taxExemptInterest += interest;
    else taxableInterest += interest;
  });

  // Real estate unrealized CG
  let realEstateCG = 0;
  assets.filter(a => a.category === 'REAL_ESTATE').forEach(asset => {
    const currentVal = boundGetAssetValue(asset) || 0;
    const purchasePrice = parseFloat(asset.purchase_price) || 0;
    if (currentVal > purchasePrice && purchasePrice > 0) realEstateCG += currentVal - purchasePrice;
  });

  return {
    // Loading
    loading,
    pricesLoading,
    pricesLoaded,
    // Summary
    totalCurrentValue,
    totalInvested,
    totalGain,
    totalGainPercent,
    // Asset Allocation
    allocationView,
    setAllocationView,
    activeAllocation,
    // Asset Allocation (extra)
    categoryAllocation,
    totalInvested,
    // Risk
    assets,
    diversificationScore,
    diversificationLevel,
    concentrationSubScore,
    categoryBalanceSubScore,
    assetSpreadSubScore,
    largestHoldingWeight,
    largestHoldingName,
    meaningfulCategories,
    missingCategories,
    riskRecommendation,
    // Benchmark
    benchmarks,
    beatsBenchmark,
    equityXIRR,
    niftyReturn,
    computedFDRate,
    equityHoldingYears,
    equityTotalReturn,
    // Liquidity
    liquidPercent,
    lockedPercent,
    instantlyLiquidPercent,
    marketLiquidPercent,
    instantlyLiquidValue,
    marketLiquidValue,
    liquidValue,
    lockedValue,
    liquidAssets,
    lockedAssets,
    emergencyMonths,
    emergencyMonthsSafe,
    upcomingMaturity,
    allMaturities,
    liquidityTierDetail,
    monthlyExpense,
    editingExpense,
    setEditingExpense,
    expenseInput,
    setExpenseInput,
    savingExpense,
    saveMonthlyExpense,
    boundGetAssetValue,
    // Gainers
    assetsWithReturns,
    topPerformers,
    assetsInLoss,
    // Tax
    ltcgGain,
    stcgGain,
    ltcgLoss,
    stcgLoss,
    ltcgAssetCount,
    stcgAssetCount,
    ltcgTax,
    stcgTax,
    ltcgExemptionUsed,
    ltcgExemptionRemaining,
    ltcgExemptionPercent,
    taxableInterest,
    taxExemptInterest,
    realEstateCG,
    hasEquityAssets,
    taxBreakdownByAsset,
    // Card prefs
    isCardVisible,
    openManageModal,
    showManageModal,
    pendingPrefs,
    togglePendingPref,
    savePreferences,
    cancelPreferences,
    savingPrefs,
    CARD_CONFIG,
  };
}
