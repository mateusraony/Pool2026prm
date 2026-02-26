# CHECKPOINT - Pool Intelligence Pro

## Status Atual
**Branch:** `claude/review-pool2026-pr-rO5Zd`
**Data:** 2026-02-22 UTC
**Último Commit:** (ver git log)
**Fase:** Todas as 4 limitações técnicas resolvidas — consensus, execution cost, gas dinâmico, TVL tracking implementados com 91 testes

## Para Continuar (IMPORTANTE)
**Frase de continuação:** `"Continuar do CHECKPOINT 2026-02-22-B"`

### Correções aplicadas nesta sessão:
1. ✅ TheGraph marcado como opcional (não causa DEGRADED)
2. ✅ MemoryStore implementado (cache em memória)
3. ✅ Botão "Copiar Logs" na página Status
4. ✅ DefiLlama: extração correta do poolAddress
5. ✅ /favorites: retorna array vazio se DB indisponível
6. ✅ Frontend: null checks defensivos em todas as navegações

### Correções sessão 2026-02-20:
7. ✅ Watchlist job: checa MemoryStore antes de APIs externas (UUIDs DefiLlama não falhavam mais)
8. ✅ GeckoTerminal marcado como opcional (não causa DEGRADED)
9. ✅ getPoolWithFallback: MemoryStore first, skip non-0x addresses
10. ✅ **Volume data fix**: DefiLlama `volumeUsd1d` frequentemente `null` — agora 3 camadas de enrichment:
    - Camada 1: DefiLlama `volumeUsd1d` (quando disponível)
    - Camada 2: GeckoTerminal batch API (`/pools/multi/`) para pools com 0x address
    - Camada 3: Estimativa reversa via APY: `volume = (apr/100/365*tvl) / feeTier`
11. ✅ `fees24h` agora calculado como `volume24h * feeTier` quando não fornecido
12. ✅ Health check mostra nota "Opcional" para provedores não-críticos

### Correções sessão 2026-02-21:
13. ✅ **Token prices display**: Preços dos tokens exibidos ao lado de cada pool (Radar, Simulation, Watchlist)
14. ✅ **Simulation live calculations**: `timeInRange` e `IL` agora calculados com modelo lognormal usando `volatilityAnn` real do pool (não mais hardcoded)
15. ✅ **ageScore dinâmico**: Substituído `ageScore: 50` fixo por `estimateAgeScore()` derivado de TVL, volume e bluechip
16. ✅ **Score breakdown dinâmico**: Frontend agora calcula liquidityStability, volumeConsistency, feeEfficiency a partir dos dados reais do pool
17. ✅ **volatilityAnn propagado**: Adicionado ao tipo Pool e passado do backend ao frontend via API
18. ✅ **Volatility penalty com dados reais**: score.service.ts agora usa pool.volatilityAnn quando disponível

### Sessão review PR #3 (2026-02-21):
19. ✅ **Item #1 — Volatilidade real por histórico OHLCV**:
    - TheGraph: `transformPool()` calcula `volatilityAnn` real dos `poolHourData` close prices via `calcVolatilityAnn()` log-returns
    - GeckoTerminal: novo `fetchVolatility()` busca OHLCV hourly (72h), calcula vol real, cache 30min
    - `enrichToUnifiedPool()`: prioriza `pool.volatilityAnn` do adapter (real), proxy só como fallback
    - `pools-detail` endpoint: enriquece via GeckoTerminal quando TheGraph não forneceu
    - Commit: `8d39f03`

20. ✅ **Item #2 — Substituir valores hardcoded por dados reais**:
    - `aprIncentive`: agora usa `apyReward` real do DefiLlama (antes era hardcoded 0)
    - `liquidityDropPenalty`: calculado do TheGraph TVL peak 24h vs atual (5-20pt penalty para drops >10-50%)
    - `determineMode`: usa `pool.volatilityAnn * 100` real (antes era hardcoded `|| 10`)
    - Pool type: campos `aprReward` e `tvlPeak24h` adicionados
    - Frontend Simulation: range dinâmico `z*σ√T` (antes fixo ±15/10/5%)
    - Frontend client.ts: ageScore calculado de sinais de maturidade, volatilityPenalty usa vol real
    - Commit: `ada50ba`

