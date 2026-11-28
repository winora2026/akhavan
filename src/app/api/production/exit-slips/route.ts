import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

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

// نام مشتری ممکن است با «ي/ك» عربی ذخیره شده باشد و کاربر «ی/ک» فارسی تایپ کند
function textVariants(q: string) {
  const base = q.trim()
  const arabic = base.replace(/ی/g, "ي").replace(/ک/g, "ك")
  const persian = base.replace(/ي/g, "ی").replace(/ك/g, "ک")
  return Array.from(new Set([base, arabic, persian])).filter(Boolean)
}

function isLoadingName(name: string) {
  return (name || "")
    .replace(/[\u200c\u200f\u200e]/g, "")
    .toLowerCase()
    .includes("بارگیری")
}

/** کد و شماره تماس مشتری هر برگه را از جدول مشتری می‌آورد (برای چاپ بالای برگه‌ی خروج) */
async function withCustomerCodes<
  T extends {
    customerId: string | null
    customerName: string
    customerPhone?: string | null
  }
>(
  slips: T[]
): Promise<
  (T & { customerCode: string | null; customerPhone: string | null })[]
> {
  if (slips.length === 0) return []
  const ids = Array.from(
    new Set(slips.map((s) => s.customerId).filter((x): x is string => !!x))
  )
  const names = Array.from(
    new Set(slips.map((s) => s.customerName).filter(Boolean))
  )
  const byIdRows = ids.length
    ? await prisma.customer.findMany({
        where: { id: { in: ids } },
        select: { id: true, customerCode: true, phone: true },
      })
    : []
  const byNameRows = names.length
    ? await prisma.customer.findMany({
        where: { name: { in: names } },
        select: { name: true, customerCode: true, phone: true },
      })
    : []
  const byId = new Map<string, { code: string | null; phone: string | null }>()
  byIdRows.forEach((c) =>
    byId.set(c.id, { code: c.customerCode, phone: c.phone })
  )
  const byName = new Map<string, { code: string | null; phone: string | null }>()
  byNameRows.forEach((c) =>
    byName.set(c.name, { code: c.customerCode, phone: c.phone })
  )

  return slips.map((s) => {
    const c =
      (s.customerId ? byId.get(s.customerId) : undefined) ??
      byName.get(s.customerName)
    return {
      ...s,
      customerCode: c?.code ?? null,
      customerPhone: s.customerPhone ?? c?.phone ?? null,
    }
  })
}

