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

/** کد مشتری هر برگه را از جدول مشتری می‌آورد (برای چاپ بالای برگه‌ی خروج) */
async function withCustomerCodes<
  T extends { customerId: string | null; customerName: string }
>(slips: T[]): Promise<(T & { customerCode: string | null })[]> {
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
        select: { id: true, customerCode: true },
      })
    : []
  const byNameRows = names.length
    ? await prisma.customer.findMany({
        where: { name: { in: names } },
        select: { name: true, customerCode: true },
      })
    : []
  const byId = new Map<string, string | null>()
  byIdRows.forEach((c) => byId.set(c.id, c.customerCode))
  const byName = new Map<string, string | null>()
  byNameRows.forEach((c) => byName.set(c.name, c.customerCode))

  return slips.map((s) => ({
    ...s,
    customerCode:
      (s.customerId ? byId.get(s.customerId) : null) ??
      byName.get(s.customerName) ??
      null,
  }))
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
            customerPhone: customerPhone || null,
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