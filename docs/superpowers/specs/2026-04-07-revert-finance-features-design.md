# Design Spec: Revert Finance–Inspired Features (v2 — pós-revisão)
**Date:** 2026-04-07  
**Status:** Aprovado — pronto para implementação  
**Branch:** `claude/fix-render-deploy-P1001-v2`  
**Revisão:** v2 corrige 5 issues críticas identificadas pelo revisor técnico

---

## Correções v2 (vs v1)

| Issue | Status | Correção |
|---|---|---|
| Fórmula Liquidation Price errada | ✅ Corrigida | `entryPrice * (ltvUsed / ltvMax)` |
| Fórmula Net APR inflada | ✅ Corrigida | `poolApr + (poolApr - interestRate) * (borrowAmount/capital)` |
| Conflito AutoCompound com função existente | ✅ Resolvido | Nova função `calcOptimalCompound`, existente intacta |
| TheGraph data points ambíguos | ✅ Esclarecido | 168 entries (7d), 720 entries (30d), 2160 (90d) com paginação |
| Divisão por zero em optimalFrequency | ✅ Corrigida | Guard `dailyFees <= 0 → Infinity` |

---

## Overview

Seis features off-chain de análise e simulação, inspiradas pelo Revert Finance mas adaptadas para web intelligence. Sem smart contracts, sem execução on-chain.

---

## Feature 1 — Auto-Compound ROI Calculator

### Contexto
`calcAutoCompound()` **já existe** em `calc.service.ts` (linhas 1145–1220) e simula compound vs simples ao longo de um período com frequência fixa. **Não modificamos essa função.**

Adicionamos uma função **complementar**: `calcOptimalCompound()` — responde "quando devo fazer compound?" calculando o intervalo ótimo via fórmula de sqrt.

### Backend

**Nova função em `calc.service.ts`:** `calcOptimalCompound(params)`

```typescript
interface OptimalCompoundParams {
  capital: number;        // USD investido
  apr: number;            // APR anual % (e.g. 42)
  timeInRangePct: number; // 0–100 (reduz fees efetivas)
  gasEstimate: number;    // USD por transação de compound
  daysElapsed?: number;   // dias desde abertura (para estimar fees acumuladas)
}

interface OptimalCompoundResult {
  dailyFees: number;           // USD/dia efetivo (apr ajustado por timeInRange)
  feesAccruedEstimate: number; // USD acumulado (se daysElapsed fornecido)
  breakEvenDays: number;       // dias para fees > custo de gas (gasEstimate / dailyFees)
  optimalIntervalDays: number; // sqrt(2 * gasEstimate / dailyFees); Infinity se dailyFees ≤ 0
  aprSimple: number;           // APR original sem compound
  aprCompounded: number;       // APY com compound no intervalo ótimo: (1 + dailyFees/capital)^365 - 1
  aprBoostPct: number;         // aprCompounded - aprSimple
  shouldCompoundNow: boolean;  // feesAccrued >= gasEstimate * 3 (regra 3× gas)
  nextCompoundInDays: number;  // optimalIntervalDays - (daysElapsed % optimalIntervalDays)
}
```

**Fórmulas:**
```
dailyFees = (apr / 100 / 365) * capital * (timeInRangePct / 100)

// Guard: dailyFees ≤ 0 → optimalIntervalDays = Infinity, shouldCompoundNow = false
optimalIntervalDays = sqrt(2 * gasEstimate / dailyFees)

breakEvenDays = gasEstimate / dailyFees

aprCompounded = (1 + dailyFees / capital) ^ 365 - 1   // em decimal, ×100 para %
aprBoostPct = aprCompounded * 100 - aprSimple

feesAccruedEstimate = dailyFees * (daysElapsed ?? 0)
shouldCompoundNow = feesAccruedEstimate >= gasEstimate * 3
```

**Novo endpoint:** `POST /api/calc/optimal-compound`  
(rota diferente de `/api/auto-compound` existente — sem conflito)

### Frontend

Widget `AutoCompoundWidget.tsx` em `Simulation.tsx` (abaixo da projeção 7d) e `ScoutPoolDetail.tsx`:
- "~$X/dia em fees" com indicador de timeInRange
- "Compound ótimo: a cada N dias"
- "APY com compound: Z% (+W% vs APR simples)"
- Barra de progresso: fees acumuladas / limiar 3× gas
- Badge: `✅ Pronto para compound` / `⏳ Compound em N dias`
- Quando `optimalIntervalDays = Infinity`: "Capital muito pequeno para compensar o gas"

---

## Feature 2 — AutoRange Buffer Zone

