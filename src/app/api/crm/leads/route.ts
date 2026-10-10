import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status") || ""
    const source = searchParams.get("source") || ""
    const q = (searchParams.get("q") || "").trim()
    const assignedToId = searchParams.get("assignedToId") || ""

    const where: any = {}
    if (status) where.status = status
    if (source) where.source = source
    if (assignedToId) where.assignedToId = assignedToId
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { companyName: { contains: q } },
        { mobile: { contains: q } },
        { phone: { contains: q } },
        { city: { contains: q } },
      ]
    }

    const leads = await prisma.lead.findMany({
      where,
      include: {
        assignedTo: {
          select: { id: true, displayName: true, username: true },
        },
        customer: { select: { id: true, name: true } },
        lostReason: true,
      },
      orderBy: [{ nextActionDate: "asc" }, { createdAt: "desc" }],
    })

    return NextResponse.json(leads)
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در دریافت Leadها" },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const body = await req.json()

    const name = String(body.name || "").trim()
    if (!name) {
      return NextResponse.json({ error: "نام Lead الزامی است" }, { status: 400 })
    }

    const nextAction = body.nextAction ? String(body.nextAction).trim() : null
    const nextActionDate = body.nextActionDate
      ? new Date(body.nextActionDate)
      : null

    // قانون MVP: Lead فعال بهتر است Next Action داشته باشد
    if (!nextAction || !nextActionDate || isNaN(nextActionDate.getTime())) {
      return NextResponse.json(
        { error: "برای Lead جدید، اقدام بعدی و تاریخ آن الزامی است" },
        { status: 400 }
      )
    }

    const assignedToId =
      body.assignedToId ||
      session?.id ||
      null

    const lead = await prisma.lead.create({
      data: {
        name,
        companyName: body.companyName || null,
        mobile: body.mobile || null,
        phone: body.phone || null,
        whatsapp: body.whatsapp || body.mobile || null,
        city: body.city || null,
        customerType: body.customerType || null,
        productInterest: body.productInterest || null,
        description: body.description || null,
        source: body.source || "Other",
        campaign: body.campaign || null,
        status: body.status || "NEW",
        estimatedValue:
          body.estimatedValue != null && body.estimatedValue !== ""
            ? Number(body.estimatedValue)
            : null,
        probability:
          body.probability != null && body.probability !== ""
            ? Number(body.probability)
            : null,
        nextAction,
        nextActionDate,
        assignedToId,
        lastActivityAt: new Date(),
      },
      include: {
        assignedTo: {
          select: { id: true, displayName: true, username: true },
        },
      },
    })

    // اولین فعالیت + اولین پیگیری
    if (session?.id || assignedToId) {
      await prisma.activity.create({
        data: {
          type: "NOTE",
          title: "ایجاد Lead",
          description: `Lead از منبع ${lead.source} ایجاد شد`,
          leadId: lead.id,
          createdById: session?.id || assignedToId,
          activityAt: new Date(),
        },
      })
    }

    await prisma.followUp.create({
      data: {
        type: "CALL",
        description: nextAction,
        dueDate: nextActionDate,
        status: "PENDING",
        leadId: lead.id,
        assignedToId: assignedToId,
      },
    })

    return NextResponse.json(lead, { status: 201 })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در ایجاد Lead" },
      { status: 500 }
    )
  }
}