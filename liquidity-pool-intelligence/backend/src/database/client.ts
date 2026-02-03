import { PrismaClient, RiskProfile } from '@prisma/client';
import { config } from '../config/index.js';
import { log } from '../utils/logger.js';

// Singleton do Prisma Client
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: config.isDev ? ['query', 'error', 'warn'] : ['error'],
  });

if (!config.isProd) globalForPrisma.prisma = prisma;

// Inicializa as configurações padrão se não existirem
export async function initializeSettings(): Promise<void> {
  try {
    const existingSettings = await prisma.settings.findUnique({
      where: { id: 1 },
    });

    if (!existingSettings) {
      await prisma.settings.create({
        data: {
          id: 1,
          totalBankroll: config.defaults.totalBankroll,
          riskProfile: config.defaults.riskProfile as RiskProfile,
          maxPercentPerPool: config.defaults.maxPercentPerPool,
          maxPercentPerNetwork: config.defaults.maxPercentPerNetwork,
          maxPercentVolatile: config.defaults.maxPercentVolatile,
          enabledNetworks: config.enabledNetworks,
          allowedPairTypes: ['stable_stable', 'bluechip_stable'],
          telegramChatId: config.telegram.chatId || null,
        },
      });
      log.info('Settings initialized with defaults');
    }
  } catch (error) {
    log.error('Failed to initialize settings', { error });
    throw error;
  }
}

// Conecta ao banco de dados
export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    log.info('Connected to database');
    await initializeSettings();
  } catch (error) {
    log.error('Failed to connect to database', { error });
    throw error;
  }
}

// Desconecta do banco de dados
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  log.info('Disconnected from database');
}

// Health check do banco
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export default prisma;
