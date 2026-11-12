import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 })
    }

    const { id } = await ctx.params
    const msg = await prisma.chatMessage.findUnique({ where: { id } })
    if (!msg) {
      return NextResponse.json({ error: "پیام یافت نشد" }, { status: 404 })
    }

    // فقط فرستنده یا ادمین
    if (msg.senderId !== session.id && session.role !== "admin") {
      return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 })
    }

    await prisma.chatMessage.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById: session.id,
      },
    })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در حذف" },
      { status: 500 }
    )
  }
}