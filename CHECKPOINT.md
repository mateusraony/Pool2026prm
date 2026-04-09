# CHECKPOINT - Pool Intelligence Pro

## Última Atualização: 2026-04-09 (Sessão 8)

---

## Estado dos Builds e Testes

| Verificação | Resultado | Detalhes |
|------------|-----------|----------|
| tsc frontend | ✅ | 0 erros |
| tsc backend | ✅ | 0 erros |
| build frontend | ✅ | Vite ~12s — LendingSimulator 27.5KB |
| build backend | ✅ | OK |
| backend tests | ✅ | 14 files, 360/360 passando |
| **total testes** | ✅ | **360 (100%)** |

---

## Sessão 8 — Correção de 5 Bugs na Página Minhas Posições

### Branch atual

`claude/fix-calc-formulas-t9NvR` — **6 commits acima da main**  
Commit `785eaf0` — prontos para PR/merge.

### O que foi corrigido nesta sessão

#### Bug 1 — "Erro ao listar posições" (500 P2021)
| Arquivo | Mudança |
|---------|---------|
| `lp-positions.routes.ts` | GET retorna `{ success: true, data: [] }` (200) quando tabela não existe (P2021/P2022) em vez de 500 |

#### Bug 2 — Poupança com cálculo errado
| Arquivo | Mudança |
|---------|---------|
| `benchmarks.routes.ts` | Poupança monthly agora usa `annualToMonthly(CDI*0.70)` (composto correto) em vez de divisão simples; anual derivado por composição quando Selic ≤ 8.5% |

#### Bug 3 — APR/APY/dias com imprecisão
| Arquivo | Mudança |
|---------|---------|
| `LendingSimulator.tsx` | `exactDaysBetween()` com dias decimais reais + `365/12` d/mês (30.4167) em vez de `Math.floor` + 30 |
| `LendingSimulator.tsx` | Adicionado `annualAPR` (simples = monthlyAPR×12) ao `CalcResult`; exibido lado a lado com APY composto com labels explicativos |

#### Bug 4 — Erros sumiam da tela
| Arquivo | Mudança |
|---------|---------|
| `LendingSimulator.tsx` | `saveError`, `deleteError`, `updateError` em `useState` local — persistem até clicar no X; `onError` captura msg/code da resposta |

#### Bug 5 — Fee Tier não atualizava preview
| Arquivo | Mudança |
|---------|---------|
| `LendingSimulator.tsx` | `form.feeTier` adicionado às deps do `useMemo`; badge "Fee Tier X% (informativo — APR calculado das fees reais)" no preview |

### Frase de checkpoint

> Sessão 8 em 09/04/2026 — 5 bugs corrigidos na página Minhas Posições: P2021 graceful, poupança composta, APR decimal+365/12, erros persistentes com dismiss, fee tier no preview. Build ✅, 360 testes ✅.

---

## Sessão 7 — Features Revert Finance + Calculadora de Rendimento + Pool Performance Tracker

### O que foi feito nesta sessão

#### Parte 1 — Features inspiradas no Revert Finance

| Área | Feature | Arquivo(s) |
|------|---------|-----------|
| Backend | `calcOptimalCompound()` — intervalo ótimo com `sqrt(2*gas/dailyFees)` | `calc.service.ts` |
| Backend | `calcLendingPosition()` — liquidation price, netApr com leverage | `calc.service.ts` |
| Backend | `backtest-real.service.ts` — dados reais TheGraph, IL + fees | `backtest-real.service.ts` |
| Backend | `getRangeZone()` / TWAP anti-wick configurável | `alert.service.ts` |
| Backend | `/api/calc/optimal-compound`, `/api/calc/lending`, `/api/backtest-real/:chain/:address` | `calc.routes.ts` |
| Frontend | `AutoCompoundWidget`, `LendingSimulator`, `LendingRiskPanel` | novos components |

#### Parte 2 — Pool Performance Tracker (Minhas Posições)

| Área | Feature | Arquivo(s) |
|------|---------|-----------|
| Backend | `LpPosition` model no schema Prisma | `schema.prisma` |
| Backend | CRUD `/api/lp-positions` | `lp-positions.routes.ts` |
| Backend | `/api/benchmarks` — CDI (BCB), S&P500, Gold (Yahoo Finance), Poupança | `benchmarks.routes.ts` |
| Backend | `errorUtils.ts` — extração Prisma P-codes + logging estruturado | `errorUtils.ts` |
| Frontend | `MyLpPositions` page — registro livre, APR/APY, benchmarks live | `LendingSimulator.tsx` |
| Frontend | `BenchmarkChart` — comparativo mensal pool vs CDI/S&P500/Gold/Poupança | `LendingSimulator.tsx` |

