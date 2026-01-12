import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts';
import { assetService, priceService, ASSET_CONFIG } from '../services/assets';

// Icons as simple SVG components
const Icons = {
  TrendingUp: () => (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  Wallet: () => (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  ),
  PieChart: () => (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
    </svg>
  ),
  Plus: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ),
  ArrowRight: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  ),
  Sparkles: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  ),
};

// Category icons mapping
const categoryIcons = {
  EQUITY: '📈',
  FIXED_INCOME: '🏦',
  REAL_ESTATE: '🏠',
  PHYSICAL: '💎',
  SAVINGS: '💰',
  CRYPTO: '₿',
  INSURANCE: '🛡️',
  OTHER: '📦',
};

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [prices, setPrices] = useState({});
  const [portfolioXIRR, setPortfolioXIRR] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [summaryRes, assetsRes] = await Promise.all([
        assetService.getSummary(),
        assetService.getAll(),
      ]);
      setSummary(summaryRes.data.summary);
      setAssets(assetsRes.data.assets);

      // Fetch live prices for equity assets
      let priceData = {};
      const equityAssets = assetsRes.data.assets.filter(a => a.category === 'EQUITY' && a.symbol);
      if (equityAssets.length > 0) {
        const symbols = equityAssets.map(a => ({
          symbol: a.asset_type === 'MUTUAL_FUND' ? a.symbol : `${a.symbol}.${a.exchange === 'BSE' ? 'BO' : 'NS'}`,
          type: a.asset_type === 'MUTUAL_FUND' ? 'mf' : 'stock'
        }));
        const priceRes = await priceService.getBulkPrices(symbols);
        priceData = priceRes.data.prices || {};
        setPrices(priceData);
      }

      // Calculate Portfolio XIRR
      const xirr = calculatePortfolioXIRR(assetsRes.data.assets, priceData);
      setPortfolioXIRR(xirr);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    if (value >= 10000000) {
      return `₹${(value / 10000000).toFixed(2)} Cr`;
    } else if (value >= 100000) {
      return `₹${(value / 100000).toFixed(2)} L`;
    }
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatFullCurrency = (value) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getAssetValue = (asset) => {
    if (asset.category === 'EQUITY' && asset.quantity && asset.symbol) {
      const priceKey = asset.asset_type === 'MUTUAL_FUND'
        ? asset.symbol
        : `${asset.symbol}.${asset.exchange === 'BSE' ? 'BO' : 'NS'}`;
      const priceData = prices[priceKey];
      if (priceData?.price) {
        return asset.quantity * priceData.price;
      }
    }
    if (asset.quantity && asset.avg_buy_price) {
      return asset.quantity * asset.avg_buy_price;
    } else if (asset.principal) {
      return asset.principal;
    } else if (asset.current_value) {
      return asset.current_value;
    } else if (asset.purchase_price) {
      return asset.purchase_price;
    } else if (asset.balance) {
      return asset.balance;
    }
    return 0;
  };

  // Get invested value for an asset
  const getInvestedValue = (asset) => {
    if (asset.quantity && asset.avg_buy_price) {
      return asset.quantity * asset.avg_buy_price;
    }
    if (asset.principal) {
      return asset.principal;
    }
    if (asset.purchase_price) {
      return asset.purchase_price;
    }
    if (asset.balance) {
      return asset.balance;
    }
    return 0;
  };

  // Calculate Portfolio XIRR using Newton-Raphson method
  const calculatePortfolioXIRR = (assetList, priceData) => {
    const cashFlows = [];
    const dates = [];

    assetList.forEach(asset => {
      const purchaseDate = asset.purchase_date || asset.start_date;
      if (!purchaseDate) return;

      const investedValue = getInvestedValue(asset);
      if (investedValue <= 0) return;

      // Add negative cash flow for investment
      cashFlows.push(-investedValue);
      dates.push(new Date(purchaseDate));
    });

    if (cashFlows.length === 0) return null;

    // Calculate total current value
    let totalCurrentValue = 0;
    assetList.forEach(asset => {
      if (asset.category === 'EQUITY' && asset.quantity && asset.symbol) {
        const priceKey = asset.asset_type === 'MUTUAL_FUND'
          ? asset.symbol
          : `${asset.symbol}.${asset.exchange === 'BSE' ? 'BO' : 'NS'}`;
        const price = priceData[priceKey]?.price;
        if (price) {
          totalCurrentValue += asset.quantity * price;
        } else if (asset.avg_buy_price) {
          totalCurrentValue += asset.quantity * asset.avg_buy_price;
        }
      } else if (asset.quantity && asset.avg_buy_price) {
        totalCurrentValue += asset.quantity * asset.avg_buy_price;
      } else if (asset.principal) {
        totalCurrentValue += asset.principal;
      } else if (asset.current_value) {
        totalCurrentValue += asset.current_value;
      } else if (asset.purchase_price) {
        totalCurrentValue += asset.purchase_price;
      } else if (asset.balance) {
        totalCurrentValue += asset.balance;
      }
    });

    if (totalCurrentValue <= 0) return null;

    // Add positive cash flow for current value at today
    cashFlows.push(totalCurrentValue);
    dates.push(new Date());

    // XIRR calculation
    const daysDiff = (d1, d2) => (d2 - d1) / (1000 * 60 * 60 * 24);

    const xnpv = (rate, cfs, ds) => {
      let result = 0;
      for (let i = 0; i < cfs.length; i++) {
        const days = daysDiff(ds[0], ds[i]);
        result += cfs[i] / Math.pow(1 + rate, days / 365);
      }
      return result;
    };

    const xnpvDerivative = (rate, cfs, ds) => {
      let result = 0;
      for (let i = 0; i < cfs.length; i++) {
        const days = daysDiff(ds[0], ds[i]);
        result -= (days / 365) * cfs[i] / Math.pow(1 + rate, days / 365 + 1);
      }
      return result;
    };

    // Newton-Raphson iteration
    let rate = 0.1;
    const tolerance = 0.0001;
    const maxIterations = 100;

    for (let i = 0; i < maxIterations; i++) {
      const npv = xnpv(rate, cashFlows, dates);
      const derivative = xnpvDerivative(rate, cashFlows, dates);

      if (Math.abs(derivative) < 1e-10) break;

      const newRate = rate - npv / derivative;

      if (Math.abs(newRate - rate) < tolerance) {
        return newRate * 100;
      }

      rate = newRate;

      if (rate < -0.99) rate = -0.99;
      if (rate > 10) rate = 10;
    }

    return rate * 100;
  };

  const pieData = summary
    ? Object.entries(summary.byCategory)
        .map(([category, data]) => ({
          name: ASSET_CONFIG[category]?.label || category,
          value: data.value,
          color: ASSET_CONFIG[category]?.color || '#6B7280',
          category,
          count: data.count,
        }))
        .sort((a, b) => b.value - a.value)
    : [];

  const totalValue = assets.reduce((sum, asset) => sum + getAssetValue(asset), 0);
  const totalInvested = assets.reduce((sum, asset) => sum + getInvestedValue(asset), 0);
  const totalGainLoss = totalValue - totalInvested;
  const totalGainLossPercent = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0;

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-500">Loading your portfolio...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Hero Section - Net Worth */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-8 text-white">
        <div className="absolute top-0 right-0 -mt-4 -mr-4 h-32 w-32 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -mb-4 -ml-4 h-24 w-24 rounded-full bg-white/10 blur-xl"></div>

        <div className="relative">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
            <div>
              <p className="text-blue-100 text-sm font-medium flex items-center gap-2">
                <Icons.Sparkles />
                Total Net Worth
              </p>
              <h1 className="text-4xl sm:text-5xl font-bold mt-2 tracking-tight">
                {formatFullCurrency(totalValue || summary?.totalValue || 0)}
              </h1>
              <p className="text-blue-200 mt-2 text-sm">
                Across {summary?.assetCount || 0} assets in {Object.keys(summary?.byCategory || {}).length} categories
              </p>

              {/* Gain/Loss Row */}
              {totalInvested > 0 && (
                <div className="flex flex-wrap items-center gap-4 mt-4">
                  <div className="flex items-center gap-2">
                    <span className="text-blue-200 text-sm">Invested:</span>
                    <span className="text-white font-medium">{formatFullCurrency(totalInvested)}</span>
                  </div>
                  <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${
                    totalGainLoss >= 0 ? 'bg-emerald-500/20 text-emerald-200' : 'bg-red-500/20 text-red-200'
                  }`}>
                    <span>{totalGainLoss >= 0 ? '+' : ''}{formatFullCurrency(totalGainLoss)}</span>
                    <span className="text-xs">({totalGainLossPercent >= 0 ? '+' : ''}{totalGainLossPercent.toFixed(1)}%)</span>
                  </div>
                </div>
              )}
            </div>

            <Link
              to="/assets/add"
              className="inline-flex items-center gap-2 bg-white text-blue-700 px-5 py-3 rounded-xl font-semibold hover:bg-blue-50 transition-colors shadow-lg shadow-blue-900/20"
            >
              <Icons.Plus />
              Add Asset
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
              <Icons.Wallet />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Assets</p>
              <p className="text-2xl font-bold text-gray-900">{summary?.assetCount || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-violet-50 rounded-xl text-violet-600">
              <Icons.PieChart />
            </div>
            <div>
              <p className="text-sm text-gray-500">Categories</p>
              <p className="text-2xl font-bold text-gray-900">{Object.keys(summary?.byCategory || {}).length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
              <Icons.TrendingUp />
            </div>
            <div>
              <p className="text-sm text-gray-500">Top Category</p>
              <p className="text-2xl font-bold text-gray-900">
                {pieData[0]?.name || '-'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Donut Chart - Asset Allocation */}
        <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Asset Allocation</h2>
          {pieData.length > 0 ? (
            <div className="relative">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatFullCurrency(value)}
                    contentStyle={{
                      borderRadius: '12px',
                      border: 'none',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      padding: '8px 12px'
                    }}
                  />
                  <Legend
                    layout="horizontal"
                    verticalAlign="bottom"
                    align="center"
                    iconType="circle"
                    iconSize={8}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 -mt-4 text-center pointer-events-none">
                <p className="text-xs text-gray-500">Total</p>
                <p className="text-xl font-bold text-gray-900">{formatCurrency(totalValue)}</p>
              </div>
            </div>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-gray-400">
              <div className="text-center">
                <div className="text-4xl mb-2">📊</div>
                <p>No data yet</p>
              </div>
            </div>
          )}
        </div>

        {/* Asset Type Distribution */}
        <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Asset Type Distribution</h2>
          {assets.length > 0 ? (
            (() => {
              const typeData = Object.entries(
                assets.reduce((acc, asset) => {
                  const type = asset.asset_type.replace(/_/g, ' ');
                  if (!acc[type]) acc[type] = { name: type, value: 0, count: 0 };
                  acc[type].value += getAssetValue(asset);
                  acc[type].count++;
                  return acc;
                }, {})
              )
                .map(([_, data]) => data)
                .sort((a, b) => b.value - a.value)
                .slice(0, 6);

              const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

              return (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={typeData} margin={{ top: 5, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis
                      dataKey="name"
                      fontSize={10}
                      tick={{ fill: '#6b7280' }}
                      axisLine={false}
                      tickLine={false}
                      angle={-45}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis
                      tickFormatter={(value) => formatCurrency(value)}
                      fontSize={11}
                      tick={{ fill: '#6b7280' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(value, name, props) => [formatFullCurrency(value), `${props.payload.count} assets`]}
                      contentStyle={{
                        borderRadius: '12px',
                        border: 'none',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {typeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              );
            })()
          ) : (
            <div className="h-[280px] flex items-center justify-center text-gray-400">
              <div className="text-center">
                <div className="text-4xl mb-2">📊</div>
                <p>No data yet</p>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Category Cards */}
      <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Portfolio Breakdown</h2>
          <Link
            to="/assets"
            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          >
            View all <Icons.ArrowRight />
          </Link>
        </div>

        {pieData.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {pieData.map((item) => {
              const percentage = totalValue > 0
                ? ((item.value / totalValue) * 100).toFixed(1)
                : 0;
              return (
                <div
                  key={item.category}
                  className="p-4 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all cursor-pointer"
                  style={{ borderLeftWidth: '4px', borderLeftColor: item.color }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">{categoryIcons[item.category] || '📦'}</span>
                    <div>
                      <p className="font-medium text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.count} {item.count === 1 ? 'asset' : 'assets'}</p>
                    </div>
                  </div>
                  <div className="flex items-end justify-between mt-3">
                    <p className="text-lg font-bold text-gray-900">{formatCurrency(item.value)}</p>
                    <span
                      className="text-sm font-medium px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${item.color}15`, color: item.color }}
                    >
                      {percentage}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="h-[150px] flex items-center justify-center">
            <div className="text-center">
              <div className="text-5xl mb-3">🎯</div>
              <p className="text-gray-500 mb-4">Start building your portfolio</p>
              <Link
                to="/assets/add"
                className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
              >
                <Icons.Plus /> Add your first asset
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Insight Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Top Holdings */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">🏆</span>
            <h3 className="font-semibold text-gray-900">Top Holdings</h3>
          </div>
          {assets.length > 0 ? (
            <div className="space-y-3">
              {[...assets]
                .sort((a, b) => getAssetValue(b) - getAssetValue(a))
                .slice(0, 3)
                .map((asset, index) => {
                  const value = getAssetValue(asset);
                  const percentage = totalValue > 0 ? ((value / totalValue) * 100).toFixed(1) : 0;
                  return (
                    <div key={asset.id} className="flex items-center gap-3">
                      <span className="text-lg font-bold text-gray-300 w-5">{index + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate text-sm">{asset.name}</p>
                        <p className="text-xs text-gray-500">{formatCurrency(value)}</p>
                      </div>
                      <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                        {percentage}%
                      </span>
                    </div>
                  );
                })}
            </div>
          ) : (
            <p className="text-gray-400 text-sm text-center py-4">No assets yet</p>
          )}
        </div>

        {/* Upcoming Maturities */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">📅</span>
            <h3 className="font-semibold text-gray-900">Upcoming Maturities</h3>
          </div>
          {(() => {
            const maturingAssets = assets
              .filter(a => a.maturity_date && new Date(a.maturity_date) > new Date())
              .sort((a, b) => new Date(a.maturity_date) - new Date(b.maturity_date))
              .slice(0, 3);

            if (maturingAssets.length === 0) {
              return <p className="text-gray-400 text-sm text-center py-4">No upcoming maturities</p>;
            }

            return (
              <div className="space-y-3">
                {maturingAssets.map((asset) => {
                  const maturityDate = new Date(asset.maturity_date);
                  const daysLeft = Math.ceil((maturityDate - new Date()) / (1000 * 60 * 60 * 24));
                  return (
                    <div key={asset.id} className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate text-sm">{asset.name}</p>
                        <p className="text-xs text-gray-500">
                          {maturityDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        daysLeft <= 30 ? 'bg-red-50 text-red-600' :
                        daysLeft <= 90 ? 'bg-amber-50 text-amber-600' :
                        'bg-green-50 text-green-600'
                      }`}>
                        {daysLeft} days
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Portfolio Insights */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">💡</span>
            <h3 className="font-semibold text-gray-900">Portfolio Insights</h3>
          </div>
          {assets.length > 0 ? (
            <div className="space-y-4">
              {portfolioXIRR !== null && (
                <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                  <span className="text-sm text-gray-500">Portfolio XIRR</span>
                  <span className={`font-semibold ${portfolioXIRR >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {portfolioXIRR >= 0 ? '+' : ''}{portfolioXIRR.toFixed(1)}% p.a.
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Avg. Holding Value</span>
                <span className="font-medium text-gray-900">
                  {formatCurrency(totalValue / assets.length)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Largest Holding</span>
                <span className="font-medium text-gray-900">
                  {(() => {
                    const maxAsset = assets.reduce((max, a) =>
                      getAssetValue(a) > getAssetValue(max) ? a : max, assets[0]);
                    return ((getAssetValue(maxAsset) / totalValue) * 100).toFixed(1) + '%';
                  })()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Diversification</span>
                <span className={`font-medium ${
                  Object.keys(summary?.byCategory || {}).length >= 4 ? 'text-green-600' :
                  Object.keys(summary?.byCategory || {}).length >= 2 ? 'text-amber-600' :
                  'text-red-600'
                }`}>
                  {Object.keys(summary?.byCategory || {}).length >= 4 ? 'Good' :
                   Object.keys(summary?.byCategory || {}).length >= 2 ? 'Moderate' : 'Low'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Equity Exposure</span>
                <span className="font-medium text-gray-900">
                  {totalValue > 0
                    ? ((summary?.byCategory?.EQUITY?.value || 0) / totalValue * 100).toFixed(1) + '%'
                    : '0%'}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-gray-400 text-sm text-center py-4">Add assets to see insights</p>
          )}
        </div>

        {/* Liquidity Overview */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">💧</span>
            <h3 className="font-semibold text-gray-900">Liquidity Overview</h3>
          </div>
          {assets.length > 0 ? (
            (() => {
              const liquidCategories = ['EQUITY', 'SAVINGS', 'CRYPTO'];
              const liquidValue = assets
                .filter(a => liquidCategories.includes(a.category))
                .reduce((sum, a) => sum + getAssetValue(a), 0);
              const illiquidValue = totalValue - liquidValue;
              const liquidPercent = totalValue > 0 ? (liquidValue / totalValue) * 100 : 0;

              return (
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-500">Liquid Assets</span>
                      <span className="font-medium text-emerald-600">{formatCurrency(liquidValue)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${liquidPercent}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-500">Illiquid Assets</span>
                      <span className="font-medium text-violet-600">{formatCurrency(illiquidValue)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-violet-500 rounded-full"
                        style={{ width: `${100 - liquidPercent}%` }}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Liquid: Stocks, Savings, Crypto
                  </p>
                </div>
              );
            })()
          ) : (
            <p className="text-gray-400 text-sm text-center py-4">No assets yet</p>
          )}
        </div>

        {/* Asset Type Distribution */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">📊</span>
            <h3 className="font-semibold text-gray-900">Asset Types</h3>
          </div>
          {assets.length > 0 ? (
            <div className="space-y-2">
              {(() => {
                const typeGroups = assets.reduce((acc, asset) => {
                  const type = asset.asset_type;
                  if (!acc[type]) acc[type] = { count: 0, value: 0 };
                  acc[type].count++;
                  acc[type].value += getAssetValue(asset);
                  return acc;
                }, {});

                return Object.entries(typeGroups)
                  .sort((a, b) => b[1].value - a[1].value)
                  .slice(0, 4)
                  .map(([type, data]) => (
                    <div key={type} className="flex items-center justify-between py-1">
                      <span className="text-sm text-gray-600">{type.replace(/_/g, ' ')}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{data.count}</span>
                        <span className="text-sm font-medium text-gray-900">{formatCurrency(data.value)}</span>
                      </div>
                    </div>
                  ));
              })()}
            </div>
          ) : (
            <p className="text-gray-400 text-sm text-center py-4">No assets yet</p>
          )}
        </div>

        {/* Goals Card */}
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-sm p-6 text-white">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">🎯</span>
            <h3 className="font-semibold">Set Your Goals</h3>
          </div>
          <p className="text-indigo-100 text-sm mb-4">
            Track your progress towards financial milestones
          </p>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-indigo-100">₹10 Lakhs</span>
                <span className="font-medium">
                  {Math.min(100, (totalValue / 1000000) * 100).toFixed(0)}%
                </span>
              </div>
              <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full"
                  style={{ width: `${Math.min(100, (totalValue / 1000000) * 100)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-indigo-100">₹1 Crore</span>
                <span className="font-medium">
                  {Math.min(100, (totalValue / 10000000) * 100).toFixed(0)}%
                </span>
              </div>
              <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full"
                  style={{ width: `${Math.min(100, (totalValue / 10000000) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Add Stock', icon: '📈', category: 'EQUITY', type: 'STOCK' },
          { label: 'Add FD', icon: '🏦', category: 'FIXED_INCOME', type: 'FD' },
          { label: 'Add Gold', icon: '💎', category: 'PHYSICAL', type: 'GOLD' },
          { label: 'Add Property', icon: '🏠', category: 'REAL_ESTATE', type: 'PROPERTY' },
        ].map((action) => (
          <Link
            key={action.label}
            to="/assets/add"
            className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/50 transition-all group"
          >
            <span className="text-2xl">{action.icon}</span>
            <span className="font-medium text-gray-700 group-hover:text-blue-700">{action.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
