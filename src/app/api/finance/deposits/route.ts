import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function endOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const from = searchParams.get("from")
    const to = searchParams.get("to")
    const q = (searchParams.get("q") || "").trim()
    const status = searchParams.get("status") || "همه"

    const where: any = {}
    if (from || to) {
      where.depositDate = {}
      if (from) where.depositDate.gte = startOfDay(new Date(from))
      if (to) where.depositDate.lte = endOfDay(new Date(to))
    }
    if (status === "PENDING" || status === "CONFIRMED") {
      where.status = status
    }
    if (q) {
      where.OR = [
        { customerName: { contains: q } },
        { customerCode: { contains: q } },
        { notes: { contains: q } },
      ]
    }

    const rows = await prisma.customerDeposit.findMany({
      where,
      include: { bankAccount: true, customer: true },
      orderBy: [{ depositDate: "desc" }, { createdAt: "desc" }],
    })
    return NextResponse.json(rows)
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 })
    }

    const body = await req.json()
    const amount = Number(body.amount)
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "مبلغ معتبر نیست" }, { status: 400 })
    }
    if (!body.bankAccountId) {
      return NextResponse.json({ error: "حساب بانکی الزامی است" }, { status: 400 })
    }
    if (!body.customerName?.trim()) {
      return NextResponse.json({ error: "نام مشتری الزامی است" }, { status: 400 })
    }

    let customerId = body.customerId || null
    let customerCode = body.customerCode || null
    const customerName = String(body.customerName).trim()

    if (!customerId) {
      const found = await prisma.customer.findFirst({
        where: { name: customerName },
      })
      if (found) {
        customerId = found.id
        customerCode = customerCode || found.customerCode
      }
    }

    const row = await prisma.customerDeposit.create({
      data: {
        customerId,
        customerName,
        customerCode,
        amount,
        depositDate: body.depositDate ? new Date(body.depositDate) : new Date(),
        bankAccountId: body.bankAccountId,
        receiptImageUrl: body.receiptImageUrl || null,
        notes: body.notes || null,
        status: "PENDING",
        createdById: session.id,
        createdByName: session.displayName,
      },
      include: { bankAccount: true },
    })

    return NextResponse.json({ success: true, deposit: row }, { status: 201 })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 })
    }
    if (session.role !== "finance" && session.role !== "admin") {
      return NextResponse.json(
        { error: "فقط مالی/مدیر می‌تواند تأیید کند" },
        { status: 403 }
      )
    }

    const body = await req.json()
    const { id, action } = body
    if (!id || action !== "confirm") {
      return NextResponse.json({ error: "درخواست نامعتبر" }, { status: 400 })
    }

    const row = await prisma.customerDeposit.update({
      where: { id },
      data: {
        status: "CONFIRMED",
        confirmedById: session.id,
        confirmedByName: session.displayName,
        confirmedAt: new Date(),
      },
      include: { bankAccount: true },
    })

    return NextResponse.json({ success: true, deposit: row })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}