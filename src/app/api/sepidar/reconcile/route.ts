import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isMockMode } from "@/lib/sepidar/client"
import { reconcileSepidarInvoices } from "@/lib/sepidar/reconcile"

// GET  ?days=45          → فقط گزارش (چیزی تغییر نمی‌کند)
// POST {apply, days, force} → apply: true تغییرات را اعمال می‌کند

async function run(apply: boolean, days?: number, force?: boolean) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "ورود لازم است" }, { status: 401 })
  }
  if (isMockMode()) {
    return NextResponse.json({ error: "حالت آزمایشی فعال است" }, { status: 400 })
  }
  try {
    return NextResponse.json(await reconcileSepidarInvoices({ apply, days, force }))
  } catch (e: any) {
    console.error("sepidar reconcile:", e)
    return NextResponse.json({ error: e?.message || "خطا در همگام‌سازی با سپیدار" }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const days = Number(req.nextUrl.searchParams.get("days")) || undefined
  return run(false, days)
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  return run(body.apply === true, Number(body.days) || undefined, body.force === true)
}