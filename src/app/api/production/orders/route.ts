import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// نگاشت خدمت فروش → نام ایستگاه تولید
function mapServiceToStation(serviceName: string): string | null {
  const name = (serviceName || "").trim().toLowerCase()

  if (!name) return null

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

  return null
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
    return NextResponse.json({ error: "خطا در دریافت لیست تولید" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { orderId } = body

    if (!orderId) {
      return NextResponse.json({ error: "شناسه سفارش الزامی است" }, { status: 400 })
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

    const count = await prisma.productionOrder.count()
    const productionNumber = `PROD-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`

    // ساخت سفارش تولید
    const productionOrder = await prisma.productionOrder.create({
      data: {
        orderId: order.id,
        productionNumber,
        status: "در انتظار",
        priority: order.priority || "عادی",
        notes: order.notes,
      },
    })

    // ساخت اقلام + بارکد یکتا برای هر قلم
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

    // تعیین مسیر خودکار برای هر قلم
    for (const prodItem of productionItems) {
      const salesItem = order.items.find((i) => i.id === prodItem.orderItemId)
      if (!salesItem) continue

      const routeStationNames: string[] = []

      // 1. همیشه اول: برش
      routeStationNames.push("برش")

      // 2. ایستگاه‌های تخصصی
      const serviceStationSet = new Set<string>()

      for (const itemService of (salesItem as any).services || []) {
        const serviceName = itemService.service?.name || ""
        const mapped = mapServiceToStation(serviceName)
        if (mapped) serviceStationSet.add(mapped)
      }

      if ((salesItem as any).servicesData) {
        try {
          const parsed = JSON.parse((salesItem as any).servicesData)
          if (Array.isArray(parsed)) {
            for (const s of parsed) {
              const serviceName = s.title || s.name || ""
              const mapped = mapServiceToStation(serviceName)
              if (mapped) serviceStationSet.add(mapped)
            }
          }
        } catch (e) {
          console.error("خطا در خواندن servicesData:", e)
        }
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
        if (serviceStationSet.has(name)) {
          routeStationNames.push(name)
        }
      }

      // 3. ایستگاه‌های ثابت انتهایی
      routeStationNames.push("شست و شو")
      routeStationNames.push("بسته‌بندی")
      routeStationNames.push("بارگیری")

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
        description: `سفارش تولید ${productionNumber} از فاکتور ${order.orderNumber} ایجاد شد، بارکد و مسیر ایستگاه‌ها خودکار تعیین گردید`,
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
    return NextResponse.json({ error: "خطا در ایجاد سفارش تولید" }, { status: 500 })
  }
}