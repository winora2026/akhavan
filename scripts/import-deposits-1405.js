/**
 * ورود واریزی‌های سال ۱۴۰۵ از اکسل به جدول CustomerDeposit
 *
 * اجرا (از ریشه‌ی پروژه، کنار پوشه‌ی prisma):
 *   node scripts/import-deposits-1405.js            ← فقط گزارش (چیزی ثبت نمی‌شود)
 *   node scripts/import-deposits-1405.js --apply    ← ثبت واقعی
 *
 * فایل scripts/deposits-1405.json باید کنار همین فایل باشد.
 * اجرای دوباره امن است: واریزی تکراری (همان مشتری/مبلغ/روز/حساب) دوباره ثبت نمی‌شود.
 */
const { PrismaClient } = require("@prisma/client")
const fs = require("fs")
const path = require("path")

const APPLY = process.argv.includes("--apply")
const STATUS = "CONFIRMED"
const IMPORTER = "ورود از اکسل ۱۴۰۵"

const prisma = new PrismaClient()

function norm(s) {
  return String(s || "")
    .replace(/[‌‏‎]/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

async function main() {
  const data = JSON.parse(
    fs.readFileSync(path.join(__dirname, "deposits-1405.json"), "utf8")
  )

  const accounts = await prisma.bankAccount.findMany()
  const accByName = new Map(accounts.map((a) => [norm(a.name), a]))
  const needed = Array.from(new Set(data.map((d) => d.account)))
  const missing = needed.filter((n) => !accByName.has(norm(n)))
  if (missing.length) {
    console.log("این حساب‌ها در سیستم نیستند. ابتدا در صفحه‌ی واریزی‌ها دکمه‌ی «افزودن حساب‌ها» را بزنید:")
    missing.forEach((m) => console.log("  -", m))
    return
  }

  const customers = await prisma.customer.findMany()
  const custNorm = customers.map((c) => ({ c, n: norm(c.name) }))
  const findCustomer = (name) => {
    const n = norm(name)
    const exact = custNorm.filter((x) => x.n === n)
    if (exact.length >= 1) return exact[0].c
    if (n.length >= 4) {
      const inc = custNorm.filter((x) => x.n.includes(n))
      if (inc.length === 1) return inc[0].c
    }
    return null
  }

  const existing = await prisma.customerDeposit.findMany({
    select: { customerName: true, amount: true, depositDate: true, bankAccountId: true },
  })
  const keyOf = (name, amount, date, accId) =>
    `${norm(name)}|${Math.round(Number(amount))}|${new Date(date).toISOString().slice(0, 10)}|${accId}`
  // شمارنده: اگر دو واریزی کاملاً مشابه در یک روز در اکسل هست، هر دو ثبت می‌شوند
  const existingCount = new Map()
  for (const e of existing) {
    const k = keyOf(e.customerName, e.amount, e.depositDate, e.bankAccountId)
    existingCount.set(k, (existingCount.get(k) || 0) + 1)
  }

  let created = 0, skippedDup = 0, linked = 0, unlinked = 0
  const seen = new Map()
  const unlinkedNames = new Set()
  for (const d of data) {
    const acc = accByName.get(norm(d.account))
    const k = keyOf(d.customerName, d.amount, d.date, acc.id)
    const nth = (seen.get(k) || 0) + 1
    seen.set(k, nth)
    if ((existingCount.get(k) || 0) >= nth) {
      skippedDup++
      continue
    }
    const cust = findCustomer(d.customerName)
    if (cust) linked++
    else {
      unlinked++
      unlinkedNames.add(d.customerName)
    }
    if (APPLY) {
      await prisma.customerDeposit.create({
        data: {
          customerId: cust ? cust.id : null,
          customerName: d.customerName,
          customerCode: cust ? cust.customerCode : null,
          amount: d.amount,
          depositDate: new Date(d.date),
          bankAccountId: acc.id,
          notes: `ورود از اکسل (ردیف ${d.sheetRow}) - ${d.jalali}`,
          status: STATUS,
          createdByName: IMPORTER,
          confirmedByName: IMPORTER,
          confirmedAt: new Date(),
        },
      })
    }
    created++
  }

  console.log(APPLY ? "ثبت شد:" : "گزارش (چیزی ثبت نشد):")
  console.log("  واریزی جدید:", created)
  console.log("  تکراری (قبلاً ثبت شده، رد شد):", skippedDup)
  console.log("  متصل به مشتری موجود:", linked)
  console.log("  بدون اتصال به مشتری (فقط با نام ثبت می‌شود):", unlinked)
  if (!APPLY) console.log("\nبرای ثبت واقعی: node scripts/import-deposits-1405.js --apply")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())