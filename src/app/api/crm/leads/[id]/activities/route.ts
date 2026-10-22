import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    const { id } = await params
    const body = await req.json()

    const lead = await prisma.lead.findUnique({ where: { id } })
    if (!lead) {
      return NextResponse.json({ error: "سرنخ یافت نشد" }, { status: 404 })
    }

    const title = String(body.title || body.description || "یادداشت").trim()
    const description = body.description
      ? String(body.description).trim()
      : null
    const type = String(body.type || "NOTE")

    const activity = await prisma.activity.create({
      data: {
        type,
        title,
        description,
        leadId: id,
        customerId: lead.customerId,
        createdById: session?.id || null,
        activityAt: new Date(),
      },
    })

    await prisma.lead.update({
      where: { id },
      data: { lastActivityAt: new Date() },
    })

    // پیگیری بعدی اختیاری
    if (body.nextAction && body.nextActionDate) {
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
        await prisma.lead.update({
          where: { id },
          data: {
            nextAction: String(body.nextAction).trim(),
            nextActionDate: due,
          },
        })
      }
    }

    return NextResponse.json(activity, { status: 201 })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در ثبت فعالیت" },
      { status: 500 }
    )
  }
}