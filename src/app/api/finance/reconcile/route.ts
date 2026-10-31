import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { reconcileSepidarInvoices } from "@/lib/sepidar/reconcile"

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 })
    }
    if (session.role !== "finance" && session.role !== "admin") {
      return NextResponse.json({ error: "فقط مالی/مدیر" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const days = Number(searchParams.get("days") || 45)
    const apply = searchParams.get("apply") === "1"
    const force = searchParams.get("force") === "1"

    // GET همیشه فقط گزارش (امن‌تر)
    if (apply) {
      return NextResponse.json(
        { error: "برای اعمال تغییرات از POST استفاده کنید" },
        { status: 405 }
      )
    }

    const report = await reconcileSepidarInvoices({
      apply: false,
      days,
      force: false,
    })

    return NextResponse.json(report)
  } catch (e: any) {
    console.error("reconcile GET:", e)
    return NextResponse.json(
      { error: e?.message || "خطا در مغایرت‌گیری" },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 })
    }
    if (session.role !== "finance" && session.role !== "admin") {
      return NextResponse.json({ error: "فقط مالی/مدیر" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const days = Number(body.days || 45)
    const apply = Boolean(body.apply)
    const force = Boolean(body.force)

    const report = await reconcileSepidarInvoices({
      apply,
      days,
      force,
    })

    return NextResponse.json(report)
  } catch (e: any) {
    console.error("reconcile POST:", e)
    return NextResponse.json(
      { error: e?.message || "خطا در مغایرت‌گیری" },
      { status: 500 }
    )
  }
}