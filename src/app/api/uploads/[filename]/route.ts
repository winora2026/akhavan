import { NextRequest, NextResponse } from "next/server"
import { readFile } from "fs/promises"
import path from "path"

const UPLOADS_DIR =
  process.env.UPLOADS_DIR || path.join(process.cwd(), "..", "akhavan-uploads")

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await context.params

    if (
      !filename ||
      filename.includes("..") ||
      filename.includes("/") ||
      filename.includes("\\")
    ) {
      return NextResponse.json({ error: "نام فایل نامعتبر است" }, { status: 400 })
    }

    const filePath = path.join(UPLOADS_DIR, filename)
    const data = await readFile(filePath)

    const ext = path.extname(filename).toLowerCase()
    const type =
      ext === ".pdf"
        ? "application/pdf"
        : ext === ".png"
          ? "image/png"
          : ext === ".jpg" || ext === ".jpeg" || ext === ".jfif"
            ? "image/jpeg"
            : ext === ".webp"
              ? "image/webp"
              : "application/octet-stream"

    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch {
    return NextResponse.json({ error: "فایل یافت نشد" }, { status: 404 })
  }
}