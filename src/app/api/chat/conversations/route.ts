import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 })
    }

    const isAdmin = session.role === "admin"

    const memberships = await prisma.conversationMember.findMany({
      where: isAdmin ? {} : { userId: session.id },
      include: {
        conversation: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    displayName: true,
                    role: true,
                    stationName: true,
                  },
                },
              },
            },
            messages: {
              where: isAdmin ? {} : { deletedAt: null },
              orderBy: { createdAt: "desc" },
              take: 1,
              include: {
                sender: {
                  select: { id: true, displayName: true },
                },
                order: {
                  select: { id: true, orderNumber: true },
                },
              },
            },
          },
        },
      },
    })

    // یکتا کردن گفتگوها (برای ادمین که ممکن است چند membership نباشد)
    const map = new Map<string, any>()

    for (const m of memberships) {
      const c = m.conversation
      if (map.has(c.id)) continue

      const last = c.messages[0] || null
      const unread = await prisma.chatMessage.count({
        where: {
          conversationId: c.id,
          deletedAt: null,
          senderId: { not: session.id },
          createdAt: {
            gt: m.lastReadAt || new Date(0),
          },
        },
      })

      let title = c.title
      if (c.type === "DIRECT") {
        const other = c.members.find((x) => x.userId !== session.id)
        title = other?.user?.displayName || "گفتگو"
      }

      map.set(c.id, {
        id: c.id,
        type: c.type,
        title,
        groupKey: c.groupKey,
        updatedAt: c.updatedAt,
        lastMessage: last
          ? {
              id: last.id,
              body: last.deletedAt ? "[پیام حذف‌شده]" : last.body,
              createdAt: last.createdAt,
              senderName: last.sender.displayName,
              deleted: !!last.deletedAt,
              orderNumber: last.order?.orderNumber || null,
            }
          : null,
        unread,
        members: c.members.map((x) => ({
          id: x.user.id,
          displayName: x.user.displayName,
          role: x.user.role,
          stationName: x.user.stationName,
        })),
      })
    }

    // ادمین: همه گفتگوها حتی بدون membership
    if (isAdmin) {
      const all = await prisma.conversation.findMany({
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  role: true,
                  stationName: true,
                },
              },
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              sender: { select: { id: true, displayName: true } },
              order: { select: { id: true, orderNumber: true } },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      })

      for (const c of all) {
        if (map.has(c.id)) continue
        const last = c.messages[0] || null
        map.set(c.id, {
          id: c.id,
          type: c.type,
          title:
            c.title ||
            c.members
              .map((x) => x.user.displayName)
              .filter(Boolean)
              .join(" · ") ||
            "گفتگو",
          groupKey: c.groupKey,
          updatedAt: c.updatedAt,
          lastMessage: last
            ? {
                id: last.id,
                body: last.deletedAt ? "[پیام حذف‌شده]" : last.body,
                createdAt: last.createdAt,
                senderName: last.sender.displayName,
                deleted: !!last.deletedAt,
                orderNumber: last.order?.orderNumber || null,
              }
            : null,
          unread: 0,
          members: c.members.map((x) => ({
            id: x.user.id,
            displayName: x.user.displayName,
            role: x.user.role,
            stationName: x.user.stationName,
          })),
        })
      }
    }

    const list = Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )

    return NextResponse.json({ conversations: list })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در دریافت گفتگوها" },
      { status: 500 }
    )
  }
}

/** شروع گفتگوی مستقیم با یک کاربر */
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 })
    }

    const body = await req.json()
    const otherUserId = String(body.userId || "").trim()
    if (!otherUserId) {
      return NextResponse.json({ error: "userId الزامی است" }, { status: 400 })
    }
    if (otherUserId === session.id) {
      return NextResponse.json(
        { error: "نمی‌توانید با خودتان گفتگو کنید" },
        { status: 400 }
      )
    }

    // اگر از قبل DIRECT بین این دو نفر هست
    const existing = await prisma.conversation.findMany({
      where: {
        type: "DIRECT",
        AND: [
          { members: { some: { userId: session.id } } },
          { members: { some: { userId: otherUserId } } },
        ],
      },
      include: { members: true },
    })

    const found = existing.find((c) => c.members.length === 2)
    if (found) {
      return NextResponse.json({ conversationId: found.id, existing: true })
    }

    const conv = await prisma.conversation.create({
      data: {
        type: "DIRECT",
        title: null,
        members: {
          create: [{ userId: session.id }, { userId: otherUserId }],
        },
      },
    })

    return NextResponse.json({ conversationId: conv.id, existing: false })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در ایجاد گفتگو" },
      { status: 500 }
    )
  }
}