# Deep Analysis — Indicadores Técnicos Reais
**Data:** 2026-03-25
**Projeto:** Pool Intelligence Pro
**Status:** Aprovado pelo usuário

---

## Contexto

O sistema atual usa volatilidade anualizada como proxy estatístico (desvio padrão de retornos). Não analisa candles reais, não diferencia tendência de lateral, não usa VWAP nem suporte/resistência. A infraestrutura de dados OHLCV já existe (`PriceHistoryService`, rota `/api/pools/:chain/:address/ohlcv`), mas não está conectada ao cálculo de range nem exposta com indicadores derivados.

---

## Decisões de Design

### 1. Botão "Análise Profunda" — Opção A+C
- Botão `⚡ Análise` em cada card de pool nas listas
- Clique expande painel inline com: VWAP 7d, Tendência (SMA20/50), Volatilidade Real, barra S/R visual com 5 níveis, Volume Profile em bandas, Range sugerido
- Botão "Ver detalhe completo →" navega para `/pools/:chain/:address` com dados em cache e scroll automático para seção de indicadores técnicos

### 2. Fallback para Pools Novas/Pequenas — Opção C (cadeia)
Ordem de tentativa por dados de melhor qualidade:
1. GeckoTerminal OHLCV 1h (≥30 candles → análise completa)
2. GeckoTerminal OHLCV 1d (≥7 candles → análise parcial sem S/R intraday)
3. TheGraph histórico (≥7 pontos → apenas volatilidade real)
4. Proxy estatístico (sempre disponível → fallback final)

Cada resultado carrega badge de fonte/confiança visível no painel.

### 3. Auto-fetch Recomendadas + Favoritas — Opção A+C
- **Startup warm-up**: ao iniciar o backend, pré-busca OHLCV das top 20 recomendadas e todas as favoritas com concorrência máxima de 3. Cache pronto antes do primeiro acesso. Cache TTL do endpoint `/deep-analysis`: 5 min (1h candles), 15 min (1d candles).
- **Job periódico a cada 15 min**: mantém cache fresco. Rate-limit de 1 req/s, concorrência máxima de 3 pools simultâneas. Fila de prioridade: favoritas primeiro, depois recomendadas. Skip se cache ainda válido.
- Log de cobertura: `X/20 pools com dados reais`.

### 4. Volume Profile + VWAP Multi-timeframe (substitui FRVP)
- **Volume Profile por bandas (20 bandas)**: divide range de preços em 20 bandas, distribui volume de cada candle proporcionalmente. Gera histograma horizontal. Precisão ~80-85% vs FRVP real.
- **VWAP multi-timeframe**: VWAP 1h (mín. 4 candles), 4h (calculado agrupando candles 1h em blocos de 4, mín. 1 bloco), 1d (mín. 1 candle). Campos ausentes retornam `null` quando candles insuficientes. Captura âncoras de liquidez. Usado como centro do range sugerido.
- Razão: GeckoTerminal não fornece volume por nível de preço diretamente. Esta abordagem maximiza uso dos dados disponíveis.

---

## Arquitetura

### Novo serviço: `technical-indicators.service.ts`
Funções puras, sem efeitos colaterais, testáveis isoladamente:

```typescript
calcVWAP(candles: OhlcvCandle[], timeframe?: '1h'|'4h'|'1d'): number
calcSMA(candles: OhlcvCandle[], period: number): number[]
calcSupportResistance(candles: OhlcvCandle[]): SRLevels  // { s1, s2, r1, r2, poc }
calcVolumeProfileBands(candles: OhlcvCandle[], bands?: number): VolumeProfileBand[]
calcTrend(candles: OhlcvCandle[]): { direction: 'up' | 'down' | 'sideways', strength: 'strong' | 'moderate' | 'weak' }
calcVolatilityFromCandles(candles: OhlcvCandle[]): number  // substitui proxy quando disponível
resolveDataSource(chain, address): Promise<{ candles, source, confidence }>
```

### Novo endpoint: `GET /api/pools/:chain/:address/deep-analysis`
```typescript
Response: {
  vwap: { h1: number, h4: number, d1: number },
  trend: 'up' | 'down' | 'sideways',
  trendStrength: 'strong' | 'moderate' | 'weak',
  volatilityAnn: number,
  supportResistance: { s1, s2, r1, r2, poc },
  volumeProfile: VolumeProfileBand[],
  rangeSuggested: { low: number, high: number },
  dataSource: 'gecko_1h' | 'gecko_1d' | 'thegraph' | 'proxy',
  confidence: 'high' | 'medium' | 'low' | 'estimated',
  candleCount: number,
  periodDays: number
}
```

### Novo job: `deep-analysis.job.ts`
- Startup: busca top 20 recomendadas + favoritas em paralelo com limite de concorrência
- Cron: a cada 15 min, rebusca somente pools com cache expirado
- Rate-limit: 1 req/s para respeitar limites da GeckoTerminal free tier

### Frontend: novos componentes
- `DeepAnalysisPanel.tsx` — painel inline expandível no card
- `TechnicalSection.tsx` — seção completa no ScoutPoolDetail
- `useDeepAnalysis.ts` — hook React Query (staleTime 5 min)

---

## Fases de Implementação

| Fase | Agentes | Paralelismo | Depende de |
|------|---------|-------------|------------|
| F1 — Serviço de indicadores | 1 | Sequencial | — |
| F2 — Backend (endpoint + job) | 2 | Paralelo | F1 |
| F3 — Frontend (card + detail + hook) | 3 | Paralelo (3A/3B dependem de 3C) | F2 |
| F4 — Integração + verificação | 1 | Sequencial | F3 |

---

## Restrições

- Nunca quebrar funcionalidade existente (REGRA #1 do CLAUDE.md)
- Build deve passar antes de cada commit: `npx vitest run && npx tsc --noEmit && npm run build`
- Sem `any` no TypeScript
- Imports com `.js` no backend (ESM)
- Logs via `logService`, não `console.log`
- Rate-limit da GeckoTerminal free tier: ~30 req/min

---

## Critérios de Sucesso

- [ ] Botão "Análise" expande painel inline com indicadores reais em pools com histórico suficiente
- [ ] Pools novas mostram badge `estimativa` e usam proxy sem quebrar
- [ ] Top 20 recomendadas e favoritas têm dados pré-carregados no startup
- [ ] Job periódico mantém cache fresco a cada 15 min
- [ ] ScoutPoolDetail mostra seção técnica com Volume Profile e VWAP no gráfico
- [ ] Range sugerido usa dados reais quando disponível, proxy como fallback
- [ ] Build verde: 0 erros TypeScript, testes passando
