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

function isCutStation(name: string) {
  return norm(name) === "برش"
}

function isSemiFinishedWh(name: string) {
  const n = norm(name)
  return (
    n.includes("نیمه") ||
    n === norm("انبار محصول یک") ||
    n.includes("کالای نیمه")
  )
}

function isReadyWh(name: string) {
  const n = norm(name)
  return n.includes("آماده تحویل") || n === norm("انبار محصول دو")
}

function isLoading(name: string) {
  return norm(name).includes("بارگیری")
}

function isBevelPair(name: string) {
  const n = norm(name)
  return n === "تراش 1" || n === "تراش ۱" || n === "تراش 2" || n === "تراش ۲"
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { barcode, stationId, operatorName, confirmed, quantityDone } = body

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

    // فقط برش قبل از بقیه اجباری است
    if (!isCutStation(stationRow.station.name)) {
      const cut = item.stations.find((s) => isCutStation(s.station.name))
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

    const fullQty = stationRow.quantityIn || item.quantity || 1

    if (fullQty > 1 && !confirmed) {
      const salesOrderEarly = item.productionOrder.order
      return NextResponse.json({
        needsConfirmation: true,
        quantity: fullQty,
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

    let qty = fullQty
    if (quantityDone != null && quantityDone !== "") {
      const n = parseInt(String(quantityDone), 10)
      if (!n || n < 1) {
        return NextResponse.json(
          { error: "تعداد نامعتبر است" },
          { status: 400 }
        )
      }
      if (n > fullQty) {
        return NextResponse.json(
          { error: `حداکثر ${fullQty} عدد قابل رد است` },
          { status: 400 }
        )
      }
      qty = n
    }

    const remaining = fullQty - qty
    const now = new Date()

    if (remaining > 0) {
      await prisma.productionItemStation.update({
        where: { id: stationRow.id },
        data: {
          status: "در حال انجام",
          quantityIn: remaining,
          quantityOut: (stationRow.quantityOut || 0) + qty,
          startedAt: stationRow.startedAt || now,
          operatorId: operatorName || null,
        },
      })
    } else {
      await prisma.productionItemStation.update({
        where: { id: stationRow.id },
        data: {
          status: "تکمیل شده",
          quantityOut: (stationRow.quantityOut || 0) + qty,
          quantityIn: 0,
          quantityWaste: 0,
          completedAt: now,
          startedAt: stationRow.startedAt || now,
          operatorId: operatorName || null,
        },
      })

      // تراش ۱ یا ۲: با تکمیل یکی، جفتش هم رد شود
      if (isBevelPair(stationRow.station.name)) {
        for (const s of item.stations) {
          if (
            s.id !== stationRow.id &&
            isBevelPair(s.station.name) &&
            s.status !== "تکمیل شده"
          ) {
            await prisma.productionItemStation.update({
              where: { id: s.id },
              data: {
                status: "تکمیل شده",
                quantityOut: s.quantityIn || item.quantity || qty,
                quantityIn: 0,
                completedAt: now,
                startedAt: s.startedAt || now,
                operatorId: operatorName || null,
                notes: "رد خودکار به‌خاطر تکمیل دستگاه تراش دیگر",
              },
            })
            await prisma.productionHistory.create({
              data: {
                productionOrderId: item.productionOrderId,
                productionItemId: item.id,
                productionItemStationId: s.id,
                stationId: s.stationId,
                action: "رد خودکار تراش",
                description: `با تکمیل «${stationRow.station.name}»، ایستگاه «${s.station.name}» هم رد شد`,
                newStatus: "تکمیل شده",
                quantity: s.quantityIn || item.quantity,
                operatorName: operatorName || null,
              },
            })
          }
        }
      }

      // انبار کالای نیمه‌ساخته: همه ایستگاه‌های میانی تا قبل از انبار آماده تحویل و بارگیری رد شوند
      if (isSemiFinishedWh(stationRow.station.name)) {
        for (const s of item.stations) {
          if (s.id === stationRow.id) continue
          const nm = s.station.name
          if (isCutStation(nm) || isReadyWh(nm) || isLoading(nm)) continue
          if (s.status === "تکمیل شده") continue

          await prisma.productionItemStation.update({
            where: { id: s.id },
            data: {
              status: "تکمیل شده",
              quantityOut: s.quantityIn || item.quantity || qty,
              quantityIn: 0,
              completedAt: now,
              startedAt: s.startedAt || now,
              operatorId: operatorName || null,
              notes: "رد گروهی از انبار کالای نیمه‌ساخته",
            },
          })
          await prisma.productionHistory.create({
            data: {
              productionOrderId: item.productionOrderId,
              productionItemId: item.id,
              productionItemStationId: s.id,
              stationId: s.stationId,
              action: "رد گروهی از انبار نیمه‌ساخته",
              description: `ایستگاه «${nm}» همراه با انبار کالای نیمه‌ساخته رد شد`,
              newStatus: "تکمیل شده",
              quantity: s.quantityIn || item.quantity,
              operatorName: operatorName || null,
            },
          })
        }
      }
    }

    await prisma.productionOrder.updateMany({
      where: { id: item.productionOrderId, status: "در انتظار" },
      data: { status: "در حال تولید", startedAt: now },
    })

    const allStations = await prisma.productionItemStation.findMany({
      where: { productionItemId: item.id },
      include: { station: true },
    })

    const allDone = allStations.every((s) => s.status === "تکمیل شده")

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
        description: `اسکن ${raw} در ${stationRow.station.name} | تعداد رد: ${qty}${
          remaining > 0 ? ` | باقی‌مانده: ${remaining}` : ""
        }`,
        newStatus: remaining > 0 ? "در حال انجام" : "تکمیل شده",
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
      message:
        remaining > 0
          ? `رد شد: ${item.productName} (${qty} از ${fullQty}) — باقی: ${remaining}`
          : `رد شد: ${item.productName} (${qty} عدد)`,
      productName: item.productName,
      orderNumber: salesOrder?.orderNumber,
      customerName: salesOrder?.customer?.name,
      stationName: stationRow.station.name,
      barcode: raw,
      quantity: qty,
      remaining,
      length: item.length,
      width: item.width,
      meterage: item.meterage,
      notes: item.notes || (salesItem as any)?.notes || null,
      servicesText,
      installationCode: (salesItem as any)?.installationCode || null,
      mapImageUrl: (salesOrder as any)?.mapImageUrl || null,
      mapImages: (salesOrder as any)?.mapImages || null,
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