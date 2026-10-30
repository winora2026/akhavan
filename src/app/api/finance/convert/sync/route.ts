import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 })
    }
    if (session.role !== "finance" && session.role !== "admin") {
      return NextResponse.json(
        { error: "فقط مالی/مدیر می‌تواند کانورت کند" },
        { status: 403 }
      )
    }

    const body = await req.json()
    const ids: string[] = Array.isArray(body.orderIds) ? body.orderIds : []
    const force = Boolean(body.force) // ارسال مجدد

    if (!ids.length) {
      return NextResponse.json({ error: "هیچ فاکتوری انتخاب نشده" }, { status: 400 })
    }

    const base =
      process.env.NEXT_PUBLIC_BASE_URL ||
      process.env.NEXTAUTH_URL ||
      "http://localhost:3000"

    const results: {
      orderId: string
      ok: boolean
      error?: string
      data?: any
    }[] = []

    for (const orderId of ids) {
      try {
        const res = await fetch(`${base}/api/sepidar/sync-invoice`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // کوکی session را مرورگر به این route می‌فرستد؛
            // برای fetch سرور به سرور، cookie را فوروارد می‌کنیم
            cookie: req.headers.get("cookie") || "",
          },
          body: JSON.stringify({ orderId, force }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          results.push({
            orderId,
            ok: false,
            error: data.error || data.message || `HTTP ${res.status}`,
          })
        } else {
          results.push({ orderId, ok: true, data })
        }
      } catch (e: any) {
        results.push({ orderId, ok: false, error: e.message || "خطا" })
      }
    }

    const okCount = results.filter((r) => r.ok).length
    const failCount = results.length - okCount

    return NextResponse.json({
      success: failCount === 0,
      okCount,
      failCount,
      results,
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e.message || "خطا" }, { status: 500 })
  }
}