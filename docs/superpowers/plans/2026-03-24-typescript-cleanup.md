# TypeScript Cleanup — catch (error: unknown) + type guards Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar todos os `catch (error: any)` e `as any` remanescentes no backend, substituindo por `catch (error: unknown)` com type guards adequados.

**Architecture:** 3 arquivos independentes modificados em paralelo. Cada catch usa o helper `getErrorMessage(e: unknown): string` para extrair mensagens. O defillama adapter usa interface local para tipar a resposta da API.

**Tech Stack:** TypeScript strict, Express/Node, sem novas dependências.

---

## Task 1 — persist.service.ts (5 catches)

**Files:**
- Modify: `pool-intelligence-pro/backend/src/services/persist.service.ts:73,78,93,105,124`

- [ ] **Step 1: Ler o arquivo completo**

  Confirmar linhas: 73, 78, 93, 105, 124 têm `catch (error: any)` ou `catch (createErr: any)`.

- [ ] **Step 2: Adicionar helper getErrorMessage no topo do arquivo (após imports)**

```typescript
function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
```

- [ ] **Step 3: Substituir catch line 73**

Antes:
```typescript
} catch (error: any) {
  logService.warn('SYSTEM', 'Failed to load config from AppConfig table', { error: error?.message });
```
Depois:
```typescript
} catch (error: unknown) {
  logService.warn('SYSTEM', 'Failed to load config from AppConfig table', { error: getErrorMessage(error) });
```

- [ ] **Step 4: Substituir catch line 78**

Antes:
```typescript
} catch (error: any) {
  logService.warn('SYSTEM', 'Database not available for persistence: ' + (error?.message || 'unknown'), {});
```
Depois:
```typescript
} catch (error: unknown) {
  logService.warn('SYSTEM', 'Database not available for persistence: ' + getErrorMessage(error), {});
```

- [ ] **Step 5: Substituir catch line 93**

Antes:
```typescript
} catch (error: any) {
  // Table doesn't exist - create it
```
Depois:
```typescript
} catch (_error: unknown) {
  // Table doesn't exist - create it
```

- [ ] **Step 6: Substituir catch line 105**

Antes:
```typescript
} catch (createErr: any) {
  logService.error('SYSTEM', 'Failed to create AppConfig table: ' + createErr?.message);
```
Depois:
```typescript
} catch (createErr: unknown) {
  logService.error('SYSTEM', 'Failed to create AppConfig table: ' + getErrorMessage(createErr));
```

- [ ] **Step 7: Substituir catch line 124**

Antes:
```typescript
} catch (error: any) {
  logService.error('SYSTEM', `Failed to persist config key "${key}" to DB`, {
    error: String(error),
```
Depois:
```typescript
} catch (error: unknown) {
  logService.error('SYSTEM', `Failed to persist config key "${key}" to DB`, {
    error: getErrorMessage(error),
```

- [ ] **Step 8: Verificar TypeScript**

```bash
cd pool-intelligence-pro/backend && npx tsc --noEmit
```
Expected: 0 erros

- [ ] **Step 9: Commit**

```bash
git add pool-intelligence-pro/backend/src/services/persist.service.ts
git commit -m "fix: substituir catch (error: any) por unknown em persist.service.ts"
```

---

## Task 2 — telegram.ts (2 catches)

**Files:**
- Modify: `pool-intelligence-pro/backend/src/bot/telegram.ts:93,119`

- [ ] **Step 1: Ler o arquivo**

  Confirmar linhas 93 e 119.

- [ ] **Step 2: Adicionar helper getErrorMessage no topo (após imports)**

```typescript
function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
```

- [ ] **Step 3: Substituir catch line 93 (validateToken)**

Antes:
```typescript
} catch (error: any) {
  const msg = error?.response?.body?.description || error?.message || 'Token invalido';
```
Depois — usar type guard para acessar propriedades específicas da API Telegram:
```typescript
} catch (error: unknown) {
  const telegramDesc = (error as Record<string, unknown>)?.response as Record<string, unknown> | undefined;
  const msg = (telegramDesc?.body as Record<string, unknown>)?.description as string
    || getErrorMessage(error)
    || 'Token invalido';
```

- [ ] **Step 4: Substituir catch line 119 (sendMessage)**

Antes:
```typescript
} catch (error: any) {
  const telegramError = error?.response?.body?.description
    || error?.response?.description
    || error?.message
    || 'Erro desconhecido';
```
Depois:
```typescript
} catch (error: unknown) {
  const errObj = error as Record<string, unknown> | null;
  const respBody = errObj?.response as Record<string, unknown> | undefined;
  const telegramError = (respBody?.body as Record<string, unknown>)?.description as string
    || respBody?.description as string
    || getErrorMessage(error)
    || 'Erro desconhecido';
```

- [ ] **Step 5: Verificar TypeScript**

```bash
cd pool-intelligence-pro/backend && npx tsc --noEmit
```
Expected: 0 erros

- [ ] **Step 6: Commit**

```bash
git add pool-intelligence-pro/backend/src/bot/telegram.ts
git commit -m "fix: substituir catch (error: any) por unknown em telegram.ts"
```

---

## Task 3 — defillama.adapter.ts (2x as any)

**Files:**
- Modify: `pool-intelligence-pro/backend/src/adapters/defillama.adapter.ts:108-112`

- [ ] **Step 1: Ler o bloco afetado (linhas 100-120)**

  Confirmar que `(val as any).price` aparece em duas linhas.

- [ ] **Step 2: Adicionar interface local DefillamaPrice acima da função**

```typescript
interface DefillamaPrice {
  price?: number;
  symbol?: string;
  decimals?: number;
  confidence?: number;
}
```

- [ ] **Step 3: Substituir as duas linhas com type guard**

Antes:
```typescript
if (addr && (val as any).price) {
  prices.set(addr, (val as any).price);
```
Depois:
```typescript
const coin = val as DefillamaPrice;
if (addr && typeof coin.price === 'number') {
  prices.set(addr, coin.price);
```

- [ ] **Step 4: Verificar TypeScript**

```bash
cd pool-intelligence-pro/backend && npx tsc --noEmit
```
Expected: 0 erros

- [ ] **Step 5: Commit**

```bash
git add pool-intelligence-pro/backend/src/adapters/defillama.adapter.ts
git commit -m "fix: substituir as any por interface DefillamaPrice em defillama.adapter.ts"
```

---

## Verificação Final

- [ ] **Rodar vitest**

```bash
cd pool-intelligence-pro/backend && npx vitest run
```
Expected: 264/264 passando

- [ ] **Build completo**

```bash
cd pool-intelligence-pro && npm run build
```
Expected: exit 0

- [ ] **Push**

```bash
git push -u origin claude/review-audit-checkpoint-ZFYUM
```
