import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { buildServicesText } from "@/lib/production/servicesText"

// اگر سفارش‌های قدیمیِ بارگیری‌شده (از قبل از سیستم برگه‌ی خروج) در لیست «خروج‌نخورده»
// ظاهر می‌شوند، تاریخ شروع را اینجا بگذارید؛ فقط قطعاتی که انبار آماده تحویلشان
// از این تاریخ به بعد تکمیل شده نشان داده می‌شوند. مثال: "2026-10-01"
// مقدار null یعنی بدون محدودیت.
const SHOW_ITEMS_SINCE: string | null = null

// نرمال‌سازی جستجو: ي/ى → ی ، ك → ک ، ة → ه ، حذف اعراب و ارقام عربی/فارسی
function norm(s: string) {
  return (s || "")
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
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

function isClosed(status: string) {
  return status === "تکمیل شده" || status === "انجام در ایستگاه دیگر"
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

type Stage = "ready" | "loading" | "pending"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const customer = (searchParams.get("customer") || "").trim()

    const allStations = await prisma.productionStation.findMany()
    const readyIds = allStations
      .filter((s) => isReadyWh(s.name))
      .map((s) => s.id)

    if (readyIds.length === 0) {
      return NextResponse.json({
        items: [],
        customers: [],
        error: "ایستگاه انبار آماده تحویل تعریف نشده",
      })
    }
    const loadingIds = allStations.filter((s) => isLoading(s.name)).map((s) => s.id)

    // کل قطعات سفارش‌های در حال تولید؛ قطعاتِ رد‌نشده هم برای نمایش «چه مانده» لازم‌اند
    const includeShape = {
      stations: {
        include: { station: true },
        orderBy: { sequence: "asc" as const },
      },
      productionOrder: {
        include: {
          order: {
            include: { customer: true, items: true },
          },
        },
      },
    }
    const baseWhere = (customerName?: string) => ({
      productionOrder: {
        order: {
          status: "فاکتور",
          ...(customerName ? { customer: { name: customerName } } : {}),
        },
      },
    })

    let prodItems = await prisma.productionItem.findMany({
      where: baseWhere(customer || undefined),
      include: includeShape,
      orderBy: { createdAt: "asc" },
    })
    // اگر نام دقیقاً یکی نبود (ي/ك عربی)، فهرست کامل خوانده و با نرمال‌سازی فیلتر می‌شود
    if (customer && prodItems.length === 0) {
      prodItems = await prisma.productionItem.findMany({
        where: baseWhere(),
        include: includeShape,
        orderBy: { createdAt: "asc" },
      })
    }

    // «خارج‌شده» یعنی قلم در یک برگه‌ی خروج فعال (غیر ابطال) ثبت شده باشد
    const exitedRows = await prisma.exitSlipItem.findMany({
      where: {
        productionItemId: { in: prodItems.map((r) => r.id) },
        exitSlip: { status: { not: "ابطال" } },
      },
      select: { productionItemId: true },
    })
    const exitedIds = new Set(exitedRows.map((r) => r.productionItemId))

    const sinceTime = SHOW_ITEMS_SINCE
      ? new Date(SHOW_ITEMS_SINCE).getTime()
      : null

    const rows: {
      stage: Stage
      statusText: string
      currentStation: string | null
      canExit: boolean
      canTransfer: boolean
      readyCompletedAt: Date | null
      item: (typeof prodItems)[number]
      order: any
    }[] = []

    for (const item of prodItems) {
      if (exitedIds.has(item.id)) continue

      const order = item.productionOrder?.order
      const readyRow = item.stations.find((s) => readyIds.includes(s.stationId))
      const loadingRow =
        loadingIds.length > 0
          ? item.stations.find((s) => loadingIds.includes(s.stationId))
          : undefined
      const readyDone = readyRow?.status === "تکمیل شده"
      const loadingDone = loadingRow?.status === "تکمیل شده"
      const inLoading =
        !!loadingRow && (loadingRow.status === "در حال انجام" || loadingDone)

      const stage: Stage = inLoading ? "loading" : readyDone ? "ready" : "pending"
      const pendingStation =
        item.stations.find((s) => !isClosed(s.status))?.station?.name || null
      const statusText =
        stage === "loading"
          ? "در بارگیری"
          : stage === "ready"
            ? "آماده خروج"
            : pendingStation
              ? `در انتظار ${pendingStation}`
              : "در حال تولید"
      const readyCompletedAt = readyDone ? readyRow?.completedAt ?? null : null

      if (sinceTime && !isNaN(sinceTime) && stage !== "pending") {
        const t = readyCompletedAt ? new Date(readyCompletedAt).getTime() : 0
        if (t < sinceTime) continue
      }

      rows.push({
        stage,
        statusText,
        currentStation: pendingStation,
        canExit: stage !== "pending",
        canTransfer: stage === "ready",
        readyCompletedAt,
        item,
        order,
      })
    }

    // با انتخاب مشتری همه‌ی قطعاتش (به‌تفکیک وضعیت)؛ بدون مشتری فقط آماده/در بارگیری
    const visible = customer
      ? rows
      : rows.filter((r) => r.stage !== "pending")

    let items = visible.map((row) => {
      const { item, order } = row
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
        stage: row.stage,
        statusText: row.statusText,
        currentStation: row.currentStation,
        canExit: row.canExit,
        canTransfer: row.canTransfer,
        readyCompletedAt: row.readyCompletedAt,
      }
    })

    if (customer) {
      const q = norm(customer)
      items = items.filter((i) => norm(i.customerName).includes(q))
    }

    // مشتری‌ها از همه‌ی قطعات در حال تولید (حتی آن‌هایی که هنوز آماده نشده‌اند)
    const byCustomer = new Map<
      string,
      {
        name: string
        phone?: string | null
        id?: string | null
        ready: number
        total: number
      }
    >()
    if (!customer) {
      for (const r of rows) {
        const name = r.order?.customer?.name || "—"
        const c = byCustomer.get(name)
        if (c) {
          c.total += 1
          if (r.stage !== "pending") c.ready += 1
        } else {
          byCustomer.set(name, {
            name,
            phone: r.order?.customer?.phone,
            id: r.order?.customer?.id,
            ready: r.stage !== "pending" ? 1 : 0,
            total: 1,
          })
        }
      }
    }
    const customers = Array.from(byCustomer.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "fa")
    )

    // فقط مشتری‌هایی که قطعه‌ی آماده/در بارگیری دارند (برای کارتابل بارگیری)
    const readyCustomers = Array.from(
      new Map(
        rows
          .filter((r) => r.stage !== "pending")
          .map((r) => {
            const name = r.order?.customer?.name || "—"
            return [
              name,
              {
                name,
                phone: r.order?.customer?.phone,
                id: r.order?.customer?.id,
              },
            ] as const
          })
      ).values()
    ).sort((a, b) => a.name.localeCompare(b.name, "fa"))

    return NextResponse.json({ items, customers, readyCustomers })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: "خطا در دریافت اقلام آماده خروج", details: String(e?.message) },
      { status: 500 }
    )
  }
}
