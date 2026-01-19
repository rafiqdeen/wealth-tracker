// Goals service - uses localStorage for persistence
// Can be migrated to API backend later

const STORAGE_KEY = 'wealth_tracker_goals';

const getGoals = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const saveGoals = (goals) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
};

export const goalService = {
  // Get all goals
  getAll: () => {
    return Promise.resolve({ data: { goals: getGoals() } });
  },

  // Get single goal
  getById: (id) => {
    const goals = getGoals();
    const goal = goals.find(g => g.id === id);
    return Promise.resolve({ data: { goal } });
  },

  // Create goal
  create: (data) => {
    const goals = getGoals();
    const newGoal = {
      id: Date.now().toString(),
      ...data,
      current_amount: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    goals.push(newGoal);
    saveGoals(goals);
    return Promise.resolve({ data: { goal: newGoal } });
  },

  // Update goal
  update: (id, data) => {
    const goals = getGoals();
    const index = goals.findIndex(g => g.id === id);
    if (index !== -1) {
      goals[index] = {
        ...goals[index],
        ...data,
        updated_at: new Date().toISOString(),
      };
      saveGoals(goals);
      return Promise.resolve({ data: { goal: goals[index] } });
    }
    return Promise.reject(new Error('Goal not found'));
  },

  // Update goal progress (current amount)
  updateProgress: (id, currentAmount) => {
    const goals = getGoals();
    const index = goals.findIndex(g => g.id === id);
    if (index !== -1) {
      goals[index].current_amount = currentAmount;
      goals[index].updated_at = new Date().toISOString();
      saveGoals(goals);
      return Promise.resolve({ data: { goal: goals[index] } });
    }
    return Promise.reject(new Error('Goal not found'));
  },

  // Delete goal
  delete: (id) => {
    const goals = getGoals();
    const filtered = goals.filter(g => g.id !== id);
    saveGoals(filtered);
    return Promise.resolve({ data: { success: true } });
  },
};

// Goal categories with icons and colors
export const GOAL_CATEGORIES = {
  EMERGENCY_FUND: {
    label: 'Emergency Fund',
    icon: 'shield',
    color: '#FF9500',
    description: '3-6 months of expenses',
  },
  RETIREMENT: {
    label: 'Retirement',
    icon: 'sunset',
    color: '#AF52DE',
    description: 'Long-term retirement corpus',
  },
  HOME: {
    label: 'Home Purchase',
    icon: 'home',
    color: '#007AFF',
    description: 'Down payment or full purchase',
  },
  EDUCATION: {
    label: 'Education',
    icon: 'book',
    color: '#5856D6',
    description: 'Higher education fund',
  },
  VACATION: {
    label: 'Vacation',
    icon: 'plane',
    color: '#5AC8FA',
    description: 'Travel and experiences',
  },
  CAR: {
    label: 'Vehicle',
    icon: 'car',
    color: '#34C759',
    description: 'Car or bike purchase',
  },
  WEDDING: {
    label: 'Wedding',
    icon: 'heart',
    color: '#FF2D55',
    description: 'Wedding expenses',
  },
  CUSTOM: {
    label: 'Custom Goal',
    icon: 'target',
    color: '#8E8E93',
    description: 'Your custom financial goal',
  },
};