### Sessão 2026-02-22 — Eliminação de valores hardcoded/estáticos:

21. ✅ **Score `return` e `risk` calculados de verdade no frontend** (client.ts):
    - `return` score: calcula usando weights 35 * (volTvlRatio*0.3 + feeEff*0.3 + apr*0.4)
    - `risk` penalty: calcula usando volatilityPenalty real, capped at 25
    - `total` score: `health + return - risk` (não mais `healthScore || 50`)
    - Antes: `return: 0, risk: 0` sempre fixos

22. ✅ **recommendedMode dinâmico** (client.ts):
    - Agora: AGGRESSIVE se score>=70 e vol<=30%, NORMAL se score>=50 e vol<=15%, senão DEFENSIVE
    - Antes: sempre 'NORMAL' fixo

23. ✅ **isSuspect melhorado** (client.ts):
    - Agora detecta: APR>500% ou volume>10x TVL como suspeito
    - Antes: só checava warnings.length

24. ✅ **volAnn fallback 0.15 eliminado** (calc.service.ts):
    - Agora retorna 0 quando não há dados suficientes
    - Consumidor (pool-intelligence.service.ts) usa fallback por tipo: stable=5%, crypto=50%
    - Antes: 0.15 fixo em 3 lugares

25. ✅ **Proxy de volatilidade com warning** (pool-intelligence.service.ts):
    - Agora adiciona warning 'volatility estimated' quando usando fallback
    - Default baseado no tipo: STABLE=0.05, crypto=0.50 (não mais 0.20 genérico)

26. ✅ **volatilityPenalty para dados desconhecidos = 10** (score.service.ts):
    - Antes: 5 (muito baixo — subestimava risco de pools sem dados)
    - Agora: 10 (penalidade moderada para dados desconhecidos)

27. ✅ **determineMode sem volatility default** (score.service.ts):
    - Quando volatilidade é desconhecida: DEFENSIVE (ou NORMAL se score>=75)
    - Antes: assumia volatility=15 e permitia NORMAL para quase tudo

28. ✅ **feeTier || 0.003 eliminado em 3 arquivos**:
    - score.service.ts: retorna APR=0 se feeTier desconhecido (não inventa)
    - recommendation.service.ts: idem
    - defillama.adapter.ts: pula estimativa de volume se feeTier desconhecido

29. ✅ **Preço fabricado tvl/50000 eliminado** (Simulation.tsx):
    - Agora mostra "Sem dados de preco" quando preço real indisponível
    - Antes: inventava preço como tvl/50000 (completamente fictício)

30. ✅ **volAnn || 0.40 substituído** (Simulation.tsx):
    - Agora: type-aware (stable=5%, crypto=50%)
    - Antes: 40% genérico

31. ✅ **Indicador de dados melhorado** (Simulation.tsx):
    - Mostra "(OHLCV real)" em verde ou "(estimativa por tipo)" em amarelo
    - Mostra "Gas: estimativa fixa" honestamente

32. ✅ **feeTier não assume 0.3% no frontend** (client.ts):
    - `feeTier: p.feeTier || undefined` (não mais `|| 0.003`)
    - URL Uniswap omite feeTier se desconhecido

### Sessão 2026-02-22 (continuação) — 4 Limitações Técnicas Resolvidas:

33. ✅ **PARTE A: inconsistencyPenalty real via consensus multi-provider**:
    - Novo serviço: `consensus.service.ts`
    - Compara TVL/volume entre DefiLlama (dados já existentes) e GeckoTerminal (batch API `/pools/multi/`)
    - Divergência → penalidade: ≤10%→0, 10-20%→3, 20-30%→7, 30-50%→10, >50%→15
    - Cache 5min por batch, rate limit respeitado (30 pools por call)
    - Wired no `jobs/index.ts`: radar job executa consensus e re-calcula scores com penalidade real

34. ✅ **PARTE B: spreadPenalty substituído por executionCostPenalty (AMM)**:
    - Novo serviço: `execution-cost.service.ts`
    - Modelagem por tipo de pool:
      - STABLE: `impact ≈ tradeSize / (10 × tvl)` (curva flat)
      - CL (Concentrated Liquidity): fator de concentração derivado de `vol/TVL ratio`
      - V2 (Constant Product): `impact ≈ tradeSize / (2 × tvl)`
    - Impact $1K → penalty: <0.1%→0, 0.1-0.5%→2, 0.5-1%→4, 1-3%→6, 3-5%→8, >5%→10
    - score.service.ts: `spreadPenalty` slot agora recebe `executionCostPenalty` real

