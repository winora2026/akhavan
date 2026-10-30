// ───────────── پیامک «سفارش آماده تحویل است» (خودکار + دستی) ─────────────
// خودکار: وقتی همه‌ی قطعه‌های یک سفارش از «انبار کالای نیمه‌ساخته» رد شدند (hook در api/production/scan).
//          فقط وقتی کار می‌کند که در .env بگذارید READY_SMS_ENABLED=true
// دستی:   از صفحه‌ی /production/ready-sms (دکمه‌ی «ارسال پیامک»)؛ به READY_SMS_ENABLED وابسته نیست.
//
// - وضعیت ارسال در جدول ProductionHistory ثبت می‌شود (نیازی به تغییر schema نیست).
// - ارسال خودکار برای هر سفارش فقط یک‌بار انجام می‌شود؛ ارسال دستیِ دوباره فقط با force.
// - هیچ‌وقت ارور پرتاب نمی‌کند تا کار ایستگاه‌ها خراب نشود.
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

export type ReadyOrderRow = {
  productionOrderId: string
  orderNumber: string
  customerName: string
  itemCount: number
  /** آخرین زمانی که قطعه‌ای از انبار نیمه‌ساخته رد شد (ISO) */
  readyAt: string | null
  /** تعداد قطعه‌هایی که هنوز در انبار آماده تحویل منتظرند */
  warehousePending: number
  hasMobile: boolean
  mobileMasked: string | null
  sms: "none" | "sent" | "failed" | "sending"
  smsAt: string | null
  smsNote: string | null
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

// «انبار آماده تحویل» یا نام قدیمی «انبار محصول دو»
function isReadyStation(name: string) {
  const n = norm(name)
  return n.includes("آماده تحویل") || n === norm("انبار محصول دو")
}

// متن پیامک
export function buildReadyForDeliverySms(customerName: string, orderNumber: string) {
  return `مشتری گرامی ${customerName} سفارش شماره ${orderNumber} شما در شرکت شیشه و آینه اخوان آماده تحویل می باشد. فقط تا یک هفته مسئولیت سفارش شما را بر عهده داریم، در غیر اینصورت مسئولیت مراحل بعدی تماما بر عهده شما خواهد بود.`
}

type HistRow = { id: string; newStatus: string | null; createdAt: Date }

function isSendingFresh(row: HistRow) {
  return row.newStatus === ST_SENDING && Date.now() - row.createdAt.getTime() < SENDING_STALE_MS
}
function isBlocking(row: HistRow) {
  return row.newStatus === ST_SENT || isSendingFresh(row)
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

const poInclude = {
  items: { include: { stations: { include: { station: true } } } },
  order: { include: { customer: true } },
} as const

async function loadProductionOrder(id: string): Promise<any | null> {
  return prisma.productionOrder.findUnique({ where: { id }, include: poInclude })
}

// آیا همه‌ی قطعه‌های سفارش از انبار نیمه‌ساخته رد شده‌اند؟
function semiCheck(po: any): { ok: boolean; reason?: string; semis: any[] } {
  const semis: any[] = (po.items || [])
    .map((it: any) =>
      (it.stations || []).find((s: any) => isSemiFinishedStation(s.station?.name || ""))
    )
    .filter(Boolean)
  if (semis.length === 0) {
    return { ok: false, reason: "ایستگاه نیمه‌ساخته در مسیر قطعه‌ها نیست", semis }
  }
  if (semis.some((s: any) => s.status !== "تکمیل شده")) {
    return { ok: false, reason: "هنوز همه‌ی قطعه‌ها از انبار نیمه‌ساخته رد نشده‌اند", semis }
  }
  return { ok: true, semis }
}

/** هسته‌ی مشترک ارسال (خودکار و دستی) */
async function sendForProductionOrder(
  po: any,
  opts: { force: boolean; source: "auto" | "manual"; operatorName?: string | null }
): Promise<ReadySmsResult> {
  const orderNumber: string = po.order.orderNumber
  const label = opts.source === "manual" ? "دستی" : "خودکار"

  // قبلاً ارسال شده (یا در حال ارسال)؟ (ارسال دستیِ مجدد با force از این بررسی رد می‌شود)
  if (!opts.force) {
    const existing = await prisma.productionHistory.findMany({
      where: { productionOrderId: po.id, action: HISTORY_ACTION },
    })
    if (existing.some(isBlocking)) {
      return { status: "skipped", reason: "قبلاً ارسال شده" }
    }
  }

  // «قفل» ارسال: اگر دو درخواست هم‌زمان برسند فقط یکی پیامک می‌فرستد
  const claim = await prisma.productionHistory.create({
    data: {
      productionOrderId: po.id,
      action: HISTORY_ACTION,
      description: `پیامک آماده تحویل سفارش ${orderNumber} (${label})`,
      newStatus: ST_SENDING,
      operatorName: opts.operatorName || null,
    },
  })
  const claims = await prisma.productionHistory.findMany({
    where: { productionOrderId: po.id, action: HISTORY_ACTION },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })
  const contenders = claims.filter(opts.force ? isSendingFresh : isBlocking)
  const first = contenders[0]
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
    await finish(
      ST_FAILED,
      `پیامک آماده تحویل (${label}): شماره موبایل مشتری ثبت نشده (سفارش ${orderNumber})`
    )
    return { status: "failed", reason: "شماره موبایل مشتری ثبت نشده" }
  }

  const text = buildReadyForDeliverySms(customer?.name || "", orderNumber)
  const result = await sendSms(mobile, text)

  if (!result.ok) {
    await finish(ST_FAILED, `پیامک آماده تحویل (${label}) ناموفق: ${result.error}`)
    return { status: "failed", reason: result.error }
  }

  // حالت آزمایشی (mock): چیزی ثبت نمی‌شود تا بعداً ارسال واقعی بلاک نشود
  if (result.mock) {
    await prisma.productionHistory.delete({ where: { id: claim.id } }).catch(() => {})
    return { status: "mock" }
  }

  await finish(ST_SENT, `پیامک آماده تحویل ارسال شد (${label}) — سفارش ${orderNumber}`)
  return { status: "sent" }
}

/**
 * ارسال خودکار: بعد از رد شدن یک قطعه از «انبار کالای نیمه‌ساخته» صدا زده می‌شود
 * (productionItemId = شناسه‌ی قطعه‌ی تولید). فقط وقتی READY_SMS_ENABLED=true باشد کار می‌کند.
 */
export async function notifyOrderReadyForDelivery(
  productionItemId: string
): Promise<ReadySmsResult> {
  try {
    if (process.env.READY_SMS_ENABLED !== "true") {
      return { status: "skipped", reason: "ارسال خودکار غیرفعال است (READY_SMS_ENABLED)" }
    }

    const item = await prisma.productionItem.findUnique({
      where: { id: productionItemId },
      select: { productionOrderId: true },
    })
    if (!item) return { status: "skipped", reason: "قطعه پیدا نشد" }

    const po = await loadProductionOrder(item.productionOrderId)
    if (!po || !po.order) return { status: "skipped", reason: "سفارش تولید پیدا نشد" }

    const check = semiCheck(po)
    if (!check.ok) return { status: "skipped", reason: check.reason }

    return await sendForProductionOrder(po, { force: false, source: "auto" })
  } catch (e: any) {
    console.error("notifyOrderReadyForDelivery error:", e)
    return { status: "failed", reason: String(e?.message || e) }
  }
}

/**
 * ارسال دستی (از صفحه‌ی ready-sms). به READY_SMS_ENABLED وابسته نیست.
 * force = true یعنی حتی اگر قبلاً ارسال شده، دوباره بفرست.
 */
export async function sendReadySmsManually(
  productionOrderId: string,
  opts: { force?: boolean; operatorName?: string | null } = {}
): Promise<ReadySmsResult> {
  try {
    const po = await loadProductionOrder(productionOrderId)
    if (!po || !po.order) return { status: "skipped", reason: "سفارش تولید پیدا نشد" }

    const check = semiCheck(po)
    if (!check.ok) return { status: "skipped", reason: check.reason }

    return await sendForProductionOrder(po, {
      force: !!opts.force,
      source: "manual",
      operatorName: opts.operatorName || null,
    })
  } catch (e: any) {
    console.error("sendReadySmsManually error:", e)
    return { status: "failed", reason: String(e?.message || e) }
  }
}

/**
 * لیست سفارش‌هایی که همه‌ی قطعه‌هایشان از انبار نیمه‌ساخته رد شده (آماده تحویل)،
 * همراه با وضعیت پیامک. فقط سفارش‌هایی که در `days` روز اخیر رد شده‌اند.
 */
export async function listReadyForDeliveryOrders(
  days = 45,
  limit = 150
): Promise<ReadyOrderRow[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const semiDone = await prisma.productionItemStation.findMany({
    where: {
      status: "تکمیل شده",
      completedAt: { gte: since },
      OR: [
        { station: { name: { contains: "نیمه" } } },
        { station: { name: "انبار محصول یک" } },
      ],
    },
    select: { productionItem: { select: { productionOrderId: true } } },
  })
  const ids = Array.from(new Set(semiDone.map((r) => r.productionItem.productionOrderId)))
  if (ids.length === 0) return []

  const orders: any[] = await prisma.productionOrder.findMany({
    where: { id: { in: ids } },
    include: poInclude,
  })
  const history = await prisma.productionHistory.findMany({
    where: { productionOrderId: { in: ids }, action: HISTORY_ACTION },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })

  const rows: ReadyOrderRow[] = []
  for (const po of orders) {
    if (!po.order) continue
    const check = semiCheck(po)
    if (!check.ok) continue

    let readyAt: Date | null = null
    for (const s of check.semis) {
      if (s.completedAt && (!readyAt || s.completedAt > readyAt)) readyAt = s.completedAt
    }

    const warehousePending = (po.items || []).filter((it: any) => {
      const r = (it.stations || []).find((s: any) => isReadyStation(s.station?.name || ""))
      return r && r.status !== "تکمیل شده"
    }).length

    const customer: any = po.order.customer
    const mobile = await resolveMobile(customer)

    const h = history.filter((x) => x.productionOrderId === po.id)
    const sent = h.filter((x) => x.newStatus === ST_SENT)
    const failed = h.filter((x) => x.newStatus === ST_FAILED)
    let sms: ReadyOrderRow["sms"] = "none"
    let smsAt: Date | null = null
    let smsNote: string | null = null
    if (sent.length > 0) {
      const last = sent[sent.length - 1]
      sms = "sent"
      smsAt = last.createdAt
      smsNote = last.description || null
    } else if (h.some(isSendingFresh)) {
      sms = "sending"
    } else if (failed.length > 0) {
      const last = failed[failed.length - 1]
      sms = "failed"
      smsAt = last.createdAt
      smsNote = last.description || null
    }

    rows.push({
      productionOrderId: po.id,
      orderNumber: po.order.orderNumber,
      customerName: customer?.name || "—",
      itemCount: (po.items || []).length,
      readyAt: readyAt ? readyAt.toISOString() : null,
      warehousePending,
      hasMobile: !!mobile,
      mobileMasked: mobile ? `${mobile.slice(0, 4)}***${mobile.slice(-4)}` : null,
      sms,
      smsAt: smsAt ? smsAt.toISOString() : null,
      smsNote,
    })
  }

  rows.sort((a, b) => (b.readyAt || "").localeCompare(a.readyAt || ""))
  return rows.slice(0, limit)
}