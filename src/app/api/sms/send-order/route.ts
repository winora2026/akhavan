import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import {
  buildOrderSms,
  findSeed,
  normalizeIranMobile,
  pickCustomerPhone,
  sendSms,
  seedDebug,
} from "@/lib/sms"

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

    // 1) شماره از خود رکورد مشتریِ سفارش (یا profile یا فایل مشتریان قدیمی)
    let rawPhone = pickCustomerPhone(order.customer)
    let lookupInfo = "route v3 | جستجوی رکوردهای دیگر لازم نشد"

    // 2) اگر پیدا نشد یا معتبر نبود: رکوردهای دیگرِ هم‌نام یا هم‌کد (مثلاً شماره‌ای که در «مدیریت مشتریان» ذخیره شده)
    if (!normalizeIranMobile(rawPhone) && order.customer) {
      const seedCode = String(findSeed(order.customer)?.code || "").trim()
      const others = await prisma.customer.findMany({
        where: {
          id: { not: order.customer.id },
          OR: [
            { name: order.customer.name },
            ...(seedCode ? [{ customerCode: seedCode }] : []),
          ],
        },
      })
      const details = others.map((o: any, i: number) => {
        const p = pickCustomerPhone(o)
        return `#${i + 1} کد=${o.customerCode ?? "-"} | شماره دارد: ${p ? "بله" : "خیر"} | موبایل معتبر: ${
          normalizeIranMobile(p) ? "بله" : "خیر"
        } | profile دارد: ${o.profile ? "بله" : "خیر"}`
      })
      lookupInfo = [
        "route v3",
        "کد seed: " + (seedCode || "پیدا نشد"),
        "تعداد رکوردهای دیگر یافت‌شده: " + others.length,
        ...details,
      ].join("\n")

      for (const other of others) {
        const p = pickCustomerPhone(other)
        if (normalizeIranMobile(p)) {
          rawPhone = p
          break
        }
      }
    }

    if (!rawPhone) {
      // عیب‌یابی موقت: فقط اسم فیلدها و وضعیت جستجو نشان داده می‌شود، نه شماره‌ها
      const c: any = order.customer
      const debug = [
        "کد دیتابیس: " + c?.customerCode,
        "نام: " + c?.name,
        "فیلدهای دارای مقدار: " + Object.keys(c || {}).filter((k) => c[k]).join(", "),
        seedDebug(c),
        lookupInfo,
      ].join("\n")
      return NextResponse.json(
        { error: "شماره موبایل برای این مشتری ثبت نشده\n\n" + debug },
        { status: 400 }
      )
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