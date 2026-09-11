import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const [
      totalOrders,
      waitingOrders,
      inProgressOrders,
      completedOrders,
      totalItems,
      waitingItems,
      inProgressItems,
      completedItems,
      unprintedLabels,
      printedLabels,
      reprintAllowed,
      stations,
    ] = await Promise.all([
      prisma.productionOrder.count(),
      prisma.productionOrder.count({ where: { status: "در انتظار" } }),
      prisma.productionOrder.count({ where: { status: "در حال تولید" } }),
      prisma.productionOrder.count({ where: { status: "تکمیل‌شده" } }),
      prisma.productionItem.count(),
      prisma.productionItem.count({ where: { status: "در انتظار" } }),
      prisma.productionItem.count({ where: { status: "در حال تولید" } }),
      prisma.productionItem.count({ where: { status: "تکمیل‌شده" } }),
      prisma.productionItem.count({ where: { labelStatus: "چاپ‌نشده" } }),
      prisma.productionItem.count({ where: { labelStatus: "چاپ‌شده" } }),
      prisma.productionItem.count({ where: { labelStatus: "مجاز چاپ مجدد" } }),
      prisma.productionStation.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      }),
    ])

    // تعداد کار آماده / در حال انجام در هر ایستگاه
    const stationStats = []
    for (const st of stations) {
      const waiting = await prisma.productionItemStation.count({
        where: { stationId: st.id, status: "در انتظار" },
      })
      const doing = await prisma.productionItemStation.count({
        where: { stationId: st.id, status: "در حال انجام" },
      })
      const done = await prisma.productionItemStation.count({
        where: { stationId: st.id, status: "تکمیل شده" },
      })
      stationStats.push({
        id: st.id,
        name: st.name,
        waiting,
        doing,
        done,
        active: waiting + doing,
      })
    }

    // آخرین سفارش‌های تولید
    const recentOrders = await prisma.productionOrder.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: {
        order: {
          include: { customer: true },
        },
        items: true,
      },
    })

    // ضایعات
    const wasteAgg = await prisma.waste.aggregate({
      _sum: { quantity: true },
      _count: true,
    })

    return NextResponse.json({
      orders: {
        total: totalOrders,
        waiting: waitingOrders,
        inProgress: inProgressOrders,
        completed: completedOrders,
      },
      items: {
        total: totalItems,
        waiting: waitingItems,
        inProgress: inProgressItems,
        completed: completedItems,
      },
      labels: {
        unprinted: unprintedLabels,
        printed: printedLabels,
        reprintAllowed,
      },
      waste: {
        count: wasteAgg._count || 0,
        quantity: wasteAgg._sum.quantity || 0,
      },
      stationStats,
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        productionNumber: o.productionNumber,
        status: o.status,
        priority: o.priority,
        customerName: o.order?.customer?.name,
        orderNumber: o.order?.orderNumber,
        itemsCount: o.items.length,
        createdAt: o.createdAt,
      })),
    })
  } catch (error: any) {
    console.error(error)
    return NextResponse.json(
      { error: "خطا در دریافت داشبورد", details: String(error?.message || error) },
      { status: 500 }
    )
  }
}