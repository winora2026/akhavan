import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { safeDate } from "@/lib/date"

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

    const customerOrdersCount = await prisma.order.count({
      where: { customerId: customer.id },
    })
    const nextCustomerOrderNumber = String(customerOrdersCount + 1)

    // اولویت: mapImageUrl مستقیم، وگرنه اولین فایل از mapImages
    const resolvedMapImageUrl =
      mapImageUrl ||
      (Array.isArray(mapImages) && mapImages[0]?.url
        ? mapImages[0].url
        : null)

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
        installationDate: installDate ? safeDate(installDate) : null,
        installationAddress: installAddress || null,
        installationPhone: installPhone || null,
        installationNotes: installNotes || null,
        discountAmount: parseFloat(discountAmount) || 0,
        discountPercent:
          discountPercent != null && discountPercent !== ""
            ? parseFloat(discountPercent)
            : null,
        isOfficialInvoice: Boolean(isOfficialInvoice),
        isStop: false,
        status: "پیش‌فاکتور",
        mapImageUrl: resolvedMapImageUrl,
        notes: notes || (productionLine ? `خط تولید: ${productionLine}` : null),
        items: {
          create: (items || []).map((item: any, index: number) => ({
            productName: item.productName || "بدون نام",
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

    let productionOrder = null
    if (status === "فاکتور") {
      const existing = await prisma.productionOrder.findFirst({
        where: { orderId: order.id },
      })

      if (!existing) {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/production/orders`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: order.id }),
          }
        )

        if (res.ok) {
          productionOrder = await res.json()
        }
      }
    }

    return NextResponse.json({
      success: true,
      order,
      productionOrder,
    })
  } catch (error: any) {
    console.error("Error updating order:", error)
    return NextResponse.json(
      { error: error.message || "خطا در بروزرسانی سفارش" },
      { status: 500 }
    )
  }
}