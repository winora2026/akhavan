import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isMockMode } from "@/lib/sepidar/client"
import { auditSeedAgainstSepidar } from "@/lib/sepidar/seedAudit"

// فقط‌خواندنی
//  GET                              → خلاصه‌ی مقایسه‌ی لیست مشتریان با سپیدار
//  GET ?list=<نام>                  → همه‌ی ردیف‌های یک فهرست (JSON)
//  GET ?list=<نام>&format=csv       → همان فهرست به‌صورت CSV (برای Excel / حسابدار)
// نام فهرست‌ها: codeNotInSepidar, nameMismatch, duplicateNamesInList, duplicateCodesInList, sepidarNotInList

const CSV_LISTS: Record<string, { header: string[]; row: (r: any) => (string | number | null)[] }> = {
  codeNotInSepidar: {
    header: ["کد", "نام در لیست اخوان"],
    row: (r) => [r.code, r.name],
  },
  nameMismatch: {
    header: ["کد", "نام در لیست اخوان", "نام در سپیدار", "شناسه سپیدار"],
    row: (r) => [r.code, r.listName, r.sepidarName, r.partyId],
  },
  duplicateNamesInList: {
    header: ["نام", "کدها"],
    row: (r) => [r.name, (r.codes || []).join(" | ")],
  },
  duplicateCodesInList: {
    header: ["کد", "نام‌ها"],
    row: (r) => [r.code, (r.names || []).join(" | ")],
  },
  sepidarNotInList: {
    header: ["کد", "نام در سپیدار", "شناسه سپیدار"],
    row: (r) => [r.code, r.name, r.partyId],
  },
}

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "ورود لازم است" }, { status: 401 })
    }
    if (isMockMode()) {
      return NextResponse.json({ error: "حالت آزمایشی فعال است" }, { status: 400 })
    }

    const list = req.nextUrl.searchParams.get("list")
    const format = req.nextUrl.searchParams.get("format")

    if (!list) {
      return NextResponse.json(await auditSeedAgainstSepidar())
    }

    const spec = CSV_LISTS[list]
    if (!spec) {
      return NextResponse.json(
        { error: "نام فهرست نامعتبر است", allowed: Object.keys(CSV_LISTS) },
        { status: 400 }
      )
    }

    const data: any = await auditSeedAgainstSepidar({ full: true })
    const section = data[list]
    const rows: any[] = section?.sample ?? []

    if (format === "csv") {
      const lines = [spec.header.map(csvCell).join(",")]
      for (const r of rows) lines.push(spec.row(r).map(csvCell).join(","))
      return new NextResponse("\uFEFF" + lines.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${list}.csv"`,
        },
      })
    }

    return NextResponse.json({ list, count: rows.length, rows })
  } catch (e: any) {
    console.error("sepidar seed audit:", e)
    return NextResponse.json({ error: e?.message || "خطا" }, { status: 500 })
  }
}