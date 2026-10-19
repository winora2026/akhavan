import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { sepidarFetch, isMockMode, getAll } from "@/lib/sepidar/client"

// فقط متدهای GET و فقط‌خواندنی؛ برای دیدن خروجی سپیدار (بدون تغییر داده)
const METHODS: Record<string, string> = {
  saleTypes: "/api/sepidar/v1/Sales/GetAllSaleTypes",
  parties: "/api/sepidar/v1/Parties/GetAllParty",
  items: "/api/sepidar/v1/Inventory/GetAllItems",
  units: "/api/sepidar/v1/Inventory/GetAllUnits",
  stocks: "/api/sepidar/v1/Inventory/GetAllItemStockSummaries",
  locations: "/api/sepidar/v1/Generals/GetAllLocation",
  currencies: "/api/sepidar/v1/Generals/GetAllCurrency",
  stockList: "/api/sepidar/v1/Inventory/GetAllStocks",
}

// مسیر دلخواه برای کشف متدهای دیگر: فقط متدهای خواندنی که اسمشان با Get شروع می‌شود
// مثال: ?path=/api/sepidar/v1/Sales/GetAllInvoices
const SAFE_PATH = /^\/api\/sepidar\/v1\/[A-Za-z]+\/Get[A-Za-z]*$/

function norm(s: string) {
  return (s || "")
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function resolveTarget(sp: URLSearchParams): { key: string; path: string } | null {
  const m = sp.get("m") || ""
  if (METHODS[m]) return { key: m, path: METHODS[m] }

  const custom = (sp.get("path") || "").trim()
  if (custom && SAFE_PATH.test(custom)) return { key: custom, path: custom }

  return null
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
  const target = resolveTarget(sp)
  if (!target) {
    return NextResponse.json(
      {
        error: "پارامتر m یا path نامعتبر است",
        allowed: Object.keys(METHODS),
        hint: "برای متد دیگر: ?path=/api/sepidar/v1/<ماژول>/Get... (فقط متدهای Get)",
      },
      { status: 400 }
    )
  }
  const m = target.key
  const path = target.path

  try {
    // جستجوی نام در کل رکوردها: ?m=parties&q=قربانی
    const q = sp.get("q")
    if (q) {
      const all = await getAll(
        path,
        m === "parties" ? { IsCustomer: sp.get("IsCustomer") || "true" } : {},
        200
      )
      const nq = norm(q)
      const hit = all
        .filter((p: any) => norm(JSON.stringify(p)).includes(nq))
        .slice(0, 20)
      return NextResponse.json({
        method: m,
        q,
        totalLoaded: all.length,
        matches: hit.length,
        data: hit,
      })
    }

    // بقیه‌ی پارامترها (مثل IsCustomer) عیناً به سپیدار پاس داده می‌شوند
    const forward = new URLSearchParams()
    sp.forEach((v, k) => {
      if (k !== "m" && k !== "path" && k !== "limit" && k !== "q") forward.set(k, v)
    })
    const has = (name: string) =>
      [...forward.keys()].some((k) => k.toLowerCase() === name.toLowerCase())
    if (m === "parties" && !has("IsCustomer")) forward.set("IsCustomer", "true")
    if (!has("Page")) forward.set("Page", "1")
    if (!has("ItemCount")) forward.set("ItemCount", "50")
    const limit = Math.max(1, Math.min(Number(sp.get("limit")) || 50, 2000))

    const res = await sepidarFetch(`${path}?${forward.toString()}`, {
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
        {
          error: `Sepidar ${res.status}`,
          correlationId: res.headers.get("x-correlation-id"),
          response: data,
        },
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