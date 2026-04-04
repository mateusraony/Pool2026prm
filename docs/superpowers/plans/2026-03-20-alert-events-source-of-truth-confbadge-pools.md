# Alert Events Source of Truth + ConfBadge na Lista de Pools

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (A) criar uma fonte única de verdade para tipos de alerta — eliminando a string duplicada em 4 arquivos — e (B) exibir badges de confiança de dados (`ConfBadge`) na lista de pools (`Pools.tsx`), tornando visível o que é observado/estimado para o usuário.

**Architecture:**
- (A) O backend ganha `backend/src/constants/alert-events.ts`; o frontend ganha `frontend/src/data/alert-events.ts`. Ambos são importados pelos seus respectivos consumidores. Um comentário em cada arquivo aponta para o outro como referência de sincronia. Não é possível compartilhar um arquivo entre os dois pacotes (tsconfig separados, rootDir distintos).
- (B) `ConfBadge` é extraído de `ScoutPoolDetail.tsx` para `frontend/src/components/common/ConfBadge.tsx`, depois importado em `Pools.tsx` para decorar APR na tabela e nos cards mobile.

**Tech Stack:** TypeScript strict, React 18, Zod (backend), TailwindCSS, Vitest (testes)

---

## Mapa de Arquivos

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| `backend/src/constants/alert-events.ts` | **CRIAR** | Array canônico dos 8 tipos com metadados |
| `backend/src/types/index.ts` | **MODIFICAR** | `AlertType` deriva dos valores do arquivo acima |
| `backend/src/routes/validation.ts` | **MODIFICAR** | `alertSchema.type` usa `z.enum([...ALERT_TYPE_VALUES])` |
| `frontend/src/data/alert-events.ts` | **CRIAR** | Mirror do backend + metadados de UI (label, icon, unit) |
| `frontend/src/pages/Alerts.tsx` | **MODIFICAR** | Importa `AlertType` e `alertTypeConfig` do data file |
| `frontend/src/pages/ScoutSettings.tsx` | **MODIFICAR** | `ALERT_EVENTS` importado do data file |
| `frontend/src/components/common/ConfBadge.tsx` | **CRIAR** | Componente extraído de ScoutPoolDetail |
| `frontend/src/pages/ScoutPoolDetail.tsx` | **MODIFICAR** | Remove definição local de `ConfBadge`; importa do comum |
| `frontend/src/pages/Pools.tsx` | **MODIFICAR** | Importa `ConfBadge`; adiciona em APR (tabela + mobile card) |

---

## Task 1 — Backend: `alert-events.ts` como fonte canônica

**Arquivos:**
- Criar: `pool-intelligence-pro/backend/src/constants/alert-events.ts`
- Modificar: `pool-intelligence-pro/backend/src/types/index.ts` (linhas ~198-206)
- Modificar: `pool-intelligence-pro/backend/src/routes/validation.ts` (linha ~41)

### Contexto de implementação

O backend hoje tem:
- `types/index.ts` linhas 198-206: `AlertType` definido como union literal
- `routes/validation.ts` linha 41: `z.enum(['PRICE_ABOVE', ... , 'NEW_RECOMMENDATION'])` — lista literal duplicada

### Steps

- [ ] **1.1 — Criar `backend/src/constants/alert-events.ts`**

```typescript
/**
 * Fonte única de verdade para tipos de alerta no backend.
 * SINCRONIZAR com: frontend/src/data/alert-events.ts
 *
 * Para adicionar um novo tipo:
 *   1. Adicione aqui em ALERT_TYPE_VALUES
 *   2. Adicione implementação em alert.service.ts (checkRule switch)
 *   3. Sincronize frontend/src/data/alert-events.ts
 */

export const ALERT_TYPE_VALUES = [
  'PRICE_ABOVE',
  'PRICE_BELOW',
  'VOLUME_DROP',
  'LIQUIDITY_FLIGHT',
  'VOLATILITY_SPIKE',
  'OUT_OF_RANGE',
  'NEAR_RANGE_EXIT',
  'NEW_RECOMMENDATION',
] as const;

/** Metadados por tipo — usados em logs e mensagens do sistema */
export const ALERT_TYPE_META: Record<typeof ALERT_TYPE_VALUES[number], {
  description: string;
  implemented: boolean;
}> = {
  PRICE_ABOVE:        { description: 'Preço acima do limite',           implemented: true },
  PRICE_BELOW:        { description: 'Preço abaixo do limite',          implemented: true },
  VOLUME_DROP:        { description: 'Queda de volume acima do limiar', implemented: true },
  LIQUIDITY_FLIGHT:   { description: 'Fuga de liquidez',                implemented: true },
  VOLATILITY_SPIKE:   { description: 'Spike de volatilidade',           implemented: true },
  OUT_OF_RANGE:       { description: 'Preço saiu do range da posição',  implemented: true },
  NEAR_RANGE_EXIT:    { description: 'Preço próximo do limite do range', implemented: true },
  NEW_RECOMMENDATION: { description: 'Nova recomendação de IA',         implemented: true },
};
```

