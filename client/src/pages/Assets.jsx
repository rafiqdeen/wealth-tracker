import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { assetService, priceService, ASSET_CONFIG } from '../services/assets';
import { Card, Button, SearchInput, AssetsSkeleton } from '../components/apple';
import { spring, staggerContainer, staggerItem } from '../utils/animations';
import { categoryColors } from '../constants/theme';
import { formatCurrency, formatCompact } from '../utils/formatting';

export default function Assets() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [prices, setPrices] = useState({});
  const [expandedCategories, setExpandedCategories] = useState({});

  useEffect(() => {
    fetchAssets();
  }, []);

  const fetchAssets = async () => {
    try {
      const response = await assetService.getAll();
      const assetList = response.data.assets;
      setAssets(assetList);

      const equityAssets = assetList.filter(a => a.category === 'EQUITY' && a.symbol);
      if (equityAssets.length > 0) {
        fetchPrices(equityAssets);
      }
    } catch (error) {
      console.error('Error fetching assets:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPrices = async (equityAssets) => {
    try {
      const symbols = equityAssets.map(a => ({
        symbol: a.asset_type === 'MUTUAL_FUND' ? a.symbol : `${a.symbol}.${a.exchange === 'BSE' ? 'BO' : 'NS'}`,
        type: a.asset_type === 'MUTUAL_FUND' ? 'mf' : 'stock'
      }));
      const response = await priceService.getBulkPrices(symbols);
      setPrices(response.data.prices || {});
    } catch (error) {
      console.error('Error fetching prices:', error);
    }
  };

  const handleDelete = async (id, name, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${name}"?`)) return;
    try {
      await assetService.delete(id);
      setAssets(assets.filter((a) => a.id !== id));
    } catch (error) {
      alert('Failed to delete');
    }
  };

  const getAssetValue = (asset) => {
    if (asset.category === 'EQUITY' && asset.quantity && asset.symbol) {
      const priceKey = asset.asset_type === 'MUTUAL_FUND' ? asset.symbol : `${asset.symbol}.${asset.exchange === 'BSE' ? 'BO' : 'NS'}`;
      const priceData = prices[priceKey];
      if (priceData?.price) return asset.quantity * priceData.price;
      if (asset.avg_buy_price) return asset.quantity * asset.avg_buy_price;
    }
    if (asset.quantity && asset.avg_buy_price) return asset.quantity * asset.avg_buy_price;
    if (asset.principal) return asset.principal;
    if (asset.current_value) return asset.current_value;
    if (asset.purchase_price) return asset.purchase_price;
    if (asset.balance) return asset.balance;
    return 0;
  };

  const getInvestedValue = (asset) => {
    if (asset.quantity && asset.avg_buy_price) return asset.quantity * asset.avg_buy_price;
    if (asset.principal) return asset.principal;
    if (asset.purchase_price) return asset.purchase_price;
    if (asset.balance) return asset.balance;
    return 0;
  };

  const getGainLoss = (asset) => {
    const current = getAssetValue(asset);
    const invested = getInvestedValue(asset);
    return current - invested;
  };

  const getGainPercent = (asset) => {
    const current = getAssetValue(asset);
    const invested = getInvestedValue(asset);
    return invested > 0 ? ((current - invested) / invested) * 100 : 0;
  };

  const filteredAssets = assets.filter((asset) => {
    if (!searchTerm) return true;
    return asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           asset.symbol?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const groupedAssets = filteredAssets.reduce((groups, asset) => {
    if (!groups[asset.category]) groups[asset.category] = [];
    groups[asset.category].push(asset);
    return groups;
  }, {});

  const totalCurrentValue = filteredAssets.reduce((sum, asset) => sum + getAssetValue(asset), 0);
  const totalInvestedValue = filteredAssets.reduce((sum, asset) => sum + getInvestedValue(asset), 0);
  const totalGainLoss = totalCurrentValue - totalInvestedValue;
  const totalGainPercent = totalInvestedValue > 0 ? (totalGainLoss / totalInvestedValue) * 100 : 0;

  // Category expand/collapse helpers
  const isCategoryExpanded = (category) => expandedCategories[category] !== false;

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !isCategoryExpanded(category)
    }));
  };

  const expandAll = () => {
    const allExpanded = {};
    Object.keys(groupedAssets).forEach(cat => { allExpanded[cat] = true; });
    setExpandedCategories(allExpanded);
  };

  const collapseAll = () => {
    const allCollapsed = {};
    Object.keys(groupedAssets).forEach(cat => { allCollapsed[cat] = false; });
    setExpandedCategories(allCollapsed);
  };

  const allExpanded = Object.keys(groupedAssets).every(cat => isCategoryExpanded(cat));
  const allCollapsed = Object.keys(groupedAssets).every(cat => !isCategoryExpanded(cat));

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)]">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <AssetsSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.gentle}
          className="flex items-center justify-between mb-6"
        >
          <div>
            <h1 className="text-[28px] font-semibold text-[var(--label-primary)]">Assets</h1>
            <p className="text-[15px] text-[var(--label-secondary)]">{assets.length} total assets</p>
          </div>
          <Link to="/assets/add">
            <Button variant="filled" icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            }>
              Add Asset
            </Button>
          </Link>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="space-y-4"
        >
          {/* Summary Card */}
          <motion.div variants={staggerItem}>
            <Card padding="p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-[13px] font-medium text-[var(--label-tertiary)] uppercase tracking-wide">Portfolio Value</p>
                  <p className="text-[34px] font-light text-[var(--label-primary)] tracking-tight">{formatCurrency(totalCurrentValue)}</p>
                </div>
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-[13px] text-[var(--label-tertiary)]">Invested</p>
                    <p className="text-[17px] font-medium text-[var(--label-primary)]">{formatCompact(totalInvestedValue)}</p>
                  </div>
                  <div>
                    <p className="text-[13px] text-[var(--label-tertiary)]">Returns</p>
                    <p className={`text-[17px] font-semibold ${totalGainLoss >= 0 ? 'text-[var(--system-green)]' : 'text-[var(--system-red)]'}`}>
                      {totalGainLoss >= 0 ? '+' : ''}{formatCompact(totalGainLoss)} ({totalGainPercent >= 0 ? '+' : ''}{totalGainPercent.toFixed(1)}%)
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Search and Expand/Collapse Controls */}
          <motion.div variants={staggerItem} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <SearchInput
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClear={() => setSearchTerm('')}
                placeholder="Search assets..."
              />
            </div>
            {Object.keys(groupedAssets).length > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={expandAll}
                  disabled={allExpanded}
                  className={`px-3 py-2 text-[13px] font-medium rounded-lg transition-colors ${
                    allExpanded ? 'text-[var(--label-quaternary)] cursor-not-allowed' : 'text-[var(--system-blue)] hover:bg-[var(--system-blue)]/10'
                  }`}
                >
                  Expand All
                </button>
                <button
                  onClick={collapseAll}
                  disabled={allCollapsed}
                  className={`px-3 py-2 text-[13px] font-medium rounded-lg transition-colors ${
                    allCollapsed ? 'text-[var(--label-quaternary)] cursor-not-allowed' : 'text-[var(--system-blue)] hover:bg-[var(--system-blue)]/10'
                  }`}
                >
                  Collapse All
                </button>
              </div>
            )}
          </motion.div>

          {/* Category Sections - Compact List */}
          {Object.entries(groupedAssets).map(([category, categoryAssets], categoryIndex) => {
            const colors = categoryColors[category];
            const categoryTotal = categoryAssets.reduce((sum, a) => sum + getAssetValue(a), 0);
            const categoryInvested = categoryAssets.reduce((sum, a) => sum + getInvestedValue(a), 0);
            const categoryGain = categoryTotal - categoryInvested;
            const categoryGainPercent = categoryInvested > 0 ? (categoryGain / categoryInvested) * 100 : 0;
            const isExpanded = isCategoryExpanded(category);

            return (
              <motion.div
                key={category}
                variants={staggerItem}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring.gentle, delay: categoryIndex * 0.05 }}
              >
                <Card padding="p-0" className="overflow-hidden">
                  {/* Category Header */}
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-[var(--fill-tertiary)]/50 hover:bg-[var(--fill-tertiary)] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <motion.div
                        animate={{ rotate: isExpanded ? 90 : 0 }}
                        transition={spring.snappy}
                        className="text-[var(--label-tertiary)]"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </motion.div>
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors?.color || 'var(--system-gray)' }} />
                      <span className="text-[15px] font-semibold text-[var(--label-primary)]">{ASSET_CONFIG[category]?.label}</span>
                      <span className="text-[13px] text-[var(--label-tertiary)] bg-[var(--fill-secondary)] px-1.5 py-0.5 rounded">
                        {categoryAssets.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-[15px] font-medium text-[var(--label-primary)]">{formatCompact(categoryTotal)}</span>
                      <span className={`text-[13px] font-semibold px-2 py-0.5 rounded-full ${categoryGain >= 0 ? 'pnl-badge-positive' : 'pnl-badge-negative'}`}>
                        {categoryGain >= 0 ? '+' : ''}{categoryGainPercent.toFixed(1)}%
                      </span>
                    </div>
                  </button>

                  {/* Asset List - Collapsible */}
                  <div
                    className="grid transition-[grid-template-rows] duration-300 ease-out"
                    style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
                  >
                    <div className="overflow-hidden">
                      <motion.div
                        initial={false}
                        animate={{ opacity: isExpanded ? 1 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        {/* Table Header - Desktop */}
                        <div className="hidden sm:flex items-center px-4 py-2 border-b border-[var(--separator)]/30 text-[12px] font-medium text-[var(--label-tertiary)] uppercase tracking-wide">
                          <div className="flex-1 min-w-0">Name</div>
                          <div className="w-20 text-right">Qty</div>
                          <div className="w-24 text-right">Value</div>
                          <div className="w-24 text-right">P&L</div>
                          <div className="w-16"></div>
                        </div>

                        {/* Asset Rows */}
                        {categoryAssets.map((asset, index) => {
                          const currentValue = getAssetValue(asset);
                          const gainLoss = getGainLoss(asset);
                          const gainPercent = getGainPercent(asset);

                          return (
                            <Link
                              key={asset.id}
                              to={`/assets/edit/${asset.id}`}
                              className="block"
                            >
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: index * 0.02 }}
                                className="group flex items-center px-4 py-3 hover:bg-[var(--fill-tertiary)]/50 transition-colors border-b border-[var(--separator)]/20 last:border-b-0"
                              >
                                {/* Name & Symbol */}
                                <div className="flex-1 min-w-0 pr-3">
                                  <p className="text-[15px] font-medium text-[var(--label-primary)] truncate">{asset.name}</p>
                                  <p className="text-[13px] text-[var(--label-tertiary)] truncate">
                                    {asset.symbol || asset.asset_type.replace(/_/g, ' ')}
                                  </p>
                                </div>

                                {/* Mobile: Value & P&L */}
                                <div className="sm:hidden text-right">
                                  <p className="text-[15px] font-medium text-[var(--label-primary)]">{formatCompact(currentValue)}</p>
                                  <p className={`text-[13px] font-medium ${gainPercent >= 0 ? 'text-[var(--system-green)]' : 'text-[var(--system-red)]'}`}>
                                    {gainPercent >= 0 ? '+' : ''}{gainPercent.toFixed(1)}%
                                  </p>
                                </div>

                                {/* Desktop: Quantity */}
                                <div className="hidden sm:block w-20 text-right">
                                  <p className="text-[14px] text-[var(--label-primary)]">
                                    {asset.quantity || '-'}
                                  </p>
                                </div>

                                {/* Desktop: Current Value */}
                                <div className="hidden sm:block w-24 text-right">
                                  <p className="text-[14px] font-medium text-[var(--label-primary)]">{formatCompact(currentValue)}</p>
                                </div>

                                {/* Desktop: P&L */}
                                <div className="hidden sm:block w-24 text-right">
                                  <p className={`text-[14px] font-medium ${gainPercent >= 0 ? 'text-[var(--system-green)]' : 'text-[var(--system-red)]'}`}>
                                    {gainPercent >= 0 ? '+' : ''}{gainPercent.toFixed(1)}%
                                  </p>
                                  <p className={`text-[12px] ${gainLoss >= 0 ? 'text-[var(--system-green)]' : 'text-[var(--system-red)]'}`}>
                                    {gainLoss >= 0 ? '+' : ''}{formatCompact(gainLoss)}
                                  </p>
                                </div>

                                {/* Desktop: Actions */}
                                <div className="hidden sm:flex w-16 items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {asset.category === 'EQUITY' && (
                                    <Link
                                      to={`/assets/${asset.id}/transactions`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="p-1.5 text-[var(--system-purple)] hover:bg-[var(--system-purple)]/10 rounded-md transition-colors"
                                      title="History"
                                    >
                                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                    </Link>
                                  )}
                                  <button
                                    onClick={(e) => handleDelete(asset.id, asset.name, e)}
                                    className="p-1.5 text-[var(--system-red)] hover:bg-[var(--system-red)]/10 rounded-md transition-colors"
                                    title="Delete"
                                  >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                    </svg>
                                  </button>
                                </div>
                              </motion.div>
                            </Link>
                          );
                        })}
                      </motion.div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}

          {/* Empty State */}
          {Object.keys(groupedAssets).length === 0 && (
            <motion.div variants={staggerItem}>
              <Card padding="p-12" className="text-center">
                <div className="w-16 h-16 bg-[var(--fill-tertiary)] rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-[var(--label-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <h3 className="text-[20px] font-semibold text-[var(--label-primary)] mb-1">
                  {searchTerm ? 'No results found' : 'No assets yet'}
                </h3>
                <p className="text-[15px] text-[var(--label-secondary)] mb-6 max-w-sm mx-auto">
                  {searchTerm ? 'Try a different search term' : 'Start tracking your wealth by adding your first asset'}
                </p>
                {!searchTerm && (
                  <Link to="/assets/add">
                    <Button variant="filled" size="lg">
                      Add Your First Asset
                    </Button>
                  </Link>
                )}
              </Card>
            </motion.div>
          )}
        </motion.div>

        {/* Floating Add Button */}
        <Link to="/assets/add">
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={spring.snappy}
            className="fixed bottom-6 right-6 w-14 h-14 bg-[var(--system-blue)] text-white rounded-full shadow-lg flex items-center justify-center z-50"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </motion.div>
        </Link>
      </div>
    </div>
  );
}
