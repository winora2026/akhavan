import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

function buildServicesText(servicesData: any): string {
  if (!servicesData) return ""
  try {
    const parsed =
      typeof servicesData === "string" ? JSON.parse(servicesData) : servicesData
    if (!Array.isArray(parsed)) return ""
    return parsed
      .map((s: any) => s.title || s.name)
      .filter(Boolean)
      .join(" + ")
  } catch {
    return ""
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const stationId = searchParams.get("stationId") || ""

    if (!stationId) {
      return NextResponse.json(
        { error: "stationId الزامی است" },
        { status: 400 }
      )
    }

    const station = await prisma.productionStation.findUnique({
      where: { id: stationId },
    })
    if (!station) {
      return NextResponse.json({ error: "ایستگاه یافت نشد" }, { status: 404 })
    }

    const rows = await prisma.productionItemStation.findMany({
      where: {
        stationId,
        status: { in: ["در انتظار", "در حال انجام"] },
      },
      include: {
        station: true,
        productionItem: {
          include: {
            stations: {
              include: { station: true },
              orderBy: { sequence: "asc" },
            },
            productionOrder: {
              include: {
                order: {
                  include: {
                    customer: true,
                    items: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    })

    // بعد از برش: همه ایستگاه‌های باقی‌مانده هم‌زمان در صف باشند
    // فقط برای ایستگاه غیربرش: برش باید تکمیل شده باشد
    const filteredRows = rows.filter((row) => {
      if (station.name === "برش") return true
      const cut = row.productionItem.stations.find(
        (s) => s.station.name === "برش"
      )
      return cut && cut.status === "تکمیل شده"
    })

    const items = filteredRows.map((row) => {
      const item = row.productionItem
      const order = item.productionOrder
      const salesOrder = order.order
      const salesItem =
        salesOrder?.items?.find((si) => si.id === item.orderItemId) || null

      return {
        id: row.id,
        sequence: row.sequence,
        status: row.status,
        quantityIn: row.quantityIn,
        station: { id: row.station.id, name: row.station.name },
        productionItem: {
          id: item.id,
          productName: item.productName,
          length: item.length,
          width: item.width,
          quantity: item.quantity,
          meterage: item.meterage,
          status: item.status,
          barcode: item.barcode,
          notes: item.notes || (salesItem as any)?.notes || null,
          servicesText: buildServicesText(
            (salesItem as any)?.servicesData ?? null
          ),
          installationCode: (salesItem as any)?.installationCode || null,
          mapImageUrl: (salesOrder as any)?.mapImageUrl || null,
          orderDate: salesOrder?.orderDate
            ? salesOrder.orderDate.toISOString()
            : null,
          deliveryDate: salesOrder?.deliveryDate
            ? salesOrder.deliveryDate.toISOString()
            : null,
          productionOrder: {
            id: order.id,
            productionNumber: order.productionNumber,
            priority: order.priority,
            order: {
              orderNumber: salesOrder?.orderNumber,
              customer: { name: salesOrder?.customer?.name || "—" },
            },
          },
        },
      }
    })

    const totalMeterage = items.reduce(
      (sum, r) => sum + (Number(r.productionItem.meterage) || 0),
      0
    )
    const totalQuantity = items.reduce(
      (sum, r) =>
        sum + (r.quantityIn ?? r.productionItem.quantity ?? 0),
      0
    )

    return NextResponse.json({
      items,
      summary: {
        stationName: station.name,
        count: items.length,
        totalQuantity,
        totalMeterage: Number(totalMeterage.toFixed(4)),
      },
    })
  } catch (error: any) {
    console.error(error)
    return NextResponse.json(
      {
        error: "خطا در دریافت کارتابل",
        details: String(error?.message || error),
      },
      { status: 500 }
    )
  }
}