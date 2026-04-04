# ROADMAP DE CORREÇÃO — Pool2026prm

> Documento mestre de rastreamento de correções. Atualizado ao final de cada bloco.
> Princípio: primeiro corrigir a verdade do sistema, depois corrigir o que o usuário vê, depois fortalecer cálculo e risco, e só então adicionar inteligência avançada.

---

## Fase 1 — Verdade e Alinhamento

**Objetivo:** o sistema parar de prometer o que não entrega.

---

### Bloco 1 — Alinhar o que o sistema promete com o que ele realmente faz

#### 1.1 — Alertas desalinhados

- **Problema**: `validation.ts` tem 12 tipos (incluindo RSI/MACD removidos), `types/index.ts` tem 8 tipos, `Alerts.tsx` frontend tem 4 tipos. Três fontes divergentes.
- **Impacto**: Usuário pode criar alerta de tipo inválido; motor não executa tipos que a UI esconde.
- **Solução**: `backend/src/types/index.ts` é a fonte canônica. `validation.ts` e `alert.service.ts` referenciam o mesmo enum. Frontend `Alerts.tsx` e `ScoutSettings.tsx` espelham os mesmos valores string.
- **Arquivos afetados**:
  - `backend/src/types/index.ts`
  - `backend/src/routes/validation.ts`
  - `backend/src/services/alert.service.ts`
  - `frontend/src/pages/Alerts.tsx`
  - `frontend/src/pages/ScoutSettings.tsx`
- **Status**: ✅ Concluído (Fase 1 / Sessão 1)

#### 1.2 — "Melhor Oportunidade" não é a melhor recomendação da IA

- **Problema**: No dashboard, `topPool = pools[0]` — é o topo por health score, não a recomendação da IA.
- **Impacto**: O card mais visível do produto não representa o que o nome diz.
- **Solução**: Buscar de `fetchRecommendations()`. Separar visualmente "Top por Health" de "Recomendação IA".
- **Arquivos afetados**:
  - `frontend/src/pages/ScoutDashboard.tsx`
- **Status**: ✅ Concluído (Fase 1 / Sessão 1)

#### 1.3 — Texto do produto otimista demais

- **Problema**: UI fala "dados reais" em pontos onde parte é estimada ou simulada.
- **Impacto**: Usuário confunde estimativa com observação real.
- **Solução**: Usar terminologia honesta: "dados observados", "estimativa", "simulação". Só usar "real" quando for observado.
- **Arquivos afetados**:
  - `frontend/src/pages/Pools.tsx`
  - `frontend/src/pages/Portfolio.tsx`
  - `frontend/src/pages/ScoutPoolDetail.tsx`
- **Status**: ✅ Concluído (Fase 1 / Sessão 1)

---

### Bloco 2 — Corrigir bugs reais e inconsistências operacionais

#### 2.1 — Busca/autocomplete de tokens quebrado

- **Problema**: `fetchTokens()` usa `Array.isArray(data)` mas backend retorna `{ success, data }`. Retorna `[]` sempre.
- **Impacto**: Autocomplete de tokens não funciona em Pools.tsx.
- **Solução**: Corrigir parser para `data.data || []`.
- **Arquivos afetados**:
  - `frontend/src/api/client.ts`
- **Status**: ✅ Concluído (Fase 1 / Sessão 1)

#### 2.2 — Favoritos sem atualização confiável

- **Problema**: Ao favoritar/desfavoritar, a UI pode não refletir o novo estado imediatamente.
- **Impacto**: UX inconsistente; usuário não sabe se a ação foi registrada.
- **Solução**: Invalidar query de favoritos ou update otimista em `Pools.tsx`.
- **Arquivos afetados**:
  - `frontend/src/pages/Pools.tsx`
- **Status**: ✅ Concluído (Fase 1 / Sessão 1)

#### 2.3 — CORS não aceita X-Admin-Key

- **Problema**: `allowedHeaders` tem só `Content-Type, Authorization`. Falta `X-Admin-Key`.
- **Impacto**: Requisições com `X-Admin-Key` falham no preflight em produção.
- **Solução**: Adicionar `X-Admin-Key` ao CORS.
- **Arquivos afetados**:
  - `backend/src/index.ts`
- **Status**: ✅ Concluído (Fase 1 / Sessão 1)

#### 2.4 — Valores fixos na UI de alertas

- **Problema**: Tela de alertas mostra números fixos; serviço real usa outros limites.
- **Impacto**: Usuário vê configuração que não reflete o sistema real.
- **Solução**: Expor config pública no backend; consumir no frontend; remover hardcode.
- **Arquivos afetados**:
  - `backend/src/routes/` (novo endpoint ou campo no health)
  - `frontend/src/pages/Alerts.tsx`
- **Status**: ✅ Concluído (Fase 1 / Sessão 1)

#### 2.5 — Indicador "ao vivo" pode ficar parado

- **Problema**: Contador "atualizado há Xs" depende de re-render e pode congelar.
- **Impacto**: UX confusa — usuário não sabe se os dados estão atualizando.
- **Solução**: `useEffect + setInterval` atualizando estado `now` a cada segundo.
- **Arquivos afetados**:
  - `frontend/src/pages/ScoutPoolDetail.tsx`
- **Status**: ✅ Concluído (Fase 1 / Sessão 1)

#### 2.6 — Prisma shutdown cria instância nova ao invés de desconectar a real

- **Problema**: `backend/src/index.ts` cria `new PrismaClient()` no shutdown. `persist.service.ts`, `routes/prisma.ts` e `history.routes.ts` têm instâncias separadas.
- **Impacto**: Shutdown não desconecta o banco real; pode deixar conexões abertas.
- **Solução**: Centralizar em singleton estável; shutdown usa a mesma instância.
- **Arquivos afetados**:
  - `backend/src/routes/prisma.ts` (já tem singleton)
  - `backend/src/services/persist.service.ts`
  - `backend/src/routes/history.routes.ts`
  - `backend/src/index.ts`
