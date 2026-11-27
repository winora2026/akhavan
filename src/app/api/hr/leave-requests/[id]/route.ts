import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "وارد شوید" }, { status: 401 })
    const { id } = await params
    const body = await req.json()
    const action = String(body.action || "").toUpperCase()

    const existing = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { employee: true },
    })
    if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 })

    if (action === "CANCEL") {
      if (existing.status !== "PENDING") {
        return NextResponse.json({ error: "فقط در انتظار قابل لغو است" }, { status: 400 })
      }
      const item = await prisma.leaveRequest.update({
        where: { id },
        data: { status: "CANCELLED" },
        include: { employee: true },
      })
      return NextResponse.json({ success: true, item })
    }

    if (!["admin", "finance"].includes(session.role)) {
      return NextResponse.json({ error: "دسترسی مدیر لازم است" }, { status: 403 })
    }
    if (!["APPROVE", "REJECT"].includes(action)) {
      return NextResponse.json({ error: "عملیات نامعتبر" }, { status: 400 })
    }
    if (existing.status !== "PENDING") {
      return NextResponse.json({ error: "قبلاً بررسی شده" }, { status: 400 })
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

    if (status === "APPROVED") {
      const year = 1405
      const leaveType = existing.type.includes("استحقاقی")
        ? "استحقاقی"
        : existing.type.includes("استعلاجی")
          ? "استعلاجی"
          : "استحقاقی"

      let bal = await prisma.leaveBalance.findUnique({
        where: {
          employeeId_year_leaveType: {
            employeeId: existing.employeeId,
            year,
            leaveType,
          },
        },
      })
      if (!bal && leaveType === "استحقاقی") {
        bal = await prisma.leaveBalance.create({
          data: {
            employeeId: existing.employeeId,
            year,
            leaveType,
            entitled: 30,
            remaining: 30,
          },
        })
      }
      if (bal) {
        if (existing.amountUnit === "HOUR") {
          const usedH = bal.usedHours + existing.amount
          await prisma.leaveBalance.update({
            where: { id: bal.id },
            data: {
              usedHours: usedH,
              remainingHours: Math.max(0, bal.entitledHours - usedH),
            },
          })
        } else {
          const used = bal.used + existing.amount
          await prisma.leaveBalance.update({
            where: { id: bal.id },
            data: {
              used,
              remaining: Math.max(0, bal.entitled - used),
            },
          })
        }
      }
    }

    return NextResponse.json({ success: true, item })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}