import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { buildOrderSms, normalizeIranMobile, pickCustomerPhone } from "@/lib/sms"
import { buildReadyForDeliverySms } from "@/lib/orderReadySms"
import { buildMeasurementSms } from "@/lib/measurementSms"
import { exitPublicLink, orderPublicLink } from "@/lib/publicLinks"

// ───────────── گزارش پیامک‌ها ─────────────
// سه نوع پیام:
//   order       = «ثبت سفارش»      (از فیلدهای smsStatus / smsSentAt / smsError روی Order)
//   ready       = «آماده تحویل»     (از ردیف‌های ProductionHistory با عنوان «پیامک آماده تحویل»)
//   measurement = «ثبت اندازه‌گیری» (از فیلدهای smsStatus / smsSentAt روی MeasurementRequest)
// توجه: شماره‌ی موبایل و متن پیام جداگانه ذخیره نشده‌اند؛ شماره از اطلاعات فعلی مشتری و متن از روی
// قالب پیام ساخته می‌شود. برای «ثبت سفارش» فقط آخرین ارسال هر فاکتور نگه داشته می‌شود.

const READY_ACTION = "پیامک آماده تحویل"
const MAX_ROWS = 800

type ReportRow = {
  id: string
  type: "order" | "ready" | "measurement"
  typeLabel: string
  customerName: string
  mobile: string | null
  orderNumber: string
  sentAt: string | null
  status: "SENT" | "FAILED" | "SENDING"
  statusLabel: string
  text: string
  note: string | null
}

