# ETAPA 16 — WebSocket por Pool (Rooms) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar broadcast real-time por pool individual via Socket.io rooms, com auto-atualização de preço/TVL/score/posição no ScoutPoolDetail e banner "Live · Atualizado há X segundos".

**Architecture:** O cliente emite `pool:subscribe` ao abrir ScoutPoolDetail, o servidor coloca o socket na room `pool:{chain}:{address}`. Quando o radar job atualiza uma pool, chama `broadcastPoolUpdate(pool)` que emite `pool:updated` para a room da pool com throttle de 10s. O hook `usePoolWebSocket` encapsula o join/leave e expõe `liveData`, `lastUpdated`, `positionAlert`.

**Tech Stack:** Socket.io (backend `Server` + frontend `io`), React hooks, React Query invalidation, sonner toast, TailwindCSS CSS transitions.

**Spec:** `docs/superpowers/specs/2026-03-18-websocket-por-pool-design.md`

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| `backend/src/services/websocket.service.ts` | Modificar | Adicionar listeners `pool:subscribe/unsubscribe`, método `broadcastPoolUpdate` com throttle |
| `backend/src/jobs/index.ts` | Modificar | Chamar `broadcastPoolUpdate` após `setPools` no radar loop |
| `backend/src/__tests__/websocket.service.test.ts` | Criar | Testes: join room, throttle, positionAlert |
| `frontend/src/hooks/usePoolWebSocket.ts` | Criar | Hook join/leave room + liveData + lastUpdated + positionAlert |
| `frontend/src/pages/ScoutPoolDetail.tsx` | Modificar | Banner Live, flash nos cards, toast de posição |
| `frontend/src/__tests__/usePoolWebSocket.test.ts` | Criar | Testes: join/leave no mount/unmount, liveData atualiza |

---

## Task 1: Backend — `broadcastPoolUpdate` com throttle e positionAlert

**Arquivo:** `backend/src/services/websocket.service.ts`

**Contexto:** O serviço já tem `emitToRoom(room, event, data)`. Precisamos:
1. Novo tipo de evento `pool:updated` no union `WsEvent`
2. Listeners `pool:subscribe` / `pool:unsubscribe` no `init()`
3. Map de throttle interno (10s por pool)
4. `broadcastPoolUpdate(pool: UnifiedPool)` que calcula `positionAlert` e emite

**Sobre positionAlert:** importar `rangeMonitorService` de `range.service.js`, chamar `getPositions()` para encontrar posição ativa para aquela pool, comparar `pos.currentPrice` (ou `pool.price`) com `rangeLower`/`rangeUpper`:
- Dentro de 5% da borda → `'near_edge'`
- Fora do range → `'out_of_range'`
- Dentro → `'in_range'`
- Sem posição → `undefined`

- [ ] **Step 1.1: Escrever o teste de subscribe/unsubscribe**

Criar `backend/src/__tests__/websocket.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock socket.io Server
const mockJoin = vi.fn();
const mockLeave = vi.fn();
const mockTo = vi.fn();
const mockEmit = vi.fn();
const mockSocketEmit = vi.fn();

vi.mock('socket.io', () => ({
  Server: vi.fn().mockImplementation(() => ({
    on: vi.fn((event: string, cb: (socket: unknown) => void) => {
      if (event === 'connection') {
        // simulate a connection with a mock socket
        cb({
          id: 'test-socket',
          join: mockJoin,
          leave: mockLeave,
          emit: mockSocketEmit,
          on: vi.fn((ev: string, handler: (data: unknown) => void) => {
            if (ev === 'pool:subscribe') handler({ chain: 'ethereum', address: '0xabc' });
            if (ev === 'pool:unsubscribe') handler({ chain: 'ethereum', address: '0xabc' });
          }),
        });
      }
    }),
    emit: mockEmit,
    to: vi.fn().mockReturnValue({ emit: mockTo }),
    sockets: { sockets: { size: 1 } },
  })),
}));

vi.mock('../services/log.service.js', () => ({
  logService: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../services/range.service.js', () => ({
  rangeMonitorService: {
    getPositions: vi.fn().mockReturnValue([]),
  },
}));

describe('WebSocketService — pool rooms', () => {
  it('joins the correct room on pool:subscribe', async () => {
    const { wsService } = await import('../services/websocket.service.js');
    wsService.init({} as any);
    expect(mockJoin).toHaveBeenCalledWith('pool:ethereum:0xabc');
  });

  it('leaves the correct room on pool:unsubscribe', async () => {
    expect(mockLeave).toHaveBeenCalledWith('pool:ethereum:0xabc');
  });
});
```