- [ ] **1.2 — Atualizar `backend/src/types/index.ts`**

Substituir o bloco de linhas 195-206:

```typescript
// ANTES:
// export type AlertType =
//   | 'PRICE_ABOVE'
//   | 'PRICE_BELOW'
//   | ...

// DEPOIS:
import { ALERT_TYPE_VALUES } from '../constants/alert-events.js';

// ALERT TYPES
// ============================================

export type AlertType = typeof ALERT_TYPE_VALUES[number];
```

⚠️ **Atenção ESM**: usar `'../constants/alert-events.js'` (com `.js`) — obrigatório no backend (NodeNext).

- [ ] **1.3 — Atualizar `backend/src/routes/validation.ts`**

No início do arquivo, adicionar import:
```typescript
import { ALERT_TYPE_VALUES } from '../constants/alert-events.js';
```

Na linha ~41, substituir o literal:
```typescript
// ANTES:
type: z.enum(['PRICE_ABOVE', 'PRICE_BELOW', 'VOLUME_DROP', 'LIQUIDITY_FLIGHT', 'VOLATILITY_SPIKE', 'OUT_OF_RANGE', 'NEAR_RANGE_EXIT', 'NEW_RECOMMENDATION']),

// DEPOIS:
type: z.enum(ALERT_TYPE_VALUES),
```

- [ ] **1.4 — Verificar TypeScript no backend**

```bash
cd pool-intelligence-pro/backend && npx tsc --noEmit
```

Resultado esperado: **0 erros**

- [ ] **1.5 — Rodar testes do backend**

```bash
cd pool-intelligence-pro/backend && npm test
```

Resultado esperado: **152 testes passando**

- [ ] **1.6 — Commit**

```bash
git add pool-intelligence-pro/backend/src/constants/alert-events.ts \
        pool-intelligence-pro/backend/src/types/index.ts \
        pool-intelligence-pro/backend/src/routes/validation.ts
git commit -m "refactor: extrair AlertType para constants/alert-events.ts (fonte única backend)"
```

---

## Task 2 — Frontend: `alert-events.ts` + atualizar Alerts.tsx + ScoutSettings.tsx

**Arquivos:**
- Criar: `pool-intelligence-pro/frontend/src/data/alert-events.ts`
- Modificar: `pool-intelligence-pro/frontend/src/pages/Alerts.tsx` (linhas 7-24)
- Modificar: `pool-intelligence-pro/frontend/src/pages/ScoutSettings.tsx` (linhas ~1076-1087)

### Contexto de implementação

O frontend hoje tem:
- `Alerts.tsx` linhas 7-24: `AlertType` union literal + `alertTypeConfig` record inline
- `ScoutSettings.tsx` linhas ~1076-1087: `ALERT_EVENTS` array com labels duplicados

### Steps

- [ ] **2.1 — Criar `frontend/src/data/alert-events.ts`**

