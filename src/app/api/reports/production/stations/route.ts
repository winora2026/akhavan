import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { mapServiceToStation } from "@/lib/createProductionOrder"

function norm(s: string) {
  return (s || "")
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

const canon = (s: string) => norm(s).replace(/\s+/g, "")

function stationIsMapped(stationName: string, mapped: string) {
  const a = canon(stationName)
  const b = canon(mapped)
  if (!a || !b) return false
  if (a === b) return true
  if (b === canon("تراش") && a.startsWith("تراش") && !a.includes("الگویی"))
    return true
  return false
}

function unitLabel(unit: string): string | null {
  switch (unit) {
    case "مترمربع":
      return "متر مربع"
    case "مترطول":
    case "محیط":
    case "چند طول چند عرض":
      return "متر طول"
    case "عددی":
      return "عدد"
    case "ابعاد دایره":
      return "دایره"
    default:
      return null
  }
}

function sumServiceMeasures(
  servicesData: any,
  stationName: string,
  itemMeterage: number | null,
  itemQuantity: number,
  qtyFactor: number
) {
  const sums = new Map<string, number>()
  const titles: string[] = []
  try {
    const parsed =
      typeof servicesData === "string" ? JSON.parse(servicesData) : servicesData
    if (Array.isArray(parsed)) {
      for (const s of parsed) {
        const title = String(s?.title || s?.name || "").trim()
        const mapped = title ? mapServiceToStation(title) : null
        if (!mapped || !stationIsMapped(stationName, mapped)) continue
        if (!titles.includes(title)) titles.push(title)
        const label = unitLabel(String(s?.unit || ""))
        if (!label) continue
        const count = parseFloat(String(s?.count ?? "")) || 1
        const uq = String(s?.unitQuantity ?? "").trim()
        const unitQty =
          uq === "" ? (s?.unit === "عددی" ? 1 : 0) : parseFloat(uq) || 0
        const total = count * unitQty * qtyFactor
        if (total > 0) sums.set(label, (sums.get(label) || 0) + total)
      }
    }
  } catch {}
  if (sums.size === 0) {
    const m = (Number(itemMeterage) || 0) * qtyFactor
    if (m > 0) sums.set("متر مربع", m)
  }
  return {
    measures: Array.from(sums.entries()).map(([label, qty]) => ({
      label,
      qty: Number(qty.toFixed(4)),
    })),
    serviceTitles: titles,
  }
}

function matchSalesItem(item: any, salesOrder: any) {
  const list: any[] = salesOrder?.items || []
  const byId = list.find((si) => si.id === item.orderItemId)
  if (byId) return byId
  const nm = (v: any) => norm(String(v ?? ""))
  const same = list.filter(
    (si) =>
      nm(si.productName) === nm(item.productName) &&
      Number(si.length || 0) === Number(item.length || 0) &&
      Number(si.width || 0) === Number(item.width || 0)
  )
  if (same.length) return same[0]
  const byName = list.filter((si) => nm(si.productName) === nm(item.productName))
  return byName.length === 1 ? byName[0] : null
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const from = sp.get("from")
    const to = sp.get("to")
    const fromDate = from ? new Date(from) : null
    const toDate = to ? new Date(to) : null
    if (toDate) toDate.setHours(23, 59, 59, 999)

    const stations = await prisma.productionStation.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    })

    const result = []

    for (const st of stations) {
      const doneWhere: any = {
        stationId: st.id,
        status: "تکمیل شده",
      }
      if (fromDate || toDate) {
        doneWhere.completedAt = {}
        if (fromDate) doneWhere.completedAt.gte = fromDate
        if (toDate) doneWhere.completedAt.lte = toDate
      }

      const doneRows = await prisma.productionItemStation.findMany({
        where: doneWhere,
        include: {
          productionItem: {
            include: {
              productionOrder: {
                include: { order: { include: { items: true } } },
              },
            },
          },
        },
      })

      const pendingRows = await prisma.productionItemStation.findMany({
        where: {
          stationId: st.id,
          status: { in: ["در انتظار", "در حال انجام"] },
          productionItem: {
            productionOrder: { order: { status: "فاکتور" } },
          },
        },
        include: {
          productionItem: {
            include: {
              productionOrder: {
                include: { order: { include: { items: true } } },
              },
            },
          },
        },
      })

      let doneQty = 0
      let doneMeterage = 0
      const measureTotals = new Map<string, number>()
      const serviceSet = new Set<string>()
      // تجمیع کالاهای انجام‌شده
      const productMap = new Map<
        string,
        { productName: string; quantity: number; meterage: number }
      >()

      for (const row of doneRows) {
        const item = row.productionItem
        const q =
          row.quantityOut ?? row.quantityIn ?? item.quantity ?? 0
        doneQty += q
        const factor =
          item.quantity > 0 ? q / item.quantity : 1
        const lineMeter = (Number(item.meterage) || 0) * factor
        doneMeterage += lineMeter

        const pName = (item.productName || "بدون نام").trim()
        const prev = productMap.get(pName) || {
          productName: pName,
          quantity: 0,
          meterage: 0,
        }
        prev.quantity += q
        prev.meterage += lineMeter
        productMap.set(pName, prev)

        const salesItem = matchSalesItem(item, item.productionOrder?.order)
        const calc = sumServiceMeasures(
          (salesItem as any)?.servicesData,
          st.name,
          item.meterage,
          item.quantity || 1,
          factor
        )
        for (const m of calc.measures) {
          measureTotals.set(
            m.label,
            (measureTotals.get(m.label) || 0) + m.qty
          )
        }
        calc.serviceTitles.forEach((t) => serviceSet.add(t))
      }

      let pendingQty = 0
      let pendingMeterage = 0
      for (const row of pendingRows) {
        const item = row.productionItem
        const q = row.quantityIn ?? item.quantity ?? 0
        pendingQty += q
        pendingMeterage += Number(item.meterage) || 0
      }

      const doneProducts = Array.from(productMap.values())
        .map((p) => ({
          productName: p.productName,
          quantity: p.quantity,
          meterage: Number(p.meterage.toFixed(4)),
        }))
        .sort((a, b) => b.meterage - a.meterage)

      result.push({
        stationId: st.id,
        stationName: st.name,
        doneCount: doneRows.length,
        doneQuantity: doneQty,
        doneMeterage: Number(doneMeterage.toFixed(4)),
        doneMeasures: Array.from(measureTotals.entries()).map(
          ([label, qty]) => ({ label, qty: Number(qty.toFixed(4)) })
        ),
        doneServices: Array.from(serviceSet),
        doneProducts,
        pendingCount: pendingRows.length,
        pendingQuantity: pendingQty,
        pendingMeterage: Number(pendingMeterage.toFixed(4)),
      })
    }

    return NextResponse.json({ stations: result })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در گزارش ایستگاه‌ها" },
      { status: 500 }
    )
  }
}