- [ ] **Step 1.2: Rodar teste para confirmar que falha**

```bash
cd pool-intelligence-pro/backend && npx vitest run src/__tests__/websocket.service.test.ts 2>&1 | tail -10
```
Esperado: FAIL (não existe o método de pool rooms ainda)

- [ ] **Step 1.3: Implementar — adicionar ao `websocket.service.ts`**

No topo do arquivo, adicionar o import:
```typescript
import type { UnifiedPool } from '../types/index.js';
import { rangeMonitorService } from './range.service.js';
```

Alterar o union de eventos:
```typescript
type WsEvent = 'pools:updated' | 'score:updated' | 'price:updated' | 'system:status' | 'pool:updated';
```

Adicionar campo privado de throttle na classe (logo após `private io: Server | null = null;`):
```typescript
private poolBroadcastThrottle = new Map<string, number>(); // poolId → timestamp ms
```

No `init()`, dentro do bloco `this.io.on('connection', (socket) => { ... })`, adicionar antes do `socket.on('disconnect')`:
```typescript
socket.on('pool:subscribe', (data: unknown) => {
  if (data && typeof data === 'object' && 'chain' in data && 'address' in data) {
    const { chain, address } = data as { chain: string; address: string };
    if (typeof chain === 'string' && typeof address === 'string') {
      socket.join(`pool:${chain}:${address}`);
    }
  }
});

socket.on('pool:unsubscribe', (data: unknown) => {
  if (data && typeof data === 'object' && 'chain' in data && 'address' in data) {
    const { chain, address } = data as { chain: string; address: string };
    if (typeof chain === 'string' && typeof address === 'string') {
      socket.leave(`pool:${chain}:${address}`);
    }
  }
});
```

Adicionar método `broadcastPoolUpdate` após `broadcastScoreUpdated`:
```typescript
broadcastPoolUpdate(pool: UnifiedPool) {
  if (!this.io) return;

  const poolKey = `${pool.chain}:${pool.poolAddress}`;
  const now = Date.now();
  const last = this.poolBroadcastThrottle.get(poolKey) ?? 0;

  // Throttle: mínimo 10s entre broadcasts por pool
  if (now - last < 10_000) return;
  this.poolBroadcastThrottle.set(poolKey, now);

  // Calcular positionAlert para esta pool
  const positionAlert = this.calcPositionAlert(pool);

  this.io.to(`pool:${pool.chain}:${pool.poolAddress}`).emit('pool:updated', {
    pool,
    updatedAt: new Date().toISOString(),
    ...(positionAlert !== undefined && { positionAlert }),
  });
}

private calcPositionAlert(pool: UnifiedPool): 'in_range' | 'out_of_range' | 'near_edge' | undefined {
  const positions = rangeMonitorService.getPositions();
  const pos = positions.find(
    p => p.poolAddress.toLowerCase() === pool.poolAddress.toLowerCase() && p.chain === pool.chain
  );
  if (!pos) return undefined;

  const price = pool.price ?? pos.entryPrice;
  const { rangeLower, rangeUpper } = pos;
  const rangeWidth = rangeUpper - rangeLower;

  if (price < rangeLower || price > rangeUpper) return 'out_of_range';

  const distToEdgePct = Math.min(price - rangeLower, rangeUpper - price) / rangeWidth;
  if (distToEdgePct < 0.05) return 'near_edge';

  return 'in_range';
}
```

- [ ] **Step 1.4: Rodar teste de subscribe/unsubscribe**

```bash
cd pool-intelligence-pro/backend && npx vitest run src/__tests__/websocket.service.test.ts 2>&1 | tail -10
```
Esperado: PASS

- [ ] **Step 1.5: Adicionar testes de throttle e positionAlert**

