import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { normalizeIranMobile, sendSms } from "@/lib/sms"

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "ابتدا وارد سیستم شوید" }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const text = String(body.text || "").trim()
    if (!text) {
      return NextResponse.json({ error: "متن پیامک خالی است" }, { status: 400 })
    }

    // اولین شماره‌ای که موبایل معتبر است
    const candidates = Array.isArray(body.to) ? body.to : [body.to]
    let mobile: string | null = null
    for (const p of candidates) {
      mobile = normalizeIranMobile(String(p ?? ""))
      if (mobile) break
    }
    if (!mobile) {
      return NextResponse.json(
        { error: "شماره موبایل معتبر برای مشتری پیدا نشد" },
        { status: 400 }
      )
    }

    const result = await sendSms(mobile, text)

    // ثبت وضعیت پیامک روی درخواست اندازه‌گیری (حالت آزمایشی ثبت نمی‌شود)
    const measurementId = String(body.measurementId || "")
    if (measurementId && result.ok && !result.mock) {
      await prisma.measurementRequest
        .update({
          where: { id: measurementId },
          data: result.ok
            ? { smsStatus: "SENT", smsSentAt: new Date() }
            : { smsStatus: "FAILED" },
        })
        .catch(() => {})
    }

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "ارسال پیامک انجام نشد" },
        { status: 502 }
      )
    }
    return NextResponse.json({ success: true, mock: Boolean(result.mock) })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e?.message || "خطا در ارسال پیامک" },
      { status: 500 }
    )
  }
}
