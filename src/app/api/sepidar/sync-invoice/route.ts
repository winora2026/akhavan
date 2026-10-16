import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { buildCreateInvoicePayload } from "@/lib/sepidar/mapOrder"
import { createInvoice, isMockMode } from "@/lib/sepidar/client"

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "ورود لازم است" }, { status: 401 })
    }

    const body = await req.json()
    const orderId = String(body.orderId || "").trim()
    if (!orderId) {
      return NextResponse.json({ error: "orderId الزامی است" }, { status: 400 })
    }

    const existing = await prisma.order.findUnique({ where: { id: orderId } })
    if (!existing) {
      return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 })
    }
    if (existing.status !== "فاکتور") {
      return NextResponse.json(
        { error: "فقط فاکتور قطعی قابل ارسال است" },
        { status: 400 }
      )
    }
    if (existing.sepidarSyncStatus === "SUCCESS" && existing.sepidarInvoiceId) {
      return NextResponse.json(
        {
          error: "این فاکتور قبلاً به سپیدار ارسال شده",
          sepidarInvoiceId: existing.sepidarInvoiceId,
        },
        { status: 409 }
      )
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        sepidarSyncStatus: "PENDING",
        sepidarSyncError: null,
      },
    })

    const { payload } = await buildCreateInvoicePayload(orderId)

    const result = await createInvoice(payload)

    const invoiceId = String(
      result?.id ?? result?.invoiceId ?? result?.number ?? result?.mock ?? ""
    )

    await prisma.order.update({
      where: { id: orderId },
      data: {
        sepidarSyncStatus: "SUCCESS",
        sepidarInvoiceId: invoiceId || null,
        sepidarSyncedAt: new Date(),
        sepidarSyncError: null,
        sepidarLastPayload: JSON.stringify(payload),
      },
    })

    return NextResponse.json({
      success: true,
      mock: isMockMode(),
      sepidarInvoiceId: invoiceId,
      result,
      payload, // در mock برای بررسی نگاشت
    })
  } catch (e: any) {
    console.error("sepidar sync:", e)
    try {
      const body = await req.clone().json().catch(() => ({}))
      if (body?.orderId) {
        await prisma.order.update({
          where: { id: String(body.orderId) },
          data: {
            sepidarSyncStatus: "FAILED",
            sepidarSyncError: String(e?.message || e).slice(0, 2000),
          },
        })
      }
    } catch {}

    return NextResponse.json(
      { error: e?.message || "خطا در ارسال به سپیدار" },
      { status: 500 }
    )
  }
}