Adicionar ao `websocket.service.test.ts` (após os testes existentes):

```typescript
import { rangeMonitorService } from '../services/range.service.js';

describe('broadcastPoolUpdate', () => {
  const mockPool = {
    chain: 'ethereum',
    poolAddress: '0xpool',
    price: 2000,
    tvlUSD: 1_000_000,
    healthScore: 70,
    updatedAt: new Date().toISOString(),
  } as UnifiedPool;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('respeita throttle de 10s — segunda chamada imediata não emite', async () => {
    const { wsService } = await import('../services/websocket.service.js');
    wsService.init({} as any);
    wsService.broadcastPoolUpdate(mockPool);
    mockTo.mockClear();
    wsService.broadcastPoolUpdate(mockPool); // < 10s depois
    expect(mockTo).not.toHaveBeenCalled();
  });

  it('calcula positionAlert out_of_range quando preço fora do range', async () => {
    vi.mocked(rangeMonitorService.getPositions).mockReturnValue([{
      id: '1',
      poolAddress: '0xpool',
      chain: 'ethereum',
      rangeLower: 2500,
      rangeUpper: 3000,
      entryPrice: 2750,
      capital: 1000,
      mode: 'NORMAL',
      isActive: true,
      createdAt: new Date().toISOString(),
      token0Symbol: 'WETH',
      token1Symbol: 'USDC',
      poolId: 'ethereum_0xpool',
    } as any]);

    const { wsService } = await import('../services/websocket.service.js');
    wsService.init({} as any);
    // Forçar passar throttle: manipular o mapa internamente via nova instância não é possível
    // Usar pool diferente para evitar throttle
    const poolOut = { ...mockPool, poolAddress: '0xother', price: 2000 };
    wsService.broadcastPoolUpdate(poolOut as UnifiedPool);
    // positionAlert deveria ser 'out_of_range' pois price=2000 < rangeLower=2500
    expect(mockTo).toHaveBeenCalledWith(expect.objectContaining({ positionAlert: 'out_of_range' }));
  });
});
```

- [ ] **Step 1.6: Rodar todos os testes do websocket**

```bash
cd pool-intelligence-pro/backend && npx vitest run src/__tests__/websocket.service.test.ts 2>&1 | tail -15
```
Esperado: todos passando

- [ ] **Step 1.7: TypeScript check**

```bash
cd pool-intelligence-pro/backend && npx tsc --noEmit 2>&1 | head -10
```
Esperado: sem erros

- [ ] **Step 1.8: Commit**

```bash
git add pool-intelligence-pro/backend/src/services/websocket.service.ts pool-intelligence-pro/backend/src/__tests__/websocket.service.test.ts
git commit -m "feat: websocket rooms por pool — subscribe/unsubscribe + broadcastPoolUpdate com throttle e positionAlert"
```

---

## Task 2: Backend — Integrar `broadcastPoolUpdate` no radar job

**Arquivo:** `backend/src/jobs/index.ts`

Após `wsService.broadcastPoolsUpdated(unifiedPools.length)` (linha ~101), adicionar loop que chama `broadcastPoolUpdate` para cada pool atualizada:

```typescript
// Broadcast per-pool updates to subscribed clients
for (const pool of unifiedPools) {
  wsService.broadcastPoolUpdate(pool);
}
```

- [ ] **Step 2.1: Editar `jobs/index.ts`**

Localizar o bloco após `wsService.broadcastPoolsUpdated(unifiedPools.length);` e inserir o loop acima.

- [ ] **Step 2.2: Rodar testes completos do backend**

```bash
cd pool-intelligence-pro/backend && npm test 2>&1 | tail -8
```
Esperado: 126+ testes passando (123 anteriores + 3 novos)

- [ ] **Step 2.3: Commit**

```bash
git add pool-intelligence-pro/backend/src/jobs/index.ts
git commit -m "feat: radar job chama broadcastPoolUpdate após atualizar pools no MemoryStore"
```

---

## Task 3: Frontend — Hook `usePoolWebSocket`

**Arquivo:** `frontend/src/hooks/usePoolWebSocket.ts`

