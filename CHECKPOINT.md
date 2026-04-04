# CHECKPOINT - Pool Intelligence Pro

## Última Atualização: 2026-04-04 (Sessão 6)

---

## Estado dos Builds e Testes

| Verificação | Resultado | Detalhes |
|------------|-----------|----------|
| tsc frontend | ✅ | 0 erros (sessão 5) |
| tsc backend | ✅ | 0 erros (sessão 5) |
| build frontend | ✅ | Vite ~18s |
| build backend | ✅ | OK |
| backend tests | ✅ | 14 files, 360/360 passando |
| **total testes** | ✅ | **360 (100%)** |

---

## Sessão 6 — Correções de Fórmulas + OHLCV + Deploy

### Branch atual

`claude/fix-calc-formulas-t9NvR` — **100% sincronizada com main**  
Todos os commits desta sessão foram mergeados via PR #81.

### O que foi feito nesta sessão

| Área | Correção | Arquivo |
|------|----------|---------|
| Monte Carlo | Removido viés que puxava resultados pra baixo | `calc.service.ts` |
| Recomendação de range | Fórmula agora consistente com modelo lognormal | `calc.service.ts` |
| Eficiência de capital | Avisa quando preço está fora do range | `calc.service.ts` |
| Tick liquidity | Corrigido 252→365 dias (crypto é 24/7) | `calc.service.ts` |
| Estimativa de ganhos | Substituídas constantes mágicas por cálculo dinâmico | `calc.service.ts` |
| OHLCV | UUID interno → endereço de contrato real no GeckoTerminal | `geckoterminal.adapter.ts` |
| Circuit breaker | 404 não trava chamadas; rate limit (429) usa backoff mais longo | `circuit-breaker` |
| Deploy Render | `prisma db push` movido do start para o build | `package.json` |

### PRs desta sessão

| PR | Título | Status |
|----|--------|--------|
| #79 | fix: OHLCV sempre disponível com fallback sintético | ✅ Merged |
| #80 | fix: corrigir fórmulas de cálculo e histórico de performance | ✅ Merged |
| #81 | fix: OHLCV real, circuit breaker e deploy resiliente | ✅ Merged |
| #3  | fix: branch antiga fevereiro (conflicts resolvidos) | 🟡 Pendente decisão |

---

## Sessão 5 — Correção Recomendações + Simulação Uniswap

### 1. Recomendações Intermitentes

**7 causas identificadas, 3 corrigidas:**

| Causa | Fix | Arquivo |
|-------|-----|---------|
| TTL de 5min expirava entre ciclos | TTL 5min → 30min | `memory-store.service.ts` |
| Suspect pools removidas totalmente | Fallback: suspects usadas se < 3 clean | `recommendation.service.ts` |
| Radar vazio → recommendations vazio | Fallback para MemoryStore + nunca sobrescreve com vazio | `jobs/index.ts` |

### 2. Simulação — Gráfico estilo Uniswap com Volume

| Mudança | Arquivo | Detalhes |
|---------|---------|----------|
| Volume bars | `UniswapRangeChart.tsx` | Barras de volume abaixo do gráfico de preço (dados OHLCV) |
| Info consolidada | `UniswapRangeChart.tsx` | Preço Atual, Preço Min, Preço Max, Range Width, Probabilidade |
| Removido chart redundante | `Simulation.tsx` | InteractiveChart removido (info migrada para UniswapRangeChart) |
| Volume data passada | `Simulation.tsx` | volumeData + timeInRange passados para UniswapRangeChart |

---

## Sessão 4 — Persistência no Supabase + CSP Hash + Deploy Render

| Mudança | Arquivo | Detalhes |
|---------|---------|----------|
| **db-sync.service** | `backend/src/services/db-sync.service.ts` | Write-through: upsert PoolCurrent, create PoolSnapshot, save Score |
| **Cold-start hydration** | `backend/src/jobs/index.ts` | Na inicialização, hidrata MemoryStore do DB |
| **Radar → DB** | `backend/src/jobs/index.ts` | Após cada ciclo radar, persiste pools + scores (fire-and-forget) |
| **Snapshot cleanup** | `backend/src/jobs/index.ts` | Cron diário 3AM: remove snapshots > 30 dias |
| **Snapshots endpoint** | `backend/src/routes/pools.routes.ts` | GET /pools/:chain/:address/snapshots?days=7 |
| **CSP hash** | `backend/src/index.ts` | scriptSrc: SHA-256 hash ao invés de unsafe-inline |

### Deploy Render — Config atual

```
Build Command:  npm install && npm run build
Start Command:  npm start  (= node dist/index.js)
```

`prisma db push` roda dentro do `build` via `npm run db:sync`.

### Env Vars necessárias no Render

```
DATABASE_URL=postgresql://postgres.xxx:***@aws-1-us-east-2.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true&connect_timeout=30
DIRECT_URL=postgresql://postgres:***@db.xxx.supabase.co:5432/postgres?sslmode=require
```

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

## Ações Pendentes

1. 🟡 **Verificar deploy no Render** — PR #81 foi mergeado; auto-deploy deve ter rodado. Checar se erros P1001 e OHLCV sumiram do log.
2. 🟡 **Testar OHLCV no app** — Abrir uma pool e verificar se o gráfico de velas mostra dados reais (`"synthetic": false` na API).
3. 🟡 **PR #3** — Branch antiga de fevereiro. Main já contém tudo mais atualizado. Decidir: fechar sem merge.
4. 🟡 **Rotacionar senha Supabase** — Credenciais foram compartilhadas em sessão anterior.

---

## Como Continuar

1. Leia este `CHECKPOINT.md`
2. `git log --oneline -10` para ver últimos commits
3. Branch: `claude/fix-calc-formulas-t9NvR` (sincronizada com main)
4. Para novos trabalhos: criar branch nova ou continuar nesta
5. Verificar health: `curl https://seu-app.onrender.com/health`
