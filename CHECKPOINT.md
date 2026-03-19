# CHECKPOINT - Pool Intelligence Pro

## Status Atual
**Branch:** `claude/review-audit-checkpoint-ZFYUM`
**Data:** 2026-03-19 UTC
**Fase:** ETAPAS 1–17 concluídas ✅ + Auditoria + Correções P0/P1/P2/P3 ✅ + **ROADMAP Fase 1 (Blocos 1+2) ✅**

## Para Continuar
**Frase:** `"Continuar do CHECKPOINT 2026-03-19 — Fase 1 do ROADMAP concluída (Blocos 1+2). Próximo: Fase 2 — Dados Confiáveis (Bloco 3 do ROADMAP_CORRECAO_POOL2026PRM.md)"`

---

## O QUE FOI FEITO

### ROADMAP Fase 1 — Verdade e Alinhamento ✅ (2026-03-19)

Criado `ROADMAP_CORRECAO_POOL2026PRM.md` na raiz — documento mestre com 6 fases e ~20 itens rastreados.
Princípio: *primeiro corrigir a verdade do sistema, depois o que o usuário vê, depois a matemática, depois inteligência avançada.*

**Commits:**
- `6b3b9f1` — fix: Bloco 1 — alinhar contratos e promessas do sistema
- `862e1bb` — fix: Bloco 2 — corrigir bugs reais e inconsistências operacionais

#### Bloco 1 — Alinhamento de contratos
- `validation.ts`: alertSchema alinhado aos 8 tipos canônicos (removidos RSI/MACD que não tinham implementação)
- `Alerts.tsx`: adicionados 4 tipos faltantes na UI (VOLATILITY_SPIKE, OUT_OF_RANGE, NEAR_RANGE_EXIT, NEW_RECOMMENDATION)
- `ScoutSettings.tsx`: VOLUME_DROP adicionado; lista reordenada para ordem canônica
- `ScoutDashboard.tsx`: card "Melhor Oportunidade" agora busca de `fetchRecommendations()` com badge "Recomendação IA · Score X" (antes era `pools[0]` — topo de health, não recomendação IA)
- `Pools.tsx`: texto "dados reais" → "dados observados e estimados"

#### Bloco 2 — Bugs operacionais
- `index.ts`: CORS agora aceita `X-Admin-Key` no `allowedHeaders`
- `index.ts`: `gracefulShutdown` usa `getPrisma()` singleton (antes criava `new PrismaClient()` no shutdown — não desconectava a instância real)
- `persist.service.ts` + `history.routes.ts`: eliminados `new PrismaClient()` isolados; ambos usam `getPrisma()` do singleton
- `alert.service.ts`: getter público `getAlertConfig()` expõe configuração de cooldown/maxPerHour/dedupe
- `settings.routes.ts`: GET `/api/settings` agora inclui campo `alertConfig`
- `client.ts`: `fetchTokens()` corrigido para extrair `data.data` (antes retornava `[]` sempre — usava `Array.isArray(envelope)`)
- `client.ts`: tipo de `fetchSettings` expandido com `alertConfig`
- `Pools.tsx`: `handleToggleFav` invalida `['favorites']` query após toggle (antes o estado ficava defasado)
- `ScoutPoolDetail.tsx`: contador "ao vivo" usa `setInterval(1s)` + `useState(now)` (antes congelava entre re-renders)
- `Alerts.tsx`: cooldown e max-por-hora leem de `settings.alertConfig` com fallback (antes eram hardcoded "60 min" e "10")

---

### ETAPA 17 — AI Insights, Push Notifications, Multi-Wallet ✅ (2026-03-19)

**Commits:**
- `2478332` — feat: ETAPA 17 — AI Insights, Push Notifications PWA, Multi-wallet tracking
- `81854ee` — feat: multi-wallet tracking — The Graph positions, CRUD wallets, WalletTracker page
- `ff77aa6` — feat: wiring ETAPA 17 — rotas ai-insights/push/wallet, WalletTracker na sidebar e App.tsx

**AI Insights:** análise de pool via Claude API + fallback rule-based
**Push Notifications:** VAPID, subscriptions, service worker push handler
**Multi-Wallet:** The Graph positions, CRUD wallets, WalletTracker page
**Playwright E2E:** configurado no GitHub Actions CI

---

### Correções P2/P3 (Fase 2) ✅ (2026-03-19)

**4 agentes paralelos corrigiram 8 bugs P2/P3:**

**Commits:**
- `ec18823` — fix: remover tipos RSI/MACD sem implementação, SSRF validation e retry backoff em webhooks
- `80e3112` — fix: Zod validation em GET /notes, N+1 em /ranges com Map lookup, auth em /api/integrations
- `1c9cba9` — feat: adicionar comandos Telegram /start /status /pools /alerts com webhook handler
- `0acdef1` — feat: adicionar paginação client-side no ScoutHistory (PAGE_SIZE=50, remove limit hardcoded)