O hook usa o socket singleton já existente (via `getSocket()` exposto em `useWebSocket.ts`). Para não duplicar a função `getSocket`, precisamos exportá-la de `useWebSocket.ts`.

**Step 3.0: Exportar `getSocket` de `useWebSocket.ts`**

No arquivo `frontend/src/hooks/useWebSocket.ts`, alterar:
```typescript
function getSocket(): Socket {
```
para:
```typescript
export function getSocket(): Socket {
```

- [ ] **Step 3.1: Escrever o teste do hook**

Criar `frontend/src/__tests__/usePoolWebSocket.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { usePoolWebSocket } from '../hooks/usePoolWebSocket';

const mockEmit = vi.fn();
const mockOn = vi.fn();
const mockOff = vi.fn();
const mockConnected = true;

vi.mock('../hooks/useWebSocket', () => ({
  getSocket: vi.fn(() => ({
    emit: mockEmit,
    on: mockOn,
    off: mockOff,
    connected: mockConnected,
  })),
}));

const createWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
};

describe('usePoolWebSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emite pool:subscribe no mount com chain e address corretos', () => {
    renderHook(() => usePoolWebSocket('ethereum', '0xabc'), { wrapper: createWrapper() });
    expect(mockEmit).toHaveBeenCalledWith('pool:subscribe', { chain: 'ethereum', address: '0xabc' });
  });

  it('emite pool:unsubscribe no unmount', () => {
    const { unmount } = renderHook(() => usePoolWebSocket('ethereum', '0xabc'), { wrapper: createWrapper() });
    unmount();
    expect(mockEmit).toHaveBeenCalledWith('pool:unsubscribe', { chain: 'ethereum', address: '0xabc' });
  });

  it('retorna liveData atualizado e lastUpdated ao receber pool:updated', () => {
    let poolUpdatedHandler: ((data: unknown) => void) | null = null;
    mockOn.mockImplementation((event: string, handler: (data: unknown) => void) => {
      if (event === 'pool:updated') poolUpdatedHandler = handler;
    });

    const { result } = renderHook(() => usePoolWebSocket('ethereum', '0xabc'), { wrapper: createWrapper() });

    expect(result.current.liveData).toBeNull();

    const fakePool = { chain: 'ethereum', poolAddress: '0xabc', price: 1800, tvlUSD: 5e6, healthScore: 72 };
    act(() => {
      poolUpdatedHandler?.({ pool: fakePool, updatedAt: '2026-03-18T12:00:00Z', positionAlert: 'in_range' });
    });

    expect(result.current.liveData).toMatchObject(fakePool);
    expect(result.current.lastUpdated).toBeInstanceOf(Date);
    expect(result.current.positionAlert).toBe('in_range');
  });
});
```

- [ ] **Step 3.2: Rodar teste para confirmar que falha**

```bash
cd pool-intelligence-pro/frontend && npx vitest run src/__tests__/usePoolWebSocket.test.ts 2>&1 | tail -10
```
Esperado: FAIL (hook não existe)

- [ ] **Step 3.3: Criar `frontend/src/hooks/usePoolWebSocket.ts`**

```typescript
/**
 * usePoolWebSocket — inscreve-se na room de uma pool específica.
 * Retorna dados live, timestamp e positionAlert em tempo real.
 */

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from './useWebSocket';
import type { UnifiedPool } from '@/api/client';

type PositionAlert = 'in_range' | 'out_of_range' | 'near_edge';

interface PoolWsPayload {
  pool: UnifiedPool;
  updatedAt: string;
  positionAlert?: PositionAlert;
}

interface PoolWsState {
  liveData: UnifiedPool | null;
  lastUpdated: Date | null;
  isConnected: boolean;
  positionAlert: PositionAlert | undefined;
}

export function usePoolWebSocket(chain: string | undefined, address: string | undefined): PoolWsState {
  const queryClient = useQueryClient();
  const [state, setState] = useState<PoolWsState>({
    liveData: null,
    lastUpdated: null,
    isConnected: false,
    positionAlert: undefined,
  });

  useEffect(() => {
    if (!chain || !address) return;

    const socket = getSocket();

    // Entrar na room da pool
    socket.emit('pool:subscribe', { chain, address });

    const onConnect = () => setState(s => ({ ...s, isConnected: true }));
    const onDisconnect = () => setState(s => ({ ...s, isConnected: false }));

    const onPoolUpdated = (data: PoolWsPayload) => {
      // Atualiza estado local imediatamente
      setState(s => ({
        ...s,
        liveData: data.pool,
        lastUpdated: new Date(data.updatedAt),
        positionAlert: data.positionAlert,
      }));

      // Invalida query para refetch em background
      queryClient.invalidateQueries({ queryKey: ['scout-pool-detail', chain, address] });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('pool:updated', onPoolUpdated);

    if (socket.connected) {
      setState(s => ({ ...s, isConnected: true }));
    }

    return () => {
      socket.emit('pool:unsubscribe', { chain, address });
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('pool:updated', onPoolUpdated);
    };
  }, [chain, address, queryClient]);

  return state;
}
```

