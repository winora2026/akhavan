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
      .map((s: any) => s.title || s.name)
      .filter(Boolean)
      .join(" + ")
  } catch {
    return ""
  }
}

function isReadyWh(name: string) {
  const n = norm(name)
  return n.includes("آماده تحویل") || n === norm("انبار محصول دو")
}
function isLoading(name: string) {
  return norm(name).includes("بارگیری")
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const customer = (searchParams.get("customer") || "").trim()

    const readyStations = await prisma.productionStation.findMany()
    const readyIds = readyStations
      .filter((s) => isReadyWh(s.name))
      .map((s) => s.id)
    const loadIds = readyStations
      .filter((s) => isLoading(s.name))
      .map((s) => s.id)

    if (readyIds.length === 0) {
      return NextResponse.json({
        items: [],
        error: "ایستگاه انبار آماده تحویل تعریف نشده",
      })
    }

    // اقلامی که انبار آماده تحویل‌شان تکمیل شده و بارگیری تمام نشده
    const rows = await prisma.productionItemStation.findMany({
      where: {
        stationId: { in: readyIds },
        status: "تکمیل شده",
      },
      include: {
        productionItem: {
          include: {
            stations: { include: { station: true } },
            productionOrder: {
              include: {
                order: {
                  include: { customer: true, items: true },
                },
              },
            },
          },
        },
      },
      orderBy: { completedAt: "asc" },
    })

    let items = rows
      .filter((row) => {
        const load = row.productionItem.stations.find((s) =>
          isLoading(s.station.name)
        )
        // اگر بارگیری در مسیر نیست، یا هنوز تکمیل نشده
        if (!load) return true
        return load.status !== "تکمیل شده"
      })
      .map((row) => {
        const item = row.productionItem
        const order = item.productionOrder.order
        const salesItem =
          order?.items?.find((si) => si.id === item.orderItemId) || null
        return {
          productionItemId: item.id,
          barcode: item.barcode,
          productName: item.productName,
          length: item.length,
          width: item.width,
          quantity: item.quantity,
          meterage: item.meterage,
          orderId: order?.id,
          orderNumber: order?.orderNumber,
          customerId: order?.customer?.id,
          customerName: order?.customer?.name || "—",
          customerPhone: order?.customer?.phone || null,
          installationCode: (salesItem as any)?.installationCode || null,
          servicesText: buildServicesText(
            (salesItem as any)?.servicesData ?? null
          ),
          notes: item.notes || (salesItem as any)?.notes || null,
          readyCompletedAt: row.completedAt,
        }
      })

    if (customer) {
      const q = norm(customer)
      items = items.filter((i) => norm(i.customerName).includes(q))
    }

    // گروه مشتری‌های متمایز برای سرچ
    const customers = Array.from(
      new Map(
        items.map((i) => [
          i.customerName,
          { name: i.customerName, phone: i.customerPhone, id: i.customerId },
        ])
      ).values()
    ).sort((a, b) => a.name.localeCompare(b.name, "fa"))

    return NextResponse.json({ items, customers })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: "خطا در دریافت اقلام آماده خروج", details: String(e?.message) },
      { status: 500 }
    )
  }
}