**Bugs P2 corrigidos:**
- `types/index.ts`: RSI_ABOVE/BELOW e MACD_CROSS_UP/DOWN removidos do AlertType (sem implementação)
- `webhook.service.ts`: SSRF validation bloqueia localhost, IPs privados e URLs não-HTTPS
- `webhook.service.ts`: Retry com exponential backoff (3 tentativas: 1s→2s→4s); 4xx não retried
- `data.routes.ts` + `validation.ts`: Zod schema `noteQuerySchema` para GET /notes query param poolId
- `ranges.routes.ts`: N+1 resolvido com Map pre-built (O(n) ao invés de O(n*m))
- `integrations.routes.ts`: middleware `requireAdminKey` em POST/PUT/DELETE (header X-Admin-Key)
- `telegram.ts`: métodos `setupCommands()`, `handleCommand()`, `processWebhookUpdate()` adicionados
- `ScoutHistory.tsx`: paginação client-side PAGE_SIZE=50 (botões Anterior/Próximo)

**TypeScript:** 0 erros em backend + frontend após todas as mudanças.

---

### Auditoria Profunda + Correções P0/P1 ✅ (2026-03-19)

**Auditoria:** 6 agentes paralelos analisaram ~100 arquivos, identificando 65 bugs (12 críticos, 35 médios).

**Commits:**
- `9e23523` — fix backend: validação alertSchema, persistência DB via AppConfig, thresholds configuráveis
- `29eba48` — fix frontend: Radar MainLayout, ranges distintos, capital mínimo, chartData, NaN handling, forceRender

**Bugs críticos corrigidos (P0):**
- AlertService: regras agora persistem em DB (AppConfig) — antes perdiam em restart
- alertSchema: type usa z.enum (12 tipos válidos) — antes aceitava qualquer string
- alerts.routes: ID com randomUUID() — antes colisão em concorrência
- VOLUME_DROP/LIQUIDITY_FLIGHT/VOLATILITY_SPIKE: usam rule.value configurado pelo usuário
- ScoutDashboard: ranges defensive/optimized/aggressive são distintos (antes triplicados)
- ScoutRecommended: capital sugerido mínimo 1% (antes zerava para rank >= 10)
- Radar.tsx: envolvido em MainLayout (era a única página sem layout)

**Bugs P1 corrigidos:**
- PoolDetail: .reverse() removido em chartData (eixo X estava invertido); min={0} no capital
- PoolCompare: getBestClass() com NaN/Infinity handling correto
- ScoutPoolDetail: forceRender removido (re-render 60x/min eliminado)
- Pools.tsx: refetch manual passa cancelRefetch:false

**Bugs P2/P3 pendentes (próxima sessão):**
- Implementar ou remover RSI_ABOVE/BELOW, MACD_CROSS_* (declarados mas sem lógica)
- Webhook retry (exponential backoff)
- Zod validation em /api/notes GET (query param poolId)
- N+1 em /api/ranges (indexar por poolId)
- Paginação ScoutHistory (limit: 200 hard-coded)
- Comandos Telegram (/start, /pools, /alerts)
- Autenticação em /api/integrations
- Validation SSRF em webhook URLs

### ETAPA 16 — WebSocket por Pool (Rooms) ✅ (2026-03-18)

**Backend:**
- `websocket.service.ts`: listeners `pool:subscribe/unsubscribe` por pool individual,
  método `broadcastPoolUpdate(pool)` com throttle 10s por pool,
  cálculo de `positionAlert` (`in_range` / `near_edge` / `out_of_range`) consultando `rangeMonitorService`
- `jobs/index.ts`: loop `broadcastPoolUpdate` após `setPools` no radar job
- `__tests__/websocket.service.test.ts`: 6 novos testes (emit correto, throttle, positionAlert)

**Frontend:**
- `hooks/useWebSocket.ts`: `getSocket` exportado para reuso por outros hooks
- `hooks/usePoolWebSocket.ts`: hook que faz join/leave da room da pool específica,
  expõe `liveData: UnifiedPool | null`, `lastUpdated: Date | null`, `isConnected`, `positionAlert`
  — filtra eventos de outras pools, invalida React Query ao receber update
- `ScoutPoolDetail.tsx`:
  - Banner "Live · Atualizado há Xs" (verde pulsante < 15s, cinza se mais antigo ou offline)
  - Flash verde (`ring-1 ring-green-500/40`) por 2s nos cards TVL, Volume 24h e Score ao receber update
  - Toast `warning("Posição saiu do range!")` com throttle de 2min quando `positionAlert = 'out_of_range'`
  - TVL e Volume 24h mostram valor live do WebSocket quando disponível
- `pages/ScoutDashboard.tsx`: correção de 2 referências remanescentes a `defaultRiskConfig.maxPerNetwork`
- `__tests__/usePoolWebSocket.test.ts`: 5 novos testes (subscribe, unsubscribe, liveData, filtro de pool)

**Totais após ETAPA 16:**
- Backend: 129 testes (7 arquivos)
- Frontend: 98 testes (7 arquivos)

### ETAPA 15 — Price History Real + CandlestickChart ✅ (2026-03-18)

