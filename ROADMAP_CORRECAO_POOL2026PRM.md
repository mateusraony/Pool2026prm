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

## Fase 2 — Dados Confiáveis

**Objetivo:** o usuário saber exatamente o que é confiável e o que é aproximação.

#### 3.1 — Separar dado observado, estimado e simulado
- **Status**: ⬜ Não iniciado

#### 3.2 — Remover fallback de preço artificial baseado em TVL
- **Status**: ⬜ Não iniciado

#### 3.3 — Liquidez sintética precisa ser gritante visualmente
- **Status**: ⬜ Não iniciado

#### 3.4 — Volume/fees intraday estimados precisam ser identificados
- **Status**: ⬜ Não iniciado

---

## Fase 3 — Matemática Central

**Objetivo:** fazer o motor quantitativo ficar digno do visual do produto.

#### 4.1 — Reescrever matemática de concentrated liquidity (módulo CL)
- **Status**: ⬜ Não iniciado

#### 4.2 — Refazer Monte Carlo em cima da matemática nova
- **Status**: ⬜ Não iniciado

#### 4.3 — Refazer backtest para usar lógica real
- **Status**: ⬜ Não iniciado

#### 4.4 — Corrigir portfolio analytics
- **Status**: ⬜ Não iniciado

#### 4.5 — Corrigir correlação (estatística real ou renomear como heurística)
- **Status**: ⬜ Não iniciado

#### 4.6 — Adicionar modelo de custo real da operação
- **Status**: ⬜ Não iniciado

---

## Fase 4 — Portfolio e Risco

**Objetivo:** sair de "calculadora bonita" para "sistema de decisão maduro".

#### 5.1 — Criar camada séria de risco de contrato/token/pool
- **Status**: ⬜ Não iniciado

#### 5.2 — Criar classificador de regime de mercado para LP
- **Status**: ⬜ Não iniciado

#### 5.3 — Criar modo "não operar"
- **Status**: ⬜ Não iniciado

---

## Fase 5 — Eventos e Automação

**Objetivo:** tudo o que sai do sistema ter coerência.

#### 5.4 — Criar motor único de eventos (event bus)
- **Status**: ⬜ Não iniciado

#### 5.5 — Timezone e agendamento profissional
- **Status**: ⬜ Não iniciado

---

## Fase 6 — Inteligência Premium

**Objetivo:** transformar o projeto em plataforma de nível realmente alto.
(Só entra depois das fases 1-5 estarem sólidas)

- 6.1 Liquidez real por tick/faixa — ⬜ Não iniciado
- 6.2 Benchmark de ranges — ⬜ Não iniciado
- 6.3 Diário de decisão e replay — ⬜ Não iniciado
- 6.4 Ajuste automático de pesos — ⬜ Não iniciado
- 6.5 Smoke tests pós-deploy — ⬜ Não iniciado

---

## Histórico de Sessões

| Sessão | Data | Blocos executados | Commit |
|--------|------|-------------------|--------|
| 1 | 2026-03-19 | Bloco 1 + Bloco 2 (Fase 1 completa) | pendente |
