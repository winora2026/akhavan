"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import DatePicker, { DateObject } from "react-multi-date-picker"
import persian from "react-date-object/calendars/persian"
import persian_fa from "react-date-object/locales/persian_fa"
import gregorian from "react-date-object/calendars/gregorian"

type StationRow = {
  stationId: string
  stationName: string
  doneCount: number
  doneQuantity: number
  doneMeterage: number
  doneMeasures?: { label: string; qty: number }[]
  doneServices?: string[]
  pendingCount: number
  pendingQuantity: number
  pendingMeterage: number
}

type WasteRow = {
  wasteId: string
  createdAt: string
  quantity: number
  reason: string
  notes: string | null
  stationName: string
  responsible: string | number | null
  productName: string
  barcode: string | null
  length: number | null
  width: number | null
  orderNumber: string
  customerName: string
}

type SalesSummary = {
  preInvoiceCount: number
  preInvoiceMeterage: number
  preInvoiceAmount: number
  invoiceCount: number
  invoiceMeterage: number
  invoiceAmount: number
  conversionRatePercent: number
}

type StationSortKey =
  | "stationName"
  | "doneCount"
  | "doneQuantity"
  | "doneMeterage"
  | "pendingCount"
  | "pendingQuantity"
  | "pendingMeterage"

type WasteSortKey =
  | "createdAt"
  | "orderNumber"
  | "customerName"
  | "productName"
  | "quantity"
  | "stationName"
  | "reason"

const glassCard =
  "rounded-2xl bg-teal-500/10 backdrop-blur-2xl shadow-lg border border-teal-500/20"
const fieldClass =
  "w-full rounded-xl border border-teal-500/30 bg-white/50 px-3 py-2.5 text-base font-semibold text-blue-950 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-400"
const labelClass = "mb-1 block text-sm font-bold text-blue-900"

function toDateObject(dObj: any): DateObject | null {
  if (!dObj) return null
  try {
    if (dObj instanceof DateObject) return dObj
    if (Array.isArray(dObj)) return dObj[0] ? new DateObject(dObj[0]) : null
    return new DateObject(dObj)
  } catch {
    return null
  }
}

function dayStartIsoTehran(dObj: any): string | null {
  const d = toDateObject(dObj)
  if (!d) return null
  try {
    const g = new DateObject(d).convert(gregorian)
    const y = g.year
    const m = String(g.month.number).padStart(2, "0")
    const day = String(g.day).padStart(2, "0")
    return new Date(`${y}-${m}-${day}T00:00:00+03:30`).toISOString()
  } catch {
    return null
  }
}

function dayEndIsoTehran(dObj: any): string | null {
  const d = toDateObject(dObj)
  if (!d) return null
  try {
    const g = new DateObject(d).convert(gregorian)
    const y = g.year
    const m = String(g.month.number).padStart(2, "0")
    const day = String(g.day).padStart(2, "0")
    return new Date(`${y}-${m}-${day}T23:59:59.999+03:30`).toISOString()
  } catch {
    return null
  }
}

function defaultFrom(): DateObject {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return new DateObject({ date: d, calendar: persian, locale: persian_fa })
}

function defaultTo(): DateObject {
  return new DateObject({ calendar: persian, locale: persian_fa })
}

function formatFaDate(iso: string) {
  try {
    return new DateObject({
      date: new Date(iso),
      calendar: persian,
      locale: persian_fa,
    }).format("YYYY/MM/DD HH:mm")
  } catch {
    return iso
  }
}

function formatPrice(n: number) {
  return new Intl.NumberFormat("fa-IR").format(Math.round(n || 0))
}

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <span className="opacity-40 mr-1">↕</span>
  return <span className="mr-1">{dir === "asc" ? "↑" : "↓"}</span>
}

