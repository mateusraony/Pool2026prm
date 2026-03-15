/**
 * DeFi Glossary — termos técnicos com explicações para tooltips
 * Usado pelo componente GlossaryTooltip para educar usuários
 */

export const defiGlossary: Record<string, { term: string; short: string; full: string }> = {
  // Métricas de Pool
  tvl: {
    term: 'TVL',
    short: 'Total Value Locked — capital total depositado na pool.',
    full: 'Total Value Locked (TVL) é o valor total de ativos depositados em uma pool de liquidez. Maior TVL geralmente indica mais confiança e menor slippage para traders.',
  },
  apr: {
    term: 'APR',
    short: 'Annual Percentage Rate — retorno anual estimado em taxas.',
    full: 'APR (Annual Percentage Rate) é a taxa de retorno anualizada baseada nas fees geradas pela pool. Não considera composição (compound). APR alto pode indicar alto volume ou alta volatilidade.',
  },
  apy: {
    term: 'APY',
    short: 'Annual Percentage Yield — retorno com auto-compound.',
    full: 'APY (Annual Percentage Yield) é o retorno anual considerando reinvestimento automático dos lucros (compound). APY > APR porque inclui juros sobre juros.',
  },
  riskAdjustedApr: {
    term: 'APR Risk-Adjusted',
    short: 'APR penalizado pela volatilidade — retorno realista.',
    full: 'O APR Risk-Adjusted aplica uma penalidade baseada na volatilidade do par. Formula: APR × (1 - vol²). Volatilidade alta reduz o retorno efetivo por causa de Impermanent Loss.',
  },
  healthScore: {
    term: 'Health Score',
    short: 'Pontuação institucional 0-100 da qualidade da pool.',
    full: 'O Health Score combina TVL, volatilidade, rendimento de fees, estabilidade e freshness dos dados. Penalidades são aplicadas por baixa liquidez, atividade suspeita e spikes de preço. Score > 70 é considerado saudável.',
  },
  feeTier: {
    term: 'Fee Tier',
    short: 'Taxa cobrada dos traders a cada swap.',
    full: 'Fee Tier é a porcentagem cobrada de cada trade na pool. Tiers comuns: 0.01% (stables), 0.05% (pairs correlacionados), 0.3% (mainstream), 1% (exóticos). Fees maiores = mais retorno por trade, mas menos volume.',
  },

  // Impermanent Loss & Risco
  il: {
    term: 'Impermanent Loss',
    short: 'Perda temporária por divergência de preços dos tokens.',
    full: 'Impermanent Loss (IL) ocorre quando os preços dos tokens no par mudam relativamente. Se um token sobe 2x, o LP perde ~5.7% comparado a HODL. A perda é "impermanente" porque reverte se os preços voltarem.',
  },
  lvr: {
    term: 'LVR',
    short: 'Loss-Versus-Rebalancing — custo de seleção adversa.',
    full: 'LVR (Loss-Versus-Rebalancing) mede o custo de ser LP vs simplesmente rebalancear o portfolio. Arbitrageurs lucram às custas dos LPs. LVR diário ≈ capital × σ²/2. Se fees > LVR, a pool é lucrativa.',
  },
  volatility: {
    term: 'Volatilidade',
    short: 'Variação anualizada do preço do par.',
    full: 'Volatilidade anualizada mede quanto o preço do par flutua. Calculada via log-returns dos snapshots de preço. Alta volatilidade = mais IL mas também mais fees por arbitragem.',
  },
  correlation: {
    term: 'Correlação',
    short: 'Grau de co-movimento entre os tokens do par (-1 a +1).',
    full: 'Correlação mede se os tokens se movem juntos (+1), independente (0) ou em direções opostas (-1). Pares correlacionados (ex: WETH/stETH) têm menos IL. Pares descorrelacionados (ex: ETH/USDC) têm mais IL.',
  },

  // Range & Concentração
  concentratedLiquidity: {
    term: 'Liquidez Concentrada',
    short: 'Posicionar liquidez em faixa de preço específica (Uniswap V3+).',
    full: 'Em pools de liquidez concentrada (CL), LPs escolhem um range [min, max] onde sua liquidez fica ativa. Ranges menores = mais eficiência de capital mas mais risco de sair do range.',
  },
  range: {
    term: 'Range',
    short: 'Faixa de preço onde sua liquidez está ativa.',
    full: 'O range define os limites inferior e superior de preço da sua posição. Fora do range, sua liquidez não gera fees. Ranges mais apertados geram mais fees/dólar mas saem mais facilmente.',
  },
  timeInRange: {
    term: 'Time in Range',
    short: 'Percentual do tempo que o preço ficou dentro do range.',
    full: 'Mede a eficiência da posição. Time in Range > 80% indica um range bem calibrado. Abaixo de 60% sugere que o range está muito apertado para a volatilidade do par.',
  },
  rebalance: {
    term: 'Rebalanceamento',
    short: 'Ajustar o range quando o preço sai da faixa.',
    full: 'Quando o preço sai do range, a posição para de gerar fees. Rebalancear = fechar posição e abrir nova com range atualizado. Tem custo de gas e pode cristalizar IL.',
  },

  // Portfolio
  sharpe: {
    term: 'Sharpe Ratio',
    short: 'Retorno ajustado ao risco — quanto excesso de retorno por unidade de risco.',
    full: 'Sharpe = (Retorno - Risk Free) / Desvio Padrão. Sharpe > 1 é bom, > 2 excelente. Mede se o retorno extra compensa o risco adicional.',
  },
  sortino: {
    term: 'Sortino Ratio',
    short: 'Similar ao Sharpe, mas só penaliza volatilidade negativa.',
    full: 'Sortino usa apenas o desvio padrão dos retornos negativos (downside deviation). É mais justo que Sharpe para estratégias com upside assimétrico. Sortino > 1.5 é bom.',
  },
  maxDrawdown: {
    term: 'Max Drawdown',
    short: 'Maior queda do pico ao vale no portfolio.',
    full: 'Max Drawdown mede o pior cenário histórico — a maior perda do ponto mais alto até o ponto mais baixo. Drawdown < 10% é conservador, > 20% é agressivo.',
  },
  diversification: {
    term: 'Diversificação',
    short: 'Distribuição do capital entre diferentes ativos/chains.',
    full: 'Score baseado no índice HHI (Herfindahl-Hirschman). 100 = perfeitamente diversificado, 0 = todo capital numa única posição. Diversificação reduz risco idiossincrático.',
  },
  autoCompound: {
    term: 'Auto-Compound',
    short: 'Reinvestir fees automaticamente para crescer exponencialmente.',
    full: 'Auto-compound reinveste as fees ganhas de volta na posição, gerando juros compostos. O benefício depende da frequência de compound vs custo de gas. Em pools de alta APR, compound semanal pode gerar 5-15% extra ao ano.',
  },

  // Tipos de Pool
  clPool: {
    term: 'Pool CL',
    short: 'Concentrated Liquidity — liquidez em faixa de preço.',
    full: 'Pools de Liquidez Concentrada (CL) permitem que LPs definam ranges específicos. Mais capital-eficiente que V2, mas requer gerenciamento ativo. Uniswap V3, PancakeSwap V3, Aerodrome CL.',
  },
  v2Pool: {
    term: 'Pool V2',
    short: 'Liquidez full-range — cobre todos os preços.',
    full: 'Pools V2 distribuem liquidez de 0 a infinito. Mais simples e passivo, mas menos capital-eficiente. Ideal para quem não quer gerenciar ranges.',
  },
  stablePool: {
    term: 'Pool Stable',
    short: 'Otimizada para pares de stablecoins.',
    full: 'Pools Stable usam curvas especiais (StableSwap) para minimizar slippage entre ativos de preço similar. IL quase zero para pares como USDC/USDT. Retornos menores mas muito seguros.',
  },

  // Tokens
  bluechip: {
    term: 'Bluechip',
    short: 'Token de alta capitalização e liquidez (ETH, BTC, USDC...).',
    full: 'Tokens bluechip são os mais estabelecidos e líquidos do mercado. Pools com dois tokens bluechip são mais seguras. O sistema penaliza pools com tokens não-bluechip.',
  },
  wrappedToken: {
    term: 'Wrapped Token',
    short: 'Versão de um token em outra chain (WETH, WBTC).',
    full: 'Wrapped tokens representam o ativo original em outra chain ou protocolo. WETH = ETH wrapped para uso em contratos ERC-20. Pares wrapped/original (WETH/stETH) são muito correlacionados.',
  },

  // DeFi Geral
  slippage: {
    term: 'Slippage',
    short: 'Diferença entre preço esperado e preço executado.',
    full: 'Slippage ocorre quando o preço muda entre o momento do trade e sua execução. Pools com mais TVL e liquidez concentrada no preço atual têm menos slippage.',
  },
  gasEstimated: {
    term: 'Gas Estimado',
    short: 'Custo de transação na blockchain em USD.',
    full: 'Gas é a taxa paga aos validadores para processar transações. Varia por rede: Ethereum ($5-50), Arbitrum ($0.1-1), Base ($0.01-0.1). Considere gas ao calcular retorno líquido.',
  },
  monteCarlo: {
    term: 'Monte Carlo',
    short: 'Simulação estatística com milhares de cenários aleatórios.',
    full: 'Simulação Monte Carlo gera milhares de trajetórias de preço aleatórias baseadas na volatilidade real. Permite estimar probabilidade de lucro, range de resultados e risco de perda.',
  },
  backtest: {
    term: 'Backtest',
    short: 'Testar estratégia com dados históricos.',
    full: 'Backtesting simula como sua estratégia teria performado no passado. Mostra PnL, max drawdown, time in range e número de rebalanceamentos. Não garante resultados futuros.',
  },
};

/** Retorna o glossário entry ou null */
export function getGlossaryEntry(key: string) {
  return defiGlossary[key] || null;
}

/** Retorna todas as entries como array para busca */
export function getAllGlossaryEntries() {
  return Object.entries(defiGlossary).map(([key, entry]) => ({ key, ...entry }));
}
