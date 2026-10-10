import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { buildServicesText } from "@/lib/production/servicesText"

// تاریخچه‌ی ضایعات + وضعیت برش مجدد
export async function GET() {
  try {
    const cutStation = await prisma.productionStation.findFirst({
      where: { name: "برش" },
    })
    const stations = await prisma.productionStation.findMany()
    const stationName = new Map(stations.map((s) => [s.id, s.name]))

    const wastes = await prisma.waste.findMany({
      orderBy: { createdAt: "desc" },
      take: 1000,
      include: {
        productionItem: {
          include: {
            stations: true,
            productionOrder: {
              include: {
                order: { include: { customer: true, items: true } },
              },
            },
          },
        },
      },
    })

    const recutIds = wastes
      .map((w) => (w as any).recutItemId)
      .filter(Boolean) as string[]
    const recutItems = recutIds.length
      ? await prisma.productionItem.findMany({
          where: { id: { in: recutIds } },
          select: { id: true, barcode: true },
        })
      : []
    const recutBarcode = new Map(recutItems.map((r) => [r.id, r.barcode]))

    const items = wastes.map((w) => {
      const item = w.productionItem
      const order = item.productionOrder
      const salesOrder = order.order
      const salesItem =
        salesOrder?.items?.find((si) => si.id === item.orderItemId) || null

      const inCuttingQueue = item.stations.some(
        (s) =>
          s.stationId === cutStation?.id &&
          ["در انتظار", "در حال انجام"].includes(s.status)
      )

      return {
        wasteId: w.id,
        createdAt: w.createdAt.toISOString(),
        quantity: w.quantity,
        reason: w.reason,
        notes: w.notes,
        stationName: w.stationId ? stationName.get(w.stationId) || null : null,
        isReworked: w.isReworked,
        recutBarcode: (w as any).recutItemId
          ? recutBarcode.get((w as any).recutItemId) || null
          : null,
        inCuttingQueue,
        productionItemId: item.id,
        productName: item.productName,
        barcode: item.barcode,
        length: item.length,
        width: item.width,
        orderNumber: salesOrder?.orderNumber,
        customerName: salesOrder?.customer?.name,
        servicesText: buildServicesText(
          (salesItem as any)?.servicesData ?? null
        ),
      }
    })

    const productNames = Array.from(
      new Set(items.map((i) => i.productName))
    ).sort()

    return NextResponse.json({ items, productNames })
  } catch (error: any) {
    console.error(error)
    return NextResponse.json(
      {
        error: "خطا در دریافت تاریخچه ضایعات",
        details: String(error?.message || error),
      },
      { status: 500 }
    )
  }
}

/**
 * ثبت ضایعات با بارکد — حتی اگر قطعه از صف برش خارج شده باشد
 * body: { barcode, quantity?, reason, department, responsiblePerson, operatorName? }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      barcode,
      quantity,
      reason,
      department,
      responsiblePerson,
      operatorName,
      stationName,
    } = body

    const raw = String(barcode || "").trim()
    if (!raw) {
      return NextResponse.json({ error: "بارکد الزامی است" }, { status: 400 })
    }
    if (!reason || !String(reason).trim()) {
      return NextResponse.json({ error: "علت ضایعات الزامی است" }, { status: 400 })
    }
    if (!department || !["تولید", "اداری"].includes(department)) {
      return NextResponse.json(
        { error: "بخش مسبب باید تولید یا اداری باشد" },
        { status: 400 }
      )
    }
    if (!responsiblePerson || !String(responsiblePerson).trim()) {
      return NextResponse.json({ error: "شخص مسبب الزامی است" }, { status: 400 })
    }

    const baseBarcode = raw.includes("-") ? raw.split("-")[0] : raw

    let item = await prisma.productionItem.findFirst({
      where: { barcode: raw },
      include: {
        stations: { include: { station: true } },
        productionOrder: {
          include: { order: { include: { customer: true } } },
        },
      },
    })
    if (!item) {
      item = await prisma.productionItem.findFirst({
        where: { barcode: baseBarcode },
        include: {
          stations: { include: { station: true } },
          productionOrder: {
            include: { order: { include: { customer: true } } },
          },
        },
      })
    }

    if (!item) {
      return NextResponse.json(
        { error: `بارکد «${raw}» یافت نشد` },
        { status: 404 }
      )
    }

    const cutStation = await prisma.productionStation.findFirst({
      where: { name: "برش" },
    })
    const inCuttingQueue = item.stations.some(
      (s) =>
        cutStation &&
        s.stationId === cutStation.id &&
        ["در انتظار", "در حال انجام"].includes(s.status)
    )

    // اگر هنوز در صف برش است، بهتر است از «اجازه چاپ مجدد» استفاده شود
    // ولی اجازه ثبت می‌دهیم؛ فقط هشدار می‌دهیم
    const qtyRaw = Number(quantity)
    const qty =
      Number.isFinite(qtyRaw) && qtyRaw > 0
        ? Math.min(Math.floor(qtyRaw), item.quantity || 1)
        : item.quantity || 1

    let stationId: string | null = null
    if (stationName) {
      const st = await prisma.productionStation.findFirst({
        where: { name: String(stationName).trim() },
      })
      stationId = st?.id || null
    }

    const wasteNote = `بخش: ${department} | شخص: ${String(responsiblePerson).trim()}`

    const waste = await prisma.waste.create({
      data: {
        productionItemId: item.id,
        stationId,
        quantity: qty,
        reason: String(reason).trim(),
        notes: wasteNote,
        operatorId: operatorName ? String(operatorName) : null,
      },
    })

    await prisma.productionHistory.create({
      data: {
        productionOrderId: item.productionOrderId,
        productionItemId: item.id,
        stationId,
        action: "ثبت ضایعات",
        description: `بارکد ${item.barcode || raw} | تعداد: ${qty} | علت: ${String(reason).trim()} | ${wasteNote}${
          inCuttingQueue ? " | (هنوز در صف برش)" : ""
        }`,
        quantity: qty,
        operatorName: operatorName ? String(operatorName) : null,
      },
    })

    return NextResponse.json({
      success: true,
      message: inCuttingQueue
        ? "ضایعات ثبت شد. قطعه هنوز در صف برش است — برای برش مجدد ابتدا برش را رد کنید یا از چاپ مجدد استفاده کنید."
        : "ضایعات ثبت شد. از لیست زیر انتخاب کنید و برش مجدد بزنید.",
      wasteId: waste.id,
      inCuttingQueue,
      productName: item.productName,
      barcode: item.barcode,
      orderNumber: item.productionOrder.order?.orderNumber,
      customerName: item.productionOrder.order?.customer?.name,
      quantity: qty,
    })
  } catch (error: any) {
    console.error(error)
    return NextResponse.json(
      {
        error: "خطا در ثبت ضایعات",
        details: String(error?.message || error),
      },
      { status: 500 }
    )
  }
}