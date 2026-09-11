import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const stationId = searchParams.get("stationId")

    if (!stationId) {
      return NextResponse.json({ error: "stationId الزامی است" }, { status: 400 })
    }

    const station = await prisma.productionStation.findUnique({
      where: { id: stationId },
    })

    if (!station) {
      return NextResponse.json({ error: "ایستگاه یافت نشد" }, { status: 404 })
    }

    const rows = await prisma.productionItemStation.findMany({
      where: {
        stationId,
        status: { in: ["در انتظار", "در حال انجام"] },
      },
      include: {
        station: true,
        productionItem: {
          include: {
            productionOrder: {
              include: {
                order: { include: { customer: true } },
              },
            },
            stations: {
              include: { station: true },
              orderBy: { sequence: "asc" },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    })

    let filtered = rows
    if (station.name !== "برش") {
      filtered = rows.filter((row) => {
        const cut = row.productionItem.stations.find(
          (s) => s.station.name === "برش"
        )
        return cut && cut.status === "تکمیل شده"
      })
    }

    return NextResponse.json(filtered)
  } catch (error: any) {
    console.error(error)
    return NextResponse.json(
      { error: "خطا در دریافت کارتابل", details: String(error?.message || error) },
      { status: 500 }
    )
  }
}