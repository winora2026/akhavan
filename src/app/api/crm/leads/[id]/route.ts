import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        assignedTo: {
          select: { id: true, displayName: true, username: true },
        },
        customer: true,
        lostReason: true,
        activities: {
          orderBy: { activityAt: "desc" },
          take: 50,
          include: {
            createdBy: { select: { displayName: true } },
          },
        },
        followUps: {
          orderBy: { dueDate: "desc" },
          take: 30,
          include: {
            assignedTo: { select: { displayName: true } },
          },
        },
      },
    })
    if (!lead) {
      return NextResponse.json({ error: "سرنخ یافت نشد" }, { status: 404 })
    }
    return NextResponse.json(lead)
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در دریافت سرنخ" },
      { status: 500 }
    )
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    const { id } = await params
    const body = await req.json()

    const existing = await prisma.lead.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: "سرنخ یافت نشد" }, { status: 404 })
    }

    const data: any = {}
    if (body.status != null) data.status = String(body.status)
    if (body.nextAction != null) data.nextAction = String(body.nextAction).trim()
    if (body.nextActionDate != null) {
      const d = new Date(body.nextActionDate)
      if (!isNaN(d.getTime())) data.nextActionDate = d
    }
    if (body.description != null) data.description = body.description
    if (body.productInterest != null) data.productInterest = body.productInterest
    if (body.mobile != null) data.mobile = body.mobile
    if (body.city != null) data.city = body.city
    if (body.companyName != null) data.companyName = body.companyName
    if (body.estimatedValue != null && body.estimatedValue !== "") {
      data.estimatedValue = Number(body.estimatedValue)
    }
    data.lastActivityAt = new Date()

    const lead = await prisma.lead.update({
      where: { id },
      data,
      include: {
        assignedTo: {
          select: { id: true, displayName: true, username: true },
        },
        customer: true,
      },
    })

    if (body.status && body.status !== existing.status && session?.id) {
      await prisma.activity.create({
        data: {
          type: "STATUS",
          title: "تغییر وضعیت",
          description: `${existing.status} → ${body.status}`,
          leadId: id,
          createdById: session.id,
          activityAt: new Date(),
        },
      })
    }

    // اگر اقدام بعدی جدید فرستاده شد، یک FollowUp باز بساز
    if (body.createFollowUp && body.nextAction && body.nextActionDate) {
      const due = new Date(body.nextActionDate)
      if (!isNaN(due.getTime())) {
        await prisma.followUp.create({
          data: {
            type: "CALL",
            description: String(body.nextAction).trim(),
            dueDate: due,
            status: "PENDING",
            leadId: id,
            assignedToId: lead.assignedToId || session?.id || null,
          },
        })
      }
    }

    return NextResponse.json(lead)
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در بروزرسانی" },
      { status: 500 }
    )
  }
}