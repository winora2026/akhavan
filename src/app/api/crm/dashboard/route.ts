import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(now)
    endOfDay.setHours(23, 59, 59, 999)

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [
      leadsNew,
      leadsNewMonth,
      leadsActive,
      followUpsToday,
      followUpsOverdue,
      opportunitiesOpen,
      oppValue,
      preInvoices,
      preInvoiceValue,
    ] = await Promise.all([
      prisma.lead.count({
        where: { status: "NEW", createdAt: { gte: startOfDay } },
      }),
      prisma.lead.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      prisma.lead.count({
        where: {
          status: { in: ["NEW", "CONTACTED", "QUALIFIED"] },
        },
      }),
      prisma.followUp.count({
        where: {
          status: "PENDING",
          dueDate: { gte: startOfDay, lte: endOfDay },
        },
      }),
      prisma.followUp.count({
        where: {
          status: "PENDING",
          dueDate: { lt: startOfDay },
        },
      }),
      prisma.opportunity.count({
        where: { status: "OPEN" },
      }),
      prisma.opportunity.aggregate({
        where: { status: "OPEN" },
        _sum: { estimatedValue: true },
      }),
      prisma.order.count({
        where: { status: "پیش‌فاکتور" },
      }),
      prisma.order.findMany({
        where: { status: "پیش‌فاکتور" },
        include: { items: true },
      }),
    ])

    const preTotal = preInvoiceValue.reduce((sum, o) => {
      const itemsSum = o.items.reduce((s, i) => s + (i.totalPrice || 0), 0)
      return sum + itemsSum - (o.discountAmount || 0)
    }, 0)

    const overdueList = await prisma.followUp.findMany({
      where: { status: "PENDING", dueDate: { lt: startOfDay } },
      take: 8,
      orderBy: { dueDate: "asc" },
      include: {
        lead: true,
        customer: true,
        assignedTo: { select: { displayName: true } },
      },
    })

    const todayList = await prisma.followUp.findMany({
      where: {
        status: "PENDING",
        dueDate: { gte: startOfDay, lte: endOfDay },
      },
      take: 8,
      orderBy: { dueDate: "asc" },
      include: {
        lead: true,
        customer: true,
        assignedTo: { select: { displayName: true } },
      },
    })

    return NextResponse.json({
      cards: {
        leadsNewToday: leadsNew,
        leadsNewMonth: leadsNewMonth,
        leadsActive,
        followUpsToday,
        followUpsOverdue,
        opportunitiesOpen,
        opportunitiesValue: oppValue._sum.estimatedValue || 0,
        preInvoicesCount: preInvoices,
        preInvoicesValue: preTotal,
      },
      overdueList,
      todayList,
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در داشبورد CRM" },
      { status: 500 }
    )
  }
}