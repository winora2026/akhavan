import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

async function canAccess(conversationId: string, userId: string, role: string) {
  if (role === "admin") return true
  const m = await prisma.conversationMember.findUnique({
    where: {
      conversationId_userId: { conversationId, userId },
    },
  })
  return !!m
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 })
    }

    const { id } = await ctx.params
    const ok = await canAccess(id, session.id, session.role)
    if (!ok) {
      return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 })
    }

    const isAdmin = session.role === "admin"

    const [messages, members] = await Promise.all([
      prisma.chatMessage.findMany({
        where: {
          conversationId: id,
          ...(isAdmin ? {} : { deletedAt: null }),
        },
        orderBy: { createdAt: "asc" },
        include: {
          sender: {
            select: { id: true, displayName: true, role: true },
          },
          order: {
            select: { id: true, orderNumber: true },
          },
        },
        take: 300,
      }),
      prisma.conversationMember.findMany({
        where: { conversationId: id },
        include: {
          user: { select: { id: true, displayName: true } },
        },
      }),
    ])

    // علامت خوانده‌شدن برای کاربر فعلی
    await prisma.conversationMember.updateMany({
      where: { conversationId: id, userId: session.id },
      data: { lastReadAt: new Date() },
    })

    return NextResponse.json({
      messages: messages.map((m) => {
        const readBy = members
          .filter(
            (mem) =>
              mem.userId !== m.senderId &&
              mem.lastReadAt &&
              mem.lastReadAt >= m.createdAt
          )
          .map((mem) => mem.user.displayName)

        return {
          id: m.id,
          body:
            m.deletedAt && isAdmin
              ? m.body
              : m.deletedAt
              ? null
              : m.body,
          deleted: !!m.deletedAt,
          createdAt: m.createdAt,
          editedAt: (m as any).editedAt || null,
          sender: m.sender,
          orderNumber: m.order?.orderNumber || null,
          orderId: m.orderId,
          isMine: m.senderId === session.id,
          attachmentUrl: (m as any).attachmentUrl || null,
          attachmentName: (m as any).attachmentName || null,
          attachmentType: (m as any).attachmentType || null,
          readBy,
        }
      }),
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در دریافت پیام‌ها" },
      { status: 500 }
    )
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 })
    }

    const { id } = await ctx.params
    const ok = await canAccess(id, session.id, session.role)
    if (!ok) {
      return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 })
    }

    const body = await req.json()
    const text = String(body.body || "").trim()
    const attachmentUrl = body.attachmentUrl
      ? String(body.attachmentUrl)
      : null
    const attachmentName = body.attachmentName
      ? String(body.attachmentName)
      : null
    const attachmentType = body.attachmentType
      ? String(body.attachmentType)
      : null

    if (!text && !attachmentUrl) {
      return NextResponse.json(
        { error: "متن پیام یا فایل الزامی است" },
        { status: 400 }
      )
    }

    let orderId: string | null = null
    if (body.orderId) {
      orderId = String(body.orderId)
    } else if (body.orderNumber) {
      const ord = await prisma.order.findFirst({
        where: { orderNumber: String(body.orderNumber).trim() },
        select: { id: true },
      })
      orderId = ord?.id || null
    }

    const msg = await prisma.chatMessage.create({
      data: {
        conversationId: id,
        senderId: session.id,
        body: text || (attachmentUrl ? "📎 فایل پیوست" : ""),
        orderId,
        attachmentUrl,
        attachmentName,
        attachmentType,
      } as any,
      include: {
        sender: {
          select: { id: true, displayName: true, role: true },
        },
        order: {
          select: { id: true, orderNumber: true },
        },
      },
    })

    await prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    })

    return NextResponse.json({
      message: {
        id: msg.id,
        body: msg.body,
        deleted: false,
        createdAt: msg.createdAt,
        editedAt: null,
        sender: msg.sender,
        orderNumber: msg.order?.orderNumber || null,
        orderId: msg.orderId,
        isMine: true,
        attachmentUrl: (msg as any).attachmentUrl || null,
        attachmentName: (msg as any).attachmentName || null,
        attachmentType: (msg as any).attachmentType || null,
        readBy: [],
      },
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در ارسال پیام" },
      { status: 500 }
    )
  }
}