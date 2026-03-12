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
│   ├── commands/                      # Slash commands (projeto + GSD)
│   ├── agents/                        # GSD agents (executor, planner, etc.)
│   ├── skills/ui-ux-pro-max/         # UI-UX Pro Max skill + dados
│   ├── get-shit-done/                 # GSD core (workflows, bin, templates)
│   ├── hooks/                         # GSD hooks (update, context monitor, statusline)
│   └── settings.json                  # Permissões + hooks (GSD + claude-mem)
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

### Segurança (ETAPA 1 ✅)

- **NUNCA** commitar `.env`, `DATABASE_URL`, tokens ou secrets
- **Helmet** está habilitado (CSP desabilitado para Vite)
- **CORS** restritivo em produção (allowlist via `RENDER_EXTERNAL_URL`, `APP_URL`, `CORS_ORIGIN`)
- **Rate limiting** ativo: 100 req/min por IP em `/api/*`
- Validar TODOS os inputs com Zod antes de processar
- **Debug endpoint** (`/debug`) só existe em development
- **Graceful shutdown** configurado (SIGTERM/SIGINT)
- **Param validation** em todos os DELETE endpoints

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

## Skills & Ferramentas Instaladas

### 1. GSD — Get Shit Done (v1.22.4)
Meta-prompting e context engineering para desenvolvimento spec-driven.
- **Quando usar**: Projetos grandes, planejamento de fases, execução paralela
- **Comandos principais**:
  - `/gsd:new-project` — Inicializar projeto com research + roadmap
  - `/gsd:plan-phase N` — Pesquisar + planejar fase N
  - `/gsd:execute-phase N` — Executar planos em waves paralelas
  - `/gsd:quick` — Tarefas ad-hoc sem planejamento completo
  - `/gsd:progress` — Status e próximos passos
  - `/gsd:map-codebase` — Mapear codebase existente
  - `/gsd:resume-work` — Retomar trabalho de sessão anterior
  - `/gsd:help` — Todos os comandos disponíveis

### 2. UI-UX Pro Max Skill
Design intelligence com 161 regras de raciocínio, 67 estilos UI, 161 paletas, 57 pares tipográficos.
- **Auto-ativa** em requests de UI/UX (landing pages, dashboards, componentes visuais)
- **Stack suportadas**: React, shadcn/ui, TailwindCSS (nosso stack)
- **Dados**: `.claude/skills/ui-ux-pro-max/data/` (estilos, cores, tipografia, guidelines)

### 3. Claude-Mem (Memória Persistente)
Sistema de memória que captura automaticamente o que Claude faz, comprime com AI, e injeta contexto relevante em sessões futuras.
- **Automático**: Hooks configurados em SessionStart, PostToolUse, Stop
- **Busca**: Use `mem-search` para consultar histórico de sessões
- **Privacidade**: Use tags `<private>` para excluir conteúdo sensível

### 4. Awesome Claude Code (Best Practices)
Referência de best practices integrada no CLAUDE.md e configurações do projeto.
- Multi-agent orchestration via subagents
- Context engineering (arquivos separados para qualidade)
- Atomic git commits por tarefa
- Structured logging e error boundaries

## Workflow Recomendado

1. **Início de sessão**: Leia `CHECKPOINT.md` → `/gsd:resume-work` ou `/gsd:progress`
2. **Antes de UI/UX**: O skill UI-UX Pro Max auto-ativa; para design systems: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "query"`
3. **Tarefas rápidas**: `/gsd:quick` para mudanças pontuais com tracking
4. **Memória**: Claude-mem salva contexto automaticamente entre sessões
5. **Final de sessão**: `/checkpoint` para salvar estado

## Uso do Claude

Mencione `@claude` em qualquer comentário de Issue ou PR para obter assistência.
Respostas são geradas via GitHub Actions (`.github/workflows/claude.yml`).

### Slash Commands do Projeto

- `/status` — Verificar health do sistema e resumo
- `/checkpoint` — Gerar/atualizar CHECKPOINT.md
- `/analyze` — Analisar código e sugerir melhorias
- `/deploy-check` — Verificar se build está pronto para deploy

### Slash Commands GSD (Get Shit Done)

Veja `/gsd:help` para a lista completa. Principais:
`/gsd:new-project`, `/gsd:plan-phase`, `/gsd:execute-phase`, `/gsd:verify-work`, `/gsd:quick`, `/gsd:progress`
