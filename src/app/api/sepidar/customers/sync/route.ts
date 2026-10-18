import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { ensureSepidarParty } from "@/lib/sepidar/party"
import { isMockMode } from "@/lib/sepidar/client"

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "ورود لازم است" }, { status: 401 })
    }
    const body = await req.json().catch(() => ({}))
    const customerId = String(body.customerId || "").trim()
    if (!customerId) {
      return NextResponse.json({ error: "customerId الزامی است" }, { status: 400 })
    }
    const result = await ensureSepidarParty(customerId)
    return NextResponse.json({ success: true, mock: isMockMode(), ...result })
  } catch (e: any) {
    console.error("sepidar customer sync:", e)
    return NextResponse.json(
      { error: e?.message || "خطا در همگام‌سازی مشتری" },
      { status: 500 }
    )
  }
}