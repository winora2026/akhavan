// ───────────── پیامک «سفارش آماده تحویل است» ─────────────
// وقتی همه‌ی قطعه‌های یک سفارش از ایستگاه «انبار کالای نیمه‌ساخته» رد شدند (یعنی سفارش وارد کارتابل
// «انبار آماده تحویل» شده)، یک پیامک برای مشتری فرستاده می‌شود.
//
// - فقط یک‌بار برای هر سفارش تولید؛ وضعیت ارسال در جدول ProductionHistory ثبت می‌شود
//   (نیازی به تغییر schema و prisma db push نیست).
// - به‌صورت پیش‌فرض خاموش است؛ برای روشن کردن در .env بگذارید: READY_SMS_ENABLED=true
// - هیچ‌وقت ارور نمی‌دهد (خطا فقط ثبت می‌شود) تا کار ایستگاه‌ها خراب نشود.
// - فقط از توابع موجود در sms.ts استفاده می‌کند: pickCustomerPhone، normalizeIranMobile، sendSms.

import { prisma } from "@/lib/prisma"
import { normalizeIranMobile, pickCustomerPhone, sendSms } from "@/lib/sms"

const HISTORY_ACTION = "پیامک آماده تحویل"
const ST_SENDING = "در حال ارسال"
const ST_SENT = "ارسال شد"
const ST_FAILED = "ناموفق"
// اگر ارسالی بیش از این مدت «در حال ارسال» بماند (مثلاً سرور وسط کار خاموش شده)، دیگر جلوی ارسال دوباره را نمی‌گیرد
const SENDING_STALE_MS = 10 * 60 * 1000

export type ReadySmsResult = {
  status: "sent" | "mock" | "skipped" | "failed"
  reason?: string
}

function norm(s: string) {
  return (s || "")
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

// «انبار کالای نیمه‌ساخته» یا نام قدیمی «انبار محصول یک»
function isSemiFinishedStation(name: string) {
  const n = norm(name)
  return n.includes("نیمه") || n === norm("انبار محصول یک")
}

// متن پیامک
export function buildReadyForDeliverySms(customerName: string, orderNumber: string) {
  return `مشتری گرامی ${customerName} سفارش شماره ${orderNumber} شما در شرکت شیشه و آینه اخوان آماده تحویل می باشد. فقط تا یک هفته مسئولیت سفارش شما را بر عهده داریم، در غیر اینصورت مسئولیت مراحل بعدی تماما بر عهده شما خواهد بود.`
}

function isBlocking(row: { newStatus: string | null; createdAt: Date }) {
  if (row.newStatus === ST_SENT) return true
  if (row.newStatus === ST_SENDING) {
    return Date.now() - row.createdAt.getTime() < SENDING_STALE_MS
  }
  return false
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

/**
 * بعد از رد شدن یک قطعه از «انبار کالای نیمه‌ساخته» صدا زده شود (productionItemId = شناسه‌ی قطعه‌ی تولید).
 * اگر همه‌ی قطعه‌های سفارش از این ایستگاه رد شده باشند و پیامکش قبلاً نرفته باشد، پیامک می‌فرستد.
 */
export async function notifyOrderReadyForDelivery(
  productionItemId: string
): Promise<ReadySmsResult> {
  try {
    if (process.env.READY_SMS_ENABLED !== "true") {
      return { status: "skipped", reason: "غیرفعال (READY_SMS_ENABLED)" }
    }

    const item = await prisma.productionItem.findUnique({
      where: { id: productionItemId },
      select: { productionOrderId: true },
    })
    if (!item) return { status: "skipped", reason: "قطعه پیدا نشد" }

    const po = await prisma.productionOrder.findUnique({
      where: { id: item.productionOrderId },
      include: {
        items: { include: { stations: { include: { station: true } } } },
        order: { include: { customer: true } },
      },
    })
    if (!po || !po.order) return { status: "skipped", reason: "سفارش تولید پیدا نشد" }

    // آیا همه‌ی قطعه‌ها از انبار نیمه‌ساخته رد شده‌اند؟
    const semiStations = po.items
      .map((it) => it.stations.find((s) => isSemiFinishedStation(s.station?.name || "")))
      .filter((s): s is NonNullable<typeof s> => !!s)
    if (semiStations.length === 0) {
      return { status: "skipped", reason: "ایستگاه نیمه‌ساخته در مسیر قطعه‌ها نیست" }
    }
    if (semiStations.some((s) => s.status !== "تکمیل شده")) {
      return { status: "skipped", reason: "هنوز همه‌ی قطعه‌ها رد نشده‌اند" }
    }

    // قبلاً ارسال شده (یا در حال ارسال)؟
    const existing = await prisma.productionHistory.findMany({
      where: { productionOrderId: po.id, action: HISTORY_ACTION },
    })
    if (existing.some(isBlocking)) {
      return { status: "skipped", reason: "قبلاً ارسال شده" }
    }

    // «قفل» ارسال: اگر دو قطعه هم‌زمان رد شوند فقط یکی پیامک می‌فرستد
    const claim = await prisma.productionHistory.create({
      data: {
        productionOrderId: po.id,
        action: HISTORY_ACTION,
        description: `پیامک آماده تحویل سفارش ${po.order.orderNumber}`,
        newStatus: ST_SENDING,
      },
    })
    const claims = await prisma.productionHistory.findMany({
      where: { productionOrderId: po.id, action: HISTORY_ACTION },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    })
    const first = claims.find(isBlocking)
    if (first && first.id !== claim.id) {
      await prisma.productionHistory.delete({ where: { id: claim.id } }).catch(() => {})
      return { status: "skipped", reason: "درخواست دیگری در حال ارسال است" }
    }

    const finish = async (newStatus: string, description: string) => {
      await prisma.productionHistory
        .update({
          where: { id: claim.id },
          data: { newStatus, description: description.slice(0, 250) },
        })
        .catch(() => {})
    }

    const customer: any = po.order.customer
    const mobile = await resolveMobile(customer)
    if (!mobile) {
      await finish(ST_FAILED, `پیامک آماده تحویل: شماره موبایل مشتری ثبت نشده (سفارش ${po.order.orderNumber})`)
      return { status: "failed", reason: "شماره موبایل مشتری ثبت نشده" }
    }

    const text = buildReadyForDeliverySms(customer?.name || "", po.order.orderNumber)
    const result = await sendSms(mobile, text)

    if (!result.ok) {
      await finish(ST_FAILED, `پیامک آماده تحویل ناموفق: ${result.error}`)
      return { status: "failed", reason: result.error }
    }

    // حالت آزمایشی (mock): چیزی ثبت نمی‌شود تا بعداً ارسال واقعی بلاک نشود
    if (result.mock) {
      await prisma.productionHistory.delete({ where: { id: claim.id } }).catch(() => {})
      return { status: "mock" }
    }

    await finish(ST_SENT, `پیامک آماده تحویل ارسال شد (سفارش ${po.order.orderNumber})`)
    return { status: "sent" }
  } catch (e: any) {
    console.error("notifyOrderReadyForDelivery error:", e)
    return { status: "failed", reason: String(e?.message || e) }
  }
}