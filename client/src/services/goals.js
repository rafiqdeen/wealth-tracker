import api from './api';

const MIGRATION_KEY = 'wealth_tracker_goals_migrated';
const OLD_STORAGE_KEY = 'wealth_tracker_goals';

// Check if migration is needed and perform it
async function checkAndMigrate() {
  if (localStorage.getItem(MIGRATION_KEY)) {
    return; // Already migrated
  }

  const localData = localStorage.getItem(OLD_STORAGE_KEY);
  if (!localData) {
    localStorage.setItem(MIGRATION_KEY, 'true');
    return; // No data to migrate
  }

  try {
    const localGoals = JSON.parse(localData);
    if (localGoals && localGoals.length > 0) {
      await api.post('/goals/migrate', { goals: localGoals });
    }
    localStorage.setItem(MIGRATION_KEY, 'true');
  } catch (error) {
    console.error('Failed to migrate goals:', error);
    // Don't set migration flag so it can be retried
  }
}

export const goalService = {
  // Get all goals (with auto-migration check)
  getAll: async () => {
    await checkAndMigrate();
    return api.get('/goals');
  },

  // Get single goal with full details
  getById: (id) => api.get(`/goals/${id}`),

  // Create goal with optional linked assets
  create: (data) => api.post('/goals', data),

  // Update goal
  update: (id, data) => api.put(`/goals/${id}`, data),

  // Delete goal
  delete: (id) => api.delete(`/goals/${id}`),

  // ===== Asset Links =====

  // Get all asset links for a goal
  getLinks: (goalId) => api.get(`/goals/${goalId}/links`),

  // Add asset link to goal
  addLink: (goalId, linkData) => api.post(`/goals/${goalId}/links`, linkData),

  // Update asset link
  updateLink: (goalId, linkId, data) => api.put(`/goals/${goalId}/links/${linkId}`, data),

  // Remove asset link
  removeLink: (goalId, linkId) => api.delete(`/goals/${goalId}/links/${linkId}`),

  // ===== Contributions =====

  // Get contribution history
  getContributions: (goalId) => api.get(`/goals/${goalId}/contributions`),

  // Add manual contribution
  addContribution: (goalId, data) => api.post(`/goals/${goalId}/contributions`, data),

  // ===== Progress & History =====

  // Get current progress details
  getProgress: (goalId) => api.get(`/goals/${goalId}/progress`),

  // Get historical progress
  getHistory: (goalId, days = 30) => api.get(`/goals/${goalId}/history?days=${days}`),

  // Record daily snapshot (can be called periodically)
  recordSnapshot: () => api.post('/goals/snapshot'),

  // ===== Utility =====

  // Get all allocations for an asset (to check availability)
  getAssetAllocations: (assetId) => api.get(`/goals/asset-allocations/${assetId}`),

  // Force re-migration (for debugging)
  resetMigration: () => {
    localStorage.removeItem(MIGRATION_KEY);
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
  FIRE: {
    label: 'FIRE',
    icon: 'fire',
    color: '#EF4444',
    description: 'Financial independence goal',
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
    color: '#00C7BE',
    description: 'Your custom financial goal',
  },
};

// Progress modes
export const PROGRESS_MODES = {
  AUTO: {
    label: 'Auto (From Assets)',
    description: 'Progress calculated from linked assets',
    icon: 'link',
  },
  MANUAL: {
    label: 'Manual',
    description: 'You enter progress manually',
    icon: 'edit',
  },
  HYBRID: {
    label: 'Hybrid',
    description: 'Linked assets + manual contributions',
    icon: 'layers',
  },
};

// Link types
export const LINK_TYPES = {
  FUNDING: {
    label: 'Funding',
    description: 'Asset contributes to goal progress',
    color: '#10B981',
  },
  TARGET: {
    label: 'Target',
    description: 'Goal is to acquire this asset',
    color: '#3B82F6',
  },
  TRACKER: {
    label: 'Tracker',
    description: 'Monitor only, no progress contribution',
    color: '#6B7280',
  },
};