```typescript
/**
 * Fonte única de verdade para tipos de alerta no frontend.
 * SINCRONIZAR com: backend/src/constants/alert-events.ts
 *
 * Para adicionar um novo tipo:
 *   1. Adicione em ALERT_TYPE_VALUES (array e metadata abaixo)
 *   2. Sincronize backend/src/constants/alert-events.ts
 */

export const ALERT_TYPE_VALUES = [
  'PRICE_ABOVE',
  'PRICE_BELOW',
  'VOLUME_DROP',
  'LIQUIDITY_FLIGHT',
  'VOLATILITY_SPIKE',
  'OUT_OF_RANGE',
  'NEAR_RANGE_EXIT',
  'NEW_RECOMMENDATION',
] as const;

export type AlertType = typeof ALERT_TYPE_VALUES[number];

export const alertTypeConfig: Record<AlertType, {
  label: string;
  icon: string;
  unit: string;
  description: string;
}> = {
  PRICE_ABOVE:        { label: 'Preço Acima',            icon: '📈', unit: '$',  description: 'Notificar quando preço subir acima do valor' },
  PRICE_BELOW:        { label: 'Preço Abaixo',           icon: '📉', unit: '$',  description: 'Notificar quando preço cair abaixo do valor' },
  VOLUME_DROP:        { label: 'Queda de Volume',        icon: '📊', unit: '%',  description: 'Notificar quando volume cair mais que o limiar' },
  LIQUIDITY_FLIGHT:   { label: 'Fuga de Liquidez',       icon: '💧', unit: '%',  description: 'Notificar quando TVL cair mais que o limiar' },
  VOLATILITY_SPIKE:   { label: 'Spike de Volatilidade',  icon: '⚡', unit: '%',  description: 'Notificar quando volatilidade disparar' },
  OUT_OF_RANGE:       { label: 'Fora do Range',          icon: '📍', unit: '%',  description: 'Notificar quando preço sair do range da posição' },
  NEAR_RANGE_EXIT:    { label: 'Próximo de Sair do Range', icon: '⚠️', unit: '%', description: 'Notificar quando preço se aproximar do limite do range' },
  NEW_RECOMMENDATION: { label: 'Nova Recomendação',      icon: '🎯', unit: '',   description: 'Notificar quando nova recomendação de pool aparecer' },
};

/** Lista para uso em selects/filtros de UI */
export const ALERT_EVENTS_LIST = ALERT_TYPE_VALUES.map(type => ({
  value: type,
  label: alertTypeConfig[type].label,
}));
```

- [ ] **2.2 — Atualizar `frontend/src/pages/Alerts.tsx`**

Remover as linhas 7-24 (definições locais de `AlertType` e `alertTypeConfig`) e substituir por:

```typescript
import { AlertType, alertTypeConfig } from '@/data/alert-events';
```

Verificar que todos os usos internos continuam funcionando (são idênticos — só a origem muda).

- [ ] **2.3 — Atualizar `frontend/src/pages/ScoutSettings.tsx`**

Localizar o array `ALERT_EVENTS` (linhas ~1076-1087 do componente):

```typescript
// ANTES (inline no arquivo):
const ALERT_EVENTS = [
  { value: 'PRICE_ABOVE', label: 'Preço Acima' },
  { value: 'PRICE_BELOW', label: 'Preço Abaixo' },
  ...
];

// DEPOIS (importar do data file):
import { ALERT_EVENTS_LIST as ALERT_EVENTS } from '@/data/alert-events';
```

O `ALERT_EVENTS_LIST` já exporta `{ value, label }` — mesma forma esperada pelo render.

- [ ] **2.4 — Verificar TypeScript no frontend**

```bash
cd pool-intelligence-pro/frontend && npx tsc --noEmit
```

Resultado esperado: **0 erros**

- [ ] **2.5 — Rodar testes do frontend**

```bash
cd pool-intelligence-pro/frontend && npm test
```

Resultado esperado: **98 testes passando**

- [ ] **2.6 — Commit**

```bash
git add pool-intelligence-pro/frontend/src/data/alert-events.ts \
        pool-intelligence-pro/frontend/src/pages/Alerts.tsx \
        pool-intelligence-pro/frontend/src/pages/ScoutSettings.tsx
git commit -m "refactor: extrair alertTypeConfig para data/alert-events.ts (fonte única frontend)"
```

---

## Task 3 — Extrair `ConfBadge` para componente compartilhado

**Arquivos:**
- Criar: `pool-intelligence-pro/frontend/src/components/common/ConfBadge.tsx`
- Modificar: `pool-intelligence-pro/frontend/src/pages/ScoutPoolDetail.tsx` (linha 38-48)

### Contexto de implementação

