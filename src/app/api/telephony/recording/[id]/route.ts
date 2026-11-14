import { NextRequest, NextResponse } from "next/server"
import { createReadStream, statSync } from "fs"
import { Readable } from "stream"
import path from "path"
import { getSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { resolveRecordingPath } from "@/lib/telephony/storage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const call = await prisma.pbxCall.findUnique({
    where: { id },
    select: { recordingPath: true, recordingFile: true },
  })
  if (!call) {
    return NextResponse.json({ error: "تماس یافت نشد" }, { status: 404 })
  }

  const filePath = resolveRecordingPath(call.recordingPath)
  if (!filePath) {
    return NextResponse.json({ error: "فایل ضبط برای این تماس موجود نیست" }, { status: 404 })
  }

  let stat
  try {
    stat = statSync(filePath)
  } catch {
    return NextResponse.json(
      { error: "فایل ضبط هنوز به سرور CRM منتقل نشده است" },
      { status: 404 }
    )
  }
  if (!stat.isFile()) {
    return NextResponse.json({ error: "فایل ضبط موجود نیست" }, { status: 404 })
  }

  const size = stat.size
  const rangeHeader = req.headers.get("range")
  let start = 0
  let end = size - 1
  let status = 200

  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
    if (!match) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      })
    }
    if (match[1]) start = Number(match[1])
    if (match[2]) end = Number(match[2])
    if (!match[1] && match[2]) {
      const suffix = Number(match[2])
      start = Math.max(size - suffix, 0)
      end = size - 1
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      })
    }
    end = Math.min(end, size - 1)
    status = 206
  }

  const stream = createReadStream(filePath, { start, end })
  const headers: Record<string, string> = {
    "Content-Type": "audio/wav",
    "Content-Length": String(end - start + 1),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": `inline; filename="${encodeURIComponent(path.basename(filePath))}"`,
  }
  if (status === 206) {
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`
  }

  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
    status,
    headers,
  })
}