**Fix Render (chunk warning):**
- `vite.config.ts`: `build.rollupOptions.output.manualChunks` adicionado
- Lucide-react → chunk `icons` (34 kB), React → `react-vendor`, Recharts → `charts`,
  Radix → `radix`, TanStack → `query`, Socket.io → `socketio`
- `circle-alert-B9-JSvsP.js` (0.42 kB fragmentado) eliminado — todos ícones consolidados

**Backend:**
- `price-history.service.ts`: busca OHLCV da GeckoTerminal API
  - Endpoint: `/networks/{network}/pools/{address}/ohlcv/{timeframe}?limit=N&currency=usd&token=base`
  - Chain mapping: ethereum→eth, polygon→polygon_pos, etc.
  - Converte timestamps segundos→ms, reverte para ordem cronológica
  - Cache TTL: minute=60s, hour=300s, day=900s
  - Clamp de limit por timeframe (minute≤720, hour≤720, day≤365)
  - `getMultiTimeframe()`: busca hour+day em paralelo
- `GET /api/pools/:chain/:address/ohlcv?timeframe=hour&limit=168&token=base`
  - Validação de timeframe, limit, token query params

**Frontend:**
- `CandlestickChart.tsx`: componente Recharts ComposedChart com custom shapes
  - `CandleShape`: SVG custom com corpo (open-close) + pavio (high-low), verde/vermelho
  - Tooltip customizado: O/H/L/C + variação % + volume formatado
  - `PriceStats`: bar com variação acumulada, máxima, mínima, preço atual
  - Volume mini-chart em baixo (barras coloridas por isUp/isDown)
  - `ReferenceLine` para preço atual (dashed primary)
  - Seletor de timeframe (1H/1D com desc tooltip)
  - Loading/Error/Empty states
- `ScoutPoolDetail.tsx`: query OHLCV integrada
  - `useQuery(['ohlcv', chain, address, timeframe])` com staleTime por tf
  - `<CandlestickChart>` inserido antes de PoolNotes
  - Estado `ohlcvTimeframe` com `handleTimeframeChange` callback
- `api/client.ts`: `fetchOhlcv(chain, address, timeframe, limit)`

**Testes (14 novos — 123 backend total):**
- `price-history.service.test.ts`: lista vazia, fetch error, HTTP 404, ordem cronológica,
  conversão timestamps, mapeamento OHLCV, cache hit, clamp limit, chain maps,
  timeframe na URL, set cache, getMultiTimeframe

### ETAPA 14 — Integrações Externas (Discord + Slack + Webhook) ✅ (2026-03-18)

**Backend:**
- `webhook.service.ts`: serviço central de dispatch com suporte a Discord, Slack e webhook genérico
- Discord Embeds: título colorido por tipo de alerta, campos pool/chain/TVL/APR, timestamp
- Slack Block Kit: header + section + fields + context block
- Webhook Genérico: payload JSON padronizado (`source`, `type`, `message`, `pool`, `data`)
- Timeout de 8s por request, contadores `successCount`/`errorCount`, `lastError`
- `integrations.routes.ts`: CRUD completo `/api/integrations` (GET/POST/PUT/DELETE)
- `POST /api/integrations/:id/test` — testa conectividade de uma integração salva
- `POST /api/integrations/test-url` — testa URL avulsa antes de salvar
- Persistência via `persistService.set/get('integrations')` — sem novo modelo Prisma
- `persist.service.ts`: métodos genéricos `get(key)` e `set(key, value)` adicionados
- `alert.service.ts`: dispara `webhookService.dispatch(event)` após cada alert (fire-and-forget)
- Boot: `loadIntegrations()` restaura configurações da DB

**Frontend:**
- `IntegrationsSection` component em `ScoutSettings.tsx`
- Cards visuais para Discord (indigo), Slack (verde), Webhook Genérico (roxo)
- Formulário com: nome, URL, filtro de eventos por badge clicável
- Toggle on/off por integração, botão teste, indicador OK/erro
- Contadores de sucesso/erro + timestamp do último disparo
- Empty state com ícone Globe
- API client: `fetchIntegrations`, `createIntegration`, `updateIntegration`, `deleteIntegration`, `testIntegration`, `testIntegrationUrl`

**Testes (15 novos, 109 backend total):**
- `webhook.service.test.ts`: upsert/getAll/delete (5 testes), dispatch filtros (4 testes),
  test() retornos (3 testes), contadores successCount/errorCount (3 testes)
- Mock de `global.fetch` com vi.spyOn para testes isolados

### Superpowers (obra/superpowers v5.0.4) ✅ (2026-03-17)
- 14 skills instaladas: TDD, systematic-debugging, brainstorming, writing-plans,
  executing-plans, code-review, verification-before-completion, subagent-driven-development,
  dispatching-parallel-agents, using-git-worktrees, finishing-a-development-branch, etc.
- 3 comandos: superpowers-brainstorm, superpowers-execute-plan, superpowers-write-plan
- Agente: superpowers-code-reviewer

### ETAPA 13 — WebSocket Real-Time (Socket.io) ✅ (2026-03-17)

