const LABELS = {
  'STOCK': 'Stock', 'MUTUAL_FUND': 'MF', 'ETF': 'ETF', 'FD': 'FD',
  'PPF': 'PPF', 'EPF': 'EPF', 'RD': 'RD', 'GOLD': 'Gold', 'SILVER': 'Silver',
  'CRYPTOCURRENCY': 'Crypto', 'LAND': 'Land', 'PROPERTY': 'Property',
  'SAVINGS_ACCOUNT': 'Savings', 'LIC': 'LIC', 'NPS': 'NPS',
};

export default function AssetTypeBadge({ type }) {
  const label = LABELS[type] || type?.replace(/_/g, ' ') || '';
  return (
    <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-[var(--fill-tertiary)] text-[var(--label-tertiary)] uppercase tracking-wide shrink-0">
      {label}
    </span>
  );
}
