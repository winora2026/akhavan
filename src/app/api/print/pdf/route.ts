import { NextRequest, NextResponse } from "next/server"
import fs from "fs"
import os from "os"
import path from "path"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { publicToken } from "@/lib/publicLinks"
import { findChrome, renderUrlToPdf } from "@/lib/serverPrint"

// ساخت PDF از پیش‌فاکتور عمومی یک سفارش (رندر همان صفحه با Chrome بدون‌سر روی همین سرور)
// خروجی: فایل PDF برای دانلود — بدون نیاز به پنجره‌ی چاپ مرورگر

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "ابتدا وارد سیستم شوید" }, { status: 401 })
    }

    const orderId = new URL(req.url).searchParams.get("orderId")
    if (!orderId) {
      return NextResponse.json({ error: "شناسه سفارش لازم است" }, { status: 400 })
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, orderNumber: true },
    })
    if (!order) {
      return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 })
    }

    if (!findChrome()) {
      return NextResponse.json(
        { error: "ابزار ساخت PDF روی سرور نصب نیست" },
        { status: 500 }
      )
    }

    const port = process.env.PORT || "3000"
    const url = `http://127.0.0.1:${port}/p/i/${encodeURIComponent(order.id)}?t=${publicToken("i", order.id)}`
    const out = path.join(os.tmpdir(), `preinvoice-${order.id}-${Date.now()}.pdf`)

    await renderUrlToPdf(url, out)

    const pdf = fs.readFileSync(out)
    fs.unlinkSync(out)

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="preinvoice-${order.orderNumber}.pdf"`,
        "Content-Length": String(pdf.length),
      },
    })
  } catch (e: any) {
    console.error("print pdf error:", e)
    return NextResponse.json(
      { error: e?.message || "خطا در ساخت PDF" },
      { status: 500 }
    )
  }
}
