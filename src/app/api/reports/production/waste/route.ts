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

    const where: any = {}
    if (fromDate || toDate) {
      where.createdAt = {}
      if (fromDate) where.createdAt.gte = fromDate
      if (toDate) where.createdAt.lte = toDate
    }

    const wastes = await prisma.waste.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 2000,
      include: {
        productionItem: {
          include: {
            productionOrder: {
              include: {
                order: {
                  include: {
                    customer: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    const stations = await prisma.productionStation.findMany()
    const stationMap = new Map(stations.map((s) => [s.id, s.name]))

    const items = wastes.map((w) => {
      const item = w.productionItem
      const order = item.productionOrder?.order
      return {
        wasteId: w.id,
        createdAt: w.createdAt.toISOString(),
        quantity: w.quantity,
        reason: w.reason || "—",
        notes: w.notes || null,
        stationName: w.stationId ? stationMap.get(w.stationId) || "—" : "—",
        operatorId: w.operatorId || null,
        responsible:
          (w.notes && w.notes.includes("شخص:")
            ? w.notes
            : w.operatorId) || "—",
        productName: item.productName,
        barcode: item.barcode,
        length: item.length,
        width: item.width,
        orderNumber: order?.orderNumber || "—",
        customerName: order?.customer?.name || "—",
      }
    })

    const totalQty = items.reduce((s, i) => s + (i.quantity || 0), 0)

    return NextResponse.json({
      items,
      summary: { count: items.length, totalQuantity: totalQty },
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در گزارش ضایعات" },
      { status: 500 }
    )
  }
}