### Backend — nova função em `alert.service.ts`

**Não altera** `calcHealthFactor` existente. Cria função separada:

```typescript
type RangeZoneStatus = 'SAFE' | 'DANGER_ZONE' | 'OUT_OF_RANGE';

function getRangeZone(
  currentPrice: number,
  lower: number,
  upper: number
): { status: RangeZoneStatus; distToEdgePct: number; bufferPct: number } {
  const rangeWidth = upper - lower;
  const buffer = rangeWidth * 0.15; // 15% de cada borda

  if (currentPrice < lower || currentPrice > upper) {
    return { status: 'OUT_OF_RANGE', distToEdgePct: 0, bufferPct: 15 };
  }
  const distLower = currentPrice - lower;
  const distUpper = upper - currentPrice;
  const minDist = Math.min(distLower, distUpper);
  const distToEdgePct = (minDist / rangeWidth) * 100;

  if (minDist < buffer) {
    return { status: 'DANGER_ZONE', distToEdgePct, bufferPct: 15 };
  }
  return { status: 'SAFE', distToEdgePct, bufferPct: 15 };
}
```

**Lógica de alertas atualizada:**
- `SAFE` → sem alerta
- `DANGER_ZONE` → aviso opcional (configurável — não notifica por padrão)
- `OUT_OF_RANGE` → alerta completo (passa para Feature 3 — TWAP guard)

### Frontend

Badge em `ScoutPoolDetail.tsx` e `ScoutActivePools.tsx`:
- 🟢 **Safe** — X% da borda
- 🟡 **Approaching Edge** — Y% da borda (dentro do buffer)
- 🔴 **Out of Range** — saiu do range

---

## Feature 3 — AutoExit TWAP Anti-Wick

### Backend — mudanças em `alert.service.ts` e `memory-store.service.ts`

**Adicionar a `MemoryStore`:**
```typescript
// Timestamps de quando cada pool saiu do range
private priceOutTimestamps: Map<string, number> = new Map();

getPriceOutTimestamp(poolId: string): number | undefined
setPriceOutTimestamp(poolId: string, ts: number): void
clearPriceOutTimestamp(poolId: string): void
```

**Lógica anti-wick em `alert.service.ts`:**
```typescript
async function shouldSendRangeExitAlert(
  poolId: string,
  confirmWindowMs: number  // de settings: 2/5/10/15 min × 60000
): Promise<boolean> {
  const outSince = memoryStore.getPriceOutTimestamp(poolId);
  const now = Date.now();

  if (!outSince) {
    memoryStore.setPriceOutTimestamp(poolId, now);
    logService.info('ALERT', `Possível saída de range detectada — aguardando confirmação`, { poolId });
    return false; // inicia o clock, não alerta ainda
  }

  if (now - outSince >= confirmWindowMs) {
    memoryStore.clearPriceOutTimestamp(poolId);
    return true; // confirmado — alertar
  }
  return false; // ainda no window de confirmação
}

// Chamar quando preço VOLTA ao range (reset):
function onPriceReturnedToRange(poolId: string): void {
  memoryStore.clearPriceOutTimestamp(poolId);
  logService.info('ALERT', `Preço retornou ao range — wick descartado`, { poolId });
}
```

### Settings

Armazenado via `AppConfig` existente (campo chave `alert.wickConfirmMinutes`):
```
PUT /api/settings/alerts
body: { wickConfirmMinutes: 2 | 5 | 10 | 15 }
```

### Frontend — `ScoutSettings.tsx`

Nova opção na seção de alertas:
```
"Aguardar [2min ▾] antes de alertar saída de range
 Evita notificações por wicks/spikes temporários"
```
Options: 2 min / 5 min (padrão) / 10 min / 15 min

---

## Feature 4 — Backtesting com Dados Reais (TheGraph)

### Clarificação de Data Points

TheGraph retorna `poolHourData` (dados horários). Limites por período:
- 7 dias → **168 entries** (7 × 24h)
- 30 dias → **720 entries** (30 × 24h) → requer 2 queries paginadas (max 1000/query)
- 90 dias → **2160 entries** → requer 3 queries paginadas

Query TheGraph atual em `thegraph.adapter.ts` usa `poolHourData(first: 25)` — atualizar para `first: 1000` com paginação via `skip`.

### Backend — novo `backtest-real.service.ts`

