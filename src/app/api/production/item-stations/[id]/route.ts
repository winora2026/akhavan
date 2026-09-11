import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { action, quantityOut, quantityWaste, notes, operatorName } = body
    // action: "start" | "complete"

    const itemStation = await prisma.productionItemStation.findUnique({
      where: { id },
      include: {
        station: true,
        productionItem: {
          include: {
            stations: {
              orderBy: { sequence: "asc" },
            },
            productionOrder: true,
          },
        },
      },
    })

    if (!itemStation) {
      return NextResponse.json({ error: "ایستگاه یافت نشد" }, { status: 404 })
    }

    const item = itemStation.productionItem
    const allStations = item.stations

    // جلوگیری از رد شدن از مراحل
    if (action === "start" || action === "complete") {
      const previousStations = allStations.filter(
        (s) => s.sequence < itemStation.sequence
      )
      const unfinishedPrevious = previousStations.find(
        (s) => s.status !== "تکمیل شده"
      )
      if (unfinishedPrevious) {
        return NextResponse.json(
          {
            error: `ابتدا باید ایستگاه قبلی (ترتیب ${unfinishedPrevious.sequence}) تکمیل شود`,
          },
          { status: 400 }
        )
      }
    }

    if (action === "start") {
      if (itemStation.status === "تکمیل شده") {
        return NextResponse.json(
          { error: "این ایستگاه قبلاً تکمیل شده است" },
          { status: 400 }
        )
      }

      const updated = await prisma.productionItemStation.update({
        where: { id },
        data: {
          status: "در حال انجام",
          startedAt: new Date(),
          operatorId: operatorName || null,
        },
        include: { station: true },
      })

      // وضعیت قلم و سفارش تولید
      await prisma.productionItem.update({
        where: { id: item.id },
        data: { status: "در حال تولید" },
      })

      await prisma.productionOrder.update({
        where: { id: item.productionOrderId },
        data: {
          status: "در حال تولید",
          startedAt: item.productionOrder.startedAt || new Date(),
        },
      })

      await prisma.productionHistory.create({
        data: {
          productionOrderId: item.productionOrderId,
          productionItemId: item.id,
          productionItemStationId: id,
          stationId: itemStation.stationId,
          action: "شروع عملیات",
          description: `شروع ${itemStation.station.name}`,
          oldStatus: itemStation.status,
          newStatus: "در حال انجام",
          operatorName: operatorName || null,
        },
      })

      return NextResponse.json(updated)
    }

    if (action === "complete") {
      if (itemStation.status === "تکمیل شده") {
        return NextResponse.json(
          { error: "این ایستگاه قبلاً تکمیل شده است" },
          { status: 400 }
        )
      }

      const qtyIn = itemStation.quantityIn || item.quantity || 1
      const waste = Number(quantityWaste) || 0
      const out = quantityOut != null ? Number(quantityOut) : qtyIn - waste

      if (out < 0 || waste < 0) {
        return NextResponse.json(
          { error: "تعداد خروجی یا ضایعات نامعتبر است" },
          { status: 400 }
        )
      }

      const updated = await prisma.productionItemStation.update({
        where: { id },
        data: {
          status: "تکمیل شده",
          completedAt: new Date(),
          quantityOut: out,
          quantityWaste: waste,
          notes: notes || null,
          operatorId: operatorName || itemStation.operatorId,
        },
        include: { station: true },
      })

      // ثبت ضایعات (اگر باشد)
      if (waste > 0) {
        await prisma.waste.create({
          data: {
            productionItemId: item.id,
            stationId: itemStation.stationId,
            quantity: waste,
            reason: notes || null,
            operatorId: operatorName || null,
          },
        })
      }

      await prisma.productionHistory.create({
        data: {
          productionOrderId: item.productionOrderId,
          productionItemId: item.id,
          productionItemStationId: id,
          stationId: itemStation.stationId,
          action: "تکمیل عملیات",
          description: `تکمیل ${itemStation.station.name}${waste > 0 ? ` | ضایعات: ${waste}` : ""}`,
          oldStatus: itemStation.status,
          newStatus: "تکمیل شده",
          quantity: out,
          operatorName: operatorName || null,
        },
      })

      // اگر همه ایستگاه‌های این قلم تکمیل شد
      const refreshedStations = await prisma.productionItemStation.findMany({
        where: { productionItemId: item.id },
      })
      const allDone = refreshedStations.every((s) => s.status === "تکمیل شده")

      if (allDone) {
        await prisma.productionItem.update({
          where: { id: item.id },
          data: { status: "تکمیل‌شده" },
        })
      }

      // اگر همه اقلام سفارش تکمیل شد
      const allItems = await prisma.productionItem.findMany({
        where: { productionOrderId: item.productionOrderId },
      })
      const orderDone = allItems.every((i) => i.status === "تکمیل‌شده")

      if (orderDone) {
        await prisma.productionOrder.update({
          where: { id: item.productionOrderId },
          data: {
            status: "تکمیل‌شده",
            completedAt: new Date(),
          },
        })
      }

      return NextResponse.json(updated)
    }

    return NextResponse.json({ error: "عملیات نامعتبر است" }, { status: 400 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "خطا در انجام عملیات" }, { status: 500 })
  }
}