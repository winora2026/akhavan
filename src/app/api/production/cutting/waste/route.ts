import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { buildServicesText } from "@/lib/production/servicesText"

// تاریخچه‌ی ضایعات + وضعیت برش مجدد هرکدام
export async function GET() {
  try {
    const cutStation = await prisma.productionStation.findFirst({
      where: { name: "برش" },
    })
    const stations = await prisma.productionStation.findMany()
    const stationName = new Map(stations.map((s) => [s.id, s.name]))

    const wastes = await prisma.waste.findMany({
      orderBy: { createdAt: "desc" },
      take: 1000,
      include: {
        productionItem: {
          include: {
            stations: true,
            productionOrder: {
              include: {
                order: { include: { customer: true, items: true } },
              },
            },
          },
        },
      },
    })

    // بارکد آیتم‌های جدیدِ برش مجدد
    const recutIds = wastes
      .map((w) => (w as any).recutItemId)
      .filter(Boolean) as string[]
    const recutItems = recutIds.length
      ? await prisma.productionItem.findMany({
          where: { id: { in: recutIds } },
          select: { id: true, barcode: true },
        })
      : []
    const recutBarcode = new Map(recutItems.map((r) => [r.id, r.barcode]))

    const items = wastes.map((w) => {
      const item = w.productionItem
      const order = item.productionOrder
      const salesOrder = order.order
      const salesItem =
        salesOrder?.items?.find((si) => si.id === item.orderItemId) || null

      // اگر آیتم هنوز در صف برش است، یعنی فقط لیبلش خراب شده؛ برش مجدد لازم نیست
      const inCuttingQueue = item.stations.some(
        (s) =>
          s.stationId === cutStation?.id &&
          ["در انتظار", "در حال انجام"].includes(s.status)
      )

      return {
        wasteId: w.id,
        createdAt: w.createdAt.toISOString(),
        quantity: w.quantity,
        reason: w.reason,
        notes: w.notes,
        stationName: w.stationId ? stationName.get(w.stationId) || null : null,
        isReworked: w.isReworked,
        recutBarcode: (w as any).recutItemId
          ? recutBarcode.get((w as any).recutItemId) || null
          : null,
        inCuttingQueue,
        productionItemId: item.id,
        productName: item.productName,
        barcode: item.barcode,
        length: item.length,
        width: item.width,
        orderNumber: salesOrder?.orderNumber,
        customerName: salesOrder?.customer?.name,
        servicesText: buildServicesText((salesItem as any)?.servicesData ?? null),
      }
    })

    const productNames = Array.from(
      new Set(items.map((i) => i.productName))
    ).sort()

    return NextResponse.json({ items, productNames })
  } catch (error: any) {
    console.error(error)
    return NextResponse.json(
      {
        error: "خطا در دریافت تاریخچه ضایعات",
        details: String(error?.message || error),
      },
      { status: 500 }
    )
  }
}