#### Parte 3 — PoolYieldCalculator + Python CLI

| Área | Feature | Arquivo(s) |
|------|---------|-----------|
| Frontend | `PoolYieldCalculator` — inputs, APR/APY, tabela bruto→líquido, histórico localStorage | `PoolYieldCalculator.tsx` |
| Python | `pool_yield_calc.py` — CLI args, interativo, batch JSON, ANSI colorido | `scripts/pool_yield_calc.py` |

---

## Sessão 6 — Correções de Fórmulas + OHLCV + Deploy

| Correção | Arquivo |
|---------|---------|
| Monte Carlo sem viés, range lognormal | `calc.service.ts` |
| OHLCV com endereço real GeckoTerminal | `geckoterminal.adapter.ts` |
| Circuit breaker 404/429 | `circuit-breaker` |
| `prisma db push` no build | `package.json` |

PRs mergeados: #79, #80, #81

---

## Sessão 5 — Recomendações + Simulação Uniswap

| Mudança | Arquivo |
|---------|---------|
| TTL 5min→30min, fallback suspects | `memory-store.service.ts`, `recommendation.service.ts` |
| Volume bars + UniswapRangeChart | `UniswapRangeChart.tsx`, `Simulation.tsx` |

---

## Auditoria Profunda — 21/21 Issues Corrigidas (Sessões 2-3)

CRITICOS (6/6 ✅) · ALTOS (8/8 ✅) · MÉDIOS (7/7 ✅)

---

## Ações Pendentes

1. 🟡 **Criar PR** — Branch `claude/fix-calc-formulas-t9NvR` tem 6 commits prontos (sessões 7 + 8).
2. 🟡 **Verificar deploy Render** — Confirmar que `DIRECT_URL="$DATABASE_URL"` em `db:sync` resolveu erros P1001.
3. 🟡 **Testar Minhas Posições** — Após deploy, verificar que tabela `LpPosition` é criada e CRUD funciona.
4. 🟡 **Rotacionar senha Supabase** — Credenciais foram compartilhadas em sessão anterior.
5. 🟡 **PR #3** — Branch antiga de fevereiro. Decidir: fechar sem merge.

---

## Como Continuar

1. Leia este `CHECKPOINT.md`
2. `git log --oneline -10` para ver últimos commits
3. Branch: `claude/fix-calc-formulas-t9NvR` (6 commits acima da main)
4. Próximo passo: criar PR com commits das sessões 7 + 8
5. Python script: `python3 scripts/pool_yield_calc.py --initial 5000 --yield 180 --period 30`


## Sessão 7 — Features Revert Finance + Calculadora de Rendimento + Python Script

### Branch atual

`claude/fix-calc-formulas-t9NvR` — **2 commits novos acima da main**  
Commits `bd469ea` e `b8d7a57` aguardando PR/merge.

### O que foi feito nesta sessão

#### Parte 1 — Features inspiradas no Revert Finance (`bd469ea`)

| Área | Feature | Arquivo(s) |
|------|---------|-----------|
| Backend | `calcOptimalCompound()` — intervalo ótimo com `sqrt(2*gas/dailyFees)`, guard div/zero | `calc.service.ts` |
| Backend | `calcLendingPosition()` — liquidation price = `entryPrice*(ltvUsed/ltvMax)`, netApr com leverage | `calc.service.ts` |
| Backend | `backtest-real.service.ts` — dados reais do TheGraph (168/720/2160 pts), IL real + fees | `backtest-real.service.ts` |
| Backend | `getRangeZone()` / `shouldSendRangeExitAlert()` — buffer 15% + confirmação TWAP configurável | `alert.service.ts` |
| Backend | `priceOutTimestamps` — mapa de timestamps por pool para anti-wick | `memory-store.service.ts` |
| Backend | `POST /api/calc/optimal-compound`, `POST /api/calc/lending`, `GET /api/backtest-real/:chain/:address` | `calc.routes.ts`, `routes/index.ts` |
| Frontend | `AutoCompoundWidget` — APY vs APR, barra de progresso, badge "Pronto para compound" | `AutoCompoundWidget.tsx` |
| Frontend | `LendingSimulator` — página `/lending` com HF colorido, slider LTV/juros, 3 cenários | `LendingSimulator.tsx` |
| Frontend | `LendingRiskPanel` — painel colapsável no ScoutPoolDetail com link `/lending?pool=...` | `LendingRiskPanel.tsx` |
| Frontend | Sidebar — entrada "Lending Sim" na seção Operações | `Sidebar.tsx` |
| Frontend | ScoutSettings — seletor `wickConfirmMinutes` (2/5/10/15 min) | `ScoutSettings.tsx` |
| Frontend | Rota `/lending` no App.tsx com lazy loading | `App.tsx` |

