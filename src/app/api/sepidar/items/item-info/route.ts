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

  try {
    const data = await sepidarGet("/api/sepidar/v1/Inventory/GetAllItems", { Code: code, Page: 1, ItemCount: 50 })
    out.sepidarItem = extractList(data).filter((it: any) => String(it?.code ?? it?.Code ?? "") === code)
  } catch (e: any) {
    out.sepidarItemError = e?.message
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
    const title = String(out.sepidarItem?.[0]?.title ?? out.sepidarItem?.[0]?.Title ?? "")
    out.itemMapRows = maps.filter((m) => title && String(m.productName).includes(title.slice(0, 8)))
  } catch (e: any) {
    out.itemMapError = e?.message
  }

  return NextResponse.json(out)
}