import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getLiveCallsForExtension } from "@/lib/telephony/state"
import { matchPhone } from "@/lib/telephony/customerLookup"
import { displayPhone, normalizePhone } from "@/lib/telephony/phone"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { extension: true },
    })
    if (!user?.extension) {
      return NextResponse.json({ extension: null, calls: [] })
    }

    const live = getLiveCallsForExtension(user.extension).slice(0, 3)
    const calls = await Promise.all(
      live.map(async (call) => {
        const match = await matchPhone(call.callerNumber)
        return {
          id: call.id,
          state: call.state,
          direction: call.direction,
          callerNumber: displayPhone(call.callerNumber) || call.callerNumber,
          callerNorm: normalizePhone(call.callerNumber),
          calleeNumber: call.calleeNumber || null,
          extension: call.answeredExtension || user.extension,
          startedAt: new Date(call.startedAt).toISOString(),
          answeredAt: call.answeredAt ? new Date(call.answeredAt).toISOString() : null,
          endedAt: call.endedAt ? new Date(call.endedAt).toISOString() : null,
          disposition: call.disposition || null,
          customer: match
            ? { name: match.name, code: match.code || null, kind: match.kind, dbId: match.dbId }
            : null,
        }
      })
    )

    return NextResponse.json({ extension: user.extension, calls, serverTime: Date.now() })
  } catch (e: any) {
    console.error("[telephony] live api failed", e)
    return NextResponse.json({ error: e?.message || "خطا در دریافت تماس‌های زنده" }, { status: 500 })
  }
}
