# Relatório de Auditoria de Cálculos — Pool Intelligence Pro
**Data:** 2026-03-22
**Branch:** claude/review-audit-checkpoint-ZFYUM
**Arquivos auditados:** calc.service.ts, score.service.ts, recommendation.service.ts, risk.service.ts, Simulation.tsx
**Referências online:** Auditless (Uniswap V3 IL), arXiv:2111.09192, KyberSwap Docs, Algebra Medium, Credmark Smart Money

---

## SUMÁRIO EXECUTIVO

Foram identificados **15 problemas** distribuídos em 4 níveis de criticidade.
O problema principal (que causa "mesmo valor para todos os perfis") é **CRÍTICO #1**: o Score nunca recebe o modo do usuário — é calculado antes de qualquer diferenciação.

---

## 🔴 CRÍTICO — Sistema produz dados enganosos

---

### [C1] Score é idêntico para DEFENSIVO / NORMAL / AGRESSIVO
**Arquivo:** `score.service.ts` · linhas 48–94
**Impacto:** Todo o sistema de perfis de risco é cosmético — o score numérico não muda.

**O que acontece hoje:**
```
calculateScore(pool, metrics)  ← sem parâmetro de modo
  → calculateBreakdown()       ← sem modo
  → calculateHealthScore()     ← pesos fixos: health=50, return=40, risk=25
  → calculateReturnScore()
  → calculateRiskPenalty()
  → total = health + return - risk    ← resultado idêntico para qualquer perfil
  → determineMode(pool, metrics, total)  ← modo é SAÍDA, não ENTRADA
```

**Consequência:** DEFENSIVO e AGRESSIVO recebem exatamente o mesmo score. O `recommendedMode` é apenas uma sugestão pós-cálculo.

**Referência:** `MODE_THRESHOLDS` (linhas 19–35) define pesos por perfil, mas NUNCA é usado no cálculo.

**Correção necessária:** Receber `mode` como parâmetro em `calculateScore()` e ajustar pesos:
- DEFENSIVO: risco=35, retorno=25, saúde=50 → penaliza volatilidade mais
- NORMAL: risco=25, retorno=30, saúde=45 (estado atual)
- AGRESSIVO: risco=15, retorno=45, saúde=40 → prioriza retorno

---

### [C2] `estimateGains` mostra retorno sem subtrair IL esperado
**Arquivo:** `recommendation.service.ts` · linhas 122–151
**Impacto:** O "retorno estimado (7 dias)" na tela ignora Impermanent Loss — é só APR bruto dividido por 52.

**O que acontece hoje:**
```typescript
const weeklyReturn = baseApr / 52;  // APR puro, sem IL
const adjustedReturn = weeklyReturn * modeMultiplier[mode];
// DEFENSIVO: 0.7x, NORMAL: 1.0x, AGGRESSIVE: 1.3x — mas ainda sem IL
```

**Consequência:** Uma pool ETH/USDT com APR 80% e volatilidade 60% mostra "+1.5% em 7 dias" mas na prática o IL semanal esperado pode ser 0.8–2%, tornando o retorno real próximo de zero ou negativo.

**Fórmula correta (base acadêmica):**
```
retorno_real = (APR/52) - IL_esperado_semana - custos_gas
onde: IL_esperado_semana ≈ 0.5 * σ² * (7/365) * fator_concentracao
```

