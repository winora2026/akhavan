import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getTelephonyStats } from "@/lib/telephony/bootstrap"
import { getLiveSnapshot } from "@/lib/telephony/state"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return NextResponse.json({
    ...getTelephonyStats(),
    liveCalls: getLiveSnapshot().filter((c) => c.state !== "ENDED").slice(0, 20),
  })
}
