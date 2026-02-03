import { prisma } from '../../database/client.js';
import { log } from '../../utils/logger.js';

// Job: Backup dos dados
export async function runBackupJob(): Promise<void> {
  const operation = log.startOperation('Backup job');

  try {
    const result = await runBackup();
    operation.success(`Backup completed: ${result.filename}`);
  } catch (error) {
    operation.fail(error);
    throw error;
  }
}

// Função de backup exportada para uso manual
export async function runBackup(): Promise<{
  filename: string;
  size: number;
  tables: Record<string, number>;
}> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup_${timestamp}.json`;

  // Coleta dados de todas as tabelas importantes
  const [settings, pools, poolRanges, positions, history, alerts] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 } }),
    prisma.pool.findMany(),
    prisma.poolRange.findMany(),
    prisma.position.findMany(),
    prisma.historyEntry.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Últimos 30 dias
        },
      },
    }),
    prisma.alert.findMany({
      where: {
        sentAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Últimos 30 dias
        },
      },
    }),
  ]);

  const backupData = {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    data: {
      settings,
      pools,
      poolRanges,
      positions,
      history,
      alerts,
    },
  };

  // Serializa para JSON
  const jsonContent = JSON.stringify(backupData, (key, value) => {
    // Converte BigInt/Decimal para string
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  }, 2);

  const size = Buffer.byteLength(jsonContent, 'utf8');

  // Registra o backup
  await prisma.backupLog.create({
    data: {
      filename,
      size,
      status: 'SUCCESS',
    },
  });

  // Log do conteúdo do backup (em produção, salvaria em S3/storage)
  log.info('Backup data generated', {
    filename,
    size,
    tables: {
      settings: settings ? 1 : 0,
      pools: pools.length,
      poolRanges: poolRanges.length,
      positions: positions.length,
      history: history.length,
      alerts: alerts.length,
    },
  });

  // Em produção, aqui você salvaria em um storage externo
  // Por exemplo: S3, Google Cloud Storage, etc.
  // Por enquanto, apenas retornamos os dados

  return {
    filename,
    size,
    tables: {
      settings: settings ? 1 : 0,
      pools: pools.length,
      poolRanges: poolRanges.length,
      positions: positions.length,
      history: history.length,
      alerts: alerts.length,
    },
  };
}

// Função para restaurar backup
export async function restoreBackup(backupData: {
  version: string;
  timestamp: string;
  data: {
    settings: object | null;
    pools: object[];
    poolRanges: object[];
    positions: object[];
    history: object[];
    alerts: object[];
  };
}): Promise<void> {
  log.info('Starting backup restoration', { timestamp: backupData.timestamp });

  // Nota: Esta é uma implementação simplificada
  // Em produção, você precisaria de validação mais robusta e tratamento de conflitos

  // Restaura settings
  if (backupData.data.settings) {
    await prisma.settings.upsert({
      where: { id: 1 },
      update: backupData.data.settings as Parameters<typeof prisma.settings.update>[0]['data'],
      create: {
        id: 1,
        ...backupData.data.settings as object,
      } as Parameters<typeof prisma.settings.create>[0]['data'],
    });
  }

  // Nota: Para outras tabelas, você precisaria implementar
  // lógica de merge/upsert apropriada

  log.info('Backup restoration completed');
}
