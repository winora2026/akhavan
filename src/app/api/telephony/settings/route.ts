import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { digitsOnly } from "@/lib/telephony/phone"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function normalizeExtension(value: unknown) {
  const digits = digitsOnly(String(value ?? ""))
  return digits || null
}

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "دسترسی فقط برای مدیر سامانه" }, { status: 403 })
  }

  try {
    const users = await prisma.user.findMany({
      orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        stationName: true,
        isActive: true,
        extension: true,
        _count: { select: { pbxCalls: true } },
      },
    })

    const items = users.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      stationName: u.stationName,
      isActive: u.isActive,
      extension: u.extension,
      callCount: u._count.pbxCalls,
    }))

    return NextResponse.json({ items })
  } catch (e: any) {
    console.error("[telephony] settings GET failed", e)
    return NextResponse.json({ error: e?.message || "خطا در دریافت تنظیمات" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "دسترسی فقط برای مدیر سامانه" }, { status: 403 })
  }

  try {
    const body = await req.json().catch(() => null)
    const rawItems: any[] = Array.isArray(body?.items) ? body.items : body?.userId ? [body] : []
    if (rawItems.length === 0) {
      return NextResponse.json({ error: "داده‌ای برای ذخیره ارسال نشده" }, { status: 400 })
    }

    const seen = new Map<string, string>()
    for (const item of rawItems) {
      const userId = String(item?.userId || "").trim()
      if (!userId) {
        return NextResponse.json({ error: "شناسه کاربر نامعتبر است" }, { status: 400 })
      }
      const extension = normalizeExtension(item?.extension)
      if (extension && !/^\d{2,8}$/.test(extension)) {
        return NextResponse.json({ error: `شماره داخلی «${extension}» معتبر نیست` }, { status: 400 })
      }
      if (extension) {
        const prev = seen.get(extension)
        if (prev && prev !== userId) {
          return NextResponse.json(
            { error: `شماره داخلی ${extension} برای بیش از یک کاربر انتخاب شده` },
            { status: 400 }
          )
        }
        seen.set(extension, userId)
      }
    }

    const ids = rawItems.map((i) => String(i.userId))
    const existing = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    })
    const existingIds = new Set(existing.map((u) => u.id))
    for (const id of ids) {
      if (!existingIds.has(id)) {
        return NextResponse.json({ error: "کاربر یافت نشد" }, { status: 404 })
      }
    }

    for (const [extension, userId] of seen) {
      const owner = await prisma.user.findFirst({
        where: { extension, NOT: { id: { in: ids } } },
        select: { displayName: true },
      })
      if (owner) {
        return NextResponse.json(
          { error: `شماره داخلی ${extension} قبلاً به «${owner.displayName}» اختصاص یافته` },
          { status: 409 }
        )
      }
    }

    await prisma.$transaction(
      rawItems.map((item) => {
        const userId = String(item.userId)
        const extension = normalizeExtension(item.extension)
        return prisma.user.update({ where: { id: userId }, data: { extension } })
      })
    )

    return NextResponse.json({ ok: true, updated: rawItems.length })
  } catch (e: any) {
    console.error("[telephony] settings PUT failed", e)
    return NextResponse.json({ error: e?.message || "خطا در ذخیره تنظیمات" }, { status: 500 })
  }
}
