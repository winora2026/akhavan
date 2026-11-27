import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "وارد شوید" }, { status: 401 })
    }
    const { id } = await params
    const body = await req.json()
    const action = String(body.action || "").toUpperCase()

    const existing = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { employee: true },
    })
    if (!existing) {
      return NextResponse.json({ error: "یافت نشد" }, { status: 404 })
    }

    // لغو توسط خود درخواست‌دهنده
    if (action === "CANCEL") {
      if (existing.status !== "PENDING") {
        return NextResponse.json(
          { error: "فقط درخواست در انتظار قابل لغو است" },
          { status: 400 }
        )
      }
      const item = await prisma.leaveRequest.update({
        where: { id },
        data: { status: "CANCELLED" },
        include: { employee: true },
      })
      return NextResponse.json({ success: true, item })
    }

    // تأیید / رد فقط مدیر
    if (!["admin", "finance"].includes(session.role)) {
      return NextResponse.json({ error: "دسترسی مدیر لازم است" }, { status: 403 })
    }
    if (!["APPROVE", "REJECT"].includes(action)) {
      return NextResponse.json({ error: "عملیات نامعتبر" }, { status: 400 })
    }
    if (existing.status !== "PENDING") {
      return NextResponse.json(
        { error: "این درخواست قبلاً بررسی شده" },
        { status: 400 }
      )
    }

    const status = action === "APPROVE" ? "APPROVED" : "REJECTED"
    const item = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status,
        reviewedBy: session.displayName,
        reviewedAt: new Date(),
        reviewNote: body.reviewNote?.trim() || null,
      },
      include: { employee: true },
    })

    // در صورت تأیید استحقاقی، مانده را کم کن (اگر رکورد مانده باشد)
    if (status === "APPROVED" && existing.type.includes("استحقاقی")) {
      const bal = await prisma.leaveBalance.findUnique({
        where: {
          employeeId_year: {
            employeeId: existing.employeeId,
            year: 1405,
          },
        },
      })
      if (bal) {
        const used = bal.usedDays + existing.days
        await prisma.leaveBalance.update({
          where: { id: bal.id },
          data: {
            usedDays: used,
            remainingDays: Math.max(0, bal.entitledDays - used),
          },
        })
      }
    }

    return NextResponse.json({ success: true, item })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}