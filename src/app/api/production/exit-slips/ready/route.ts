import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { buildServicesText } from "@/lib/production/servicesText"

function norm(s: string) {
  return (s || "")
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function isReadyWh(name: string) {
  const n = norm(name)
  return n.includes("آماده تحویل") || n === norm("انبار محصول دو")
}

function isLoading(name: string) {
  return norm(name).includes("بارگیری")
}

/** پیدا کردن OrderItem — اول با id، بعد با نام کالا */
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

function pickServicesRaw(salesItem: any, prodItem: any): any {
  if (!salesItem && !prodItem) return null
  const candidates = [
    salesItem?.servicesData,
    salesItem?.services,
    salesItem?.serviceData,
    prodItem?.servicesData,
  ]
  for (const c of candidates) {
    if (c == null || c === "") continue
    if (typeof c === "string") {
      const t = c.trim()
      if (!t) continue
      return t
    }
    if (Array.isArray(c) && c.length) return c
    if (typeof c === "object") return c
  }
  return null
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
        if (!load) return true
        return load.status !== "تکمیل شده"
      })
      .map((row) => {
        const item = row.productionItem
        const order = item.productionOrder.order
        const salesItem = resolveSalesItem(order, item)
        const rawServices = pickServicesRaw(salesItem, item)
        const servicesText = buildServicesText(rawServices)

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
          servicesText: servicesText || null,
          notes: item.notes || (salesItem as any)?.notes || null,
          readyCompletedAt: row.completedAt,
        }
      })

    if (customer) {
      const q = norm(customer)
      items = items.filter((i) => norm(i.customerName).includes(q))
    }

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