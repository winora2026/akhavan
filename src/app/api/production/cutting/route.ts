import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { buildServicesText } from "@/lib/production/servicesText"

/** پیدا کردن OrderItem متناظر — اول با id، بعد با نام کالا */
function resolveSalesItem(
  salesOrder: any,
  item: { orderItemId?: string | null; productName?: string | null }
) {
  const items = salesOrder?.items
  if (!Array.isArray(items) || items.length === 0) return null

  if (item.orderItemId) {
    const byId = items.find((si: any) => si.id === item.orderItemId)
    if (byId) return byId
  }

  const name = (item.productName || "").trim()
  if (name) {
    const matches = items.filter(
      (si: any) => (si.productName || "").trim() === name
    )
    if (matches.length === 1) return matches[0]
    // اگر چند تا هم‌نام بود، اولی که servicesData دارد
    const withSvc = matches.find((si: any) => {
      const s = si.servicesData
      if (!s) return false
      if (typeof s === "string") return s.trim().length > 2
      if (Array.isArray(s)) return s.length > 0
      return true
    })
    if (withSvc) return withSvc
    if (matches.length) return matches[0]
  }

  return null
}

/** چند جای رایج ذخیره خدمات را امتحان می‌کند */
function pickServicesRaw(salesItem: any, prodItem: any): any {
  if (!salesItem && !prodItem) return null
  const candidates = [
    salesItem?.servicesData,
    salesItem?.services,
    salesItem?.serviceData,
    prodItem?.servicesData,
    prodItem?.notes, // گاهی اشتباهی JSON در notes مانده
  ]
  for (const c of candidates) {
    if (c == null || c === "") continue
    if (typeof c === "string") {
      const t = c.trim()
      if (!t) continue
      // اگر شبیه JSON خدمت است
      if (t.startsWith("[") || t.startsWith("{")) return t
    } else if (Array.isArray(c) && c.length) {
      return c
    } else if (typeof c === "object") {
      return c
    }
  }
  // servicesData خالی نباشد
  if (salesItem?.servicesData != null && salesItem.servicesData !== "") {
    return salesItem.servicesData
  }
  return null
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const debug = searchParams.get("debug") === "1"

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

    const rawDebug: any[] = []

    const result = rows.map((row) => {
      const item = row.productionItem
      const order = item.productionOrder
      const salesOrder = order.order
      const salesItem = resolveSalesItem(salesOrder, item)

      const rawServices = pickServicesRaw(salesItem, item)
      const servicesText = buildServicesText(rawServices)

      if (debug) {
        rawDebug.push({
          productionItemId: item.id,
          orderNumber: salesOrder?.orderNumber,
          productName: item.productName,
          orderItemId: item.orderItemId,
          salesItemFound: !!salesItem,
          salesItemId: salesItem?.id ?? null,
          rawServices,
          servicesText,
          allItemsServices: (salesOrder?.items || []).map((si: any) => ({
            id: si.id,
            productName: si.productName,
            hasServicesData: si.servicesData != null && si.servicesData !== "",
            servicesDataType: typeof si.servicesData,
            servicesDataPreview:
              typeof si.servicesData === "string"
                ? si.servicesData.slice(0, 120)
                : si.servicesData,
          })),
        })
      }

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
        recutNumber: (item as any).recutNumber ?? 0,
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

    const allNames = rows.map((r) => r.productionItem.productName)
    const productNames = Array.from(new Set(allNames)).sort()

    return NextResponse.json({
      items: result,
      productNames,
      ...(debug ? { debug: rawDebug } : {}),
    })
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