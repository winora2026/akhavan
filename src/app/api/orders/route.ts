import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { safeDate } from "@/lib/date"
import { getSession } from "@/lib/auth"
import { createProductionOrderFromSales } from "@/lib/createProductionOrder"

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

    const order = await prisma.order.create({
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
        isOfficialInvoice: Boolean(isOfficialInvoice),
        isStop: false,
        status: "پیش‌فاکتور",
        mapImageUrl: resolvedMapImageUrl,
        mapImages: resolvedMapImages,
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

    const order = await prisma.order.update({
      where: { id },
      data: {
        status,
        notes: convertedBy ? `تبدیل شده توسط: ${convertedBy}` : undefined,
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
        // مستقیم با Prisma — بدون fetch به localhost
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
      order,
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