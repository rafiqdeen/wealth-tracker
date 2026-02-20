import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { goalService, GOAL_CATEGORIES, PROGRESS_MODES } from '../services/goals';
import { assetService } from '../services/assets';
import { Card, Button, BottomSheet, CircularProgress, AnimatedNumber } from '../components/apple';
import { spring, tapScale } from '../utils/animations';
import { getAssetValue as getAssetValuePure } from '../utils/portfolio';
import { formatCurrency, formatCompact } from '../utils/formatting';
import { calculateFixedIncomeValue, getCompoundingFrequency, generateRecurringDepositSchedule } from '../utils/interest';
import { useToast } from '../context/ToastContext';
import { usePrices } from '../context/PriceContext';
import { metalService, PURITY_FACTORS } from '../services/metals';

// Goal category icons
const GoalIcon = ({ category, className = "w-6 h-6" }) => {
  const icons = {
    fire: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
      </svg>
    ),
    shield: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    sunset: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-1.5 5.258l1.591 1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
      </svg>
    ),
    home: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
    book: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    ),
    plane: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
      </svg>
    ),
    car: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
    ),
    heart: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
      </svg>
    ),
    target: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
      </svg>
    ),
  };

  return icons[GOAL_CATEGORIES[category]?.icon] || icons.target;
};