> **Nota:** `UnifiedPool` precisa estar exportado de `@/api/client`. Verificar se já existe; se não, adicionar `export type { UnifiedPool }` em `api/client.ts`.

- [ ] **Step 3.4: Verificar se `UnifiedPool` está exportado no api/client.ts**

```bash
grep -n "UnifiedPool" pool-intelligence-pro/frontend/src/api/client.ts | head -5
```
Se não houver `export type UnifiedPool`, adicionar a interface ou re-export de `@/types`.

- [ ] **Step 3.5: Rodar teste do hook**

```bash
cd pool-intelligence-pro/frontend && npx vitest run src/__tests__/usePoolWebSocket.test.ts 2>&1 | tail -15
```
Esperado: 3 testes PASS

- [ ] **Step 3.6: TypeScript check frontend**

```bash
cd pool-intelligence-pro/frontend && npx tsc --noEmit 2>&1 | head -10
```
Esperado: sem erros

- [ ] **Step 3.7: Commit**

```bash
git add pool-intelligence-pro/frontend/src/hooks/usePoolWebSocket.ts \
        pool-intelligence-pro/frontend/src/hooks/useWebSocket.ts \
        pool-intelligence-pro/frontend/src/__tests__/usePoolWebSocket.test.ts
git commit -m "feat: hook usePoolWebSocket — join/leave room, liveData, positionAlert em tempo real"
```

---

## Task 4: Frontend — Banner Live + Flash nos cards + Toast no ScoutPoolDetail

**Arquivo:** `frontend/src/pages/ScoutPoolDetail.tsx`

**O que adicionar:**

1. `usePoolWebSocket(chain, address)` na abertura da página
2. Componente inline `PoolLiveBanner` — banner discreto no topo
3. Hook de flash `useValueFlash` — retorna `true` por 2s quando um valor muda
4. Toast quando `positionAlert = 'out_of_range'`

### 4a — Banner Live

O banner aparece logo após o cabeçalho (header com `ArrowLeft`, botão favorito):

```tsx
{lastUpdated && (
  <div className={cn(
    "flex items-center gap-2 text-sm px-1 mb-4 transition-colors duration-500",
    isConnected && secondsSince < 15 ? "text-green-500" : "text-muted-foreground"
  )}>
    <span className={cn(
      "h-2 w-2 rounded-full",
      isConnected && secondsSince < 15 ? "bg-green-500 animate-pulse" : "bg-muted"
    )} />
    {isConnected
      ? `Live · Atualizado há ${secondsSince < 60 ? `${secondsSince}s` : `${Math.floor(secondsSince / 60)}min`}`
      : "Reconectando..."}
  </div>
)}
```

Onde `secondsSince = Math.floor((Date.now() - lastUpdated.getTime()) / 1000)` — atualizado a cada segundo via `setInterval`.

### 4b — Flash nos cards de métrica

Criar um pequeno hook local (dentro do arquivo, não exportado) para detectar mudança de valor:

```tsx
function useValueFlash(value: unknown): boolean {
  const [flashing, setFlashing] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 2000);
      return () => clearTimeout(t);
    }
  }, [value]);
  return flashing;
}
```