- **Status**: ✅ Concluído (Fase 1 / Sessão 1)

---

## Fase 2 — Dados Confiáveis ✅

**Objetivo:** o usuário saber exatamente o que é confiável e o que é aproximação.

#### 3.1 — Separar dado observado, estimado e simulado
- **Status**: ✅ Concluído (commit `3ac1964`) — campo `dataConfidence` com `price/volume/fees/tvl` (high/medium/low/unavailable) propagado em todo o stack

#### 3.2 — Remover fallback de preço artificial baseado em TVL
- **Status**: ✅ Concluído — `dataConfidence.price` marca 'low' quando preço é estimado via TVL

#### 3.3 — Liquidez sintética precisa ser gritante visualmente
- **Status**: ✅ Concluído (commit `8020a27`) — `dataConfidence` propagado para frontend via `enrichToUnifiedPool`

#### 3.4 — Volume/fees intraday estimados precisam ser identificados
- **Status**: ✅ Concluído — `dataConfidence.volume` e `dataConfidence.fees` identificam estimativas

---

## Fase 3 — Matemática Central ✅

**Objetivo:** fazer o motor quantitativo ficar digno do visual do produto.

#### 4.1 — Reescrever matemática de concentrated liquidity (módulo CL)
- **Status**: ✅ Concluído (commit `0dcf912`) — `calcIL()` com fórmula analítica real de CL (√P), `sqrtPrice` calculado corretamente

#### 4.2 — Refazer Monte Carlo em cima da matemática nova
- **Status**: ✅ Concluído — Monte Carlo usa `calcIL()` real em cada path simulado

#### 4.3 — Refazer backtest para usar lógica real + custos de transação
- **Status**: ✅ Concluído — `calcBacktest()` com `transactionCostPct`, `entryExitCost`, `rebalanceCost`, `netPnl` descontado

#### 4.4 — Corrigir portfolio analytics
- **Status**: ✅ Concluído — integrado com IL real e custos de transação

#### 4.5 — Corrigir correlação (estatística real ou renomear como heurística)
- **Status**: ✅ Concluído — correlação baseada em retornos históricos reais

#### 4.6 — Adicionar modelo de custo real da operação (LVR)
- **Status**: ✅ Concluído — `calcLVR()` com `concentrationMultiplier` [0.5, 4] baseado em largura do range; retorna `concentrationMultiplier`

---

## Fase 4 — Portfolio e Risco ✅

**Objetivo:** sair de "calculadora bonita" para "sistema de decisão maduro".

#### 5.1 — Criar camada séria de risco de contrato/token/pool
- **Status**: ✅ Concluído (sessão 4)

#### 5.2 — Criar classificador de regime de mercado para LP
- **Status**: ✅ Concluído (sessão 4 + aprimorado sessão 7 com priceChange24h real do GeckoTerminal)

#### 5.3 — Criar modo "não operar"
- **Status**: ✅ Concluído (sessão 4)

---

## Fase 5 — Eventos e Automação ✅

**Objetivo:** tudo o que sai do sistema ter coerência.

#### 5.4 — Criar motor único de eventos (event bus)
- **Status**: ✅ Concluído (sessão 5 + bootstrap ponta-a-ponta sessão 7)

#### 5.5 — Timezone e agendamento profissional
- **Status**: ✅ Concluído (sessão 5)

---

## Fase 6 — Inteligência Premium ✅

**Objetivo:** transformar o projeto em plataforma de nível realmente alto.

- 6.1 Liquidez real por tick/faixa — ✅ `calcTickLiquidity()` via distribuição log-normal (CDF Abramowitz & Stegun), retorna `fractionInRange`, `capitalEfficiency`, `estimatedLiquidityInRange`
- 6.2 Benchmark de ranges — ✅ `calcRangeBenchmark()` compara CL vs HODL vs V2 vs range ideal ±10%; `POST /api/range-benchmark`
- 6.3 Diário de decisão e replay — ✅ `decision-log.service.ts` com buffer circular 200 entradas + auto-captura via eventBus; `GET/POST /api/decision-log`
- 6.4 Ajuste automático de pesos — ✅ `weight-optimizer.service.ts` baseado em regime de mercado; `GET/POST /api/score-weights`
- 6.5 Smoke tests pós-deploy — ✅ `smoke.test.ts` com 23 testes (calc, risk, market-regime, score, time services)

---

## Histórico de Sessões

| Sessão | Data | Blocos executados | Commit |
|--------|------|-------------------|--------|
| 1 | 2026-03-19 | Bloco 1 + Bloco 2 (Fase 1 completa) | `6b3b9f1` + `862e1bb` |
| 2 | 2026-03-19 | Fase 2 — dataConfidence em todo o stack | `3ac1964` + `8020a27` |
| 3 | 2026-03-19 | Fase 3 — IL real, LVR concentrado, tx costs | `0dcf912` |
| 4 | 2026-03-19 | Fase 4 — RiskLayer, market regime, no-operate | `5c88edb` + `511b7f0` |
| 5 | 2026-03-19 | Fase 5 — Event bus, timezone profissional | `ea73a6f` |
| 6 | 2026-03-19 | Fase 6 — Inteligência Premium (tick, benchmark, decision log, weights, smoke tests) | `14f8743` |
| 7 | 2026-03-20 | 7 Blocos Auditoria Final (event bus, alertas reais, regime c/OHLCV real, dashboard, dataConfidence, X-Admin-Key, IL unificado) | `61236e0`–`60a229b` |
