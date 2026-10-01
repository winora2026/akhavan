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

/** لیست برگه‌های خروج (برای جدول «آخرین برگه‌های خروج») */
export async function GET() {
  try {
    const slips = await prisma.exitSlip.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { items: true },
    })
    return NextResponse.json(slips)
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

    return NextResponse.json({ success: true, slip })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: "خطا در ثبت برگه خروج", details: String(e?.message) },
      { status: 500 }
    )
  }
}