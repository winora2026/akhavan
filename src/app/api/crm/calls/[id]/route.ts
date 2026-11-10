import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const item = await prisma.voiceCall.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        lead: { select: { id: true, name: true, mobile: true, status: true } },
      },
    })
    if (!item) {
      return NextResponse.json({ error: "تماس یافت نشد" }, { status: 404 })
    }
    return NextResponse.json(item)
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "خطا" },
      { status: 500 }
    )
  }
}