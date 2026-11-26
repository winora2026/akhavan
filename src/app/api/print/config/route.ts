import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"

// تنظیمات چاپ مستقیم (QZ Tray) — نام کاربر مشمول و نام پرینتر لیبل از متغیرهای محیطی

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "ابتدا وارد سیستم شوید" }, { status: 401 })
  }

  const qzUser = (process.env.PRINT_QZ_USER || "حسینی").trim()
  const labelPrinter = (process.env.PRINT_LABEL_PRINTER || "GP-4120T").trim()
  const enabled =
    session.username === qzUser ||
    session.displayName === qzUser ||
    session.displayName.includes(qzUser) ||
    session.username.includes(qzUser)

  return NextResponse.json({ enabled, labelPrinter })
}
