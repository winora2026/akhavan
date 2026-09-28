import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// نگاشت خدمت فروش → نام ایستگاه تولید
function mapServiceToStation(serviceName: string): string | null {
  const name = (serviceName || "").trim().toLowerCase()

  if (!name) return null

  // بسته‌بندی فقط وقتی صراحتاً در خدمات باشد
  if (
    name.includes("بسته") ||
    name.includes("پکیج") ||
    name.includes("pack")
  ) {
    return "بسته‌بندی"
  }

  if (name.includes("تراش الگویی") || name.includes("الگویی")) return "تراش الگویی"
  if (name.includes("تراش")) return "تراش"
  if (name.includes("دیاموند زاویه") || name.includes("زاویه")) return "دیاموند زاویه"
  if (name.includes("دیاموند")) return "دیاموند"
  if (name.includes("لول براق") || name.includes("براق")) return "لول براق"
  if (name.includes("لول")) return "لول معمولی"
  if (name.includes("لیمینت") || name.includes("لمینت")) return "لیمینت"
  if (name.includes("دوجداره") || name.includes("دو جداره")) return "دوجداره"
  if (
    name.includes("cnc") ||
    name.includes("سی ان سی") ||
    name.includes("اینگرو") ||
    name.includes("اینگریو") ||
    name.includes("انگرو")
  ) {
    return "CNC"
  }
  if (name.includes("led") || name.includes("ال ای دی")) return "LED"
  if (name.includes("mdf")) return "MDF"
  if (name.includes("سندبلاست") || name.includes("سند بلاست")) return "سندبلاست"
  if (name.includes("سوراخ")) return "سوراخکاری"
  if (name.includes("سکوریت") || name.includes("تمپر")) return "سکوریت"
  if (name.includes("چاپ")) return "چاپ"
  if (name.includes("شست")) return "شست و شو"
  if (name.includes("بارگیری") || name.includes("بار گيری")) return "بارگیری"

  return null
}

function collectServiceNames(salesItem: any): string[] {
  const names: string[] = []

  for (const itemService of salesItem?.services || []) {
    const n = itemService?.service?.name
    if (n) names.push(String(n))
  }

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
    } catch (e) {
      console.error("خطا در خواندن servicesData:", e)
    }
  }

  return names
}

/** ساخت مسیر ایستگاه برای یک قلم */
function buildRouteStationNames(salesItem: any): string[] {
  const route: string[] = []

  // 1) همیشه اول: برش
  route.push("برش")

  // 2) ایستگاه‌های تخصصی فقط از خدمات سفارش
  const serviceStationSet = new Set<string>()
  let hasPackaging = false

  for (const serviceName of collectServiceNames(salesItem)) {
    const mapped = mapServiceToStation(serviceName)
    if (!mapped) continue
    if (mapped === "بسته‌بندی") {
      hasPackaging = true
      continue
    }
    // شست و شو / بارگیری را از خدمات جدا می‌گیریم تا ترتیب ثابت بماند
    if (mapped === "شست و شو" || mapped === "بارگیری") continue
    serviceStationSet.add(mapped)
  }

  const preferredOrder = [
    "تراش",
    "تراش الگویی",
    "دیاموند",
    "دیاموند زاویه",
    "لول معمولی",
    "لول براق",
    "CNC",
    "سوراخکاری",
    "سندبلاست",
    "چاپ",
    "LED",
    "MDF",
    "لیمینت",
    "دوجداره",
    "سکوریت",
  ]

  for (const name of preferredOrder) {
    if (serviceStationSet.has(name)) route.push(name)
  }

  // 3) همیشه: شست و شو
  route.push("شست و شو")

  // 4) بسته‌بندی فقط در صورت وجود خدمت/اجرت بسته‌بندی
  if (hasPackaging) {
    route.push("بسته‌بندی")
  }

  // 5) انبار محصول یک → انبار محصول دو
  // (تا وقتی ایستگاه‌های میانی در جریان‌اند، کار در انبار ۱ دیده می‌شود؛
  // بعد از اتمام مسیر میانی به انبار ۲ و در نهایت بارگیری می‌رود)
  route.push("انبار محصول یک")
  route.push("انبار محصول دو")

  // 6) همیشه آخر: بارگیری
  route.push("بارگیری")

  return route
}

// تولید بارکد عددی یکتا شبیه سپهر
async function getNextBarcode(): Promise<string> {
  const last = await prisma.productionItem.findMany({
    where: {
      barcode: { not: null },
    },
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
  const candidate = Math.max(maxNum + 1, 1050001 + total)

  return String(candidate)
}

export async function GET() {
  try {
    const productionOrders = await prisma.productionOrder.findMany({
      include: {
        order: {
          include: {
            customer: true,
          },
        },
        items: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json(productionOrders)
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: "خطا در دریافت لیست تولید" },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { orderId } = body

    if (!orderId) {
      return NextResponse.json(
        { error: "شناسه سفارش الزامی است" },
        { status: 400 }
      )
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            services: {
              include: {
                service: true,
              },
            },
          },
        },
        customer: true,
      },
    })

    if (!order) {
      return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 })
    }

    if (order.status !== "فاکتور") {
      return NextResponse.json(
        { error: "فقط فاکتورهای نهایی شده قابل ارسال به تولید هستند" },
        { status: 400 }
      )
    }

    const existing = await prisma.productionOrder.findFirst({
      where: { orderId: order.id },
    })

    if (existing) {
      return NextResponse.json(
        { error: "این فاکتور قبلاً به تولید ارسال شده است" },
        { status: 400 }
      )
    }

    const allStations = await prisma.productionStation.findMany()
    const stationByName = new Map(allStations.map((s) => [s.name, s]))
    const getStationId = (name: string) => stationByName.get(name)?.id

    // اطمینان از وجود ایستگاه‌های ضروری مسیر
    const requiredStations = [
      "برش",
      "شست و شو",
      "بسته‌بندی",
      "انبار محصول یک",
      "انبار محصول دو",
      "بارگیری",
    ]
    for (const name of requiredStations) {
      if (!stationByName.has(name)) {
        return NextResponse.json(
          {
            error: `ایستگاه «${name}» در سیستم تعریف نشده است. ابتدا seed ایستگاه‌ها را اجرا کنید.`,
          },
          { status: 400 }
        )
      }
    }

    const count = await prisma.productionOrder.count()
    const productionNumber = `PROD-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`

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
        const stationId = getStationId(stationName)
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
        description: `سفارش تولید ${productionNumber} از فاکتور ${order.orderNumber} ایجاد شد؛ مسیر: برش → خدمات سفارش → شست‌وشو → [بسته‌بندی در صورت نیاز] → انبار۱ → انبار۲ → بارگیری`,
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

    return NextResponse.json(result)
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: "خطا در ایجاد سفارش تولید" },
      { status: 500 }
    )
  }
}