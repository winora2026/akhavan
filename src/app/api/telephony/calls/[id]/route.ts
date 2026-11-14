import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { recordingExists } from "@/lib/telephony/storage"
import { matchPhone } from "@/lib/telephony/customerLookup"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id } = await params
    const item = await prisma.pbxCall.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, customerCode: true, phone: true } },
        user: { select: { id: true, displayName: true, extension: true } },
      },
    })
    if (!item) {
      return NextResponse.json({ error: "تماس یافت نشد" }, { status: 404 })
    }

    const phone =
      item.direction === "OUTBOUND" ? item.calleeNumber : item.callerNorm || item.callerNumber
    let customer = item.customer
    if (!customer) {
      const match = await matchPhone(phone)
      if (match?.kind === "customer") {
        customer = {
          id: match.dbId || "",
          name: match.name,
          customerCode: match.code || null,
          phone: match.phone || null,
        }
      }
    }

    return NextResponse.json({
      ...item,
      customer,
      recordingAvailable: recordingExists(item.recordingPath),
      recordingUrl: `/api/telephony/recording/${item.id}`,
    })
  } catch (e: any) {
    console.error("[telephony] call detail failed", e)
    return NextResponse.json({ error: e?.message || "خطا در دریافت تماس" }, { status: 500 })
  }
}
