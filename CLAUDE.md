# Pool Intelligence Pro — CLAUDE.md

> Arquivo de contexto para o Claude Code. Leia isto ANTES de qualquer tarefa.

## Sobre o Projeto

**Pool Intelligence Pro** é um sistema enterprise-grade de inteligência para pools de liquidez DeFi.
Monitora, analisa, pontua e recomenda pools em múltiplas chains (Ethereum, Arbitrum, Base, Polygon).

### Stack Técnico

| Camada | Tecnologia |
|--------|-----------|
| **Frontend** | React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui + Recharts |
| **Backend** | Express + TypeScript + Prisma + PostgreSQL |
| **Bot** | Telegram Bot API (node-telegram-bot-api) |
| **Deploy** | Render (web service + PostgreSQL) |
| **State** | Zustand (frontend) + MemoryStore + Cache (backend) |

### Estrutura de Diretórios

```
Pool2026prm/
├── CLAUDE.md                          # ← Este arquivo
├── CHECKPOINT.md                      # Estado atual para continuidade
├── package.json                       # Scripts root (install:all, build, start)
├── .github/workflows/claude.yml       # GitHub Actions para @claude
├── .claude/
│   ├── commands/                      # Slash commands customizados
│   └── settings.json                  # Configurações do Claude Code
└── pool-intelligence-pro/
    ├── frontend/                      # React SPA
    │   ├── src/
    │   │   ├── pages/                 # Scout* (primárias) + Utility pages
    │   │   ├── components/            # layout/, common/, charts/, ui/
    │   │   ├── api/client.ts          # Axios client → /api
    │   │   ├── hooks/                 # useRiskConfig, useTokenPrice, use-mobile
    │   │   ├── data/                  # adapters, constants
    │   │   └── types/pool.ts          # Tipos frontend
    │   └── package.json
    ├── backend/
    │   ├── src/
    │   │   ├── index.ts               # Express server + SPA fallback
    │   │   ├── config/index.ts        # Todas as env vars centralizadas
    │   │   ├── routes/index.ts        # Todas as rotas API
    │   │   ├── routes/validation.ts   # Schemas Zod
    │   │   ├── adapters/              # DefiLlama, GeckoTerminal, DexScreener, TheGraph
    │   │   ├── services/              # score, calc, cache, range, alert, persist, etc.
    │   │   ├── jobs/                  # radar, watchlist (cron-like)
    │   │   ├── bot/telegram.ts        # Telegram bot
    │   │   └── types/index.ts         # Tipos centrais (Pool, Score, Recommendation)
    │   ├── prisma/schema.prisma       # 15+ models (PostgreSQL)
    │   └── package.json
    └── render.yaml                    # Deploy config
```

## Regras de Desenvolvimento

### Padrões de Código

- **TypeScript strict** — nunca usar `any` sem justificativa
- **Imports com `.js`** no backend (ESM + tsc): `import { x } from './foo.js'`
- **Nomes descritivos** em português para comentários, inglês para código
- **Sem console.log** em produção — usar `logService.info/warn/error`
- **Zod** para validação de inputs na API (`routes/validation.ts`)
- **MemoryStore** como cache primário, DB como persistência

### Convenções de Commit

```
tipo: descrição breve em português

Tipos: feat | fix | refactor | style | test | docs | chore | perf
Exemplos:
  feat: adicionar filtro por token na watchlist
  fix: corrigir cálculo de IL para pools estáveis
  perf: otimizar query de pools com índice composto
```

### Rotas API

Todas as rotas começam com `/api`. Formato de resposta padrão:
```typescript
{ success: boolean, data?: T, error?: string, timestamp: Date }
```

### Segurança

- **NUNCA** commitar `.env`, `DATABASE_URL`, tokens ou secrets
- **Helmet** está habilitado (CSP desabilitado para Vite)
- **CORS** aberto (single-user app) — restringir se multi-user
- Validar TODOS os inputs com Zod antes de processar
- **Debug endpoint** (`/debug`) deve ser removido em produção

### Deploy (Render)

- Root: `pool-intelligence-pro/backend`
- Build: `npm install && npm run build` (auto-detecta e builda frontend)
- Start: `npm start`
- Health: `/health`
- Keep-alive: ping `/health` a cada 13min (free tier)

## Como Continuar uma Sessão

1. Leia `CHECKPOINT.md` para saber o estado atual
2. Rode `git log --oneline -10` para ver últimos commits
3. Rode `npm run build` em `pool-intelligence-pro/` para validar
4. Atualize `CHECKPOINT.md` ao final da sessão

## Padrões de Qualidade

### Antes de Commitar
- [ ] TypeScript compila sem erros
- [ ] Zod schemas atualizados para novos campos
- [ ] Prisma schema atualizado se houver mudança de modelo
- [ ] Frontend e backend buildando corretamente
- [ ] CHECKPOINT.md atualizado

### Anti-Patterns a Evitar
- Não criar arquivos novos se um existente pode ser editado
- Não adicionar dependências sem justificativa clara
- Não fazer over-engineering — mínimo necessário
- Não duplicar lógica entre frontend e backend
- Não ignorar erros silenciosamente (`catch {}` vazio)

## Referências Rápidas

### Endpoints Principais
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/pools` | Lista pools (filtros, sort, paginação) |
| GET | `/api/pools/:chain/:address` | Pool individual |
| GET | `/api/pools-detail/:chain/:address` | Pool + ranges + fees + IL |
| GET | `/api/recommendations` | Top recomendações |
| GET/POST/DELETE | `/api/watchlist` | Watchlist CRUD |
| GET/POST/DELETE | `/api/alerts` | Alertas CRUD |
| GET/POST/DELETE | `/api/ranges` | Monitoramento de range |
| GET/POST/DELETE | `/api/favorites` | Favoritos |
| GET/POST/DELETE | `/api/notes` | Notas por pool |
| GET/PUT | `/api/settings/*` | Configurações |
| POST | `/api/range-calc` | Calculadora de range |

### Páginas Frontend
| Rota | Página | Descrição |
|------|--------|-----------|
| `/dashboard` | ScoutDashboard | Dashboard principal |
| `/recommended` | ScoutRecommended | Recomendações de pools |
| `/active` | ScoutActivePools | Pools ativas monitoradas |
| `/favorites` | ScoutFavorites | Pools favoritas |
| `/pools` | Pools | Lista completa de pools |
| `/pools/:chain/:address` | ScoutPoolDetail | Detalhe de pool |
| `/simulation/:chain/:address` | Simulation | Simulador de range |
| `/radar` | Radar | Radar de descoberta |
| `/token-analyzer` | TokenAnalyzer | Análise de tokens |
| `/alerts` | Alerts | Configuração de alertas |
| `/status` | Status | Health do sistema |
| `/scout-settings` | ScoutSettings | Configurações |

## Uso do Claude

Mencione `@claude` em qualquer comentário de Issue ou PR para obter assistência.
Respostas são geradas via GitHub Actions (`.github/workflows/claude.yml`).

### Slash Commands Disponíveis

- `/status` — Verificar health do sistema e resumo
- `/checkpoint` — Gerar/atualizar CHECKPOINT.md
- `/analyze` — Analisar código e sugerir melhorias
- `/deploy-check` — Verificar se build está pronto para deploy
