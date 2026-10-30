import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isMockMode } from "@/lib/sepidar/client"
import { auditSeedAgainstSepidar } from "@/lib/sepidar/seedAudit"

// فقط‌خواندنی: مقایسه‌ی لیست مشتریان اخوان با طرف‌حساب‌های سپیدار
export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "ورود لازم است" }, { status: 401 })
    }
    if (isMockMode()) {
      return NextResponse.json({ error: "حالت آزمایشی فعال است" }, { status: 400 })
    }
    return NextResponse.json(await auditSeedAgainstSepidar())
  } catch (e: any) {
    console.error("sepidar seed audit:", e)
    return NextResponse.json({ error: e?.message || "خطا" }, { status: 500 })
  }
}