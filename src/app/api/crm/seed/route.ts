import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

const STAGES = [
  { name: "Lead جدید", code: "NEW_LEAD", sortOrder: 1 },
  { name: "تماس اولیه", code: "FIRST_CONTACT", sortOrder: 2 },
  { name: "نیازسنجی", code: "NEED", sortOrder: 3 },
  { name: "قیمت‌گذاری", code: "PRICING", sortOrder: 4 },
  { name: "پیش‌فاکتور ارسال شد", code: "QUOTATION", sortOrder: 5 },
  { name: "پیگیری", code: "FOLLOW_UP", sortOrder: 6 },
  { name: "مذاکره", code: "NEGOTIATION", sortOrder: 7 },
  { name: "برنده", code: "WON", sortOrder: 8, isWon: true },
  { name: "از دست رفته", code: "LOST", sortOrder: 9, isLost: true },
]

const LOST_REASONS = [
  "قیمت بالا",
  "رقیب",
  "عدم نیاز",
  "زمان تحویل",
  "کیفیت",
  "عدم پاسخگویی",
  "مبلغ پروژه",
  "شرایط پرداخت",
  "سایر",
]

export async function POST() {
  try {
    const stages = []
    for (const s of STAGES) {
      const row = await prisma.pipelineStage.upsert({
        where: { name: s.name },
        update: {
          code: s.code,
          sortOrder: s.sortOrder,
          isWon: !!(s as any).isWon,
          isLost: !!(s as any).isLost,
          isActive: true,
        },
        create: {
          name: s.name,
          code: s.code,
          sortOrder: s.sortOrder,
          isWon: !!(s as any).isWon,
          isLost: !!(s as any).isLost,
          isActive: true,
        },
      })
      stages.push(row)
    }

    const reasons = []
    let i = 1
    for (const name of LOST_REASONS) {
      const row = await prisma.lostReason.upsert({
        where: { name },
        update: { sortOrder: i, isActive: true },
        create: { name, sortOrder: i, isActive: true },
      })
      reasons.push(row)
      i++
    }

    return NextResponse.json({
      message: "CRM seed انجام شد",
      stages: stages.length,
      lostReasons: reasons.length,
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در seed" },
      { status: 500 }
    )
  }
}

export async function GET() {
  return POST()
}