import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { safeDate } from "@/lib/date"

function dayCount(start: Date, end: Date) {
  const s = new Date(start)
  s.setHours(0, 0, 0, 0)
  const e = new Date(end)
  e.setHours(0, 0, 0, 0)
  const diff = Math.round((e.getTime() - s.getTime()) / 86400000) + 1
  return diff > 0 ? diff : 1
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "وارد شوید" }, { status: 401 })
    }
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status") || "ALL"
    const mine = searchParams.get("mine") === "1"
    const isManager = ["admin", "finance"].includes(session.role)

    const where: any = {}
    if (status !== "ALL") where.status = status

    if (mine || !isManager) {
      const emp = await prisma.employee.findFirst({
        where: {
          OR: [
            { userId: session.id },
            { displayName: session.displayName },
          ],
        },
      })
      if (!emp) return NextResponse.json({ items: [] })
      where.employeeId = emp.id
    }

    const items = await prisma.leaveRequest.findMany({
      where,
      include: { employee: true },
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json({ items })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "وارد شوید" }, { status: 401 })
    }
    const body = await req.json()
    const type = String(body.type || "").trim()
    const startDate = body.startDate ? safeDate(body.startDate) : null
    const endDate = body.endDate ? safeDate(body.endDate) : null
    if (!type || !startDate || !endDate) {
      return NextResponse.json(
        { error: "نوع و بازه تاریخ الزامی است" },
        { status: 400 }
      )
    }

    let employee = await prisma.employee.findFirst({
      where: {
        OR: [
          { userId: session.id },
          { displayName: session.displayName },
        ],
      },
    })

    // اگر پرسنل وصل نبود، با نام کاربر یک رکورد ساده بساز (ادمین بعداً کد پرسنلی بدهد)
    if (!employee) {
      const code = `T-${Date.now().toString().slice(-6)}`
      const parts = session.displayName.trim().split(/\s+/)
      const firstName = parts[0] || session.displayName
      const lastName = parts.slice(1).join(" ") || "—"
      employee = await prisma.employee.create({
        data: {
          personnelCode: code,
          firstName,
          lastName,
          displayName: session.displayName,
          userId: session.id,
        },
      })
    }

    const days =
      typeof body.days === "number" && body.days > 0
        ? body.days
        : dayCount(startDate, endDate)

    const item = await prisma.leaveRequest.create({
      data: {
        employeeId: employee.id,
        type,
        startDate,
        endDate,
        days,
        description: body.description?.trim() || null,
        status: "PENDING",
        requestedBy: session.displayName,
      },
      include: { employee: true },
    })

    return NextResponse.json({ success: true, item }, { status: 201 })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}