import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { safeDate } from "@/lib/date"

const INSTALLER_NAME = "آقای هادی زنگنه"
const INSTALLER_PHONE = "09127372431"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const item = await prisma.installationJob.findUnique({ where: { id } })
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

    if (body.region !== undefined) data.region = body.region
    if (body.address !== undefined) data.address = body.address
    if (body.customerPhone !== undefined) data.customerPhone = body.customerPhone

    if (body.installationDate !== undefined)
      data.installationDate = body.installationDate
        ? safeDate(body.installationDate)
        : null

    if (body.appointmentDate !== undefined)
      data.appointmentDate = body.appointmentDate
        ? safeDate(body.appointmentDate)
        : null
    if (body.appointmentTimeFrom !== undefined)
      data.appointmentTimeFrom = body.appointmentTimeFrom
    if (body.appointmentTimeTo !== undefined)
      data.appointmentTimeTo = body.appointmentTimeTo
    if (body.appointmentFixed !== undefined)
      data.appointmentFixed = Boolean(body.appointmentFixed)

    if (body.checklist !== undefined)
      data.checklist =
        typeof body.checklist === "string"
          ? body.checklist
          : JSON.stringify(body.checklist)

    if (body.resultNotes !== undefined) data.resultNotes = body.resultNotes
    if (body.resultMedia !== undefined)
      data.resultMedia = JSON.stringify(body.resultMedia)
    if (body.voiceNotes !== undefined)
      data.voiceNotes = JSON.stringify(body.voiceNotes)
    if (body.resultLocation !== undefined)
      data.resultLocation =
        typeof body.resultLocation === "string"
          ? body.resultLocation
          : body.resultLocation
            ? JSON.stringify(body.resultLocation)
            : null
    if (body.notes !== undefined) data.notes = body.notes

    if (body.problemReason !== undefined) data.problemReason = body.problemReason
    if (body.problemNotes !== undefined) data.problemNotes = body.problemNotes

    if (body.installerName !== undefined) data.installerName = body.installerName
    if (body.installerPhone !== undefined) data.installerPhone = body.installerPhone
    if (body.assignedTo !== undefined) data.assignedTo = body.assignedTo

    if (body.smsSentAt !== undefined)
      data.smsSentAt = body.smsSentAt ? safeDate(body.smsSentAt) : null
    if (body.smsStatus !== undefined) data.smsStatus = body.smsStatus

    if (body.status === "DONE") {
      data.status = "DONE"
      data.assignedTo =
        body.assignedTo || session?.displayName || INSTALLER_NAME
      data.installerName = body.installerName || INSTALLER_NAME
      data.installerPhone = body.installerPhone || INSTALLER_PHONE
    }
    if (body.status === "PENDING") data.status = "PENDING"
    if (body.status === "PROBLEM") {
      data.status = "PROBLEM"
      if (!body.problemReason && !body.problemNotes) {
        return NextResponse.json(
          { error: "برای ثبت مشکل، علت یا توضیح لازم است" },
          { status: 400 }
        )
      }
    }
    if (body.status === "CANCELLED") data.status = "CANCELLED"

    const item = await prisma.installationJob.update({
      where: { id },
      data,
    })
    return NextResponse.json({ success: true, item })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e.message || "خطا" }, { status: 500 })
  }
}