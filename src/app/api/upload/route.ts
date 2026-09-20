import { NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import path from "path"

// این مسیر عمداً خارج از پوشه‌ی پروژه است (یک پوشه بالاتر از ریشه‌ی کد)
// تا هیچ دیپلوی/بیلد جدیدی آن را پاک نکند. اگر می‌خواهی جای دیگری روی
// سرور ذخیره شود (مثلاً یک دیسک/ولوم جداگانه)، مقدار UPLOADS_DIR را در
// فایل .env سرور ست کن؛ در غیر این صورت همین پیش‌فرض استفاده می‌شود.
const UPLOADS_DIR =
  process.env.UPLOADS_DIR || path.join(process.cwd(), "..", "akhavan-uploads")

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get("file") as File | null
    if (!file) {
      return NextResponse.json({ error: "فایلی ارسال نشده" }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    await mkdir(UPLOADS_DIR, { recursive: true })

    const safeName = file.name.replace(/[^a-zA-Z0-9._\u0600-\u06FF-]/g, "_")
    const fileName = `${Date.now()}-${safeName}`
    await writeFile(path.join(UPLOADS_DIR, fileName), buffer)

    return NextResponse.json({
      url: `/api/uploads/${fileName}`,
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