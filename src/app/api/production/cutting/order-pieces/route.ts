import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// جستجوی سفارش (شماره سفارش / نام مشتری / بارکد) و فهرست همه‌ی قطعات تولیدی آن،
// حتی قطعاتی که برش خورده‌اند یا از کارخانه خارج شده‌اند — برای ثبت ضایعات و برش مجدد بدون نیاز به بارکد.
const toFa = (s: string) => s.replace(/ي/g, "ی").replace(/ك/g, "ک")
const toAr = (s: string) => s.replace(/ی/g, "ي").replace(/ک/g, "ك")
const faDigits = (s: string) =>
  s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const raw = faDigits((searchParams.get("q") || "").trim())
    if (raw.length < 2) {
      return NextResponse.json({ orders: [] })
    }
    const variants = Array.from(new Set([raw, toFa(raw), toAr(raw)]))
    const base = raw.includes("-") ? raw.split("-")[0] : raw

    const prods = await prisma.productionOrder.findMany({
      where: {
        OR: [
          ...variants.map((v) => ({ order: { orderNumber: { contains: v } } })),
          ...variants.map((v) => ({ order: { customer: { name: { contains: v } } } })),
          { items: { some: { barcode: { in: [raw, base] } } } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: {
        order: { include: { customer: true } },
        items: {
          orderBy: { createdAt: "asc" },
          include: {
            stations: { include: { station: true }, orderBy: { sequence: "asc" } },
            wastes: true,
          },
        },
      },
    })

    const itemIds = prods.flatMap((p) => p.items.map((i) => i.id))
    const exitRows = itemIds.length
      ? await prisma.exitSlipItem.findMany({
          where: { productionItemId: { in: itemIds } },
          include: { exitSlip: true },
        })
      : []
    const exitOf = new Map<string, any>()
    for (const e of exitRows) exitOf.set(e.productionItemId, e)

    const orders = prods.map((p) => ({
      productionOrderId: p.id,
      orderNumber: p.order?.orderNumber,
      customerName: p.order?.customer?.name,
      orderStatus: p.order?.status,
      pieces: p.items.map((i) => {
        const st = [...i.stations].sort((a, b) => a.sequence - b.sequence)
        const open = st.find(
          (s) => s.status !== "تکمیل شده" && s.status !== "انجام در ایستگاه دیگر"
        )
        const cut = st.find((s) => s.station?.name === "برش")
        const ex = exitOf.get(i.id)
        return {
          productionItemId: i.id,
          productName: i.productName,
          barcode: i.barcode,
          length: i.length,
          width: i.width,
          quantity: i.quantity,
          recutNumber: (i as any).recutNumber || 0,
          labelStatus: i.labelStatus,
          inCuttingQueue: !!cut && ["در انتظار", "در حال انجام"].includes(cut.status),
          currentStation: open ? open.station?.name || "—" : "تکمیل مسیر",
          exited: !!ex,
          exitNumber: ex?.exitSlip?.exitNumber ?? null,
          wasteCount: i.wastes.length,
          wasteQty: i.wastes.reduce((s, w) => s + (w.quantity || 0), 0),
          pendingWasteIds: i.wastes.filter((w) => !w.isReworked).map((w) => w.id),
        }
      }),
    }))

    return NextResponse.json({ orders })
  } catch (error: any) {
    console.error(error)
    return NextResponse.json(
      { error: "خطا در جستجوی سفارش", details: String(error?.message || error) },
      { status: 500 }
    )
  }
}