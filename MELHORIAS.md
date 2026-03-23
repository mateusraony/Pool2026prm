# Plano de Melhorias — Pool Intelligence Pro

> Análise baseada nas best practices do [awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) e revisão completa do código.

---

## Tabela de Melhorias por Etapas

### ETAPA 1 — Segurança e Estabilidade (Prioridade Alta) ✅ CONCLUÍDA

| # | Área | Melhoria | Impacto | Esforço | Status |
|---|------|----------|---------|---------|--------|
| ~~1.1~~ | **Segurança** | Remover endpoint `/debug` em produção (expõe paths internos, env vars, estrutura do servidor) | Alto | Baixo | ✅ |
| ~~1.2~~ | **Segurança** | CORS restritivo — substituir `cors()` aberto por allowlist de origens | Alto | Baixo | ✅ |
| ~~1.3~~ | **Segurança** | Rate limiting na API — adicionar `express-rate-limit` para prevenir abuso | Alto | Baixo | ✅ |
| ~~1.4~~ | **Segurança** | Validar `poolId` em DELETE `/favorites/:poolId` e `/watchlist/:poolId` contra injection | Médio | Baixo | ✅ |
| ~~1.5~~ | **Estabilidade** | Adicionar graceful shutdown (SIGTERM handler) para fechar conexões Prisma e cron jobs | Alto | Médio | ✅ |
| ~~1.6~~ | **Tipos** | Remover `any` em `saveRiskConfig(riskConfig: any)` — criar schema Zod | Médio | Baixo | ✅ |

### ETAPA 2 — Performance (Prioridade Alta) ✅ CONCLUÍDA

| # | Área | Melhoria | Impacto | Esforço | Status |
|---|------|----------|---------|---------|--------|
| ~~2.1~~ | **Backend** | `routes/index.ts` tem ~967 linhas — separar em módulos: `pools.routes.ts`, `settings.routes.ts`, `alerts.routes.ts`, `ranges.routes.ts`, `data.routes.ts` | Alto | Médio | ✅ |
| ~~2.2~~ | **Backend** | PrismaClient lazy init com `require()` — migrar para import dinâmico `await import()` (ESM correto) | Médio | Baixo | ✅ |
| ~~2.3~~ | **Backend** | Keep-alive com `import('http')` dinâmico a cada 13min — usar `node-cron` schedule já existente | Baixo | Baixo | ✅ |
| ~~2.4~~ | **Frontend** | Bundle splitting — lazy load das páginas com `React.lazy()` + `Suspense` (reduz initial bundle) | Alto | Médio | ✅ |
| ~~2.5~~ | **Frontend** | Tipos duplicados entre `api/client.ts` e `types/pool.ts` — documentar distinção UI vs API | Médio | Médio | ✅ |
| ~~2.6~~ | **Backend** | `@types/*` e `typescript` movidos para `devDependencies` | Baixo | Baixo | ✅ |

### ETAPA 3 — Qualidade de Código ✅ CONCLUÍDA

| # | Área | Melhoria | Status |
|---|------|----------|--------|
| ~~3.1~~ | **Backend** | Estado global mutável em `jobs/index.ts` — encapsular em MemoryStore | ✅ `memoryStore` já gerencia todo estado compartilhado |
| ~~3.2~~ | **Backend** | `require()` → migrar para `import()` ESM | ✅ Nenhum `require()` encontrado no codebase |
| ~~3.3~~ | **Frontend** | `ErrorBoundary` → `react-error-boundary` | ✅ `App.tsx` usa `react-error-boundary` |
| ~~3.4~~ | **Backend** | Scores centralizados via MemoryStore | ✅ `scoreService.calculateScore()` é a única fonte |
| ~~3.5~~ | **Testes** | Testes unitários para `score.service.ts`, `calc.service.ts` | ✅ 264 testes backend (12 arquivos) |
| ~~3.6~~ | **Testes** | Testes de integração para rotas críticas | ✅ `api.integration.test.ts` existe |

### ETAPA 4 — Experiência do Usuário ✅ CONCLUÍDA