export default function Goals() {
  const toast = useToast();
  const { prices, fetchPrices } = usePrices();
  const [goals, setGoals] = useState([]);
  const [assets, setAssets] = useState([]);
  const [assetAllocations, setAssetAllocations] = useState({}); // Track allocations per asset
  const [loading, setLoading] = useState(true);
  const [metalPrices, setMetalPrices] = useState({});
  const [fixedIncomeCalcs, setFixedIncomeCalcs] = useState({});
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [showContributions, setShowContributions] = useState(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [contributions, setContributions] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    category: 'CUSTOM',
    target_amount: '',
    target_date: '',
    progress_mode: 'AUTO',
    manual_current_amount: '',
    notes: '',
    linked_assets: [], // Array of { asset_id, allocation_percent, link_type }
  });

  useEffect(() => {
    fetchGoals();
    fetchAssets();
  }, []);

  const fetchGoals = async () => {
    try {
      const response = await goalService.getAll();
      setGoals(response.data.goals || []);
    } catch (error) {
      console.error('Failed to load goals:', error);
      toast.error('Failed to load goals');
    } finally {
      setLoading(false);
    }
  };

  const fetchAssets = async () => {
    try {
      const response = await assetService.getAll();
      const fetchedAssets = response.data.assets || [];
      setAssets(fetchedAssets);

      // Fetch equity prices
      const equityAssets = fetchedAssets.filter(a => a.category === 'EQUITY' && a.symbol);
      if (equityAssets.length > 0) {
        fetchPrices(equityAssets);
      }

      // Fetch metal prices for gold/silver
      const hasGold = fetchedAssets.some(a => a.category === 'PHYSICAL' && a.asset_type === 'GOLD');
      const hasSilver = fetchedAssets.some(a => a.category === 'PHYSICAL' && a.asset_type === 'SILVER');
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

      // Calculate Fixed Income values (compound interest)
      const fixedIncomeAssets = fetchedAssets.filter(a => a.category === 'FIXED_INCOME' && a.interest_rate);
      if (fixedIncomeAssets.length > 0) {
        const calcs = {};
        const recurringDepositTypes = ['PPF', 'RD', 'EPF', 'VPF', 'SSY'];
        await Promise.all(fixedIncomeAssets.map(async (asset) => {
          try {
            const txnRes = await assetService.getTransactions(asset.id);
            const transactions = txnRes.data.transactions || [];
            const compoundingFreq = getCompoundingFrequency(asset.asset_type);
            if (transactions.length > 0) {
              if (asset.asset_type === 'PPF') {
                const ppfResult = generateRecurringDepositSchedule(transactions, asset.interest_rate, asset.start_date);
                if (ppfResult) {
                  calcs[asset.id] = { principal: ppfResult.summary.totalDeposited, currentValue: ppfResult.summary.currentValue, interest: ppfResult.summary.totalInterest };
                }
              } else {
                calcs[asset.id] = calculateFixedIncomeValue(transactions, asset.interest_rate, new Date(), compoundingFreq);
              }
            } else if (asset.principal) {
              if (!recurringDepositTypes.includes(asset.asset_type)) {
                const startDate = asset.start_date || asset.created_at?.split('T')[0] || new Date().toISOString().split('T')[0];
                calcs[asset.id] = calculateFixedIncomeValue([{ type: 'BUY', total_amount: asset.principal, transaction_date: startDate }], asset.interest_rate, new Date(), compoundingFreq);
              } else {
                calcs[asset.id] = { principal: asset.principal, currentValue: asset.principal, interest: 0 };
              }
            }
          } catch (e) {
            console.error(`Failed to calculate FI for asset ${asset.id}:`, e);
          }
        }));
        setFixedIncomeCalcs(calcs);
      }

      // Fetch allocations for each asset
      const allocations = {};
      for (const asset of fetchedAssets) {
        try {
          const allocResponse = await goalService.getAssetAllocations(asset.id);
          allocations[asset.id] = allocResponse.data;
        } catch {
          allocations[asset.id] = { total_allocated_percent: 0, available_percent: 100, allocations: [] };
        }
      }
      setAssetAllocations(allocations);
    } catch (error) {
      console.error('Failed to load assets:', error);
    }
  };

  const valueDeps = { prices, fixedIncomeCalcs, metalPrices, PURITY_FACTORS };
  const getAssetValue = (asset) => getAssetValuePure(asset, valueDeps);

  const resetForm = () => {
    setFormData({
      name: '',
      category: 'CUSTOM',
      target_amount: '',
      target_date: '',
      progress_mode: 'AUTO',
      manual_current_amount: '',
      notes: '',
      linked_assets: [],
    });
    setEditingGoal(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name || !formData.target_amount) {
      toast.error('Please fill in required fields');
      return;
    }

    try {
      const payload = {
        name: formData.name,
        category: formData.category,
        target_amount: parseFloat(formData.target_amount),
        target_date: formData.target_date || null,
        progress_mode: formData.progress_mode,
        manual_current_amount: parseFloat(formData.manual_current_amount) || 0,
        notes: formData.notes || null,
        linked_assets: formData.linked_assets.filter(l => l.allocation_percent > 0),
      };

      if (editingGoal) {
        await goalService.update(editingGoal.id, payload);

        // Update links - remove old ones and add new ones
        const existingLinks = editingGoal.linked_assets || [];
        const newLinks = formData.linked_assets.filter(l => l.allocation_percent > 0);

        // Remove links that are no longer present
        for (const existing of existingLinks) {
          const stillExists = newLinks.find(n => n.asset_id === existing.asset_id);
          if (!stillExists && existing.id) {
            await goalService.removeLink(editingGoal.id, existing.id);
          }
        }

        // Add or update links
        for (const link of newLinks) {
          const existing = existingLinks.find(e => e.asset_id === link.asset_id);
          if (existing && existing.id) {
            await goalService.updateLink(editingGoal.id, existing.id, {
              allocation_percent: link.allocation_percent,
              link_type: link.link_type || 'FUNDING',
            });
          } else if (!existing) {
            await goalService.addLink(editingGoal.id, {
              asset_id: link.asset_id,
              allocation_percent: link.allocation_percent,
              link_type: link.link_type || 'FUNDING',
            });
          }
        }

        toast.success('Goal updated');
      } else {
        await goalService.create(payload);
        toast.success('Goal created');
      }

      setShowAddGoal(false);
      resetForm();
      fetchGoals();
      fetchAssets(); // Refresh allocations
    } catch (error) {
      console.error('Error saving goal:', error);
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Failed to save goal');
    }
  };

  const handleEdit = async (goal) => {
    setEditingGoal(goal);

    // Fetch full goal details including links
    try {
      const response = await goalService.getById(goal.id);
      const fullGoal = response.data.goal;

      setFormData({
        name: fullGoal.name,
        category: fullGoal.category,
        target_amount: fullGoal.target_amount.toString(),
        target_date: fullGoal.target_date || '',
        progress_mode: fullGoal.progress_mode || 'AUTO',
        manual_current_amount: (fullGoal.manual_current_amount || 0).toString(),
        notes: fullGoal.notes || '',
        linked_assets: (fullGoal.linked_assets || []).map(la => ({
          id: la.id,
          asset_id: la.asset_id,
          allocation_percent: la.allocation_percent,
          link_type: la.link_type || 'FUNDING',
        })),
      });

      setEditingGoal(fullGoal);
    } catch {
      // Fallback to basic data
      setFormData({
        name: goal.name,
        category: goal.category,
        target_amount: goal.target_amount.toString(),
        target_date: goal.target_date || '',
        progress_mode: goal.progress_mode || 'AUTO',
        manual_current_amount: (goal.manual_current_amount || 0).toString(),
        notes: goal.notes || '',
        linked_assets: [],
      });
    }

    setShowAddGoal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this goal?')) return;

    try {
      await goalService.delete(id);
      toast.success('Goal deleted');
      fetchGoals();
      fetchAssets(); // Refresh allocations
    } catch {
      toast.error('Failed to delete goal');
    }
  };

  const handleViewContributions = async (goal) => {
    setShowContributions(goal);
    try {
      const response = await goalService.getContributions(goal.id);
      setContributions(response.data.contributions || []);
    } catch {
      setContributions([]);
    }
  };

  const toggleAssetLink = (assetId) => {
    setFormData(prev => {
      const exists = prev.linked_assets.find(la => la.asset_id === assetId);
      if (exists) {
        return {
          ...prev,
          linked_assets: prev.linked_assets.filter(la => la.asset_id !== assetId),
        };
      }

      // Get available allocation
      const allocation = assetAllocations[assetId];
      const available = allocation?.available_percent ?? 100;

      // For editing, add back the current goal's allocation to available
      let effectiveAvailable = available;
      if (editingGoal) {
        const existingLink = (editingGoal.linked_assets || []).find(l => l.asset_id === assetId);
        if (existingLink) {
          effectiveAvailable += existingLink.allocation_percent;
        }
      }

      return {
        ...prev,
        linked_assets: [...prev.linked_assets, {
          asset_id: assetId,
          allocation_percent: Math.min(100, effectiveAvailable),
          link_type: 'FUNDING',
        }],
      };
    });
  };

  const updateAssetAllocation = (assetId, percent) => {
    setFormData(prev => ({
      ...prev,
      linked_assets: prev.linked_assets.map(la =>
        la.asset_id === assetId ? { ...la, allocation_percent: percent } : la
      ),
    }));
  };

  const getProgress = (goal) => {
    return goal.progress_percent || 0;
  };

  const getTimeRemaining = (targetDate) => {
    if (!targetDate) return null;
    const now = new Date();
    const target = new Date(targetDate);
    const diffMs = target - now;

    if (diffMs < 0) return { text: 'Overdue', isOverdue: true };

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days < 30) return { text: `${days} days left`, isOverdue: false };
    if (days < 365) return { text: `${Math.floor(days / 30)} months left`, isOverdue: false };
    return { text: `${(days / 365).toFixed(1)} years left`, isOverdue: false };
  };

  // Calculate preview values for the form
  const calculatePreviewProgress = useCallback(() => {
    if (!formData.target_amount) return { progress: 0, currentValue: 0, linkedValue: 0 };

    let linkedValue = 0;
    for (const link of formData.linked_assets) {
      const asset = assets.find(a => a.id === link.asset_id);
      if (asset && link.link_type !== 'TRACKER') {
        const assetValue = getAssetValue(asset) || 0;
        linkedValue += assetValue * (link.allocation_percent / 100);
      }
    }

    const manualValue = parseFloat(formData.manual_current_amount) || 0;
    let currentValue = 0;

    if (formData.progress_mode === 'AUTO') {
      currentValue = linkedValue;
    } else if (formData.progress_mode === 'MANUAL') {
      currentValue = manualValue;
    } else {
      currentValue = linkedValue + manualValue;
    }

    const targetAmount = parseFloat(formData.target_amount) || 0;
    const progress = targetAmount > 0 ? Math.min((currentValue / targetAmount) * 100, 100) : 0;

    return { progress, currentValue, linkedValue, manualValue };
  }, [formData, assets]);

  // Calculate summary statistics
  const totalGoalValue = goals.reduce((sum, g) => sum + (g.target_amount || 0), 0);
  const totalCurrentValue = goals.reduce((sum, g) => sum + (g.current_value || 0), 0);
  const totalRemaining = totalGoalValue - totalCurrentValue;
  const overallProgress = totalGoalValue > 0 ? (totalCurrentValue / totalGoalValue) * 100 : 0;
  const completedGoals = goals.filter(g => getProgress(g) >= 100).length;
  const inProgressGoals = goals.filter(g => getProgress(g) > 0 && getProgress(g) < 100).length;
  const notStartedGoals = goals.filter(g => getProgress(g) === 0).length;

  // Group goals by status for sectioned layout
  const goalsByStatus = {
    almostThere: goals.filter(g => { const p = getProgress(g); return p >= 90 && p < 100; }),
    inProgress: goals.filter(g => { const p = getProgress(g); return p > 0 && p < 90; }),
    notStarted: goals.filter(g => getProgress(g) === 0),
    completed: goals.filter(g => getProgress(g) >= 100),
  };

  // Projection engine
  // Uses server-provided avg_monthly_contribution (from real transaction history)
  // and projected_annual_return (interest rate for FI, XIRR for equity)
  // to compute estimated completion via compound SIP formula.
  const getGoalProjection = (goal) => {
    const currentValue = goal.current_value || 0;
    const targetAmount = goal.target_amount || 0;
    const remaining = Math.max(0, targetAmount - currentValue);

    if (remaining <= 0) return null;

    const now = new Date();
    const hasDeadline = !!goal.target_date;

    // Server-computed: avg monthly investment into linked assets (from transaction history)
    const avgMonthlyRate = goal.avg_monthly_contribution || 0;
    // Server-computed: weighted annual return rate (interest rate for FI, XIRR for equity)
    const annualReturn = goal.projected_annual_return || 0;
    const monthlyReturn = annualReturn / 100 / 12;

    // Estimate months to completion using compound SIP formula:
    // FV = PV*(1+r)^n + PMT*[((1+r)^n - 1)/r]
    // Solve for n via binary search
    let estimatedMonthsToGo = null;
    if (avgMonthlyRate > 0) {
      if (monthlyReturn > 0.0001) {
        // Binary search for n where FV >= target
        let lo = 0, hi = 1200; // max 100 years
        for (let i = 0; i < 50; i++) {
          const mid = (lo + hi) / 2;
          const growthFactor = Math.pow(1 + monthlyReturn, mid);
          const fv = currentValue * growthFactor + avgMonthlyRate * ((growthFactor - 1) / monthlyReturn);
          if (fv >= targetAmount) hi = mid;
          else lo = mid;
        }
        estimatedMonthsToGo = Math.ceil(hi);
      } else {
        // No return (r≈0): simple linear projection
        estimatedMonthsToGo = Math.ceil(remaining / avgMonthlyRate);
      }
    }

    // Deadline-specific
    let monthlyRequired = null;
    let isOnTrack = null;
    let isOverdue = false;

    if (hasDeadline) {
      const target = new Date(goal.target_date);
      isOverdue = target <= now;

      if (!isOverdue) {
        const monthsRemaining = Math.max(1, (target - now) / (1000 * 60 * 60 * 24 * 30.44));

        if (monthlyReturn > 0.0001) {
          // Monthly required considering compound growth:
          // target = currentValue*(1+r)^n + PMT*[((1+r)^n - 1)/r]
          // PMT = [target - currentValue*(1+r)^n] * r / ((1+r)^n - 1)
          const growthFactor = Math.pow(1 + monthlyReturn, monthsRemaining);
          const futureCurrentValue = currentValue * growthFactor;
          const gap = targetAmount - futureCurrentValue;
          if (gap > 0) {
            monthlyRequired = gap * monthlyReturn / (growthFactor - 1);
          } else {
            monthlyRequired = 0; // Existing investments will grow to cover it
          }
        } else {
          monthlyRequired = remaining / monthsRemaining;
        }

        // On-track: current pace meets or exceeds what's needed
        if (monthlyRequired != null) {
          isOnTrack = avgMonthlyRate >= monthlyRequired * 0.9; // 10% tolerance
        }
      }
    }

    return {
      hasDeadline,
      isOverdue,
      remaining,
      avgMonthlyRate,
      annualReturn,
      estimatedMonthsToGo,
      monthlyRequired,
      isOnTrack,
      hasPaceData: avgMonthlyRate > 0,
    };
  };

  const formatProjectionTime = (months) => {
    if (months == null) return 'N/A';
    if (months < 1) return '< 1 month';
    if (months < 12) {
      const m = Math.ceil(months);
      return `~${m} month${m !== 1 ? 's' : ''}`;
    }
    const years = Math.floor(months / 12);
    const rem = Math.round(months % 12);
    if (rem === 0) return `~${years}y`;
    return `~${years}y ${rem}mo`;
  };

  const previewData = calculatePreviewProgress();

  // Loading skeleton
  if (loading) {
    return (
      <div className="h-full overflow-auto">
        <div className="p-4 md:px-10 md:py-6">
          {/* Header skeleton */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="h-8 w-48 bg-[var(--fill-tertiary)] rounded-lg animate-pulse mb-2" />
              <div className="h-4 w-64 bg-[var(--fill-tertiary)] rounded animate-pulse" />
            </div>
            <div className="h-10 w-28 bg-[var(--fill-tertiary)] rounded-xl animate-pulse" />
          </div>

          {/* Summary cards skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-6">
            <div className="lg:col-span-4">
              <Card padding="p-0" className="h-[180px] animate-pulse">
                <div className="p-5 h-full bg-[var(--fill-tertiary)]/30" />
              </Card>
            </div>
            <div className="lg:col-span-4">
              <Card padding="p-0" className="h-[180px] animate-pulse">
                <div className="p-5 h-full bg-[var(--fill-tertiary)]/30" />
              </Card>
            </div>
            <div className="lg:col-span-4">
              <Card padding="p-0" className="h-[180px] animate-pulse">
                <div className="p-5 h-full bg-[var(--fill-tertiary)]/30" />
              </Card>
            </div>
          </div>

          {/* Goals skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Card key={i} padding="p-5" className="animate-pulse">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-[var(--fill-tertiary)] rounded-xl" />
                  <div className="flex-1">
                    <div className="h-5 bg-[var(--fill-tertiary)] rounded w-3/4 mb-2" />
                    <div className="h-3 bg-[var(--fill-tertiary)] rounded w-1/2" />
                  </div>
                </div>
                <div className="h-2 bg-[var(--fill-tertiary)] rounded-full mb-3" />
                <div className="h-4 bg-[var(--fill-tertiary)] rounded w-1/3" />
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const renderGoalCard = (goal) => {
    const progress = getProgress(goal);
    const timeRemaining = getTimeRemaining(goal.target_date);
    const categoryConfig = GOAL_CATEGORIES[goal.category] || GOAL_CATEGORIES.CUSTOM;
    const isCompleted = progress >= 100;
    const isNearCompletion = progress >= 90 && !isCompleted;
    const cardColor = isCompleted ? 'var(--system-green)' : categoryConfig.color;
    const projection = getGoalProjection(goal);

    return (
      <motion.div
        key={goal.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.gentle}
        className="h-full"
      >
        <div className="group h-full rounded-2xl overflow-hidden bg-[var(--bg-primary)] border border-[var(--separator-opaque)]/40 shadow-sm hover:shadow-md transition-all flex flex-col">
          {/* Header */}
          <div
            className="px-4 py-3 relative overflow-hidden"
            style={{
              background: `linear-gradient(to right, ${cardColor}15 0%, ${cardColor}05 60%, transparent 100%)`
            }}
          >
            <div className="flex items-center justify-between relative">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
                  style={{ backgroundColor: cardColor, color: 'white' }}
                >
                  {isCompleted ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : (
                    <GoalIcon category={goal.category} className="w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-[18px] font-semibold text-[var(--label-primary)] truncate">{goal.name}</h3>
                  <p className="text-[12px] text-[var(--label-tertiary)]">{categoryConfig.label}</p>
                </div>
              </div>
              <div className="flex items-center shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <motion.button
                  whileTap={tapScale}
                  onClick={() => handleEdit(goal)}
                  className="p-1.5 text-[var(--label-tertiary)] hover:text-[var(--system-blue)] hover:bg-[var(--fill-tertiary)] rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                  </svg>
                </motion.button>
                <motion.button
                  whileTap={tapScale}
                  onClick={() => handleDelete(goal.id)}
                  className="p-1.5 text-[var(--label-tertiary)] hover:text-[var(--system-red)] hover:bg-[var(--system-red)]/10 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </motion.button>
              </div>
            </div>
          </div>

          {/* Card Body */}
          <div className="p-4 flex-1 flex flex-col">
            {/* Amount & Circular Progress */}
            <div className="mb-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[22px] font-bold text-[var(--label-primary)]" style={{ fontFamily: 'var(--font-display)' }}>
                    {formatCompact(goal.current_value || 0)}
                  </span>
                  <span className="text-[14px] text-[var(--label-tertiary)] ml-1">
                    / <span style={{ fontFamily: 'var(--font-display)' }}>{formatCompact(goal.target_amount)}</span>
                  </span>
                </div>
                <div className="relative shrink-0">
                  <CircularProgress value={progress} max={100} size={56} strokeWidth={5} color={cardColor} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[14px] font-bold tabular-nums" style={{ color: cardColor, fontFamily: 'var(--font-display)' }}>
                      {progress.toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Info Row */}
            <div className="mb-3 flex items-start gap-1.5 text-[12px] text-[var(--label-secondary)]">
              {goal.progress_mode !== 'MANUAL' && goal.linked_assets_count > 0 ? (
                <>
                  <svg className="w-3.5 h-3.5 text-[var(--label-tertiary)] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                  </svg>
                  <span className="line-clamp-2">
                    {goal.linked_assets_names?.join(', ')}
                    {goal.progress_mode === 'HYBRID' && goal.manual_current_amount > 0 && (
                      <span className="text-[var(--system-purple)]">
                        {' '}+ {formatCompact(goal.manual_current_amount)} manual
                      </span>
                    )}
                  </span>
                </>
              ) : (
                <span className="text-[var(--label-tertiary)]">
                  {goal.progress_mode === 'MANUAL' ? 'Manual tracking' : 'No assets linked'}
                </span>
              )}
            </div>

            {/* Notes */}
            {goal.notes && (
              <div className="mb-3 pl-2.5 py-1 border-l-2" style={{ borderColor: cardColor }}>
                <p className="text-[12px] text-[var(--label-secondary)] line-clamp-2">{goal.notes}</p>
              </div>
            )}

            {/* Projection */}
            {!isCompleted && projection && (
              <div className="mb-3 p-3 rounded-xl bg-[var(--bg-tertiary)]/50 border border-[var(--separator-opaque)]/50">
                {projection.isOverdue ? (
                  /* Overdue */
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--system-red)]" />
                      <span className="text-[12px] font-medium text-[var(--system-red)]">Past deadline</span>
                    </div>
                    <span className="text-[12px] font-semibold text-[var(--label-secondary)] tabular-nums">
                      {formatCompact(projection.remaining)} remaining
                    </span>
                  </div>
                ) : !projection.hasPaceData ? (
                  /* No transaction data yet */
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-[var(--label-tertiary)]">No investment history yet</span>
                    {projection.monthlyRequired != null && (
                      <span className="text-[12px] font-semibold text-[var(--label-secondary)] tabular-nums">
                        Need {formatCompact(projection.monthlyRequired)}/mo
                      </span>
                    )}
                  </div>
                ) : (
                  /* Active goal with pace data */
                  <div className="space-y-2.5">
                    {/* Avg pace + return rate */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <svg className="w-3 h-3 text-[var(--label-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                        </svg>
                        <span className="text-[12px] text-[var(--label-tertiary)]">Avg. pace</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-[var(--label-primary)] tabular-nums">
                          {formatCompact(projection.avgMonthlyRate)}/mo
                        </span>
                        {projection.annualReturn > 0 && (
                          <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-[var(--fill-tertiary)] text-[var(--label-tertiary)] tabular-nums">
                            {projection.annualReturn.toFixed(1)}% p.a.
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Pace bar -- only when target date exists */}
                    {projection.monthlyRequired != null && projection.monthlyRequired > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] text-[var(--label-quaternary)]">
                            {formatCompact(projection.monthlyRequired)}/mo required
                          </span>
                          {(() => {
                            const paceRatio = projection.avgMonthlyRate / projection.monthlyRequired;
                            return (
                              <span className={`text-[11px] font-semibold tabular-nums ${
                                paceRatio >= 1 ? 'text-[var(--system-green)]' :
                                paceRatio >= 0.7 ? 'text-[var(--system-amber)]' : 'text-[var(--system-red)]'
                              }`}>
                                {(paceRatio * 100).toFixed(0)}%
                              </span>
                            );
                          })()}
                        </div>
                        <div className="h-1.5 bg-[var(--fill-secondary)] rounded-full overflow-hidden">
                          {(() => {
                            const paceRatio = projection.avgMonthlyRate / projection.monthlyRequired;
                            return (
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(100, paceRatio * 100)}%` }}
                                transition={{ duration: 0.6, ease: "easeOut" }}
                                className="h-full rounded-full"
                                style={{
                                  backgroundColor: paceRatio >= 1 ? 'var(--system-green)' :
                                    paceRatio >= 0.7 ? 'var(--system-amber)' : 'var(--system-red)'
                                }}
                              />
                            );
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Estimated completion */}
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-[var(--label-tertiary)]">Est. completion</span>
                      <div className="flex items-center gap-1.5">
                        {projection.isOnTrack !== null && (
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            projection.isOnTrack ? 'bg-[var(--system-green)]' : 'bg-[var(--system-amber)]'
                          }`} />
                        )}
                        <span className="text-[13px] font-medium text-[var(--label-secondary)] tabular-nums">
                          {formatProjectionTime(projection.estimatedMonthsToGo)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="mt-auto pt-3 border-t border-[var(--separator-opaque)] flex items-center justify-between">
              {isCompleted ? (
                <div className="flex items-center gap-1.5 text-[var(--system-green)]">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-[13px] font-semibold">Goal achieved!</span>
                </div>
              ) : isNearCompletion ? (
                <div className="flex items-center gap-1.5 text-[var(--system-amber)]">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                  </svg>
                  <span className="text-[13px] font-semibold">Almost there!</span>
                </div>
              ) : (
                <span className="text-[13px] text-[var(--label-secondary)]">
                  {formatCompact(goal.target_amount - (goal.current_value || 0))} to go
                </span>
              )}
              {timeRemaining && (
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                  timeRemaining.isOverdue
                    ? 'bg-[var(--system-red)]/10 text-[var(--system-red)]'
                    : 'bg-[var(--fill-tertiary)] text-[var(--label-tertiary)]'
                }`}>
                  {timeRemaining.text}
                </span>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="h-full overflow-auto">
      <div className="p-4 md:px-10 md:py-6">
        <div className="space-y-5">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-[28px] font-bold text-[var(--label-primary)] tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Goals</h1>
              <p className="text-[15px] text-[var(--label-tertiary)] mt-1">
                {goals.length > 0
                  ? `${goals.length} goal${goals.length > 1 ? 's' : ''} · ${completedGoals} completed`
                  : 'Track progress towards your financial milestones'}
              </p>
            </div>
            {goals.length > 0 && (
              <motion.button
                whileTap={tapScale}
                transition={spring.snappy}
                onClick={() => {
                  resetForm();
                  setShowAddGoal(true);
                }}
                className="hidden md:flex items-center gap-2 px-5 py-2.5 bg-[var(--sidebar-active)] text-white rounded-xl font-medium text-[15px] hover:opacity-90 transition-opacity"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Goal
              </motion.button>
            )}
          </div>

          {/* Unified Progress Hero */}
          {goals.length > 0 && (
            <div className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--separator-opaque)] p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row items-center gap-5">
                {/* Large CircularProgress */}
                <div className="relative shrink-0">
                  <CircularProgress
                    value={overallProgress}
                    max={100}
                    size={120}
                    strokeWidth={10}
                    color={overallProgress >= 75 ? 'var(--system-green)' : 'var(--system-blue)'}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[28px] font-bold text-[var(--label-primary)] tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>
                      {overallProgress.toFixed(0)}%
                    </span>
                  </div>
                </div>

                {/* Amounts */}
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <div className="flex items-baseline gap-2 justify-center sm:justify-start mb-1">
                    <span className="text-[32px] font-bold text-[var(--label-primary)]" style={{ fontFamily: 'var(--font-display)' }}>
                      {formatCompact(totalCurrentValue)}
                    </span>
                    <span className="text-[16px] text-[var(--label-tertiary)]">
                      / {formatCompact(totalGoalValue)}
                    </span>
                  </div>
                  <p className="text-[15px] text-[var(--label-tertiary)]">
                    <span className="text-[var(--system-orange)] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{formatCompact(totalRemaining)}</span> remaining across {goals.length} goal{goals.length !== 1 ? 's' : ''}
                  </p>
                </div>

                {/* Status pills */}
                <div className="flex sm:flex-col gap-2 shrink-0">
                  {completedGoals > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--system-green)]/10">
                      <div className="w-2 h-2 rounded-full bg-[var(--system-green)]" />
                      <span className="text-[13px] font-semibold text-[var(--system-green)]"><span className="tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{completedGoals}</span> Done</span>
                    </div>
                  )}
                  {inProgressGoals > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--system-blue)]/10">
                      <div className="w-2 h-2 rounded-full bg-[var(--system-blue)]" />
                      <span className="text-[13px] font-semibold text-[var(--system-blue)]"><span className="tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{inProgressGoals}</span> Active</span>
                    </div>
                  )}
                  {notStartedGoals > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--fill-tertiary)]">
                      <div className="w-2 h-2 rounded-full bg-[var(--label-quaternary)]" />
                      <span className="text-[13px] font-semibold text-[var(--label-tertiary)]"><span className="tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{notStartedGoals}</span> Pending</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Goals List */}
          {goals.length === 0 ? (
            <div className="space-y-8">
              {/* Hero Card - Inspiring Design */}
              <Card padding="p-0" className="overflow-hidden">
                <div className="p-8 md:p-10 bg-gradient-to-br from-[var(--system-blue)]/[0.08] via-[var(--system-purple)]/[0.04] to-transparent relative">
                  {/* Decorative circles */}
                  <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-[var(--system-blue)]/[0.05] to-transparent rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                  <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-[var(--system-purple)]/[0.05] to-transparent rounded-full translate-y-1/2 -translate-x-1/2 pointer-events-none" />

                  <div className="relative flex flex-col items-center text-center max-w-lg mx-auto">
                    {/* Icon */}
                    <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[var(--system-blue)] to-[var(--system-purple)] flex items-center justify-center shadow-lg mb-8">
                      <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                      </svg>
                    </div>

                    {/* Content */}
                    <h2 className="text-[28px] font-bold text-[var(--label-primary)] mb-3 tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                      Turn Dreams Into Milestones
                    </h2>
                    <p className="text-[16px] text-[var(--label-secondary)] mb-8 leading-relaxed max-w-md">
                      Set financial goals, link your assets, and watch your wealth grow automatically.
                    </p>

                    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                      <Button
                        variant="filled"
                        onClick={() => setShowAddGoal(true)}
                        className="px-10 py-3 text-[16px]"
                        icon={
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                        }
                      >
                        Create Your First Goal
                      </Button>
                    </motion.div>

                    {/* Features Row */}
                    <div className="flex items-center justify-center gap-6 mt-8 pt-6 border-t border-[var(--separator-opaque)]/50 w-full">
                      <div className="flex items-center gap-2 text-[var(--label-tertiary)]">
                        <svg className="w-4 h-4 text-[var(--system-blue)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        <span className="text-[13px] font-medium">Link Assets</span>
                      </div>
                      <div className="flex items-center gap-2 text-[var(--label-tertiary)]">
                        <svg className="w-4 h-4 text-[var(--system-purple)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                        </svg>
                        <span className="text-[13px] font-medium">Partial Allocation</span>
                      </div>
                      <div className="flex items-center gap-2 text-[var(--label-tertiary)]">
                        <svg className="w-4 h-4 text-[var(--system-green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
                        </svg>
                        <span className="text-[13px] font-medium">Auto Progress</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Almost There Section */}
              {goalsByStatus.almostThere.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-4 rounded-full bg-[var(--system-amber)]" />
                      <h3 className="text-[15px] font-semibold text-[var(--label-secondary)]">Almost There</h3>
                      <span className="text-[13px] font-medium px-2 py-0.5 rounded-full bg-[var(--system-amber)]/10 text-[var(--system-amber)] tabular-nums">
                        {goalsByStatus.almostThere.length}
                      </span>
                    </div>
                    <div className="flex-1 h-px bg-[var(--separator-opaque)]" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {goalsByStatus.almostThere.map(renderGoalCard)}
                  </div>
                </div>
              )}

              {/* In Progress Section */}
              {goalsByStatus.inProgress.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-4 rounded-full bg-[var(--system-blue)]" />
                      <h3 className="text-[15px] font-semibold text-[var(--label-secondary)]">In Progress</h3>
                      <span className="text-[13px] font-medium px-2 py-0.5 rounded-full bg-[var(--system-blue)]/10 text-[var(--system-blue)] tabular-nums">
                        {goalsByStatus.inProgress.length}
                      </span>
                    </div>
                    <div className="flex-1 h-px bg-[var(--separator-opaque)]" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {goalsByStatus.inProgress.map(renderGoalCard)}
                  </div>
                </div>
              )}

              {/* Not Started Section */}
              {goalsByStatus.notStarted.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-4 rounded-full bg-[var(--label-quaternary)]" />
                      <h3 className="text-[15px] font-semibold text-[var(--label-secondary)]">Not Started</h3>
                      <span className="text-[13px] font-medium px-2 py-0.5 rounded-full bg-[var(--fill-tertiary)] text-[var(--label-tertiary)] tabular-nums">
                        {goalsByStatus.notStarted.length}
                      </span>
                    </div>
                    <div className="flex-1 h-px bg-[var(--separator-opaque)]" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {goalsByStatus.notStarted.map(renderGoalCard)}
                  </div>
                </div>
              )}

              {/* Completed Section - Collapsible */}
              {goalsByStatus.completed.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowCompleted(!showCompleted)}
                    className="flex items-center gap-3 w-full mb-3"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-4 rounded-full bg-[var(--system-green)]" />
                      <h3 className="text-[15px] font-semibold text-[var(--label-secondary)]">Completed</h3>
                      <span className="text-[13px] font-medium px-2 py-0.5 rounded-full bg-[var(--system-green)]/10 text-[var(--system-green)] tabular-nums">
                        {goalsByStatus.completed.length}
                      </span>
                    </div>
                    <div className="flex-1 h-px bg-[var(--separator-opaque)]" />
                    <svg
                      className={`w-4 h-4 text-[var(--label-tertiary)] transition-transform ${showCompleted ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  {showCompleted && (
                    <div className="space-y-2 p-3 rounded-2xl bg-[var(--system-green)]/5">
                      {goalsByStatus.completed.map((goal) => {
                        const categoryConfig = GOAL_CATEGORIES[goal.category] || GOAL_CATEGORIES.CUSTOM;
                        return (
                          <motion.div
                            key={goal.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={spring.gentle}
                            className="group flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-primary)]/80 hover:bg-[var(--bg-primary)] border border-[var(--system-green)]/10 transition-colors"
                          >
                            <div className="w-7 h-7 rounded-lg bg-[var(--system-green)] flex items-center justify-center shrink-0">
                              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-[15px] font-medium text-[var(--label-primary)]">{goal.name}</span>
                              <span className="text-[13px] text-[var(--label-tertiary)] ml-2">{categoryConfig.label}</span>
                            </div>
                            <span className="text-[15px] font-semibold text-[var(--label-primary)] tabular-nums shrink-0" style={{ fontFamily: 'var(--font-display)' }}>
                              {formatCompact(goal.target_amount)}
                            </span>
                            <div className="flex items-center shrink-0 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <motion.button
                                whileTap={tapScale}
                                onClick={() => handleEdit(goal)}
                                className="p-1 text-[var(--label-tertiary)] hover:text-[var(--system-blue)] rounded-md transition-colors"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                                </svg>
                              </motion.button>
                              <motion.button
                                whileTap={tapScale}
                                onClick={() => handleDelete(goal.id)}
                                className="p-1 text-[var(--label-tertiary)] hover:text-[var(--system-red)] rounded-md transition-colors"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                              </motion.button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Goal Bottom Sheet */}
      <BottomSheet
        isOpen={showAddGoal}
        onClose={() => {
          setShowAddGoal(false);
          resetForm();
        }}
        title={editingGoal ? 'Edit Goal' : 'Create New Goal'}
        maxHeight="90vh"
        maxWidth="900px"
      >
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col lg:flex-row">
            {/* Form Section */}
            <div className="flex-1 lg:border-r lg:border-[var(--separator-opaque)]">
              {/* Category Selection - 3 per row Pills */}
              <div className="px-5 py-4 border-b border-[var(--separator-opaque)]">
                <label className="block text-[14px] font-medium text-[var(--label-secondary)] mb-3">What type of goal?</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(GOAL_CATEGORIES).map(([key, config]) => {
                    const isSelected = formData.category === key;
                    return (
                      <motion.button
                        key={key}
                        type="button"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        transition={spring.snappy}
                        onClick={() => setFormData(prev => ({ ...prev, category: key }))}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-full transition-all ${
                          isSelected
                            ? 'shadow-sm'
                            : 'bg-[var(--fill-tertiary)] hover:bg-[var(--fill-secondary)]'
                        }`}
                        style={{
                          backgroundColor: isSelected ? `${config.color}15` : undefined,
                          border: isSelected ? `1.5px solid ${config.color}` : '1.5px solid transparent',
                        }}
                      >
                        {/* Icon */}
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors"
                          style={{
                            backgroundColor: isSelected ? config.color : 'var(--fill-secondary)',
                            color: isSelected ? 'white' : 'var(--label-tertiary)',
                          }}
                        >
                          <GoalIcon category={key} className="w-3.5 h-3.5" />
                        </div>

                        {/* Label */}
                        <span
                          className="text-[14px] font-medium transition-colors truncate"
                          style={{ color: isSelected ? config.color : 'var(--label-primary)' }}
                        >
                          {config.label}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Form Fields */}
              <div className="p-5 space-y-5">
                {/* Goal Name */}
                <div>
                  <label className="block text-[14px] font-medium text-[var(--label-secondary)] mb-2">Goal Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Emergency Fund, Dream Home"
                    className="w-full px-4 py-3 bg-[var(--fill-tertiary)] border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--system-blue)] transition-all text-[var(--label-primary)] placeholder-[var(--label-tertiary)] text-[16px]"
                    required
                  />
                </div>

                {/* Target Amount */}
                <div>
                  <label className="block text-[14px] font-medium text-[var(--label-secondary)] mb-2">Target Amount *</label>
                  <div className="relative mb-2">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-secondary)] text-[16px] font-medium">₹</div>
                    <input
                      type="number"
                      value={formData.target_amount}
                      onChange={(e) => setFormData(prev => ({ ...prev, target_amount: e.target.value }))}
                      placeholder="500000"
                      className="w-full px-4 py-3 pl-8 bg-[var(--fill-tertiary)] border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--system-blue)] transition-all text-[var(--label-primary)] placeholder-[var(--label-tertiary)] text-[16px] font-semibold"
                      required
                    />
                  </div>
                  {/* Quick Amount Presets */}
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { label: '1L', value: 100000 },
                      { label: '5L', value: 500000 },
                      { label: '10L', value: 1000000 },
                      { label: '25L', value: 2500000 },
                      { label: '50L', value: 5000000 },
                      { label: '1Cr', value: 10000000 },
                    ].map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, target_amount: preset.value.toString() }))}
                        className={`px-3 py-1.5 text-[14px] font-medium rounded-lg transition-all ${
                          formData.target_amount === preset.value.toString()
                            ? 'text-white shadow-sm'
                            : 'bg-[var(--fill-tertiary)] text-[var(--label-secondary)] hover:bg-[var(--fill-secondary)]'
                        }`}
                        style={{
                          backgroundColor: formData.target_amount === preset.value.toString()
                            ? (GOAL_CATEGORIES[formData.category]?.color || 'var(--system-blue)')
                            : undefined
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Progress Mode Selection */}
                <div>
                  <label className="block text-[14px] font-medium text-[var(--label-secondary)] mb-2">Progress Tracking</label>
                  <div className="flex gap-2">
                    {Object.entries(PROGRESS_MODES).map(([key, mode]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, progress_mode: key }))}
                        className={`flex-1 px-3 py-2.5 rounded-xl text-[14px] font-medium transition-all ${
                          formData.progress_mode === key
                            ? 'bg-[var(--system-blue)] text-white'
                            : 'bg-[var(--fill-tertiary)] text-[var(--label-secondary)] hover:bg-[var(--fill-secondary)]'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[12px] text-[var(--label-tertiary)] mt-1.5">
                    {PROGRESS_MODES[formData.progress_mode].description}
                  </p>
                </div>

                {/* Manual Amount - only show for MANUAL or HYBRID mode */}
                {(formData.progress_mode === 'MANUAL' || formData.progress_mode === 'HYBRID') && (
                  <div>
                    <label className="block text-[14px] font-medium text-[var(--label-secondary)] mb-2">
                      {formData.progress_mode === 'MANUAL' ? 'Current Progress' : 'Additional Manual Amount'}
                    </label>
                    <div className="relative mb-2">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--label-secondary)] text-[16px] font-medium">₹</div>
                      <input
                        type="number"
                        value={formData.manual_current_amount}
                        onChange={(e) => setFormData(prev => ({ ...prev, manual_current_amount: e.target.value }))}
                        placeholder="0"
                        className="w-full px-4 py-3 pl-8 bg-[var(--fill-tertiary)] border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--system-blue)] transition-all text-[var(--label-primary)] placeholder-[var(--label-tertiary)] text-[16px] font-semibold"
                      />
                    </div>
                  </div>
                )}

                {/* Target Date */}
                <div>
                  <label className="block text-[14px] font-medium text-[var(--label-secondary)] mb-2">Target Date</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="date"
                      value={formData.target_date}
                      onChange={(e) => setFormData(prev => ({ ...prev, target_date: e.target.value }))}
                      className="flex-1 px-4 py-3 bg-[var(--fill-tertiary)] border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--system-blue)] transition-all text-[var(--label-primary)] text-[16px]"
                      min={new Date().toISOString().split('T')[0]}
                    />
                    {/* Date Presets */}
                    <div className="flex gap-1.5 shrink-0">
                      {[
                        { label: '1Y', years: 1 },
                        { label: '3Y', years: 3 },
                        { label: '5Y', years: 5 },
                        { label: '10Y', years: 10 },
                      ].map((preset) => (
                        <button
                          key={preset.years}
                          type="button"
                          onClick={() => {
                            const date = new Date();
                            date.setFullYear(date.getFullYear() + preset.years);
                            setFormData(prev => ({ ...prev, target_date: date.toISOString().split('T')[0] }));
                          }}
                          className="px-2.5 py-2.5 text-[14px] font-medium rounded-lg bg-[var(--fill-tertiary)] text-[var(--label-secondary)] hover:bg-[var(--fill-secondary)] transition-all"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Link Existing Assets - Enhanced with sliders */}
                {assets.length > 0 && formData.progress_mode !== 'MANUAL' && (
                  <div>
                    <label className="block text-[14px] font-medium text-[var(--label-secondary)] mb-2">
                      Link Assets
                    </label>
                    <p className="text-[13px] text-[var(--label-tertiary)] mb-3">
                      Select assets and set allocation percentage for each
                    </p>
                    <div className="max-h-[280px] overflow-y-auto space-y-2 rounded-xl bg-[var(--fill-tertiary)] p-3">
                      {assets.map((asset) => {
                        const linkedAsset = formData.linked_assets.find(la => la.asset_id === asset.id);
                        const isLinked = !!linkedAsset;
                        const assetValue = getAssetValue(asset);
                        const allocation = assetAllocations[asset.id] || { total_allocated_percent: 0, available_percent: 100 };

                        // Calculate effective available (add back current goal's allocation if editing)
                        let effectiveAllocated = allocation.total_allocated_percent;
                        let effectiveAvailable = allocation.available_percent;
                        if (editingGoal) {
                          const existingLink = (editingGoal.linked_assets || []).find(l => l.asset_id === asset.id);
                          if (existingLink) {
                            effectiveAllocated -= existingLink.allocation_percent;
                            effectiveAvailable += existingLink.allocation_percent;
                          }
                        }

                        const allocatedValue = isLinked ? (assetValue || 0) * (linkedAsset.allocation_percent / 100) : 0;

                        return (
                          <div
                            key={asset.id}
                            className={`rounded-xl transition-all ${
                              isLinked
                                ? 'bg-[var(--bg-primary)] border-2 border-[var(--system-blue)]/30'
                                : 'bg-[var(--bg-primary)] border-2 border-transparent hover:border-[var(--separator-opaque)]'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleAssetLink(asset.id)}
                              className="w-full flex items-center gap-3 px-3 py-3"
                            >
                              {/* Checkbox */}
                              <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                                isLinked
                                  ? 'bg-[var(--system-blue)] text-white'
                                  : 'bg-[var(--fill-secondary)] border border-[var(--separator-opaque)]'
                              }`}>
                                {isLinked && (
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                              {/* Asset Info */}
                              <div className="flex-1 text-left min-w-0">
                                <p className="text-[14px] font-medium text-[var(--label-primary)] truncate">
                                  {asset.name}
                                </p>
                                <p className="text-[12px] text-[var(--label-tertiary)]">
                                  {asset.asset_type} · {formatCompact(assetValue)}
                                  {effectiveAllocated > 0 && (
                                    <span className="text-[var(--system-orange)]"> · {effectiveAllocated.toFixed(0)}% allocated elsewhere</span>
                                  )}
                                </p>
                              </div>
                              {/* Value */}
                              <span className="text-[14px] font-semibold text-[var(--label-secondary)] shrink-0">
                                {formatCompact(assetValue)}
                              </span>
                            </button>

                            {/* Allocation Slider - only show when linked */}
                            {isLinked && (
                              <div className="px-3 pb-3">
                                <div className="flex items-center gap-3">
                                  <input
                                    type="range"
                                    min="0"
                                    max={Math.min(100, effectiveAvailable)}
                                    value={linkedAsset.allocation_percent}
                                    onChange={(e) => updateAssetAllocation(asset.id, parseInt(e.target.value))}
                                    className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
                                    style={{
                                      background: `linear-gradient(to right, var(--system-blue) 0%, var(--system-blue) ${linkedAsset.allocation_percent}%, var(--fill-secondary) ${linkedAsset.allocation_percent}%, var(--fill-secondary) 100%)`,
                                    }}
                                  />
                                  <span className="text-[14px] font-bold text-[var(--system-blue)] w-12 text-right">
                                    {linkedAsset.allocation_percent}%
                                  </span>
                                </div>
                                <div className="flex items-center justify-between mt-1.5">
                                  <span className="text-[12px] text-[var(--label-tertiary)]">
                                    Allocated: {formatCompact(allocatedValue)}
                                  </span>
                                  {effectiveAvailable < 100 && (
                                    <span className="text-[11px] text-[var(--system-orange)]">
                                      Max: {Math.min(100, effectiveAvailable).toFixed(0)}%
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Summary */}
                    {formData.linked_assets.length > 0 && (
                      <div className="mt-3 p-3 rounded-xl bg-[var(--system-blue)]/10 border border-[var(--system-blue)]/20">
                        <div className="flex items-center justify-between">
                          <span className="text-[13px] font-medium text-[var(--system-blue)]">
                            {formData.linked_assets.length} asset{formData.linked_assets.length > 1 ? 's' : ''} linked
                          </span>
                          <span className="text-[14px] font-bold text-[var(--system-blue)]">
                            {formatCompact(previewData.linkedValue)} allocated
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Notes */}
                <div>
                  <label className="block text-[14px] font-medium text-[var(--label-secondary)] mb-2">Notes (Optional)</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Add any notes about this goal..."
                    rows={2}
                    className="w-full px-4 py-3 bg-[var(--fill-tertiary)] border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--system-blue)] transition-all text-[var(--label-primary)] placeholder-[var(--label-tertiary)] text-[16px] resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Live Preview Panel */}
            <div className="hidden lg:flex lg:flex-col w-[260px] p-5 bg-[var(--bg-tertiary)]/30">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-[var(--system-green)] animate-pulse" />
                <p className="text-[14px] font-semibold text-[var(--label-secondary)]">
                  Live Preview
                </p>
              </div>

              {/* Preview Card */}
              <Card padding="p-0" className="overflow-hidden shadow-lg border border-[var(--separator-opaque)]">
                {/* Gradient Header */}
                <div
                  className="p-4"
                  style={{
                    background: `linear-gradient(135deg, ${GOAL_CATEGORIES[formData.category]?.color || '#6B7280'}15 0%, ${GOAL_CATEGORIES[formData.category]?.color || '#6B7280'}05 100%)`
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: `${GOAL_CATEGORIES[formData.category]?.color || '#6B7280'}20`,
                        color: GOAL_CATEGORIES[formData.category]?.color || '#6B7280'
                      }}
                    >
                      <GoalIcon category={formData.category} className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[16px] font-semibold text-[var(--label-primary)] truncate">
                        {formData.name || 'Goal Name'}
                      </h3>
                      <p className="text-[13px] text-[var(--label-tertiary)]">
                        {GOAL_CATEGORIES[formData.category]?.label || 'Category'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Progress Section */}
                <div className="p-4 pt-3">
                  <div className="flex items-baseline justify-between mb-2">
                    <div>
                      <span className="text-[20px] font-bold text-[var(--label-primary)]">
                        {formatCompact(previewData.currentValue)}
                      </span>
                      <span className="text-[14px] text-[var(--label-tertiary)] ml-1">
                        / {formData.target_amount ? formatCompact(parseFloat(formData.target_amount)) : '0'}
                      </span>
                    </div>
                    <span
                      className="text-[16px] font-bold"
                      style={{ color: GOAL_CATEGORIES[formData.category]?.color || '#6B7280' }}
                    >
                      {previewData.progress.toFixed(0)}%
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="h-2 bg-[var(--fill-tertiary)] rounded-full overflow-hidden mb-3">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${previewData.progress}%` }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: GOAL_CATEGORIES[formData.category]?.color || '#6B7280' }}
                    />
                  </div>

                  {/* Breakdown */}
                  {formData.progress_mode !== 'MANUAL' && previewData.linkedValue > 0 && (
                    <div className="space-y-1 mb-3">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-[var(--label-tertiary)]">From Assets</span>
                        <span className="font-medium text-[var(--label-secondary)]">{formatCompact(previewData.linkedValue)}</span>
                      </div>
                      {formData.progress_mode === 'HYBRID' && previewData.manualValue > 0 && (
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="text-[var(--label-tertiary)]">Manual</span>
                          <span className="font-medium text-[var(--label-secondary)]">{formatCompact(previewData.manualValue)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-[var(--label-tertiary)]">
                      {formData.target_amount
                        ? `${formatCompact(Math.max(0, parseFloat(formData.target_amount) - previewData.currentValue))} to go`
                        : 'Set target'}
                    </span>
                    {formData.target_date && (
                      <span className="text-[12px] font-medium px-2 py-0.5 rounded-full bg-[var(--fill-tertiary)] text-[var(--label-tertiary)]">
                        {(() => {
                          const remaining = getTimeRemaining(formData.target_date);
                          return remaining?.text || '';
                        })()}
                      </span>
                    )}
                  </div>
                </div>
              </Card>

              {/* Progress Mode Info */}
              <div className="mt-4 p-3 rounded-xl bg-[var(--fill-tertiary)]">
                <p className="text-[12px] font-medium text-[var(--label-tertiary)] uppercase mb-1">Mode</p>
                <p className="text-[14px] font-semibold text-[var(--label-primary)]">
                  {PROGRESS_MODES[formData.progress_mode].label}
                </p>
                <p className="text-[12px] text-[var(--label-tertiary)] mt-1">
                  {PROGRESS_MODES[formData.progress_mode].description}
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="sticky bottom-0 flex justify-end gap-3 p-5 pt-4 border-t border-[var(--separator-opaque)] bg-[var(--bg-primary)]">
            <Button
              type="button"
              variant="gray"
              onClick={() => {
                setShowAddGoal(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="filled"
              style={{
                backgroundColor: GOAL_CATEGORIES[formData.category]?.color || undefined
              }}
            >
              {editingGoal ? 'Save Changes' : 'Create Goal'}
            </Button>
          </div>
        </form>
      </BottomSheet>

      {/* Contributions History Bottom Sheet */}
      <BottomSheet
        isOpen={!!showContributions}
        onClose={() => setShowContributions(null)}
        title={showContributions ? `${showContributions.name} - History` : 'History'}
        maxHeight="70vh"
        maxWidth="600px"
      >
        <div className="p-5">
          {contributions.length === 0 ? (
            <div className="text-center py-8">
              <svg className="w-12 h-12 mx-auto text-[var(--label-quaternary)] mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[16px] text-[var(--label-tertiary)]">No contribution history yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {contributions.map((c, idx) => (
                <div
                  key={c.id || idx}
                  className="flex items-center gap-3 p-3 rounded-xl bg-[var(--fill-tertiary)]"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    c.amount > 0
                      ? 'bg-[var(--system-green)]/15 text-[var(--system-green)]'
                      : 'bg-[var(--system-red)]/15 text-[var(--system-red)]'
                  }`}>
                    {c.amount > 0 ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-[var(--label-primary)]">
                      {c.description || c.contribution_type}
                    </p>
                    <p className="text-[12px] text-[var(--label-tertiary)]">
                      {new Date(c.contribution_date).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                      {c.asset_name && ` · ${c.asset_name}`}
                    </p>
                  </div>
                  <span className={`text-[16px] font-bold ${
                    c.amount > 0 ? 'text-[var(--system-green)]' : 'text-[var(--system-red)]'
                  }`}>
                    {c.amount > 0 ? '+' : ''}{formatCompact(c.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
