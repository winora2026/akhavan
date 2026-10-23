import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

const DEFAULTS = [
  "قیمت بالا",
  "انتخاب رقیب",
  "منصرف شد",
  "زمان تحویل",
  "کیفیت / نمونه",
  "عدم پاسخگویی",
  "سایر",
]

export async function GET() {
  try {
    const count = await prisma.lostReason.count()
    if (count === 0) {
      await prisma.lostReason.createMany({
        data: DEFAULTS.map((name, i) => ({
          name,
          sortOrder: i + 1,
          isActive: true,
        })),
      })
    }
    const items = await prisma.lostReason.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    })
    return NextResponse.json(items)
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در دریافت دلایل" },
      { status: 500 }
    )
  }
}