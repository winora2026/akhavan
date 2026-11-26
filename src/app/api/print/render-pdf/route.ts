import { NextRequest, NextResponse } from "next/server"
import fs from "fs"
import os from "os"
import path from "path"
import { getSession } from "@/lib/auth"
import { findChrome, renderHtmlToPdf } from "@/lib/serverPrint"

// رندر HTML یک نمای چاپ (که کلاینت از DOM فعلی می‌سازد) به PDF با ابعاد دقیق کاغذ
// برای چاپ مستقیم از طریق QZ Tray روی PC کاربر؛ خروجی دقیقاً مثل window.print است

const MAX_HTML_BYTES = 8 * 1024 * 1024

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "ابتدا وارد سیستم شوید" }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const html = String(body.html || "")
    const pageWmm = Math.min(Math.max(Number(body.pageWmm) || 0, 0), 500)
    const pageHmm = Math.min(Math.max(Number(body.pageHmm) || 0, 0), 500)
    if (!html || html.length > MAX_HTML_BYTES || !pageWmm || !pageHmm) {
      return NextResponse.json({ error: "ورودی نامعتبر است" }, { status: 400 })
    }

    if (!findChrome()) {
      return NextResponse.json(
        { error: "ابزار ساخت PDF روی سرور نصب نیست" },
        { status: 500 }
      )
    }

    const out = path.join(
      os.tmpdir(),
      `print-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`
    )
    await renderHtmlToPdf(html, out, pageWmm, pageHmm)

    const pdf = fs.readFileSync(out)
    fs.unlinkSync(out)

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.length),
      },
    })
  } catch (e: any) {
    console.error("render-pdf error:", e)
    return NextResponse.json(
      { error: e?.message || "خطا در ساخت PDF" },
      { status: 500 }
    )
  }
}
