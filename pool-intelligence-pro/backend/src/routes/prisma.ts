import { PrismaClient } from '@prisma/client';

// Lazy PrismaClient: only connects when first DB query happens.
// Prevents server crash if DATABASE_URL is missing or DB is unreachable.
let _prisma: PrismaClient | null = null;
export function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient();
  }
  return _prisma;
}

export async function closePrisma(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
}