```typescript
interface RealBacktestParams {
  chain: string;
  address: string;
  rangeLower: number;
  rangeUpper: number;
  capital: number;
  days: 7 | 14 | 30 | 90;
}

interface RealBacktestResult {
  source: 'thegraph' | 'unavailable';
  dataPoints: number;           // horas de dados usados
  periodDays: number;
  apr: number;                  // APR anualizado dos dados reais
  ilPercent: number;            // IL real baseado no path de preço
  feesEarned: number;           // USD de fees reais (do volume on-chain)
  timeInRangePct: number;       // % de candles com preço dentro do range
  pnlPercent: number;           // fees - IL
  priceStart: number;
  priceEnd: number;
  priceMin: number;
  priceMax: number;
  hourlySnapshots: Array<{
    timestamp: number;
    price: number;
    inRange: boolean;
    feesAccum: number;
    ilAccum: number;
  }>;
  vsGbm?: { aprDiff: number; ilDiff: number }; // comparação com sintético
}
```

**Algoritmo:**
1. Buscar `poolHourData` via TheGraph com paginação (até `days × 24` entries)
2. Para cada hora: verificar se `token0Price` está dentro de `[rangeLower, rangeUpper]`
3. Acumular fees proporcionalmente: `feeHour = volumeUSD * feeTier * inRange`
4. Calcular IL ao final: usar `calcIL(priceStart, priceEnd, rangeLower, rangeUpper)` existente
5. Anualizar: `apr = (feesEarned / capital) / (dataPoints / 8760) × 100`

**Fallback:** Se TheGraph indisponível ou `dataPoints < 24` → `source: 'unavailable'`

**Novo endpoint:** `GET /api/backtest-real/:chain/:address?days=7&lower=X&upper=Y&capital=Z`

### Frontend — nova tab em `Simulation.tsx`

Tab "📊 Backtest Real" ao lado de "Monte Carlo":
- Tabela comparativa: Real vs Sintético (APR, IL, timeInRange)
- Mini chart: path de preço com zonas in-range / out-range coloridas
- Badge de qualidade: "N horas de dados reais (TheGraph)" ou "TheGraph indisponível — usando simulação GBM"

---

## Feature 5 — Lending Simulator (Nova Página `/lending`)

### Fórmulas Corretas (v2)

```
// Dados base
ltvUsed = borrowAmount / collateralValue       // ex: 0.55 = 55%
ltvMax  = baseado no score da pool (ver abaixo)

// Health Factor: razão entre capacidade de borrow e borrow atual
healthFactor = ltvMax / ltvUsed
// HF > 1 = saudável; HF = 1 = limiar de liquidação; HF < 1 = liquidado

// Preço de liquidação: preço ao qual collateral cobre exatamente o borrow
// Derivação: collateral_liq * ltvMax = borrowAmount
//            collateral_liq / collateral = P_liq / P_entry
//            → P_liq = P_entry * (ltvUsed / ltvMax)
liquidationPrice = entryPrice * (ltvUsed / ltvMax)

// % de queda que dispara liquidação
liquidationDropPct = (1 - ltvUsed / ltvMax) * 100

// Net APR com alavancagem (CORRETO)
// Total investido = capital + borrowAmount (tudo vai para a pool)
// Ganhos = (capital + borrowAmount) * poolApr
// Custo = borrowAmount * interestRate
// Lucro líquido / capital:
netApr = poolApr + (poolApr - interestRate) * (borrowAmount / capital)
// Intuição: APR base + boost de alavancagem (apenas se poolApr > interestRate)
```

**Validações obrigatórias:**
```
borrowAmount > 0                           → erro se violado
borrowAmount <= collateralValue * ltvMax   → erro "excede limite de LTV"
ltvUsed < ltvMax                           → warning "próximo de liquidação"
healthFactor < 1.2                         → badge CRITICAL
```

**LTV máximo por tier (baseline ajustável pelo usuário):**
| Score da pool | LTV máx base |
|---|---|
| ≥ 75 (blue-chip) | 70% |
| 50–74 (normal) | 55% |
| < 50 (volátil) | 35% |

**Novo endpoint:** `POST /api/calc/lending`

### Frontend — `LendingSimulator.tsx` (nova página `/lending`)

Layout:
1. **Seletor de pool** (search autocomplete com pools existentes)
2. **Sliders ajustáveis pelo usuário:**
   - LTV % (0–ltvMax, step 5%)
   - Taxa de juros anual % (0–30%, step 0.5%)
3. **Input:** valor a tomar emprestado (USD)
4. **Painel de resultados:**
   - Health Factor com cor: verde > 2.0, amarelo 1.2–2.0, vermelho < 1.2, crítico < 1.0
   - Preço de liquidação + "queda de X% do preço atual"
   - Net APR com alavancagem
   - Custo de juros anual (USD)
