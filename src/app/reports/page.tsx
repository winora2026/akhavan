"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import DatePicker, { DateObject } from "react-multi-date-picker"
import persian from "react-date-object/calendars/persian"
import persian_fa from "react-date-object/locales/persian_fa"
import gregorian from "react-date-object/calendars/gregorian"

type ProductLine = {
  productName: string
  quantity: number
  meterage: number
}

type StationRow = {
  stationId: string
  stationName: string
  doneCount: number
  doneQuantity: number
  doneMeterage: number
  doneMeasures?: { label: string; qty: number }[]
  doneServices?: string[]
  doneProducts?: ProductLine[]
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

type ExpertRow = {
  name: string
  preInvoiceCount: number
  preInvoiceAmount: number
  invoiceCount: number
  invoiceAmount: number
  conversionCount: number
  cancelledCount: number
  reOpenedCount: number
}

type SalesSummary = {
  preInvoiceCount: number
  preInvoiceMeterage: number
  preInvoiceAmount: number
  invoiceCount: number
  invoiceMeterage: number
  invoiceAmount: number
  conversionRatePercent: number
  cancelledCount?: number
  byExpert?: ExpertRow[]
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
  "rounded-2xl bg-white/90 backdrop-blur-md shadow-lg border border-teal-200"
const fieldClass =
  "w-full rounded-xl border border-teal-400/40 bg-white px-3 py-2.5 text-base font-semibold text-blue-950 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-400"
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
  return new DateObject({ calendar: persian, locale: persian_fa })
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

function formatMeter(n: number) {
  const v = Number(n) || 0
  return v.toLocaleString("fa-IR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  })
}

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <span className="opacity-40 mr-1">↕</span>
  return <span className="mr-1">{dir === "asc" ? "↑" : "↓"}</span>
}

export default function ReportsPage() {
  const [tab, setTab] = useState<"production" | "waste" | "sales">("production")
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
  const [openStationId, setOpenStationId] = useState<string | null>(null)

  const [stSort, setStSort] = useState<StationSortKey>("doneMeterage")
  const [stDir, setStDir] = useState<"asc" | "desc">("desc")
  const [wSort, setWSort] = useState<WasteSortKey>("createdAt")
  const [wDir, setWDir] = useState<"asc" | "desc">("desc")

  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get("tab")
      if (t === "sales") setTab("sales")
      if (t === "production") setTab("production")
      if (t === "waste") setTab("waste")
    } catch {}
  }, [])

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
        const sRes = await fetch(`/api/reports/production/stations?${q}`)
        const sData = await sRes.json()
        if (!sRes.ok) throw new Error(sData.error || "خطا در گزارش ایستگاه‌ها")
        setStations(sData.stations || [])
      } else if (tab === "waste") {
        const wRes = await fetch(`/api/reports/production/waste?${q}`)
        const wData = await wRes.json()
        if (!wRes.ok) throw new Error(wData.error || "خطا در گزارش ضایعات")
        setWastes(wData.items || [])
        setWasteSummary(wData.summary || { count: 0, totalQuantity: 0 })
      } else {
        const res = await fetch(`/api/reports/sales/summary?${q}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "خطا در گزارش فروش")
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

  const setToday = () => {
    const t = defaultTo()
    setFromObj(t)
    setToObj(t)
  }

  const setLast7 = () => {
    const to = defaultTo()
    const from = new DateObject(to).subtract(6, "days")
    setFromObj(from)
    setToObj(to)
  }

  const setThisMonth = () => {
    const to = defaultTo()
    const from = new DateObject(to).set("day", 1)
    setFromObj(from)
    setToObj(to)
  }

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

  const prodTotals = useMemo(() => {
    return stations.reduce(
      (acc, s) => {
        acc.doneMeterage += Number(s.doneMeterage) || 0
        acc.doneQuantity += Number(s.doneQuantity) || 0
        acc.doneCount += Number(s.doneCount) || 0
        acc.pendingMeterage += Number(s.pendingMeterage) || 0
        acc.pendingQuantity += Number(s.pendingQuantity) || 0
        acc.pendingCount += Number(s.pendingCount) || 0
        return acc
      },
      {
        doneMeterage: 0,
        doneQuantity: 0,
        doneCount: 0,
        pendingMeterage: 0,
        pendingQuantity: 0,
        pendingCount: 0,
      }
    )
  }, [stations])

  const thBtn =
    "w-full flex items-center justify-center gap-0.5 cursor-pointer select-none hover:bg-white/10 px-1 py-0.5 rounded"

  const TabBtn = ({
    id,
    label,
  }: {
    id: "production" | "waste" | "sales"
    label: string
  }) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`rounded-xl px-5 py-2.5 font-bold shadow transition ${
        tab === id
          ? "bg-teal-600 text-white"
          : "bg-white/90 border border-teal-300 text-blue-900 hover:bg-teal-50"
      }`}
    >
      {label}
    </button>
  )

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
              کارکرد روزانه ایستگاه‌ها · ضایعات · فروش و کارشناسان
            </p>
          </div>
          <Link
            href="/"
            className="rounded-xl border border-teal-400 bg-white hover:bg-teal-50 px-4 py-2.5 font-bold text-blue-900 transition"
          >
            داشبورد
          </Link>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <TabBtn id="production" label="تولید / ایستگاه‌ها" />
          <TabBtn id="waste" label="ضایعات" />
          <TabBtn id="sales" label="فروش" />
        </div>

        {/* فیلتر تاریخ */}
        <div className={`${glassCard} p-4 mb-4 flex flex-wrap items-end gap-3`}>
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
            onClick={setToday}
            className="rounded-xl border border-teal-300 bg-white px-3 py-2.5 font-bold text-sm text-blue-900"
          >
            امروز
          </button>
          <button
            type="button"
            onClick={setLast7}
            className="rounded-xl border border-teal-300 bg-white px-3 py-2.5 font-bold text-sm text-blue-900"
          >
            ۷ روز اخیر
          </button>
          <button
            type="button"
            onClick={setThisMonth}
            className="rounded-xl border border-teal-300 bg-white px-3 py-2.5 font-bold text-sm text-blue-900"
          >
            این ماه
          </button>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold px-6 py-2.5 disabled:opacity-50 transition"
          >
            {loading ? "در حال بارگذاری..." : "اعمال فیلتر"}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-300 text-red-700 px-4 py-3 font-bold shadow">
            {error}
          </div>
        )}

        {/* ========== تولید ========== */}
        {tab === "production" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                ["متراژ انجام‌شده", `${formatMeter(prodTotals.doneMeterage)} متر مربع`],
                ["تعداد انجام‌شده (عدد)", formatPrice(prodTotals.doneQuantity)],
                ["کالای انجام‌شده", formatPrice(prodTotals.doneCount)],
                ["متراژ باقی‌مانده", `${formatMeter(prodTotals.pendingMeterage)} متر مربع`],
                ["تعداد باقی‌مانده (عدد)", formatPrice(prodTotals.pendingQuantity)],
                ["کالای باقی‌مانده", formatPrice(prodTotals.pendingCount)],
              ].map(([t, v]) => (
                <div key={String(t)} className={`${glassCard} p-3 text-center`}>
                  <p className="text-xs font-bold text-blue-700 mb-1">{t}</p>
                  <p className="text-lg font-black text-teal-700">{v}</p>
                </div>
              ))}
            </div>

            <section className={`${glassCard} overflow-hidden`}>
              <div className="px-5 py-3.5 border-b border-teal-100 bg-teal-50">
                <h2 className="text-lg font-black text-blue-950">
                  کارکرد هر ایستگاه در بازه انتخابی
                </h2>
                <p className="text-xs text-blue-800 font-semibold mt-0.5">
                  «انجام‌شده» = کار رد شده در این تاریخ · «باقی‌مانده» = هنوز در
                  صف ایستگاه است · روی ردیف کلیک کنید تا کالاها باز شود
                </p>
              </div>
              <div className="overflow-auto max-h-[60vh] p-2">
                <table className="w-full text-sm border-collapse min-w-[1000px]">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-teal-700 text-white shadow">
                      <th className="p-2 text-right font-bold border border-teal-600 sticky right-0 z-30 bg-teal-700 min-w-[130px]">
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
                          ["doneCount", "کالای انجام‌شده"],
                          ["doneQuantity", "تعداد انجام‌شده (عدد)"],
                          ["doneMeterage", "متراژ انجام‌شده (متر مربع)"],
                          ["pendingCount", "کالای باقی‌مانده"],
                          ["pendingQuantity", "تعداد باقی‌مانده (عدد)"],
                          ["pendingMeterage", "متراژ باقی‌مانده (متر مربع)"],
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
                      <th className="p-2 text-center font-bold border border-teal-600">
                        کارتابل
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStations.map((r, idx) => {
                      const open = openStationId === r.stationId
                      return (
                        <>
                          <tr
                            key={r.stationId}
                            className={
                              (idx % 2 === 0 ? "bg-white" : "bg-teal-50/40") +
                              " hover:bg-teal-100/50 cursor-pointer"
                            }
                            onClick={() =>
                              setOpenStationId(open ? null : r.stationId)
                            }
                          >
                            <td className="p-3 font-bold text-blue-950 border border-teal-100 sticky right-0 z-10 bg-inherit">
                              {r.stationName}
                              <span className="block text-[10px] text-teal-700 font-semibold">
                                {open ? "بستن کالاها" : "نمایش کالاها"}
                              </span>
                            </td>
                            <td className="p-3 text-center border border-teal-100">
                              {r.doneCount}
                            </td>
                            <td className="p-3 text-center border border-teal-100">
                              {r.doneQuantity}
                            </td>
                            <td className="p-3 text-center font-black text-teal-800 border border-teal-100">
                              {formatMeter(r.doneMeterage)}
                            </td>
                            <td className="p-3 text-center border border-teal-100">
                              {r.pendingCount}
                            </td>
                            <td className="p-3 text-center border border-teal-100">
                              {r.pendingQuantity}
                            </td>
                            <td className="p-3 text-center font-black text-orange-600 border border-teal-100">
                              {formatMeter(r.pendingMeterage)}
                            </td>
                            <td
                              className="p-3 text-center border border-teal-100"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Link
                                href={`/production/station-queue?stationId=${encodeURIComponent(
                                  r.stationId
                                )}`}
                                className="inline-block rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-3 py-1.5"
                              >
                                رفتن به کارتابل
                              </Link>
                            </td>
                          </tr>
                          {open && (
                            <tr key={r.stationId + "-p"} className="bg-slate-50">
                              <td colSpan={8} className="p-3 border border-teal-100">
                                <p className="text-sm font-black text-blue-900 mb-2">
                                  کالاهای انجام‌شده در این بازه — {r.stationName}
                                </p>
                                {(r.doneProducts || []).length ? (
                                  <div className="overflow-auto">
                                    <table className="w-full text-xs border-collapse min-w-[480px]">
                                      <thead>
                                        <tr className="bg-teal-100 text-blue-900">
                                          <th className="p-2 text-right">نام کالا</th>
                                          <th className="p-2 text-center">تعداد</th>
                                          <th className="p-2 text-center">
                                            متراژ (متر مربع)
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(r.doneProducts || []).map((p, i) => (
                                          <tr
                                            key={p.productName + i}
                                            className="border-b border-teal-50"
                                          >
                                            <td className="p-2 font-bold">
                                              {p.productName}
                                            </td>
                                            <td className="p-2 text-center">
                                              {p.quantity}
                                            </td>
                                            <td className="p-2 text-center">
                                              {formatMeter(p.meterage)}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <p className="text-sm text-blue-700 font-semibold">
                                    برای این ایستگاه در بازه انتخابی کالای
                                    انجام‌شده‌ای ثبت نشده (یا API هنوز لیست کالا
                                    برنمی‌گرداند).
                                  </p>
                                )}
                                {(r.doneServices || []).length > 0 && (
                                  <p className="text-xs text-blue-800 mt-2 font-semibold">
                                    خدمات مرتبط: {(r.doneServices || []).join(" · ")}
                                  </p>
                                )}
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                    {!sortedStations.length && !loading && (
                      <tr>
                        <td
                          colSpan={8}
                          className="p-8 text-center text-blue-700 font-bold"
                        >
                          داده‌ای در این بازه نیست
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* ========== ضایعات ========== */}
        {tab === "waste" && (
          <section className={`${glassCard} overflow-hidden`}>
            <div className="px-5 py-3.5 border-b border-red-100 bg-red-50 flex flex-wrap justify-between gap-2">
              <div>
                <h2 className="text-lg font-black text-blue-950">گزارش ضایعات</h2>
                <p className="text-xs text-blue-800 font-semibold">
                  ایستگاه = جایی که ضایعات ثبت شده
                </p>
              </div>
              <div className="text-sm font-black text-red-700 self-center">
                تعداد رکورد: {wasteSummary.count} | مجموع تعداد قطعه:{" "}
                {wasteSummary.totalQuantity}
              </div>
            </div>
            <div className="overflow-auto max-h-[65vh] p-2">
              <table className="w-full text-sm border-collapse min-w-[1100px]">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-teal-700 text-white shadow">
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
                        className="p-2 text-right font-bold border border-teal-600"
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
                    <th className="p-2 text-center font-bold border border-teal-600">
                      ابعاد
                    </th>
                    <th className="p-2 text-center font-bold border border-teal-600">
                      <button
                        type="button"
                        className={thBtn}
                        onClick={() => toggleWSort("quantity")}
                      >
                        تعداد
                        <SortIcon active={wSort === "quantity"} dir={wDir} />
                      </button>
                    </th>
                    <th className="p-2 text-right font-bold border border-teal-600">
                      <button
                        type="button"
                        className={thBtn + " justify-start"}
                        onClick={() => toggleWSort("stationName")}
                      >
                        ایستگاه ضایعات
                        <SortIcon
                          active={wSort === "stationName"}
                          dir={wDir}
                        />
                      </button>
                    </th>
                    <th className="p-2 text-right font-bold border border-teal-600">
                      <button
                        type="button"
                        className={thBtn + " justify-start"}
                        onClick={() => toggleWSort("reason")}
                      >
                        علت
                        <SortIcon active={wSort === "reason"} dir={wDir} />
                      </button>
                    </th>
                    <th className="p-2 text-right font-bold border border-teal-600">
                      توضیح / مسئول
                    </th>
                    <th className="p-2 text-center font-bold border border-teal-600">
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
                          ? "bg-white hover:bg-red-50"
                          : "bg-red-50/30 hover:bg-red-50"
                      }
                    >
                      <td className="p-3 whitespace-nowrap border border-teal-50">
                        {formatFaDate(w.createdAt)}
                      </td>
                      <td className="p-3 border border-teal-50">
                        <Link
                          href={`/production/cutting?search=${encodeURIComponent(
                            w.orderNumber
                          )}`}
                          className="font-bold text-teal-800 hover:underline"
                        >
                          {w.orderNumber}
                        </Link>
                      </td>
                      <td className="p-3 border border-teal-50">
                        {w.customerName}
                      </td>
                      <td className="p-3 border border-teal-50">
                        {w.productName}
                      </td>
                      <td
                        className="p-3 text-center border border-teal-50"
                        dir="ltr"
                      >
                        {w.length ?? "—"}×{w.width ?? "—"}
                      </td>
                      <td className="p-3 text-center font-bold border border-teal-50">
                        {w.quantity}
                      </td>
                      <td className="p-3 font-bold text-red-800 border border-teal-50">
                        {w.stationName || "—"}
                      </td>
                      <td className="p-3 border border-teal-50">{w.reason}</td>
                      <td className="p-3 text-xs border border-teal-50">
                        {w.notes || w.responsible || "—"}
                      </td>
                      <td className="p-3 text-center font-mono text-xs border border-teal-50">
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
        )}

        {/* ========== فروش ========== */}
        {tab === "sales" && sales && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className={`${glassCard} p-5`}>
                <p className="text-sm text-blue-800 font-bold mb-1">
                  پیش‌فاکتور صادرشده
                </p>
                <p className="text-4xl font-black text-teal-700">
                  {sales.preInvoiceCount}
                </p>
                <p className="text-sm text-blue-900 mt-2 font-semibold">
                  متراژ: {formatMeter(sales.preInvoiceMeterage)} متر مربع
                </p>
                <p className="text-sm text-blue-900 font-bold">
                  مبلغ: {formatPrice(sales.preInvoiceAmount)} ریال
                </p>
              </div>
              <div className={`${glassCard} p-5`}>
                <p className="text-sm text-blue-800 font-bold mb-1">
                  تبدیل به فاکتور
                </p>
                <p className="text-4xl font-black text-teal-700">
                  {sales.invoiceCount}
                </p>
                <p className="text-sm text-blue-900 mt-2 font-semibold">
                  متراژ: {formatMeter(sales.invoiceMeterage)} متر مربع
                </p>
                <p className="text-sm text-blue-900 font-bold">
                  مبلغ: {formatPrice(sales.invoiceAmount)} ریال
                </p>
              </div>
              <div className={`${glassCard} p-5`}>
                <p className="text-sm text-blue-800 font-bold mb-1">نرخ تبدیل</p>
                <p className="text-4xl font-black text-orange-600">
                  {sales.conversionRatePercent}%
                </p>
                <p className="text-xs text-blue-700 mt-2 font-semibold">
                  فاکتور ÷ (پیش‌فاکتور + فاکتور در بازه) یا منطق API
                </p>
              </div>
              <div className={`${glassCard} p-5`}>
                <p className="text-sm text-blue-800 font-bold mb-1">لغو شده</p>
                <p className="text-4xl font-black text-red-600">
                  {sales.cancelledCount ?? 0}
                </p>
              </div>
            </div>

            <section className={`${glassCard} overflow-hidden`}>
              <div className="px-5 py-3.5 border-b border-teal-100 bg-teal-50">
                <h2 className="text-lg font-black text-blue-950">
                  عملکرد کارشناسان فروش
                </h2>
                <p className="text-xs text-blue-800 font-semibold mt-0.5">
                  پیش‌فاکتور، فاکتور، مبلغ دقیق، لغو و برگشت مجدد به فاکتور (در
                  صورت پشتیبانی API)
                </p>
              </div>
              <div className="overflow-auto p-2">
                <table className="w-full text-sm border-collapse min-w-[900px]">
                  <thead>
                    <tr className="bg-teal-700 text-white">
                      <th className="p-3 text-right">کارشناس</th>
                      <th className="p-3 text-center">پیش‌فاکتور</th>
                      <th className="p-3 text-center">مبلغ پیش‌فاکتور</th>
                      <th className="p-3 text-center">فاکتور</th>
                      <th className="p-3 text-center">مبلغ فاکتور</th>
                      <th className="p-3 text-center">تبدیل‌ها</th>
                      <th className="p-3 text-center">لغو</th>
                      <th className="p-3 text-center">برگشت مجدد به فاکتور</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sales.byExpert || []).map((e, idx) => (
                      <tr
                        key={e.name + idx}
                        className={
                          idx % 2 === 0 ? "bg-white" : "bg-teal-50/40"
                        }
                      >
                        <td className="p-3 font-bold border border-teal-50">
                          {e.name}
                        </td>
                        <td className="p-3 text-center border border-teal-50">
                          {e.preInvoiceCount}
                        </td>
                        <td className="p-3 text-center font-bold border border-teal-50">
                          {formatPrice(e.preInvoiceAmount)}
                        </td>
                        <td className="p-3 text-center border border-teal-50">
                          {e.invoiceCount}
                        </td>
                        <td className="p-3 text-center font-bold border border-teal-50">
                          {formatPrice(e.invoiceAmount)}
                        </td>
                        <td className="p-3 text-center border border-teal-50">
                          {e.conversionCount}
                        </td>
                        <td className="p-3 text-center text-red-700 font-bold border border-teal-50">
                          {e.cancelledCount}
                        </td>
                        <td className="p-3 text-center border border-teal-50">
                          {e.reOpenedCount}
                        </td>
                      </tr>
                    ))}
                    {!(sales.byExpert || []).length && (
                      <tr>
                        <td
                          colSpan={8}
                          className="p-8 text-center text-blue-700 font-bold"
                        >
                          هنوز تفکیک کارشناس از API نیامده — فایل
                          <code className="mx-1">api/reports/sales/summary</code>
                          را بفرستید تا مبلغ دقیق و جدول کارشناس کامل شود.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}