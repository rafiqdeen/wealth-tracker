import api from './api';

export const transactionService = {
  // Create a new transaction (BUY or SELL)
  create: (data) => api.post('/transactions', data),

  // Get all transactions for an asset
  getByAsset: (assetId) => api.get(`/transactions/asset/${assetId}`),

  // Get single transaction
  getById: (id) => api.get(`/transactions/${id}`),

  // Delete a transaction
  delete: (id) => api.delete(`/transactions/${id}`),
};
