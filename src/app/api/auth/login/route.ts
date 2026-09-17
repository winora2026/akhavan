import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  COOKIE_NAME,
  createSessionToken,
  verifyPassword,
} from "@/lib/auth"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
        const username = String(body.username || "").trim()
    const password = String(body.password || "")

    if (!username || !password) {
      return NextResponse.json(
        { error: "نام کاربری و رمز عبور الزامی است" },
        { status: 400 }
      )
    }

    const user = await prisma.user.findUnique({ where: { username } })
    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: "نام کاربری یا رمز عبور اشتباه است" },
        { status: 401 }
      )
    }

    const ok = await verifyPassword(password, user.passwordHash)
    if (!ok) {
      return NextResponse.json(
        { error: "نام کاربری یا رمز عبور اشتباه است" },
        { status: 401 }
      )
    }

    const token = await createSessionToken({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      stationName: user.stationName,
    })

    const res = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        stationName: user.stationName,
      },
    })

       res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      // تا وقتی HTTPS ندارید false بماند
      secure: false,
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    })

    return res
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: "خطا در ورود" }, { status: 500 })
  }
}