"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"

type ItemStation = {
  id: string
  sequence: number
  status: string
  quantityIn: number | null
  quantityOut: number | null
  quantityWaste: number | null
  startedAt: string | null
  completedAt: string | null
  notes: string | null
  station: {
    id: string
    name: string
  }
}

type ProductionItem = {
  id: string
  productName: string
  length: number | null
  width: number | null
  quantity: number
  meterage: number | null
  status: string
  barcode?: string | null
  stations: ItemStation[]
}

type ProductionOrderDetail = {
  id: string
  productionNumber: string
  status: string
  priority: string
  notes: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  totalMeterage?: number | null
  order: {
    id: string
    orderNumber: string
    orderDate: string
    deliveryDate: string | null
    customer: {
      name: string
    }
  }
  items: ProductionItem[]
  history: {
    id: string
    action: string
    description: string | null
    createdAt: string
    newStatus: string | null
  }[]
}

export default function ProductionOrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [data, setData] = useState<ProductionOrderDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id) fetchDetail()
  }, [id])

  // Escape → مشاهده روند کاری
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        router.push("/production/queue")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [router])

  const fetchDetail = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/production/orders/${id}`)
      if (!res.ok) throw new Error("خطا در دریافت")
      const json = await res.json()
      setData(json)
    } catch (error) {
      console.error(error)
      alert("خطا در بارگذاری جزئیات")
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "در انتظار":
        return "bg-yellow-100 text-yellow-900"
      case "در حال تولید":
      case "در حال انجام":
        return "bg-blue-100 text-blue-900"
      case "تکمیل‌شده":
      case "تکمیل شده":
        return "bg-green-100 text-green-900"
      case "متوقف‌شده":
        return "bg-red-100 text-red-900"
      default:
        return "bg-gray-100 text-gray-900"
    }
  }

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "—"
    try {
      return new Date(dateStr).toLocaleDateString("fa-IR")
    } catch {
      return dateStr || "—"
    }
  }

  const getLastStation = (stations: ItemStation[]) => {
    if (!stations || stations.length === 0) {
      return { name: "—", status: "—", sequence: 0 }
    }
    const sorted = [...stations].sort((a, b) => a.sequence - b.sequence)
    const activeOrDone = sorted.filter((s) => s.status !== "در انتظار")
    if (activeOrDone.length > 0) {
      const last = activeOrDone[activeOrDone.length - 1]
      return {
        name: last.station.name,
        status: last.status,
        sequence: last.sequence,
      }
    }
    return {
      name: sorted[0].station.name,
      status: sorted[0].status,
      sequence: sorted[0].sequence,
    }
  }

  /** مسیر ایستگاه‌ها با رنگ خوانا (تیره، نه سفید) */
  const getStationPath = (stations: ItemStation[]) => {
    if (!stations || stations.length === 0) {
      return <span className="text-blue-900 font-semibold">—</span>
    }
    const sorted = [...stations].sort((a, b) => a.sequence - b.sequence)

    return sorted.map((s, idx) => {
      const done =
        s.status === "تکمیل شده" || s.status === "تکمیل‌شده"
      const active =
        s.status === "در حال انجام" || s.status === "در حال تولید"

      let chipClass =
        "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-bold border "
      if (done) {
        chipClass += "bg-green-100 text-green-900 border-green-300"
      } else if (active) {
        chipClass += "bg-blue-100 text-blue-900 border-blue-300"
      } else {
        chipClass += "bg-slate-100 text-slate-800 border-slate-300"
      }

      const icon = done ? "✓" : active ? "●" : "○"
      const isLast = idx === sorted.length - 1

      return (
        <span key={s.id} className="inline-flex items-center">
          <span className={chipClass}>
            <span aria-hidden>{icon}</span>
            {s.station.name}
          </span>
          {!isLast && (
            <span className="mx-1.5 text-base font-black text-blue-800">→</span>
          )}
        </span>
      )
    })
  }

  const getExitStatus = (stations: ItemStation[]) => {
    if (!stations || stations.length === 0) {
      return { text: "خارج نشده", color: "bg-gray-100 text-gray-800" }
    }

    const last = getLastStation(stations)
    const isWarehouse =
      last.name.includes("انبار") ||
      last.name.includes("محصول") ||
      last.name.toLowerCase().includes("warehouse")

    const isCompleted =
      last.status === "تکمیل شده" || last.status === "تکمیل‌شده"

    if (isWarehouse && isCompleted) {
      return {
        text: "آماده بارگیری",
        color: "bg-emerald-100 text-emerald-900",
      }
    }

    return { text: "خارج نشده", color: "bg-gray-100 text-gray-800" }
  }

  const getOverallLastStation = () => {
    if (!data?.items?.length) return { name: "—", status: "—" }

    let best = { name: "—", status: "—", sequence: -1 }

    data.items.forEach((item) => {
      const last = getLastStation(item.stations || [])
      if (last.sequence > best.sequence) {
        best = last
      }
    })

    return best
  }

  const getTotalMeterage = () => {
    if (data?.totalMeterage != null) return data.totalMeterage
    if (!data?.items?.length) return null
    const sum = data.items.reduce((acc, item) => acc + (item.meterage || 0), 0)
    return sum > 0 ? sum : null
  }

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        dir="rtl"
        style={{ fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif" }}
      >
        <p className="text-xl font-bold text-blue-800">در حال بارگذاری...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        dir="rtl"
        style={{ fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif" }}
      >
        <p className="text-xl font-bold text-red-700">سفارش تولید یافت نشد</p>
      </div>
    )
  }

  const overallLast = getOverallLastStation()
  const totalMeterage = getTotalMeterage()
  const itemsCount = data.items?.length || 0

  const allReadyForLoading =
    data.items.length > 0 &&
    data.items.every(
      (item) => getExitStatus(item.stations || []).text === "آماده بارگیری"
    )

  return (
    <div
      className="min-h-screen p-4 bg-cover bg-center bg-fixed"
      style={{
        backgroundImage:
          "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')",
        fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif",
      }}
      dir="rtl"
    >
      <div className="pointer-events-none fixed inset-0 bg-black/5" />

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* هدر */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/20">
          <div>
            <h1 className="text-2xl font-bold text-blue-950">
              جزئیات سفارش تولید
            </h1>
            <p className="text-lg font-bold text-teal-800 mt-1">
              سفارش {data.order?.orderNumber} — {data.order?.customer?.name}
            </p>
            <p className="text-xs text-blue-700 mt-1">Esc = بازگشت به روند کاری</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/production/queue"
              className="rounded-xl border border-teal-500/40 bg-white/50 hover:bg-white/70 px-5 py-2.5 text-blue-950 font-bold transition"
            >
              مشاهده روند کاری
            </Link>
            <Link
              href="/production/queue"
              className="rounded-xl border border-teal-500/40 bg-white/50 hover:bg-white/70 px-5 py-2.5 text-blue-950 font-bold transition"
            >
              بازگشت
            </Link>
          </div>
        </div>

        {/* کارت‌های خلاصه */}
        <div className="mb-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="rounded-xl bg-white/55 backdrop-blur-2xl p-4 border border-teal-500/25 text-center">
            <p className="text-sm font-bold text-blue-800 mb-1">شماره سفارش</p>
            <p className="font-black text-blue-950 text-xl">
              {data.order?.orderNumber}
            </p>
          </div>

          <div className="rounded-xl bg-white/55 backdrop-blur-2xl p-4 border border-teal-500/25 text-center">
            <p className="text-sm font-bold text-blue-800 mb-1">تعداد کالا</p>
            <p className="font-black text-blue-950 text-xl">{itemsCount}</p>
          </div>

          <div className="rounded-xl bg-white/55 backdrop-blur-2xl p-4 border border-teal-500/25 text-center">
            <p className="text-sm font-bold text-blue-800 mb-1">متراژ کل</p>
            <p className="font-black text-blue-950 text-xl">
              {totalMeterage != null
                ? totalMeterage.toLocaleString("fa-IR")
                : "—"}
            </p>
          </div>

          <div className="rounded-xl bg-white/55 backdrop-blur-2xl p-4 border border-teal-500/25 text-center">
            <p className="text-sm font-bold text-blue-800 mb-1">وضعیت سفارش</p>
            <span
              className={`rounded-full px-3 py-1 text-sm font-bold ${getStatusColor(
                data.status
              )}`}
            >
              {data.status}
            </span>
          </div>

          <div className="rounded-xl bg-white/55 backdrop-blur-2xl p-4 border border-teal-500/25 text-center">
            <p className="text-sm font-bold text-blue-800 mb-1">آخرین ایستگاه</p>
            <p className="font-black text-blue-950 text-base">
              {overallLast.name}
            </p>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-bold mt-1 inline-block ${getStatusColor(
                overallLast.status
              )}`}
            >
              {overallLast.status}
            </span>
          </div>

          <div className="rounded-xl bg-white/55 backdrop-blur-2xl p-4 border border-teal-500/25 text-center">
            <p className="text-sm font-bold text-blue-800 mb-1">وضعیت خروج</p>
            <span
              className={`rounded-full px-3 py-1 text-sm font-bold ${
                allReadyForLoading
                  ? "bg-emerald-100 text-emerald-900"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {allReadyForLoading ? "آماده بارگیری" : "خارج نشده"}
            </span>
          </div>
        </div>

        {/* جدول کالاها و مسیر تولید */}
        <div className="mb-4 rounded-2xl bg-white/50 backdrop-blur-2xl p-4 shadow-lg border border-teal-500/25 overflow-x-auto">
          <h2 className="text-xl font-black text-blue-950 mb-4 px-1">
            کالاها و مسیر تولید
          </h2>

          {data.items.length === 0 ? (
            <p className="text-center text-blue-800 py-10 text-lg font-bold">
              کالایی وجود ندارد
            </p>
          ) : (
            <table className="w-full text-base text-blue-950 border-collapse">
              <thead>
                <tr className="border-b-2 border-teal-600/40 bg-teal-600/15 text-right">
                  <th className="p-3 font-black text-center text-blue-950">
                    ردیف
                  </th>
                  <th className="p-3 font-black text-blue-950">نام کالا</th>
                  <th className="p-3 font-black text-center text-blue-950">
                    تعداد
                  </th>
                  <th className="p-3 font-black text-center text-blue-950">
                    طول
                  </th>
                  <th className="p-3 font-black text-center text-blue-950">
                    عرض
                  </th>
                  <th className="p-3 font-black text-center text-blue-950">
                    متراژ
                  </th>
                  <th className="p-3 font-black text-center text-blue-950">
                    بارکد
                  </th>
                  <th className="p-3 font-black text-blue-950 min-w-[280px]">
                    مسیر ایستگاه‌ها
                  </th>
                  <th className="p-3 font-black text-center text-blue-950">
                    آخرین ایستگاه
                  </th>
                  <th className="p-3 font-black text-center text-blue-950">
                    وضعیت خروج
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, index) => {
                  const last = getLastStation(item.stations || [])
                  const exit = getExitStatus(item.stations || [])

                  return (
                    <tr
                      key={item.id}
                      className="border-b border-teal-500/20 bg-white/60 hover:bg-teal-50 transition"
                    >
                      <td className="p-3 text-center font-black">{index + 1}</td>
                      <td className="p-3 font-bold text-[15px]">
                        {item.productName}
                      </td>
                      <td className="p-3 text-center font-bold">
                        {item.quantity}
                      </td>
                      <td className="p-3 text-center font-semibold">
                        {item.length != null ? item.length : "—"}
                      </td>
                      <td className="p-3 text-center font-semibold">
                        {item.width != null ? item.width : "—"}
                      </td>
                      <td className="p-3 text-center font-semibold">
                        {item.meterage != null ? item.meterage : "—"}
                      </td>
                      <td className="p-3 text-center text-teal-900 font-mono font-bold text-sm">
                        {item.barcode || "—"}
                      </td>
                      <td className="p-3 leading-8">
                        <div className="flex flex-wrap items-center gap-y-2">
                          {getStationPath(item.stations || [])}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <div className="font-bold text-[15px]">{last.name}</div>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-bold mt-1 inline-block ${getStatusColor(
                            last.status
                          )}`}
                        >
                          {last.status}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`rounded-full px-3 py-1 text-sm font-bold ${exit.color}`}
                        >
                          {exit.text}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* تاریخچه عملیات */}
        {data.history && data.history.length > 0 && (
          <div className="rounded-2xl bg-white/50 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/25">
            <h2 className="text-xl font-black text-blue-950 mb-2">
              تاریخچه عملیات
            </h2>
            <p className="text-sm text-blue-800 mb-4">
              ردگیری اسکن ایستگاه‌ها، چاپ لیبل و تغییرات وضعیت (برای پیگیری و
              گزارش)
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {data.history.map((h) => (
                <div
                  key={h.id}
                  className="flex items-start gap-3 rounded-xl bg-white/80 border border-teal-100 p-3 text-base"
                >
                  <div className="flex-1">
                    <p className="font-bold text-blue-950">{h.action}</p>
                    {h.description && (
                      <p className="text-blue-800 text-sm mt-0.5">
                        {h.description}
                      </p>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-blue-700 whitespace-nowrap">
                    {formatDate(h.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}