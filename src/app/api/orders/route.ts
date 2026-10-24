import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { safeDate } from "@/lib/date"
import { getSession } from "@/lib/auth"
import { createProductionOrderFromSales } from "@/lib/createProductionOrder"
import { withTotals } from "@/lib/orderTotals"

// ───────────── سریال شماره‌ی سفارش ─────────────
// دو سریال جدا داریم و شماره‌ی سفارش همان شماره‌ی فاکتور سپیدار می‌شود:
//   خریداری: چهار رقمی (از ۳۳۹۶ به بعد)
//   اجرتی:   سریال ۹۰۰xxx (از ۹۰۰۵۷۴ به بعد)
// سفارشی که «خط تولید»ش اجرتی باشد سریال اجرتی می‌گیرد، بقیه سریال خریداری.
const RENTAL_PRODUCTION_LINE = "اجرتی"

// خریداری: شروع شماره‌ی سفارش
const PURCHASE_ORDER_NUMBER_START = 3396
const PURCHASE_ORDER_NUMBER_MAX = 99999

// اجرتی: شروع سریال. باید از آخرین شماره‌ی اجرتی در سپیدار و نرم‌افزار قدیمی
// بزرگ‌تر باشد و اگر نرم‌افزار قدیمی هنوز کار می‌کند، با آن تداخل نکند.
const RENTAL_ORDER_NUMBER_START = 900574
const RENTAL_ORDER_NUMBER_MIN = 900000
const RENTAL_ORDER_NUMBER_MAX = 999999

async function getNextOrderNumber(isRental: boolean) {
  const all = await prisma.order.findMany({
    select: { orderNumber: true },
  })

  const nums = all
    .map((o: any) => parseInt(String(o.orderNumber), 10))
    .filter((n: number) => !isNaN(n))

  const start = isRental ? RENTAL_ORDER_NUMBER_START : PURCHASE_ORDER_NUMBER_START
  const min = isRental ? RENTAL_ORDER_NUMBER_MIN : PURCHASE_ORDER_NUMBER_START
  const max = isRental ? RENTAL_ORDER_NUMBER_MAX : PURCHASE_ORDER_NUMBER_MAX

  const inSeries = nums.filter((n: number) => n >= min && n <= max)
  const next = inSeries.length > 0 ? Math.max(...inSeries) + 1 : start

  return Math.max(next, start)
}

