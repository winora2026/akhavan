import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { buildServicesText } from "@/lib/production/servicesText"
import { isRentalOrderNumber } from "@/lib/rentalOrder"

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

const itemInclude = {
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
}

// ایستگاه‌های هر قطعه به ترتیب مسیر (برای تشخیص «اولین ایستگاه»)
const itemIncludeWithStations = {
  ...itemInclude,
  stations: {
    include: { station: true },
    orderBy: { sequence: "asc" as const },
  },
}

// ایستگاهی که هنوز رد نشده است
const isStationOpen = (status: string) =>
  status === "در انتظار" || status === "در حال انجام"

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

    // ۱) قطعاتی که در ایستگاه برش منتظر یا در حال انجام هستند
    //    (برای سفارش اجرتیِ دارای «اجرت برش»، برش همان اولین ایستگاه است؛
    //     با رد شدن برش از این لیست خارج می‌شود)
    const rows = await prisma.productionItemStation.findMany({
      where: {
        stationId: cutStation.id,
        status: { in: ["در انتظار", "در حال انجام"] },
      },
      include: {
        productionItem: {
          include: itemInclude,
        },
      },
      orderBy: { createdAt: "asc" },
    })

    // ۲) قطعات سفارش‌های اجرتی که «اجرت برش» ندارند (ایستگاه برش ندارند):
    //    فقط برای چاپ لیبل نشان داده می‌شوند، نه برای برگه‌ی برنامه‌ریزی.
    //    تا وقتی اولین ایستگاهِ مسیرشان (مثلاً دیاموند) رد نشده در لیست می‌مانند.
    //    نکته: وضعیت قطعه‌ی تولید در API اسکن با نیم‌فاصله («تکمیل‌شده») ذخیره می‌شود،
    //    ولی وضعیت ایستگاه‌ها با فاصله («تکمیل شده») است؛ هر دو نوشتار حذف می‌شوند.
    const labelOnlyCandidates = await prisma.productionItem.findMany({
      where: {
        status: { notIn: ["تکمیل شده", "تکمیل‌شده"] },
        productionOrder: { order: { orderNumber: { startsWith: "9" } } },
        stations: { none: { stationId: cutStation.id } },
      },
      include: itemIncludeWithStations,
      orderBy: { createdAt: "asc" },
    })
    const labelOnlyItems = labelOnlyCandidates.filter((it: any) => {
      if (!isRentalOrderNumber(it.productionOrder?.order?.orderNumber)) {
        return false
      }
      const first = it.stations?.[0]
      return !!first && isStationOpen(first.status)
    })

    const rawDebug: any[] = []

    const toRow = (
      item: any,
      meta: {
        itemStationId: string
        itemStationStatus: string
        sequence: number
        labelOnly: boolean
      }
    ) => {
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
          labelOnly: meta.labelOnly,
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
        itemStationId: meta.itemStationId,
        itemStationStatus: meta.itemStationStatus,
        sequence: meta.sequence,
        labelOnly: meta.labelOnly,
        // سفارش اجرتی (سریال ۹۰۰xxx) — صفحه‌ی برنامه‌ریزی برش آن را در تب «اجرتی» نشان می‌دهد
        isRental: isRentalOrderNumber(salesOrder?.orderNumber),
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
    }

    const cutRows = rows.map((row) =>
      toRow(row.productionItem, {
        itemStationId: row.id,
        itemStationStatus: row.status,
        sequence: row.sequence,
        labelOnly: false,
      })
    )

    const labelOnlyRows = labelOnlyItems.map((item: any) =>
      toRow(item, {
        itemStationId: `label-only-${item.id}`,
        itemStationStatus: "فقط لیبل",
        sequence: 0,
        labelOnly: true,
      })
    )

    const result = [...cutRows, ...labelOnlyRows]

    const allNames = result.map((r) => r.productName)
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