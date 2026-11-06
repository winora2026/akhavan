import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { sepidarGet, extractList } from "@/lib/sepidar/client"

// فقط‌خواندنی: فهرست حساب‌های سپیدار (برای پیدا کردن شناسه‌ی حساب معین، مثلاً «پرداختنی»).
//   /api/sepidar/accounts?q=پرداختنی        → حساب‌هایی که عنوانشان این متن را دارد
//   /api/sepidar/accounts?q=111201          → یا کدشان این عدد است
// چیزی تغییر نمی‌دهد؛ بعد از استفاده پاکش کنید.

const norm = (s: unknown) =>
  String(s ?? "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[‌\s]+/g, "")
    .toLowerCase()

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "ورود لازم است" }, { status: 401 })

  const q = norm(req.nextUrl.searchParams.get("q"))
  const started = Date.now()
  const all: any[] = []
  let truncated = false
  let error: string | null = null

  try {
    for (let page = 1; page <= 100; page++) {
      if (Date.now() - started > 40_000) {
        truncated = true // قبل از تایم‌اوت nginx (۶۰ ثانیه) متوقف می‌شویم
        break
      }
      const data = await sepidarGet("/api/sepidar/v1/Accounting/GetAllAccounts", { Page: page, ItemCount: 50 })
      const list = extractList(data)
      all.push(...list)
      if (list.length < 50) break
    }
  } catch (e: any) {
    error = e?.message ?? String(e)
  }

  const matches = q
    ? all.filter((a) => norm(JSON.stringify(a)).includes(q)).slice(0, 40)
    : []

  return NextResponse.json({
    totalRead: all.length,
    truncated,
    error,
    keys: all[0] ? Object.keys(all[0]) : [],
    matches: q ? matches : "q بده تا حساب‌ها فیلتر شوند",
    sample: q ? undefined : all.slice(0, 3),
  })
}