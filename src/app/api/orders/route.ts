import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// ------------------ توابع کمکی ------------------

function toEnglishDigits(str: string): string {
  return str
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d).toString())
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString())
}

function safeDate(value: any): Date {
  if (!value) {
    return new Date()
  }

  if (value instanceof Date && !isNaN(value.getTime())) {
    return value
  }

  let str = String(value).trim()
  str = toEnglishDigits(str)

  const jalaliMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
  if (jalaliMatch) {
    const year = parseInt(jalaliMatch[1])
    const month = parseInt(jalaliMatch[2]) - 1
    const day = parseInt(jalaliMatch[3])

    if (year > 1300 && year < 1500) {
  const gYear = year + 621
  return new Date(Date.UTC(gYear, month, day, 12, 0, 0))
}

    return new Date(Date.UTC(year, month, day, 12, 0, 0))
  }

  const d = new Date(str)
  if (!isNaN(d.getTime()) && d.getFullYear() > 1900 && d.getFullYear() < 2100) {
    return d
  }

  return new Date()
}

// ===================== GET (لیست سفارش‌ها) =====================

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

    return NextResponse.json(orders)
  } catch (error: any) {
    console.error("Error fetching orders:", error)
    return NextResponse.json(
      { error: error.message || "خطا در دریافت سفارش‌ها" },
      { status: 500 }
    )
  }
}

// ===================== POST (ایجاد سفارش) =====================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      customerName,
      customerGroup,
      customerOrderNumber,
      productionLine,
      priority,
      orderDate,
      deliveryDate,
      hasInstallation,
      totalQuantity,
      totalMeterage,
      items,
      notes,
    } = body

    if (!customerName) {
      return NextResponse.json(
        { error: "نام مشتری الزامی است" },
        { status: 400 }
      )
    }

    // ۱. پیدا کردن یا ساخت مشتری
    let customer = await prisma.customer.findFirst({
      where: { name: customerName.trim() },
    })

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          name: customerName.trim(),
          customerGroup: customerGroup || "همکار",
          notes: productionLine ? `خط تولید: ${productionLine}` : null,
        },
      })
    }

    // ۲. محاسبه شماره سفارش بعدی (اتوماتیک)
    const allOrders = await prisma.order.findMany({
      select: { orderNumber: true },
    })

    let nextOrderNumber = 500

const numericNumbers = allOrders
  .map((o: any) => parseInt(String(o.orderNumber)))
  .filter((n: number) => !isNaN(n) && n >= 500 && n < 100000)

if (numericNumbers.length > 0) {
  nextOrderNumber = Math.max(...numericNumbers) + 1
}
    // ۳. محاسبه شماره سفارش مشتری (اتوماتیک)
    const customerOrdersCount = await prisma.order.count({
      where: { customerId: customer.id },
    })
    const nextCustomerOrderNumber = String(customerOrdersCount + 1)

    // ۴. ساخت سفارش
    const order = await prisma.order.create({
      data: {
        orderNumber: String(nextOrderNumber),
        customerId: customer.id,
        customerOrderNumber: nextCustomerOrderNumber,
        orderDate: safeDate(orderDate),
        deliveryDate: deliveryDate ? safeDate(deliveryDate) : null,
        priority: priority || "عادی",
        totalMeterage: parseFloat(totalMeterage) || 0,
        totalQuantity: parseInt(totalQuantity) || 0,
        hasInstallation: Boolean(hasInstallation),
        isStop: false,
        status: "پیش‌فاکتور",
        notes: notes || (productionLine ? `خط تولید: ${productionLine}` : null),
        items: {
          create: (items || []).map((item: any, index: number) => ({
            productName: item.productName || "بدون نام",
            pieceNumber: item.partNumber || null,
            installationCode: item.installCode || null,
            length: parseFloat(item.length) || 0,
            width: parseFloat(item.width) || 0,
            quantity: parseInt(item.quantity) || 1,
            meterage: parseFloat(item.meterage) || 0,
            perimeter: parseFloat(item.perimeter) || 0,
            unitPrice: parseFloat(String(item.unitPrice || "0").replace(/,/g, "")) || 0,
            totalPrice: parseFloat(String(item.totalPrice || "0").replace(/,/g, "")) || 0,
            notes: item.description || null,
            sortOrder: index,
          })),
        },
      },
      include: {
        customer: true,
        items: true,
      },
    })

    return NextResponse.json(
      {
        success: true,
        order,
        assignedOrderNumber: nextOrderNumber,
        assignedCustomerOrderNumber: nextCustomerOrderNumber,
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

// ===================== PATCH (بروزرسانی وضعیت) =====================

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, status, convertedBy } = body

    if (!id || !status) {
      return NextResponse.json(
        { error: "id و status الزامی است" },
        { status: 400 }
      )
    }

    const order = await prisma.order.update({
      where: { id },
      data: {
        status: status,
        notes: convertedBy ? `تبدیل شده توسط: ${convertedBy}` : undefined,
      },
      include: {
        customer: true,
        items: true,
      },
    })

    return NextResponse.json({ success: true, order })
  } catch (error: any) {
    console.error("Error updating order:", error)
    return NextResponse.json(
      { error: error.message || "خطا در بروزرسانی سفارش" },
      { status: 500 }
    )
  }
}