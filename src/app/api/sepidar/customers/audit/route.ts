import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { auditCustomerCodes } from "@/lib/sepidar/party"
import { isMockMode } from "@/lib/sepidar/client"

// فقط‌خواندنی: مشتری‌هایی که کدشان در اخوان با کد سپیدار فرق دارد
export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "ورود لازم است" }, { status: 401 })
    }
    if (isMockMode()) {
      return NextResponse.json({ error: "حالت آزمایشی فعال است" }, { status: 400 })
    }
    return NextResponse.json(await auditCustomerCodes())
  } catch (e: any) {
    console.error("sepidar customers audit:", e)
    return NextResponse.json({ error: e?.message || "خطا" }, { status: 500 })
  }
}