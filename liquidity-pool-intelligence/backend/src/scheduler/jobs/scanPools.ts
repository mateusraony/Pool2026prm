import { runPoolScan } from '../../services/analysis/scanner.js';
import { shouldRecommendNoOperation } from '../../services/analysis/riskEngine.js';
import { sendTelegramMessage } from '../../services/telegram/bot.js';
import { prisma } from '../../database/client.js';
import { log } from '../../utils/logger.js';

// Job: Escaneia pools e gera recomendações
export async function runScanPoolsJob(): Promise<void> {
  const operation = log.startOperation('Scan pools job');

  try {
    // Executa scan completo
    const recommendations = await runPoolScan();

    // Salva snapshot do scan no histórico
    for (const rec of recommendations.slice(0, 20)) { // Top 20
      await prisma.historyEntry.create({
        data: {
          poolId: rec.pool.id,
          action: 'SCAN',
          details: {
            tvlUsd: rec.pool.tvlUsd.toString(),
            volume24hUsd: rec.pool.volume24hUsd.toString(),
            currentPrice: rec.pool.currentPrice.toString(),
            bestRangeScore: rec.bestRange.metrics.score,
            bestRangeReturn: rec.bestRange.metrics.netReturn7d.toString(),
          },
        },
      });
    }

    // Verifica se deve recomendar não operar
    const noOpCheck = await shouldRecommendNoOperation(recommendations);

    if (noOpCheck.recommend) {
      log.warn('No operation recommended', { reason: noOpCheck.reason });

      // Notifica via Telegram se configurado
      await sendTelegramMessage(`
⚠️ <b>Recomendação: Não Operar</b>

${noOpCheck.reason}

<i>Análise automática em ${new Date().toLocaleString('pt-BR')}</i>
      `.trim());
    }

    operation.success(`Found ${recommendations.length} recommendations`);
  } catch (error) {
    operation.fail(error);
    throw error;
  }
}
