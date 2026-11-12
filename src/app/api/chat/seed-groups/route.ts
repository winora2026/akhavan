import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

const GROUPS = [
  { groupKey: "all", title: "همه کارکنان", type: "GROUP" },
  { groupKey: "sales", title: "فروش", type: "GROUP" },
  { groupKey: "production", title: "تولید", type: "GROUP" },
  { groupKey: "finance", title: "مالی", type: "GROUP" },
]

function roleMatchesGroup(role: string, groupKey: string) {
  if (groupKey === "all") return true
  if (groupKey === "sales") return role === "sales" || role === "designer" || role === "admin"
  if (groupKey === "production") return role === "production" || role === "admin"
  if (groupKey === "finance") return role === "finance" || role === "admin"
  return role === "admin"
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 })
    }

    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, role: true },
    })

    const created = []

    for (const g of GROUPS) {
      let conv = await prisma.conversation.findUnique({
        where: { groupKey: g.groupKey },
      })

      if (!conv) {
        conv = await prisma.conversation.create({
          data: {
            type: g.type,
            title: g.title,
            groupKey: g.groupKey,
          },
        })
        created.push(g.groupKey)
      }

      for (const u of users) {
        if (!roleMatchesGroup(u.role, g.groupKey)) continue
        await prisma.conversationMember.upsert({
          where: {
            conversationId_userId: {
              conversationId: conv.id,
              userId: u.id,
            },
          },
          update: {},
          create: {
            conversationId: conv.id,
            userId: u.id,
          },
        })
      }
    }

    return NextResponse.json({
      message: "گروه‌ها آماده شدند",
      created,
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در seed گروه" },
      { status: 500 }
    )
  }
}