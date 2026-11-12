import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 })
    }

    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        id: { not: session.id },
      },
      select: {
        id: true,
        displayName: true,
        role: true,
        stationName: true,
        username: true,
      },
      orderBy: { displayName: "asc" },
    })

    return NextResponse.json({ users })
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "خطا" },
      { status: 500 }
    )
  }
}