#### Parte 2 — Calculadora de Rendimento Real (`b8d7a57`)

| Área | Feature | Arquivo(s) |
|------|---------|-----------|
| Frontend | `PoolYieldCalculator` — inputs: inicial, rendimento, período, gas, IL% | `PoolYieldCalculator.tsx` |
| Frontend | Cálculos instantâneos: lucro%, APR mensal, APY composto (12x), APY simples | `PoolYieldCalculator.tsx` |
| Frontend | Tabela rendimento real na saída: bruto → -gas → -IL → líquido | `PoolYieldCalculator.tsx` |
| Frontend | Benchmark bar chart (Recharts): pool vs CDI ~0.9%/mês vs S&P500 ~0.8%/mês | `PoolYieldCalculator.tsx` |
| Frontend | Badge performance: Excelente (>2%/mês) / Estável (0.5–2%) / Alerta (<0.5%) | `PoolYieldCalculator.tsx` |
| Frontend | Veredito IA dinâmico: analisa IL, gas, spread vs CDI, risco de saída | `PoolYieldCalculator.tsx` |
| Frontend | Comparativo vs sistema: mostra diferença p.p./mês vs APR estimado | `PoolYieldCalculator.tsx` |
| Frontend | Histórico localStorage (até 10 entradas): APR real vs estimado do sistema | `PoolYieldCalculator.tsx` |
| Frontend | Integrado na página `/simulation` após AutoCompoundWidget | `Simulation.tsx` |
| Python | `pool_yield_calc.py` — CLI com args, modo interativo, batch JSON, saída colorida ANSI | `scripts/pool_yield_calc.py` |
| Python | `exemplos_yield.json` — 3 cenários de exemplo (ETH/USDC, WBTC/ETH, USDC/USDT) | `scripts/exemplos_yield.json` |

### Frase de checkpoint

> Sessão 7 em 07/04/2026 — features Revert Finance (AutoCompound, AutoRange TWAP, Backtesting real, LendingSimulator) + PoolYieldCalculator com histórico e Python CLI. Branch `claude/fix-calc-formulas-t9NvR`, 2 commits acima da main, build ✅, 360 testes ✅.

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

1. 🟡 **Criar PR** — Branch `claude/fix-calc-formulas-t9NvR` tem 2 commits novos prontos para PR: Revert Finance features + Calculadora de Rendimento.
2. 🟡 **Testar Calculadora no app** — Abrir `/simulation/:chain/:address`, preencher rendimento acumulado e verificar badge + gráfico benchmark.
3. 🟡 **Testar Python script** — `python3 scripts/pool_yield_calc.py --batch scripts/exemplos_yield.json`
4. 🟡 **Verificar deploy Render** — Confirmar que `prisma db push` via pooler (porta 6543) resolveu erros P1001 nos logs.
5. 🟡 **Testar LendingSimulator** — Navegar para `/lending` e verificar HF colorido, sliders e 3 cenários.
6. 🟡 **PR #3** — Branch antiga de fevereiro. Decidir: fechar sem merge.
7. 🟡 **Rotacionar senha Supabase** — Credenciais foram compartilhadas em sessão anterior.

---

## Como Continuar

1. Leia este `CHECKPOINT.md`
2. `git log --oneline -10` para ver últimos commits
3. Branch: `claude/fix-calc-formulas-t9NvR` (2 commits acima da main)
4. Próximo passo recomendado: criar PR com os 2 novos commits
5. Calculadora Python: `python3 scripts/pool_yield_calc.py --initial 1000 --yield 45 --period 30`
6. Verificar health: `curl https://seu-app.onrender.com/health`

### Uso rápido do Python script

```bash
# Args direto
python3 scripts/pool_yield_calc.py --initial 5000 --yield 180 --period 30 --gas 12.5 --il 1.2 --system-apr 43.5

# Modo interativo
python3 scripts/pool_yield_calc.py

# Batch com exemplos
python3 scripts/pool_yield_calc.py --batch scripts/exemplos_yield.json

# Saída JSON para integração
python3 scripts/pool_yield_calc.py --initial 1000 --yield 30 --period 7 --json
```
