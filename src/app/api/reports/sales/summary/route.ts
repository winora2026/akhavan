import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const from = sp.get("from")
    const to = sp.get("to")
    const fromDate = from ? new Date(from) : null
    const toDate = to ? new Date(to) : null
    if (toDate) toDate.setHours(23, 59, 59, 999)

    // پیش‌فاکتورهای صادرشده در بازه (بر اساس orderDate یا createdAt)
    const preWhere: any = {
      status: { in: ["پیش‌فاکتور", "پیش فاکتور", "ثبت‌شده"] },
    }
    const invWhere: any = { status: "فاکتور" }

    if (fromDate || toDate) {
      preWhere.orderDate = {}
      invWhere.OR = [
        { invoicedAt: {} as any },
        { orderDate: {} as any },
      ]
      if (fromDate) {
        preWhere.orderDate.gte = fromDate
        invWhere.OR[0].invoicedAt.gte = fromDate
        invWhere.OR[1].orderDate.gte = fromDate
      }
      if (toDate) {
        preWhere.orderDate.lte = toDate
        invWhere.OR[0].invoicedAt.lte = toDate
        invWhere.OR[1].orderDate.lte = toDate
      }
    }

    // ساده‌تر و پایدارتر:
    const allInRange = await prisma.order.findMany({
      where: {
        ...(fromDate || toDate
          ? {
              orderDate: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
      },
      select: {
        id: true,
        status: true,
        orderDate: true,
        invoicedAt: true,
        totalMeterage: true,
        totalQuantity: true,
        discountAmount: true,
        salesRep: true,
        convertedBy: true,
        items: { select: { totalPrice: true } },
      },
    })

    const isPre = (s: string) =>
      s.includes("پیش") || s === "ثبت‌شده"
    const isInv = (s: string) => s === "فاکتور"

    const preorders = allInRange.filter((o) => isPre(o.status))
    // فاکتورهایی که در بازه تبدیل شده‌اند (invoicedAt) یا orderDate در بازه و وضعیت فاکتور
    let invoices = await prisma.order.findMany({
      where: {
        status: "فاکتور",
        ...(fromDate || toDate
          ? {
              OR: [
                {
                  invoicedAt: {
                    ...(fromDate ? { gte: fromDate } : {}),
                    ...(toDate ? { lte: toDate } : {}),
                  },
                },
                {
                  invoicedAt: null,
                  orderDate: {
                    ...(fromDate ? { gte: fromDate } : {}),
                    ...(toDate ? { lte: toDate } : {}),
                  },
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        totalMeterage: true,
        totalQuantity: true,
        discountAmount: true,
        salesRep: true,
        convertedBy: true,
        items: { select: { totalPrice: true } },
      },
    })

    const sumPrice = (rows: { items: { totalPrice: number }[]; discountAmount: number | null }[]) =>
      rows.reduce((s, o) => {
        const t = o.items.reduce((a, i) => a + (i.totalPrice || 0), 0)
        return s + t - (o.discountAmount || 0)
      }, 0)

    const preCount = preorders.length
    const invCount = invoices.length
    const conversionRate =
      preCount + invCount > 0
        ? Math.round((invCount / (preCount + invCount)) * 1000) / 10
        : 0

    return NextResponse.json({
      preInvoiceCount: preCount,
      preInvoiceMeterage: Number(
        preorders.reduce((s, o) => s + (o.totalMeterage || 0), 0).toFixed(4)
      ),
      preInvoiceAmount: sumPrice(preorders as any),
      invoiceCount: invCount,
      invoiceMeterage: Number(
        invoices.reduce((s, o) => s + (o.totalMeterage || 0), 0).toFixed(4)
      ),
      invoiceAmount: sumPrice(invoices as any),
      conversionRatePercent: conversionRate,
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در گزارش فروش" },
      { status: 500 }
    )
  }
}