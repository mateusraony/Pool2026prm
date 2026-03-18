# ETAPA 16 — WebSocket por Pool (Rooms)
**Data:** 2026-03-18
**Status:** Aprovado

---

## Objetivo

Adicionar broadcast em tempo real por pool individual usando Socket.io rooms. A tela de detalhe (`ScoutPoolDetail`) se inscreve na room da pool ao abrir e recebe atualizações de preço, TVL, volume, score e status de posição sem precisar recarregar.

---

## Contexto

O sistema já possui Socket.io (ETAPA 13) com eventos globais `pools:updated`, `score:updated` e `system:status`. Esta etapa adiciona rooms por pool para comunicação direcionada.

---

## Backend

### `websocket.service.ts` — adições

**Novos listeners por socket:**
```typescript
socket.on('pool:subscribe', ({ chain, address }) => {
  socket.join(`pool:${chain}:${address}`);
});
socket.on('pool:unsubscribe', ({ chain, address }) => {
  socket.leave(`pool:${chain}:${address}`);
});
```

**Novo método `broadcastPoolUpdate`:**
- Calcula `positionAlert` consultando o `memoryStore` para posições ativas naquela pool
  - `'out_of_range'` se preço atual fora do range
  - `'near_edge'` se dentro de 5% da borda
  - `'in_range'` caso contrário
  - `undefined` se não há posição ativa
- Emite para `pool:{chain}:{address}`:
```typescript
io.to(`pool:${chain}:${address}`).emit('pool:updated', {
  pool: UnifiedPool,
  updatedAt: new Date().toISOString(),
  positionAlert?: 'in_range' | 'out_of_range' | 'near_edge'
})
```
- Throttle de 10s por pool (Map interno `lastBroadcast: Map<string, number>`)

### Integração no Radar Job

Após `memoryStore.setPools(updatedPools)`, chamar `broadcastPoolUpdate` para cada pool atualizada.

---

## Frontend

### Hook `usePoolWebSocket(chain: string, address: string)`

**Arquivo:** `src/hooks/usePoolWebSocket.ts`

```typescript
{
  liveData: UnifiedPool | null,   // último dado recebido via WS
  lastUpdated: Date | null,       // timestamp do último update
  isConnected: boolean,           // estado da conexão
  positionAlert: 'in_range' | 'out_of_range' | 'near_edge' | undefined
}
```

- Join na room no mount, leave no unmount
- Usa o socket singleton de `useWebSocket` (já existente)
- Ao receber `pool:updated`:
  1. Atualiza `liveData` local imediatamente
  2. Invalida `queryClient` para refetch em background
  3. Salva `lastUpdated`

### `ScoutPoolDetail.tsx` — adições

1. **Banner Live** no topo da página:
   - `"● Live · Atualizado há X segundos"` quando `lastUpdated` presente
   - Verde pulsante quando atualizado há < 15s, cinza quando mais antigo
   - Mostra `isConnected` (pulsante) vs `"Reconectando..."` (cinza)

2. **Flash visual** nos cards de métrica:
   - Borda verde sutil por 2s quando valor muda (CSS transition)
   - Campos afetados: Preço, TVL, Volume 24h, Health Score, APR

3. **Toast de posição** quando `positionAlert = 'out_of_range'`:
   - `toast.warning("Posição saiu do range!")` com link para `/active`
   - Throttle no frontend: máximo 1 toast a cada 2 minutos por pool

---

## Testes

### Backend (3 novos)
1. `pool:subscribe` coloca socket na room correta
2. `broadcastPoolUpdate` respeita throttle de 10s (segunda chamada em < 10s não emite)
3. `positionAlert` calculado corretamente para posição fora do range

### Frontend (2 novos)
1. Hook faz join na room no mount e leave no unmount
2. `liveData` atualiza e `lastUpdated` é setado ao receber evento `pool:updated`

---

## Não incluso nesta etapa
- Broadcast de alertas globais por pool (sem mudança em `alert.service.ts`)
- Histórico de updates por pool (sem persistência dos eventos WS)
- Multi-tab sync (cada aba gerencia sua própria room)
