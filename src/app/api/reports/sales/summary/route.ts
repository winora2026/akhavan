import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

function isPre(s: string) {
  const t = (s || "").trim()
  return t.includes("پیش") || t === "ثبت‌شده"
}

function isInv(s: string) {
  return (s || "").trim() === "فاکتور"
}

function isCancelled(s: string) {
  return (s || "").trim() === "لغو شده"
}

/** مبلغ دقیق: جمع totalPrice اقلام − تخفیف */
function orderAmount(o: {
  items: { totalPrice: number }[]
  discountAmount?: number | null
  extraAmount?: number | null
}) {
  const itemsSum = (o.items || []).reduce(
    (a, i) => a + (Number(i.totalPrice) || 0),
    0
  )
  const discount = Number(o.discountAmount) || 0
  const extra = Number((o as any).extraAmount) || 0
  return itemsSum - discount + extra
}

function expertKey(name: string | null | undefined) {
  const n = (name || "").trim()
  return n || "بدون کارشناس"
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const from = sp.get("from")
    const to = sp.get("to")
    const fromDate = from ? new Date(from) : null
    const toDate = to ? new Date(to) : null
    if (toDate) toDate.setHours(23, 59, 59, 999)

    const select = {
      id: true,
      status: true,
      orderDate: true,
      createdAt: true,
      invoicedAt: true,
      cancelledAt: true,
      totalMeterage: true,
      totalQuantity: true,
      discountAmount: true,
      extraAmount: true,
      salesRep: true,
      convertedBy: true,
      cancelledBy: true,
      notes: true,
      items: { select: { totalPrice: true } },
    } as const

    // پیش‌فاکتور: تاریخ سفارش در بازه
    const preorders = await prisma.order.findMany({
      where: {
        status: { in: ["پیش‌فاکتور", "پیش فاکتور", "ثبت‌شده"] },
        ...(fromDate || toDate
          ? {
              orderDate: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
      },
      select,
    })

    // فاکتور: ترجیح با invoicedAt در بازه؛ اگر null بود orderDate
    const invoices = await prisma.order.findMany({
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
      select,
    })

    // لغو شده در بازه (cancelledAt یا orderDate)
    const cancelled = await prisma.order.findMany({
      where: {
        status: "لغو شده",
        ...(fromDate || toDate
          ? {
              OR: [
                {
                  cancelledAt: {
                    ...(fromDate ? { gte: fromDate } : {}),
                    ...(toDate ? { lte: toDate } : {}),
                  },
                },
                {
                  cancelledAt: null,
                  orderDate: {
                    ...(fromDate ? { gte: fromDate } : {}),
                    ...(toDate ? { lte: toDate } : {}),
                  },
                },
              ],
            }
          : {}),
      },
      select,
    })

    const preCount = preorders.length
    const invCount = invoices.length
    const cancelledCount = cancelled.length

    const preAmount = preorders.reduce((s, o) => s + orderAmount(o), 0)
    const invAmount = invoices.reduce((s, o) => s + orderAmount(o), 0)
    const preMeterage = preorders.reduce(
      (s, o) => s + (Number(o.totalMeterage) || 0),
      0
    )
    const invMeterage = invoices.reduce(
      (s, o) => s + (Number(o.totalMeterage) || 0),
      0
    )

    // نرخ تبدیل: فاکتور / (پیش‌فاکتور + فاکتور) در بازه
    const conversionRate =
      preCount + invCount > 0
        ? Math.round((invCount / (preCount + invCount)) * 1000) / 10
        : 0

    // تفکیک کارشناس
    type Agg = {
      name: string
      preInvoiceCount: number
      preInvoiceAmount: number
      invoiceCount: number
      invoiceAmount: number
      conversionCount: number
      cancelledCount: number
      reOpenedCount: number
    }
    const map = new Map<string, Agg>()

    const ensure = (name: string | null | undefined) => {
      const k = expertKey(name)
      if (!map.has(k)) {
        map.set(k, {
          name: k,
          preInvoiceCount: 0,
          preInvoiceAmount: 0,
          invoiceCount: 0,
          invoiceAmount: 0,
          conversionCount: 0,
          cancelledCount: 0,
          reOpenedCount: 0,
        })
      }
      return map.get(k)!
    }

    for (const o of preorders) {
      const a = ensure(o.salesRep)
      a.preInvoiceCount += 1
      a.preInvoiceAmount += orderAmount(o)
    }

    for (const o of invoices) {
      // فاکتور به نام کسی که تبدیل کرده؛ اگر نبود salesRep
      const who = o.convertedBy || o.salesRep
      const a = ensure(who)
      a.invoiceCount += 1
      a.invoiceAmount += orderAmount(o)
      a.conversionCount += 1

      // برگشت مجدد تقریبی: در notes بازگردانی/برگشت دیده شود
      const notes = (o.notes || "").toLowerCase()
      if (
        notes.includes("بازگردانی") ||
        notes.includes("برگشت به پیش") ||
        notes.includes("مجدد")
      ) {
        a.reOpenedCount += 1
      }
    }

    for (const o of cancelled) {
      const who = o.cancelledBy || o.salesRep
      const a = ensure(who)
      a.cancelledCount += 1
    }

    const byExpert = Array.from(map.values()).sort(
      (a, b) => b.invoiceAmount - a.invoiceAmount
    )

    return NextResponse.json({
      preInvoiceCount: preCount,
      preInvoiceMeterage: Number(preMeterage.toFixed(4)),
      preInvoiceAmount: Math.round(preAmount),
      invoiceCount: invCount,
      invoiceMeterage: Number(invMeterage.toFixed(4)),
      invoiceAmount: Math.round(invAmount),
      conversionRatePercent: conversionRate,
      cancelledCount,
      byExpert,
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در گزارش فروش" },
      { status: 500 }
    )
  }
}