**Backend:**
- `websocket.service.ts`: Socket.io no path `/ws`, rooms, reconexão automática
- Eventos: `pools:updated`, `score:updated`, `system:status`
- Integrado ao HTTP server via `createServer(app)` em index.ts
- Broadcast automático após radar job atualizar pools

**Frontend:**
- `useWebSocket.ts`: hook singleton com reconexão, invalida React Query ao receber updates
- `LiveIndicator.tsx`: badge verde pulsante "Live" / cinza "Offline"
- Integrado no ScoutDashboard (banner de status operacional)
- `socket.io-client` instalado

### ETAPA 12 — Mobile-First + Performance ✅ (2026-03-16/17)

**12.1 — Sidebar responsiva:** drawer slide-in em mobile ✅
**12.3 — Web Vitals Monitoring:**
- `web-vitals` v5 instalado (LCP, CLS, TTFB, INP)
- `lib/web-vitals.ts`: initWebVitals(), subscribeVitals(), getVitalRating()
- Métricas enviadas ao backend via `navigator.sendBeacon`
- Endpoint `POST /api/metrics/vitals`
- `WebVitalsWidget` na página Status (color-coded por rating)

**12.5 — Bottom Navigation Mobile:**
- `BottomNav.tsx`: 5 ícones (Dashboard, Pools, Favoritas, Alertas, Config)
- Touch-friendly: min-height 48px (WCAG AAA), `lg:hidden`
- Badge de notificações no ícone Alertas, CSS `safe-area-bottom`

**12.6 — Fix grid-cols sem breakpoints:**
- 11 páginas atualizadas: `grid-cols-N` → `grid-cols-1 sm:grid-cols-N md:grid-cols-N`
- Portfolio, ScoutActivePools, ScoutDashboard, ScoutPoolDetail, Simulation, Status,
  TokenAnalyzer, Watchlist, PoolAnalytics, PoolCompare, Pools

**12.7 — Tabelas com overflow horizontal:**
- `min-w-[800px]` nas tabelas largas para scroll horizontal funcionar corretamente em mobile
- PoolAnalytics: TabsList com `grid-cols-2 md:grid-cols-4`

**12.8 — Pull-to-Refresh mobile:**
- `usePullToRefresh.ts`: hook touch com threshold 80px, haptic-like feedback
- `PullToRefresh.tsx`: wrapper component com indicador animado
- Integrado no ScoutDashboard (invalida queries de pools e posições)

**12.9 — Card view mobile para tabela de Pools:**
- `PoolMobileCard` component em Pools.tsx
- Em mobile (`sm:hidden`): cards com metrics grid (TVL, APR, APR Aj., Vol 1h, Fees, Volat.)
- Em desktop (`hidden sm:block`): tabela original preservada
- Touch-friendly: active state + border hover

**Fix Render Build:**
- Removido `prisma db push --accept-data-loss` do script `build` (elimina warning triangle)

**Testes ETAPA 12 (39 novos testes):**
- `src/__tests__/etapa12.test.ts`: getVitalRating (21 casos), getVitalsSnapshot (2),
  subscribeVitals (2), usePullToRefresh (4), tabela de thresholds completa (21 parametrizados)
- **Total frontend: 93 testes passando (6 arquivos)**

### ETAPA 11 — Testes Automatizados ✅ (2026-03-16)

**Backend Coverage:**
- `vitest.config.ts` explícito com provider v8
- `@vitest/coverage-v8` instalado
- Script `test:coverage` adicionado ao package.json
- 94 testes existentes continuam passando

**Frontend — Infraestrutura de Testes (NOVA):**
- Vitest 4.1.0 + @testing-library/react + @testing-library/jest-dom + jsdom instalados
- `vitest.config.ts` com jsdom environment + react plugin + `@` alias
- `src/setupTests.ts` com @testing-library/jest-dom setup
- Scripts `test`, `test:watch`, `test:coverage` adicionados

**Frontend — 5 Arquivos de Teste (NOVOS, 54 testes):**
- `src/__tests__/glossary.test.ts` — 28 termos DeFi, campos obrigatórios, getGlossaryEntry
- `src/__tests__/export.test.ts` — poolColumns, formatters, exportCSV trigger download
- `src/__tests__/useNotifications.test.ts` — addNotification, markRead, clearAll, persistência
- `src/__tests__/i18n.test.ts` — 90+ chaves PT-BR/EN-US, consistência, t() fallback
- `src/__tests__/utils.test.ts` — cn(), formatCurrency, formatPercent, scoreToRisk, capitalize, feeTierToBps/Percent

**Playwright E2E (NOVO):**
- `playwright.config.ts` — chromium, baseURL localhost:5173, retry on CI
- `e2e/dashboard.spec.ts` — page load, sidebar links, navegação entre rotas
- `e2e/pool-detail.spec.ts` — rota /pools/:chain/:address, loading state, sem crashes
- `e2e/navigation.spec.ts` — 9+ rotas principais sem JS crash, root redirect
- `@playwright/test` instalado em pool-intelligence-pro/

