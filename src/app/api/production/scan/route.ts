import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { notifyOrderReadyForDelivery } from "@/lib/orderReadySms"

function norm(s: string) {
  return (s || "")
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function cleanBarcode(s: string) {
  return (s || "")
    .replace(/[\u200b\u200c\u200d\u200e\u200f\ufeff]/g, "")
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\r\n\t]/g, "")
    .trim()
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
function isStationClosed(status: string) {
  return status === "تکمیل شده" || status === "انجام در ایستگاه دیگر"
}

const GROUP_PASS_NOTE = "رد گروهی از انبار کالای نیمه‌ساخته"

function findPassedLaterStation(stations: any[], current: any) {
  return (
    stations.find((s: any) => {
      if (s.id === current.id) return false
      if ((s.sequence ?? 0) <= (current.sequence ?? 0)) return false
      if (s.notes === GROUP_PASS_NOTE) return false
      if (s.status === "تکمیل شده") return true
      if (s.status === "در حال انجام" && (s.quantityOut || 0) > 0) return true
      return false
    }) || null
  )
}

async function findItemByBarcode(raw: string, include: any): Promise<any> {
  const code = cleanBarcode(raw)
  const baseBarcode = code.includes("-") ? code.split("-")[0] : code

  let item = await prisma.productionItem.findFirst({
    where: { barcode: code },
    include,
  })
  if (!item && baseBarcode !== code) {
    item = await prisma.productionItem.findFirst({
      where: { barcode: baseBarcode },
      include,
    })
  }
  if (!item) {
    const digits = code.replace(/\D/g, "")
    if (digits && digits !== code) {
      item = await prisma.productionItem.findFirst({
        where: {
          OR: [{ barcode: digits }, { barcode: { endsWith: digits } }],
        },
        include,
      })
    }
  }
  return item
}

function detailPayload(item: any, stationRow: any, raw: string, extra: any = {}) {
  const salesOrder = item.productionOrder?.order
  const salesItem =
    salesOrder?.items?.find((si: any) => si.id === item.orderItemId) || null
  const servicesText = buildServicesText(
    (salesItem as any)?.servicesData ?? null
  )
  return {
    productName: item.productName,
    orderNumber: salesOrder?.orderNumber,
    customerName: salesOrder?.customer?.name,
    stationName: stationRow.station.name,
    barcode: raw,
    quantity: stationRow.quantityIn || item.quantity || 1,
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
    priority: item.productionOrder?.priority,
    ...extra,
  }
}

