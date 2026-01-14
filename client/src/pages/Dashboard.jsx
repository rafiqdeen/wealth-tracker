import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { assetService, priceService, ASSET_CONFIG } from '../services/assets';
import { Card, Button, DashboardSkeleton, AnimatedNumber } from '../components/apple';
import { spring, staggerContainer, staggerItem } from '../utils/animations';
import { categoryColors } from '../constants/theme';
import { formatCurrency, formatCompact, formatPercent, formatPrice } from '../utils/formatting';

export default function Dashboard() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [prices, setPrices] = useState({});
  const [selectedPeriod, setSelectedPeriod] = useState('ALL');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const assetsRes = await assetService.getAll();
      setAssets(assetsRes.data.assets);

      const equityAssets = assetsRes.data.assets.filter(a => a.category === 'EQUITY' && a.symbol);
      if (equityAssets.length > 0) {
        const symbols = equityAssets.map(a => ({
          symbol: a.asset_type === 'MUTUAL_FUND' ? a.symbol : `${a.symbol}.${a.exchange === 'BSE' ? 'BO' : 'NS'}`,
          type: a.asset_type === 'MUTUAL_FUND' ? 'mf' : 'stock'
        }));
        const priceRes = await priceService.getBulkPrices(symbols);
        setPrices(priceRes.data.prices || {});
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
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

  const getCurrentPrice = (asset) => {
    if (asset.category === 'EQUITY' && asset.symbol) {
      const priceKey = asset.asset_type === 'MUTUAL_FUND' ? asset.symbol : `${asset.symbol}.${asset.exchange === 'BSE' ? 'BO' : 'NS'}`;
      return prices[priceKey]?.price || asset.avg_buy_price || 0;
    }
    return asset.avg_buy_price || 0;
  };

  const getPriceChange = (asset) => {
    if (asset.category === 'EQUITY' && asset.symbol) {
      const priceKey = asset.asset_type === 'MUTUAL_FUND' ? asset.symbol : `${asset.symbol}.${asset.exchange === 'BSE' ? 'BO' : 'NS'}`;
      return prices[priceKey]?.changePercent || 0;
    }
    return 0;
  };

  // Calculate totals
  const totalValue = assets.reduce((sum, asset) => sum + getAssetValue(asset), 0);
  const totalInvested = assets.reduce((sum, asset) => sum + getInvestedValue(asset), 0);
  const totalPnL = totalValue - totalInvested;
  const totalPnLPercent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

  // Day's change (estimated from equity assets)
  const dayChange = assets
    .filter(a => a.category === 'EQUITY')
    .reduce((sum, asset) => {
      const value = getAssetValue(asset);
      const changePercent = getPriceChange(asset);
      return sum + (value * changePercent / 100);
    }, 0);
  const dayChangePercent = totalValue > 0 ? (dayChange / (totalValue - dayChange)) * 100 : 0;

  // Holdings sorted by value
  const holdings = [...assets]
    .map(asset => ({
      ...asset,
      currentValue: getAssetValue(asset),
      investedValue: getInvestedValue(asset),
      currentPrice: getCurrentPrice(asset),
      pnl: getAssetValue(asset) - getInvestedValue(asset),
      pnlPercent: getInvestedValue(asset) > 0
        ? ((getAssetValue(asset) - getInvestedValue(asset)) / getInvestedValue(asset)) * 100
        : 0,
      dayChange: getPriceChange(asset),
    }))
    .sort((a, b) => b.currentValue - a.currentValue);

  // Category breakdown for pie chart
  const categoryBreakdown = Object.entries(
    assets.reduce((acc, asset) => {
      const value = getAssetValue(asset);
      acc[asset.category] = (acc[asset.category] || 0) + value;
      return acc;
    }, {})
  ).map(([category, value]) => ({
    name: ASSET_CONFIG[category]?.label || category,
    value,
    color: categoryColors[category]?.color || 'var(--system-gray)',
    percent: totalValue > 0 ? (value / totalValue) * 100 : 0,
  })).sort((a, b) => b.value - a.value);

  // Mock chart data (in real app, this would come from historical data)
  const chartData = [
    { date: 'Jan', value: totalInvested * 0.85 },
    { date: 'Feb', value: totalInvested * 0.88 },
    { date: 'Mar', value: totalInvested * 0.92 },
    { date: 'Apr', value: totalInvested * 0.90 },
    { date: 'May', value: totalInvested * 0.95 },
    { date: 'Jun', value: totalInvested * 0.98 },
    { date: 'Jul', value: totalInvested * 1.02 },
    { date: 'Aug', value: totalInvested * 1.05 },
    { date: 'Sep', value: totalInvested * 1.03 },
    { date: 'Oct', value: totalInvested * 1.08 },
    { date: 'Nov', value: totalInvested * 1.12 },
    { date: 'Now', value: totalValue },
  ];

  const periods = ['1D', '1W', '1M', '3M', '1Y', 'ALL'];

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)]">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <DashboardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="space-y-4"
        >
          {/* Portfolio Value Section */}
          <motion.div variants={staggerItem}>
            <Card padding="p-0" className="overflow-hidden">
              <div className="p-5 pb-0">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  {/* Main Value */}
                  <div>
                    <p className="text-[13px] text-[var(--label-tertiary)] mb-1">Portfolio Value</p>
                    <p className="text-[36px] font-semibold text-[var(--label-primary)] tracking-tight leading-none">
                      {formatCurrency(totalValue)}
                    </p>
                    <div className="flex items-center gap-4 mt-2">
                      <div className={`flex items-center gap-1 ${totalPnL >= 0 ? 'text-[var(--system-green)]' : 'text-[var(--system-red)]'}`}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={totalPnL >= 0 ? "M5 10l7-7m0 0l7 7m-7-7v18" : "M19 14l-7 7m0 0l-7-7m7 7V3"} />
                        </svg>
                        <span className="text-[15px] font-semibold">
                          {totalPnL >= 0 ? '+' : ''}{formatCompact(totalPnL)} ({formatPercent(totalPnLPercent)})
                        </span>
                      </div>
                      <span className="text-[13px] text-[var(--label-tertiary)]">Overall</span>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="flex flex-wrap gap-6 lg:gap-8">
                    <div>
                      <p className="text-[11px] font-medium text-[var(--label-tertiary)] uppercase tracking-wider">Invested</p>
                      <p className="text-[20px] font-semibold text-[var(--label-primary)]">{formatCompact(totalInvested)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-[var(--label-tertiary)] uppercase tracking-wider">Current</p>
                      <p className="text-[20px] font-semibold text-[var(--label-primary)]">{formatCompact(totalValue)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-[var(--label-tertiary)] uppercase tracking-wider">Day's P&L</p>
                      <p className={`text-[20px] font-semibold ${dayChange >= 0 ? 'text-[var(--system-green)]' : 'text-[var(--system-red)]'}`}>
                        {dayChange >= 0 ? '+' : ''}{formatCompact(dayChange)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Period Selector */}
                <div className="flex gap-1 mt-4 mb-2">
                  {periods.map((period) => (
                    <button
                      key={period}
                      onClick={() => setSelectedPeriod(period)}
                      className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                        selectedPeriod === period
                          ? 'bg-[var(--system-blue)] text-white'
                          : 'text-[var(--label-secondary)] hover:bg-[var(--fill-tertiary)]'
                      }`}
                    >
                      {period}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chart */}
              <div className="h-[200px] mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={totalPnL >= 0 ? '#34C759' : '#FF3B30'} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={totalPnL >= 0 ? '#34C759' : '#FF3B30'} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--label-tertiary)' }} />
                    <YAxis hide domain={['dataMin - 1000', 'dataMax + 1000']} />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--separator)',
                        borderRadius: '12px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      }}
                      labelStyle={{ color: 'var(--label-primary)', fontWeight: 600 }}
                      formatter={(value) => [formatCurrency(value), 'Value']}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={totalPnL >= 0 ? '#34C759' : '#FF3B30'}
                      strokeWidth={2}
                      fill="url(#portfolioGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </motion.div>

          {/* Holdings & Allocation Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Holdings Table */}
            <motion.div variants={staggerItem} className="lg:col-span-2">
              <Card padding="p-0">
                <div className="flex items-center justify-between p-4 border-b border-[var(--separator)]/30">
                  <div>
                    <h2 className="text-[17px] font-semibold text-[var(--label-primary)]">Holdings</h2>
                    <p className="text-[13px] text-[var(--label-tertiary)]">{holdings.length} assets</p>
                  </div>
                  <Link to="/assets" className="text-[15px] font-medium text-[var(--system-blue)]">
                    View All
                  </Link>
                </div>

                {holdings.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-[var(--fill-tertiary)]/50 text-[11px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider">
                          <th className="text-left px-4 py-2.5">Name</th>
                          <th className="text-right px-4 py-2.5 hidden sm:table-cell">Qty</th>
                          <th className="text-right px-4 py-2.5 hidden md:table-cell">Avg Price</th>
                          <th className="text-right px-4 py-2.5">Current</th>
                          <th className="text-right px-4 py-2.5">P&L</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--separator)]/20">
                        {holdings.slice(0, 8).map((asset) => (
                          <tr key={asset.id} className="hover:bg-[var(--fill-tertiary)]/30 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold text-white"
                                  style={{ backgroundColor: categoryColors[asset.category]?.color || 'var(--system-gray)' }}
                                >
                                  {asset.symbol?.slice(0, 2) || asset.name?.slice(0, 2)}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[14px] font-medium text-[var(--label-primary)] truncate max-w-[150px]">
                                    {asset.name}
                                  </p>
                                  <p className="text-[12px] text-[var(--label-tertiary)]">
                                    {asset.symbol || ASSET_CONFIG[asset.category]?.label}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="text-right px-4 py-3 hidden sm:table-cell">
                              <span className="text-[14px] text-[var(--label-primary)]">
                                {asset.quantity ? asset.quantity.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '-'}
                              </span>
                            </td>
                            <td className="text-right px-4 py-3 hidden md:table-cell">
                              <span className="text-[14px] text-[var(--label-secondary)]">
                                {asset.avg_buy_price ? formatPrice(asset.avg_buy_price) : '-'}
                              </span>
                            </td>
                            <td className="text-right px-4 py-3">
                              <p className="text-[14px] font-semibold text-[var(--label-primary)]">
                                {formatCompact(asset.currentValue)}
                              </p>
                              {asset.dayChange !== 0 && (
                                <p className={`text-[11px] ${asset.dayChange >= 0 ? 'text-[var(--system-green)]' : 'text-[var(--system-red)]'}`}>
                                  {asset.dayChange >= 0 ? '+' : ''}{asset.dayChange.toFixed(2)}%
                                </p>
                              )}
                            </td>
                            <td className="text-right px-4 py-3">
                              <p className={`text-[14px] font-semibold ${asset.pnl >= 0 ? 'text-[var(--system-green)]' : 'text-[var(--system-red)]'}`}>
                                {asset.pnl >= 0 ? '+' : ''}{formatCompact(asset.pnl)}
                              </p>
                              <p className={`text-[11px] ${asset.pnlPercent >= 0 ? 'text-[var(--system-green)]' : 'text-[var(--system-red)]'}`}>
                                {asset.pnlPercent >= 0 ? '+' : ''}{asset.pnlPercent.toFixed(2)}%
                              </p>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {holdings.length > 8 && (
                      <Link
                        to="/assets"
                        className="block text-center py-3 text-[14px] font-medium text-[var(--system-blue)] border-t border-[var(--separator)]/20 hover:bg-[var(--fill-tertiary)]/30"
                      >
                        View {holdings.length - 8} more holdings
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <p className="text-[15px] text-[var(--label-tertiary)] mb-4">No holdings yet</p>
                    <Link to="/assets/add">
                      <Button variant="filled" size="sm">Add Asset</Button>
                    </Link>
                  </div>
                )}
              </Card>
            </motion.div>

            {/* Allocation Pie Chart */}
            <motion.div variants={staggerItem}>
              <Card padding="p-4">
                <h2 className="text-[17px] font-semibold text-[var(--label-primary)] mb-4">Allocation</h2>

                {categoryBreakdown.length > 0 ? (
                  <>
                    <div className="h-[180px] relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryBreakdown}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={75}
                            paddingAngle={2}
                            dataKey="value"
                          >
                            {categoryBreakdown.map((entry, index) => (
                              <Cell key={index} fill={entry.color} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                          <p className="text-[11px] text-[var(--label-tertiary)]">Total</p>
                          <p className="text-[15px] font-semibold text-[var(--label-primary)]">{formatCompact(totalValue)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 mt-4">
                      {categoryBreakdown.map((cat) => (
                        <div key={cat.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                            <span className="text-[13px] text-[var(--label-primary)]">{cat.name}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[13px] font-medium text-[var(--label-primary)]">{cat.percent.toFixed(1)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-[15px] text-[var(--label-tertiary)] text-center py-8">No data</p>
                )}
              </Card>
            </motion.div>
          </div>

          {/* Empty State */}
          {assets.length === 0 && (
            <motion.div variants={staggerItem}>
              <Card padding="p-12" className="text-center">
                <div className="w-16 h-16 bg-[var(--fill-tertiary)] rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-[var(--label-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <h3 className="text-[20px] font-semibold text-[var(--label-primary)] mb-1">Start Tracking</h3>
                <p className="text-[15px] text-[var(--label-secondary)] mb-6 max-w-sm mx-auto">
                  Add your investments to track portfolio performance
                </p>
                <Link to="/assets/add">
                  <Button variant="filled" size="lg">Add Your First Asset</Button>
                </Link>
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
            className="fixed bottom-6 right-6 w-14 h-14 bg-[var(--system-blue)] text-white rounded-full shadow-lg shadow-[var(--system-blue)]/30 flex items-center justify-center z-50"
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
