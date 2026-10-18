import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { buildCreateInvoicePayload } from "@/lib/sepidar/mapOrder"
import { createInvoice, isMockMode, pickId } from "@/lib/sepidar/client"
import { ensureSepidarParty } from "@/lib/sepidar/party"

export async function POST(req: NextRequest) {
  let orderId = ""
  let locked = false
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "ورود لازم است" }, { status: 401 })
    }

    const body = await req.json()
    orderId = String(body.orderId || "").trim()
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

    // قفل اتمیک: جلوگیری از ارسال همزمان/دوبار کلیک
    const lock = await prisma.order.updateMany({
      where: {
        id: orderId,
        OR: [
          { sepidarSyncStatus: null },
          { sepidarSyncStatus: { notIn: ["PENDING", "SUCCESS"] } },
        ],
      },
      data: { sepidarSyncStatus: "PENDING", sepidarSyncError: null },
    })
    if (lock.count === 0) {
      return NextResponse.json(
        { error: "ارسال این فاکتور در حال انجام است" },
        { status: 409 }
      )
    }
    locked = true

    // اگر مشتری هنوز در سپیدار نیست، اول او را بساز/لینک کن
    await ensureSepidarParty(existing.customerId)

    const { payload } = await buildCreateInvoicePayload(orderId)
    const result = await createInvoice(payload)
    const mock = isMockMode()

    const invoiceId = mock
      ? null
      : pickId(result, ["id", "invoiceId", "number", "invoiceNumber"])

    await prisma.order.update({
      where: { id: orderId },
      data: {
        // در حالت آزمایشی SUCCESS ثبت نمی‌شود تا بعداً ارسال واقعی مسدود نشود
        sepidarSyncStatus: mock ? "MOCK" : "SUCCESS",
        sepidarInvoiceId: invoiceId,
        sepidarSyncedAt: mock ? null : new Date(),
        sepidarSyncError: null,
        sepidarLastPayload: JSON.stringify(payload),
      },
    })

    return NextResponse.json({
      success: true,
      mock,
      sepidarInvoiceId: invoiceId,
      result,
      payload,
    })
  } catch (e: any) {
    console.error("sepidar sync:", e)
    if (locked && orderId) {
      try {
        await prisma.order.update({
          where: { id: orderId },
          data: {
            sepidarSyncStatus: "FAILED",
            sepidarSyncError: String(e?.message || e).slice(0, 2000),
          },
        })
      } catch {}
    }
    return NextResponse.json(
      { error: e?.message || "خطا در ارسال به سپیدار" },
      { status: 500 }
    )
  }
}