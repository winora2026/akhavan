// ───────────── پیامک خودکار «ثبت سفارش» هنگام تبدیل به فاکتور ─────────────
// وقتی پیش‌فاکتور به «فاکتور» تبدیل شد (PATCH در api/orders)، همان پیامکی که دکمه‌ی «ارسال پیامک»
// صفحه‌ی فاکتورها می‌فرستد، خودکار برای مشتری فرستاده می‌شود.
//
// - وضعیت در همان فیلدهای Order ثبت می‌شود (smsStatus / smsSentAt / smsError)؛ پس ستون «پیامک» و
//   دکمه‌ی دستیِ صفحه‌ی فاکتورها همان‌طور که هست کار می‌کند («ارسال مجدد» / «تلاش مجدد»).
// - فقط یک‌بار برای هر فاکتور (اگر قبلاً SENT شده یا همین الان در حال ارسال است، رد می‌شود).
// - به‌صورت پیش‌فرض خاموش است؛ برای روشن کردن در .env بگذارید: ORDER_SMS_ENABLED=true
// - هیچ‌وقت ارور پرتاب نمی‌کند تا تبدیل به فاکتور خراب نشود.
// - فقط از توابع موجود در sms.ts استفاده می‌کند: buildOrderSms، pickCustomerPhone، normalizeIranMobile، sendSms.

import { prisma } from "@/lib/prisma"
import { buildOrderSms, normalizeIranMobile, pickCustomerPhone, sendSms } from "@/lib/sms"

export type RegisteredSmsResult = {
  status: "sent" | "mock" | "skipped" | "failed"
  reason?: string
}

// شماره‌ی موبایل مشتری: اول از رکورد مشتریِ سفارش، بعد از رکوردهای دیگرِ هم‌نام
// (مثلاً شماره‌ای که در «مدیریت مشتریان» ذخیره شده)
async function resolveMobile(customer: any): Promise<string | null> {
  const direct = normalizeIranMobile(pickCustomerPhone(customer))
  if (direct) return direct
  if (!customer?.name) return null
  const others = await prisma.customer.findMany({
    where: { id: { not: customer.id }, name: customer.name },
  })
  for (const o of others) {
    const m = normalizeIranMobile(pickCustomerPhone(o))
    if (m) return m
  }
  return null
}

export async function notifyOrderRegistered(orderId: string): Promise<RegisteredSmsResult> {
  let claimed = false
  try {
    if (process.env.ORDER_SMS_ENABLED !== "true") {
      return { status: "skipped", reason: "ارسال خودکار غیرفعال است (ORDER_SMS_ENABLED)" }
    }

    // «قفل» ارسال: فقط اگر فاکتور است و هنوز SENT نشده؛ اگر دو درخواست هم‌زمان برسند فقط یکی پیامک می‌فرستد
    const claim = await prisma.order.updateMany({
      where: {
        id: orderId,
        status: "فاکتور",
        OR: [{ smsStatus: null }, { smsStatus: "FAILED" }],
      },
      data: { smsStatus: "SENDING", smsError: null },
    })
    if (claim.count === 0) {
      return { status: "skipped", reason: "قبلاً ارسال شده، در حال ارسال است یا فاکتور نیست" }
    }
    claimed = true

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true },
    })
    if (!order) {
      claimed = false
      return { status: "skipped", reason: "سفارش یافت نشد" }
    }

    const fail = async (message: string) => {
      await prisma.order
        .update({
          where: { id: orderId },
          data: { smsStatus: "FAILED", smsError: message.slice(0, 300) },
        })
        .catch(() => {})
      claimed = false
    }

    const mobile = await resolveMobile(order.customer)
    if (!mobile) {
      await fail("شماره موبایل برای این مشتری ثبت نشده")
      return { status: "failed", reason: "شماره موبایل برای این مشتری ثبت نشده" }
    }

    const text = buildOrderSms(order.customer?.name || "", order.orderNumber)
    const result = await sendSms(mobile, text)

    if (!result.ok) {
      await fail(result.error)
      return { status: "failed", reason: result.error }
    }

    // حالت آزمایشی (mock): وضعیت به حالت قبل برمی‌گردد تا بعداً ارسال واقعی بلاک نشود
    if (result.mock) {
      await prisma.order.update({ where: { id: orderId }, data: { smsStatus: null } })
      claimed = false
      return { status: "mock" }
    }

    await prisma.order.update({
      where: { id: orderId },
      data: { smsStatus: "SENT", smsSentAt: new Date(), smsError: null },
    })
    claimed = false
    return { status: "sent" }
  } catch (e: any) {
    console.error("notifyOrderRegistered error:", e)
    if (claimed) {
      await prisma.order
        .update({
          where: { id: orderId },
          data: { smsStatus: "FAILED", smsError: String(e?.message || e).slice(0, 300) },
        })
        .catch(() => {})
    }
    return { status: "failed", reason: String(e?.message || e) }
  }
}