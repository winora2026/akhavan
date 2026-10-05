import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// بارکد بعدی: بزرگ‌ترین بارکد عددی موجود + ۱ (هم‌طول با بارکدهای قبلی)
// ⚠️ اگر بارکد اصلی را جای دیگری با منطق خاص تولید می‌کنید، فقط همین تابع را با آن عوض کنید
async function nextBarcode(tx: any): Promise<string> {
  const rows: { barcode: string | null }[] = await tx.productionItem.findMany({
    where: { barcode: { not: null } },
    select: { barcode: true },
  })
  let max = 0
  let width = 0
  for (const r of rows) {
    const b = r.barcode as string
    if (/^\d+$/.test(b)) {
      const n = Number(b)
      if (n > max) max = n
      width = Math.max(width, b.length)
    }
  }
  return String(max + 1).padStart(width, "0")
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { wasteIds, operatorName } = body

    if (!Array.isArray(wasteIds) || wasteIds.length === 0) {
      return NextResponse.json(
        { error: "هیچ ضایعاتی انتخاب نشده" },
        { status: 400 }
      )
    }

    const cutStation = await prisma.productionStation.findFirst({
      where: { name: "برش" },
    })
    if (!cutStation) {
      return NextResponse.json(
        { error: "ایستگاه برش تعریف نشده است" },
        { status: 400 }
      )
    }

    const created: { wasteId: string; newItemId: string; barcode: string }[] = []
    const skipped: { wasteId: string; why: string }[] = []

    await prisma.$transaction(
      async (tx) => {
        for (const wasteId of wasteIds as string[]) {
          const waste = await tx.waste.findUnique({
            where: { id: wasteId },
            include: { productionItem: { include: { stations: true } } },
          })
          if (!waste) {
            skipped.push({ wasteId, why: "یافت نشد" })
            continue
          }
          if (waste.isReworked) {
            skipped.push({ wasteId, why: "قبلاً برش مجدد شده" })
            continue
          }

          const item = waste.productionItem
          const stillInQueue = item.stations.some(
            (s) =>
              s.stationId === cutStation.id &&
              ["در انتظار", "در حال انجام"].includes(s.status)
          )
          if (stillInQueue) {
            skipped.push({ wasteId, why: "قطعه هنوز در صف برش است" })
            continue
          }

          const qty = waste.quantity > 0 ? waste.quantity : 1
          const rootId = (item as any).parentItemId || item.id
          const prevRecuts = await tx.productionItem.count({
            where: { parentItemId: rootId } as any,
          })
          const recutNumber = prevRecuts + 1
          const barcode = await nextBarcode(tx)

          const meterage =
            item.meterage != null && item.quantity
              ? (item.meterage * qty) / item.quantity
              : item.meterage

          const newItem = await tx.productionItem.create({
            data: {
              productionOrderId: item.productionOrderId,
              orderItemId: item.orderItemId,
              productName: item.productName,
              length: item.length,
              width: item.width,
              quantity: qty,
              meterage,
              thickness: item.thickness,
              notes: item.notes,
              status: "در انتظار",
              barcode,
              currentStationId: cutStation.id,
              labelStatus: "چاپ‌نشده",
              parentItemId: rootId,
              recutNumber,
            } as any,
          })

          // مسیر ایستگاه‌ها: از برش به بعد، مثل آیتم اصلی
          const orig = [...item.stations].sort((a, b) => a.sequence - b.sequence)
          const cutRow = orig.find((s) => s.stationId === cutStation.id)
          const path = cutRow
            ? orig.filter((s) => s.sequence >= cutRow.sequence)
            : [
                {
                  stationId: cutStation.id,
                  sequence: (orig[0]?.sequence ?? 1) - 1,
                },
                ...orig,
              ]

          for (const st of path) {
            await tx.productionItemStation.create({
              data: {
                productionItemId: newItem.id,
                stationId: st.stationId,
                sequence: st.sequence,
                status: "در انتظار",
                quantityIn: st.stationId === cutStation.id ? qty : null,
              },
            })
          }

          await tx.waste.update({
            where: { id: waste.id },
            data: {
              isReworked: true,
              recutItemId: newItem.id,
              recutAt: new Date(),
            } as any,
          })

          await tx.productionHistory.create({
            data: {
              productionOrderId: item.productionOrderId,
              productionItemId: newItem.id,
              action: "برش مجدد",
              description: `برش مجدد #${recutNumber} | بارکد قبلی: ${item.barcode || "—"} | بارکد جدید: ${barcode} | علت: ${waste.reason || "—"}`,
              operatorName: operatorName ? String(operatorName) : null,
            },
          })

          created.push({ wasteId: waste.id, newItemId: newItem.id, barcode })
        }
      },
      { timeout: 30000 }
    )

    if (created.length === 0) {
      return NextResponse.json(
        { error: "هیچ مورد قابل برش مجددی نبود", skipped },
        { status: 400 }
      )
    }

    return NextResponse.json({
      message: `${created.length} مورد برای برش مجدد ثبت شد`,
      created,
      skipped,
    })
  } catch (error: any) {
    console.error(error)
    return NextResponse.json(
      {
        error: "خطا در ثبت برش مجدد",
        details: String(error?.message || error),
      },
      { status: 500 }
    )
  }
}
