import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// همیشه از دیتابیس تازه بخواند (نباید کش شود)
export const dynamic = "force-dynamic"

/**
 * قطعاتی که در یک برگه‌ی خروج فعال (غیر ابطال) ثبت شده‌اند.
 * همان تعریفی که صدور برگه‌ی خروج و صفحه‌ی جزئیات سفارش برای «خروج خورده» استفاده می‌کنند.
 */
export async function GET() {
  try {
    const rows = await prisma.exitSlipItem.findMany({
      where: { exitSlip: { status: { not: "ابطال" } } },
      select: { productionItemId: true, barcode: true },
    })

    const exitedItemIds = Array.from(
      new Set(rows.map((r) => r.productionItemId).filter(Boolean))
    )
    const exitedBarcodes = Array.from(
      new Set(rows.map((r) => r.barcode).filter((b): b is string => !!b))
    )

    return NextResponse.json({ exitedItemIds, exitedBarcodes })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: "خطا در دریافت وضعیت خروج", details: String(e?.message) },
      { status: 500 }
    )
  }
}