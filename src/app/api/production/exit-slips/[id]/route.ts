import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const slip = await prisma.exitSlip.findUnique({
    where: { id },
    include: { items: true },
  })
  if (!slip) {
    return NextResponse.json({ error: "یافت نشد" }, { status: 404 })
  }
  return NextResponse.json(slip)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const { action } = body

  if (action === "print") {
    const slip = await prisma.exitSlip.update({
      where: { id },
      data: { printCount: { increment: 1 } },
      include: { items: true },
    })
    return NextResponse.json({ success: true, slip })
  }

  return NextResponse.json({ error: "عملیات نامعتبر" }, { status: 400 })
}