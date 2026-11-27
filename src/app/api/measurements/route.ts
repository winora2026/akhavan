import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { safeDate } from "@/lib/date"
import { notifyMeasurementRegistered } from "@/lib/measurementSms"

const DEFAULT_INSTALLER_NAME = "آقای هادی زنگنه"
const DEFAULT_INSTALLER_PHONE = "09127372431"

// شماره‌ی درخواست: ترتیبی از ۱ (۱، ۲، ۳، ...)
async function nextMeasurementNumber() {
  const rows = await prisma.measurementRequest.findMany({
    select: { measurementNumber: true },
  })
  let max = 0
  for (const r of rows) {
    const n = Number(
      String(r.measurementNumber || "").match(/(\d+)$/)?.[1] || 0
    )
    if (n > max) max = n
  }
  return String(max + 1)
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
        { region: { contains: q } },
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
      return NextResponse.json(
        { error: "نام مشتری الزامی است" },
        { status: 400 }
      )
    }

    const phones = Array.isArray(body.phones)
      ? body.phones.map((p: any) => String(p).trim()).filter(Boolean)
      : []
    if (phones.length === 0) {
      return NextResponse.json(
        { error: "حداقل یک شماره تلفن لازم است" },
        { status: 400 }
      )
    }

    const measurementNumber = await nextMeasurementNumber()

    // تاریخ اندازه‌گیری: پیش‌فرض +۲ روز
    const measurementDate = body.measurementDate
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
        region: body.region?.trim() || null,
        addressMedia: body.addressMedia
          ? JSON.stringify(body.addressMedia)
          : null,
        workTypes: body.workTypes ? JSON.stringify(body.workTypes) : null,
        workTypeOther: body.workTypeOther?.trim() || null,
        requestDate: body.requestDate
          ? safeDate(body.requestDate)
          : new Date(),
        measurementDate,
        status: "PENDING",
        salesRep: session?.displayName || body.salesRep || null,
        notes: body.notes?.trim() || null,
        installerName:
          body.installerName?.trim() || DEFAULT_INSTALLER_NAME,
        installerPhone:
          body.installerPhone?.trim() || DEFAULT_INSTALLER_PHONE,
        appointmentFixed: false,
      },
    })

    // پیامک تأیید ثبت برای مشتری (بدون معطلیِ ثبت درخواست)
    void notifyMeasurementRegistered(item.id)

    return NextResponse.json({ success: true, item }, { status: 201 })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در ثبت اندازه‌گیری" },
      { status: 500 }
    )
  }
}