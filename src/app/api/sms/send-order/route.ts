import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { buildOrderSms, normalizeIranMobile, pickCustomerPhone, sendSms } from "@/lib/sms"

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "ابتدا وارد سیستم شوید" }, { status: 401 })
    }

    const { orderId, force } = await req.json()
    if (!orderId) {
      return NextResponse.json({ error: "orderId الزامی است" }, { status: 400 })
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true },
    })
    if (!order) {
      return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 })
    }

    if (order.smsStatus === "SENT" && !force) {
      return NextResponse.json({ error: "پیامک این فاکتور قبلاً ارسال شده" }, { status: 409 })
    }

    const rawPhone = pickCustomerPhone(order.customer)
    if (!rawPhone) {
      return NextResponse.json({ error: "شماره موبایل برای این مشتری ثبت نشده" }, { status: 400 })
    }
    const mobile = normalizeIranMobile(rawPhone)
    if (!mobile) {
      return NextResponse.json({ error: `شماره «${rawPhone}» یک موبایل معتبر نیست` }, { status: 400 })
    }

    const text = buildOrderSms(order.customer?.name || "", order.orderNumber)
    const result = await sendSms(mobile, text)

    if (!result.ok) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          // اگر قبلاً با موفقیت رفته بود، وضعیتِ «ارسال‌شده» حفظ می‌شود و فقط پیام خطا ثبت می‌شود
          smsStatus: order.smsStatus === "SENT" ? "SENT" : "FAILED",
          smsError: result.error.slice(0, 300),
        },
      })
      return NextResponse.json({ error: result.error }, { status: 502 })
    }

    // حالت آزمایشی: چیزی در دیتابیس ثبت نمی‌شود تا بعداً ارسال واقعی بلاک نشود
    if (result.mock) {
      return NextResponse.json({ ok: true, mock: true, text, mobile })
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { smsStatus: "SENT", smsSentAt: new Date(), smsError: null },
    })
    return NextResponse.json({ ok: true, text })
  } catch (error: any) {
    console.error("send-order sms error:", error)
    return NextResponse.json({ error: error.message || "خطا در ارسال پیامک" }, { status: 500 })
  }
}