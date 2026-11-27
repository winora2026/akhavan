import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

const INSTALLER_NAME = "آقای هادی زنگنه"
const INSTALLER_PHONE = "09127372431"

function norm(s: string) {
  return (s || "")
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function isReadyWh(name: string) {
  const n = norm(name)
  return n.includes("آماده تحویل") || n === norm("انبار محصول دو")
}

/** آیا همه اقلام تولید سفارش مسیرشان تا انبار آماده تحویل تمام شده؟ */
async function computeReady(orderId: string): Promise<{ ready: boolean; at: Date | null }> {
  const prod = await prisma.productionOrder.findFirst({
    where: { orderId },
    include: {
      items: {
        include: {
          stations: { include: { station: true } },
        },
      },
    },
  })
  if (!prod || !prod.items.length) return { ready: false, at: null }

  let latest: Date | null = null
  for (const item of prod.items) {
    const readyRows = item.stations.filter((s) => isReadyWh(s.station.name))
    if (!readyRows.length) return { ready: false, at: null }
    const done = readyRows.every(
      (s) => s.status === "تکمیل شده" || s.status === "انجام در ایستگاه دیگر"
    )
    if (!done) return { ready: false, at: null }
    for (const s of readyRows) {
      if (s.completedAt && (!latest || s.completedAt > latest)) latest = s.completedAt
    }
  }
  return { ready: true, at: latest }
}

/** سفارش‌های دارای نصب را با جدول InstallationJob همگام می‌کند */
async function syncJobsFromOrders() {
  const orders = await prisma.order.findMany({
    where: {
      hasInstallation: true,
      status: { in: ["فاکتور", "ثبت‌شده"] },
    },
    include: { customer: true },
    orderBy: { installationDate: "asc" },
  })

  for (const o of orders) {
    const existing = await prisma.installationJob.findUnique({
      where: { orderId: o.id },
    })
    const { ready, at } = await computeReady(o.id)
    const phone =
      o.installationPhone ||
      o.customer?.phone ||
      null
    const address = o.installationAddress || o.customer?.address || null

    if (!existing) {
      await prisma.installationJob.create({
        data: {
          orderId: o.id,
          orderNumber: o.orderNumber,
          customerName: o.customer?.name || "—",
          customerPhone: phone,
          address,
          installationDate: o.installationDate,
          salesRep: o.salesRep || o.convertedBy || null,
          installerName: INSTALLER_NAME,
          installerPhone: INSTALLER_PHONE,
          isReadyForInstall: ready,
          readyAt: at,
          status: "PENDING",
        },
      })
    } else {
      // فقط فیلدهای همگام‌شونده (وضعیت نصب دستی را دست نمی‌زنیم)
      await prisma.installationJob.update({
        where: { id: existing.id },
        data: {
          orderNumber: o.orderNumber,
          customerName: o.customer?.name || existing.customerName,
          customerPhone: phone || existing.customerPhone,
          address: address || existing.address,
          installationDate: o.installationDate || existing.installationDate,
          salesRep: o.salesRep || existing.salesRep,
          isReadyForInstall: ready,
          readyAt: at,
          installerName: existing.installerName || INSTALLER_NAME,
          installerPhone: existing.installerPhone || INSTALLER_PHONE,
        },
      })
    }
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status") || "PENDING" // PENDING | DONE | ALL
    const q = (searchParams.get("q") || "").trim()

    await syncJobsFromOrders()

    const where: any = {}
    if (status === "DONE") {
      where.status = "DONE"
    } else if (status === "PENDING") {
      where.status = { in: ["PENDING", "PROBLEM"] }
    } else if (status !== "ALL") {
      where.status = status
    }

    if (q) {
      where.OR = [
        { customerName: { contains: q } },
        { orderNumber: { contains: q } },
        { customerPhone: { contains: q } },
        { address: { contains: q } },
      ]
    }

    const items = await prisma.installationJob.findMany({
      where,
      orderBy: [
        { isReadyForInstall: "desc" },
        { installationDate: "asc" },
        { createdAt: "desc" },
      ],
    })

    return NextResponse.json({ items })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در دریافت لیست نصب" },
      { status: 500 }
    )
  }
}