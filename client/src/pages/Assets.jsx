import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { assetService, priceService, ASSET_CONFIG } from '../services/assets';

export default function Assets() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [prices, setPrices] = useState({});
  const [pricesLoading, setPricesLoading] = useState(false);

  useEffect(() => {
    fetchAssets();
  }, []);

  const fetchAssets = async () => {
    try {
      const response = await assetService.getAll();
      const assetList = response.data.assets;
      setAssets(assetList);

      // Fetch prices for equity assets
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
    setPricesLoading(true);
    try {
      const symbols = equityAssets.map(a => ({
        symbol: a.asset_type === 'MUTUAL_FUND' ? a.symbol : `${a.symbol}.${a.exchange === 'BSE' ? 'BO' : 'NS'}`,
        type: a.asset_type === 'MUTUAL_FUND' ? 'mf' : 'stock'
      }));

      const response = await priceService.getBulkPrices(symbols);
      setPrices(response.data.prices || {});
    } catch (error) {
      console.error('Error fetching prices:', error);
    } finally {
      setPricesLoading(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) {
      return;
    }

    try {
      await assetService.delete(id);
      setAssets(assets.filter((a) => a.id !== id));
    } catch (error) {
      console.error('Error deleting asset:', error);
      alert('Failed to delete asset');
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getAssetValue = (asset) => {
    // For equity assets, use current market price if available
    if (asset.category === 'EQUITY' && asset.quantity && asset.symbol) {
      const priceKey = asset.asset_type === 'MUTUAL_FUND'
        ? asset.symbol
        : `${asset.symbol}.${asset.exchange === 'BSE' ? 'BO' : 'NS'}`;
      const priceData = prices[priceKey];
      if (priceData?.price) {
        return asset.quantity * priceData.price;
      }
      // Fallback to invested value
      if (asset.avg_buy_price) {
        return asset.quantity * asset.avg_buy_price;
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

  const getInvestedValue = (asset) => {
    // For equity/crypto: quantity * avg_buy_price
    if (asset.quantity && asset.avg_buy_price) {
      return asset.quantity * asset.avg_buy_price;
    }
    // For fixed income: principal
    if (asset.principal) {
      return asset.principal;
    }
    // For real estate, physical, other: purchase_price
    if (asset.purchase_price) {
      return asset.purchase_price;
    }
    // For savings: balance (no invested vs current distinction)
    if (asset.balance) {
      return asset.balance;
    }
    return 0;
  };

  const getPriceInfo = (asset) => {
    if (asset.category !== 'EQUITY' || !asset.symbol) return null;
    const priceKey = asset.asset_type === 'MUTUAL_FUND'
      ? asset.symbol
      : `${asset.symbol}.${asset.exchange === 'BSE' ? 'BO' : 'NS'}`;
    return prices[priceKey];
  };

  // Calculate maturity value for fixed income assets
  const getMaturityValue = (asset) => {
    if (asset.category !== 'FIXED_INCOME' || !asset.principal || !asset.interest_rate) {
      return null;
    }

    const principal = asset.principal;
    const rate = asset.interest_rate / 100;

    // Calculate years between start and maturity date
    let years = 1; // Default to 1 year if dates not provided
    if (asset.start_date && asset.maturity_date) {
      const start = new Date(asset.start_date);
      const maturity = new Date(asset.maturity_date);
      years = (maturity - start) / (365.25 * 24 * 60 * 60 * 1000);
    }

    // Quarterly compounding (common for Indian FDs)
    const n = 4; // compounds per year
    const maturityValue = principal * Math.pow(1 + rate / n, n * years);

    return maturityValue;
  };

  // Calculate XIRR for an asset
  const calculateXIRR = (asset, currentValue, investedValue) => {
    // Get purchase/start date
    const purchaseDate = asset.purchase_date || asset.start_date;
    if (!purchaseDate || investedValue <= 0 || currentValue <= 0) {
      return null;
    }

    const startDate = new Date(purchaseDate);
    const endDate = new Date();

    // Cash flows: negative for investment, positive for current value
    const cashFlows = [-investedValue, currentValue];
    const dates = [startDate, endDate];

    // XIRR calculation using Newton-Raphson method
    const daysDiff = (d1, d2) => (d2 - d1) / (1000 * 60 * 60 * 24);

    const xnpv = (rate, cashFlows, dates) => {
      let result = 0;
      for (let i = 0; i < cashFlows.length; i++) {
        const days = daysDiff(dates[0], dates[i]);
        result += cashFlows[i] / Math.pow(1 + rate, days / 365);
      }
      return result;
    };

    const xnpvDerivative = (rate, cashFlows, dates) => {
      let result = 0;
      for (let i = 0; i < cashFlows.length; i++) {
        const days = daysDiff(dates[0], dates[i]);
        result -= (days / 365) * cashFlows[i] / Math.pow(1 + rate, days / 365 + 1);
      }
      return result;
    };

    // Newton-Raphson iteration
    let rate = 0.1; // Initial guess 10%
    const tolerance = 0.0001;
    const maxIterations = 100;

    for (let i = 0; i < maxIterations; i++) {
      const npv = xnpv(rate, cashFlows, dates);
      const derivative = xnpvDerivative(rate, cashFlows, dates);

      if (Math.abs(derivative) < 1e-10) break;

      const newRate = rate - npv / derivative;

      if (Math.abs(newRate - rate) < tolerance) {
        return newRate * 100; // Return as percentage
      }

      rate = newRate;

      // Prevent extreme values
      if (rate < -0.99) rate = -0.99;
      if (rate > 10) rate = 10; // 1000% max
    }

    return rate * 100; // Return as percentage
  };

  const filteredAssets = assets.filter((asset) => {
    const matchesFilter = filter === 'ALL' || asset.category === filter;
    const matchesSearch =
      searchTerm === '' ||
      asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.symbol?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const totalCurrentValue = filteredAssets.reduce((sum, asset) => sum + getAssetValue(asset), 0);
  const totalInvestedValue = filteredAssets.reduce((sum, asset) => sum + getInvestedValue(asset), 0);
  const totalGainLoss = totalCurrentValue - totalInvestedValue;
  const totalGainLossPercent = totalInvestedValue > 0 ? (totalGainLoss / totalInvestedValue) * 100 : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Get count of assets per category
  const getCategoryCount = (category) => {
    return assets.filter(a => a.category === category).length;
  };

  // Get categories that have assets
  const categoriesWithAssets = Object.keys(ASSET_CONFIG).filter(cat => getCategoryCount(cat) > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Assets</h1>
        <Link
          to="/assets/add"
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-medium"
        >
          + Add Asset
        </Link>
      </div>

      {/* Category Tabs */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="border-b overflow-x-auto">
          <nav className="flex -mb-px" aria-label="Tabs">
            <button
              onClick={() => setFilter('ALL')}
              className={`whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm ${
                filter === 'ALL'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              All
              <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${
                filter === 'ALL' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
              }`}>
                {assets.length}
              </span>
            </button>
            {Object.entries(ASSET_CONFIG).map(([key, config]) => {
              const count = getCategoryCount(key);
              if (count === 0) return null;
              return (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm ${
                    filter === key
                      ? 'border-current'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                  style={filter === key ? { borderColor: config.color, color: config.color } : {}}
                >
                  {config.label}
                  <span
                    className="ml-2 py-0.5 px-2 rounded-full text-xs"
                    style={filter === key
                      ? { backgroundColor: `${config.color}20`, color: config.color }
                      : { backgroundColor: '#f3f4f6', color: '#4b5563' }
                    }
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Search and Summary inside tab content */}
        <div className="p-4 border-b">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <input
              type="text"
              placeholder="Search by name or symbol..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full sm:w-64 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="text-gray-600">
                {filteredAssets.length} {filteredAssets.length === 1 ? 'asset' : 'assets'}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Invested:</span>
                <span className="font-medium text-gray-700">{formatCurrency(totalInvestedValue)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Current:</span>
                <span className="font-semibold text-gray-900">{formatCurrency(totalCurrentValue)}</span>
              </div>
              {totalInvestedValue > 0 && totalGainLoss !== 0 && (
                <div className={`flex items-center gap-1 font-medium ${totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  <span>{totalGainLoss >= 0 ? '+' : ''}{formatCurrency(totalGainLoss)}</span>
                  <span className="text-xs">({totalGainLossPercent >= 0 ? '+' : ''}{totalGainLossPercent.toFixed(1)}%)</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Assets List */}
        {filteredAssets.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  {filter === 'ALL' && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Category
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Details
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Invested
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Current Value
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Gain/Loss
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    XIRR
                  </th>
                  {(filter === 'ALL' || filter === 'FIXED_INCOME') && (
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Maturity Value
                    </th>
                  )}
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAssets.map((asset) => {
                  const priceInfo = getPriceInfo(asset);
                  const currentValue = getAssetValue(asset);
                  const investedValue = getInvestedValue(asset);
                  const hasLivePrice = asset.category === 'EQUITY' && priceInfo?.price;
                  const gainLoss = currentValue - investedValue;
                  const gainLossPercent = investedValue > 0 ? (gainLoss / investedValue) * 100 : 0;
                  const xirr = calculateXIRR(asset, currentValue, investedValue);

                  return (
                    <tr key={asset.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{asset.name}</div>
                        {asset.symbol && (
                          <div className="text-sm text-gray-500">{asset.symbol}</div>
                        )}
                      </td>
                      {filter === 'ALL' && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className="px-2 py-1 rounded-full text-xs font-medium"
                            style={{
                              backgroundColor: `${ASSET_CONFIG[asset.category]?.color}20`,
                              color: ASSET_CONFIG[asset.category]?.color,
                            }}
                          >
                            {ASSET_CONFIG[asset.category]?.label || asset.category}
                          </span>
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {asset.asset_type.replace(/_/g, ' ')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {asset.quantity && `${asset.quantity} units`}
                        {asset.interest_rate && `${asset.interest_rate}% p.a.`}
                        {asset.institution && asset.institution}
                        {asset.location && asset.location}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-600">
                        {investedValue > 0 ? formatCurrency(investedValue) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="font-medium text-gray-900">
                          {formatCurrency(currentValue)}
                          {pricesLoading && asset.category === 'EQUITY' && (
                            <span className="ml-1 text-xs text-gray-400">...</span>
                          )}
                        </div>
                        {hasLivePrice && (
                          <div className="text-xs text-gray-500">
                            @ {formatCurrency(priceInfo.price)}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {investedValue > 0 && currentValue !== investedValue ? (
                          <div>
                            <div className={`font-medium text-sm ${gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {gainLoss >= 0 ? '+' : ''}{formatCurrency(gainLoss)}
                            </div>
                            <div className={`text-xs ${gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {gainLossPercent >= 0 ? '+' : ''}{gainLossPercent.toFixed(1)}%
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {xirr !== null ? (
                          <span className={`font-medium text-sm ${xirr >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {xirr >= 0 ? '+' : ''}{xirr.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      {(filter === 'ALL' || filter === 'FIXED_INCOME') && (
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          {asset.category === 'FIXED_INCOME' ? (
                            (() => {
                              const maturityValue = getMaturityValue(asset);
                              if (maturityValue) {
                                const maturityGain = maturityValue - (asset.principal || 0);
                                return (
                                  <div>
                                    <div className="font-medium text-gray-900">
                                      {formatCurrency(maturityValue)}
                                    </div>
                                    <div className="text-xs text-green-600">
                                      +{formatCurrency(maturityGain)}
                                    </div>
                                  </div>
                                );
                              }
                              return <span className="text-gray-400">-</span>;
                            })()
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <Link
                          to={`/assets/edit/${asset.id}`}
                          className="text-blue-600 hover:text-blue-700 mr-4"
                        >
                          Edit
                        </Link>
                        <button
                          onClick={() => handleDelete(asset.id, asset.name)}
                          className="text-red-600 hover:text-red-700"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <p className="text-gray-500 mb-4">
              {searchTerm || filter !== 'ALL'
                ? 'No assets match your filters.'
                : 'No assets added yet.'}
            </p>
            {!searchTerm && filter === 'ALL' && (
              <Link
                to="/assets/add"
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Add your first asset
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