`ConfBadge` está definida como função local em `ScoutPoolDetail.tsx` linhas 38-48:
```typescript
function ConfBadge({ conf }: { conf?: 'high' | 'medium' | 'low' }) {
  if (!conf || conf === 'high') return null;
  return (
    <span
      className={`ml-1 text-[9px] px-1 rounded font-mono ${conf === 'medium' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-muted text-muted-foreground'}`}
      title={conf === 'medium' ? 'Dado estimado ou suplementado' : 'Dado de baixa confiança — estimativa'}
    >
      {conf === 'medium' ? 'est.' : 'aprox.'}
    </span>
  );
}
```

### Steps

- [ ] **3.1 — Criar `frontend/src/components/common/ConfBadge.tsx`**

```typescript
/** Badge inline para indicar confiança de dado (medium = estimado, low = aproximação) */
export function ConfBadge({ conf }: { conf?: 'high' | 'medium' | 'low' }) {
  if (!conf || conf === 'high') return null;
  return (
    <span
      className={`ml-1 text-[9px] px-1 rounded font-mono ${
        conf === 'medium' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-muted text-muted-foreground'
      }`}
      title={conf === 'medium' ? 'Dado estimado ou suplementado' : 'Dado de baixa confiança — estimativa'}
    >
      {conf === 'medium' ? 'est.' : 'aprox.'}
    </span>
  );
}
```

- [ ] **3.2 — Atualizar `ScoutPoolDetail.tsx`**

Remover a função local `ConfBadge` (linhas 38-48) e adicionar import:

```typescript
import { ConfBadge } from '@/components/common/ConfBadge';
```

- [ ] **3.3 — Verificar TypeScript**

```bash
cd pool-intelligence-pro/frontend && npx tsc --noEmit
```

Resultado esperado: **0 erros**

- [ ] **3.4 — Commit**

```bash
git add pool-intelligence-pro/frontend/src/components/common/ConfBadge.tsx \
        pool-intelligence-pro/frontend/src/pages/ScoutPoolDetail.tsx
git commit -m "refactor: extrair ConfBadge para components/common (reutilizável)"
```

---

## Task 4 — Adicionar `ConfBadge` na lista de pools (`Pools.tsx`)

**Arquivos:**
- Modificar: `pool-intelligence-pro/frontend/src/pages/Pools.tsx`

### Contexto de implementação

`Pools.tsx` tem dois renders de pool:
1. **`PoolRow`** — linha de tabela (desktop): coluna APR Total (linha ~127) e Volatility (linha ~145)
2. **`PoolMobileCard`** — card mobile: APR (linha ~219) e APR Aj. (linha ~223)

`ViewPool` (tipo em `types/pool.ts`) já tem `dataConfidence?: { apr?, volume?, fees?, volatility? }`.

O objetivo é mostrar `ConfBadge` apenas quando a confiança for `medium` ou `low` (o componente já retorna `null` para `high`/undefined — não precisa guardar lógica aqui).

### Steps

- [ ] **4.1 — Adicionar import de `ConfBadge` em `Pools.tsx`**

No bloco de imports do arquivo:
```typescript
import { ConfBadge } from '@/components/common/ConfBadge';
```

- [ ] **4.2 — Decorar APR na linha de tabela (`PoolRow`)**

Localizar o bloco `{/* APR Total */}` (~linha 126-131):

```typescript
// ANTES:
{/* APR Total */}
<td className="px-3 py-2.5 text-sm text-right">
  <span className={clsx('font-mono', (pool.aprTotal ?? 0) > 50 ? 'text-green-400' : '')}>
    {fmtPct(pool.aprTotal)}
  </span>
</td>

// DEPOIS:
{/* APR Total */}
<td className="px-3 py-2.5 text-sm text-right">
  <span className={clsx('font-mono', (pool.aprTotal ?? 0) > 50 ? 'text-green-400' : '')}>
    {fmtPct(pool.aprTotal)}
  </span>
  <ConfBadge conf={pool.dataConfidence?.apr?.confidence} />
</td>
```

- [ ] **4.3 — Decorar APR no card mobile (`PoolMobileCard`)**

Localizar o bloco de APR (~linha 219-221):

```typescript
// ANTES:
<p className="text-[10px] text-dark-500 mb-0.5">APR</p>
<p className={clsx('text-xs font-mono font-medium', (pool.aprTotal ?? 0) > 50 ? 'text-green-400' : '')}>{fmtPct(pool.aprTotal)}</p>

// DEPOIS:
<p className="text-[10px] text-dark-500 mb-0.5">APR</p>
<p className={clsx('text-xs font-mono font-medium', (pool.aprTotal ?? 0) > 50 ? 'text-green-400' : '')}>
  {fmtPct(pool.aprTotal)}<ConfBadge conf={pool.dataConfidence?.apr?.confidence} />
