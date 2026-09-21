import { NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"
import seedRaw from "../../descriptions/descriptions-seed.json"

// توضیحات (شرح) قابل انتخاب در پاپ‌آپ توضیحات قلم.
// لیست اولیه از descriptions-seed.json می‌آید؛ توضیحاتی که کارشناس‌ها اضافه می‌کنند
// در فایل data/custom-descriptions.json (کنار پروژه) ذخیره می‌شود و برای همه‌ی کاربران مشترک است.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DATA_DIR = path.join(process.cwd(), "data")
const FILE = path.join(DATA_DIR, "custom-descriptions.json")
const seed = seedRaw as string[]

const MIN_LEN = 2
const MAX_LEN = 200

// حروف عربی → فارسی، حذف کاراکترهای جهت‌ساز، یکسان‌سازی فاصله‌ها
// (نیم‌فاصله‌ی \u200c عمداً حفظ می‌شود چون در نوشتار فارسی معنا دارد)
const cleanText = (v: string) =>
  v
    .replace(/[\u200e\u200f]/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()

// کلید مقایسه برای تشخیص تکراری: بدون فاصله، ارقام لاتین، حروف کوچک
const keyOf = (v: string) =>
  cleanText(v)
    .replace(/\u200c/g, "")
    .replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰۱۲۳۴۵۶۷۸۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/\s+/g, "")
    .toLowerCase()

async function readCustom(): Promise<string[]> {
  try {
    const raw = await fs.readFile(FILE, "utf-8")
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data.filter((x) => typeof x === "string") : []
  } catch (err: any) {
    if (err?.code === "ENOENT") return []
    throw err
  }
}

async function writeCustom(list: string[]) {
  await fs.mkdir(DATA_DIR, { recursive: true })
  const tmp = FILE + ".tmp"
  await fs.writeFile(tmp, JSON.stringify(list, null, 2), "utf-8")
  await fs.rename(tmp, FILE)
}

// صف ساده تا چند درخواست هم‌زمان فایل را خراب نکنند
let queue: Promise<unknown> = Promise.resolve()

export async function GET() {
  try {
    const custom = await readCustom()
    return NextResponse.json({ custom })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "خطا در خواندن توضیحات" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است" }, { status: 400 })
  }

  const text = typeof body?.text === "string" ? cleanText(body.text) : ""
  if (text.length < MIN_LEN) {
    return NextResponse.json({ error: "توضیحات خیلی کوتاه است" }, { status: 400 })
  }
  if (text.length > MAX_LEN) {
    return NextResponse.json({ error: `توضیحات نباید بیشتر از ${MAX_LEN} کاراکتر باشد` }, { status: 400 })
  }

  const run = queue.then(async () => {
    const custom = await readCustom()
    const k = keyOf(text)

    // اگر قبلاً در لیست اولیه یا لیست اضافه‌شده‌ها باشد، همان مورد موجود برگردانده می‌شود
    const existing = [...custom, ...seed].find((d) => keyOf(d) === k)
    if (existing) return { text: existing, custom, duplicate: true }

    const next = [text, ...custom]
    await writeCustom(next)
    return { text, custom: next, duplicate: false }
  })
  queue = run.catch(() => undefined)

  try {
    return NextResponse.json(await run)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "خطا در ذخیره توضیحات" }, { status: 500 })
  }
}