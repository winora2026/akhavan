import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

const normalizeText = (value: string) => {
  if (!value) return ""
  return value
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .trim()
}

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
    const productName = searchParams.get("productName")?.trim() || ""
    const labelStatus = searchParams.get("labelStatus") || "همه"
    const priority = searchParams.get("priority") || "همه"
    const search = searchParams.get("search")?.trim() || ""

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

    let result = rows.map((row) => {
      const item = row.productionItem
      const order = item.productionOrder
      const salesOrder = order.order
      const salesItem =
        salesOrder?.items?.find((si) => si.id === item.orderItemId) || null

      const servicesText = buildServicesText(
        (salesItem as any)?.servicesData ?? null
      )

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
        notes: item.notes || (salesItem as any)?.notes || null,
        servicesText,
        pieceNumber: (salesItem as any)?.pieceNumber ?? null,
        installationCode: (salesItem as any)?.installationCode ?? null,
        labelStatus: item.labelStatus || "چاپ‌نشده",
        labelPrintCount: item.labelPrintCount || 0,
        labelReprintAllowed: item.labelReprintAllowed || false,
        productionNumber: order.productionNumber,
        productionOrderId: order.id,
        priority: order.priority,
        orderNumber: salesOrder?.orderNumber,
        customerName: salesOrder?.customer?.name,
        orderDate: salesOrder?.orderDate
          ? salesOrder.orderDate.toISOString()
          : null,
        deliveryDate: salesOrder?.deliveryDate
          ? salesOrder.deliveryDate.toISOString()
          : null,
      }
    })

    if (productName) {
      const q = normalizeText(productName)
      result = result.filter((r) =>
        normalizeText(r.productName || "").includes(q)
      )
    }

    if (labelStatus !== "همه") {
      result = result.filter((r) => r.labelStatus === labelStatus)
    }

    if (priority !== "همه") {
      result = result.filter((r) => r.priority === priority)
    }

    if (search) {
      const q = normalizeText(search)
      result = result.filter(
        (r) =>
          normalizeText(r.customerName || "").includes(q) ||
          normalizeText(r.productionNumber || "").includes(q) ||
          normalizeText(r.orderNumber || "").includes(q) ||
          normalizeText(r.barcode || "").includes(q) ||
          normalizeText(r.productName || "").includes(q)
      )
    }

    // لیست نام کالاها از کل داده‌های ایستگاه برش (قبل از فیلتر نام) برای datalist
    const allNames = rows.map((r) => r.productionItem.productName)
    const productNames = Array.from(new Set(allNames)).sort()

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