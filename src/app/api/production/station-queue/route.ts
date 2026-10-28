import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

function norm(s: string) {
  return (s || "")
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function buildServicesText(servicesData: any): string {
  if (!servicesData) return ""
  try {
    const parsed =
      typeof servicesData === "string" ? JSON.parse(servicesData) : servicesData
    if (!Array.isArray(parsed)) return ""
    return parsed
      .map((s: any) =>
        typeof s === "string"
          ? s
          : s?.title || s?.name || s?.label || s?.serviceName || s?.service || ""
      )
      .filter(Boolean)
      .join(" + ")
  } catch {
    return ""
  }
}

function isCut(name: string) {
  return norm(name) === "برش"
}
function isSemiFinished(name: string) {
  const n = norm(name)
  return n.includes("نیمه") || n === norm("انبار محصول یک")
}
function isReadyWh(name: string) {
  const n = norm(name)
  return n.includes("آماده تحویل") || n === norm("انبار محصول دو")
}
function isLoading(name: string) {
  return norm(name).includes("بارگیری")
}

/** یادداشت رد گروهی از انبار نیمه‌ساخته (باید با scan/route.ts یکی باشد) */
const GROUP_PASS_NOTE = "رد گروهی از انبار کالای نیمه‌ساخته"

/** اولین ایستگاهِ بعدی که قطعه را رد کرده؛ تا وجود دارد، برگشت ممکن نیست */
function findPassedLaterStation(stations: any[], current: any) {
  return (
    stations.find((s: any) => {
      if (s.id === current.id) return false
      if ((s.sequence ?? 0) <= (current.sequence ?? 0)) return false
      if (s.notes === GROUP_PASS_NOTE) return false
      if (s.status === "تکمیل شده") return true
      if (s.status === "در حال انجام" && (s.quantityOut || 0) > 0) return true
      return false
    }) || null
  )
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

    // رد شده‌های اخیر همین ایستگاه که ایستگاه بعدی هنوز رد نکرده (قابل برگشت)
    let doneRows: typeof rows = []
    if (!isLoading(station.name)) {
      doneRows = await prisma.productionItemStation.findMany({
        where: {
          stationId,
          status: "تکمیل شده",
          completedAt: { not: null },
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
        orderBy: { completedAt: "desc" },
        take: 150,
      })
    }

    const filteredRows = rows.filter((row) => {
      const all = row.productionItem.stations
      const cut = all.find((s) => isCut(s.station.name))

      // برش: همیشه در صف تا رد شود
      if (isCut(station.name)) return true

      // بقیه: اگر قطعه ایستگاه برش دارد، فقط بعد از تکمیل برش نمایش داده می‌شود.
      // قطعه‌ی بدون ایستگاه برش (سفارش اجرتیِ بدون «اجرت برش») از همان ابتدا
      // در کارتابل ایستگاه‌های خودش (مثلاً دیاموند) دیده می‌شود.
      if (cut && cut.status !== "تکمیل شده") return false

      // انبار آماده تحویل: وقتی نیمه‌ساخته رد شده یا همه میانی‌ها تمام شده
      if (isReadyWh(station.name)) {
        const semi = all.find((s) => isSemiFinished(s.station.name))
        if (semi && semi.status === "تکمیل شده") return true
        const pendingMid = all.filter(
          (s) =>
            !isReadyWh(s.station.name) &&
            !isLoading(s.station.name) &&
            s.status !== "تکمیل شده"
        )
        return pendingMid.length === 0
      }

      // بارگیری: فقط بعد از انبار آماده تحویل
      if (isLoading(station.name)) {
        const ready = all.find((s) => isReadyWh(s.station.name))
        return !!ready && ready.status === "تکمیل شده"
      }

      // خدمات + انبار نیمه‌ساخته: بعد از برش (یا از ابتدا، اگر برش ندارد) هم‌زمان در صف
      return true
    })

    // تعداد قلم‌هایی که در همین ایستگاه برای هر سفارش تولیدی «رد شده‌اند»؛
    // برای نمایش «۳ قلم باقی‌مانده از ۵ قلم» در کارتابل
    const orderIds = Array.from(
      new Set(
        [...rows, ...doneRows].map((r) => r.productionItem.productionOrder.id)
      )
    )
    const doneByOrder = new Map<string, number>()
    if (orderIds.length > 0) {
      const doneAll = await prisma.productionItemStation.findMany({
        where: {
          stationId,
          status: "تکمیل شده",
          productionItem: { productionOrder: { id: { in: orderIds } } },
        },
        select: {
          productionItem: {
            select: { productionOrder: { select: { id: true } } },
          },
        },
      })
      for (const d of doneAll) {
        const oid = d.productionItem.productionOrder.id
        doneByOrder.set(oid, (doneByOrder.get(oid) || 0) + 1)
      }
    }

    /**
     * پیدا کردن قلم فروش مربوط به قطعه‌ی تولید.
     * اگر فاکتور بعد از ورود به تولید ویرایش شود، ممکن است قلم‌های فروش با شناسه‌ی جدید ساخته شوند و
     * orderItemId قدیمی دیگر پیدا نشود؛ در این حالت با نام کالا و ابعاد تطبیق می‌دهیم
     * تا «سختی کار» و توضیحات از بین نروند.
     */
    const matchSalesItem = (item: any, salesOrder: any) => {
      const list: any[] = salesOrder?.items || []
      const byId = list.find((si) => si.id === item.orderItemId)
      if (byId) return byId
      const nm = (v: any) => norm(String(v ?? ""))
      const siName = (si: any) => si.productName ?? si.name ?? si.product?.name
      const same = list.filter(
        (si) =>
          nm(siName(si)) === nm(item.productName) &&
          Number(si.length || 0) === Number(item.length || 0) &&
          Number(si.width || 0) === Number(item.width || 0)
      )
      if (same.length > 0) return same[0]
      const byName = list.filter((si) => nm(siName(si)) === nm(item.productName))
      return byName.length === 1 ? byName[0] : null
    }

    const buildItem = (row: (typeof rows)[number]) => {
      const item = row.productionItem
      const order = item.productionOrder
      const salesOrder = order.order
      const salesItem = matchSalesItem(item, salesOrder)

      return {
        id: row.id,
        sequence: row.sequence,
        status: row.status,
        quantityIn: row.quantityIn,
        quantityOut: row.quantityOut ?? 0,
        completedAt: row.completedAt ? row.completedAt.toISOString() : null,
        canUndo:
          !isLoading(station.name) &&
          !findPassedLaterStation(row.productionItem.stations, row),
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
          // روند کاری قطعه: همه‌ی ایستگاه‌های مسیر به‌ترتیب (برای دیدن در کارتابل انبارها)
          route: (item.stations || [])
            .slice()
            .sort((a: any, b: any) => (a.sequence ?? 0) - (b.sequence ?? 0))
            .map((s: any) => ({
              id: s.id,
              name: s.station?.name || "—",
              sequence: s.sequence ?? 0,
              status: s.status,
              quantityIn: s.quantityIn ?? null,
              quantityOut: s.quantityOut ?? 0,
              completedAt: s.completedAt ? s.completedAt.toISOString() : null,
              operatorId: s.operatorId || null,
            })),
          servicesText: buildServicesText(
            (salesItem as any)?.servicesData ?? null
          ),
          installationCode: (salesItem as any)?.installationCode || null,
          mapImageUrl: (salesOrder as any)?.mapImageUrl || null,
          mapImages: (salesOrder as any)?.mapImages || null,
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
            stationDoneItems: doneByOrder.get(order.id) || 0,
            order: {
              orderNumber: salesOrder?.orderNumber,
              customer: { name: salesOrder?.customer?.name || "—" },
            },
          },
        },
      }
    }

    const items = filteredRows.map(buildItem)

    const undoable = doneRows
      .filter((r) => r.notes !== GROUP_PASS_NOTE)
      .filter((r) => !findPassedLaterStation(r.productionItem.stations, r))
      .slice(0, 60)
      .map(buildItem)

    const totalMeterage = items.reduce(
      (sum, r) => sum + (Number(r.productionItem.meterage) || 0),
      0
    )
    const totalQuantity = items.reduce(
      (sum, r) => sum + (r.quantityIn ?? r.productionItem.quantity ?? 0),
      0
    )

    return NextResponse.json({
      items,
      undoable,
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