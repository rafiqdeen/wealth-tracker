import api from './api';

export const portfolioService = {
  // Record today's portfolio snapshot
  recordSnapshot: (data) => api.post('/portfolio/snapshot', data),

  // Get portfolio history
  getHistory: (period = 'ALL') => api.get(`/portfolio/history?period=${period}`),

  // Get latest snapshot
  getLatest: () => api.get('/portfolio/latest'),

  // Clear portfolio history
  clearHistory: () => api.delete('/portfolio/history'),

  // Backfill history from transactions (pass current values to project historical growth)
  backfill: (data) => api.post('/portfolio/backfill', data),

  // Get monthly investment breakdown for bar chart
  getMonthlyInvestments: (period = 'ALL') => api.get(`/portfolio/monthly-investments?period=${period}`),

  // Get cumulative investment data for line chart
  getCumulativeInvestments: (period = 'ALL') => api.get(`/portfolio/cumulative-investments?period=${period}`),
};