export async function GET() {
  try {
    const orders = await prisma.order.findMany({
      include: {
        customer: true,
        items: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    // هر سفارش با subtotalAmount / totalAfterDiscount / vatAmount / finalTotal برمی‌گردد
    return NextResponse.json(orders.map((o: any) => withTotals(o)))
  } catch (error: any) {
    console.error("Error fetching orders:", error)
    return NextResponse.json(
      { error: error.message || "خطا در دریافت سفارش‌ها" },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      customerName,
      customerGroup,
      productionLine,
      priority,
      orderDate,
      deliveryDate,
      hasInstallation,
      installDate,
      installAddress,
      installPhone,
      installNotes,
      discountAmount,
      discountPercent,
      extraAmount,
      isOfficialInvoice,
      totalQuantity,
      totalMeterage,
      items,
      notes,
      mapImageUrl,
      mapImages,
    } = body

    if (!customerName) {
      return NextResponse.json(
        { error: "نام مشتری الزامی است" },
        { status: 400 }
      )
    }

    let customer = await prisma.customer.findFirst({
      where: { name: customerName.trim() },
    })

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          name: customerName.trim(),
          customerCode: `C-${Date.now()}`,
          customerGroup: customerGroup || "همکار",
          notes: productionLine ? `خط تولید: ${productionLine}` : null,
        },
      })
    }

    // سریال سفارش: اجرتی (۹۰۰xxx) یا خریداری (چهار رقمی)
    const isRental = String(productionLine || "").trim() === RENTAL_PRODUCTION_LINE

    const customerOrdersCount = await prisma.order.count({
      where: { customerId: customer.id },
    })
    const nextCustomerOrderNumber = String(customerOrdersCount + 1)

    const resolvedMapImageUrl =
      mapImageUrl ||
      (Array.isArray(mapImages) && mapImages[0]?.url
        ? mapImages[0].url
        : null)

    const resolvedMapImages =
      Array.isArray(mapImages) && mapImages.length
        ? JSON.stringify(mapImages)
        : null

    const session = await getSession()
    const salesRepName = session?.displayName || null

    const itemsData = (items || []).map((item: any, index: number) => ({
      productName: item.productName || "بدون نام",
      // کد کالا (برای تشخیص آیتم درست در سپیدار، مخصوصاً وقتی دو کالا هم‌نام هستند)
      productCode: item.productCode ? String(item.productCode).trim() : null,
      pieceNumber: item.partNumber || null,
      installationCode: item.installCode || null,
      unit: item.unit || null,
      length: parseFloat(item.length) || 0,
      width: parseFloat(item.width) || 0,
      quantity: parseInt(item.quantity) || 1,
      meterage: parseFloat(item.meterage) || 0,
      perimeter: parseFloat(item.perimeter) || 0,
      unitPrice:
        parseFloat(String(item.unitPrice || "0").replace(/,/g, "")) || 0,
      totalPrice:
        parseFloat(String(item.totalPrice || "0").replace(/,/g, "")) || 0,
      notes: item.description || null,
      flagged: Boolean(item.flagged),
      servicesData: item.services?.length
        ? JSON.stringify(item.services)
        : null,
      sortOrder: index,
    }))

    // ساخت سفارش؛ اگر دو نفر هم‌زمان ثبت کنند و شماره تکراری شد، شماره دوباره محاسبه می‌شود
    let order: any = null
    let nextOrderNumber = 0
    let lastError: any = null

    for (let attempt = 0; attempt < 5; attempt++) {
      nextOrderNumber = await getNextOrderNumber(isRental)

      try {
        order = await prisma.order.create({
          data: {
            salesRep: salesRepName,
            orderNumber: String(nextOrderNumber),
            customerId: customer.id,
            customerOrderNumber: nextCustomerOrderNumber,
            orderDate: safeDate(orderDate),
            deliveryDate: deliveryDate ? safeDate(deliveryDate) : null,
            priority: priority || "عادی",
            totalMeterage: parseFloat(totalMeterage) || 0,
            totalQuantity: parseInt(totalQuantity) || 0,
            hasInstallation: Boolean(hasInstallation),
            installationDate: installDate ? safeDate(installDate) : null,
            installationAddress: installAddress || null,
            installationPhone: installPhone || null,
            installationNotes: installNotes || null,
            discountAmount: parseFloat(discountAmount) || 0,
            discountPercent:
              discountPercent != null && discountPercent !== ""
                ? parseFloat(discountPercent)
                : null,
            extraAmount: parseFloat(extraAmount) || 0,
            isOfficialInvoice: Boolean(isOfficialInvoice),
            isStop: false,
            status: "پیش‌فاکتور",
            mapImageUrl: resolvedMapImageUrl,
            mapImages: resolvedMapImages,
            notes:
              notes || (productionLine ? `خط تولید: ${productionLine}` : null),
            items: { create: itemsData },
          },
          include: {
            customer: true,
            items: true,
          },
        })
        break
      } catch (err: any) {
        lastError = err
        // P2002 = شماره‌ی سفارش تکراری؛ دوباره از دیتابیس محاسبه و تلاش می‌کنیم
        if (err?.code !== "P2002") throw err
      }
    }

    if (!order) {
      throw lastError || new Error("ساخت شماره‌ی سفارش ناموفق بود")
    }

    return NextResponse.json(
      {
        success: true,
        order: withTotals(order),
        assignedOrderNumber: nextOrderNumber,
        assignedCustomerOrderNumber: nextCustomerOrderNumber,
        orderKind: isRental ? "اجرتی" : "خریداری",
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error("Error creating order:", error)
    return NextResponse.json(
      {
        error: error.message || "خطا در ذخیره سفارش",
        details: error.meta || null,
      },
      { status: 500 }
    )
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, status, convertedBy, orderDate, deliveryDate } = body

    if (!id || !status) {
      return NextResponse.json(
        { error: "id و status الزامی است" },
        { status: 400 }
      )
    }

    // برگرداندن فاکتور به پیش‌فاکتور فقط اگر برش شروع نشده باشد
    if (status === "پیش‌فاکتور") {
      const prod = await prisma.productionOrder.findFirst({
        where: { orderId: id },
        include: {
          items: {
            include: {
              stations: { include: { station: true } },
            },
          },
        },
      })

      if (prod) {
        const cutStarted = prod.items.some((item) =>
          item.stations.some(
            (s) =>
              s.station?.name === "برش" &&
              (s.status === "در حال انجام" || s.status === "تکمیل شده")
          )
        )
        if (cutStarted) {
          return NextResponse.json(
            {
              error:
                "این سفارش وارد ایستگاه برش شده و قابل برگشت به پیش‌فاکتور نیست",
            },
            { status: 400 }
          )
        }

        await prisma.productionHistory.deleteMany({
          where: { productionOrderId: prod.id },
        })
        await prisma.productionItemStation.deleteMany({
          where: { productionItem: { productionOrderId: prod.id } },
        })
        await prisma.productionItem.deleteMany({
          where: { productionOrderId: prod.id },
        })
        await prisma.productionOrder.delete({ where: { id: prod.id } })
      }
    }

    // تاریخ تحویل (و در صورت ارسال، orderDate) فقط هنگام تبدیل به فاکتور
    const dateUpdates: { orderDate?: Date; deliveryDate?: Date } = {}
    if (status === "فاکتور") {
      if (orderDate) dateUpdates.orderDate = safeDate(orderDate)
      if (deliveryDate) dateUpdates.deliveryDate = safeDate(deliveryDate)
    }

    // نام منتقل‌کننده: از body یا از نشست لاگین
    const session = await getSession()
    const whoConverted =
      (convertedBy && String(convertedBy).trim()) ||
      session?.displayName ||
      null

    const order = await prisma.order.update({
      where: { id },
      data: {
        status,
        ...dateUpdates,
        ...(status === "فاکتور"
          ? {
              convertedBy: whoConverted,
              invoicedAt: new Date(),
              // برای سازگاری با گزارش‌های قدیمی notes هم نگه داشته می‌شود
              notes: whoConverted
                ? `تبدیل شده توسط: ${whoConverted}`
                : undefined,
            }
          : {}),
        ...(status === "پیش‌فاکتور"
          ? {
              convertedBy: null,
              invoicedAt: null,
            }
          : {}),
      },
      include: {
        customer: true,
        items: true,
      },
    })

    let productionOrder = null
    let productionError: string | null = null

    if (status === "فاکتور") {
      const existing = await prisma.productionOrder.findFirst({
        where: { orderId: order.id },
      })

      if (!existing) {
        const result = await createProductionOrderFromSales(order.id)
        if (result.ok) {
          productionOrder = result.data
        } else {
          productionError = result.error
          console.error("production create failed:", result.error)
        }
      }
    }

    return NextResponse.json({
      success: true,
      order: withTotals(order),
      productionOrder,
      productionError,
    })
  } catch (error: any) {
    console.error("Error updating order:", error)
    return NextResponse.json(
      { error: error.message || "خطا در بروزرسانی سفارش" },
      { status: 500 }
    )
  }
}