Aplicar nos `StatCard` de preço, TVL, volume, score:
```tsx
const priceFlash = useValueFlash(livePool?.price ?? pool.currentPrice);
// ...
<StatCard
  label="TVL"
  value={...}
  className={cn(tvlFlash && "ring-1 ring-green-500/50 transition-all duration-300")}
/>
```

### 4c — Toast de posição

Logo após o `usePoolWebSocket`, adicionar:

```tsx
const prevAlertRef = useRef<string | undefined>(undefined);
useEffect(() => {
  if (positionAlert === 'out_of_range' && prevAlertRef.current !== 'out_of_range') {
    toast.warning('Posição saiu do range!', {
      description: 'Considere reposicionar sua liquidez.',
      action: { label: 'Ver posições', onClick: () => navigate('/active') },
    });
  }
  prevAlertRef.current = positionAlert;
}, [positionAlert, navigate]);
```

- [ ] **Step 4.1: Adicionar imports necessários ao ScoutPoolDetail.tsx**

Abrir `frontend/src/pages/ScoutPoolDetail.tsx` e adicionar ao bloco de imports:
```tsx
import { usePoolWebSocket } from '@/hooks/usePoolWebSocket';
import { useRef, useState, useEffect } from 'react';  // garantir useRef, useState, useEffect
```
(Atenção: `useState` e `useCallback` já estão importados — apenas adicionar `useRef` e `useEffect` se não estiverem.)

- [ ] **Step 4.2: Adicionar o hook `useValueFlash` (local, antes do componente)**

Inserir antes de `export default function ScoutPoolDetail()`:

```tsx
function useValueFlash(value: unknown): boolean {
  const [flashing, setFlashing] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value && value !== undefined) {
      prev.current = value;
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 2000);
      return () => clearTimeout(t);
    }
  }, [value]);
  return flashing;
}
```

- [ ] **Step 4.3: Integrar `usePoolWebSocket` e `useValueFlash` no componente**

Dentro de `ScoutPoolDetail`, após `const queryClient = useQueryClient()`:

```tsx
const { liveData, lastUpdated, isConnected, positionAlert } = usePoolWebSocket(chain, address);

// Segundo contador para o banner
const [, forceRender] = useState(0);
useEffect(() => {
  if (!lastUpdated) return;
  const interval = setInterval(() => forceRender(n => n + 1), 1000);
  return () => clearInterval(interval);
}, [lastUpdated]);
const secondsSince = lastUpdated ? Math.floor((Date.now() - lastUpdated.getTime()) / 1000) : 0;

// Toast quando posição sai do range
const prevAlertRef = useRef<string | undefined>(undefined);
useEffect(() => {
  if (positionAlert === 'out_of_range' && prevAlertRef.current !== 'out_of_range') {
    toast.warning('Posição saiu do range!', {
      description: 'Considere reposicionar sua liquidez.',
      action: { label: 'Ver posições', onClick: () => navigate('/active') },
    });
  }
  prevAlertRef.current = positionAlert;
}, [positionAlert, navigate]);

// Usar liveData quando disponível, senão dados do React Query
const livePool = liveData ?? detailData?.pool ?? null;
// Flashes
const priceFlash = useValueFlash(livePool?.currentPrice);
const tvlFlash = useValueFlash(livePool?.tvl);
const volFlash = useValueFlash(livePool?.volume24h);
const scoreFlash = useValueFlash(livePool?.score);
```

- [ ] **Step 4.4: Adicionar o banner Live no JSX**

Logo após o header (botão ArrowLeft + pair + badge), antes do grid de StatCards, inserir:

```tsx
{/* Banner Live */}
{lastUpdated && (
  <div className={cn(
    "flex items-center gap-2 text-xs mb-4 transition-colors duration-500",
    isConnected && secondsSince < 15 ? "text-green-500" : "text-muted-foreground"
  )}>
    <span className={cn(
      "h-1.5 w-1.5 rounded-full flex-shrink-0",
      isConnected && secondsSince < 15 ? "bg-green-500 animate-pulse" : "bg-muted-foreground"
    )} />
    {isConnected
      ? `Live · Atualizado há ${secondsSince < 60 ? `${secondsSince}s` : `${Math.floor(secondsSince / 60)}min`}`
      : 'Reconectando...'}
  </div>
)}
```

