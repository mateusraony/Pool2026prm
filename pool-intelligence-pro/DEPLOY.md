# Deploy Guide — Pool Intelligence Pro

## Primeiro Deploy (one-time setup)

### 1. Criar migrations do banco (requer DATABASE_URL local ou staging)
```bash
cd pool-intelligence-pro/backend
DATABASE_URL="postgresql://..." npx prisma migrate dev --name initial
```
Isso cria `prisma/migrations/` — commitar o resultado.

### 2. Configurar variáveis no Render Dashboard
Copiar `.env.example` e preencher no painel do Render:
- `ADMIN_SECRET` — segredo para proteger endpoints admin
- `TELEGRAM_BOT_TOKEN` — token do BotFather
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — gerar com `npx web-push generate-vapid-keys`

### 3. Upgrade do banco
No Render Dashboard: Database → Upgrade to Starter Plan ($7/mês)
O plano free expira em 90 dias e apaga todos os dados.

### 4. Configurar webhook do Telegram
Após o deploy, rodar uma vez:
```bash
curl https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<seu-app>.onrender.com/api/telegram/webhook
```
