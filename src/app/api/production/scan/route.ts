import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

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

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { barcode, stationId, operatorName, confirmed } = body

    if (!barcode || !stationId) {
      return NextResponse.json(
        { error: "بارکد و ایستگاه الزامی است" },
        { status: 400 }
      )
    }

    const raw = String(barcode).trim()
    const baseBarcode = raw.includes("-") ? raw.split("-")[0] : raw

    const include = {
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
      stations: {
        include: { station: true },
        orderBy: { sequence: "asc" as const },
      },
    }

    let item = await prisma.productionItem.findFirst({
      where: { barcode: raw },
      include,
    })

    if (!item) {
      item = await prisma.productionItem.findFirst({
        where: { barcode: baseBarcode },
        include,
      })
    }

    if (!item) {
      return NextResponse.json(
        { error: `بارکد «${raw}» یافت نشد` },
        { status: 404 }
      )
    }

    const stationRow = item.stations.find((s) => s.stationId === stationId)

    if (!stationRow) {
      return NextResponse.json(
        {
          error: "این قطعه برای ایستگاه انتخاب‌شده مسیر ندارد",
          productName: item.productName,
          orderNumber: item.productionOrder.order?.orderNumber,
        },
        { status: 400 }
      )
    }

    if (stationRow.status === "تکمیل شده") {
      return NextResponse.json(
        {
          error: "این قطعه قبلاً در این ایستگاه رد شده است",
          productName: item.productName,
          orderNumber: item.productionOrder.order?.orderNumber,
          stationName: stationRow.station.name,
        },
        { status: 400 }
      )
    }

    // فقط برش قبل از بقیه اجباری است — ترتیب بقیه مهم نیست
    if (stationRow.station.name !== "برش") {
      const cut = item.stations.find((s) => s.station.name === "برش")
      if (!cut || cut.status !== "تکمیل شده") {
        return NextResponse.json(
          {
            error: "ابتدا ایستگاه برش باید تکمیل شود",
            productName: item.productName,
            orderNumber: item.productionOrder.order?.orderNumber,
          },
          { status: 400 }
        )
      }
    }

    const qty = stationRow.quantityIn || item.quantity || 1

        if (qty > 5 && !confirmed) {
      const salesOrderEarly = item.productionOrder.order
      return NextResponse.json({
        needsConfirmation: true,
        quantity: qty,
        productName: item.productName,
        orderNumber: salesOrderEarly?.orderNumber,
        customerName: salesOrderEarly?.customer?.name,
        stationName: stationRow.station.name,
        barcode: raw,
        length: item.length,
        width: item.width,
        meterage: item.meterage,
        mapImageUrl: (salesOrderEarly as any)?.mapImageUrl || null,
        mapImages: (salesOrderEarly as any)?.mapImages || null,
      })
    }

    await prisma.productionItemStation.update({
      where: { id: stationRow.id },
      data: {
        status: "تکمیل شده",
        quantityOut: qty,
        quantityWaste: 0,
        completedAt: new Date(),
        startedAt: stationRow.startedAt || new Date(),
        operatorId: operatorName || null,
      },
    })

    await prisma.productionOrder.updateMany({
      where: { id: item.productionOrderId, status: "در انتظار" },
      data: { status: "در حال تولید", startedAt: new Date() },
    })

    const allStations = await prisma.productionItemStation.findMany({
      where: { productionItemId: item.id },
    })
    const allDone = allStations.every(
      (s) => s.id === stationRow.id || s.status === "تکمیل شده"
    )

    await prisma.productionItem.update({
      where: { id: item.id },
      data: {
        status: allDone ? "تکمیل‌شده" : "در حال تولید",
        currentStationId: allDone ? null : stationId,
      },
    })

    await prisma.productionHistory.create({
      data: {
        productionOrderId: item.productionOrderId,
        productionItemId: item.id,
        productionItemStationId: stationRow.id,
        stationId,
        action: "اسکن بارکد - رد ایستگاه",
        description: `اسکن ${raw} در ${stationRow.station.name} | تعداد: ${qty}`,
        newStatus: "تکمیل شده",
        quantity: qty,
        operatorName: operatorName || null,
      },
    })

    const salesOrder = item.productionOrder.order
    const salesItem =
      salesOrder?.items?.find((si) => si.id === item.orderItemId) || null
    const servicesText = buildServicesText(
      (salesItem as any)?.servicesData ?? null
    )

    return NextResponse.json({
      success: true,
      message: `رد شد: ${item.productName} (${qty} عدد)`,
      productName: item.productName,
      orderNumber: salesOrder?.orderNumber,
      customerName: salesOrder?.customer?.name,
      stationName: stationRow.station.name,
      barcode: raw,
      quantity: qty,
      length: item.length,
      width: item.width,
      meterage: item.meterage,
      notes: item.notes || (salesItem as any)?.notes || null,
      servicesText,
      installationCode: (salesItem as any)?.installationCode || null,
      mapImageUrl: (salesOrder as any)?.mapImageUrl || null,
      orderDate: salesOrder?.orderDate
        ? salesOrder.orderDate.toISOString()
        : null,
      deliveryDate: salesOrder?.deliveryDate
        ? salesOrder.deliveryDate.toISOString()
        : null,
      priority: item.productionOrder.priority,
    })
  } catch (error: any) {
    console.error(error)
    return NextResponse.json(
      { error: "خطا در اسکن", details: String(error?.message || error) },
      { status: 500 }
    )
  }
}