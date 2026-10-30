import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { listReadyForDeliveryOrders, sendReadySmsManually } from "@/lib/orderReadySms"

// لیست سفارش‌های «آماده تحویل» همراه با وضعیت پیامک
export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "ابتدا وارد سیستم شوید" }, { status: 401 })
    }
    const rows = await listReadyForDeliveryOrders()
    return NextResponse.json({
      rows,
      autoEnabled: process.env.READY_SMS_ENABLED === "true",
    })
  } catch (error: any) {
    console.error("ready-sms list error:", error)
    return NextResponse.json(
      { error: error?.message || "خطا در دریافت لیست" },
      { status: 500 }
    )
  }
}

// ارسال دستی پیامک «آماده تحویل» برای یک سفارش تولید
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "ابتدا وارد سیستم شوید" }, { status: 401 })
    }

    const { productionOrderId, force } = await req.json()
    if (!productionOrderId) {
      return NextResponse.json({ error: "productionOrderId الزامی است" }, { status: 400 })
    }

    const result = await sendReadySmsManually(String(productionOrderId), {
      force: Boolean(force),
      operatorName: session.displayName || null,
    })

    if (result.status === "sent" || result.status === "mock") {
      return NextResponse.json({ ok: true, mock: result.status === "mock" })
    }
    if (result.status === "skipped") {
      return NextResponse.json(
        { error: result.reason || "ارسال انجام نشد" },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: result.reason || "خطا در ارسال پیامک" },
      { status: 502 }
    )
  } catch (error: any) {
    console.error("ready-sms send error:", error)
    return NextResponse.json(
      { error: error?.message || "خطا در ارسال پیامک" },
      { status: 500 }
    )
  }
}