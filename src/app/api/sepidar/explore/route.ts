import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { sepidarFetch, isMockMode } from "@/lib/sepidar/client"

// فقط متدهای GET و فقط‌خواندنی؛ برای دیدن خروجی سپیدار (بدون تغییر داده)
const METHODS: Record<string, string> = {
  saleTypes: "/api/sepidar/v1/Sales/GetAllSaleTypes",
  parties: "/api/sepidar/v1/Parties/GetAllParty",
  items: "/api/sepidar/v1/Inventory/GetAllItems",
  units: "/api/sepidar/v1/Inventory/GetAllUnits",
  stocks: "/api/sepidar/v1/Inventory/GetAllItemStockSummaries",
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "ورود لازم است" }, { status: 401 })
  }
  if (isMockMode()) {
    return NextResponse.json(
      { error: "SEPIDAR_MOCK=false را در .env بگذارید و سرور را ری‌استارت کنید" },
      { status: 400 }
    )
  }

  const sp = req.nextUrl.searchParams
  const m = sp.get("m") || ""
  const path = METHODS[m]
  if (!path) {
    return NextResponse.json(
      { error: "پارامتر m نامعتبر است", allowed: Object.keys(METHODS) },
      { status: 400 }
    )
  }

  // بقیه‌ی پارامترها (مثل iscustomer) عیناً به سپیدار پاس داده می‌شوند
  const forward = new URLSearchParams()
  sp.forEach((v, k) => {
    if (k !== "m" && k !== "limit") forward.set(k, v)
  })
  if (m === "parties" && ![...forward.keys()].some((k) => k.toLowerCase() === "iscustomer")) {
    forward.set("iscustomer", "1")
  }
  const limit = Math.max(1, Math.min(Number(sp.get("limit")) || 50, 2000))

  try {
    const qs = forward.toString()
    const res = await sepidarFetch(qs ? `${path}?${qs}` : path, {
      signal: AbortSignal.timeout(30_000),
    })
    const text = await res.text()
    let data: any
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = { raw: text }
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: `Sepidar ${res.status}`, response: data },
        { status: 502 }
      )
    }
    if (Array.isArray(data)) {
      return NextResponse.json({
        method: m,
        total: data.length,
        shown: Math.min(limit, data.length),
        data: data.slice(0, limit),
      })
    }
    return NextResponse.json({ method: m, data })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "خطا در ارتباط با سپیدار" },
      { status: 500 }
    )
  }
}