</p>
```

- [ ] **4.4 — Verificar TypeScript**

```bash
cd pool-intelligence-pro/frontend && npx tsc --noEmit
```

Resultado esperado: **0 erros**

- [ ] **4.5 — Rodar todos os testes**

```bash
cd pool-intelligence-pro/backend && npm test 2>&1 | tail -5
cd pool-intelligence-pro/frontend && npm test 2>&1 | tail -5
```

Resultado esperado: 152 backend + 98 frontend passando

- [ ] **4.6 — Commit**

```bash
git add pool-intelligence-pro/frontend/src/pages/Pools.tsx
git commit -m "feat: exibir badge de confiança no APR da lista de pools"
```

---

## Task 5 — Atualizar CHECKPOINT e push

- [ ] **5.1 — Atualizar CHECKPOINT.md**

Adicionar no topo do O QUE FOI FEITO:

```
### Gap A + Gap B — Fonte única AlertType + ConfBadge em Pools ✅ (2026-03-20)
- `backend/src/constants/alert-events.ts`: array canônico + ALERT_TYPE_META
- `backend/src/types/index.ts`: AlertType derivado do array (não mais literal)
- `backend/src/routes/validation.ts`: z.enum usa ALERT_TYPE_VALUES (não mais literal)
- `frontend/src/data/alert-events.ts`: mirror do backend + metadados de UI
- `frontend/src/pages/Alerts.tsx`: importa AlertType e alertTypeConfig do data file
- `frontend/src/pages/ScoutSettings.tsx`: ALERT_EVENTS importado do data file
- `frontend/src/components/common/ConfBadge.tsx`: componente extraído (reutilizável)
- `frontend/src/pages/ScoutPoolDetail.tsx`: importa ConfBadge do comum
- `frontend/src/pages/Pools.tsx`: APR na tabela e card mobile mostram ConfBadge
```

- [ ] **5.2 — Commit e push**

```bash
git add CHECKPOINT.md
git commit -m "docs: checkpoint Gap A + Gap B concluídos"
git push -u origin claude/review-audit-checkpoint-ZFYUM
```

---

## Critérios de Aceite

| # | Critério | Verificação |
|---|----------|-------------|
| A1 | `shared/alert-events` existe no backend e no frontend | `ls backend/src/constants/ && ls frontend/src/data/alert-events.ts` |
| A2 | `types/index.ts` e `validation.ts` não têm mais strings literais duplicadas dos 8 tipos | `grep -n "PRICE_ABOVE.*PRICE_BELOW" backend/src/types/index.ts backend/src/routes/validation.ts` → vazio |
| A3 | `Alerts.tsx` e `ScoutSettings.tsx` não definem alertas inline | `grep -n "PRICE_ABOVE.*PRICE_BELOW" frontend/src/pages/Alerts.tsx frontend/src/pages/ScoutSettings.tsx` → vazio |
| A4 | 152 testes backend passando | `npm test` no backend |
| A5 | 98 testes frontend passando | `npm test` no frontend |
| B1 | `ConfBadge` existe em `components/common/` | `ls frontend/src/components/common/ConfBadge.tsx` |
| B2 | `ScoutPoolDetail.tsx` não define mais `ConfBadge` localmente | `grep -n "function ConfBadge" frontend/src/pages/ScoutPoolDetail.tsx` → vazio |
| B3 | `Pools.tsx` mostra badge de APR | `grep -n "ConfBadge" frontend/src/pages/Pools.tsx` → 2+ linhas |
| B4 | TypeScript 0 erros em frontend | `npx tsc --noEmit` no frontend |

---

## Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Import `.js` no backend (ESM) | Usar `'../constants/alert-events.js'` — obrigatório para NodeNext |
| `z.enum` exige `[string, ...string[]]` não `readonly string[]` | Usar `as const` no array — TypeScript inferirá `readonly ['PRICE_ABOVE', ...]` que satisfaz o constraint do Zod |
| `ConfBadge` em Pools.tsx na célula `<td>` pode quebrar layout | Badge é `inline` (`<span>`) — não quebra layout de tabela; validar visualmente |
| Testes que verificam literais de AlertType podem quebrar | Verificar `src/__tests__/` por referências hardcoded; ajustar para usar o array |
