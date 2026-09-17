import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { safeDate } from "@/lib/date"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        items: { orderBy: { sortOrder: "asc" } },
      },
    })

    if (!order) {
      return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 })
    }

    const orderWithParsedServices = {
      ...order,
      mapImages: (() => {
        if (!order.mapImages) return []
        try {
          return JSON.parse(order.mapImages)
        } catch (e) {
          console.error(`mapImages نامعتبر برای سفارش ${order.id}:`, e)
          return []
        }
      })(),
      items: order.items.map((item: any) => {
        let servicesData: any[] = []
        if (item.servicesData) {
          try {
            servicesData = JSON.parse(item.servicesData)
          } catch (e) {
            console.error(
              `servicesData نامعتبر برای آیتم ${item.id}:`,
              e
            )
            servicesData = []
          }
        }
        return { ...item, servicesData }
      }),
    }

    return NextResponse.json(orderWithParsedServices)
  } catch (error: any) {
    console.error("Error fetching order:", error)
    return NextResponse.json(
      { error: error.message || "خطا در دریافت سفارش" },
      { status: 500 }
    )
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    const existingOrder = await prisma.order.findUnique({ where: { id } })
    if (!existingOrder) {
      return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 })
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

    await prisma.orderItem.deleteMany({ where: { orderId: id } })

    // اولویت: mapImageUrl مستقیم، وگرنه اولین فایل از mapImages
    const resolvedMapImageUrl =
      mapImageUrl ||
      (Array.isArray(mapImages) && mapImages[0]?.url
        ? mapImages[0].url
        : null)

    const resolvedMapImages =
      Array.isArray(mapImages) && mapImages.length
        ? JSON.stringify(mapImages)
        : null

    const order = await prisma.order.update({
      where: { id },
      data: {
        customerId: customer.id,
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
              parseFloat(String(item.totalPrice || "0").replace(/,/g, "")) ||
              0,
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

    return NextResponse.json({ success: true, order })
  } catch (error: any) {
    console.error("Error updating order:", error)
    return NextResponse.json(
      { error: error.message || "خطا در بروزرسانی سفارش", details: error.meta || null },
      { status: 500 }
    )
  }
}