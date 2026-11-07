import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

/** YYYY-MM-DD یا ISO → شروع همان روز به وقت تهران */
function dayStartTehran(input: string): Date | null {
  if (!input) return null
  const m = String(input).trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) {
    return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+03:30`)
  }
  const d = new Date(input)
  if (isNaN(d.getTime())) return null
  // از روی تقویم تهران همان روز را می‌گیریم
  const fa = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d) // YYYY-MM-DD
  return new Date(`${fa}T00:00:00+03:30`)
}

/** YYYY-MM-DD یا ISO → پایان همان روز به وقت تهران */
function dayEndTehran(input: string): Date | null {
  if (!input) return null
  const m = String(input).trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) {
    return new Date(`${m[1]}-${m[2]}-${m[3]}T23:59:59.999+03:30`)
  }
  const d = new Date(input)
  if (isNaN(d.getTime())) return null
  const fa = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
  return new Date(`${fa}T23:59:59.999+03:30`)
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

/** تاریخ مبنا برای فیلتر: فاکتور = invoicedAt وگرنه orderDate */
function effectiveDate(
  o: { invoicedAt?: Date | null; orderDate?: Date | null },
  dateField: string
): Date | null {
  if (dateField === "order") {
    return o.orderDate ? new Date(o.orderDate) : null
  }
  if (o.invoicedAt) return new Date(o.invoicedAt)
  if (o.orderDate) return new Date(o.orderDate)
  return null
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
    const from = searchParams.get("from")
    const to = searchParams.get("to")
    const fromNo = searchParams.get("fromNo")?.trim() || ""
    const toNo = searchParams.get("toNo")?.trim() || ""
    const q = (searchParams.get("q") || "").trim().toLowerCase()
    const syncStatus = searchParams.get("syncStatus") || "همه"
    const dateField = searchParams.get("dateField") || "invoice" // invoice | order

    const fromDate = from ? dayStartTehran(from) : null
    const toDate = to ? dayEndTehran(to) : null

    const where: any = {
      status: "فاکتور",
    }

    // فقط وضعیت همگام‌سازی را در Prisma فیلتر می‌کنیم
    // فیلتر تاریخ را بعد از خواندن با تاریخ مؤثر انجام می‌دهیم تا جابه‌جایی روز و null بودن invoicedAt درست شود
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

    // فیلتر تاریخ با مرز روز تهران
    if (fromDate || toDate) {
      orders = orders.filter((o) => {
        const d = effectiveDate(o, dateField)
        if (!d || isNaN(d.getTime())) return false
        if (fromDate && d < fromDate) return false
        if (toDate && d > toDate) return false
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