import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

function norm(s: string) {
  return (s || "")
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

export async function POST(req: Request) {
  try {
    const { barcode, operatorName } = await req.json()
    const raw = String(barcode || "").trim()
    if (!raw) {
      return NextResponse.json({ error: "بارکد الزامی است" }, { status: 400 })
    }
    const base = raw.includes("-") ? raw.split("-")[0] : raw

    let item = await prisma.productionItem.findFirst({
      where: { barcode: raw },
      include: {
        stations: { include: { station: true } },
      },
    })
    if (!item) {
      item = await prisma.productionItem.findFirst({
        where: { barcode: base },
        include: {
          stations: { include: { station: true } },
        },
      })
    }
    if (!item) {
      return NextResponse.json({ error: "بارکد یافت نشد" }, { status: 404 })
    }

    const loadRow = item.stations.find((s) =>
      norm(s.station.name).includes("بارگیری")
    )
    if (!loadRow) {
      return NextResponse.json(
        { error: "این قلم مسیر بارگیری ندارد" },
        { status: 400 }
      )
    }
    if (loadRow.status === "تکمیل شده") {
      return NextResponse.json(
        { error: "قبلاً بارگیری شده" },
        { status: 400 }
      )
    }

    const now = new Date()
    await prisma.productionItemStation.update({
      where: { id: loadRow.id },
      data: {
        status: "تکمیل شده",
        quantityOut: loadRow.quantityIn || item.quantity,
        quantityIn: 0,
        completedAt: now,
        startedAt: loadRow.startedAt || now,
        operatorId: operatorName || null,
      },
    })

    // اگر در برگه خروجی هست، loadedAt بزن
    await prisma.exitSlipItem.updateMany({
      where: { productionItemId: item.id, loadedAt: null },
      data: { loadedAt: now },
    })

    await prisma.productionHistory.create({
      data: {
        productionOrderId: item.productionOrderId,
        productionItemId: item.id,
        productionItemStationId: loadRow.id,
        stationId: loadRow.stationId,
        action: "بارگیری / خروج",
        description: `اسکن بارگیری ${raw}`,
        newStatus: "تکمیل شده",
        quantity: item.quantity,
        operatorName: operatorName || null,
      },
    })

    return NextResponse.json({
      success: true,
      message: `بارگیری شد: ${item.productName}`,
      productName: item.productName,
      barcode: raw,
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا" },
      { status: 500 }
    )
  }
}