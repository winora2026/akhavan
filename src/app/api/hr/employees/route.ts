import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { safeDate } from "@/lib/date"

export async function GET(req: NextRequest) {
  try {
    const q = (new URL(req.url).searchParams.get("q") || "").trim()
    const where: any = { isActive: true }
    if (q) {
      where.OR = [
        { personnelCode: { contains: q } },
        { firstName: { contains: q } },
        { lastName: { contains: q } },
        { displayName: { contains: q } },
        { nationalId: { contains: q } },
        { mobile: { contains: q } },
        { groupName: { contains: q } },
        { department: { contains: q } },
      ]
    }
    const items = await prisma.employee.findMany({
      where,
      orderBy: { personnelCode: "asc" },
      include: {
        leaveBalances: { where: { year: 1405 } },
      },
    })
    return NextResponse.json({ items })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !["admin", "finance"].includes(session.role)) {
      return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 })
    }
    const b = await req.json()
    const personnelCode = String(b.personnelCode || "").trim()
    const firstName = String(b.firstName || "").trim()
    const lastName = String(b.lastName || "").trim()
    if (!personnelCode || !firstName || !lastName) {
      return NextResponse.json(
        { error: "کد پرسنلی، نام و نام خانوادگی الزامی است" },
        { status: 400 }
      )
    }
    const item = await prisma.employee.create({
      data: {
        personnelCode,
        deviceCode: b.deviceCode?.trim() || personnelCode,
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`.trim(),
        fatherName: b.fatherName?.trim() || null,
        nationalId: b.nationalId?.trim() || null,
        mobile: b.mobile?.trim() || null,
        phone: b.phone?.trim() || null,
        email: b.email?.trim() || null,
        gender: b.gender || null,
        birthDate: b.birthDate ? safeDate(b.birthDate) : null,
        hireDate: b.hireDate ? safeDate(b.hireDate) : null,
        employmentType: b.employmentType || null,
        jobTitle: b.jobTitle?.trim() || null,
        department: b.department?.trim() || null,
        groupName: b.groupName?.trim() || null,
        shiftName: b.shiftName?.trim() || null,
        managerName: b.managerName?.trim() || null,
        address: b.address?.trim() || null,
        emergencyPhone: b.emergencyPhone?.trim() || null,
        bankAccount: b.bankAccount?.trim() || null,
        userId: b.userId || null,
        photoUrl: b.photoUrl || null,
        notes: b.notes?.trim() || null,
      },
    })

    // مانده پیش‌فرض استحقاقی سال جاری
    await prisma.leaveBalance.create({
      data: {
        employeeId: item.id,
        year: 1405,
        leaveType: "استحقاقی",
        entitled: Number(b.entitledDays) || 30,
        used: 0,
        remaining: Number(b.entitledDays) || 30,
        entitledHours: Number(b.entitledHours) || 0,
        usedHours: 0,
        remainingHours: Number(b.entitledHours) || 0,
      },
    })

    return NextResponse.json({ success: true, item }, { status: 201 })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}