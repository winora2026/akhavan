import { prisma } from "@/lib/prisma"

function norm(s: string) {
  return (s || "")
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

/**
 * نگاشت نام خدمت فروش → نام ایستگاه تولید
 * ترتیب ifها مهم است (مته CNC قبل از مته عمومی)
 */
function mapServiceToStation(serviceName: string): string | null {
  const name = norm(serviceName)
  if (!name) return null

  if (
    name.includes("بسته") ||
    name.includes("پکیج") ||
    name.includes("پکيج") ||
    name.includes("pack")
  ) {
    return "بسته بندی"
  }

  // تراش الگویی قبل از تراش
  if (name.includes("تراش الگویی") || name.includes("الگویی")) {
    return "تراش الگویی"
  }
  // تراش عادی → بعداً هم تراش ۱ و هم تراش ۲ در مسیر گذاشته می‌شود
  if (name.includes("تراش")) return "تراش"

  if (name.includes("دیاموند زاویه") || (name.includes("دیاموند") && name.includes("زاویه"))) {
    return "دیاموند زاویه"
  }
  if (name.includes("دیاموند")) return "دیاموند"

  if (name.includes("لول براق") || (name.includes("لول") && name.includes("براق"))) {
    return "لول براق"
  }
  if (name.includes("لول")) return "لول معمولی"

  if (name.includes("لیمینت") || name.includes("لمینت")) return "لیمینت"
  if (name.includes("دوجداره") || name.includes("دو جداره")) return "دوجداره"

  // CNC: اینگریو، مته CNC، جاساز CNC، هر چیزی با CNC
  if (
    name.includes("اینگرو") ||
    name.includes("اینگریو") ||
    name.includes("انگرو") ||
    name.includes("cnc") ||
    name.includes("سی ان سی")
  ) {
    return "CNC"
  }

  // مته عمومی / سوراخکاری (بعد از مته CNC چک می‌شود)
  if (name.includes("مته") || name.includes("سوراخ")) return "سوراخکاری"

  // UV
  if (
    name.includes("uv") ||
    name.includes("یووی") ||
    name.includes("یو وی") ||
    name.includes("یو-وی")
  ) {
    return "UV"
  }

  if (name.includes("led") || name.includes("ال ای دی") || name.includes("ال‌ای‌دی")) {
    return "LED"
  }
  if (name.includes("mdf")) return "MDF"
  if (name.includes("سندبلاست") || name.includes("سند بلاست")) return "سندبلاست"
  if (name.includes("سکوریت") || name.includes("تمپر")) return "سکوریت"

  // چاپ (رنگ‌کاری)
  if (name.includes("چاپ") || name.includes("رنگ")) return "چاپ (رنگ‌کاری)"

  if (name.includes("قاب")) return "قاب"
  if (name.includes("خم")) return "خم‌کاری"

  if (name.includes("شست")) return "شست و شو"
  if (name.includes("بارگیری")) return "بارگیری"

  return null
}

function collectServiceNames(salesItem: any): string[] {
  const names: string[] = []
  if (salesItem?.servicesData) {
    try {
      const parsed =
        typeof salesItem.servicesData === "string"
          ? JSON.parse(salesItem.servicesData)
          : salesItem.servicesData
      if (Array.isArray(parsed)) {
        for (const s of parsed) {
          const n = s.title || s.name || ""
          if (n) names.push(String(n))
        }
      }
    } catch {}
  }
  return names
}

function buildRouteStationNames(salesItem: any): string[] {
  const route: string[] = ["برش"]
  const serviceStationSet = new Set<string>()
  let hasPackaging = false

  const serviceNames = collectServiceNames(salesItem)
  const extraText = [
    salesItem?.notes,
    salesItem?.description,
    salesItem?.productName,
  ]
    .filter(Boolean)
    .map(String)

  for (const serviceName of [...serviceNames, ...extraText]) {
    const mapped = mapServiceToStation(serviceName)
    if (!mapped) continue
    if (mapped === "بسته بندی") {
      hasPackaging = true
      continue
    }
    if (mapped === "شست و شو" || mapped === "بارگیری") continue
    serviceStationSet.add(mapped)
  }

  // ترتیب نمایش/مسیر خدمات میانی
  const preferredOrder = [
    "تراش الگویی",
    "دیاموند",
    "دیاموند زاویه",
    "لول معمولی",
    "لول براق",
    "CNC",
    "UV",
    "سوراخکاری",
    "سندبلاست",
    "چاپ (رنگ‌کاری)",
    "قاب",
    "خم‌کاری",
    "LED",
    "MDF",
    "لیمینت",
    "دوجداره",
    "سکوریت",
  ]

  // تراش → هر دو دستگاه
  if (serviceStationSet.has("تراش")) {
    route.push("تراش ۱")
    route.push("تراش ۲")
  }

  for (const name of preferredOrder) {
    if (serviceStationSet.has(name)) route.push(name)
  }

  route.push("شست و شو")
  if (hasPackaging) route.push("بسته بندی")
  route.push("انبار کالای نیمه‌ساخته")
  route.push("انبار آماده تحویل")
  route.push("بارگیری")
  return route
}

async function getNextBarcode(): Promise<string> {
  const last = await prisma.productionItem.findMany({
    where: { barcode: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { barcode: true },
  })
  let maxNum = 1050000
  for (const row of last) {
    const n = parseInt(row.barcode || "", 10)
    if (!isNaN(n) && n > maxNum) maxNum = n
  }
  const total = await prisma.productionItem.count()
  return String(Math.max(maxNum + 1, 1050001 + total))
}

async function getNextProductionNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `PROD-${year}-`

  const rows = await prisma.productionOrder.findMany({
    where: { productionNumber: { startsWith: prefix } },
    select: { productionNumber: true },
  })

  let max = 0
  for (const row of rows) {
    const part = row.productionNumber.split("-").pop() || "0"
    const n = parseInt(part, 10)
    if (!isNaN(n) && n > max) max = n
  }

  return `${prefix}${String(max + 1).padStart(4, "0")}`
}

function findStationId(
  stations: { id: string; name: string }[],
  name: string
): string | null {
  const n = norm(name)
  const found = stations.find((s) => norm(s.name) === n)
  if (found) return found.id

  // سازگاری با نام‌های قدیمی
  if (n.includes("نیمه") || n === norm("انبار محصول یک")) {
    const s = stations.find(
      (x) =>
        norm(x.name).includes("نیمه") ||
        norm(x.name) === norm("انبار محصول یک")
    )
    if (s) return s.id
  }
  if (n.includes("آماده تحویل") || n === norm("انبار محصول دو")) {
    const s = stations.find(
      (x) =>
        norm(x.name).includes("آماده") ||
        norm(x.name) === norm("انبار محصول دو")
    )
    if (s) return s.id
  }
  if (n.includes("چاپ")) {
    const s = stations.find((x) => norm(x.name).includes("چاپ"))
    if (s) return s.id
  }
  if (n.includes("بسته")) {
    const pack = stations.find((s) => norm(s.name).includes("بسته"))
    if (pack) return pack.id
  }
  return null
}

export type CreateProductionResult =
  | { ok: true; data: any }
  | { ok: false; status: number; error: string }

export async function createProductionOrderFromSales(
  orderId: string
): Promise<CreateProductionResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      customer: true,
    },
  })

  if (!order) {
    return { ok: false, status: 404, error: "سفارش یافت نشد" }
  }

  if (order.status !== "فاکتور") {
    return {
      ok: false,
      status: 400,
      error: "فقط فاکتورهای نهایی شده قابل ارسال به تولید هستند",
    }
  }

  const existing = await prisma.productionOrder.findFirst({
    where: { orderId: order.id },
  })
  if (existing) {
    return {
      ok: false,
      status: 400,
      error: "این فاکتور قبلاً به تولید ارسال شده است",
    }
  }

  const allStations = await prisma.productionStation.findMany()
  const required = [
    "برش",
    "شست و شو",
    "انبار کالای نیمه‌ساخته",
    "انبار آماده تحویل",
    "بارگیری",
  ]
  for (const name of required) {
    if (!findStationId(allStations, name)) {
      return {
        ok: false,
        status: 400,
        error: `ایستگاه «${name}» تعریف نشده. ابتدا seed ایستگاه‌ها را اجرا کنید.`,
      }
    }
  }

  const productionNumber = await getNextProductionNumber()

  const productionOrder = await prisma.productionOrder.create({
    data: {
      orderId: order.id,
      productionNumber,
      status: "در انتظار",
      priority: order.priority || "عادی",
      notes: order.notes,
    },
  })

  for (const item of order.items) {
    const barcode = await getNextBarcode()
    await prisma.productionItem.create({
      data: {
        productionOrderId: productionOrder.id,
        orderItemId: item.id,
        productName: item.productName,
        length: item.length,
        width: item.width,
        quantity: item.quantity,
        meterage: item.meterage,
        status: "در انتظار",
        barcode,
      },
    })
  }

  const productionItems = await prisma.productionItem.findMany({
    where: { productionOrderId: productionOrder.id },
  })

  for (const prodItem of productionItems) {
    const salesItem = order.items.find((i) => i.id === prodItem.orderItemId)
    if (!salesItem) continue

    const routeStationNames = buildRouteStationNames(salesItem)
    let sequence = 1
    for (const stationName of routeStationNames) {
      const stationId = findStationId(allStations, stationName)
      if (!stationId) continue
      await prisma.productionItemStation.create({
        data: {
          productionItemId: prodItem.id,
          stationId,
          sequence,
          status: "در انتظار",
          quantityIn: prodItem.quantity,
        },
      })
      sequence++
    }
  }

  await prisma.productionHistory.create({
    data: {
      productionOrderId: productionOrder.id,
      action: "ایجاد سفارش تولید",
      description: `سفارش تولید ${productionNumber} از فاکتور ${order.orderNumber} ایجاد شد`,
      newStatus: "در انتظار",
    },
  })

  const result = await prisma.productionOrder.findUnique({
    where: { id: productionOrder.id },
    include: {
      items: {
        include: {
          stations: {
            include: { station: true },
            orderBy: { sequence: "asc" },
          },
        },
      },
    },
  })

  return { ok: true, data: result }
}