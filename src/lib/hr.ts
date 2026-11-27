import { prisma } from "@/lib/prisma"

/** یکسان‌سازی نام فارسی: ي/ى→ی، ك→ک، حذف فاصله و نیم‌فاصله */
export function normalizeFaName(s: string) {
  return String(s || "")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200c\u200e\u200f]/g, "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase()
}

/** پرسنل متصل به حساب کاربری؛ اول با userId، بعد با تطبیق نام */
export async function resolveEmployee(session: {
  id: string
  displayName: string
}) {
  const direct = await prisma.employee.findFirst({
    where: { userId: session.id, isActive: true },
  })
  if (direct) return direct

  const key = normalizeFaName(session.displayName)
  if (!key) return null

  const all = await prisma.employee.findMany({ where: { isActive: true } })
  return (
    all.find((e) => normalizeFaName(e.displayName) === key) ||
    all.find(
      (e) =>
        !e.userId &&
        (normalizeFaName(`${e.firstName}${e.lastName}`) === key ||
          normalizeFaName(`${e.lastName}${e.firstName}`) === key)
    ) ||
    null
  )
}