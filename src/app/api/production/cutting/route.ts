import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const productName = searchParams.get("productName")?.trim() || ""
    const labelStatus = searchParams.get("labelStatus") || "همه"
    const priority = searchParams.get("priority") || "همه"
    const search = searchParams.get("search")?.trim().toLowerCase() || ""

    const cutStation = await prisma.productionStation.findFirst({
      where: { name: "برش" },
    })

    if (!cutStation) {
      return NextResponse.json(
        { error: "ایستگاه برش تعریف نشده است" },
        { status: 400 }
      )
    }

    const rows = await prisma.productionItemStation.findMany({
      where: {
        stationId: cutStation.id,
        status: { in: ["در انتظار", "در حال انجام"] },
      },
      include: {
        productionItem: {
          include: {
            productionOrder: {
              include: {
                order: {
                  include: { customer: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    })

    let result = rows.map((row) => {
      const item = row.productionItem
      const order = item.productionOrder
      return {
        itemStationId: row.id,
        itemStationStatus: row.status,
        sequence: row.sequence,
        productionItemId: item.id,
        productName: item.productName,
        barcode: item.barcode,
        length: item.length,
        width: item.width,
        quantity: item.quantity,
        meterage: item.meterage,
        labelStatus: item.labelStatus || "چاپ‌نشده",
        labelPrintCount: item.labelPrintCount || 0,
        labelReprintAllowed: item.labelReprintAllowed || false,
        productionNumber: order.productionNumber,
        productionOrderId: order.id,
        priority: order.priority,
        orderNumber: order.order?.orderNumber,
        customerName: order.order?.customer?.name,
      }
    })

    if (productName) {
      result = result.filter((r) =>
        r.productName.toLowerCase().includes(productName.toLowerCase())
      )
    }

    if (labelStatus !== "همه") {
      result = result.filter((r) => r.labelStatus === labelStatus)
    }

    if (priority !== "همه") {
      result = result.filter((r) => r.priority === priority)
    }

    if (search) {
      result = result.filter(
        (r) =>
          r.customerName?.toLowerCase().includes(search) ||
          r.productionNumber?.toLowerCase().includes(search) ||
          r.orderNumber?.toLowerCase().includes(search) ||
          (r.barcode || "").toLowerCase().includes(search)
      )
    }

    const productNames = Array.from(
      new Set(result.map((r) => r.productName))
    ).sort()

    return NextResponse.json({ items: result, productNames })
  } catch (error: any) {
    console.error(error)
    return NextResponse.json(
      {
        error: "خطا در دریافت لیست برش",
        details: String(error?.message || error),
      },
      { status: 500 }
    )
  }
}