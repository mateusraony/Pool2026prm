/**
 * ensure-tables.service.ts
 *
 * Garante que tabelas opcionais existam no banco de dados usando
 * $executeRaw com CREATE TABLE IF NOT EXISTS — idempotente e seguro.
 *
 * Por que não usar prisma db push?
 * O Supabase Transaction Pooler (porta 6543) não suporta DDL multi-statement
 * como o que prisma db push executa internamente. Porém, cada instrução DDL
 * individual via $executeRaw funciona normalmente pelo pooler.
 *
 * Esta função é chamada de forma não-bloqueante APÓS server.listen(),
 * para não atrasar a detecção de porta pelo Render.
 */
import { getPrisma } from '../routes/prisma.js';
import { logService } from './log.service.js';

/**
 * Cria a tabela LpPosition e seus índices se ainda não existirem.
 * Espelha exatamente o schema Prisma — qualquer mudança no schema.prisma
 * deve ser refletida aqui também.
 */
async function ensureLpPositionTable(): Promise<void> {
  const prisma = getPrisma();

  // Tabela principal
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "LpPosition" (
      "id"            TEXT              NOT NULL,
      "token0"        TEXT              NOT NULL,
      "token1"        TEXT              NOT NULL,
      "token0Usd"     DOUBLE PRECISION  NOT NULL,
      "token1Usd"     DOUBLE PRECISION  NOT NULL,
      "feesEarned"    DOUBLE PRECISION  NOT NULL DEFAULT 0,
      "feeTier"       DOUBLE PRECISION  NOT NULL,
      "startDate"     TIMESTAMP(3)      NOT NULL,
      "protocol"      TEXT,
      "chain"         TEXT,
      "poolLink"      TEXT,
      "walletAddress" TEXT,
      "notes"         TEXT,
      "createdAt"     TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"     TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "LpPosition_pkey" PRIMARY KEY ("id")
    )
  `;

  // Adicionar colunas novas (idempotente — IF NOT EXISTS)
  await prisma.$executeRaw`ALTER TABLE "LpPosition" ADD COLUMN IF NOT EXISTS "poolAddress" TEXT`;
  await prisma.$executeRaw`ALTER TABLE "LpPosition" ADD COLUMN IF NOT EXISTS "entryPrice" DOUBLE PRECISION`;
  await prisma.$executeRaw`ALTER TABLE "LpPosition" ADD COLUMN IF NOT EXISTS "rangeLower" DOUBLE PRECISION`;
  await prisma.$executeRaw`ALTER TABLE "LpPosition" ADD COLUMN IF NOT EXISTS "rangeUpper" DOUBLE PRECISION`;

  // Índices declarados no schema (@@index)
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "LpPosition_startDate_idx" ON "LpPosition"("startDate")
  `;
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "LpPosition_chain_idx" ON "LpPosition"("chain")
  `;
}

/**
 * Entry point público — chame após server.listen() de forma não-bloqueante.
 * Falhas são logadas mas nunca propagadas (não deve derrubar o servidor).
 */
export async function ensureApplicationTables(): Promise<void> {
  try {
    await ensureLpPositionTable();
    logService.info('SYSTEM', 'ensureApplicationTables: LpPosition ✓');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // P0001 = restrição check; outros erros do PostgreSQL também podem aparecer
    // Se a tabela já existe e o erro é de sintaxe/permissão: apenas logar
    logService.warn('SYSTEM', 'ensureApplicationTables: falhou (não crítico)', { error: msg });
  }
}
