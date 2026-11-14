import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// همیشه از دیتابیس تازه بخواند (نباید کش شود)
export const dynamic = "force-dynamic"

// حداکثر ردیف برگشتی؛ برای دیدن قدیمی‌تر از این، فیلتر بازه‌ی تاریخ یا جستجو را به‌کار ببرید
const MAX_ROWS = 400

const isDone = (s: string) => s === "تکمیل شده" || s === "تکمیل‌شده"

function normDigits(s: string) {
  return (s || "")
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
}

// نام مشتری/کالا در دیتابیس ممکن است با «ي/ك» عربی ذخیره شده باشد و کاربر «ی/ک» فارسی تایپ کند
function textVariants(q: string) {
  const base = q.trim()
  const arabic = base.replace(/ی/g, "ي").replace(/ک/g, "ك")
  const persian = base.replace(/ي/g, "ی").replace(/ك/g, "ک")
  return Array.from(new Set([base, arabic, persian])).filter(Boolean)
}

/**
 * تاریخچه‌ی رد شده‌های یک ایستگاه (کامل، نه فقط اخیر)
 * GET ?stationId=...&q=...&from=ISO&to=ISO
 *  - q: شماره سفارش / نام مشتری / نام کالا / بارکد
 *  - from / to: بازه‌ی زمان رد شدن
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const stationId = searchParams.get("stationId") || ""
    if (!stationId) {
      return NextResponse.json(
        { error: "stationId الزامی است" },
        { status: 400 }
      )
    }

    const q = normDigits((searchParams.get("q") || "").trim())
    const fromRaw = searchParams.get("from")
    const toRaw = searchParams.get("to")
    const fromD = fromRaw ? new Date(fromRaw) : null
    const toD = toRaw ? new Date(toRaw) : null
    const from = fromD && !isNaN(fromD.getTime()) ? fromD : null
    const to = toD && !isNaN(toD.getTime()) ? toD : null

    // «رد شده» = ایستگاه تکمیل شده، یا در حال انجام با مقداری که قبلاً رد شده (رد جزئی)
    const doneCond: any = { status: "تکمیل شده" }
    const partialCond: any = { status: "در حال انجام", quantityOut: { gt: 0 } }
    if (from || to) {
      const range: any = {}
      if (from) range.gte = from
      if (to) range.lte = to
      doneCond.completedAt = range
      partialCond.updatedAt = range
    }

    const and: any[] = [{ OR: [doneCond, partialCond] }]
    if (q) {
      const vs = textVariants(q)
      and.push({
        OR: vs.flatMap((v) => [
          { productionItem: { productionOrder: { order: { orderNumber: { contains: v } } } } },
          { productionItem: { productionOrder: { order: { customer: { name: { contains: v } } } } } },
          { productionItem: { productName: { contains: v } } },
          { productionItem: { barcode: { contains: v } } },
        ]),
      })
    }

    const rows = await prisma.productionItemStation.findMany({
      where: { stationId, AND: and },
      include: {
        productionItem: {
          include: {
            stations: {
              include: { station: true },
              orderBy: { sequence: "asc" },
            },
            productionOrder: {
              include: {
                order: { include: { customer: true } },
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_ROWS,
    })

    const items = rows
      .map((row) => {
        const pi = row.productionItem
        // اگر یکی از ایستگاه‌های بعدی این قطعه رد شده باشد، برگشت این ایستگاه مسیر را ناسازگار می‌کند
        // (ایستگاه جفتِ تراش با وضعیت «انجام در ایستگاه دیگر» مانع نیست)
        const blocker = pi.stations.find(
          (s) =>
            s.sequence > row.sequence &&
            (isDone(s.status) ||
              (s.status === "در حال انجام" && (s.quantityOut || 0) > 0))
        )
        const when = row.completedAt || row.updatedAt
        return {
          id: row.id,
          status: row.status,
          quantityIn: row.quantityIn,
          quantityOut: row.quantityOut,
          completedAt: when ? new Date(when).toISOString() : null,
          canUndo: !blocker,
          blockedBy: blocker ? blocker.station?.name || null : null,
          productionItem: {
            id: pi.id,
            productName: pi.productName,
            length: pi.length,
            width: pi.width,
            quantity: pi.quantity,
            barcode: pi.barcode,
            productionOrder: {
              id: pi.productionOrder.id,
              order: {
                orderNumber: pi.productionOrder.order?.orderNumber,
                customer: {
                  name: pi.productionOrder.order?.customer?.name || "—",
                },
              },
            },
          },
        }
      })
      .sort(
        (a, b) =>
          new Date(b.completedAt || 0).getTime() -
          new Date(a.completedAt || 0).getTime()
      )

    return NextResponse.json({
      items,
      truncated: rows.length >= MAX_ROWS,
    })
  } catch (error: any) {
    console.error(error)
    return NextResponse.json(
      {
        error: "خطا در دریافت تاریخچه‌ی ایستگاه",
        details: String(error?.message || error),
      },
      { status: 500 }
    )
  }
}