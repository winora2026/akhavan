import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { safeDate } from "@/lib/date"
import { resolveEmployee } from "@/lib/hr"

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

/** اختلاف دقیقه بین دو ساعت "HH:mm" */
function minutesBetween(a?: string | null, b?: string | null) {
  if (!a || !b) return null
  const [ah, am] = a.split(":").map(Number)
  const [bh, bm] = b.split(":").map(Number)
  if ([ah, am, bh, bm].some((n) => Number.isNaN(n))) return null
  const diff = bh * 60 + bm - (ah * 60 + am)
  return diff >= 0 ? diff : null
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "وارد شوید" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const fromStr = searchParams.get("from")
    const toStr = searchParams.get("to")
    const employeeId = searchParams.get("employeeId") || ""
    const q = (searchParams.get("q") || "").trim()
    const groupName = (searchParams.get("group") || "").trim()

    const from = fromStr ? safeDate(fromStr) : null
    const to = toStr ? safeDate(toStr) : null

    const where: any = {}
    if (from || to) {
      where.date = {}
      if (from) where.date.gte = startOfDay(from)
      if (to) where.date.lte = endOfDay(to)
    }
    if (employeeId) where.employeeId = employeeId

    if (q || groupName) {
      where.employee = {}
      if (groupName) where.employee.groupName = { contains: groupName }
      if (q) {
        where.employee.OR = [
          { personnelCode: { contains: q } },
          { displayName: { contains: q } },
          { firstName: { contains: q } },
          { lastName: { contains: q } },
        ]
      }
    }

    // پرسنل غیرمدیر فقط تردد خودش
    if (!["admin", "finance"].includes(session.role)) {
      const emp = await resolveEmployee(session)
      if (!emp) return NextResponse.json({ items: [], summary: null })
      where.employeeId = emp.id
    }

    const rows = await prisma.attendanceLog.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            personnelCode: true,
            displayName: true,
            groupName: true,
            department: true,
            shiftName: true,
          },
        },
      },
      orderBy: [{ date: "desc" }, { checkIn: "asc" }],
      take: 2000,
    })

    const items = rows.map((r) => {
      const work =
        r.workMinutes ??
        minutesBetween(r.checkIn, r.checkOut)
      return {
        id: r.id,
        date: r.date.toISOString(),
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        workMinutes: work,
        delayMinutes: r.delayMinutes,
        earlyMinutes: r.earlyMinutes,
        overtimeMin: r.overtimeMin,
        shiftName: r.shiftName || r.employee.shiftName,
        deviceName: r.deviceName,
        source: r.source,
        notes: r.notes,
        employee: r.employee,
      }
    })

    const totalWork = items.reduce((s, i) => s + (i.workMinutes || 0), 0)
    const totalDelay = items.reduce((s, i) => s + (i.delayMinutes || 0), 0)

    return NextResponse.json({
      items,
      summary: {
        count: items.length,
        totalWorkMinutes: totalWork,
        totalDelayMinutes: totalDelay,
      },
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در دریافت تردد" },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !["admin", "finance"].includes(session.role)) {
      return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 })
    }

    const body = await req.json()

    // حالت دسته‌ای: { items: [...] }
    const list = Array.isArray(body.items) ? body.items : [body]
    if (!list.length) {
      return NextResponse.json({ error: "داده‌ای ارسال نشده" }, { status: 400 })
    }

    const created: string[] = []
    const errors: string[] = []

    for (const row of list) {
      try {
        let employeeId = row.employeeId as string | undefined
        const code = String(row.personnelCode || "").trim()

        if (!employeeId && code) {
          const emp = await prisma.employee.findFirst({
            where: { personnelCode: code },
          })
          if (!emp) {
            errors.push(`پرسنل با کد ${code} یافت نشد`)
            continue
          }
          employeeId = emp.id
        }
        if (!employeeId) {
          errors.push("employeeId یا personnelCode الزامی است")
          continue
        }

        const date = safeDate(row.date)
        if (!date) {
          errors.push("تاریخ نامعتبر")
          continue
        }

        const checkIn = row.checkIn ? String(row.checkIn).trim() : null
        const checkOut = row.checkOut ? String(row.checkOut).trim() : null
        const workMinutes =
          typeof row.workMinutes === "number"
            ? row.workMinutes
            : minutesBetween(checkIn, checkOut)

        const rec = await prisma.attendanceLog.create({
          data: {
            employeeId,
            date: startOfDay(date),
            checkIn,
            checkOut,
            workMinutes,
            delayMinutes:
              typeof row.delayMinutes === "number" ? row.delayMinutes : null,
            earlyMinutes:
              typeof row.earlyMinutes === "number" ? row.earlyMinutes : null,
            overtimeMin:
              typeof row.overtimeMin === "number" ? row.overtimeMin : null,
            shiftName: row.shiftName?.trim() || null,
            deviceName: row.deviceName?.trim() || null,
            source: row.source || "MANUAL",
            notes: row.notes?.trim() || null,
          },
        })
        created.push(rec.id)
      } catch (err: any) {
        errors.push(err.message || "خطا در یک ردیف")
      }
    }

    return NextResponse.json({
      success: true,
      created: created.length,
      ids: created,
      errors,
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}