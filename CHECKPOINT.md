# CHECKPOINT - Pool Intelligence Pro

## Status Atual
**Branch:** `claude/pool2026-ui-lovable-eSwtR`
**Data:** 2026-02-27 UTC
**Fase:** TODAS as Scout pages convertidas para React Query — pronto para merge e deploy

## Para Continuar (IMPORTANTE)
**Frase de continuacao:** `"Continuar do CHECKPOINT 2026-02-27"`

---

## RESUMO DE TUDO QUE FOI FEITO

### Problema Original
O novo frontend (Scout design) foi deployado em `pool2026prm.onrender.com` mas:
1. Pools não apareciam (tela vazia)
2. Telegram não funcionava
3. Sistema ficava offline

### Causa Raiz
As paginas antigas usavam **React Query** (useQuery/useMutation) com:
- Retry automatico 3x
- Cache + stale-while-revalidate
- Background refetch

As novas Scout pages usavam **useState/useEffect cru** sem retry.
Qualquer falha transiente (cold start do Render 30-60s) → tela vazia permanente.

### Solucao Aplicada
Convertemos TODAS as Scout pages para React Query + API client robusto.

---

## Paginas Convertidas para React Query

| Pagina | Status | Refetch | Detalhes |
|--------|--------|---------|----------|
| ScoutDashboard | ✅ React Query | 60s | Alertas reais da API, exposicao por rede real |
| ScoutRecommended | ✅ React Query | 120s | addFavorite conectado a API, isFetching |
| ScoutActivePools | ✅ React Query | 60s | Delete position com useMutation |
| ScoutFavorites | ✅ React Query | 60s | Remove favorite com useMutation |
| ScoutPoolDetail | ✅ React Query | 120s | Error state com diagnostico, favoritar mutation |
| ScoutSettings | ✅ Completo | - | Telegram: 3 botoes (testar, relatorio, recomendacoes) |
| ScoutHistory | ✅ localStorage | - | Nao precisa de API (operacoes locais do usuario) |

## API Client (client.ts) — Robusto

```
resolveApiUrl() → ignora localhost em producao → fallback para pool-intelligence-api.onrender.com
timeout: 60s (cold start do Render)
Axios retry interceptor: 2x em rede/502/503/timeout (3s + 8s)
React Query retry: 3x por cima
Total: ~5 tentativas antes de mostrar erro
```

## Arquitetura

```
pool2026prm.onrender.com (Static Site - React + Vite)
  ↓ API calls
pool-intelligence-api.onrender.com (Web Service - Node/Express)
  ↓ Database
PostgreSQL (Render)
  ↓ External APIs
DefiLlama / GeckoTerminal / DexScreener / TheGraph
```

## Todos os Arquivos Modificados

### Core
- `pool-intelligence-pro/frontend/src/api/client.ts` — API client robusto
- `pool-intelligence-pro/frontend/package.json` — build sem tsc (OOM no Render)
- `pool-intelligence-pro/frontend/public/_redirects` — SPA routing
- `pool-intelligence-pro/render.yaml` — npm ci --include=dev

### Scout Pages
- `pool-intelligence-pro/frontend/src/pages/ScoutDashboard.tsx` — React Query
- `pool-intelligence-pro/frontend/src/pages/ScoutRecommended.tsx` — React Query
- `pool-intelligence-pro/frontend/src/pages/ScoutActivePools.tsx` — React Query
- `pool-intelligence-pro/frontend/src/pages/ScoutFavorites.tsx` — React Query
- `pool-intelligence-pro/frontend/src/pages/ScoutPoolDetail.tsx` — React Query
- `pool-intelligence-pro/frontend/src/pages/ScoutSettings.tsx` — Telegram completo

## Passos Para Deploy

1. **Merge para main** via GitHub PR:
   https://github.com/mateusraony/Pool2026prm/compare/main...claude/pool2026-ui-lovable-eSwtR

2. **No Render** (pool2026prm): "Clear build cache & deploy"

3. **Verificar**:
   - `https://pool-intelligence-api.onrender.com/health` → {"status":"ok"}
   - `https://pool2026prm.onrender.com` → Pools devem aparecer

## Variaveis de Ambiente

### Backend (pool-intelligence-api)
```
NODE_ENV=production
PORT=10000
DATABASE_URL=postgresql://...
TELEGRAM_BOT_TOKEN=seu_token
TELEGRAM_CHAT_ID=seu_chat_id
```

### Frontend (pool2026prm)
```
VITE_API_URL=https://pool-intelligence-api.onrender.com
```
(Se nao configurado, o client.ts usa esse URL como fallback automatico)

## Melhorias Futuras (nao criticas)
- [ ] Code splitting para reduzir bundle (~740KB → ~300KB)
- [ ] Testes unitarios (Vitest)
- [ ] Graficos com dados real-time no ScoutPoolDetail
- [ ] ScoutHistory: migrar para API se endpoint for criado no backend
