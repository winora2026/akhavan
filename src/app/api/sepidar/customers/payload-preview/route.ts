import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { buildCreatePartyPayload, peekSepidarParty } from "@/lib/sepidar/party"

// فقط‌خواندنی و موقت: نشان می‌دهد برای هر مشتری، همین حالا چه بدنه‌ای به CreateParty فرستاده می‌شود.
// هیچ چیزی به سپیدار فرستاده یا در دیتابیس عوض نمی‌شود. بعد از رفع مشکل پاکش کنید (اطلاعات مشتری را نشان می‌دهد).
//   /api/sepidar/customers/payload-preview?name=فرخی      (بخشی از نام؛ حداکثر ۵ مشتری)
//   /api/sepidar/customers/payload-preview?id=<شناسه‌ی مشتری>

function parseProfile(p: unknown) {
  try {
    return p ? JSON.parse(String(p)) : null
  } catch {
    return "نامعتبر (JSON خراب)"
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "ورود لازم است" }, { status: 401 })

  const id = req.nextUrl.searchParams.get("id")
  const name = req.nextUrl.searchParams.get("name")
  if (!id && !name) {
    return NextResponse.json({ error: "id یا name لازم است" }, { status: 400 })
  }

  const rows: any[] = id
    ? [await prisma.customer.findUnique({ where: { id } })].filter(Boolean)
    : await prisma.customer.findMany({
        where: { name: { contains: String(name) } },
        orderBy: { createdAt: "desc" },
        take: 5,
      })

  const sepidarSide: Record<string, unknown> = {}
  for (const c of rows) {
    if (c.sepidarPartyRef) {
      try {
        sepidarSide[c.id] = await peekSepidarParty(c.sepidarPartyRef)
      } catch (e: any) {
        sepidarSide[c.id] = `خطا: ${e?.message}`
      }
    }
  }

  return NextResponse.json(
    rows.map((c: any) => ({
      id: c.id,
      name: c.name,
      customerCode: c.customerCode,
      sepidarPartyRef: c.sepidarPartyRef ?? null,
      createdAt: c.createdAt,
      profileInDb: parseProfile(c.profile),
      wouldSendToSepidar: buildCreatePartyPayload(c),
      currentlyInSepidar: sepidarSide[c.id] ?? "لینک نشده",
    }))
  )
}