5. **Tabela de 3 cenários automáticos** (conservador/moderado/agressivo)
6. **Disclaimer:** "Simulação educacional. Valores baseados em parâmetros do protocolo Revert Lend. Não constitui oferta de crédito."

---

## Feature 6 — Lending Risk Panel no Pool Detail

### Frontend — novo componente `LendingRiskPanel.tsx`

Calculado client-side com dados já carregados pelo pool detail (sem novo endpoint):

```typescript
// 3 cenários automáticos:
const scenarios = [
  { label: 'Conservador', ltvPct: ltvMax * 0.5 },
  { label: 'Moderado',    ltvPct: ltvMax * 0.75 },
  { label: 'Agressivo',   ltvPct: ltvMax * 0.95 },
].map(s => ({
  ...s,
  healthFactor: ltvMax / s.ltvPct,
  liquidationDropPct: (1 - s.ltvPct / ltvMax) * 100,
  liquidationPrice: currentPrice * (s.ltvPct / ltvMax),
}));
```

UI: tabela compacta com 3 colunas (cenário, health factor, preço de liquidação).
Collapsível, fechado por padrão. Link "Simular em detalhes →" para `/lending?pool=...`.

---

## Navigation

Adicionar `/lending` ao sidebar no grupo "Operações" (junto com Simulation):
- Ícone: `Landmark` (Lucide)
- Label: "Lending Sim"

---

## Arquivos a Criar (Novos)

| Arquivo | Tipo | Purpose |
|---|---|---|
| `backend/src/services/backtest-real.service.ts` | Service | Backtest via TheGraph |
| `frontend/src/pages/LendingSimulator.tsx` | Page | `/lending` |
| `frontend/src/components/common/LendingRiskPanel.tsx` | Component | Widget pool detail |
| `frontend/src/components/common/AutoCompoundWidget.tsx` | Component | Compound calculator |

## Arquivos a Modificar (Existentes)

| Arquivo | Mudança |
|---|---|
| `backend/src/services/calc.service.ts` | Adicionar `calcOptimalCompound()` e `calcLendingPosition()` |
| `backend/src/services/alert.service.ts` | Adicionar `getRangeZone()` + anti-wick |
| `backend/src/services/memory-store.service.ts` | Adicionar price-out timestamps |
| `backend/src/routes/index.ts` | 3 novos endpoints |
| `frontend/src/pages/Simulation.tsx` | Widget AutoCompound + tab Backtest Real |
| `frontend/src/pages/ScoutPoolDetail.tsx` | LendingRiskPanel |
| `frontend/src/pages/ScoutSettings.tsx` | Config TWAP window |
| `frontend/src/App.tsx` (ou router) | Rota `/lending` |
| `frontend/src/components/layout/Sidebar.tsx` | Nav item lending |

---

## Plano de Implementação (Waves Paralelas)

**Wave 1 — Backend (3 tarefas independentes em paralelo):**
- A: `calcOptimalCompound()` + `calcLendingPosition()` em `calc.service.ts`
- B: `backtest-real.service.ts` + query TheGraph paginada
- C: `getRangeZone()` + TWAP anti-wick em `alert.service.ts` + MemoryStore

**Wave 2 — Frontend (4 tarefas independentes em paralelo, após Wave 1):**
- D: `AutoCompoundWidget.tsx` + integração em `Simulation.tsx`
- E: `LendingSimulator.tsx` (nova página)
- F: `LendingRiskPanel.tsx` + integração em `ScoutPoolDetail.tsx`
- G: Settings TWAP + sidebar + rota `/lending` em App.tsx

**Wave 3 — Integração:**
- Endpoints em `routes/index.ts`
- Build verification (frontend + backend TS)
- Testes das fórmulas críticas
- Commit + push

---

## Critérios de Sucesso

1. `calcOptimalCompound()`: para capital=$1000, APR=40%, timeInRange=70%, gas=$3 → intervalo ≈ 10.7 dias
2. Liquidation price: para ltvUsed=55%, ltvMax=70%, entryPrice=$100 → $78.57
3. Net APR com alavancagem: capital=$100, borrow=$100, poolApr=50%, interest=10% → 90%
4. Backtest real usa `poolHourData` TheGraph com paginação correta
5. Anti-wick: spike de 3min não gera alerta com janela de 5min
6. Build limpo sem erros TypeScript
7. 360 testes existentes continuam passando

---

## Não-Goals (Fora de Escopo)

- Smart contracts ou execução on-chain
- Integração real com protocolo de lending (sem borrowing real)
- Liquidator bot
- Conexão de wallet
- Compound automático executado pelo sistema
