import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isMockMode } from "@/lib/sepidar/client"
import { relinkCustomersByCode } from "@/lib/sepidar/customerRepair"

// GET  → فقط گزارش
// POST {apply: true} → اصلاح لینک مشتری‌های موجود در بخش fix

async function run(apply: boolean) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "ورود لازم است" }, { status: 401 })
  }
  if (isMockMode()) {
    return NextResponse.json({ error: "حالت آزمایشی فعال است" }, { status: 400 })
  }
  try {
    return NextResponse.json(await relinkCustomersByCode(apply))
  } catch (e: any) {
    console.error("sepidar customers relink:", e)
    return NextResponse.json({ error: e?.message || "خطا" }, { status: 500 })
  }
}

export async function GET() {
  return run(false)
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  return run(body.apply === true)
}