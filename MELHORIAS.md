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

### ETAPA 3 — Qualidade de Código (Prioridade Média)

| # | Área | Melhoria | Impacto | Esforço |
|---|------|----------|---------|---------|
| 3.1 | **Backend** | Estado global mutável em `jobs/index.ts` (latestRadarResults, watchlist) — encapsular em classe ou MemoryStore | Médio | Médio |
| 3.2 | **Backend** | `require()` usado dentro de `initPersistence()` e server startup — migrar para `import()` | Médio | Baixo |
| 3.3 | **Frontend** | `ErrorBoundary` class component — migrar para hook pattern com `react-error-boundary` | Baixo | Baixo |
| 3.4 | **Backend** | Scores recalculados em múltiplos lugares (routes + jobs) — centralizar via MemoryStore | Médio | Médio |
| 3.5 | **Testes** | Nenhum teste existe — adicionar testes unitários para `score.service.ts`, `calc.service.ts` | Alto | Alto |
| 3.6 | **Testes** | Adicionar testes de integração para rotas críticas (`/api/pools`, `/api/recommendations`) | Alto | Alto |

### ETAPA 4 — Experiência do Usuário (Prioridade Média)

| # | Área | Melhoria | Impacto | Esforço |
|---|------|----------|---------|---------|
| 4.1 | **Frontend** | Loading states — substituir skeleton básico por shimmer/pulse nos cards de pool | Médio | Baixo |
| 4.2 | **Frontend** | Error handling global — interceptor do axios mostrando toast com mensagem amigável | Médio | Baixo |
| 4.3 | **Frontend** | PWA — adicionar service worker + manifest para uso offline e instalação mobile | Médio | Médio |
| 4.4 | **Frontend** | Dark/Light theme toggle — `next-themes` já está nas dependências mas não implementado | Médio | Médio |
| 4.5 | **Backend** | WebSocket para atualizações real-time (preço, score, alertas) em vez de polling | Alto | Alto |
| 4.6 | **Frontend** | Internacionalização (i18n) — mensagens estão misturadas PT/EN | Baixo | Alto |

### ETAPA 5 — Infraestrutura e DevOps (Prioridade Baixa)

| # | Área | Melhoria | Impacto | Esforço |
|---|------|----------|---------|---------|
| 5.1 | **CI/CD** | GitHub Actions para build + typecheck em PRs (além do @claude) | Alto | Médio |
| 5.2 | **CI/CD** | Lint (ESLint + Prettier) configurado e rodando no CI | Médio | Médio |
| 5.3 | **Deploy** | Health check mais robusto — verificar DB connection + memory usage | Médio | Baixo |
| 5.4 | **Deploy** | Docker compose para dev local (PostgreSQL + app) | Médio | Médio |
| 5.5 | **Monitoramento** | Structured logging (JSON) para integrar com Render logs / Datadog | Médio | Médio |
| 5.6 | **Deploy** | Separar `dist/` do git — rebuildar no deploy (já configurado no Render mas dist está no repo) | Baixo | Baixo |

### ETAPA 6 — Features Novas (Prioridade Futura)

| # | Área | Melhoria | Impacto | Esforço |
|---|------|----------|---------|---------|
| 6.1 | **Feature** | Histórico de performance por pool (gráfico temporal de score/APR/TVL) | Alto | Alto |
| 6.2 | **Feature** | Comparação side-by-side de pools | Médio | Médio |
| 6.3 | **Feature** | Backtesting de estratégias de range com dados históricos | Alto | Alto |
| 6.4 | **Feature** | API pública com documentação Swagger/OpenAPI | Médio | Médio |
| 6.5 | **Feature** | Multi-wallet tracking (conectar via WalletConnect) | Alto | Alto |
| 6.6 | **Feature** | Webhook genérico para integrar com Discord, Slack, etc. | Médio | Médio |

---

## Resumo por Prioridade

| Etapa | Foco | Items | Prioridade | Recomendação |
|-------|------|-------|------------|--------------|
| **1** | Segurança e Estabilidade | 6 | **Alta** | ✅ CONCLUÍDA |
| **2** | Performance | 6 | **Alta** | ✅ CONCLUÍDA |
| **3** | Qualidade de Código | 6 | **Média** | Sprint dedicado |
| **4** | UX | 6 | **Média** | Incremental |
| **5** | DevOps | 6 | **Baixa** | Quando necessário |
| **6** | Features | 6 | **Futura** | Sob demanda |

---

## Como Usar Este Plano

1. **Em cada sessão Claude**, referencie este arquivo: `"Continuar melhorias da ETAPA X"`
2. **Marque como feito** riscando o item: ~~1.1~~
3. **Priorize** itens de impacto alto + esforço baixo primeiro
4. **Valide** cada etapa com build + deploy antes de avançar
