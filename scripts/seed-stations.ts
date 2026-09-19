// این اسکریپت ۲۱ ایستگاه تولید را (به همان ترتیب و کدی که روی سیستم لوکال
// تعریف شده‌اند) روی دیتابیسی که DATABASE_URL به آن اشاره می‌کند می‌سازد.
//
// idempotent است: اگر ایستگاهی با همین «نام» از قبل وجود داشته باشد، آن را
// نادیده می‌گیرد (دوباره نمی‌سازد و رکورد تکراری ایجاد نمی‌کند)، پس اجرای
// چندباره‌اش مشکلی ایجاد نمی‌کند.
//
// نحوه‌ی اجرا (روی همان سروری که مشکل رویش هست، با همان DATABASE_URL که
// اپلیکیشن در پروداکشن استفاده می‌کند):
//
//   npx tsx scripts/seed-stations.ts
//
// اگر tsx نصب نیست:
//   npx ts-node scripts/seed-stations.ts
// یا کامپایلش کن و با node اجرا کن.

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// ترتیب و کدها دقیقاً همان چیزی است که در تصویر صفحه‌ی
// «مدیریت ایستگاه‌های تولید» روی سیستم لوکال دیده شد.
const stations: { name: string; code: string | null; sortOrder: number }[] = [
  { name: "برش", code: null, sortOrder: 1 },
  { name: "تراش", code: "BEVEL", sortOrder: 2 },
  { name: "تراش الگویی", code: "PATTERN", sortOrder: 3 },
  { name: "دیاموند", code: "DIAMOND", sortOrder: 4 },
  { name: "دیاموند زاویه", code: "DIAMOND_ANGLE", sortOrder: 5 },
  { name: "لول معمولی", code: "LOOL", sortOrder: 6 },
  { name: "لول براق", code: "LOOL_SHINY", sortOrder: 7 },
  { name: "لیمینت", code: "LAMINATE", sortOrder: 8 },
  { name: "دوجداره", code: "DOUBLE", sortOrder: 9 },
  { name: "CNC", code: "CNC", sortOrder: 10 },
  { name: "LED", code: "LED", sortOrder: 11 },
  { name: "MDF", code: "MDF", sortOrder: 12 },
  { name: "شست و شو", code: "WASH", sortOrder: 13 },
  { name: "چاپ", code: "PRINT", sortOrder: 14 },
  { name: "سندبلاست", code: "SANDBLAST", sortOrder: 15 },
  { name: "سوراخکاری", code: "DRILL", sortOrder: 16 },
  { name: "سکوریت", code: "TEMPER", sortOrder: 17 },
  { name: "بسته‌بندی", code: "PACK", sortOrder: 18 },
  { name: "انبار محصول یک", code: "WH1", sortOrder: 19 },
  { name: "انبار محصول دو", code: "WH2", sortOrder: 20 },
  { name: "بارگیری", code: "LOAD", sortOrder: 21 },
]

async function main() {
  let created = 0
  let skipped = 0

  for (const s of stations) {
    // چون فیلد "برش" کد ندارد، تشخیص تکراری‌بودن را بر اساس "نام" انجام
    // می‌دهیم، نه کد (که علاوه بر این، nullable و unique هم هست).
    const existing = await prisma.productionStation.findFirst({
      where: { name: s.name },
    })

    if (existing) {
      console.log(`⏭  از قبل موجود است، رد شد: ${s.name}`)
      skipped++
      continue
    }

    await prisma.productionStation.create({
      data: {
        name: s.name,
        code: s.code,
        sortOrder: s.sortOrder,
        isActive: true,
      },
    })
    console.log(`✅ ساخته شد: ${s.name} (${s.code ?? "بدون کد"})`)
    created++
  }

  console.log("")
  console.log(`تمام شد — ساخته‌شده: ${created} | از قبل موجود: ${skipped}`)
}

main()
  .catch((err) => {
    console.error("خطا در اجرای seed:", err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })