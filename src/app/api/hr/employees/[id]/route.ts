import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session || !["admin", "finance"].includes(session.role)) {
      return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 })
    }
    const { id } = await params
    const b = await req.json()

    const data: any = {}
    if ("userId" in b) data.userId = b.userId ? String(b.userId) : null
    for (const k of [
      "department",
      "groupName",
      "shiftName",
      "employmentType",
      "jobTitle",
      "mobile",
      "phone",
    ]) {
      if (typeof b[k] === "string") data[k] = b[k].trim() || null
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "چیزی برای تغییر ارسال نشده" }, { status: 400 })
    }

    const item = await prisma.employee.update({
      where: { id },
      data,
      include: { leaveBalances: { where: { year: 1405 } } },
    })
    return NextResponse.json({ success: true, item })
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json(
        { error: "این کاربر قبلاً به پرسنل دیگری وصل شده است" },
        { status: 409 }
      )
    }
    if (e?.code === "P2025") {
      return NextResponse.json({ error: "پرسنل یافت نشد" }, { status: 404 })
    }
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}