35. ✅ **PARTE C: gasMap dinâmico via JSON-RPC (gratuito)**:
    - Novo serviço: `gas.service.ts`
    - RPCs públicos gratuitos por chain: ethereum (llamarpc, ankr, publicnode), arbitrum, base, optimism, polygon
    - `eth_gasPrice` via fetch, cache 60s
    - Preço do token nativo via CoinGecko free API (cache 5min)
    - Fallback estático quando RPC falha
    - Novo endpoint: `GET /api/gas?chain=ethereum` (ou sem param → todas as chains)
    - Frontend `Simulation.tsx`: busca gas real via API, mostra "RPC ao vivo" (verde) ou "estimativa fixa" (amarelo)

36. ✅ **PARTE D: tvlPeak24h via snapshots in-memory + exposto no /pools**:
    - Novo serviço: `tvl-tracker.service.ts`
    - Rolling window 24h: snapshots in-memory (~2MB para 500 pools × 96 snapshots)
    - `recordTvl()` / `recordBatchTvl()`: grava snapshots (debounce 1min)
    - `getTvlDrop()`: retorna `{ tvlPeak24h, dropPercent, liquidityDropPenalty }`
    - Drop → penalty: ≥50%→20, ≥30%→15, ≥20%→10, ≥10%→5
    - Auto-eviction de dados >25h, max 600 pools
    - `/pools` endpoint enriquecido com: `tvlPeak24h`, `tvlDropPercent`, `consensusSources`, `consensusDivergence`, `executionCostImpact`
    - Frontend `client.ts`: calcula `liquidityDropPenalty`, `inconsistencyPenalty`, `executionCostPenalty` reais

37. ✅ **PARTE E: Testes completos**:
    - `services.test.ts`: 50 testes unitários (execution cost + TVL tracker) — todos passaram
    - `integration.test.ts`: 41 testes de integração (consensus, gas, execution cost, TVL) — todos passaram
    - Rodar: `npx tsx src/__tests__/services.test.ts` e `npx tsx src/__tests__/integration.test.ts`

### Valores fixos restantes (nenhuma limitação técnica bloqueante):
- Todos os 4 problemas técnicos anteriores foram resolvidos (inconsistencyPenalty, spreadPenalty, liquidityDropPenalty, gasMap)

### Pendente para próxima sessão:
- [ ] Gráficos mostrando dados iguais (precisa API de preços real-time / histórico)
- [ ] Code splitting para reduzir bundle (900KB → ~300KB)

## Arquivos Criados (47 arquivos)

### Backend (31 arquivos)
- `backend/package.json` - Dependências
- `backend/tsconfig.json` - Config TypeScript
- `backend/.env.example` - Template env vars
- `backend/prisma/schema.prisma` - Schema DB (15 models)
- `backend/src/config/index.ts` - Configuração centralizada
- `backend/src/types/index.ts` - Interfaces TypeScript
- `backend/src/adapters/base.adapter.ts` - Classe base adapter
- `backend/src/adapters/defillama.adapter.ts` - DefiLlama API
- `backend/src/adapters/geckoterminal.adapter.ts` - GeckoTerminal API
- `backend/src/adapters/dexscreener.adapter.ts` - DexScreener API
- `backend/src/adapters/index.ts` - Registry + consensus
- `backend/src/services/cache.service.ts` - Cache com TTL
- `backend/src/services/circuit-breaker.service.ts` - Circuit breaker
- `backend/src/services/retry.service.ts` - Retry exponential
- `backend/src/services/log.service.ts` - Logging estruturado
- `backend/src/services/score.service.ts` - Score 0-100
- `backend/src/services/recommendation.service.ts` - Top 3 IA
- `backend/src/services/alert.service.ts` - Alertas antifalha
- `backend/src/services/memory-store.service.ts` - MemoryStore (cache em memória)
- `backend/src/bot/telegram.ts` - Bot Telegram
- `backend/src/jobs/radar.job.ts` - Loop A: descoberta
- `backend/src/jobs/watchlist.job.ts` - Loop B: monitoramento
- `backend/src/jobs/index.ts` - Orquestração cron
- `backend/src/routes/index.ts` - API REST
- `backend/src/index.ts` - Entry point
- `backend/src/services/consensus.service.ts` - Consensus multi-provider (DefiLlama + GeckoTerminal)
- `backend/src/services/execution-cost.service.ts` - AMM price impact (CL/V2/STABLE)
- `backend/src/services/gas.service.ts` - Dynamic gas via JSON-RPC
- `backend/src/services/tvl-tracker.service.ts` - TVL 24h snapshots in-memory
- `backend/src/__tests__/services.test.ts` - 50 unit tests
- `backend/src/__tests__/integration.test.ts` - 41 integration tests

