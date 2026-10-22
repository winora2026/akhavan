import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const filter = searchParams.get("filter") || "all" // today | overdue | pending | all

    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(now)
    endOfDay.setHours(23, 59, 59, 999)

    const where: any = {}
    if (filter === "today") {
      where.status = "PENDING"
      where.dueDate = { gte: startOfDay, lte: endOfDay }
    } else if (filter === "overdue") {
      where.status = "PENDING"
      where.dueDate = { lt: startOfDay }
    } else if (filter === "pending") {
      where.status = "PENDING"
    }

    const items = await prisma.followUp.findMany({
      where,
      orderBy: [{ dueDate: "asc" }],
      take: 200,
      include: {
        lead: true,
        customer: true,
        opportunity: true,
        assignedTo: { select: { id: true, displayName: true } },
      },
    })

    return NextResponse.json({ items })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در دریافت پیگیری‌ها" },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const {
      type = "CALL",
      description,
      dueDate,
      leadId,
      opportunityId,
      customerId,
      assignedToId,
    } = body

    if (!dueDate) {
      return NextResponse.json(
        { error: "تاریخ پیگیری الزامی است" },
        { status: 400 }
      )
    }

    const row = await prisma.followUp.create({
      data: {
        type,
        description: description || null,
        dueDate: new Date(dueDate),
        status: "PENDING",
        leadId: leadId || null,
        opportunityId: opportunityId || null,
        customerId: customerId || null,
        assignedToId: assignedToId || session.id || null,
      },
    })

    return NextResponse.json({ success: true, item: row }, { status: 201 })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در ثبت پیگیری" },
      { status: 500 }
    )
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { id, status, result } = body
    if (!id) {
      return NextResponse.json({ error: "id الزامی است" }, { status: 400 })
    }

    const data: any = {}
    if (status === "DONE") {
      data.status = "DONE"
      data.completedAt = new Date()
      if (result) data.result = result
    } else if (status === "PENDING") {
      data.status = "PENDING"
      data.completedAt = null
    }
    if (result !== undefined && status !== "DONE") data.result = result

    const row = await prisma.followUp.update({
      where: { id },
      data,
    })

    return NextResponse.json({ success: true, item: row })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در بروزرسانی" },
      { status: 500 }
    )
  }
}