| # | Área | Melhoria | Status |
|---|------|----------|--------|
| ~~4.1~~ | **Frontend** | Loading states shimmer/pulse | ✅ `Skeleton` shadcn/ui em todas as páginas |
| ~~4.2~~ | **Frontend** | Error handling global — interceptor axios + toast | ✅ `api/client.ts` interceptor com `toast.error()` |
| ~~4.3~~ | **Frontend** | PWA — service worker + manifest | ✅ `sw.js` + `manifest.json` em `/public` |
| ~~4.4~~ | **Frontend** | Dark/Light theme toggle | ✅ `Header.tsx` com `useTheme()` + toggle botão |
| ~~4.5~~ | **Backend** | WebSocket real-time | ✅ `websocket.service.ts` + `useWebSocket` hook + `LiveIndicator` |
| 4.6 | **Frontend** | i18n | ⏭️ Skip — baixo impacto, alto esforço |

### ETAPA 5 — Infraestrutura e DevOps ✅ CONCLUÍDA

| # | Área | Melhoria | Status |
|---|------|----------|--------|
| ~~5.1~~ | **CI/CD** | GitHub Actions build + typecheck | ✅ `tests.yml` + `claude.yml` |
| ~~5.2~~ | **CI/CD** | ESLint + Prettier configurado | ✅ `eslint.config.js` + `.prettierrc` (commit `9726098`) |
| ~~5.3~~ | **Deploy** | Health check robusto — DB + memory | ✅ `/health` com DB ping 3s timeout + heap/rss |
| ~~5.4~~ | **Deploy** | Docker compose dev local | ✅ `docker-compose.yml` + `Dockerfile.dev` (commit `9726098`) |
| ~~5.5~~ | **Monitoramento** | Structured logging JSON | ✅ `log.service.ts` — JSON em produção |
| ~~5.6~~ | **Deploy** | dist/ fora do git | ✅ `.gitignore` atualizado (commit `9726098`) |

### ETAPA 6 — Features Novas ✅ CONCLUÍDA

| # | Área | Melhoria | Status |
|---|------|----------|--------|
| ~~6.1~~ | **Feature** | Histórico de performance por pool (gráfico temporal score/APR/TVL) | ✅ `PoolMetricsChart` + endpoint `/metrics-history` (commit `ce0f477`) |
| ~~6.2~~ | **Feature** | Comparação side-by-side de pools | ✅ `PoolCompare.tsx` |
| ~~6.3~~ | **Feature** | Backtesting de estratégias | ✅ `POST /api/backtest` + `calcBacktest()` |
| ~~6.4~~ | **Feature** | API pública Swagger/OpenAPI | ✅ `docs.routes.ts` com spec OpenAPI 3.0 + Swagger UI |
| ~~6.5~~ | **Feature** | Multi-wallet tracking | ✅ `WalletTracker.tsx` + The Graph positions |
| ~~6.6~~ | **Feature** | Webhook Discord/Slack | ✅ `webhook.service.ts` com Discord Embeds + Slack Block Kit |

---

## Resumo por Prioridade

| Etapa | Foco | Items | Prioridade | Recomendação |
|-------|------|-------|------------|--------------|
| **1** | Segurança e Estabilidade | 6 | **Alta** | ✅ CONCLUÍDA |
| **2** | Performance | 6 | **Alta** | ✅ CONCLUÍDA |
| **3** | Qualidade de Código | 6 | **Média** | ✅ CONCLUÍDA |
| **4** | UX | 6 | **Média** | ✅ CONCLUÍDA |
| **5** | DevOps | 6 | **Baixa** | ✅ CONCLUÍDA |
| **6** | Features | 6 | **Futura** | ✅ CONCLUÍDA |

---

## Como Usar Este Plano

1. **Em cada sessão Claude**, referencie este arquivo: `"Continuar melhorias da ETAPA X"`
2. **Marque como feito** riscando o item: ~~1.1~~
3. **Priorize** itens de impacto alto + esforço baixo primeiro
4. **Valide** cada etapa com build + deploy antes de avançar