**GitHub Actions CI (NOVO):**
- `.github/workflows/tests.yml` — 3 jobs: backend-tests, frontend-tests, typecheck
- Roda em push para main/claude/** e PRs para main

**Totais de Testes:**
- Backend: 94 testes (4 arquivos)
- Frontend: 54 testes (5 arquivos)
- E2E: 14 specs Playwright (3 arquivos, requer servidor)
- **Total unitário: 148 testes passando**

### Auditoria + Melhorias Stage 1 ✅ (2026-03-16)

**Score Calibration (BUG CRÍTICO CORRIGIDO):**
- Recalibração completa do score engine — pools saudáveis passaram de ~38/100 para 60+/100
- Ajuste de normalização: TVL, volume/TVL, fee efficiency, age score (thresholds realistas)
- Pesos atualizados: health 50 + return 40 - risk 25 (antes: 40+35-25, max teórico 75)
- Penalty de volatilidade desconhecida reduzida de 5 para 2 pontos
- Default fee efficiency: de 20 (pessimista) para 50 (neutro) quando sem dados
- 6 novos testes de calibração (94 total, todos passando)

**Range Persistence (BUG CRÍTICO CORRIGIDO):**
- Range positions agora persistidas no PostgreSQL (model RangePositionRecord)
- Load automático no boot do servidor via loadFromDb()
- Create/delete assíncronos para não bloquear API
- Antes: posições perdidas no restart do servidor

**Telegram Bot Melhorias:**
- HTML escaping para prevenir XSS em mensagens
- Null check em sendRecommendation()
- VOLATILITY_SPIKE alert implementado (antes era stub vazio)
- checkHealth() para verificar conectividade
- Rate limit aumentado de 10 para 30 alertas/hora

**Macro Calendar Normalizer (NOVO):**
- Serviço macro-calendar.service.ts para tracking de eventos macroeconômicos
- Eventos recorrentes projetados: FOMC, CPI, NFP, Options Expiry
- Suporte a eventos customizados (token unlocks, upgrades, regulatório)
- API: GET/POST/DELETE /api/macro/events, GET /api/macro
- Contexto de risco macro para análise de liquidez

**Skills de Qualidade (4 NOVAS):**
- market-data-integrity.md — regras de validação de dados reais
- data-quality-grading.md — classificação A/B/C/D
- backend-contract-guard.md — proteção de contrato de API
- dashboard-safe-render.md — renderização segura
- team-leader.md — definição do agente orquestrador

**Fixes Menores:**
- Settings icon import faltante no ScoutSettings.tsx
- Empty catch block em pools.routes.ts → logService.warn
- Tipos `any` eliminados em watchlist.job.ts e defillama.adapter.ts
- console.error redundante removido em index.ts
- LogComponent expandido com 'RANGE' e 'POOLS'

### ETAPA 10 — Polish Profissional ✅ (2026-03-15)

- 10.1: Glossário/Tooltips DeFi
  - `data/glossary.ts`: 30+ termos DeFi com explicações curtas e longas
  - `GlossaryTooltip` component: reusável, compact mode, icon-only mode
  - Integrado no Portfolio (Sharpe, Sortino, Diversificação, APR Risk-Adjusted)
  - Usa Radix Tooltip já existente (shadcn/ui)
- 10.2: i18n (PT-BR + EN)
  - `i18n/` module com Zustand persist: `useTranslation()` hook
  - `pt-br.ts`: 90+ chaves de tradução (nav, dashboard, portfolio, analytics, common)
  - `en-us.ts`: tradução completa para inglês
  - Seletor de idioma na página Configurações (BR/US flags)
  - Persistência via localStorage (`pool-intel-locale`)
- 10.3: Light Theme
  - CSS variables completas para `.light` class em index.css
  - 45+ variáveis: background, cards, borders, shadows, gradients, sidebar, charts
  - Seletor de tema (Dark/Light/System) na página Configurações
  - `next-themes` já estava configurado, agora com visual light funcional
  - Scrollbars usando CSS variables (adapta ao tema)
- 10.4: Swagger/OpenAPI Docs
  - `docs.routes.ts`: OpenAPI 3.0.3 spec com 25+ endpoints documentados
  - `GET /api/docs`: JSON spec para integração
  - `GET /api/docs/ui`: Swagger UI via CDN (zero dependências extras)
  - Schemas: UnifiedPool, PortfolioAnalytics, PoolListResponse
  - Tags: Pools, Recommendations, Watchlist, Ranges, Alerts, Analytics, Portfolio, Settings
- 10.5: Onboarding Wizard
  - `OnboardingWizard` component: 5 steps com progress bar
  - Steps: Boas-vindas → Banca → Recomendações → Monitoramento → Analytics
  - Botões de ação por step (navega para a página relevante)
  - "Pular tutorial" + persistência via localStorage
  - `useOnboarding()` hook para reset (útil em settings)
  - Integrado no App.tsx (aparece na primeira visita)

### ETAPA 9 — Portfolio Intelligence ✅ (2026-03-15)

- 9.1: Dashboard Portfolio Avançado
  - `calcPortfolioAnalytics()` em calc.service.ts: Sharpe, Sortino, drawdown, diversificação (HHI)
  - Endpoint `GET /api/portfolio-analytics`: analisa posições ativas com alocação por chain/protocolo/token
  - Página `Portfolio` com: métricas-chave, gráficos de alocação (Pie/Bar), exposição por token
  - Risk band automático: conservative/balanced/aggressive
  - Sidebar: item "Portfolio" com ícone PieChart na seção Dashboard
- 9.2: APR Risk-Adjusted (Sharpe-like)
  - Fórmula: APR * (1 - vol_penalty) onde vol_penalty = min(0.5, vol²)
  - Comparação visual: APR nominal vs risk-adjusted com barra de penalidade
  - Sharpe ratio = (portfolio_return - risk_free) / portfolio_stddev
  - Sortino ratio usando apenas desvio negativo
- 9.3: Auto-Compound Simulator
  - `calcAutoCompound()` em calc.service.ts: simula compound vs simples
  - Endpoint `POST /api/auto-compound`: calcula benefício, frequência ideal, custo de gas
  - Tab "Compound" no PoolAnalytics: gráfico crescimento (Line), frequência ideal, ganho extra
  - 4 frequências: diário, semanal, quinzenal, mensal
- 9.4: Correlação entre Tokens
  - `calcTokenCorrelation()` em calc.service.ts: estima correlação via volatilidade do pool
  - Detecção de stablecoins, wrappers, same-asset derivatives
  - Endpoint `GET /api/token-correlation/:chain/:address`
  - Componente `TokenCorrelation`: barra visual -1 a +1, classificação, impacto IL, risco
  - Integrado no ScoutPoolDetail (acima do HODL vs LP)
  - Pair types: stablecoin, correlated, uncorrelated, inverse

### ETAPA 8 — Analytics Institucional ✅ (2026-03-15)

- 8.1: Monte Carlo Simulation
  - `calcMonteCarlo()` em calc.service.ts: GBM (Geometric Brownian Motion) com N cenários
  - Endpoint `POST /api/monte-carlo`: simula preço, calcula fees + IL por cenário
  - Resultado: percentis (P5-P95), prob. lucro, prob. fora do range, distribuição de retornos
  - UI: histograma de retornos (Recharts BarChart) + tabela de cenários por percentil
- 8.2: Backtesting de Ranges
  - `calcBacktest()` em calc.service.ts: simula performance diária com GBM ou price history
  - Endpoint `POST /api/backtest`: calcula fees, IL, drawdown, tempo em range
  - Resultado: PnL acumulado por dia, max drawdown, rebalanceamentos, time-in-range
  - UI: gráfico PnL acumulado (Recharts AreaChart + LineChart) + cards de métricas
- 8.3: Fee Tier Comparison
  - Endpoint `GET /api/fee-tiers/:chain/:token0/:token1`: busca pools do mesmo par
  - Calcula para cada tier: fee estimate 30d, IL risk, LVR, range width, health score
  - Ordena por estimated fees (melhor tier primeiro)
  - API frontend `fetchFeeTiers()` pronta para UI
- 8.4: LVR (Loss-Versus-Rebalancing)
  - `calcLVR()` em calc.service.ts: LVR ≈ capital * σ²_daily / 2
  - Endpoint `POST /api/lvr`: calcula LVR diário/anualizado, fee/LVR ratio, veredicto
  - Veredicto: profitable (>1.5x), marginal (0.8-1.5x), unprofitable (<0.8x)
  - UI: barra visual Fee vs LVR, métricas detalhadas, veredicto com cores
- Página `PoolAnalytics` com 3 tabs: Monte Carlo, Backtest, LVR & Risco
- Rota `/analytics/:chain/:address` registrada no App.tsx
- Botão "Analytics" no ScoutPoolDetail (ao lado de Simular)

### ETAPA 7 — Credibilidade dos Dados ✅ (2026-03-15)

- 7.1: P&L real com tracking de posições
  - `calcPositionPnL()` em calc.service.ts: calcula fees estimadas, IL real (fórmula CL), PnL net, HODL value, LP value
  - Endpoint `GET /ranges` enriquecido: cruza posições com dados radar para calcular P&L real
  - Dashboard e ActivePoolCard exibem dados reais em vez de $0 hardcoded
  - Status automático baseado em posição do preço (ok/attention/critical)
- 7.2: Distribuição de liquidez realista no RangeChart
  - Endpoint `GET /api/pools-liquidity/:chain/:address`: gera distribuição Gaussiana baseada em TVL e volatilidade
  - RangeChart consome dados do backend via React Query (com badge "LIVE")
  - Fallback local usa Gaussian determinístico (sem Math.random)
  - Eliminado ruído aleatório — visualização consistente entre renders
- 7.3: UI de Notes/Anotações nas pools (CRUD completo)
  - Componente `PoolNotes` com formulário de criação, tags sugeridas, listagem e remoção
  - 9 tags pré-definidas (estrategia, risco, entrada, saida, etc.)
  - Integrado no ScoutPoolDetail
  - Usa API existente (`/api/notes`) com React Query + mutations
- 7.4: HODL vs LP comparison
  - Componente `HodlVsLp` com simulação de retornos
  - Seletores interativos: capital ($1k-$25k) e período (7d-1a)
  - Compara: valor HODL vs valor LP com breakdown (fees, IL, net)
  - Veredicto visual: LP supera HODL ou vice-versa
  - Projeção baseada em APR, fees e IL estimados da pool
  - Integrado no ScoutPoolDetail

### ETAPA 6 — Features Avançadas ✅ (2026-03-14)

- 6.1: Comparador de pools side-by-side
  - Página `/compare` com seleção de até 4 pools
  - Busca com filtro por par, DEX, rede, token
  - Tabela comparativa: Score, Risco, TVL, Volume, APR, Fees, IL, Ranges, Gas
  - Destaque automático do melhor valor em cada métrica (azul/bold)
  - Veredicto: badge "Melhor opção" para pool com maior score
  - Botão de detalhes direto para cada pool
  - Sidebar: item "Comparador" na seção Análise com ícone GitCompareArrows
- 6.2: Histórico de performance com gráficos Recharts
  - Componente `PerformanceCharts` reutilizável
  - 4 abas: TVL (AreaChart), Volume (BarChart), Fees (BarChart), Preço (LineChart)
  - Tooltip customizado com formatação financeira compacta
  - Integrado no ScoutPoolDetail (exibe history do backend /pools-detail)
  - Gradientes e cores consistentes com design system
- 6.3: Notificações in-app
  - `useNotifications` hook com Context + localStorage (max 50, persistente)
  - `NotificationBell` no Header com badge de contagem
  - Dropdown com lista de notificações (tipo, título, mensagem, tempo relativo)
  - Marcar como lido (individual), marcar todas, limpar todas
  - Auto-notificações: status do sistema (HEALTHY↔DEGRADED↔UNHEALTHY)
  - Badge no sidebar (item Alertas) com contagem de não lidas
  - Navegação: clique em notificação abre link associado
- 6.4: Export de dados (CSV/PDF)
  - Utilitário `lib/export.ts`: exportCSV + exportPrintReport (zero deps)
  - CSV: BOM para Excel, escape de caracteres especiais, download automático
  - PDF: abre janela de impressão com HTML formatado (relatório profissional)
  - `ExportButton` reutilizável com dropdown (CSV/PDF)
  - Integrado em: ScoutRecommended, Pools (Pool Intelligence), PoolCompare
  - Colunas pré-definidas `poolColumns` para exports padrão

### ETAPA 5 — UX & Frontend Polish ✅

- 5.1: Página de Status consumindo /api/health expandido
  - Uptime, memória do servidor (RSS/Heap com barra visual vs limite Render 512MB)
  - Requests: total, erros, error rate, latência média, tabela de endpoints (p95, max)
  - Background Jobs: runs, successes, failures, avg duration, last run por job
  - Log Summary: contagem INFO/WARN/ERROR/CRITICAL (última hora)
  - Mantido: provedores, cache, MemoryStore, logs recentes, copy-to-clipboard
- 5.2: Widget de métricas no Dashboard
  - Card compacto no sidebar com uptime, RAM, requests, error rate, latência
  - Link direto para /status para detalhes completos
  - Cores dinâmicas para indicar status (verde/amarelo/vermelho)
- 5.3: Loading states e error handling melhorados
  - PageLoader: usando Tailwind classes, mensagem "Conectando ao servidor"
  - PageErrorFallback: detecção de erro de rede vs erro genérico
    - Mensagem contextual para cold starts do Render
    - Botão "Ir ao Dashboard" como escape alternativo
  - GlobalErrorFallback: UX melhorada com ícone, mensagem de ajuda
- 5.4: PWA manifest + offline fallback
  - manifest.json: name, icons SVG (192/512), theme_color, standalone display
  - Service worker: network-first, offline fallback para navigation requests
  - offline.html: página estática com branding e botão de retry
  - Meta tags: theme-color, apple-mobile-web-app-capable, apple-touch-icon
  - Ícones SVG customizados (círculos concêntricos + onda verde)
- Regra Absoluta #1 adicionada ao CLAUDE.md: NUNCA quebrar o que já funciona
- HealthData interface expandida com uptime, memory, requests, jobs, logs

### ETAPA 4 — Observabilidade & Monitoramento ✅

- 4.1: LogService aprimorado
  - Nível `DEBUG` adicionado (com `LOG_LEVEL` env var configurável)
  - Output JSON estruturado em produção (human-readable em dev)
  - `debug()` method + logs DEBUG não armazenados no buffer (reduz ruído)
  - `getSummary(minutes)` retorna contagem por nível
  - Componente `METRICS` adicionado ao LogComponent type
- 4.2: MetricsService centralizado criado (`services/metrics.service.ts`)
  - Request tracking: method, path (normalizado), statusCode, duration
  - Job tracking: name, duration, success/failure
  - Queries: `getRequestStats()` com count/avg/p95/max por endpoint
  - `getJobStats()` com runs/successes/failures/avgMs/lastRun
  - `getUptime()`, `getMemoryUsage()` (RSS, heap)
  - `getErrorRate(windowMinutes)` para detecção de spike
  - Rolling window de 60 min com cleanup automático (max 10K entries)
  - Path normalization: `/api/pools/ethereum/0x123` → `/api/pools/:chain/:address`
- 4.3: /api/health expandido com métricas completas
  - `uptime`: seconds + formatted string
  - `memory`: RSS e heap em bytes e MB
  - `requests`: totalRequests, totalErrors, errorRate, avgDurationMs, byEndpoint (p95, max)
  - `jobs`: totalRuns, successes, failures, avgDurationMs, lastRunAt por job
  - `logs`: summary de INFO/WARN/ERROR/CRITICAL na última hora
- 4.4: Alertas automáticos de degradação via Telegram
  - Error rate spike: alerta se >10% de erros nos últimos 5 min
  - Memory threshold: alerta se RSS >400MB (free tier Render)
  - Integrado no healthJobRunner (executa a cada 1 min)
  - Respeita cooldown de 30 min entre alertas
  - Todos os 6 job runners com métricas (radar, watchlist, recommendation, health, rangeCheck, dailyReport)

### ETAPA 3 — Qualidade de Código ✅
- 3.1: Estado global encapsulado em JobStateManager
- 3.2: 100% ESM (sem require)
- 3.3: ErrorBoundary → react-error-boundary (tipo `error: unknown` compatível v5+)
- 3.4: Scores centralizados via MemoryStore
- 3.5: Testes unitários: 38 testes (score + calc)
- 3.6: Testes integração: 16 testes (6 endpoints API)

### ETAPA 2 — Performance ✅
- 2.1: routes/index.ts → 6 módulos
- 2.2: require() → import() dinâmico
- 2.3: Keep-alive node-cron
- 2.4: Frontend bundle splitting
- 2.5: Tipos frontend documentados
- 2.6: devDependencies corrigidas

### ETAPA 1 — Segurança e Estabilidade ✅
- 1.1-1.6: Debug protegido, CORS, rate limiting, validação, graceful shutdown, Zod

### Skills Instalados
1. GSD v1.22.4 — Get Shit Done
2. UI-UX Pro Max — Design intelligence
3. claude-mem — Memória persistente
4. awesome-claude-code — Best practices

---

## CONFIGURAÇÃO DO RENDER

| Campo | Valor |
|-------|-------|
| **Type** | Web Service |
| **Runtime** | Node |
| **Root Directory** | `pool-intelligence-pro/backend` |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm start` |
| **Health Check Path** | `/health` |

### Environment Variables:
- `NODE_ENV` = `production`
- `PORT` = `10000`
- `DATABASE_URL` = (do Render PostgreSQL)
- `RENDER_EXTERNAL_URL` (auto-set pelo Render)
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` (opcionais)
- `APP_URL` / `CORS_ORIGIN` (opcionais)
- `LOG_LEVEL` (opcional — padrão: INFO em prod, DEBUG em dev)

---

## PRÓXIMOS PASSOS → ROADMAP Fase 2 (Bloco 3)

> Ver `ROADMAP_CORRECAO_POOL2026PRM.md` para a lista completa e status de cada item.

### Fase 2 — Dados Confiáveis (próxima sessão)
**Objetivo:** o usuário saber exatamente o que é confiável e o que é aproximação.

- **3.1** — Criar padrão `sourceType: 'observed' | 'estimated' | 'simulated'` no payload do backend
  - Adicionar `sourceType` e `confidence` em `UnifiedPool` (campos-chave: fees1h, volume1h, liquidez)
  - Exibir badges no frontend (ex: "Est." para estimado, "Obs." para observado)
- **3.2** — Remover fallback artificial de preço baseado em TVL no `defillama.adapter.ts`
  - Se não houver preço real: retornar `null`, marcar confiança baixa, bloquear cálculos dependentes
- **3.3** — Liquidez sintética (distribuição Gaussiana) precisa ser visualmente explícita
  - Badge "Estimativa" + tooltip explicativo no `RangeChart`
  - Separar de liquidez real futura (bloco 6)
- **3.4** — Volume/fees intraday derivados de 24h identificados
  - Adicionar `volume1hMeta: 'observed' | 'estimated'` e `fees1hMeta` no backend
  - Mostrar origem no frontend e usar no cálculo de confiança do score

### Fase 3 em diante (sessões futuras)
- **Fase 3:** Reescrever matemática CL real (módulo `cl-math.service.ts`), Monte Carlo, Backtest, correlação, custos reais
- **Fase 4:** Portfolio analytics com base real, Risk Engine contratual, regime de mercado, modo "não operar"
- **Fase 5:** Event Bus unificado, Telegram/Slack/Discord/Webhook sob mesma lógica, timezone profissional
- **Fase 6:** Liquidez real por tick, benchmark de ranges, diário de decisão, autoajuste de pesos, smoke tests
