import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { digitsOnly } from "@/lib/telephony/phone"
import { matchPhone } from "@/lib/telephony/customerLookup"
import { recordingExists } from "@/lib/telephony/storage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const sp = new URL(req.url).searchParams
    const q = (sp.get("q") || "").trim()
    const direction = (sp.get("direction") || "").trim()
    const disposition = (sp.get("disposition") || "").trim()
    const extension = (sp.get("extension") || "").trim()
    const fromRaw = (sp.get("from") || "").trim()
    const toRaw = (sp.get("to") || "").trim()
    const take = Math.min(Math.max(Number(sp.get("limit") || 100), 1), 300)
    const skip = Math.max(Number(sp.get("offset") || 0), 0)

    const where: any = {}
    if (direction) where.direction = direction
    if (disposition) where.disposition = disposition
    if (extension) where.agentExtension = extension

    if (fromRaw || toRaw) {
      const startedAt: any = {}
      const from = fromRaw ? new Date(fromRaw) : null
      const to = toRaw ? new Date(toRaw) : null
      if (from && !Number.isNaN(from.getTime())) startedAt.gte = from
      if (to && !Number.isNaN(to.getTime())) startedAt.lte = to
      if (Object.keys(startedAt).length) where.startedAt = startedAt
    }

    if (q) {
      const digits = digitsOnly(q)
      where.OR = [
        { callerNumber: { contains: q } },
        { calleeNumber: { contains: q } },
        ...(digits ? [{ callerNorm: { contains: digits } }] : []),
        { customer: { name: { contains: q } } },
        { user: { displayName: { contains: q } } },
      ]
    }

    const [rows, total] = await Promise.all([
      prisma.pbxCall.findMany({
        where,
        orderBy: { startedAt: "desc" },
        take,
        skip,
        include: {
          customer: { select: { id: true, name: true, customerCode: true } },
          user: { select: { id: true, displayName: true, extension: true } },
        },
      }),
      prisma.pbxCall.count({ where }),
    ])

    const items = await Promise.all(
      rows.map(async (row) => {
        let customer = row.customer
        if (!customer) {
          const phone =
            row.direction === "OUTBOUND" ? row.calleeNumber : row.callerNorm || row.callerNumber
          const match = await matchPhone(phone)
          if (match?.kind === "customer") {
            customer = { id: match.dbId || "", name: match.name, customerCode: match.code || null }
          }
        }
        return { ...row, customer, rawCdr: undefined, hasRecording: recordingExists(row.recordingPath) }
      })
    )

    return NextResponse.json({ items, total })
  } catch (e: any) {
    console.error("[telephony] calls list failed", e)
    return NextResponse.json({ error: e?.message || "خطا در دریافت تماس‌ها" }, { status: 500 })
  }
}