const STATUS_LABEL: Record<ReportRow["status"], string> = {
  SENT: "ارسال‌شده",
  FAILED: "ناموفق",
  SENDING: "در حال ارسال",
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "ابتدا وارد سیستم شوید" }, { status: 401 })
    }

    const sp = new URL(req.url).searchParams
    const type = sp.get("type") || "all" // all | order | ready | measurement
    const statusParam = sp.get("status") || "all" // all | SENT | FAILED

    const fromRaw = sp.get("from")
    const toRaw = sp.get("to")
    const from = fromRaw ? new Date(fromRaw) : null
    const to = toRaw ? new Date(toRaw) : null
    const range: { gte?: Date; lte?: Date } = {}
    if (from && !isNaN(from.getTime())) range.gte = from
    if (to && !isNaN(to.getTime())) range.lte = to
    const hasRange = Object.keys(range).length > 0

    const orderStatuses =
      statusParam === "SENT"
        ? ["SENT"]
        : statusParam === "FAILED"
          ? ["FAILED"]
          : ["SENT", "FAILED", "SENDING"]
    const historyStatuses =
      statusParam === "SENT"
        ? ["ارسال شد"]
        : statusParam === "FAILED"
          ? ["ناموفق"]
          : ["ارسال شد", "ناموفق", "در حال ارسال"]

    // شماره‌ی موبایل مشتری (با حافظه‌ی موقت تا برای هر مشتری یک‌بار حساب شود)
    const mobileCache = new Map<string, string | null>()
    const resolveMobile = async (customer: any): Promise<string | null> => {
      if (!customer) return null
      const key = String(customer.id)
      if (mobileCache.has(key)) return mobileCache.get(key) ?? null
      let mobile = normalizeIranMobile(pickCustomerPhone(customer))
      if (!mobile && customer.name) {
        const others = await prisma.customer.findMany({
          where: { id: { not: customer.id }, name: customer.name },
        })
        for (const o of others) {
          const m = normalizeIranMobile(pickCustomerPhone(o))
          if (m) {
            mobile = m
            break
          }
        }
      }
      mobileCache.set(key, mobile)
      return mobile
    }

    const rows: ReportRow[] = []

    // ── پیام «ثبت سفارش» ──
    if (type === "all" || type === "order") {
      const where: any = { smsStatus: { in: orderStatuses } }
      if (hasRange) {
        // ارسال موفق تاریخ دقیق دارد (smsSentAt)؛ ناموفق‌ها تاریخ ندارند و به‌جایش آخرین ویرایش (updatedAt) ملاک است
        where.OR = [{ smsSentAt: range }, { smsSentAt: null, updatedAt: range }]
      }
      const orders = await prisma.order.findMany({
        where,
        include: { customer: true },
        orderBy: { updatedAt: "desc" },
        take: MAX_ROWS,
      })
      for (const o of orders as any[]) {
        const st = (o.smsStatus as ReportRow["status"]) || "FAILED"
        const sentAt: Date | null = o.smsSentAt || o.updatedAt || null
        // منبع ارسال (خودکار هنگام تبدیل به فاکتور / دستی از صفحه‌ی فاکتورها)
        const sourceLabel =
          o.smsSource === "manual"
            ? `ارسال دستی${o.smsBy ? " — " + o.smsBy : ""}`
            : o.smsSource === "auto"
              ? "ارسال خودکار"
              : null
        rows.push({
          id: `order-${o.id}`,
          type: "order",
          typeLabel: "ثبت سفارش",
          customerName: o.customer?.name || "—",
          mobile: await resolveMobile(o.customer),
          orderNumber: o.orderNumber,
          sentAt: sentAt ? sentAt.toISOString() : null,
          status: st,
          statusLabel: STATUS_LABEL[st] || String(st),
          text: buildOrderSms(o.customer?.name || "", o.orderNumber, orderPublicLink(o.id)),
          note:
            st === "FAILED"
              ? [sourceLabel, o.smsError].filter(Boolean).join(" — ") || null
              : sourceLabel,
        })
      }
    }

    // ── پیام «آماده تحویل» ──
    if (type === "all" || type === "ready") {
      const hist = await prisma.productionHistory.findMany({
        where: {
          action: READY_ACTION,
          newStatus: { in: historyStatuses },
          ...(hasRange ? { createdAt: range } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: MAX_ROWS,
      })
      const poIds = Array.from(
        new Set(hist.map((h) => h.productionOrderId).filter((x): x is string => !!x))
      )
      const pos: any[] = poIds.length
        ? await prisma.productionOrder.findMany({
            where: { id: { in: poIds } },
            include: { order: { include: { customer: true } } },
          })
        : []
      const poMap = new Map<string, any>(pos.map((p) => [p.id, p]))

      for (const h of hist) {
        const po = h.productionOrderId ? poMap.get(h.productionOrderId) : null
        const customer = po?.order?.customer
        const orderNumber = po?.order?.orderNumber || "—"
        const st: ReportRow["status"] =
          h.newStatus === "ارسال شد" ? "SENT" : h.newStatus === "ناموفق" ? "FAILED" : "SENDING"
        const desc = h.description || ""
        let note: string | null = null
        if (st === "FAILED") note = desc || null
        else if (desc.includes("دستی")) note = `ارسال دستی${h.operatorName ? " — " + h.operatorName : ""}`
        else if (desc.includes("خودکار")) note = "ارسال خودکار"
        rows.push({
          id: `ready-${h.id}`,
          type: "ready",
          typeLabel: "آماده تحویل",
          customerName: customer?.name || "—",
          mobile: await resolveMobile(customer),
          orderNumber,
          sentAt: h.createdAt.toISOString(),
          status: st,
          statusLabel: STATUS_LABEL[st],
          text: buildReadyForDeliverySms(
            customer?.name || "",
            orderNumber,
            h.productionOrderId ? exitPublicLink(h.productionOrderId) : null
          ),
          note,
        })
      }
    }

    // ── پیام «ثبت اندازه‌گیری» ──
    if (type === "all" || type === "measurement") {
      const statuses =
        statusParam === "SENT"
          ? ["SENT"]
          : statusParam === "FAILED"
            ? ["FAILED"]
            : ["SENT", "FAILED"]
      const where: any = { smsStatus: { in: statuses } }
      if (hasRange) {
        where.OR = [{ smsSentAt: range }, { smsSentAt: null, updatedAt: range }]
      }
      const requests = await prisma.measurementRequest.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: MAX_ROWS,
      })
      for (const m of requests) {
        const st: ReportRow["status"] = m.smsStatus === "SENT" ? "SENT" : "FAILED"
        // اولین شمارهٔ موبایل معتبرِ ثبت‌شده
        let mobile: string | null = null
        try {
          const arr = JSON.parse(m.phones || "[]")
          for (const p of Array.isArray(arr) ? arr : []) {
            const mm = normalizeIranMobile(String(p))
            if (mm) {
              mobile = mm
              break
            }
          }
        } catch {}
        const sentAt: Date | null = m.smsSentAt || m.updatedAt || m.createdAt
        rows.push({
          id: `measurement-${m.id}`,
          type: "measurement",
          typeLabel: "ثبت اندازه‌گیری",
          customerName: m.customerName,
          mobile,
          orderNumber: m.measurementNumber,
          sentAt: sentAt ? sentAt.toISOString() : null,
          status: st,
          statusLabel: STATUS_LABEL[st],
          text: buildMeasurementSms(m.customerName, m.measurementNumber),
          note: "ارسال خودکار هنگام ثبت درخواست",
        })
      }
    }

    rows.sort((a, b) => (b.sentAt || "").localeCompare(a.sentAt || ""))
    const limited = rows.slice(0, MAX_ROWS)

    const summary = {
      total: limited.length,
      sent: limited.filter((r) => r.status === "SENT").length,
      failed: limited.filter((r) => r.status === "FAILED").length,
      order: limited.filter((r) => r.type === "order").length,
      ready: limited.filter((r) => r.type === "ready").length,
      measurement: limited.filter((r) => r.type === "measurement").length,
      truncated: rows.length > MAX_ROWS,
    }

    return NextResponse.json({ rows: limited, summary })
  } catch (error: any) {
    console.error("sms report error:", error)
    return NextResponse.json(
      { error: error?.message || "خطا در دریافت گزارش پیامک‌ها" },
      { status: 500 }
    )
  }
}