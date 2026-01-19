import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { goalService, GOAL_CATEGORIES } from '../services/goals';
import { Card, Button, BottomSheet, ProgressBar } from '../components/apple';
import { spring, staggerContainer, staggerItem, tapScale } from '../utils/animations';
import { formatCurrency, formatCompact } from '../utils/formatting';
import { useToast } from '../context/ToastContext';

// Goal category icons
const GoalIcon = ({ category, className = "w-6 h-6" }) => {
  const icons = {
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
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    category: 'CUSTOM',
    target_amount: '',
    current_amount: '',
    target_date: '',
    notes: '',
  });

  useEffect(() => {
    fetchGoals();
  }, []);

  const fetchGoals = async () => {
    try {
      const response = await goalService.getAll();
      setGoals(response.data.goals);
    } catch (error) {
      toast.error('Failed to load goals');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      category: 'CUSTOM',
      target_amount: '',
      current_amount: '',
      target_date: '',
      notes: '',
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
      if (editingGoal) {
        await goalService.update(editingGoal.id, {
          ...formData,
          target_amount: parseFloat(formData.target_amount),
          current_amount: parseFloat(formData.current_amount) || 0,
        });
        toast.success('Goal updated');
      } else {
        await goalService.create({
          ...formData,
          target_amount: parseFloat(formData.target_amount),
          current_amount: parseFloat(formData.current_amount) || 0,
        });
        toast.success('Goal created');
      }
      setShowAddGoal(false);
      resetForm();
      fetchGoals();
    } catch (error) {
      toast.error('Failed to save goal');
    }
  };

  const handleEdit = (goal) => {
    setEditingGoal(goal);
    setFormData({
      name: goal.name,
      category: goal.category,
      target_amount: goal.target_amount.toString(),
      current_amount: goal.current_amount?.toString() || '',
      target_date: goal.target_date || '',
      notes: goal.notes || '',
    });
    setShowAddGoal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this goal?')) return;

    try {
      await goalService.delete(id);
      toast.success('Goal deleted');
      fetchGoals();
    } catch (error) {
      toast.error('Failed to delete goal');
    }
  };

  const getProgress = (goal) => {
    if (!goal.target_amount) return 0;
    return Math.min((goal.current_amount / goal.target_amount) * 100, 100);
  };

  const getTimeRemaining = (targetDate) => {
    if (!targetDate) return null;
    const now = new Date();
    const target = new Date(targetDate);
    const diffMs = target - now;

    if (diffMs < 0) return 'Overdue';

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days < 30) return `${days} days`;
    if (days < 365) return `${Math.floor(days / 30)} months`;
    return `${(days / 365).toFixed(1)} years`;
  };

  const totalGoalValue = goals.reduce((sum, g) => sum + (g.target_amount || 0), 0);
  const totalCurrentValue = goals.reduce((sum, g) => sum + (g.current_amount || 0), 0);
  const overallProgress = totalGoalValue > 0 ? (totalCurrentValue / totalGoalValue) * 100 : 0;

  const inputClass = "w-full px-4 py-3 bg-[var(--fill-tertiary)] border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--system-blue)] transition-all text-[var(--label-primary)] placeholder-[var(--label-tertiary)] text-[15px]";
  const labelClass = "block text-[13px] font-medium text-[var(--label-secondary)] mb-2";

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.gentle}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6"
        >
          <div>
            <h1 className="text-[28px] font-semibold text-[var(--label-primary)]">Financial Goals</h1>
            <p className="text-[15px] text-[var(--label-secondary)] mt-0.5">
              Track your progress towards financial milestones
            </p>
          </div>
          <Button
            variant="filled"
            onClick={() => {
              resetForm();
              setShowAddGoal(true);
            }}
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            }
          >
            Add Goal
          </Button>
        </motion.div>

        {/* Overall Progress */}
        {goals.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.gentle, delay: 0.1 }}
            className="mb-6"
          >
            <Card padding="p-5" hoverable>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[13px] text-[var(--label-tertiary)] mb-1">Overall Progress</p>
                  <p className="text-[28px] font-semibold text-[var(--label-primary)]">
                    {overallProgress.toFixed(1)}%
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] text-[var(--label-tertiary)] mb-1">
                    {formatCompact(totalCurrentValue)} of {formatCompact(totalGoalValue)}
                  </p>
                  <p className="text-[15px] font-medium text-[var(--label-secondary)]">
                    {goals.length} goal{goals.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <ProgressBar value={overallProgress} max={100} height={8} color="var(--system-blue)" />
            </Card>
          </motion.div>
        )}

        {/* Goals List */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Card key={i} padding="p-5">
                <div className="animate-pulse">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-[var(--fill-tertiary)] rounded-xl" />
                    <div className="flex-1">
                      <div className="h-4 bg-[var(--fill-tertiary)] rounded w-3/4 mb-2" />
                      <div className="h-3 bg-[var(--fill-tertiary)] rounded w-1/2" />
                    </div>
                  </div>
                  <div className="h-2 bg-[var(--fill-tertiary)] rounded-full" />
                </div>
              </Card>
            ))}
          </div>
        ) : goals.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring.gentle}
          >
            <Card padding="p-12">
              <div className="text-center">
                <div className="w-20 h-20 bg-[var(--fill-tertiary)] rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-10 h-10 text-[var(--label-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                  </svg>
                </div>
                <h3 className="text-[20px] font-semibold text-[var(--label-primary)] mb-2">
                  Set Your First Goal
                </h3>
                <p className="text-[15px] text-[var(--label-secondary)] mb-6 max-w-md mx-auto">
                  Create financial goals to track your progress towards important milestones like emergency funds, home purchase, or retirement.
                </p>
                <Button
                  variant="filled"
                  onClick={() => setShowAddGoal(true)}
                  icon={
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  }
                >
                  Create Goal
                </Button>
              </div>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {goals.map((goal) => {
              const progress = getProgress(goal);
              const timeRemaining = getTimeRemaining(goal.target_date);
              const categoryConfig = GOAL_CATEGORIES[goal.category] || GOAL_CATEGORIES.CUSTOM;

              return (
                <motion.div key={goal.id} variants={staggerItem}>
                  <Card padding="p-5" hoverable className="h-full">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: `${categoryConfig.color}15`, color: categoryConfig.color }}
                        >
                          <GoalIcon category={goal.category} />
                        </div>
                        <div>
                          <h3 className="text-[17px] font-semibold text-[var(--label-primary)]">
                            {goal.name}
                          </h3>
                          <p className="text-[13px] text-[var(--label-tertiary)]">
                            {categoryConfig.label}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <motion.button
                          whileTap={tapScale}
                          onClick={() => handleEdit(goal)}
                          className="p-2 text-[var(--label-tertiary)] hover:text-[var(--system-blue)] hover:bg-[var(--system-blue)]/10 rounded-lg transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                          </svg>
                        </motion.button>
                        <motion.button
                          whileTap={tapScale}
                          onClick={() => handleDelete(goal.id)}
                          className="p-2 text-[var(--label-tertiary)] hover:text-[var(--system-red)] hover:bg-[var(--system-red)]/10 rounded-lg transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </motion.button>
                      </div>
                    </div>

                    {/* Progress */}
                    <div className="mb-3">
                      <div className="flex items-end justify-between mb-2">
                        <div>
                          <p className="text-[22px] font-semibold text-[var(--label-primary)]">
                            {formatCompact(goal.current_amount || 0)}
                          </p>
                          <p className="text-[13px] text-[var(--label-tertiary)]">
                            of {formatCompact(goal.target_amount)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p
                            className="text-[17px] font-semibold"
                            style={{ color: progress >= 100 ? 'var(--system-green)' : categoryConfig.color }}
                          >
                            {progress.toFixed(0)}%
                          </p>
                          {timeRemaining && (
                            <p className={`text-[12px] ${timeRemaining === 'Overdue' ? 'text-[var(--system-red)]' : 'text-[var(--label-tertiary)]'}`}>
                              {timeRemaining}
                            </p>
                          )}
                        </div>
                      </div>
                      <ProgressBar
                        value={progress}
                        max={100}
                        height={6}
                        color={progress >= 100 ? 'var(--system-green)' : categoryConfig.color}
                      />
                    </div>

                    {/* Remaining */}
                    {progress < 100 && (
                      <p className="text-[13px] text-[var(--label-tertiary)]">
                        {formatCurrency(goal.target_amount - (goal.current_amount || 0))} remaining
                      </p>
                    )}
                    {progress >= 100 && (
                      <div className="flex items-center gap-1.5 text-[var(--system-green)]">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-[13px] font-medium">Goal achieved!</span>
                      </div>
                    )}
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      {/* Add/Edit Goal Bottom Sheet */}
      <BottomSheet
        isOpen={showAddGoal}
        onClose={() => {
          setShowAddGoal(false);
          resetForm();
        }}
        title={editingGoal ? 'Edit Goal' : 'Create New Goal'}
      >
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Category Selection */}
          <div>
            <label className={labelClass}>Category</label>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(GOAL_CATEGORIES).map(([key, config]) => (
                <motion.button
                  key={key}
                  type="button"
                  whileTap={tapScale}
                  onClick={() => setFormData(prev => ({ ...prev, category: key }))}
                  className={`p-3 rounded-xl flex flex-col items-center gap-1.5 transition-all ${
                    formData.category === key
                      ? 'ring-2 ring-offset-2'
                      : 'bg-[var(--fill-tertiary)]'
                  }`}
                  style={{
                    backgroundColor: formData.category === key ? `${config.color}15` : undefined,
                    color: formData.category === key ? config.color : 'var(--label-tertiary)',
                    ringColor: formData.category === key ? config.color : undefined,
                  }}
                >
                  <GoalIcon category={key} className="w-5 h-5" />
                  <span className="text-[10px] font-medium truncate w-full text-center">
                    {config.label.split(' ')[0]}
                  </span>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Goal Name */}
          <div>
            <label className={labelClass}>Goal Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Emergency Fund, Dream Home"
              className={inputClass}
              required
            />
          </div>

          {/* Target Amount */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Target Amount *</label>
              <input
                type="number"
                value={formData.target_amount}
                onChange={(e) => setFormData(prev => ({ ...prev, target_amount: e.target.value }))}
                placeholder="0"
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Current Amount</label>
              <input
                type="number"
                value={formData.current_amount}
                onChange={(e) => setFormData(prev => ({ ...prev, current_amount: e.target.value }))}
                placeholder="0"
                className={inputClass}
              />
            </div>
          </div>

          {/* Target Date */}
          <div>
            <label className={labelClass}>Target Date (Optional)</label>
            <input
              type="date"
              value={formData.target_date}
              onChange={(e) => setFormData(prev => ({ ...prev, target_date: e.target.value }))}
              className={inputClass}
              min={new Date().toISOString().split('T')[0]}
            />
          </div>

          {/* Notes */}
          <div>
            <label className={labelClass}>Notes (Optional)</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Add any notes about this goal..."
              rows={2}
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="gray"
              className="flex-1"
              onClick={() => {
                setShowAddGoal(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="filled" className="flex-1">
              {editingGoal ? 'Save Changes' : 'Create Goal'}
            </Button>
          </div>
        </form>
      </BottomSheet>
    </div>
  );
}