### Frontend (17 arquivos)
- `frontend/package.json` - Dependências
- `frontend/tsconfig.json` - Config TypeScript
- `frontend/tsconfig.node.json` - Config Node
- `frontend/vite.config.ts` - Config Vite
- `frontend/tailwind.config.js` - Config Tailwind
- `frontend/postcss.config.js` - Config PostCSS
- `frontend/index.html` - HTML entry
- `frontend/src/main.tsx` - React entry
- `frontend/src/index.css` - Estilos globais
- `frontend/src/App.tsx` - Roteamento
- `frontend/src/vite-env.d.ts` - Vite types
- `frontend/src/api/client.ts` - Cliente API
- `frontend/src/components/layout/Layout.tsx` - Layout wrapper
- `frontend/src/components/layout/Sidebar.tsx` - Navegação
- `frontend/src/components/layout/Header.tsx` - Header
- `frontend/src/pages/Radar.tsx` - 📡 Radar
- `frontend/src/pages/Recommendations.tsx` - 🧠 Recomendações
- `frontend/src/pages/Simulation.tsx` - 🧪 Simulação
- `frontend/src/pages/Watchlist.tsx` - 👀 Watchlist
- `frontend/src/pages/Alerts.tsx` - 🚨 Alertas
- `frontend/src/pages/Status.tsx` - 🩺 Status

### Deploy (1 arquivo)
- `render.yaml` - Configuração Render (API + UI + DB)

## 5 Loops Implementados
1. ✅ **Loop A - Radar:** Descobre pools via DefiLlama → GeckoTerminal
2. ✅ **Loop B - Watchlist:** Monitora pools da watchlist
3. ✅ **Loop C - Score:** Calcula score 0-100 institucional
4. ✅ **Loop D - Recomendações:** Gera Top 3 com probabilidades
5. ✅ **Loop E - Alertas:** Envia via Telegram com cooldown

## Arquitetura Antifalha
- ✅ Circuit Breaker (open/half-open/closed)
- ✅ Retry com exponential backoff + jitter
- ✅ Cache em memória com TTL
- ✅ Fallback entre providers
- ✅ Consensus validation
- ✅ **MemoryStore** — cache em memória para pools (max 500, ~600KB RAM)
  - Pools já enriquecidos (sem recálculo a cada request)
  - Scores e recomendações em cache
  - Evicção automática horária
  - Hit rate visível na página Status

## Próximos Passos (ordem)
1. [x] Testar build do backend: `cd backend && npm install && npm run build` ✅ Zero erros
2. [x] Testar build do frontend: `cd frontend && npm install && npm run build` ✅ Zero erros TypeScript (aviso bundle 900KB - não crítico)
3. [x] Corrigir erros de TypeScript se houver ✅ Nenhum erro encontrado
4. [x] Commit incremental das mudanças ✅ Branch já atualizado
5. [x] Push para o branch ✅ `origin/claude/liquidity-pool-intelligence-8LhDk`
6. [ ] Verificar deploy no Render - Aguardando configuração de env vars

## Próximas Melhorias Opcionais
- [ ] Code splitting para reduzir bundle (900KB → ~300KB) via `build.rollupOptions.output.manualChunks`
- [ ] Documentação de API (Swagger/OpenAPI)
- [ ] CI/CD pipeline no GitHub Actions
- [ ] Gráficos de preço real-time / histórico

