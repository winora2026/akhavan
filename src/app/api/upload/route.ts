import { NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import path from "path"

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get("file") as File | null
    if (!file) {
      return NextResponse.json({ error: "فایلی ارسال نشده" }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const uploadsDir = path.join(process.cwd(), "public", "uploads")
    await mkdir(uploadsDir, { recursive: true })

    const safeName = file.name.replace(/[^a-zA-Z0-9._\u0600-\u06FF-]/g, "_")
    const fileName = `${Date.now()}-${safeName}`
    await writeFile(path.join(uploadsDir, fileName), buffer)

    return NextResponse.json({
      url: `/uploads/${fileName}`,
      name: file.name,
      type: file.type,
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در آپلود" },
      { status: 500 }
    )
  }
}