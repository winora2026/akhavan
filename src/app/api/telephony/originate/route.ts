import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getAmiClient, isTelephonyReady } from "@/lib/telephony/bootstrap"
import { digitsOnly } from "@/lib/telephony/phone"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const g = globalThis as any

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  let phone = digitsOnly(body?.phone)
  // شماره موبایل ۱۰ رقمی بدون صفر (۹۱۲...) را برای مسیرهای خروجی FreePBX به ۰۹۱۲... تبدیل می‌کنیم
  if (/^9\d{9}$/.test(phone)) phone = "0" + phone
  if (!/^\d{3,15}$/.test(phone)) {
    return NextResponse.json({ error: "شماره تلفن معتبر نیست" }, { status: 400 })
  }

  const now = Date.now()
  const lastCalls: Map<string, number> = g.__pbxLastOriginate || (g.__pbxLastOriginate = new Map())
  if (now - (lastCalls.get(session.id) || 0) < 3000) {
    return NextResponse.json({ error: "کمی صبر کنید؛ درخواست تماس قبلی در حال انجام است" }, { status: 429 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { extension: true, displayName: true },
  })
  if (!user?.extension) {
    return NextResponse.json(
      { error: "برای شما داخلی تلفنی تعیین نشده است. از صفحه «تنظیمات داخلی» اقدام کنید." },
      { status: 400 }
    )
  }

  if (!isTelephonyReady()) {
    return NextResponse.json({ error: "ارتباط با سرور تلفن برقرار نیست" }, { status: 503 })
  }

  const ami = getAmiClient()
  if (!ami) {
    return NextResponse.json({ error: "سرویس تلفنی فعال نیست" }, { status: 503 })
  }

  lastCalls.set(session.id, now)

  try {
    const displayName = String(user.displayName || "").replace(/["\r\n]/g, " ").trim()
    const response = await ami.action(
      {
        Action: "Originate",
        Channel: `SIP/${user.extension}`,
        Context: "from-internal",
        Exten: phone,
        Priority: 1,
        Timeout: 30000,
        Async: "true",
        CallerID: `"${displayName}" <${user.extension}>`,
      },
      10000
    )

    if (response.Response !== "Success") {
      return NextResponse.json(
        { error: response.Message || "سرور تلفن درخواست تماس را نپذیرفت" },
        { status: 502 }
      )
    }

    return NextResponse.json({ ok: true, extension: user.extension, phone })
  } catch (e: any) {
    console.error("[telephony] originate failed", e)
    return NextResponse.json({ error: e?.message || "خطا در برقراری تماس" }, { status: 500 })
  }
}
