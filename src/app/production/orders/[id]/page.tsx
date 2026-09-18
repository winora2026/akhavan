"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"

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
  const id = params.id as string

  const [data, setData] = useState<ProductionOrderDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id) fetchDetail()
  }, [id])

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
        return "bg-yellow-100 text-yellow-800"
      case "در حال تولید":
      case "در حال انجام":
        return "bg-blue-100 text-blue-800"
      case "تکمیل‌شده":
      case "تکمیل شده":
        return "bg-green-100 text-green-800"
      case "متوقف‌شده":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
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

  // پیدا کردن آخرین ایستگاه یک قلم
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

  // ساخت مسیر خلاصه ایستگاه‌ها
  const getStationPath = (stations: ItemStation[]) => {
    if (!stations || stations.length === 0) return "—"
    const sorted = [...stations].sort((a, b) => a.sequence - b.sequence)

    return sorted.map((s, idx) => {
      let icon = ""
      let className = "text-gray-500"

      if (s.status === "تکمیل شده" || s.status === "تکمیل‌شده") {
        icon = "✓"
        className = "text-green-700 font-bold"
      } else if (s.status === "در حال انجام" || s.status === "در حال تولید") {
        icon = "●"
        className = "text-blue-700 font-bold"
      } else {
        icon = "○"
        className = "text-gray-400"
      }

      const isLast = idx === sorted.length - 1
      return (
        <span key={s.id} className={className}>
          {s.station.name} {icon}
          {!isLast && <span className="text-gray-400 mx-1">→</span>}
        </span>
      )
    })
  }

  // تشخیص وضعیت خروج (چون فیلد نداریم)
  const getExitStatus = (stations: ItemStation[]) => {
    if (!stations || stations.length === 0) return { text: "خارج نشده", color: "bg-gray-100 text-gray-700" }

    const last = getLastStation(stations)
    const isWarehouse =
      last.name.includes("انبار") ||
      last.name.includes("محصول") ||
      last.name.toLowerCase().includes("warehouse")

    const isCompleted =
      last.status === "تکمیل شده" || last.status === "تکمیل‌شده"

    if (isWarehouse && isCompleted) {
      return { text: "آماده بارگیری", color: "bg-emerald-100 text-emerald-800" }
    }

    return { text: "خارج نشده", color: "bg-gray-100 text-gray-700" }
  }

  // آخرین ایستگاه کلی سفارش (بیشترین پیشرفت)
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

  // متراژ کل
  const getTotalMeterage = () => {
    if (data?.totalMeterage != null) return data.totalMeterage
    if (!data?.items?.length) return null
    const sum = data.items.reduce((acc, item) => acc + (item.meterage || 0), 0)
    return sum > 0 ? sum : null
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <p className="text-xl font-bold text-blue-800">در حال بارگذاری...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <p className="text-xl font-bold text-red-700">سفارش تولید یافت نشد</p>
      </div>
    )
  }

  const overallLast = getOverallLastStation()
  const totalMeterage = getTotalMeterage()
  const itemsCount = data.items?.length || 0

  // وضعیت خروج کلی (اگر همه قلم‌ها آماده بارگیری باشن)
  const allReadyForLoading =
    data.items.length > 0 &&
    data.items.every((item) => getExitStatus(item.stations || []).text === "آماده بارگیری")

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
      <link
        href="https://cdn.jsdelivr.net/npm/vazirmatn@33.003/Vazirmatn-font-face.css"
        rel="stylesheet"
      />
      <div className="pointer-events-none fixed inset-0 bg-black/5" />

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* هدر */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/20">
          <div>
            <h1 className="text-2xl font-bold text-blue-950">جزئیات سفارش تولید</h1>
            <p className="text-lg font-bold text-teal-700 mt-1">
              سفارش {data.order?.orderNumber} — {data.order?.customer?.name}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/production/workflow"
              className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-5 py-2.5 text-blue-900 font-bold transition"
            >
              مشاهده روند کاری
            </Link>
            <Link
              href="/production/queue"
              className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-5 py-2.5 text-blue-900 font-bold transition"
            >
              بازگشت
            </Link>
          </div>
        </div>

        {/* کارت‌های خلاصه */}
        <div className="mb-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="rounded-xl bg-teal-500/10 backdrop-blur-2xl p-4 border border-teal-500/20 text-center">
            <p className="text-xs text-blue-700 mb-1">شماره سفارش</p>
            <p className="font-bold text-blue-950 text-lg">{data.order?.orderNumber}</p>
          </div>

          <div className="rounded-xl bg-teal-500/10 backdrop-blur-2xl p-4 border border-teal-500/20 text-center">
            <p className="text-xs text-blue-700 mb-1">تعداد اقلام</p>
            <p className="font-bold text-blue-950 text-lg">{itemsCount}</p>
          </div>

          <div className="rounded-xl bg-teal-500/10 backdrop-blur-2xl p-4 border border-teal-500/20 text-center">
            <p className="text-xs text-blue-700 mb-1">متراژ کل</p>
            <p className="font-bold text-blue-950 text-lg">
              {totalMeterage != null ? totalMeterage.toLocaleString("fa-IR") : "—"}
            </p>
          </div>

          <div className="rounded-xl bg-teal-500/10 backdrop-blur-2xl p-4 border border-teal-500/20 text-center">
            <p className="text-xs text-blue-700 mb-1">وضعیت سفارش</p>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusColor(
                data.status
              )}`}
            >
              {data.status}
            </span>
          </div>

          <div className="rounded-xl bg-teal-500/10 backdrop-blur-2xl p-4 border border-teal-500/20 text-center">
            <p className="text-xs text-blue-700 mb-1">آخرین ایستگاه</p>
            <p className="font-bold text-blue-950 text-sm">{overallLast.name}</p>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold mt-1 inline-block ${getStatusColor(
                overallLast.status
              )}`}
            >
              {overallLast.status}
            </span>
          </div>

          <div className="rounded-xl bg-teal-500/10 backdrop-blur-2xl p-4 border border-teal-500/20 text-center">
            <p className="text-xs text-blue-700 mb-1">وضعیت خروج</p>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                allReadyForLoading
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {allReadyForLoading ? "آماده بارگیری" : "خارج نشده"}
            </span>
          </div>
        </div>

        {/* جدول اقلام */}
        <div className="mb-4 rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-4 shadow-lg border border-teal-500/20 overflow-x-auto">
          <h2 className="text-lg font-bold text-blue-950 mb-4 px-1">اقلام و مسیر تولید</h2>

          {data.items.length === 0 ? (
            <p className="text-center text-blue-700 py-10">اقلامی وجود ندارد</p>
          ) : (
            <table className="w-full text-sm text-blue-900 border-collapse">
              <thead>
                <tr className="border-b border-teal-500/30 bg-teal-500/15 text-right">
                  <th className="p-3 font-bold text-center">ردیف</th>
                  <th className="p-3 font-bold">نام کالا</th>
                  <th className="p-3 font-bold text-center">تعداد</th>
                  <th className="p-3 font-bold text-center">طول</th>
                  <th className="p-3 font-bold text-center">عرض</th>
                  <th className="p-3 font-bold text-center">متراژ</th>
                  <th className="p-3 font-bold text-center">بارکد</th>
                  <th className="p-3 font-bold">مسیر ایستگاه‌ها</th>
                  <th className="p-3 font-bold text-center">آخرین ایستگاه</th>
                  <th className="p-3 font-bold text-center">وضعیت خروج</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, index) => {
                  const last = getLastStation(item.stations || [])
                  const exit = getExitStatus(item.stations || [])

                  return (
                    <tr
                      key={item.id}
                      className="border-b border-teal-500/10 bg-white/30 hover:bg-teal-400/20 transition"
                    >
                      <td className="p-3 text-center font-bold">{index + 1}</td>
                      <td className="p-3 font-bold">{item.productName}</td>
                      <td className="p-3 text-center font-semibold">{item.quantity}</td>
                      <td className="p-3 text-center">
                        {item.length != null ? item.length : "—"}
                      </td>
                      <td className="p-3 text-center">
                        {item.width != null ? item.width : "—"}
                      </td>
                      <td className="p-3 text-center">
                        {item.meterage != null ? item.meterage : "—"}
                      </td>
                      <td className="p-3 text-center text-teal-800 font-mono text-xs">
                        {item.barcode || "—"}
                      </td>
                      <td className="p-3 text-xs leading-relaxed max-w-xs">
                        <div className="flex flex-wrap items-center gap-y-1">
                          {getStationPath(item.stations || [])}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <div className="font-semibold">{last.name}</div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold mt-1 inline-block ${getStatusColor(
                            last.status
                          )}`}
                        >
                          {last.status}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${exit.color}`}
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

        {/* تاریخچه */}
        {data.history && data.history.length > 0 && (
          <div className="rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/20">
            <h2 className="text-lg font-bold text-blue-950 mb-4">تاریخچه عملیات</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {data.history.map((h) => (
                <div
                  key={h.id}
                  className="flex items-start gap-3 rounded-lg bg-white/30 p-3 text-sm"
                >
                  <div className="flex-1">
                    <p className="font-bold text-blue-900">{h.action}</p>
                    {h.description && (
                      <p className="text-blue-700 text-xs mt-0.5">{h.description}</p>
                    )}
                  </div>
                  <span className="text-xs text-blue-600 whitespace-nowrap">
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