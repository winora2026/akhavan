import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sharesNameToken } from "@/lib/sepidar/customerCodes"

// ذخیره و خواندن مشتریانی که از صفحه‌ی «مدیریت مشتریان» ثبت می‌شوند.
// مشتریان قدیمی (فایل customers-seed.json) همچنان از خود فایل خوانده می‌شوند.

function parseProfile(p: string | null | undefined) {
  try {
    return p ? JSON.parse(p) : null
  } catch {
    return null
  }
}

function buildData(body: any) {
  const name = String(body?.name ?? "").trim()
  if (!name) return { error: "نام مشتری الزامی است" as const }
  const code = String(body?.code ?? "").trim()
  return {
    data: {
      customerCode: code || null,
      name,
      customerGroup: String(body?.group || "همکار"),
      phone: body?.phone ? String(body.phone).trim() || null : null,
      address: body?.address ? String(body.address).trim() || null : null,
      notes: body?.notes ? String(body.notes).trim() || null : null,
      profile: body?.profile ? JSON.stringify(body.profile) : null,
    },
  }
}

function errorResponse(error: any, fallback: string) {
  if (error?.code === "P2002") {
    return NextResponse.json({ error: "این کد مشتری قبلاً استفاده شده است" }, { status: 409 })
  }
  if (error?.code === "P2003") {
    return NextResponse.json({ error: "این مشتری سفارش یا سابقه دارد و قابل حذف نیست" }, { status: 409 })
  }
  if (error?.code === "P2025") {
    return NextResponse.json({ error: "مشتری پیدا نشد" }, { status: 404 })
  }
  console.error(fallback, error)
  return NextResponse.json({ error: error?.message || fallback }, { status: 500 })
}

export async function GET() {
  try {
    const rows = await prisma.customer.findMany({ orderBy: { createdAt: "asc" } })
    return NextResponse.json(
      rows.map((c: any) => ({
        id: c.id,
        customerCode: c.customerCode,
        name: c.name,
        customerGroup: c.customerGroup,
        phone: c.phone,
        address: c.address,
        notes: c.notes,
        profile: parseProfile(c.profile),
        createdAt: c.createdAt,
      }))
    )
  } catch (error: any) {
    return errorResponse(error, "خطا در دریافت مشتریان")
  }
}

export async function POST(req: NextRequest) {
  try {
    const built = buildData(await req.json())
    if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 })

    // اولین ویرایشِ مشتری seed: اگر برای همین کد از قبل ردیفی در دیتابیس هست (مثلاً از سفارش یا لینک سپیدار ساخته شده
    // و کدش با سپیدار هماهنگ شده)، به‌جای خطای «کد تکراری»، همان ردیف به‌روز می‌شود. فقط وقتی نامشان هم می‌خواند.
    const code = built.data.customerCode
    if (code) {
      const existing: any = await prisma.customer.findUnique({ where: { customerCode: code } })
      if (existing && sharesNameToken(String(existing.name || ""), built.data.name)) {
        const { customerCode: _keep, ...rest } = built.data
        await prisma.customer.update({ where: { id: existing.id }, data: rest })
        return NextResponse.json({ success: true, id: existing.id }, { status: 200 })
      }
    }

    const created = await prisma.customer.create({ data: built.data })
    return NextResponse.json({ success: true, id: created.id }, { status: 201 })
  } catch (error: any) {
    return errorResponse(error, "خطا در ثبت مشتری")
  }
}

export async function PUT(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get("id")
    if (!id) return NextResponse.json({ error: "شناسه مشتری الزامی است" }, { status: 400 })
    const built = buildData(await req.json())
    if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 })

    // مشتری‌ای که به سپیدار وصل است: کد او را سپیدار تعیین کرده و ویرایش فرم نباید آن را بازنویسی کند
    // (صفحه‌ی باز قبل از کانورت هنوز کد قدیمی را دارد و ذخیره‌اش کد سپیدار را برمی‌گرداند به کد قدیمی)
    const current: any = await prisma.customer.findUnique({
      where: { id },
      select: { sepidarPartyRef: true },
    })
    const data: any = { ...built.data }
    if (current?.sepidarPartyRef) delete data.customerCode

    await prisma.customer.update({ where: { id }, data })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return errorResponse(error, "خطا در ویرایش مشتری")
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get("id")
    if (!id) return NextResponse.json({ error: "شناسه مشتری الزامی است" }, { status: 400 })
    await prisma.customer.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return errorResponse(error, "خطا در حذف مشتری")
  }
}