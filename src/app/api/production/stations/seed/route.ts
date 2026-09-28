import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * نام‌ها باید دقیقاً با mapServiceToStation و buildRoute در
 * /api/production/orders یکی باشند.
 */
const defaultStations = [
  { name: "برش", code: "CUT", sortOrder: 1 },
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
  { name: "سوراخکاری", code: "DRILL", sortOrder: 13 },
  { name: "سندبلاست", code: "SANDBLAST", sortOrder: 14 },
  { name: "چاپ", code: "PRINT", sortOrder: 15 },
  { name: "سکوریت", code: "TEMPER", sortOrder: 16 },
  { name: "شست و شو", code: "WASH", sortOrder: 17 },
  { name: "بسته‌بندی", code: "PACK", sortOrder: 18 },
  { name: "انبار محصول یک", code: "WH1", sortOrder: 19 },
  { name: "انبار محصول دو", code: "WH2", sortOrder: 20 },
  { name: "بارگیری", code: "LOAD", sortOrder: 21 },
]

/** نرمال‌سازی برای مقایسه نام (نیم‌فاصله و فاصله اضافه) */
function norm(name: string) {
  return (name || "")
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

export async function GET() {
  return POST()
}

export async function POST() {
  try {
    const existing = await prisma.productionStation.findMany()
    const byNorm = new Map(existing.map((s) => [norm(s.name), s]))

    const created: string[] = []
    const updated: string[] = []

    for (const def of defaultStations) {
      const key = norm(def.name)
      const found = byNorm.get(key)

      if (!found) {
        const row = await prisma.productionStation.create({
          data: {
            name: def.name,
            code: def.code,
            sortOrder: def.sortOrder,
            isActive: true,
          },
        })
        byNorm.set(key, row)
        created.push(def.name)
        continue
      }

      // هم‌نام با املای متفاوت یا sortOrder قدیمی → اصلاح
      const needUpdate =
        found.name !== def.name ||
        found.code !== def.code ||
        found.sortOrder !== def.sortOrder ||
        found.isActive !== true

      if (needUpdate) {
        await prisma.productionStation.update({
          where: { id: found.id },
          data: {
            name: def.name,
            code: def.code,
            sortOrder: def.sortOrder,
            isActive: true,
          },
        })
        updated.push(`${found.name} → ${def.name}`)
      }
    }

    const stations = await prisma.productionStation.findMany({
      orderBy: { sortOrder: "asc" },
    })

    return NextResponse.json({
      message:
        created.length || updated.length
          ? `ایجاد: ${created.length} | اصلاح نام/ترتیب: ${updated.length}`
          : "همه ایستگاه‌ها از قبل درست بودند",
      created,
      updated,
      count: stations.length,
      stations: stations.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        sortOrder: s.sortOrder,
      })),
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: "خطا در تعریف ایستگاه‌ها", details: String(error) },
      { status: 500 }
    )
  }
}