**Referência:** [KyberSwap Elastic APR](https://docs.kyberswap.com/reference/legacy/kyberswap-elastic/concepts/apr-calculations), [Credmark LP Return](https://docs.credmark.com/smart-money-in-defi/investment-concepts/lping-return-of-uniswap-pools)

---

### [C3] IL fora do range subestima a perda real vs HODL
**Arquivo:** `calc.service.ts` · linhas 1424–1430
**Impacto:** Posições out-of-range mostram IL muito baixo — usuário pensa que está seguro quando a perda real é maior.

**O que acontece hoje:**
```typescript
if (outOfRange && poolType === 'CL') {
  const boundaryPrice = currentPrice > rangeUpper ? rangeUpper : rangeLower;
  const bRatio = boundaryPrice / entryPrice;  // ← usa boundary, não preço atual
  ilFraction = (2 * bSqrt) / (1 + bRatio) - 1;
}
```

**O problema:** Quando preço sai do range, a posição LP "congela" em um token, mas o HODL continua crescendo com o preço atual. Usar o `boundaryPrice` subestima a divergência real.

**Exemplo concreto:**
- Entry: $2000, range: [$1800, $2200], preço atual: $2500
- Código atual: IL calculado como se preço fosse $2200 → IL ≈ -0.06%
- IL real vs HODL a $2500: HODL vale 1.125x capital, LP está 100% em USDC (travado em $2200) → IL real ≈ -10.7%

**Referência:** [arXiv:2111.09192 — IL em Uniswap V3](https://arxiv.org/pdf/2111.09192), [Auditless Medium](https://medium.com/auditless/impermanent-loss-in-uniswap-v3-6c7161d3b445)

---

## 🟠 ALTO — Cálculos incorretos com impacto direto nos valores

---

### [A1] Score máximo teórico é 90, não 100
**Arquivo:** `score.service.ts` · config, linhas 42–45
**Impacto:** Nenhuma pool consegue 100/100 naturalmente. Escala implicitamente quebrada.

**Pesos atuais:** health=50, return=40, risk_max=25
**Máximo possível:** 50 + 40 - 0 = **90** (penalidade = 0)
**Mínimo com risco máximo:** 50 + 40 - 25 = 65 (mas pode ser mais baixo com weights)

Pools excelentes ficam em 85–90. Usuário não entende por que "a melhor pool" tem 88.

**Correção:** Normalizar os pesos para que a fórmula produza 0–100 organicamente.

---

### [A2] `freshnessScore` destrói health scores com dados de 30min
**Arquivo:** `calc.service.ts` · linha 232
**Impacto:** Dados com 30 minutos de atraso têm freshnessScore ≈ 0.05 (penalidade enorme).

**Fórmula atual:**
```typescript
const freshnessScore = Math.exp(-ageMinutes / 10);
// 10 min → 0.37 | 30 min → 0.05 | 60 min → 0.002
```

**Problema:** A constante de decaimento é 10 minutos. Dados de APIs DeFi têm latência de 5–60 minutos normalmente. Com dados de 30min, freshnessScore contribui com apenas 0.25% do total (0.05 × 0.05 weight × 100). Mas o `penaltyTotal` é multiplicativo, então pode arrastar o score inteiro.

**Correção:** Janela de decaimento realista de 60–120 minutos para dados DeFi:
```typescript
const freshnessScore = Math.exp(-ageMinutes / 60); // 60min → 0.37, 2h → 0.14
```

---

### [A3] `determineMode()` usa thresholds trocados
**Arquivo:** `score.service.ts` · linhas 312, 317
**Impacto:** Pools mediocres são marcadas como AGRESSIVO quando deveriam ser NORMAL.

**Código atual (bugado):**
```typescript
// Retorna AGGRESSIVE se volatility <= 15% (threshold do NORMAL — não do AGGRESSIVE!)
if (score >= 70 && volatility <= MODE_THRESHOLDS.NORMAL.volatilityMax) { // 15
  return 'AGGRESSIVE';
}
// Retorna NORMAL se volatility <= 30% (threshold do AGGRESSIVE)
if (score >= 50 && volatility <= MODE_THRESHOLDS.AGGRESSIVE.volatilityMax) { // 30
  return 'NORMAL';
}
```

**Correto seria:**
```typescript
// AGGRESSIVE: score alto E volatilidade muito baixa (<5%)
if (score >= 70 && volatility <= MODE_THRESHOLDS.DEFENSIVE.volatilityMax) { // 5%
  return 'AGGRESSIVE';
}
// NORMAL: score médio E volatilidade controlada (<15%)
if (score >= 50 && volatility <= MODE_THRESHOLDS.NORMAL.volatilityMax) { // 15%
  return 'NORMAL';
}
```

**Nota:** Lógica atual permite marcar pool com 80% de volatilidade como NORMAL (o que é errado).

---

### [A4] Divisão por zero em `calculateFeeEfficiency()`
**Arquivo:** `score.service.ts` · linha 231
**Impacto:** Crash silencioso do score para pools com volume > 0 mas TVL = 0.

```typescript
if (pool.feeTier && pool.volume24h > 0) {  // ← verifica volume, mas NÃO tvl
  const dailyFees = pool.volume24h * pool.feeTier;
  const annualizedApr = (dailyFees * 365) / pool.tvl * 100;  // ← pool.tvl pode ser 0!
}
```

A try-catch externa em `calculateScore()` captura o erro silenciosamente e retorna score=0 com `isSuspect: true`.

---

### [A5] `calcVolatilityProxy` — ruído extremo de 1 hora de dados
**Arquivo:** `calc.service.ts` · linhas 183–193
**Impacto:** Volatilidade calculada com apenas 2 pontos de preço (agora e 1h atrás) é extremamente instável.

```typescript
const volAnn = Math.abs(Math.log(priceNow / price1hAgo)) * Math.sqrt(24 * 365);
```

**Problema:**
- 1h calma (ETH varia 0.1%) → volAnn = 0.1% × √8760 ≈ 9% → pool parece estável
- 1h volátil (ETH varia 3%) → volAnn = 3% × √8760 ≈ 280% → pool parece bomba

Uma única hora de dados não representa volatilidade real. ETH histórico: 60–100% anualizado.

**Correção:** Usar mínimo de 24h de dados, ou pelo menos aplicar suavização:
```typescript
// Mais robusto: usar fallback de 15% para pares major ou 40% para altcoins
const volAnn = clamp(rawProxy, 0.10, 2.0); // Clamp mais realista
```

---

### [A6] Volatilidade padrão de 15% é muito baixa para crypto
**Arquivo:** `calc.service.ts` · linhas 157, 172
**Impacto:** Pools sem histórico de preços recebem 15% de volatilidade anualizada — ETH tem 60–100%, altcoins 100–300%.

```typescript
return { volAnn: 0.15, method: 'proxy', dataPoints: pricePoints.length };
// 0.15 = 15% anualizado — muito otimista para crypto!
```

**Defaults mais realistas:**
- Stable/stable: 0.05 (5%)
- ETH/USDC, BTC/USDC: 0.65 (65%)
- Pares genéricos CL: 0.80 (80%)
- Altcoins: 1.20 (120%)

---

### [A7] APR extrapolado de janelas curtas (fees1h/fees5m) sem sazonalidade
**Arquivo:** `calc.service.ts` · linhas 127–142
**Impacto:** APR calculado durante horário de pico pode estar 5–10x acima do real diário.

```typescript
if (fees1h != null && fees1h > 0) {
  const est = fees1h * 24;  // ← assume uniformidade ao longo do dia
  return { feeAPR: (est / tvl) * 365 * 100, ... };
}
```

**Problema:** Fees DeFi têm picos durante volatilidade (liquidações, arbitragem). 1h de dados durante um event de mercado pode representar 10h de fees médios. A indústria usa janelas mínimas de 24h para APR confiável.

**Referência:** [Algebra Medium — APR Methodology](https://medium.com/@crypto_algebra/thoughts-on-apr-in-defi-metrics-methodology-by-algebra-1e6e1276ab10)

---

## 🟡 MÉDIO — Design sub-ótimo com impacto em qualidade dos dados

---

### [M1] APR limitado a 100% no score — pools com APR 200% ≡ 100%
**Arquivo:** `score.service.ts` · linha 154
```typescript
const normalizedApr = Math.min(returnData.aprEstimate, 100); // cap em 100
```
Pools com APR real de 200% recebem o mesmo score de retorno que pools com 100%. Isso não penaliza APRs suspeitos (que deveria) nem premia retornos excepcionais.

**Correção sugerida:** Escala logarítmica:
```typescript
const normalizedApr = Math.min(Math.log10(Math.max(returnData.aprEstimate, 1)) / Math.log10(200) * 100, 100);
// 10% APR → 52 | 50% APR → 77 | 100% APR → 87 | 200% APR → 100
```

---

### [M2] `checkSuspect()` não usa thresholds por perfil de risco
**Arquivo:** `score.service.ts` · linhas 325–359
Usa threshold global de TVL ($100k) para todos os perfis. DEFENSIVO deveria rejeitar < $500k, AGRESSIVO aceitar < $50k. `MODE_THRESHOLDS` existe mas não é usado aqui.

---

### [M3] `calcUserFees` não considera capital efficiency do range
**Arquivo:** `calc.service.ts` · linhas 344–371
O cálculo assume que o usuário tem a mesma eficiência de capital que a média da pool. Em CL, um range estreito ganha mais fees por dollar quando in-range, mas o `k_active` (0.55/0.75/0.95) é um multiplicador fixo que não reflete a concentração real.

**Fórmula melhor:**
```
feesUsuario = fees24h × (capital/tvl) × k_active × capitalEfficiency
onde capitalEfficiency = calcTickLiquidity().capitalEfficiency
```

---

### [M4] Score penaliza votatilidade igual para todos os perfis
**Arquivo:** `score.service.ts` · linhas 283–292
`calculateVolatilityPenalty()` usa thresholds fixos (vol≥30%→ penalidade 25). DEFENSIVO deveria penalizar vol≥10% com -20, AGRESSIVO deveria tolerar vol até 50%.

---

## 🟢 BAIXO — Melhorias desejáveis

---

### [B1] `estimateAgeScore()` baseline 35 faz toda pool parecer "madura"
**Arquivo:** `score.service.ts` · linha 249
```typescript
let score = 35; // baseline para qualquer pool que passou filtros
```
Pools de 1 dia de vida recebem score 35 de maturidade (35/100). Baseline de 0 seria mais honesto.

---

### [B2] Monte Carlo usa drift zero (neutro de risco)
**Arquivo:** `calc.service.ts` · linha 587
```typescript
const dailyDrift = -0.5 * dailyVol * dailyVol; // risk-neutral drift
```
O drift `-0.5σ²` é correção de Itô (sem tendência direcional). Para crypto com tendência histórica de alta, isso subestima cenários positivos. Poderia aceitar `drift` como parâmetro opcional.

---

### [B3] Distribuição de liquidez usa Gaussiana, não dados reais de tick
**Arquivo:** `pools.routes.ts` · linhas 367–406
```typescript
// NOTE: Synthetic liquidity distribution (Gaussian model)
// Real on-chain tick liquidity requires subgraph queries not yet implemented
```
O sistema já documenta isso. Para pools Uniswap V3 reais, a distribuição por tick é consultável via subgraph.

---

## MATRIZ DE PRIORIDADE

| ID | Severidade | Arquivo | Impacto no Usuário | Complexidade de Fix |
|----|-----------|---------|-------------------|-------------------|
| C1 | 🔴 CRÍTICO | score.service.ts | Score idêntico p/ todos os perfis | Média |
| C2 | 🔴 CRÍTICO | recommendation.service.ts | Retorno estimado sem IL (superestimado) | Baixa |
| C3 | 🔴 CRÍTICO | calc.service.ts | IL out-of-range subestimado | Média |
| A1 | 🟠 ALTO | score.service.ts + config | Score máx = 90, não 100 | Baixa |
| A2 | 🟠 ALTO | calc.service.ts | Health score artificialmente baixo | Baixa |
| A3 | 🟠 ALTO | score.service.ts | determineMode() trocado | Baixa |
| A4 | 🟠 ALTO | score.service.ts | Divisão por zero silenciosa | Baixa |
| A5 | 🟠 ALTO | calc.service.ts | Volatilidade extremamente ruidosa (proxy 1h) | Média |
| A6 | 🟠 ALTO | calc.service.ts | Default volAnn=15% muito otimista | Baixa |
| A7 | 🟠 ALTO | calc.service.ts | APR de fees1h/5m superestimado | Baixa |
| M1 | 🟡 MÉDIO | score.service.ts | APR cap 100% não diferencia pools | Baixa |
| M2 | 🟡 MÉDIO | score.service.ts | checkSuspect() sem filtro por perfil | Média |
| M3 | 🟡 MÉDIO | calc.service.ts | Fees sem capital efficiency | Média |
| M4 | 🟡 MÉDIO | score.service.ts | Penalidade volatilidade igual p/ todos | Média |
| B1 | 🟢 BAIXO | score.service.ts | Maturidade baseline otimista | Baixa |
| B2 | 🟢 BAIXO | calc.service.ts | Monte Carlo sem drift direcional | Baixa |
| B3 | 🟢 BAIXO | pools.routes.ts | Liquidez por tick é estimada | Alta |

---

## REFERÊNCIAS

- [Auditless — Impermanent Loss in Uniswap V3](https://medium.com/auditless/impermanent-loss-in-uniswap-v3-6c7161d3b445)
- [arXiv:2111.09192 — Impermanent Loss in Uniswap v3](https://arxiv.org/pdf/2111.09192)
- [Algebra Medium — APR Methodology](https://medium.com/@crypto_algebra/thoughts-on-apr-in-defi-metrics-methodology-by-algebra-1e6e1276ab10)
- [KyberSwap — Elastic APR Calculations](https://docs.kyberswap.com/reference/legacy/kyberswap-elastic/concepts/apr-calculations)
- [Credmark — LPing Return of Uniswap Pools](https://docs.credmark.com/smart-money-in-defi/investment-concepts/lping-return-of-uniswap-pools)
- [AlexEuler Medium — Uniswap V3 APR Estimation](https://medium.com/@alexeuler/navigating-uniswap-v3-a-comprehensive-guide-to-apr-estimation-and-pool-risk-analysis-22cdab21e2db)