- [ ] **Step 4.5: Adicionar flash nos StatCards**

Nos `StatCard` de TVL e Volume (linhas ~209-210), adicionar `className`:

```tsx
<StatCard
  label="TVL"
  value={`$${((livePool?.tvl ?? pool.tvl) / 1e6).toFixed(1)}M`}
  icon={<DollarSign className="h-5 w-5" />}
  className={cn(tvlFlash && "ring-1 ring-green-500/40 transition-all duration-300")}
/>
<StatCard
  label="Volume 24h"
  value={`$${((livePool?.volume24h ?? pool.volume24h) / 1e6).toFixed(1)}M`}
  icon={<BarChart3 className="h-5 w-5" />}
  className={cn(volFlash && "ring-1 ring-green-500/40 transition-all duration-300")}
/>
```

No Score (linha ~200), envolver com `className`:
```tsx
<div className={cn("...", scoreFlash && "ring-1 ring-green-500/40 transition-all duration-300 rounded-xl")}>
```

**Nota:** verificar se `StatCard` aceita `className` prop — se não aceitar, adicionar `className?: string` no componente `StatCard` e aplicar com `cn()`.

- [ ] **Step 4.6: TypeScript check**

```bash
cd pool-intelligence-pro/frontend && npx tsc --noEmit 2>&1 | head -15
```
Esperado: sem erros. Se StatCard não aceitar `className`, editar `StatCard.tsx` para aceitar a prop.

- [ ] **Step 4.7: Verificar se `StatCard` aceita `className`**

```bash
grep -n "className\|interface.*Props\|type.*Props" pool-intelligence-pro/frontend/src/components/common/StatCard.tsx | head -10
```
Se não aceitar, adicionar ao tipo de props e aplicar no root element.

- [ ] **Step 4.8: Build completo**

```bash
cd pool-intelligence-pro && npm run build 2>&1 | tail -8
```
Esperado: sem erros de build

- [ ] **Step 4.9: Rodar todos os testes**

```bash
cd pool-intelligence-pro/backend && npm test 2>&1 | tail -5
cd pool-intelligence-pro/frontend && npm test 2>&1 | tail -5
```
Esperado: backend 126+ / frontend todos passando

- [ ] **Step 4.10: Commit**

```bash
git add pool-intelligence-pro/frontend/src/pages/ScoutPoolDetail.tsx \
        pool-intelligence-pro/frontend/src/components/common/StatCard.tsx
git commit -m "feat: ScoutPoolDetail — banner Live, flash em cards de métrica, toast de posição fora do range"
```

---

## Task 5: Push e CHECKPOINT

- [ ] **Step 5.1: Push**

```bash
git push -u origin claude/review-audit-checkpoint-ZFYUM
```

- [ ] **Step 5.2: Atualizar CHECKPOINT.md**

Adicionar ao topo da seção "O QUE FOI FEITO":

```markdown
### ETAPA 16 — WebSocket por Pool (Rooms) ✅ (2026-03-18)

**Backend:**
- `websocket.service.ts`: listeners `pool:subscribe/unsubscribe`, método `broadcastPoolUpdate`
  com throttle 10s e cálculo de `positionAlert` (in_range / near_edge / out_of_range)
- `jobs/index.ts`: loop `broadcastPoolUpdate` após `setPools` no radar job
- 3 novos testes em `websocket.service.test.ts`

**Frontend:**
- `hooks/useWebSocket.ts`: `getSocket` exportado para reuso
- `hooks/usePoolWebSocket.ts`: hook que faz join/leave de room, expõe `liveData`,
  `lastUpdated`, `isConnected`, `positionAlert`
- `ScoutPoolDetail.tsx`: banner "Live · Atualizado há Xs", flash verde nos cards
  de TVL/Volume/Score ao receber updates, toast automático se posição sai do range
- 2 novos testes em `usePoolWebSocket.test.ts`
```

- [ ] **Step 5.3: Commit do CHECKPOINT**

```bash
git add CHECKPOINT.md
git commit -m "docs: checkpoint ETAPA 16 — WebSocket por pool"
git push -u origin claude/review-audit-checkpoint-ZFYUM
```
