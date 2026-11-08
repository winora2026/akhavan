import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

/** هر Date/ISO → YYYY-MM-DD به وقت تهران */
function toTehranYmd(input: Date | string | null | undefined): string | null {
  if (!input) return null
  const d = input instanceof Date ? input : new Date(input)
  if (isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d) // YYYY-MM-DD
}

/** ورودی فیلتر (YYYY-MM-DD یا ISO) → YYYY-MM-DD */
function paramToYmd(input: string | null): string | null {
  if (!input) return null
  const m = String(input).trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return toTehranYmd(input)
}

function orderTotal(order: {
  items: { totalPrice: number }[]
  discountAmount?: number | null
  extraAmount?: number | null
}) {
  const sum = order.items.reduce((s, i) => s + (i.totalPrice || 0), 0)
  const discount = order.discountAmount || 0
  const extra = order.extraAmount || 0
  return Math.round(sum - discount + extra)
}

function numOrder(n: string | null | undefined) {
  if (!n) return null
  const digits = String(n).replace(/[^\d]/g, "")
  if (!digits) return null
  const v = Number(digits)
  return isNaN(v) ? null : v
}

/**
 * تاریخ مبنا برای فیلتر:
 * - dateField=order → orderDate
 * - dateField=invoice (پیش‌فرض) → invoicedAt وگرنه orderDate
 */
function effectiveYmd(
  o: { invoicedAt?: Date | null; orderDate?: Date | null },
  dateField: string
): string | null {
  if (dateField === "order") {
    return toTehranYmd(o.orderDate)
  }
  return toTehranYmd(o.invoicedAt) || toTehranYmd(o.orderDate)
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 })
    }
    if (
      session.role !== "finance" &&
      session.role !== "admin" &&
      session.role !== "sales"
    ) {
      return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const fromYmd = paramToYmd(searchParams.get("from"))
    const toYmd = paramToYmd(searchParams.get("to"))
    const fromNo = searchParams.get("fromNo")?.trim() || ""
    const toNo = searchParams.get("toNo")?.trim() || ""
    const q = (searchParams.get("q") || "").trim().toLowerCase()
    const syncStatus = searchParams.get("syncStatus") || "همه"
    const dateField = searchParams.get("dateField") || "invoice" // invoice | order

    const where: any = {
      status: "فاکتور",
    }

    if (
      syncStatus === "SUCCESS" ||
      syncStatus === "FAILED" ||
      syncStatus === "PENDING"
    ) {
      where.sepidarSyncStatus = syncStatus
    } else if (syncStatus === "NONE") {
      where.sepidarSyncStatus = null
    }

    let orders = await prisma.order.findMany({
      where,
      include: {
        customer: true,
        items: true,
      },
      orderBy: [
        { invoicedAt: "desc" },
        { orderDate: "desc" },
        { orderNumber: "desc" },
      ],
    })

    // فیلتر تاریخ: مقایسه رشته YYYY-MM-DD به وقت تهران (بدون جابه‌جایی روز)
    if (fromYmd || toYmd) {
      orders = orders.filter((o) => {
        const ymd = effectiveYmd(o, dateField)
        if (!ymd) return false
        if (fromYmd && ymd < fromYmd) return false
        if (toYmd && ymd > toYmd) return false
        return true
      })
    }

    const fromN = numOrder(fromNo)
    const toN = numOrder(toNo)
    if (fromN != null || toN != null) {
      orders = orders.filter((o) => {
        const n = numOrder(o.orderNumber)
        if (n == null) return false
        if (fromN != null && n < fromN) return false
        if (toN != null && n > toN) return false
        return true
      })
    }

    if (q) {
      orders = orders.filter((o) => {
        const name = (o.customer?.name || "").toLowerCase()
        const code = (o.customer?.customerCode || "").toLowerCase()
        const no = (o.orderNumber || "").toLowerCase()
        return name.includes(q) || code.includes(q) || no.includes(q)
      })
    }

    const items = orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      orderDate: o.orderDate,
      invoicedAt: o.invoicedAt,
      deliveryDate: o.deliveryDate,
      totalAmount: orderTotal(o),
      totalQuantity: o.totalQuantity,
      totalMeterage: o.totalMeterage,
      customerName: o.customer?.name || "—",
      customerCode: o.customer?.customerCode || null,
      customerId: o.customerId,
      salesRep: o.salesRep,
      convertedBy: o.convertedBy,
      sepidarSyncStatus: o.sepidarSyncStatus,
      sepidarInvoiceId: o.sepidarInvoiceId,
      sepidarSyncedAt: o.sepidarSyncedAt,
      sepidarSyncError: o.sepidarSyncError,
    }))

    return NextResponse.json({ items, count: items.length })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e.message || "خطا" }, { status: 500 })
  }
}