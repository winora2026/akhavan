import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function norm(s: string) {
  return (s || "")
    .replace(/[\u200c\u200f\u200e]/g, "")
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

/** تراش ۱ و تراش ۲ موازی‌اند؛ تکمیل یکی یعنی هر دو (برای داده‌های قدیمی که دومی استمپ نشده) */
function isBevelPair(name: string) {
  const c = norm(name).replace(/\s+/g, "")
  return c.startsWith("تراش") && !c.includes("الگویی")
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const ids: string[] = Array.isArray(body?.productionItemIds)
      ? body.productionItemIds.filter((x: any) => typeof x === "string")
      : []
    const operatorName =
      typeof body?.operatorName === "string" ? body.operatorName.trim() : ""

    if (ids.length === 0) {
      return NextResponse.json(
        { error: "حداقل یک قلم باید انتخاب شود" },
        { status: 400 }
      )
    }

    const stations = await prisma.productionStation.findMany()
    const loadingIds = stations.filter((s) => isLoading(s.name)).map((s) => s.id)
    if (loadingIds.length === 0) {
      return NextResponse.json(
        { error: "ایستگاه بارگیری تعریف نشده" },
        { status: 400 }
      )
    }
    const readyIds = stations.filter((s) => isReadyWh(s.name)).map((s) => s.id)

    const items = await prisma.productionItem.findMany({
      where: { id: { in: ids } },
      include: {
        stations: { include: { station: true } },
        productionOrder: true,
      },
    })
    if (items.length === 0) {
      return NextResponse.json({ error: "اقلام انتخاب‌شده پیدا نشد" }, { status: 404 })
    }

    const exited = await prisma.exitSlipItem.findMany({
      where: {
        productionItemId: { in: ids },
        exitSlip: { status: { not: "ابطال" } },
      },
      select: { productionItemId: true },
    })
    const exitedIds = new Set(exited.map((e) => e.productionItemId))

    const now = new Date()
    let transferred = 0
    let skipped = 0
    const failed: string[] = []

    for (const item of items) {
      const label = item.barcode || item.productName
      if (exitedIds.has(item.id)) {
        skipped++
        continue
      }

      const readyRow = item.stations.find((s) => readyIds.includes(s.stationId))
      // آماده تحویل ایستگاه فیزیکی نیست؛ اگر همه‌ی ایستگاه‌های مسیر رد شده باشند،
      // قطعه مستقیم به بارگیری می‌رود و همان لحظه آماده تحویل هم خودکار تکمیل می‌شود.
      const blockers = item.stations.filter(
        (s) =>
          !isReadyWh(s.station.name) &&
          !isLoading(s.station.name) &&
          !isClosed(s.status) &&
          !(
            isBevelPair(s.station.name) &&
            item.stations.some(
              (o) =>
                o.id !== s.id &&
                isBevelPair(o.station.name) &&
                isClosed(o.status)
            )
          )
      )
      if (blockers.length > 0) {
        failed.push(`${label} (در انتظار ${blockers[0].station.name})`)
        continue
      }

      const loadRow = item.stations.find((s) =>
        isLoading(s.station?.name || "")
      )
      if (!loadRow) {
        failed.push(`${label} (مسیر بارگیری ندارد)`)
        continue
      }
      if (isClosed(loadRow.status) || loadRow.status === "در حال انجام") {
        skipped++
        continue
      }

      if (readyRow && !isClosed(readyRow.status)) {
        await prisma.productionItemStation.update({
          where: { id: readyRow.id },
          data: {
            status: "تکمیل شده",
            startedAt: readyRow.startedAt || now,
            completedAt: now,
            quantityOut: readyRow.quantityIn ?? item.quantity ?? 1,
          },
        })
      }

      await prisma.productionItemStation.update({
        where: { id: loadRow.id },
        data: { status: "در حال انجام", startedAt: loadRow.startedAt || now },
      })
      await prisma.productionItem.update({
        where: { id: item.id },
        data: { status: "در حال تولید", currentStationId: loadRow.stationId },
      })
      await prisma.productionHistory.create({
        data: {
          productionOrderId: item.productionOrderId,
          productionItemId: item.id,
          productionItemStationId: loadRow.id,
          stationId: loadRow.stationId,
          action: "انتقال به کارتابل بارگیری",
          description: `انتقال از کارتابل آماده تحویل | بارکد ${item.barcode ?? "—"}`,
          oldStatus: loadRow.status,
          newStatus: "در حال انجام",
          quantity: loadRow.quantityIn ?? item.quantity ?? 1,
          operatorName: operatorName || null,
        },
      })
      transferred++
    }

    if (transferred === 0 && failed.length > 0) {
      return NextResponse.json({ error: failed.join("؛ ") }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      transferred,
      skipped,
      failed,
      message:
        `${transferred} قلم به کارتابل بارگیری منتقل شد` +
        (skipped > 0 ? ` | ${skipped} قلم قبلاً منتقل یا خارج شده بود` : "") +
        (failed.length > 0 ? ` | ${failed.length} قلم قابل انتقال نبود` : ""),
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: "خطا در انتقال به بارگیری", details: String(e?.message) },
      { status: 500 }
    )
  }
}