/**
 * لیست برگه‌های خروج
 *  - بدون پارامتر: ۱۰۰ برگه‌ی آخر
 *  - ?customers=1&q=متن : مشتری‌هایی که برگه‌ی خروج دارند (از همه‌ی سوابق) با تعداد و آخرین تاریخ
 *  - ?customer=نام : همه‌ی برگه‌های (غیر ابطال) همان مشتری
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const customersMode = searchParams.get("customers") === "1"
    const customer = (searchParams.get("customer") || "").trim()
    const q = (searchParams.get("q") || "").trim()

    if (customersMode) {
      const where: any = { status: { not: "ابطال" } }
      if (q) {
        where.OR = textVariants(q).map((v) => ({
          customerName: { contains: v },
        }))
      }
      const rows = await prisma.exitSlip.findMany({
        where,
        select: { customerName: true, exitDate: true },
        orderBy: { exitDate: "desc" },
        take: 5000,
      })
      const map = new Map<
        string,
        { name: string; count: number; lastDate: Date }
      >()
      for (const r of rows) {
        const cur = map.get(r.customerName)
        if (cur) cur.count += 1
        else
          map.set(r.customerName, {
            name: r.customerName,
            count: 1,
            lastDate: r.exitDate,
          })
      }
      return NextResponse.json({
        customers: Array.from(map.values()).slice(0, 200),
      })
    }

    if (customer) {
      const slips = await prisma.exitSlip.findMany({
        where: { customerName: customer, status: { not: "ابطال" } },
        orderBy: { exitDate: "desc" },
        take: 1000,
        include: { items: true },
      })
      return NextResponse.json(await withCustomerCodes(slips))
    }

    const slips = await prisma.exitSlip.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { items: true },
    })
    return NextResponse.json(await withCustomerCodes(slips))
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: "خطا در دریافت برگه‌های خروج", details: String(e?.message) },
      { status: 500 }
    )
  }
}

/** صدور برگه خروج جدید */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      customerName,
      customerId,
      customerPhone,
      productionItemIds,
      driverName,
      driverNationalId,
      driverPhone,
      vehicleName,
      plateNumber,
      notes,
    } = body

    if (!customerName || typeof customerName !== "string") {
      return NextResponse.json(
        { error: "نام مشتری الزامی است" },
        { status: 400 }
      )
    }
    if (!Array.isArray(productionItemIds) || productionItemIds.length === 0) {
      return NextResponse.json(
        { error: "حداقل یک قلم باید انتخاب شود" },
        { status: 400 }
      )
    }

    // اقلامی که قبلاً در برگه‌ی فعال (غیر ابطال) ثبت شده‌اند
    const alreadyExited = await prisma.exitSlipItem.findMany({
      where: {
        productionItemId: { in: productionItemIds },
        exitSlip: { status: { not: "ابطال" } },
      },
      select: { barcode: true, productName: true },
    })
    if (alreadyExited.length > 0) {
      const names = alreadyExited
        .map((a) => a.barcode || a.productName)
        .join("، ")
      return NextResponse.json(
        { error: `این اقلام قبلاً در برگه خروج ثبت شده‌اند: ${names}` },
        { status: 409 }
      )
    }

    // اطلاعات اقلام تولید
    const productionItems = await prisma.productionItem.findMany({
      where: { id: { in: productionItemIds } },
      include: {
        productionOrder: {
          include: {
            order: { include: { customer: true, items: true } },
          },
        },
      },
    })

    if (productionItems.length === 0) {
      return NextResponse.json(
        { error: "اقلام انتخاب‌شده پیدا نشد" },
        { status: 404 }
      )
    }

    // فقط اقلامی قابل خروج‌اند که واقعاً به ایستگاه بارگیری منتقل شده باشند
    const loadingStations = await prisma.productionStation.findMany()
    const loadingIds = loadingStations
      .filter((s) => isLoadingName(s.name))
      .map((s) => s.id)
    if (loadingIds.length === 0) {
      return NextResponse.json(
        { error: "ایستگاه بارگیری تعریف نشده" },
        { status: 400 }
      )
    }
    const loadingRows = await prisma.productionItemStation.findMany({
      where: {
        productionItemId: { in: productionItemIds },
        stationId: { in: loadingIds },
      },
      select: { productionItemId: true, status: true },
    })
    const loadStatus = new Map<string, string>()
    for (const r of loadingRows) loadStatus.set(r.productionItemId, r.status)
    const notLoaded = productionItems.filter((item) => {
      const st = loadStatus.get(item.id)
      return !st || st === "در انتظار"
    })
    if (notLoaded.length > 0) {
      const names = notLoaded
        .map((i) => i.barcode || i.productName)
        .join("، ")
      return NextResponse.json(
        {
          error: `این اقلام هنوز به بارگیری منتقل نشده‌اند: ${names}`,
        },
        { status: 400 }
      )
    }

    const itemsData = productionItems.map((item) => {
      const order = item.productionOrder?.order
      const salesItem =
        order?.items?.find((si: any) => si.id === item.orderItemId) || null
      return {
        productionItemId: item.id,
        orderId: order?.id ?? null,
        orderNumber: order?.orderNumber ?? null,
        productName: item.productName,
        length: item.length,
        width: item.width,
        quantity: item.quantity || 1,
        meterage: item.meterage,
        installationCode: (salesItem as any)?.installationCode || null,
        servicesText: buildServicesText((salesItem as any)?.servicesData ?? null),
        notes: item.notes || (salesItem as any)?.notes || null,
        barcode: item.barcode,
      }
    })

    // ساخت شماره خروج (با چند بار تلاش در صورت تکراری بودن)
    let slip = null
    let lastError: any = null
    for (let attempt = 0; attempt < 5; attempt++) {
      const last = await prisma.exitSlip.findFirst({
        orderBy: { createdAt: "desc" },
        select: { exitNumber: true },
      })
      const lastNum = last
        ? parseInt(String(last.exitNumber).replace(/\D/g, ""), 10) || 0
        : 0
      const exitNumber = String(lastNum + 1 + attempt)

      try {
        slip = await prisma.exitSlip.create({
          data: {
            exitNumber,
            customerId: customerId || null,
            customerName,
            customerPhone:
              customerPhone ||
              productionItems[0]?.productionOrder?.order?.customer?.phone ||
              null,
            driverName: driverName || null,
            driverNationalId: driverNationalId || null,
            driverPhone: driverPhone || null,
            vehicleName: vehicleName || null,
            plateNumber: plateNumber || null,
            notes: notes || null,
            items: { create: itemsData },
          },
          include: { items: true },
        })
        break
      } catch (err: any) {
        lastError = err
        // P2002 = شماره خروج تکراری؛ دوباره تلاش می‌کنیم
        if (err?.code !== "P2002") throw err
      }
    }

    if (!slip) {
      throw lastError || new Error("ساخت شماره خروج ناموفق بود")
    }

    // مرحله‌ی جداگانه‌ی «رد بارگیری» حذف شده: با صدور برگه، بارگیری خودکار ثبت می‌شود
    const loadedAt = new Date()
    if (loadingIds.length > 0) {
      for (const item of productionItems) {
        const loadRow = await prisma.productionItemStation.findFirst({
          where: { productionItemId: item.id, stationId: { in: loadingIds } },
        })
        if (loadRow && loadRow.status !== "تکمیل شده") {
          const qty = loadRow.quantityIn ?? item.quantity ?? 1
          await prisma.productionItemStation.update({
            where: { id: loadRow.id },
            data: {
              status: "تکمیل شده",
              quantityOut: qty,
              quantityIn: 0,
              startedAt: loadRow.startedAt || loadedAt,
              completedAt: loadedAt,
            },
          })
          await prisma.productionHistory.create({
            data: {
              productionOrderId: item.productionOrderId,
              productionItemId: item.id,
              productionItemStationId: loadRow.id,
              stationId: loadRow.stationId,
              action: "بارگیری - صدور برگه خروج",
              description: `برگه خروج شماره ${slip.exitNumber} صادر شد`,
              oldStatus: loadRow.status,
              newStatus: "تکمیل شده",
              quantity: qty,
            },
          })
        }

        const allRows = await prisma.productionItemStation.findMany({
          where: { productionItemId: item.id },
          select: { status: true },
        })
        const allDone = allRows.every(
          (s) => s.status === "تکمیل شده" || s.status === "انجام در ایستگاه دیگر"
        )
        if (allDone) {
          await prisma.productionItem.update({
            where: { id: item.id },
            data: { status: "تکمیل‌شده", currentStationId: null },
          })
        }
      }
      await prisma.exitSlipItem.updateMany({
        where: { exitSlipId: slip.id },
        data: { loadedAt },
      })
    }

    const [slipWithCode] = await withCustomerCodes([slip])
    return NextResponse.json({ success: true, slip: slipWithCode })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: "خطا در ثبت برگه خروج", details: String(e?.message) },
      { status: 500 }
    )
  }
}