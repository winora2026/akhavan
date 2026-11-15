import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { safeDate } from "@/lib/date"

async function nextMeasurementNumber() {
  const last = await prisma.measurementRequest.findFirst({
    orderBy: { createdAt: "desc" },
    select: { measurementNumber: true },
  })
  const n = last?.measurementNumber?.match(/(\d+)$/)?.[1]
  const next = (n ? Number(n) : 1000) + 1
  return `M-${String(next).padStart(5, "0")}`
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status") || "PENDING"
    const q = (searchParams.get("q") || "").trim()

    const where: any = {}
    if (status !== "ALL") where.status = status
    if (q) {
      where.OR = [
        { customerName: { contains: q } },
        { measurementNumber: { contains: q } },
        { phones: { contains: q } },
        { address: { contains: q } },
        { introducerName: { contains: q } },
      ]
    }

    const items = await prisma.measurementRequest.findMany({
      where,
      orderBy: [{ measurementDate: "asc" }, { createdAt: "desc" }],
    })
    return NextResponse.json({ items })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در دریافت لیست اندازه‌گیری" },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const body = await req.json()

    const customerName = String(body.customerName || "").trim()
    if (!customerName) {
      return NextResponse.json({ error: "نام مشتری الزامی است" }, { status: 400 })
    }

    const phones = Array.isArray(body.phones)
      ? body.phones.map((p: any) => String(p).trim()).filter(Boolean)
      : []
    if (phones.length === 0) {
      return NextResponse.json({ error: "حداقل یک شماره تلفن لازم است" }, { status: 400 })
    }

    const measurementNumber = await nextMeasurementNumber()

    // تاریخ اندازه‌گیری: پیش‌فرض +۲ روز
    let measurementDate = body.measurementDate
      ? safeDate(body.measurementDate)
      : new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)

    const item = await prisma.measurementRequest.create({
      data: {
        measurementNumber,
        introducerName: body.introducerName?.trim() || null,
        sources: body.sources ? JSON.stringify(body.sources) : null,
        customerName,
        phones: JSON.stringify(phones),
        address: body.address?.trim() || null,
        addressMedia: body.addressMedia ? JSON.stringify(body.addressMedia) : null,
        workTypes: body.workTypes ? JSON.stringify(body.workTypes) : null,
        workTypeOther: body.workTypeOther?.trim() || null,
        requestDate: body.requestDate ? safeDate(body.requestDate) : new Date(),
        measurementDate,
        status: "PENDING",
        salesRep: session?.displayName || body.salesRep || null,
        notes: body.notes?.trim() || null,
      },
    })

    // پیامک خودکار (اگر سرویس پیامک دارید؛ فعلاً best-effort)
    try {
      const text =
        `مشتری گرامی ${customerName}، درخواست اندازه‌گیری شما با شماره ${measurementNumber} در شرکت شیشه و آینه اخوان ثبت شد. ` +
        `هماهنگی حضور در محل انجام می‌شود. تماس: 02191005103`
      await fetch(
        `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/sms/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mobile: phones[0], text, kind: "measurement" }),
        }
      ).catch(() => null)

      await prisma.measurementRequest.update({
        where: { id: item.id },
        data: { smsSentAt: new Date(), smsStatus: "SENT_OR_QUEUED" },
      })
    } catch {
      /* پیامک اختیاری */
    }

    return NextResponse.json({ success: true, item }, { status: 201 })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در ثبت اندازه‌گیری" },
      { status: 500 }
    )
  }
}