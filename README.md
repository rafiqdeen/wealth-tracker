# WealthTracker

A comprehensive personal wealth management application built for tracking investments across multiple asset classes with India-specific features.

![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![React](https://img.shields.io/badge/React-19-blue)
![SQLite](https://img.shields.io/badge/SQLite-3-lightgrey)
![License](https://img.shields.io/badge/License-MIT-yellow)

## Features

### Portfolio Management
- Track investments across **8 asset categories** (Equity, Fixed Income, Real Estate, Physical Assets, Savings, Crypto, Insurance, and more)
- Real-time portfolio valuation with historical performance tracking
- **XIRR calculation** for true investment returns
- Cumulative and monthly investment charts
- Portfolio snapshots for trend analysis

### Asset Types Supported

| Category | Types |
|----------|-------|
| **Equity** | Stocks, Mutual Funds, ETFs |
| **Fixed Income** | FD, RD, PPF, EPF, VPF, NPS, Bonds, NSC, KVP |
| **Real Estate** | Land, Property, REITs |
| **Physical** | Gold, Silver, Vehicles |
| **Savings** | Savings Account, Current Account |
| **Crypto** | Cryptocurrency |
| **Insurance** | LIC, ULIP, Term Insurance |
| **Other** | Custom assets |

### Transaction Tracking
- Buy/Sell transactions with weighted average cost basis
- Realized gains calculation for equity sales
- Transaction history with filtering and search

### Goal Planning
- Create financial goals (Retirement, Home, Education, Emergency Fund, etc.)
- Link assets to goals with flexible allocation percentages
- Three progress tracking modes:
  - **AUTO**: Progress calculated from linked assets
  - **MANUAL**: Track manual contributions
  - **HYBRID**: Combine both sources
- Visual progress tracking with donut charts
- Over-allocation warnings

### Market Data Integration
- Real-time stock prices from Yahoo Finance
- Mutual fund NAV from AMFI API
- Gold and Silver prices with India premium markup
- Market status detection (open/closed/holidays)
- Smart price caching

### India-Specific Features
- INR as primary currency
- Indian stock exchanges (NSE, BSE)
- India-specific instruments (PPF, EPF, NPS, NSC, KVP)
- Gold/Silver prices with retail markup
- Interest compounding calculations for Indian fixed deposits

### Reports & Analytics
- Portfolio summary reports
- Asset allocation pie charts
- Monthly investment breakdown
- Cumulative investment trends
- Export to JSON and CSV
- Print-friendly reports

### Data Management
- Full data backup and restore
- Category-specific CSV export
- Import with duplicate detection
- Automatic portfolio history

## Tech Stack

### Frontend
- **React 19** with React Router 7
- **Vite** for fast development and builds
- **Tailwind CSS** for styling
- **Framer Motion** for animations
- **Recharts** for interactive charts

### Backend
- **Node.js** with Express
- **SQLite** (better-sqlite3) for data persistence
- **JWT** for authentication
- **bcrypt** for password hashing

## Getting Started

### Prerequisites
- Node.js 18 or higher
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/wealth-tracker.git
cd wealth-tracker
```

2. Install dependencies:
```bash
npm install
```

3. Start the development servers:
```bash
npm run dev
```

This starts both the frontend (http://localhost:5173) and backend (http://localhost:5001) servers.

### Environment Variables

Create a `.env` file in the `server` directory:

```env
PORT=5001
JWT_SECRET=your-secret-key-here
```

## Project Structure

```
wealth-tracker/
├── client/                  # React frontend
│   ├── src/
│   │   ├── pages/           # Page components
│   │   ├── components/      # Reusable UI components
│   │   ├── services/        # API service layers
│   │   ├── context/         # React context (Auth, Theme)
│   │   ├── utils/           # Helper functions
│   │   └── constants/       # Theme and app constants
│   └── package.json
│
├── server/                  # Express backend
│   ├── src/
│   │   ├── routes/          # API route handlers
│   │   ├── db/              # Database setup
│   │   └── middleware/      # Auth middleware
│   └── package.json
│
└── package.json             # Root package with scripts
```

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | User login |
| GET | `/api/auth/me` | Get current user |

### Assets
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/assets` | Get all assets |
| GET | `/api/assets/:id` | Get single asset |
| POST | `/api/assets` | Create asset |
| PUT | `/api/assets/:id` | Update asset |
| DELETE | `/api/assets/:id` | Delete asset |

### Transactions
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/transactions` | Create transaction |
| GET | `/api/transactions/asset/:id` | Get asset transactions |
| PUT | `/api/transactions/:id` | Update transaction |
| DELETE | `/api/transactions/:id` | Delete transaction |

### Goals
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/goals` | Get all goals |
| POST | `/api/goals` | Create goal |
| PUT | `/api/goals/:id` | Update goal |
| DELETE | `/api/goals/:id` | Delete goal |
| POST | `/api/goals/:id/links` | Link asset to goal |
| POST | `/api/goals/:id/contributions` | Add contribution |

### Portfolio
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/portfolio/history` | Get portfolio history |
| POST | `/api/portfolio/snapshot` | Record snapshot |
| GET | `/api/portfolio/cumulative-investments` | Get investment chart data |

### Prices
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/prices/:symbol` | Get stock/ETF price |
| POST | `/api/prices/bulk` | Get multiple prices |
| GET | `/api/prices/search/stocks` | Search stocks |
| GET | `/api/prices/search/mf` | Search mutual funds |

### Metals
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/metals/price/:metal` | Get gold/silver price |
| GET | `/api/metals/calculate` | Calculate metal value |

### Backup
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/backup/export` | Export all data |
| POST | `/api/backup/import` | Import backup |

## Screenshots

### Dashboard
The dashboard provides an overview of your total portfolio value, returns, and asset allocation with interactive charts.

### Assets
View and manage all your assets organized by category with quick actions for transactions.

### Goals
Track progress towards financial goals with visual indicators and asset linking.

### Reports
Generate detailed reports with export options for CSV and print.

## Scripts

```bash
# Development (starts both frontend and backend)
npm run dev

# Build frontend for production
cd client && npm run build

# Start backend only
cd server && npm start

# Lint frontend code
cd client && npm run lint
```

## Database Schema

The application uses SQLite with the following main tables:

- **users** - User authentication
- **assets** - All asset types with flexible schema
- **transactions** - Buy/sell records
- **portfolio_history** - Daily snapshots
- **goals** - Financial goals
- **goal_asset_links** - Goal-asset associations
- **goal_contributions** - Manual contributions
- **goal_history** - Goal progress snapshots
- **price_cache** - Cached market prices
- **metal_prices** - Gold/silver price cache

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Yahoo Finance](https://finance.yahoo.com) for stock and metal prices
- [AMFI](https://www.amfiindia.com) for mutual fund NAV data
- [Recharts](https://recharts.org) for beautiful charts
- [Framer Motion](https://www.framer.com/motion/) for animations