export default function ReportsPage() {
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<"production" | "sales">(
    searchParams.get("tab") === "sales" ? "sales" : "production"
  )
  const [fromObj, setFromObj] = useState<DateObject | null>(defaultFrom)
  const [toObj, setToObj] = useState<DateObject | null>(defaultTo)

  const [stations, setStations] = useState<StationRow[]>([])
  const [wastes, setWastes] = useState<WasteRow[]>([])
  const [wasteSummary, setWasteSummary] = useState({
    count: 0,
    totalQuantity: 0,
  })
  const [sales, setSales] = useState<SalesSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [stSort, setStSort] = useState<StationSortKey>("pendingMeterage")
  const [stDir, setStDir] = useState<"asc" | "desc">("desc")
  const [wSort, setWSort] = useState<WasteSortKey>("createdAt")
  const [wDir, setWDir] = useState<"asc" | "desc">("desc")

  const load = async () => {
    setLoading(true)
    setError("")
    try {
      const from = dayStartIsoTehran(fromObj) || ""
      const to = dayEndIsoTehran(toObj) || ""
      const q = new URLSearchParams()
      if (from) q.set("from", from)
      if (to) q.set("to", to)

      if (tab === "production") {
        const [sRes, wRes] = await Promise.all([
          fetch(`/api/reports/production/stations?${q}`),
          fetch(`/api/reports/production/waste?${q}`),
        ])
        const sData = await sRes.json()
        const wData = await wRes.json()
        if (!sRes.ok) throw new Error(sData.error || "خطا ایستگاه")
        if (!wRes.ok) throw new Error(wData.error || "خطا ضایعات")
        setStations(sData.stations || [])
        setWastes(wData.items || [])
        setWasteSummary(wData.summary || { count: 0, totalQuantity: 0 })
      } else {
        const res = await fetch(`/api/reports/sales/summary?${q}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "خطا فروش")
        setSales(data)
      }
    } catch (e: any) {
      setError(e.message || "خطا")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const toggleStSort = (key: StationSortKey) => {
    if (stSort === key) setStDir((d) => (d === "asc" ? "desc" : "asc"))
    else {
      setStSort(key)
      setStDir(key === "stationName" ? "asc" : "desc")
    }
  }

  const toggleWSort = (key: WasteSortKey) => {
    if (wSort === key) setWDir((d) => (d === "asc" ? "desc" : "asc"))
    else {
      setWSort(key)
      setWDir(key === "createdAt" ? "desc" : "asc")
    }
  }

  const sortedStations = useMemo(() => {
    const arr = [...stations]
    arr.sort((a, b) => {
      const av = a[stSort] as string | number
      const bv = b[stSort] as string | number
      let cmp = 0
      if (typeof av === "string" && typeof bv === "string") {
        cmp = av.localeCompare(bv, "fa")
      } else {
        cmp = Number(av) - Number(bv)
      }
      return stDir === "asc" ? cmp : -cmp
    })
    return arr
  }, [stations, stSort, stDir])

  const sortedWastes = useMemo(() => {
    const arr = [...wastes]
    arr.sort((a, b) => {
      const av = a[wSort]
      const bv = b[wSort]
      let cmp = 0
      if (wSort === "createdAt") {
        cmp =
          new Date(String(av)).getTime() - new Date(String(bv)).getTime()
      } else if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv
      } else {
        cmp = String(av ?? "").localeCompare(String(bv ?? ""), "fa")
      }
      return wDir === "asc" ? cmp : -cmp
    })
    return arr
  }, [wastes, wSort, wDir])

  const thBtn =
    "w-full flex items-center justify-center gap-0.5 cursor-pointer select-none hover:bg-white/10 px-1 py-0.5 rounded"

  return (
    <div
      className="min-h-screen p-4 md:p-6 relative bg-cover bg-center bg-fixed"
      dir="rtl"
      style={{
        backgroundImage:
          "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')",
        fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif",
      }}
    >
      <div className="pointer-events-none fixed inset-0 bg-black/5" />

      <div className="relative z-10 max-w-7xl mx-auto">
        <div
          className={`${glassCard} flex flex-wrap items-center justify-between gap-3 mb-4 p-4`}
        >
          <div>
            <h1 className="text-3xl font-black text-blue-950">گزارش‌ها</h1>
            <p className="text-base font-semibold text-blue-900 mt-1">
              تولید و فروش — فیلتر بازه تاریخ شمسی
            </p>
          </div>
          <Link
            href="/"
            className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-4 py-2.5 font-bold text-blue-900 transition"
          >
            داشبورد
          </Link>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setTab("production")}
            className={`rounded-xl px-6 py-2.5 font-bold shadow transition ${
              tab === "production"
                ? "bg-teal-600 text-white"
                : "bg-white/50 border border-teal-500/30 text-blue-900 hover:bg-white/70"
            }`}
          >
            تولید
          </button>
          <button
            type="button"
            onClick={() => setTab("sales")}
            className={`rounded-xl px-6 py-2.5 font-bold shadow transition ${
              tab === "sales"
                ? "bg-teal-600 text-white"
                : "bg-white/50 border border-teal-500/30 text-blue-900 hover:bg-white/70"
            }`}
          >
            فروش
          </button>
        </div>

        <div
          className={`${glassCard} p-4 mb-4 flex flex-wrap items-end gap-3`}
        >
          <div className="relative z-30">
            <label className={labelClass}>از تاریخ</label>
            <DatePicker
              value={fromObj}
              onChange={(d) => setFromObj(toDateObject(d))}
              calendar={persian}
              locale={persian_fa}
              inputClass={fieldClass}
              containerClassName="w-44"
              portal
              zIndex={1000}
              format="YYYY/MM/DD"
            />
          </div>
          <div className="relative z-30">
            <label className={labelClass}>تا تاریخ</label>
            <DatePicker
              value={toObj}
              onChange={(d) => setToObj(toDateObject(d))}
              calendar={persian}
              locale={persian_fa}
              inputClass={fieldClass}
              containerClassName="w-44"
              portal
              zIndex={1000}
              format="YYYY/MM/DD"
            />
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-xl bg-blue-900 hover:bg-blue-950 text-white font-bold px-6 py-2.5 disabled:opacity-50 transition"
          >
            {loading ? "در حال بارگذاری..." : "اعمال فیلتر"}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-300 text-red-700 px-4 py-3 font-bold shadow">
            {error}
          </div>
        )}

        {tab === "production" && (
          <div className="space-y-6">
            <section className={`${glassCard} overflow-hidden`}>
              <div className="px-5 py-3.5 border-b border-teal-500/20 bg-teal-500/10">
                <h2 className="text-lg font-black text-blue-950">
                  کارکرد و پشت‌دست هر ایستگاه
                </h2>
                <p className="text-xs text-blue-800 font-semibold mt-0.5">
                  کلیک روی عنوان ستون = مرتب‌سازی · هدر ثابت
                </p>
              </div>
              <div className="overflow-auto max-h-[55vh] p-2">
                <table className="w-full text-sm border-collapse min-w-[900px]">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-teal-700 text-white shadow">
                      <th className="p-2 text-right font-bold border border-teal-600 sticky right-0 z-30 bg-teal-700 min-w-[120px]">
                        <button
                          type="button"
                          className={thBtn + " justify-start"}
                          onClick={() => toggleStSort("stationName")}
                        >
                          ایستگاه
                          <SortIcon
                            active={stSort === "stationName"}
                            dir={stDir}
                          />
                        </button>
                      </th>
                      {(
                        [
                          ["doneCount", "قلم انجام‌شده"],
                          ["doneQuantity", "تعداد قطعه"],
                          ["doneMeterage", "متراژ / کار"],
                        ] as [StationSortKey, string][]
                      ).map(([key, label]) => (
                        <th
                          key={key}
                          className="p-2 text-center font-bold border border-teal-600"
                        >
                          <button
                            type="button"
                            className={thBtn}
                            onClick={() => toggleStSort(key)}
                          >
                            {label}
                            <SortIcon active={stSort === key} dir={stDir} />
                          </button>
                        </th>
                      ))}
                      <th className="p-2 text-right font-bold border border-teal-600 min-w-[140px]">
                        خدمات مرتبط
                      </th>
                      {(
                        [
                          ["pendingCount", "صف (قلم)"],
                          ["pendingQuantity", "صف (قطعه)"],
                          ["pendingMeterage", "متراژ پشت‌دست"],
                        ] as [StationSortKey, string][]
                      ).map(([key, label]) => (
                        <th
                          key={key}
                          className="p-2 text-center font-bold border border-teal-600"
                        >
                          <button
                            type="button"
                            className={thBtn}
                            onClick={() => toggleStSort(key)}
                          >
                            {label}
                            <SortIcon active={stSort === key} dir={stDir} />
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStations.map((r, idx) => (
                      <tr
                        key={r.stationId}
                        className={
                          idx % 2 === 0
                            ? "bg-white/40 hover:bg-teal-400/20"
                            : "bg-white/25 hover:bg-teal-400/20"
                        }
                      >
                        <td className="p-3 font-bold text-blue-950 border border-teal-500/15 sticky right-0 z-10 bg-inherit min-w-[120px]">
                          {r.stationName}
                        </td>
                        <td className="p-3 text-center border border-teal-500/15">
                          {r.doneCount}
                        </td>
                        <td className="p-3 text-center border border-teal-500/15">
                          {r.doneQuantity}
                        </td>
                        <td className="p-3 text-center border border-teal-500/15">
                          <div className="font-bold">{r.doneMeterage} م²</div>
                          {(r.doneMeasures || []).map((m) => (
                            <div
                              key={m.label}
                              className="text-xs text-teal-800 font-semibold"
                            >
                              {m.label}: {m.qty}
                            </div>
                          ))}
                        </td>
                        <td className="p-3 text-xs border border-teal-500/15">
                          {(r.doneServices || []).join(" · ") || "—"}
                        </td>
                        <td className="p-3 text-center border border-teal-500/15">
                          {r.pendingCount}
                        </td>
                        <td className="p-3 text-center border border-teal-500/15">
                          {r.pendingQuantity}
                        </td>
                        <td className="p-3 text-center font-black text-orange-600 border border-teal-500/15">
                          {r.pendingMeterage}
                        </td>
                      </tr>
                    ))}
                    {!sortedStations.length && !loading && (
                      <tr>
                        <td
                          colSpan={8}
                          className="p-8 text-center text-blue-700 font-bold"
                        >
                          داده‌ای نیست
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={`${glassCard} overflow-hidden`}>
              <div className="px-5 py-3.5 border-b border-teal-500/20 bg-red-500/10 flex flex-wrap justify-between gap-2">
                <div>
                  <h2 className="text-lg font-black text-blue-950">
                    گزارش ضایعات
                  </h2>
                  <p className="text-xs text-blue-800 font-semibold">
                    از ثبت ضایعات برنامه‌ریزی برش / کارتابل
                  </p>
                </div>
                <div className="text-sm font-black text-red-700 self-center">
                  رکورد: {wasteSummary.count} | تعداد:{" "}
                  {wasteSummary.totalQuantity}
                </div>
              </div>
              <div className="overflow-auto max-h-[55vh] p-2">
                <table className="w-full text-sm border-collapse min-w-[1100px]">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-slate-700 text-white shadow">
                      {(
                        [
                          ["createdAt", "تاریخ"],
                          ["orderNumber", "سفارش"],
                          ["customerName", "مشتری"],
                          ["productName", "کالا"],
                        ] as [WasteSortKey, string][]
                      ).map(([key, label]) => (
                        <th
                          key={key}
                          className="p-2 text-right font-bold border border-slate-600"
                        >
                          <button
                            type="button"
                            className={thBtn + " justify-start"}
                            onClick={() => toggleWSort(key)}
                          >
                            {label}
                            <SortIcon active={wSort === key} dir={wDir} />
                          </button>
                        </th>
                      ))}
                      <th className="p-2 text-center font-bold border border-slate-600">
                        ابعاد
                      </th>
                      <th className="p-2 text-center font-bold border border-slate-600">
                        <button
                          type="button"
                          className={thBtn}
                          onClick={() => toggleWSort("quantity")}
                        >
                          تعداد
                          <SortIcon
                            active={wSort === "quantity"}
                            dir={wDir}
                          />
                        </button>
                      </th>
                      <th className="p-2 text-right font-bold border border-slate-600">
                        <button
                          type="button"
                          className={thBtn + " justify-start"}
                          onClick={() => toggleWSort("stationName")}
                        >
                          ایستگاه
                          <SortIcon
                            active={wSort === "stationName"}
                            dir={wDir}
                          />
                        </button>
                      </th>
                      <th className="p-2 text-right font-bold border border-slate-600">
                        <button
                          type="button"
                          className={thBtn + " justify-start"}
                          onClick={() => toggleWSort("reason")}
                        >
                          علت
                          <SortIcon active={wSort === "reason"} dir={wDir} />
                        </button>
                      </th>
                      <th className="p-2 text-right font-bold border border-slate-600">
                        توضیح / مسئول
                      </th>
                      <th className="p-2 text-center font-bold border border-slate-600">
                        بارکد
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedWastes.map((w, idx) => (
                      <tr
                        key={w.wasteId}
                        className={
                          idx % 2 === 0
                            ? "bg-white/40 hover:bg-red-400/15"
                            : "bg-white/25 hover:bg-red-400/15"
                        }
                      >
                        <td className="p-3 whitespace-nowrap border border-teal-500/10">
                          {formatFaDate(w.createdAt)}
                        </td>
                        <td className="p-3 border border-teal-500/10">
                          <Link
                            href={`/production/cutting?search=${encodeURIComponent(
                              w.orderNumber
                            )}`}
                            className="font-bold text-teal-800 hover:underline"
                          >
                            {w.orderNumber}
                          </Link>
                        </td>
                        <td className="p-3 border border-teal-500/10">
                          {w.customerName}
                        </td>
                        <td className="p-3 border border-teal-500/10">
                          {w.productName}
                        </td>
                        <td
                          className="p-3 text-center border border-teal-500/10"
                          dir="ltr"
                        >
                          {w.length ?? "—"}×{w.width ?? "—"}
                        </td>
                        <td className="p-3 text-center font-bold border border-teal-500/10">
                          {w.quantity}
                        </td>
                        <td className="p-3 border border-teal-500/10">
                          {w.stationName}
                        </td>
                        <td className="p-3 border border-teal-500/10">
                          {w.reason}
                        </td>
                        <td className="p-3 text-xs border border-teal-500/10">
                          {w.notes || w.responsible || "—"}
                        </td>
                        <td className="p-3 text-center font-mono text-xs border border-teal-500/10">
                          {w.barcode || "—"}
                        </td>
                      </tr>
                    ))}
                    {!sortedWastes.length && !loading && (
                      <tr>
                        <td
                          colSpan={10}
                          className="p-8 text-center text-blue-700 font-bold"
                        >
                          ضایعاتی در این بازه ثبت نشده
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {tab === "sales" && sales && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className={`${glassCard} p-6`}>
              <p className="text-sm text-blue-800 font-bold mb-1">
                پیش‌فاکتور صادرشده
              </p>
              <p className="text-4xl font-black text-teal-700">
                {sales.preInvoiceCount}
              </p>
              <p className="text-sm text-blue-900 mt-3 font-semibold">
                متراژ: {sales.preInvoiceMeterage}
              </p>
              <p className="text-sm text-blue-900 font-semibold">
                مبلغ حدودی: {formatPrice(sales.preInvoiceAmount)}
              </p>
            </div>
            <div className={`${glassCard} p-6`}>
              <p className="text-sm text-blue-800 font-bold mb-1">
                تبدیل به فاکتور
              </p>
              <p className="text-4xl font-black text-teal-700">
                {sales.invoiceCount}
              </p>
              <p className="text-sm text-blue-900 mt-3 font-semibold">
                متراژ: {sales.invoiceMeterage}
              </p>
              <p className="text-sm text-blue-900 font-semibold">
                مبلغ حدودی: {formatPrice(sales.invoiceAmount)}
              </p>
            </div>
            <div className={`${glassCard} p-6`}>
              <p className="text-sm text-blue-800 font-bold mb-1">نرخ تبدیل</p>
              <p className="text-4xl font-black text-orange-600">
                {sales.conversionRatePercent}%
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}