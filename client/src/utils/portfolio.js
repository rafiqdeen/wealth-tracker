export function getPriceKey(asset) {
  if (!asset.symbol) return null;
  if (asset.asset_type === 'MUTUAL_FUND') {
    return asset.symbol;
  }
  const exchange = asset.exchange === 'BSE' ? 'BO' : 'NS';
  return `${asset.symbol}.${exchange}`;
}

export function computeFIFOLots(transactions) {
  const sorted = [...transactions].sort((a, b) => new Date(a.transaction_date) - new Date(b.transaction_date));
  const lots = [];
  for (const txn of sorted) {
    const qty = parseFloat(txn.quantity) || 0;
    const price = parseFloat(txn.price) || 0;
    if (txn.type === 'BUY') {
      lots.push({ date: txn.transaction_date, qty, price });
    } else if (txn.type === 'SELL') {
      let remaining = qty;
      while (remaining > 0 && lots.length > 0) {
        if (lots[0].qty <= remaining) {
          remaining -= lots[0].qty;
          lots.shift();
        } else {
          lots[0].qty -= remaining;
          remaining = 0;
        }
      }
    }
  }
  return lots;
}

// Pure version — takes deps: { prices, fixedIncomeCalcs, metalPrices, PURITY_FACTORS }
export function getAssetValue(asset, deps) {
  const { prices, fixedIncomeCalcs, metalPrices, PURITY_FACTORS } = deps;

  if (asset.category === 'FIXED_INCOME') {
    if (fixedIncomeCalcs[asset.id]) return fixedIncomeCalcs[asset.id].currentValue;
    return asset.principal || 0;
  }
  if (asset.category === 'EQUITY' && asset.quantity) {
    const priceKey = getPriceKey(asset);
    if (priceKey) {
      const priceData = prices[priceKey];
      if (priceData && !priceData.unavailable && typeof priceData.price === 'number' && priceData.price > 0) {
        return asset.quantity * priceData.price;
      }
    }
    return null;
  }
  if (asset.category === 'PHYSICAL' && (asset.asset_type === 'GOLD' || asset.asset_type === 'SILVER') && asset.weight_grams) {
    const metal = asset.asset_type === 'GOLD' ? 'gold' : 'silver';
    const mp = metalPrices[metal];
    if (mp && mp.pricePerGram24K) {
      const purityFactor = PURITY_FACTORS[asset.purity] || 1;
      return Math.round(asset.weight_grams * mp.pricePerGram24K * purityFactor);
    }
  }
  if (asset.category === 'REAL_ESTATE' && asset.appreciation_rate && asset.purchase_price && asset.purchase_date) {
    const purchasePrice = parseFloat(asset.purchase_price);
    const rate = parseFloat(asset.appreciation_rate) / 100;
    const purchaseDate = new Date(asset.purchase_date);
    const today = new Date();
    const years = (today - purchaseDate) / (365.25 * 24 * 60 * 60 * 1000);
    if (years >= 0) return Math.round(purchasePrice * Math.pow(1 + rate, years));
  }
  if (asset.quantity && asset.avg_buy_price) return asset.quantity * asset.avg_buy_price;
  if (asset.principal) return asset.principal;
  if (asset.current_value) return asset.current_value;
  if (asset.purchase_price) return asset.purchase_price;
  if (asset.balance) return asset.balance;
  return 0;
}

// Pure version — takes deps: { fixedIncomeCalcs }
export function getInvestedValue(asset, deps) {
  const { fixedIncomeCalcs } = deps;

  if (asset.category === 'FIXED_INCOME') {
    const calc = fixedIncomeCalcs[asset.id];
    if (calc) return calc.principal;
    return asset.principal || asset.principal_amount || 0;
  }
  if (asset.category === 'EQUITY' && asset.quantity && asset.avg_buy_price) {
    return asset.quantity * asset.avg_buy_price;
  }
  if (asset.category === 'REAL_ESTATE') return asset.purchase_price || 0;
  return asset.principal || asset.purchase_price || asset.balance || 0;
}

export const VISUAL_GROUP_CONFIG = {
  'EQUITY': { color: '#3B82F6', label: 'Stocks & Funds' },
  'FIXED_INCOME': { color: '#10B981', label: 'Fixed Income' },
  'REAL_ESTATE': { color: '#06B6D4', label: 'Real Estate' },
  'PHYSICAL': { color: '#F59E0B', label: 'Physical Assets' },
  'SAVINGS': { color: '#8B5CF6', label: 'Savings' },
  'CRYPTO': { color: '#EC4899', label: 'Crypto' },
  'INSURANCE': { color: '#F472B6', label: 'Insurance' },
  'OTHER': { color: '#6B7280', label: 'Other' },
};
