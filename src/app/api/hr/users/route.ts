import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "وارد شوید" }, { status: 401 })
    }
    if (!["admin", "finance"].includes(session.role)) {
      return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 })
    }
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, displayName: true, role: true, stationName: true },
      orderBy: { displayName: "asc" },
    })
    return NextResponse.json({ users })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}