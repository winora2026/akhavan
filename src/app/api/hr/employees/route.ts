import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

export async function GET() {
  try {
    const items = await prisma.employee.findMany({
      where: { isActive: true },
      orderBy: { personnelCode: "asc" },
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
    const body = await req.json()
    const personnelCode = String(body.personnelCode || "").trim()
    const firstName = String(body.firstName || "").trim()
    const lastName = String(body.lastName || "").trim()
    if (!personnelCode || !firstName || !lastName) {
      return NextResponse.json(
        { error: "کد پرسنلی، نام و نام خانوادگی الزامی است" },
        { status: 400 }
      )
    }
    const item = await prisma.employee.create({
      data: {
        personnelCode,
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`.trim(),
        groupName: body.groupName?.trim() || null,
        phone: body.phone?.trim() || null,
        userId: body.userId || null,
      },
    })
    return NextResponse.json({ success: true, item }, { status: 201 })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در ثبت پرسنل" },
      { status: 500 }
    )
  }
}