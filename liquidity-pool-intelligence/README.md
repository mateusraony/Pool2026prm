# Liquidity Pool Intelligence

Sistema de análise e monitoramento de pools de liquidez em DEXs (Uniswap V3) com sugestões de ranges, cálculo de risco/retorno e alertas via Telegram.

## Funcionalidades

- **Scanner de Pools**: Analisa automaticamente pools nas redes Ethereum, Arbitrum e Base
- **Sugestão de Ranges**: Calcula ranges defensivo, otimizado e agressivo para cada pool
- **Motor de Risco**: Avalia risco baseado em TVL, volatilidade e perfil do usuário
- **Backtest**: Simula performance histórica de ranges customizados
- **Monitoramento**: Acompanha posições ativas e envia alertas via Telegram
- **Painel Web**: Interface moderna e intuitiva em tema dark

## Stack Tecnológica

**Backend**
- Node.js + TypeScript + Express
- PostgreSQL + Prisma ORM
- The Graph (dados de pools)
- CoinGecko (preços)
- node-cron (scheduler)

**Frontend**
- React + TypeScript + Vite
- TailwindCSS
- React Query
- Recharts

## Estrutura do Projeto

```
liquidity-pool-intelligence/
├── backend/           # API + Scheduler + Bot Telegram
│   ├── prisma/        # Schema e migrations
│   └── src/
│       ├── api/       # Rotas REST
│       ├── services/  # Lógica de negócio
│       ├── scheduler/ # Jobs periódicos
│       └── config/    # Configurações
├── frontend/          # Painel Web React
│   └── src/
│       ├── pages/     # Páginas
│       ├── components/# Componentes
│       └── api/       # Cliente HTTP
├── docs/              # Documentação
└── render.yaml        # Config de deploy
```

## Desenvolvimento Local

### Pré-requisitos

- Node.js 18+
- PostgreSQL
- npm ou yarn

### Setup

1. Clone o repositório:
```bash
git clone <repo-url>
cd liquidity-pool-intelligence
```

2. Configure o backend:
```bash
cd backend
cp ../.env.example .env
# Edite .env com suas configurações
npm install
npx prisma generate
npx prisma db push
npx prisma db seed
```

3. Configure o frontend:
```bash
cd ../frontend
npm install
```

4. Inicie os serviços:
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

5. Acesse:
- Frontend: http://localhost:5173
- Backend: http://localhost:3001/api/health

## Deploy

Veja [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) para instruções detalhadas de deploy no Render.

## Configuração

### Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `DATABASE_URL` | Sim | URL PostgreSQL |
| `API_SECRET` | Sim | Chave para webhooks |
| `TELEGRAM_BOT_TOKEN` | Não | Token do bot Telegram |
| `TELEGRAM_CHAT_ID` | Não | ID do chat para alertas |
| `MONITORED_WALLETS` | Não | Carteiras a monitorar |
| `ENABLED_NETWORKS` | Não | Redes habilitadas |

### Perfis de Risco

| Perfil | Descrição |
|--------|-----------|
| **Defensivo** | Ranges largos (±15-25%), menor IL, menor retorno |
| **Normal** | Equilíbrio entre risco e retorno (±5-10%) |
| **Agressivo** | Ranges estreitos (±2-5%), maior retorno, maior risco |

## API Endpoints

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/health` | Health check |
| GET | `/api/dashboard` | Resumo do dashboard |
| GET | `/api/pools/recommended` | Pools recomendadas |
| GET | `/api/pools/:id` | Detalhes de uma pool |
| POST | `/api/pools/:id/backtest` | Rodar backtest |
| GET | `/api/positions` | Listar posições |
| POST | `/api/positions` | Criar posição |
| GET | `/api/settings` | Configurações |
| PUT | `/api/settings` | Atualizar configurações |
| GET | `/api/alerts` | Listar alertas |
| GET | `/api/history` | Histórico de ações |

## Avisos Importantes

- Este sistema é apenas para **análise e apoio à decisão**
- Não executa operações on-chain automaticamente
- Estimativas são baseadas em dados históricos e podem não se repetir
- **Não há garantia de lucro** - DeFi envolve riscos significativos

## Licença

MIT
