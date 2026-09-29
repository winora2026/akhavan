import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// استخراج عنوان خدمات از servicesData با فرمت‌های مختلف:
// آرایه‌ی آبجکت (title/name/serviceName/label)، آرایه‌ی رشته، آبجکت با کلید services/items،
// رشته‌ی JSON، و JSON دوبار encode شده
function serviceTitle(s: any): string {
  if (s == null) return ""
  if (typeof s === "string" || typeof s === "number") return String(s).trim()
  const t =
    s.title ||
    s.name ||
    s.serviceName ||
    s.label ||
    s.text ||
    s.service?.title ||
    s.service?.name ||
    ""
  return String(t).trim()
}

function buildServicesText(servicesData: any): string {
  if (!servicesData) return ""
  try {
    let parsed: any = servicesData
    if (typeof parsed === "string") parsed = JSON.parse(parsed)
    if (typeof parsed === "string") parsed = JSON.parse(parsed) // دوبار encode
    if (parsed && !Array.isArray(parsed) && typeof parsed === "object") {
      parsed = parsed.services ?? parsed.items ?? Object.values(parsed)
    }
    if (!Array.isArray(parsed)) return ""
    return parsed.map(serviceTitle).filter(Boolean).join(" + ")
  } catch {
    // اگر JSON نبود ولی متن ساده بود، همان را نشان بده
    return typeof servicesData === "string" ? servicesData.trim() : ""
  }
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

    // همه‌ی فیلترها سمت کلاینت انجام می‌شود؛ اینجا لیست کامل برگردانده می‌شود
    const result = rows.map((row) => {
      const item = row.productionItem
      const order = item.productionOrder
      const salesOrder = order.order
      const salesItem =
        salesOrder?.items?.find((si) => si.id === item.orderItemId) || null

      const rawServices = (salesItem as any)?.servicesData ?? null
      const servicesText = buildServicesText(rawServices)

      if (debug && rawDebug.length < 10) {
        rawDebug.push({
          productionItemId: item.id,
          orderItemId: item.orderItemId,
          salesItemFound: !!salesItem,
          rawServices,
          servicesText,
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