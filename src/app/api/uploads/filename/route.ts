import { NextRequest, NextResponse } from "next/server"
import { readFile, stat } from "fs/promises"
import path from "path"

// باید دقیقاً همان مسیری باشد که در app/api/upload/route.ts استفاده شده
const UPLOADS_DIR =
  process.env.UPLOADS_DIR || path.join(process.cwd(), "..", "akhavan-uploads")

const mimeByExt: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params

    // جلوگیری از path traversal (مثلاً ../../etc/passwd)
    const safeFilename = path.basename(filename)
    const filePath = path.join(UPLOADS_DIR, safeFilename)

    // مطمئن می‌شویم مسیر نهایی هنوز داخل UPLOADS_DIR است
    if (!filePath.startsWith(path.join(UPLOADS_DIR))) {
      return NextResponse.json({ error: "مسیر نامعتبر" }, { status: 400 })
    }

    await stat(filePath) // اگر فایل نباشد اینجا throw می‌کند → catch پایین
    const data = await readFile(filePath)

    const ext = path.extname(safeFilename).toLowerCase()
    const contentType = mimeByExt[ext] || "application/octet-stream"

    return new NextResponse(data, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch (e) {
    return NextResponse.json({ error: "فایل پیدا نشد" }, { status: 404 })
  }
}