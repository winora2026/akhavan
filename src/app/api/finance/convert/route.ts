import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function endOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
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

/** شماره فاکتور را برای مقایسه بازه‌ای عددی می‌کند */
function numOrder(n: string | null | undefined) {
  if (!n) return null
  const digits = String(n).replace(/[^\d]/g, "")
  if (!digits) return null
  const v = Number(digits)
  return isNaN(v) ? null : v
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
    // تاریخ مبنا: invoicedAt یا orderDate
    const dateField = searchParams.get("dateField") || "invoice" // invoice | order

    const where: any = {
      status: "فاکتور",
    }

    if (from || to) {
      const range: any = {}
      if (from) range.gte = startOfDay(new Date(from))
      if (to) range.lte = endOfDay(new Date(to))
      if (dateField === "order") where.orderDate = range
      else {
        // ترجیح با invoicedAt؛ اگر null باشد در فیلتر کلاینت‌ساید هم پوشش می‌دهیم
        where.OR = [
          { invoicedAt: range },
          { invoicedAt: null, orderDate: range },
        ]
      }
    }

    if (syncStatus === "SUCCESS" || syncStatus === "FAILED" || syncStatus === "PENDING") {
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
      orderBy: [{ invoicedAt: "desc" }, { orderDate: "desc" }, { orderNumber: "desc" }],
    })

    // فیلتر بازه شماره فاکتور
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