# Deploy no Render

Este documento explica como fazer o deploy do Liquidity Pool Intelligence no Render.

## Pré-requisitos

1. Conta no [Render](https://render.com)
2. Repositório GitHub com o código
3. Token de Bot do Telegram (opcional, para alertas)

## Opção 1: Deploy via Blueprint (Recomendado)

1. Acesse o [Render Dashboard](https://dashboard.render.com)
2. Clique em **New** → **Blueprint**
3. Conecte seu repositório GitHub
4. O Render detectará automaticamente o arquivo `render.yaml`
5. Configure as variáveis de ambiente marcadas como `sync: false`:
   - `TELEGRAM_BOT_TOKEN`: Token do seu bot Telegram
   - `TELEGRAM_CHAT_ID`: ID do chat para receber alertas
   - `MONITORED_WALLETS`: Endereços das carteiras separados por vírgula
6. Clique em **Apply** para iniciar o deploy

## Opção 2: Deploy Manual

### 1. Criar PostgreSQL Database

1. No Render Dashboard, clique em **New** → **PostgreSQL**
2. Configure:
   - **Name**: `lpi-database`
   - **Region**: Oregon (ou mais próxima de você)
   - **Plan**: Free
3. Após criar, copie a **Internal Database URL**

### 2. Criar Backend Service

1. No Render Dashboard, clique em **New** → **Web Service**
2. Conecte seu repositório GitHub
3. Configure:
   - **Name**: `lpi-backend`
   - **Root Directory**: `liquidity-pool-intelligence/backend`
   - **Runtime**: Node
   - **Build Command**: `npm ci && npx prisma generate && npm run build`
   - **Start Command**: `npx prisma migrate deploy && npm start`
   - **Plan**: Free

4. Adicione as variáveis de ambiente:

| Variável | Valor |
|----------|-------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | (URL do PostgreSQL criado) |
| `TELEGRAM_BOT_TOKEN` | (seu token) |
| `TELEGRAM_CHAT_ID` | (seu chat ID) |
| `API_SECRET` | (gere uma string aleatória) |
| `MONITORED_WALLETS` | (seus endereços) |
| `ENABLED_NETWORKS` | `ethereum,arbitrum,base` |
| `FRONTEND_URL` | (URL do frontend após criar) |
| `RPC_ETHEREUM` | `https://eth.llamarpc.com` |
| `RPC_ARBITRUM` | `https://arb1.arbitrum.io/rpc` |
| `RPC_BASE` | `https://mainnet.base.org` |
| `SCAN_INTERVAL_MINUTES` | `30` |
| `PRICE_UPDATE_MINUTES` | `5` |
| `POSITION_SYNC_MINUTES` | `15` |
| `ALERT_CHECK_MINUTES` | `10` |

5. Clique em **Create Web Service**

### 3. Criar Frontend Service

1. No Render Dashboard, clique em **New** → **Static Site**
2. Conecte seu repositório GitHub
3. Configure:
   - **Name**: `lpi-frontend`
   - **Root Directory**: `liquidity-pool-intelligence/frontend`
   - **Build Command**: `npm ci && npm run build`
   - **Publish Directory**: `dist`

4. Adicione a variável de ambiente:

| Variável | Valor |
|----------|-------|
| `VITE_API_URL` | `https://lpi-backend.onrender.com/api` |

5. Clique em **Create Static Site**

## Variáveis de Ambiente

### Obrigatórias

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | URL de conexão PostgreSQL |
| `API_SECRET` | Chave secreta para webhooks |

### Opcionais (mas recomendadas)

| Variável | Descrição |
|----------|-----------|
| `TELEGRAM_BOT_TOKEN` | Token do bot (crie via [@BotFather](https://t.me/BotFather)) |
| `TELEGRAM_CHAT_ID` | Seu ID (obtenha via [@userinfobot](https://t.me/userinfobot)) |
| `MONITORED_WALLETS` | Endereços Ethereum separados por vírgula |

### Configuração de Redes

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `ENABLED_NETWORKS` | Redes habilitadas | `ethereum,arbitrum,base` |
| `RPC_ETHEREUM` | RPC Ethereum | `https://eth.llamarpc.com` |
| `RPC_ARBITRUM` | RPC Arbitrum | `https://arb1.arbitrum.io/rpc` |
| `RPC_BASE` | RPC Base | `https://mainnet.base.org` |

### Intervalos do Scheduler

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `SCAN_INTERVAL_MINUTES` | Intervalo do scanner de pools | `30` |
| `PRICE_UPDATE_MINUTES` | Intervalo de atualização de preços | `5` |
| `POSITION_SYNC_MINUTES` | Intervalo de sync de posições | `15` |
| `ALERT_CHECK_MINUTES` | Intervalo de verificação de alertas | `10` |

## Após o Deploy

1. Acesse `https://lpi-backend.onrender.com/api/health` para verificar o backend
2. Acesse `https://lpi-frontend.onrender.com` para acessar o painel
3. Configure suas preferências de risco em **Configurações**
4. O sistema começará a escanear pools automaticamente

## Limitações do Plano Gratuito

- **Spin-down**: Serviços param após 15 minutos de inatividade
- **PostgreSQL**: Expira após 90 dias sem atividade
- **Uptime**: 750 horas/mês por serviço

### Mitigações

1. O scheduler interno do backend ajuda a manter o serviço ativo
2. Configure um serviço de uptime monitoring (ex: UptimeRobot) para pingar periodicamente
3. Faça backups regulares dos dados importantes

## Troubleshooting

### Backend não inicia

1. Verifique os logs no Render Dashboard
2. Confirme que `DATABASE_URL` está correto
3. Verifique se o PostgreSQL está ativo

### Frontend não conecta ao backend

1. Verifique se `VITE_API_URL` está correto
2. Confirme que o backend está rodando
3. Verifique CORS no backend

### Alertas do Telegram não funcionam

1. Confirme que `TELEGRAM_BOT_TOKEN` está correto
2. Verifique se você iniciou uma conversa com o bot
3. Confirme que `TELEGRAM_CHAT_ID` está correto
