import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * نام‌ها باید با mapServiceToStation و buildRoute یکی باشند.
 * renameFrom: اگر ایستگاه قدیمی با این نام باشد، به name جدید اصلاح می‌شود.
 */
const defaultStations: {
  name: string
  code: string
  sortOrder: number
  renameFrom?: string[]
}[] = [
  { name: "برش", code: "CUT", sortOrder: 1 },
  {
    name: "تراش ۱",
    code: "BEVEL1",
    sortOrder: 2,
    renameFrom: ["تراش"],
  },
  { name: "تراش ۲", code: "BEVEL2", sortOrder: 3 },
  { name: "تراش الگویی", code: "PATTERN", sortOrder: 4 },
  { name: "دیاموند", code: "DIAMOND", sortOrder: 5 },
  { name: "دیاموند زاویه", code: "DIAMOND_ANGLE", sortOrder: 6 },
  { name: "لول معمولی", code: "LOOL", sortOrder: 7 },
  { name: "لول براق", code: "LOOL_SHINY", sortOrder: 8 },
  { name: "لیمینت", code: "LAMINATE", sortOrder: 9 },
  { name: "دوجداره", code: "DOUBLE", sortOrder: 10 },
  { name: "CNC", code: "CNC", sortOrder: 11 },
  { name: "UV", code: "UV", sortOrder: 12 },
  { name: "LED", code: "LED", sortOrder: 13 },
  { name: "MDF", code: "MDF", sortOrder: 14 },
  { name: "سوراخکاری", code: "DRILL", sortOrder: 15 },
  { name: "سندبلاست", code: "SANDBLAST", sortOrder: 16 },
  {
    name: "چاپ (رنگ‌کاری)",
    code: "PRINT",
    sortOrder: 17,
    renameFrom: ["چاپ"],
  },
  { name: "قاب", code: "FRAME", sortOrder: 18 },
  { name: "خم‌کاری", code: "BEND", sortOrder: 19 },
  { name: "سکوریت", code: "TEMPER", sortOrder: 20 },
  { name: "شست و شو", code: "WASH", sortOrder: 21 },
  { name: "بسته‌بندی", code: "PACK", sortOrder: 22 },
  {
    name: "انبار کالای نیمه‌ساخته",
    code: "WH1",
    sortOrder: 23,
    renameFrom: ["انبار محصول یک", "انبار محصول 1"],
  },
  {
    name: "انبار آماده تحویل",
    code: "WH2",
    sortOrder: 24,
    renameFrom: ["انبار محصول دو", "انبار محصول 2"],
  },
  { name: "بارگیری", code: "LOAD", sortOrder: 25 },
]

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
      let found = byNorm.get(key)

      // پیدا کردن با نام قدیمی (rename)
      if (!found && def.renameFrom?.length) {
        for (const old of def.renameFrom) {
          const oldRow = byNorm.get(norm(old))
          if (oldRow) {
            found = oldRow
            break
          }
        }
      }

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

      const needUpdate =
        found.name !== def.name ||
        found.code !== def.code ||
        found.sortOrder !== def.sortOrder ||
        found.isActive !== true

      if (needUpdate) {
        const prev = found.name
        await prisma.productionStation.update({
          where: { id: found.id },
          data: {
            name: def.name,
            code: def.code,
            sortOrder: def.sortOrder,
            isActive: true,
          },
        })
        byNorm.delete(norm(prev))
        byNorm.set(key, { ...found, name: def.name })
        updated.push(`${prev} → ${def.name}`)
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