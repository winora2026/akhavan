import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { safeDate } from "@/lib/date"

function daysBetween(start: Date, end: Date) {
  const s = new Date(start)
  s.setHours(0, 0, 0, 0)
  const e = new Date(end)
  e.setHours(0, 0, 0, 0)
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1)
}

function hoursBetween(startTime: string, endTime: string) {
  const [sh, sm] = startTime.split(":").map(Number)
  const [eh, em] = endTime.split(":").map(Number)
  const a = sh * 60 + (sm || 0)
  const b = eh * 60 + (em || 0)
  const diff = (b - a) / 60
  return diff > 0 ? Math.round(diff * 100) / 100 : 0
}

async function resolveEmployee(session: {
  id: string
  displayName: string
  role: string
}) {
  return prisma.employee.findFirst({
    where: {
      OR: [{ userId: session.id }, { displayName: session.displayName }],
      isActive: true,
    },
  })
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "وارد شوید" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status") || "ALL"
    const mine = searchParams.get("mine") === "1"
    const isManager = ["admin", "finance"].includes(session.role)

    const where: any = {}
    if (status !== "ALL") where.status = status

    if (mine || !isManager) {
      const emp = await resolveEmployee(session)
      if (!emp) return NextResponse.json({ items: [] })
      where.employeeId = emp.id
    }

    const items = await prisma.leaveRequest.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            displayName: true,
            personnelCode: true,
            department: true,
            groupName: true,
            mobile: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json({ items })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "وارد شوید" }, { status: 401 })

    const body = await req.json()
    const type = String(body.type || "").trim()
    const durationType = body.durationType === "HOURLY" ? "HOURLY" : "DAILY"
    const startDate = safeDate(body.startDate)
    if (!type || !startDate) {
      return NextResponse.json({ error: "نوع و تاریخ الزامی است" }, { status: 400 })
    }

    let employee = await resolveEmployee(session)
    // مدیر می‌تواند برای پرسنل دیگر ثبت کند
    if (body.employeeId && ["admin", "finance"].includes(session.role)) {
      employee = await prisma.employee.findUnique({ where: { id: body.employeeId } })
    }
    if (!employee) {
      return NextResponse.json(
        { error: "پرسنل شما در سیستم تعریف نشده. از مدیر بخواهید شما را در لیست پرسنل ثبت کند." },
        { status: 400 }
      )
    }

    let endDate = body.endDate ? safeDate(body.endDate) : startDate
    let startTime: string | null = null
    let endTime: string | null = null
    let amount = 1
    let amountUnit: "DAY" | "HOUR" = "DAY"

    if (durationType === "HOURLY") {
      startTime = String(body.startTime || "").trim()
      endTime = String(body.endTime || "").trim()
      if (!/^\d{1,2}:\d{2}$/.test(startTime) || !/^\d{1,2}:\d{2}$/.test(endTime)) {
        return NextResponse.json(
          { error: "برای مرخصی ساعتی، ساعت شروع و پایان لازم است (مثلاً 08:00)" },
          { status: 400 }
        )
      }
      endDate = startDate
      amount = hoursBetween(startTime, endTime)
      amountUnit = "HOUR"
      if (amount <= 0) {
        return NextResponse.json({ error: "بازه ساعتی نامعتبر است" }, { status: 400 })
      }
    } else {
      endDate = endDate || startDate
      amount =
        typeof body.amount === "number" && body.amount > 0
          ? body.amount
          : daysBetween(startDate!, endDate!)
      amountUnit = "DAY"
    }

    const item = await prisma.leaveRequest.create({
      data: {
        employeeId: employee.id,
        type,
        durationType,
        startDate: startDate!,
        endDate: endDate!,
        startTime,
        endTime,
        amount,
        amountUnit,
        description: body.description?.trim() || null,
        attachmentUrl: body.attachmentUrl || null,
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