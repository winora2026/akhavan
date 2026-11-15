import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { safeDate } from "@/lib/date"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const item = await prisma.measurementRequest.findUnique({ where: { id } })
  if (!item) return NextResponse.json({ error: "یافت نشد" }, { status: 404 })
  return NextResponse.json(item)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const session = await getSession()

    const data: any = {}
    if (body.introducerName !== undefined) data.introducerName = body.introducerName
    if (body.sources !== undefined) data.sources = JSON.stringify(body.sources)
    if (body.customerName !== undefined) data.customerName = body.customerName
    if (body.phones !== undefined) data.phones = JSON.stringify(body.phones)
    if (body.address !== undefined) data.address = body.address
    if (body.addressMedia !== undefined)
      data.addressMedia = JSON.stringify(body.addressMedia)
    if (body.workTypes !== undefined) data.workTypes = JSON.stringify(body.workTypes)
    if (body.workTypeOther !== undefined) data.workTypeOther = body.workTypeOther
    if (body.measurementDate !== undefined)
      data.measurementDate = safeDate(body.measurementDate)
    if (body.resultNotes !== undefined) data.resultNotes = body.resultNotes
    if (body.resultMedia !== undefined)
      data.resultMedia = JSON.stringify(body.resultMedia)
    if (body.voiceNotes !== undefined)
      data.voiceNotes = JSON.stringify(body.voiceNotes)
    if (body.notes !== undefined) data.notes = body.notes
    if (body.assignedTo !== undefined) data.assignedTo = body.assignedTo
    if (body.orderId !== undefined) data.orderId = body.orderId
    if (body.orderNumber !== undefined) data.orderNumber = body.orderNumber

    if (body.status === "DONE") {
      data.status = "DONE"
      if (!body.assignedTo && session?.displayName) {
        data.assignedTo = session.displayName
      }
    }
    if (body.status === "PENDING") data.status = "PENDING"
    if (body.status === "CANCELLED") data.status = "CANCELLED"

    const item = await prisma.measurementRequest.update({
      where: { id },
      data,
    })
    return NextResponse.json({ success: true, item })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e.message || "خطا" }, { status: 500 })
  }
}