## Comandos Úteis
```bash
# Backend
cd pool-intelligence-pro/backend
npm install
npm run build
npm run dev

# Frontend
cd pool-intelligence-pro/frontend
npm install
npm run build
npm run dev

# Prisma
npx prisma generate
npx prisma db push

# Testes (rodar do diretório backend)
cd pool-intelligence-pro/backend
npx tsx src/__tests__/services.test.ts       # 50 testes unitários (offline)
npx tsx src/__tests__/integration.test.ts    # 41 testes integração (requer rede)
```

## Variáveis de Ambiente Necessárias
```
DATABASE_URL=postgresql://...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

---

## RELATÓRIO FINAL — Sessão 2026-02-22 (Partes A-F)

### O que foi feito (resumo)

Resolvidas as **4 últimas limitações técnicas** do sistema de scoring:

| Parte | Problema | Solução | Arquivo |
|-------|----------|---------|---------|
| A | `inconsistencyPenalty` sempre 0 | Consensus multi-provider (DefiLlama vs GeckoTerminal batch) | `consensus.service.ts` |
| B | `spreadPenalty` inapropriado para AMM | `executionCostPenalty` com modelo de price impact por tipo (CL/V2/STABLE) | `execution-cost.service.ts` |
| C | `gasMap` estático | Gas dinâmico via `eth_gasPrice` JSON-RPC + CoinGecko token prices | `gas.service.ts` |
| D | `liquidityDropPenalty` sem dados | TVL snapshots 24h in-memory + exposição no `/pools` | `tvl-tracker.service.ts` |
| E | Sem testes | 91 testes (50 unit + 41 integration) | `__tests__/services.test.ts`, `__tests__/integration.test.ts` |

### Fontes/APIs utilizadas (todas gratuitas)

| API | Uso | Rate Limit |
|-----|-----|------------|
| **DefiLlama** | TVL, volume, APR, dados de pools | Sem rate limit oficial |
| **GeckoTerminal** | Batch pool data (`/pools/multi/`), OHLCV | ~30 req/min |
| **CoinGecko (free)** | Preço de tokens nativos (ETH, MATIC) para cálculo de gas em USD | 10-30 req/min |
| **JSON-RPC públicos** | `eth_gasPrice` — Ethereum (llamarpc, ankr, publicnode), Arbitrum, Base, Optimism, Polygon | Sem rate limit restritivo |

### Limites/riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| APIs fora do ar / rate limited | Cache (5min consensus, 60s gas, 30min OHLCV) + fallback estático |
| GeckoTerminal 403 (rate limit) | Batch de 30 pools por call, retry com backoff, resultado "single source" sem penalty |
| RPCs públicos instáveis | 3 endpoints por chain, fallback estático se todos falharem |
| Memória do TVL tracker | Max 600 pools × 96 snapshots ≈ 2MB, eviction automática de dados >25h |
| Dados de consensus incompletos | Se apenas 1 fonte disponível: penalty=0, reason="single source" |
| Execution cost é estimativa | Modelo simplificado (não Uniswap v3 SDK completo), mas penalty calibrada conservadoramente |

### Como rodar os testes

```bash
cd pool-intelligence-pro/backend

# Testes unitários (offline, sem rede)
npx tsx src/__tests__/services.test.ts
# Resultado esperado: 50 passed, 0 failed

# Testes de integração (requer acesso à internet)
npx tsx src/__tests__/integration.test.ts
# Resultado esperado: ~41 passed (pode variar com rate limits)
# Se APIs estiverem down: testes são "skipped" (não falham)
```

### Confirmação de que não quebrou funcionalidades existentes

- ✅ `npm run build` do backend compila sem erros TypeScript
- ✅ `npm run build` do frontend compila sem erros TypeScript
- ✅ Todos os endpoints existentes continuam funcionando (`/pools`, `/pools-detail`, `/health`, etc.)
- ✅ Score calculation mantém a mesma fórmula (health=40, return=35, risk=25) — apenas penalidades agora são reais em vez de 0
- ✅ `externalPenalties` no `calculateScore()` é optional com default `{}` — backward compatible
- ✅ Frontend consome novos campos via optional chaining (`p.tvlDropPercent ?? 0`) — não quebra se backend antigo
- ✅ Novo endpoint `/api/gas` é aditivo (não modifica rotas existentes)
- ✅ 91 testes passando (50 unit + 41 integration)
