import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

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

export async function POST() {
  try {
    const existing = await prisma.productionStation.findMany({
      select: { name: true },
    })
    const existingNames = new Set(existing.map((s) => s.name))

    const toCreate = defaultStations.filter((s) => !existingNames.has(s.name))

    if (toCreate.length === 0) {
      return NextResponse.json({
        message: "همه ایستگاه‌ها از قبل تعریف شده‌اند",
        count: existing.length,
      })
    }

    await prisma.productionStation.createMany({
      data: toCreate.map((s) => ({
        name: s.name,
        code: s.code,
        sortOrder: s.sortOrder,
        isActive: true,
      })),
    })

    const stations = await prisma.productionStation.findMany({
      orderBy: { sortOrder: "asc" },
    })

    return NextResponse.json({
      message: `${toCreate.length} ایستگاه جدید اضافه شد`,
      count: stations.length,
      stations,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "خطا در تعریف ایستگاه‌ها" }, { status: 500 })
  }
}