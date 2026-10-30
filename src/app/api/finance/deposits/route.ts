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

function norm(s: string) {
  return (s || "")
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/ي/g, "ی")
    .replace(/ى/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
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

    let rows = await prisma.customerDeposit.findMany({
      where,
      include: { bankAccount: true, customer: true },
      orderBy: [{ depositDate: "desc" }, { createdAt: "desc" }],
    })

    if (q) {
      const nq = norm(q)
      rows = rows.filter((r) => {
        const name = norm(r.customerName)
        const code = norm(r.customerCode || r.customer?.customerCode || "")
        const notes = norm(r.notes || "")
        return name.includes(nq) || code.includes(nq) || notes.includes(nq)
      })
    }

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
      const all = await prisma.customer.findMany()
      const nName = norm(customerName)
      const found =
        all.find((c) => norm(c.name) === nName) ||
        all.find((c) => norm(c.name).includes(nName))
      if (found) {
        customerId = found.id
        customerCode = customerCode || found.customerCode
      }
    } else if (!customerCode) {
      const c = await prisma.customer.findUnique({ where: { id: customerId } })
      customerCode = c?.customerCode || null
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
      include: { bankAccount: true, customer: true },
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

    const body = await req.json()
    const { id, action } = body
    if (!id) {
      return NextResponse.json({ error: "id الزامی است" }, { status: 400 })
    }

    // تأیید مالی
    if (action === "confirm") {
      if (session.role !== "finance" && session.role !== "admin") {
        return NextResponse.json(
          { error: "فقط مالی/مدیر می‌تواند تأیید کند" },
          { status: 403 }
        )
      }
      const row = await prisma.customerDeposit.update({
        where: { id },
        data: {
          status: "CONFIRMED",
          confirmedById: session.id,
          confirmedByName: session.displayName,
          confirmedAt: new Date(),
        },
        include: { bankAccount: true, customer: true },
      })
      return NextResponse.json({ success: true, deposit: row })
    }

    // ویرایش
    if (action === "update") {
      const existing = await prisma.customerDeposit.findUnique({ where: { id } })
      if (!existing) {
        return NextResponse.json({ error: "یافت نشد" }, { status: 404 })
      }
      // بعد از تأیید فقط admin
      if (
        existing.status === "CONFIRMED" &&
        session.role !== "admin" &&
        session.role !== "finance"
      ) {
        return NextResponse.json(
          { error: "واریزی تأییدشده را نمی‌توانید ویرایش کنید" },
          { status: 403 }
        )
      }

      const amount = body.amount != null ? Number(body.amount) : existing.amount
      if (!amount || amount <= 0) {
        return NextResponse.json({ error: "مبلغ معتبر نیست" }, { status: 400 })
      }

      let customerId = body.customerId ?? existing.customerId
      let customerCode = body.customerCode ?? existing.customerCode
      const customerName = body.customerName?.trim() || existing.customerName

      if (body.customerName && !body.customerId) {
        const all = await prisma.customer.findMany()
        const nName = norm(customerName)
        const found = all.find((c) => norm(c.name) === nName)
        if (found) {
          customerId = found.id
          customerCode = found.customerCode
        }
      }

      const row = await prisma.customerDeposit.update({
        where: { id },
        data: {
          customerId,
          customerName,
          customerCode,
          amount,
          depositDate: body.depositDate
            ? new Date(body.depositDate)
            : existing.depositDate,
          bankAccountId: body.bankAccountId || existing.bankAccountId,
          receiptImageUrl:
            body.receiptImageUrl !== undefined
              ? body.receiptImageUrl
              : existing.receiptImageUrl,
          notes: body.notes !== undefined ? body.notes : existing.notes,
        },
        include: { bankAccount: true, customer: true },
      })
      return NextResponse.json({ success: true, deposit: row })
    }

    return NextResponse.json({ error: "عملیات نامعتبر" }, { status: 400 })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) {
      return NextResponse.json({ error: "id الزامی است" }, { status: 400 })
    }

    const existing = await prisma.customerDeposit.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: "یافت نشد" }, { status: 404 })
    }

    // تأییدشده: فقط admin/finance
    if (existing.status === "CONFIRMED") {
      if (session.role !== "admin" && session.role !== "finance") {
        return NextResponse.json(
          { error: "حذف واریزی تأییدشده فقط توسط مالی/مدیر" },
          { status: 403 }
        )
      }
    }

    await prisma.customerDeposit.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}