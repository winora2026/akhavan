import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { normalizeFaName } from "@/lib/hr"

/** حذف پسوند (پرسنل …) از نام */
function cleanName(s: string) {
  return String(s || "")
    .replace(/\(?\s*پرسنل[^)]*\)?/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[()]/g, "")
    .trim()
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "وارد شوید" }, { status: 401 })
    }
    if (!["admin", "finance"].includes(session.role)) {
      return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 })
    }

    const found: { code: string; name: string; phone?: string | null }[] = []

    // ۱) فایل seed اسامی مشتریان
    try {
      const p = path.join(process.cwd(), "src", "app", "customers", "customers-seed.json")
      const seed = JSON.parse(fs.readFileSync(p, "utf8"))
      if (Array.isArray(seed)) {
        for (const c of seed) {
          const raw = `${c.lastName || ""} ${c.firstName || ""} ${c.companyName || ""} ${c.notes || ""}`
          if (!raw.includes("پرسنل")) continue
          const name = cleanName(`${c.lastName || ""} ${c.firstName || ""}`) ||
            cleanName(c.companyName || "")
          if (!name) continue
          found.push({
            code: String(c.code || "").trim(),
            name,
            phone: Array.isArray(c.phones) ? c.phones[0] || null : c.phones || null,
          })
        }
      }
    } catch {}

    // ۲) مشتریان دیتابیس با پسوند پرسنل
    const dbRows = await prisma.customer.findMany({
      where: { name: { contains: "پرسنل" } },
    })
    for (const r of dbRows) {
      const name = cleanName(r.name)
      if (!name) continue
      found.push({
        code: String(r.customerCode || "").trim(),
        name,
        phone: r.phone || null,
      })
    }

    // حذف تکراری‌ها
    const seenName = new Set<string>()
    const seenCode = new Set<string>()
    const items = found.filter((x) => {
      const nk = normalizeFaName(x.name)
      if (seenName.has(nk) || (x.code && seenCode.has(x.code))) return false
      seenName.add(nk)
      if (x.code) seenCode.add(x.code)
      return true
    })

    items.sort((a, b) => a.name.localeCompare(b.name, "fa"))
    return NextResponse.json({ items })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}