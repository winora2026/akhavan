import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getMockCalls } from "@/lib/zitech/mock"

function normPhone(p: string) {
  return String(p || "").replace(/\D/g, "").replace(/^0/, "")
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const q = (searchParams.get("q") || "").trim()
    const status = searchParams.get("status") || "همه"
    const useMock = process.env.ZITECH_MOCK !== "false"

    // اگر دیتابیس خالی بود و mock روشن است، از mock پر کن (فقط برای دمو)
    const count = await prisma.voiceCall.count()
    if (count === 0 && useMock) {
      for (const m of getMockCalls()) {
        await prisma.voiceCall.upsert({
          where: { externalId: m.externalId },
          create: {
            externalId: m.externalId,
            direction: m.direction,
            phone: m.phone,
            phoneNormalized: normPhone(m.phone),
            status: m.status,
            endReason: m.endReason,
            startedAt: new Date(m.startedAt),
            durationSec: m.durationSec,
            turns: m.turns,
            cost: m.cost,
            answerer: m.answerer,
            goal: m.goal,
            summary: m.summary,
          },
          update: {},
        })
      }
    }

    const where: any = {}
    if (status !== "همه") where.status = status
    if (q) {
      where.OR = [
        { phone: { contains: q } },
        { phoneNormalized: { contains: normPhone(q) } },
        { externalId: { contains: q } },
      ]
    }

    const items = await prisma.voiceCall.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: 200,
      include: {
        customer: { select: { id: true, name: true } },
        lead: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({ items })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در دریافت تماس‌ها" },
      { status: 500 }
    )
  }
}