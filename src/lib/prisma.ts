import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

// در production هم یک نمونه مشترک نگه می‌داریم تا instrumentation و routeها
// چند کلاینت جدا روی SQLite نسازند (خطای database is locked)
globalForPrisma.prisma = prisma