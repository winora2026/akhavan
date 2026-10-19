import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

// تغییر دستی وضعیت ارسال سپیدار یک سفارش
//  - mark-success: فاکتور در سپیدار هست ولی وضعیتش در نرم‌افزار ثبت نشده
//  - reset: فاکتور در سپیدار حذف شده؛ سفارش دوباره قابل ارسال شود
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "ورود لازم است" }, { status: 401 })
    }

    const body = await req.json()
    const orderNumber = String(body.orderNumber || "").trim()
    const action = String(body.action || "")

    if (!orderNumber) {
      return NextResponse.json({ error: "orderNumber الزامی است" }, { status: 400 })
    }
    if (action !== "mark-success" && action !== "reset") {
      return NextResponse.json(
        { error: "action باید mark-success یا reset باشد" },
        { status: 400 }
      )
    }

    const order = await prisma.order.findFirst({ where: { orderNumber } })
    if (!order) {
      return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 })
    }

    if (action === "mark-success") {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          sepidarSyncStatus: "SUCCESS",
          sepidarSyncedAt: new Date(),
          sepidarSyncError: null,
        },
      })
    } else {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          sepidarSyncStatus: null,
          sepidarInvoiceId: null,
          sepidarSyncedAt: null,
          sepidarSyncError: null,
        },
      })
    }

    return NextResponse.json({
      success: true,
      orderNumber,
      action,
      previousStatus: order.sepidarSyncStatus,
    })
  } catch (e: any) {
    console.error("sepidar sync-status:", e)
    return NextResponse.json(
      { error: e?.message || "خطا در تغییر وضعیت" },
      { status: 500 }
    )
  }
}