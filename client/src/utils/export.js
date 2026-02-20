/**
 * Export utilities for generating reports and backups
 */

import { formatCurrency, formatCompact, formatDate, formatNumber } from './formatting';

/**
 * Generate HTML content for PDF export
 */
export function generatePortfolioReportHTML(data) {
  const {
    user,
    totalValue,
    totalInvested,
    totalPnL,
    totalPnLPercent,
    categoryBreakdown,
    assets,
    generatedAt,
  } = data;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Portfolio Report - WealthTracker</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
          color: #1a1a1a;
          line-height: 1.5;
          padding: 40px;
          max-width: 800px;
          margin: 0 auto;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 40px;
          padding-bottom: 20px;
          border-bottom: 2px solid #e5e5ea;
        }
        .logo {
          font-size: 24px;
          font-weight: 600;
          color: #007AFF;
        }
        .report-info {
          text-align: right;
          font-size: 12px;
          color: #8e8e93;
        }
        h1 { font-size: 28px; font-weight: 600; margin-bottom: 8px; }
        h2 { font-size: 18px; font-weight: 600; margin-bottom: 16px; color: #3c3c43; }
        .section { margin-bottom: 32px; }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
          margin-bottom: 32px;
        }
        .summary-card {
          background: #f2f2f7;
          border-radius: 12px;
          padding: 20px;
        }
        .summary-label {
          font-size: 12px;
          color: #8e8e93;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        }
        .summary-value {
          font-size: 24px;
          font-weight: 600;
        }
        .summary-sub {
          font-size: 14px;
          color: #8e8e93;
        }
        .pnl-positive { color: #1A7A5C; }
        .pnl-negative { color: #C03744; }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        th {
          text-align: left;
          padding: 12px 8px;
          background: #f2f2f7;
          font-weight: 600;
          font-size: 11px;
          text-transform: uppercase;
          color: #8e8e93;
          letter-spacing: 0.5px;
        }
        td {
          padding: 12px 8px;
          border-bottom: 1px solid #e5e5ea;
        }
        .text-right { text-align: right; }
        .allocation-bar {
          display: flex;
          height: 24px;
          border-radius: 12px;
          overflow: hidden;
          margin-bottom: 16px;
        }
        .allocation-segment { height: 100%; }
        .allocation-legend {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
        }
        .legend-color {
          width: 12px;
          height: 12px;
          border-radius: 3px;
        }
        .footer {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #e5e5ea;
          font-size: 11px;
          color: #8e8e93;
          text-align: center;
        }
        @media print {
          body { padding: 20px; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="logo">WealthTracker</div>
          <h1>Portfolio Report</h1>
        </div>
        <div class="report-info">
          <p><strong>${user?.name || 'User'}</strong></p>
          <p>Generated on ${formatDate(generatedAt)}</p>
        </div>
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-label">Current Value</div>
          <div class="summary-value">${formatCurrency(totalValue)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Total Invested</div>
          <div class="summary-value">${formatCurrency(totalInvested)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Total Returns</div>
          <div class="summary-value ${totalPnL >= 0 ? 'pnl-positive' : 'pnl-negative'}">
            ${totalPnL >= 0 ? '+' : ''}${formatCurrency(totalPnL)}
          </div>
          <div class="summary-sub ${totalPnL >= 0 ? 'pnl-positive' : 'pnl-negative'}">
            ${totalPnL >= 0 ? '+' : ''}${totalPnLPercent.toFixed(2)}%
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Total Assets</div>
          <div class="summary-value">${assets?.length || 0}</div>
          <div class="summary-sub">across ${categoryBreakdown?.length || 0} categories</div>
        </div>
      </div>

      ${categoryBreakdown && categoryBreakdown.length > 0 ? `
      <div class="section">
        <h2>Asset Allocation</h2>
        <div class="allocation-bar">
          ${categoryBreakdown.map(cat => `
            <div class="allocation-segment" style="width: ${cat.percent}%; background: ${cat.color};"></div>
          `).join('')}
        </div>
        <div class="allocation-legend">
          ${categoryBreakdown.map(cat => `
            <div class="legend-item">
              <div class="legend-color" style="background: ${cat.color};"></div>
              <span>${cat.name}: ${cat.percent.toFixed(1)}% (${formatCompact(cat.value)})</span>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      ${assets && assets.length > 0 ? `
      <div class="section">
        <h2>Holdings</h2>
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <th>Category</th>
              <th class="text-right">Invested</th>
              <th class="text-right">Current Value</th>
              <th class="text-right">P&L</th>
            </tr>
          </thead>
          <tbody>
            ${assets.slice(0, 20).map(asset => `
              <tr>
                <td>
                  <strong>${asset.name}</strong>
                  ${asset.symbol ? `<br><span style="color: #8e8e93; font-size: 11px;">${asset.symbol}</span>` : ''}
                </td>
                <td>${asset.category?.replace(/_/g, ' ')}</td>
                <td class="text-right">${formatCurrency(asset.invested || 0)}</td>
                <td class="text-right">${formatCurrency(asset.currentValue || 0)}</td>
                <td class="text-right ${(asset.pnl || 0) >= 0 ? 'pnl-positive' : 'pnl-negative'}">
                  ${(asset.pnl || 0) >= 0 ? '+' : ''}${formatCurrency(asset.pnl || 0)}
                </td>
              </tr>
            `).join('')}
            ${assets.length > 20 ? `
              <tr>
                <td colspan="5" style="text-align: center; color: #8e8e93;">
                  ... and ${assets.length - 20} more assets
                </td>
              </tr>
            ` : ''}
          </tbody>
        </table>
      </div>
      ` : ''}

      <div class="footer">
        <p>This report was generated by WealthTracker. Values are based on last available prices.</p>
        <p>For informational purposes only. Not financial advice.</p>
      </div>
    </body>
    </html>
  `;
}

/**
 * Open print dialog with report
 */
export function printPortfolioReport(data) {
  const html = generatePortfolioReportHTML(data);
  const printWindow = window.open('', '_blank');

  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();

    // Wait for content to load then print
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }
}

/**
 * Download data as JSON file
 */
export function downloadJSON(data, filename = 'portfolio-backup.json') {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

/**
 * Download data as CSV file
 */
export function downloadCSV(data, filename = 'portfolio.csv') {
  if (!data || data.length === 0) return;

  const headers = Object.keys(data[0] || {});
  const csvRows = [
    headers.join(','),
    ...data.map(row =>
      headers.map(header => {
        const value = row[header];
        // Escape quotes and wrap in quotes if contains comma, quotes, or newlines
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value ?? '';
      }).join(',')
    )
  ];

  const csv = csvRows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

/**
 * Export assets to CSV with all category-specific fields
 * @param {Array} assets - Assets array from server
 * @param {string} filename - Output filename
 */
export function exportAssetsToCSV(assets, filename = 'wealthtracker-assets.csv') {
  if (!assets || assets.length === 0) return;

  const csvData = assets.map(asset => {
    const base = {
      ID: asset.id,
      Name: asset.name,
      Category: asset.category,
      'Asset Type': asset.asset_type,
      Status: asset.status || 'ACTIVE',
    };

    // Add category-specific fields
    switch (asset.category) {
      case 'EQUITY':
      case 'CRYPTO':
        return {
          ...base,
          Symbol: asset.symbol || '',
          Exchange: asset.exchange || '',
          Quantity: asset.quantity || 0,
          'Avg Buy Price': asset.avg_buy_price || 0,
          'Purchase Date': asset.purchase_date || '',
          'Invested Value': (asset.quantity || 0) * (asset.avg_buy_price || 0),
          Notes: asset.notes || '',
        };

      case 'FIXED_INCOME':
        return {
          ...base,
          Principal: asset.principal || 0,
          'Interest Rate (%)': asset.interest_rate || 0,
          'Start Date': asset.start_date || '',
          'Maturity Date': asset.maturity_date || '',
          Institution: asset.institution || '',
          Notes: asset.notes || '',
        };

      case 'REAL_ESTATE':
        return {
          ...base,
          'Purchase Price': asset.purchase_price || 0,
          'Current Value': asset.current_value || 0,
          Location: asset.location || '',
          'Area (sqft)': asset.area_sqft || '',
          'Appreciation Rate (%)': asset.appreciation_rate || '',
          'Purchase Date': asset.purchase_date || '',
          Notes: asset.notes || '',
        };

      case 'PHYSICAL':
        return {
          ...base,
          'Weight (grams)': asset.weight_grams || '',
          Purity: asset.purity || '',
          'Purchase Price': asset.purchase_price || 0,
          'Purchase Date': asset.purchase_date || '',
          Notes: asset.notes || '',
        };

      case 'SAVINGS':
        return {
          ...base,
          Balance: asset.balance || 0,
          'Interest Rate (%)': asset.interest_rate || '',
          Institution: asset.institution || '',
          Notes: asset.notes || '',
        };

      case 'INSURANCE':
        return {
          ...base,
          Premium: asset.premium || 0,
          'Sum Assured': asset.sum_assured || 0,
          'Policy Number': asset.policy_number || '',
          'Start Date': asset.start_date || '',
          'Maturity Date': asset.maturity_date || '',
          Notes: asset.notes || '',
        };

      default:
        return {
          ...base,
          'Purchase Price': asset.purchase_price || asset.principal || 0,
          'Current Value': asset.current_value || asset.balance || 0,
          'Purchase Date': asset.purchase_date || '',
          Notes: asset.notes || '',
        };
    }
  });

  // Get all unique headers
  const allHeaders = new Set();
  csvData.forEach(row => Object.keys(row).forEach(key => allHeaders.add(key)));
  const headers = Array.from(allHeaders);

  downloadCSV(csvData.map(row => {
    const normalized = {};
    headers.forEach(h => normalized[h] = row[h] ?? '');
    return normalized;
  }), filename);
}

/**
 * Export transactions to CSV
 * @param {Array} transactions - Transactions array from server
 * @param {string} filename - Output filename
 */
export function exportTransactionsToCSV(transactions, filename = 'wealthtracker-transactions.csv') {
  if (!transactions || transactions.length === 0) return;

  const csvData = transactions.map(txn => ({
    ID: txn.id,
    'Asset Name': txn.asset_name || '',
    Symbol: txn.symbol || '',
    Category: txn.asset_category || '',
    Type: txn.type,
    Quantity: txn.quantity,
    Price: txn.price,
    'Total Amount': txn.total_amount,
    'Transaction Date': txn.transaction_date,
    'Realized Gain': txn.realized_gain || '',
    Notes: txn.notes || '',
  }));

  downloadCSV(csvData, filename);
}
