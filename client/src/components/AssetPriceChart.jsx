import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { priceService } from '../services/assets';
import { formatCurrency, formatCompact } from '../utils/formatting';

const RANGE_OPTIONS = [
  { value: '1mo', label: '1M' },
  { value: '3mo', label: '3M' },
  { value: '6mo', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: '5y', label: '5Y' },
];

export default function AssetPriceChart({ symbol, type = 'stock', assetName }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [range, setRange] = useState('1mo');
  const [periodChange, setPeriodChange] = useState(null);

  useEffect(() => {
    const fetchHistorical = async () => {
      if (!symbol) return;

      setLoading(true);
      setError(null);

      try {
        const response = await priceService.getHistorical(symbol, range, type);
        const historical = response.data.historical || [];

        if (historical.length === 0) {
          setError('No historical data available');
          setData([]);
          return;
        }

        // Calculate period change
        const firstPrice = historical[0]?.close;
        const lastPrice = historical[historical.length - 1]?.close;
        if (firstPrice && lastPrice) {
          const change = lastPrice - firstPrice;
          const changePercent = ((lastPrice - firstPrice) / firstPrice) * 100;
          setPeriodChange({ change, changePercent, isPositive: change >= 0 });
        }

        // Format data for chart
        const chartData = historical.map(item => ({
          date: item.date,
          price: item.close,
          displayDate: formatDate(item.date, range),
        }));

        setData(chartData);
      } catch (err) {
        console.error('Failed to fetch historical data:', err);
        setError('Failed to load chart data');
      } finally {
        setLoading(false);
      }
    };

    fetchHistorical();
  }, [symbol, range, type]);

  const formatDate = (dateStr, selectedRange) => {
    const date = new Date(dateStr);
    if (selectedRange === '5y') {
      return date.toLocaleDateString('en-IN', { year: '2-digit', month: 'short' });
    }
    if (selectedRange === '1y') {
      return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    }
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      return (
        <div className="bg-[var(--bg-primary)] px-3 py-2 rounded-lg shadow-lg border border-[var(--separator-opaque)]">
          <p className="text-[11px] text-[var(--label-tertiary)]">{dataPoint.displayDate}</p>
          <p className="text-[14px] font-semibold text-[var(--label-primary)]">
            {formatCurrency(dataPoint.price)}
          </p>
        </div>
      );
    }
    return null;
  };

  const chartColor = periodChange?.isPositive ? '#059669' : '#DC2626';

  if (!symbol) {
    return (
      <div className="h-48 flex items-center justify-center text-[var(--label-tertiary)] text-[13px]">
        No symbol available for chart
      </div>
    );
  }

  return (
    <div className="mt-4">
      {/* Header with range selector and period change */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-[var(--label-secondary)]">Price History</span>
          {periodChange && !loading && (
            <span className={`text-[12px] font-semibold ${periodChange.isPositive ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
              {periodChange.isPositive ? '+' : ''}{periodChange.changePercent.toFixed(2)}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 bg-[var(--fill-quaternary)] p-0.5 rounded-lg">
          {RANGE_OPTIONS.map(option => (
            <button
              key={option.value}
              onClick={() => setRange(option.value)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                range === option.value
                  ? 'bg-[var(--bg-primary)] text-[var(--label-primary)] shadow-sm'
                  : 'text-[var(--label-tertiary)] hover:text-[var(--label-secondary)]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="h-48 w-full">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 animate-spin text-[var(--label-tertiary)]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-[13px] text-[var(--label-tertiary)]">Loading chart...</span>
            </div>
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <svg className="w-8 h-8 text-[var(--label-quaternary)] mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[13px] text-[var(--label-tertiary)]">{error}</p>
            </div>
          </div>
        ) : data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={`gradient-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartColor} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={chartColor} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="displayDate"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: 'var(--label-tertiary)' }}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                domain={['auto', 'auto']}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: 'var(--label-tertiary)' }}
                tickFormatter={(value) => formatCompact(value)}
                width={50}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="price"
                stroke={chartColor}
                strokeWidth={2}
                fill={`url(#gradient-${symbol})`}
                isAnimationActive={true}
                animationDuration={500}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-[var(--label-tertiary)] text-[13px]">
            No data available
          </div>
        )}
      </div>
    </div>
  );
}
