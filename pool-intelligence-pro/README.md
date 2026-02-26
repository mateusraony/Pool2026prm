# Pool Intelligence Pro

Enterprise-grade DeFi liquidity pool analysis system with AI-powered recommendations.

## Features

- **📡 Radar**: Automatic pool discovery via DefiLlama + GeckoTerminal
- **🧠 AI Recommendations**: Top 3 pools with probability scores and gain estimates
- **🧪 Simulation**: Interactive range testing with risk/return calculations
- **👀 Watchlist**: Monitor your favorite pools in real-time
- **🚨 Alerts**: Telegram notifications with anti-spam (cooldown + deduplication)
- **🩺 Status**: System health monitoring and provider status

## Architecture

### 5 Automated Loops
1. **Loop A - Radar**: Discovers new pools every 15 minutes
2. **Loop B - Watchlist**: Updates watched pools every 5 minutes
3. **Loop C - Score**: Calculates institutional score (0-100)
4. **Loop D - Recommendations**: Generates Top 3 AI recommendations
5. **Loop E - Alerts**: Sends Telegram alerts with cooldown

### Anti-Failure Systems
- **Circuit Breaker**: Prevents cascade failures
- **Retry with Backoff**: Exponential backoff with jitter
- **Multi-Provider Fallback**: DefiLlama → GeckoTerminal → DexScreener
- **Cache with TTL**: In-memory cache for rate limiting

## Tech Stack

### Backend
- Node.js + Express + TypeScript
- Prisma ORM + PostgreSQL
- node-cron for scheduling
- Telegram Bot API

### Frontend
- React 18 + TypeScript
- Vite for bundling
- TailwindCSS for styling
- React Query for data fetching
- React Router for navigation

## Deployment

### Render (Free Tier)
This project is configured for deployment on Render's free tier.

1. Connect your GitHub repository to Render
2. Import the `render.yaml` blueprint
3. Set environment variables:
   - `TELEGRAM_BOT_TOKEN`: Your Telegram bot token
   - `TELEGRAM_CHAT_ID`: Your Telegram chat ID

### Environment Variables
```bash
# Database (auto-configured by Render)
DATABASE_URL=postgresql://...

# Telegram (optional)
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

## Development

### Backend
```bash
cd backend
npm install
npx prisma generate
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/pools/radar` | Get radar pools |
| GET | `/api/pools/:chain/:address` | Get pool details |
| GET | `/api/recommendations` | Get AI recommendations |
| GET | `/api/watchlist` | Get watchlist |
| POST | `/api/watchlist` | Add to watchlist |
| DELETE | `/api/watchlist/:id` | Remove from watchlist |
| GET | `/api/status` | System status |

## License

MIT
