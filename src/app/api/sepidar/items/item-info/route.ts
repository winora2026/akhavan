import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sepidarGet, extractList } from "@/lib/sepidar/client"

// فقط‌خواندنی و موقت: نشان می‌دهد یک کالا در سپیدار چه فیلدهایی دارد (به‌خصوص انبار)
// و در اخوان به چه انباری نگاشت شده. چیزی نمی‌نویسد؛ بعد از استفاده پاکش کنید.
//   /api/sepidar/items/item-info?code=50944
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "ورود لازم است" }, { status: 401 })

  const code = String(req.nextUrl.searchParams.get("code") || "").trim()
  if (!code) return NextResponse.json({ error: "code لازم است" }, { status: 400 })

  const out: any = { code }

  // از فهرست آیتم‌هایی که سرور همین حالا در حافظه دارد می‌خوانیم (خواندن دوباره‌ی کل فهرست از nginx تایم‌اوت می‌شود)
  const idx = (globalThis as any).__sepidarItemStore?.index
  if (idx?.list?.length) {
    const all: any[] = idx.list
    out.totalItemsInCache = all.length
    out.sepidarItem = all.filter((it: any) => String(it?.Code ?? it?.code ?? "").trim() === code)
    out.sampleItemKeys = all[0] ? Object.keys(all[0]) : []
  } else {
    out.sepidarItemError =
      "فهرست آیتم‌ها هنوز در حافظه‌ی سرور نیست. یک فاکتور را پیش‌نمایش/ارسال کن یا سرور را ری‌استارت کن، چند دقیقه صبر کن و دوباره امتحان کن."
  }

  // لیست انبارها؛ نام دقیق متد را نمی‌دانیم، چند نام رایج را امتحان می‌کنیم
  out.stocks = {}
  for (const p of ["Inventory/GetAllStocks", "Inventory/GetStocks", "Inventory/GetAllStock", "Inventory/GetAllWarehouses"]) {
    try {
      out.stocks[p] = extractList(await sepidarGet(`/api/sepidar/v1/${p}`, { Page: 1, ItemCount: 50 })).slice(0, 50)
      break
    } catch (e: any) {
      out.stocks[p] = `خطا: ${String(e?.message).slice(0, 120)}`
    }
  }

  try {
    const maps: any[] = await (prisma as any).sepidarItemMap.findMany()
    const title = String(out.sepidarItem?.[0]?.Title ?? out.sepidarItem?.[0]?.title ?? "")
    out.itemMapRows = maps.filter((m) => title && String(m.productName).includes(title.slice(0, 8)))
  } catch (e: any) {
    out.itemMapError = e?.message
  }

  return NextResponse.json(out)
}