const includeFull = {
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

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      barcode,
      stationId,
      operatorName,
      confirmed,
      quantityDone,
      action,
    } = body

    // ---------- پیش‌نمایش بدون رد ----------
    if (action === "preview") {
      if (!barcode || !stationId) {
        return NextResponse.json(
          { error: "بارکد و ایستگاه الزامی است" },
          { status: 400 }
        )
      }
      const raw = cleanBarcode(String(barcode))
      const item = await findItemByBarcode(raw, includeFull)
      if (!item) {
        return NextResponse.json(
          { error: `بارکد «${raw}» یافت نشد` },
          { status: 404 }
        )
      }
      const stationRow = item.stations.find((s: any) => s.stationId === stationId)
      if (!stationRow) {
        return NextResponse.json(
          { error: "این قطعه برای ایستگاه انتخاب‌شده مسیر ندارد" },
          { status: 400 }
        )
      }
      return NextResponse.json({
        success: true,
        preview: true,
        ...detailPayload(item, stationRow, raw, {
          itemStationStatus: stationRow.status,
          quantityIn: stationRow.quantityIn,
        }),
      })
    }

    // ---------- برگشت رد ایستگاه ----------
    if (action === "undo") {
      if (!barcode || !stationId) {
        return NextResponse.json(
          { error: "بارکد و ایستگاه الزامی است" },
          { status: 400 }
        )
      }

      const raw = cleanBarcode(String(barcode))
      const include = {
        stations: {
          include: { station: true },
          orderBy: { sequence: "asc" as const },
        },
      }

      const item = await findItemByBarcode(raw, include)
      if (!item) {
        return NextResponse.json(
          { error: `بارکد «${raw}» یافت نشد` },
          { status: 404 }
        )
      }

      const stationRow = item.stations.find((s: any) => s.stationId === stationId)
      if (!stationRow) {
        return NextResponse.json(
          { error: "این قطعه برای ایستگاه انتخاب‌شده مسیر ندارد" },
          { status: 400 }
        )
      }

      if (
        stationRow.status !== "تکمیل شده" &&
        stationRow.status !== "در حال انجام"
      ) {
        return NextResponse.json(
          {
            error:
              "این ایستگاه هنوز رد نشده یا قابل برگشت نیست (وضعیت فعلی: " +
              stationRow.status +
              ")",
          },
          { status: 400 }
        )
      }

      if (isLoading(stationRow.station.name)) {
        return NextResponse.json(
          { error: "رد ایستگاه بارگیری از اینجا قابل برگشت نیست" },
          { status: 400 }
        )
      }

      const passedLater = findPassedLaterStation(item.stations, stationRow)
      if (passedLater) {
        return NextResponse.json(
          {
            error: `ایستگاه «${passedLater.station.name}» این قطعه را رد کرده است؛ ابتدا باید رد آن ایستگاه برگردانده شود`,
          },
          { status: 400 }
        )
      }

      const qtyBack =
        (stationRow.quantityIn || 0) + (stationRow.quantityOut || 0) ||
        item.quantity ||
        1

      await prisma.productionItemStation.update({
        where: { id: stationRow.id },
        data: {
          status: "در انتظار",
          completedAt: null,
          startedAt: null,
          quantityOut: null,
          quantityIn: qtyBack,
          quantityWaste: null,
          operatorId: null,
          notes: null,
        },
      })

      if (isBevelPair(stationRow.station.name)) {
        for (const s of item.stations) {
          if (
            s.id !== stationRow.id &&
            isBevelPair(s.station.name) &&
            s.status === "انجام در ایستگاه دیگر"
          ) {
            await prisma.productionItemStation.update({
              where: { id: s.id },
              data: {
                status: "در انتظار",
                completedAt: null,
                startedAt: null,
                quantityOut: null,
                quantityIn: item.quantity || 1,
                notes: null,
              },
            })
          }
        }
      }

      if (isSemiFinishedWh(stationRow.station.name)) {
        for (const s of item.stations) {
          if (
            s.id !== stationRow.id &&
            s.notes === GROUP_PASS_NOTE &&
            s.status === "تکمیل شده"
          ) {
            await prisma.productionItemStation.update({
              where: { id: s.id },
              data: {
                status: "در انتظار",
                completedAt: null,
                startedAt: null,
                quantityOut: null,
                quantityIn: s.quantityOut || item.quantity || 1,
                operatorId: null,
                notes: null,
              },
            })
          }
        }
      }

      await prisma.productionItem.update({
        where: { id: item.id },
        data: {
          status: "در حال تولید",
          currentStationId: stationId,
        },
      })

      await prisma.productionHistory.create({
        data: {
          productionOrderId: item.productionOrderId,
          productionItemId: item.id,
          productionItemStationId: stationRow.id,
          stationId,
          action: "برگشت رد ایستگاه",
          description: `برگشت از «${stationRow.station.name}» | بارکد ${raw}`,
          oldStatus: stationRow.status,
          newStatus: "در انتظار",
          quantity: qtyBack,
          operatorName: operatorName || null,
        },
      })

      return NextResponse.json({
        success: true,
        message: `برگشت انجام شد: ${item.productName} — ${stationRow.station.name}`,
      })
    }

    // ---------- اسکن / رد ----------
    if (!barcode || !stationId) {
      return NextResponse.json(
        { error: "بارکد و ایستگاه الزامی است" },
        { status: 400 }
      )
    }

    const raw = cleanBarcode(String(barcode))
    const item = await findItemByBarcode(raw, includeFull)

    if (!item) {
      return NextResponse.json(
        { error: `بارکد «${raw}» یافت نشد` },
        { status: 404 }
      )
    }

    const stationRow = item.stations.find((s: any) => s.stationId === stationId)

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
          ...detailPayload(item, stationRow, raw),
        },
        { status: 400 }
      )
    }

    if (stationRow.status === "انجام در ایستگاه دیگر") {
      return NextResponse.json(
        {
          error:
            "این کار در ایستگاه تراش دیگر انجام شده و در این دستگاه قابل رد نیست",
          productName: item.productName,
          stationName: stationRow.station.name,
        },
        { status: 400 }
      )
    }

    if (!isCutStation(stationRow.station.name)) {
      const cut = item.stations.find((s: any) => isCutStation(s.station.name))
      if (cut && cut.status !== "تکمیل شده") {
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

    if (fullQty >= 5 && !confirmed) {
      return NextResponse.json({
        needsConfirmation: true,
        quantity: fullQty,
        ...detailPayload(item, stationRow, raw),
      })
    }

    let qty = fullQty
    if (quantityDone != null && quantityDone !== "") {
      const n = parseInt(String(quantityDone), 10)
      if (!n || n < 1) {
        return NextResponse.json({ error: "تعداد نامعتبر است" }, { status: 400 })
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

      if (isBevelPair(stationRow.station.name)) {
        for (const s of item.stations) {
          if (
            s.id !== stationRow.id &&
            isBevelPair(s.station.name) &&
            s.status !== "تکمیل شده" &&
            s.status !== "انجام در ایستگاه دیگر"
          ) {
            await prisma.productionItemStation.update({
              where: { id: s.id },
              data: {
                status: "انجام در ایستگاه دیگر",
                quantityOut: 0,
                quantityIn: 0,
                completedAt: now,
                notes: `کار در «${stationRow.station.name}» انجام شد — این دستگاه انجام‌دهنده نیست`,
              },
            })
            await prisma.productionHistory.create({
              data: {
                productionOrderId: item.productionOrderId,
                productionItemId: item.id,
                productionItemStationId: s.id,
                stationId: s.stationId,
                action: "خروج از صف تراش (انجام در ایستگاه جفت)",
                description: `به‌خاطر تکمیل واقعی در «${stationRow.station.name}»، از صف «${s.station.name}» خارج شد`,
                newStatus: "انجام در ایستگاه دیگر",
                quantity: 0,
                operatorName: operatorName || null,
              },
            })
          }
        }
      }

      if (isSemiFinishedWh(stationRow.station.name)) {
        for (const s of item.stations) {
          if (s.id === stationRow.id) continue
          const nm = s.station.name
          if (isCutStation(nm) || isReadyWh(nm) || isLoading(nm)) continue
          if (isStationClosed(s.status)) continue
          await prisma.productionItemStation.update({
            where: { id: s.id },
            data: {
              status: "تکمیل شده",
              quantityOut: s.quantityIn || item.quantity || qty,
              quantityIn: 0,
              completedAt: now,
              startedAt: s.startedAt || now,
              operatorId: operatorName || null,
              notes: GROUP_PASS_NOTE,
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
    const allDone = allStations.every((s) => isStationClosed(s.status))

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

    // پیامک «سفارش آماده تحویل است»: وقتی این قطعه کامل از انبار کالای نیمه‌ساخته رد شد.
    // تابع خودش چک می‌کند که همه‌ی قطعه‌های سفارش رد شده باشند و فقط یک‌بار بفرستد.
    // منتظر نتیجه‌اش نمی‌مانیم تا اسکن کند نشود؛ تابع هیچ‌وقت ارور نمی‌دهد.
    if (remaining === 0 && isSemiFinishedWh(stationRow.station.name)) {
      void notifyOrderReadyForDelivery(item.id)
    }

    return NextResponse.json({
      success: true,
      preview: false,
      message:
        remaining > 0
          ? `رد شد: ${item.productName} (${qty} از ${fullQty}) — باقی: ${remaining}`
          : `رد شد: ${item.productName} (${qty} عدد)`,
      remaining,
      ...detailPayload(item, stationRow, raw, { quantity: qty }),
    })
  } catch (error: any) {
    console.error(error)
    return NextResponse.json(
      { error: "خطا در اسکن", details: String(error?.message || error) },
      { status: 500 }
    )
  }
}