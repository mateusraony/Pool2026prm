# CHECKPOINT - Pool Intelligence Pro

## Última Atualização: 2026-03-30 (Sessão 5)

---

## Estado dos Builds e Testes

| Verificação | Resultado | Detalhes |
|------------|-----------|----------|
| tsc frontend | ✅ | 0 erros |
| tsc backend | ✅ | 0 erros |
| build frontend | ✅ | Vite ~18s |
| build backend | ✅ | OK |
| backend tests | ✅ | 14 files, 360/360 passando |
| **total testes** | ✅ | **360 (100%)** |

---

## Sessão 5 — Correção Recomendações + Simulação Uniswap

### 1. Recomendações Intermitentes (Sessão 4→5)

**Problema:** "tem hora que aparece recomendado tem hora que não tem"

**7 causas identificadas, 3 corrigidas:**

| Causa | Fix | Arquivo |
|-------|-----|---------|
| TTL de 5min expirava entre ciclos | TTL 5min → 30min | `memory-store.service.ts` |
| Suspect pools removidas totalmente | Fallback: suspects usadas se < 3 clean | `recommendation.service.ts` |
| Radar vazio → recommendations vazio | Fallback para MemoryStore + nunca sobrescreve com vazio | `jobs/index.ts` |

### 2. Simulação — Gráfico estilo Uniswap com Volume

**Problema:** Gráfico de simulação faltava volume; gráfico "Distribuição de Liquidez" (InteractiveChart) era redundante.

**O que foi feito:**

| Mudança | Arquivo | Detalhes |
|---------|---------|----------|
| Volume bars | `UniswapRangeChart.tsx` | Barras de volume abaixo do gráfico de preço (dados OHLCV) |
| Info consolidada | `UniswapRangeChart.tsx` | Preço Atual, Preço Min, Preço Max, Range Width, Probabilidade |
| Removido chart redundante | `Simulation.tsx` | InteractiveChart removido (info migrada para UniswapRangeChart) |
| Volume data passada | `Simulation.tsx` | volumeData + timeInRange passados para UniswapRangeChart |

---

## Sessão 4 — Persistência no Supabase + CSP Hash + Deploy Render

### Persistência Supabase

| Mudança | Arquivo | Detalhes |
|---------|---------|----------|
| **db-sync.service** | `backend/src/services/db-sync.service.ts` | Write-through: upsert PoolCurrent, create PoolSnapshot, save Score |
| **Cold-start hydration** | `backend/src/jobs/index.ts` | Na inicialização, hidrata MemoryStore do DB |
| **Radar → DB** | `backend/src/jobs/index.ts` | Após cada ciclo radar, persiste pools + scores (fire-and-forget) |
| **Snapshot cleanup** | `backend/src/jobs/index.ts` | Cron diário 3AM: remove snapshots > 30 dias |
| **Snapshots endpoint** | `backend/src/routes/pools.routes.ts` | GET /pools/:chain/:address/snapshots?days=7 |
| **CSP hash** | `backend/src/index.ts` | scriptSrc: SHA-256 hash ao invés de unsafe-inline |
| **Google Fonts CSP** | `backend/src/index.ts` | fontSrc + styleSrc permitir fonts.googleapis.com |
| **Testes** | `backend/src/__tests__/db-sync.service.test.ts` | 11 testes unitários |

### Deploy Render — Correções

| Problema | Fix |
|----------|-----|
| Build não alcança Supabase (P1001) | Movido `prisma db push` para start command (runtime tem rede) |
| `npx prisma` baixava Prisma v7 (breaking changes) | `prisma db push` dentro do package.json start (usa v5 local) |

### Fluxo de Dados

```
API Providers → Radar Job → MemoryStore (leituras rápidas)
                          ↘ Supabase DB (persistência)

Cold-start → DB → MemoryStore (dados instantâneos enquanto radar roda)

Frontend → /api/pools → MemoryStore (rápido)
Frontend → /api/pools/:id/snapshots → DB (histórico)
```

---

## Prisma + Supabase — Configuração

### Render Dashboard Config

```
Build Command:  npm install && npm run build
Start Command:  npm start
```

O `npm start` executa: `prisma db push --accept-data-loss && node dist/index.js`

### Env Vars Necessárias no Render

```
DATABASE_URL=postgresql://postgres.xxx:***@aws-1-us-east-2.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true&connect_timeout=30
DIRECT_URL=postgresql://postgres:***@db.xxx.supabase.co:5432/postgres?sslmode=require
```

- Porta 6543 no DATABASE_URL (Transaction Pooler)
- Porta 5432 no DIRECT_URL (conexão direta para migrations)

---

## Auditoria Profunda — 21/21 Issues Corrigidas (Sessões 2-3)

### CRITICOS (6/6 ✅)
- C1: CORS fallback false em prod
- C2: CSP completo habilitado
- C3: Supabase como DB padrão
- C4: express.json limit 1mb
- C5: InteractiveChart maxLiquidity fallback
- C6: ScoutPoolDetail null check

### ALTOS (8/8 ✅)
- H1-H8: Deps vulneráveis, bounds checks, range entryPrice, PoolDetail safePrice, rec.probability fallback, debug requireAdminKey, Prisma disconnect, render.yaml

### MÉDIOS (7/7 ✅)
- M1-M7: Config NaN guards, timing-safe compare, admin rate limit, queryRaw templates, event bus log, console.log guard, falsy 0 check

---

## Correções Sessões 1-2

- UniswapRangeChart divisão por zero (4 guards)
- OHLCV timestamps segundos → milissegundos
- ScoutPoolDetail TS2339
- Z-scores invertidos
- Deep Analysis retry button
- Notas PUT + UI edição
- Portfolio NaN guard sharpe/sortino

---

## Branch e PRs

- **Branch:** `claude/write-deep-analysis-plan-rM6eK`
- **Último commit:** sessão 5 (gráfico simulação + volume)

| PR | Título | Status |
|----|--------|--------|
| #69 | fix: UniswapRangeChart + Deep Analysis + Notas | ✅ Merged |
| #70 | fix: auditoria profunda (CORS, body limit, Supabase) | ✅ Merged |
| #71 | fix: CSP, persistência, recomendações, deploy | 🟡 Aberta |

---

## Ações Pendentes

1. 🟡 **Merge PR #71** — Contém persistência Supabase, CSP, recomendações, deploy fixes
2. 🟡 **Rotacionar senha Supabase** — Credenciais foram compartilhadas em sessão
3. 🟡 **Verificar deploy** — Após merge, checar /health e verificar dados no Supabase Table Editor (~15min)
4. 🟡 **Verificar CSP em produção** — SW, Tailwind, Socket.io, Google Fonts

---

## Como Continuar

1. Leia este `CHECKPOINT.md`
2. `git log --oneline -10` para ver últimos commits
3. Merge PR #71 se ainda não feito
4. Verificar health: `curl https://seu-app.onrender.com/health`
5. No Supabase Table Editor: verificar tabelas PoolCurrent, PoolSnapshot, Score com dados
