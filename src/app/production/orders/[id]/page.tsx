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
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [selectedStation, setSelectedStation] = useState<ItemStation | null>(null)
  const [quantityOut, setQuantityOut] = useState(1)
  const [quantityWaste, setQuantityWaste] = useState(0)
  const [completeNotes, setCompleteNotes] = useState("")
  const [operatorName, setOperatorName] = useState("")

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

  const startStation = async (stationRow: ItemStation) => {
    if (!confirm(`شروع کار در ایستگاه «${stationRow.station.name}»؟`)) return

    try {
      setActionLoading(stationRow.id)
      const res = await fetch(`/api/production/item-stations/${stationRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          operatorName: operatorName || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        alert(json.error || "خطا در شروع")
        return
      }
      await fetchDetail()
    } catch (error) {
      console.error(error)
      alert("خطا در ارتباط با سرور")
    } finally {
      setActionLoading(null)
    }
  }

  const openCompleteModal = (stationRow: ItemStation) => {
    setSelectedStation(stationRow)
    setQuantityOut(stationRow.quantityIn || 1)
    setQuantityWaste(0)
    setCompleteNotes("")
    setShowCompleteModal(true)
  }

  const completeStation = async () => {
    if (!selectedStation) return

    try {
      setActionLoading(selectedStation.id)
      const res = await fetch(`/api/production/item-stations/${selectedStation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          quantityOut,
          quantityWaste,
          notes: completeNotes || undefined,
          operatorName: operatorName || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        alert(json.error || "خطا در تکمیل")
        return
      }
      setShowCompleteModal(false)
      await fetchDetail()
    } catch (error) {
      console.error(error)
      alert("خطا در ارتباط با سرور")
    } finally {
      setActionLoading(null)
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

      <div className="relative z-10 max-w-6xl mx-auto">
        {/* هدر */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/20">
          <div>
            <h1 className="text-2xl font-bold text-blue-950">جزئیات سفارش تولید</h1>
            <p className="text-lg font-bold text-teal-700 mt-1">
              سفارش {data.order?.orderNumber}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={operatorName}
              onChange={(e) => setOperatorName(e.target.value)}
              placeholder="نام اپراتور (اختیاری)"
              className="rounded-xl border border-teal-500/30 bg-white/60 px-3 py-2 text-sm font-semibold text-blue-950"
            />
            <Link
              href="/production/queue"
              className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-5 py-2.5 text-blue-900 font-bold transition"
            >
              بازگشت به صف
            </Link>
          </div>
        </div>

        {/* اطلاعات کلی */}
        <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/20">
            <h2 className="text-lg font-bold text-blue-950 mb-4">اطلاعات سفارش</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-blue-700">شماره سفارش:</span>
                <span className="font-bold">{data.order?.orderNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-700">مشتری:</span>
                <span className="font-bold">{data.order?.customer?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-700">اولویت:</span>
                <span className="font-bold">{data.priority}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-blue-700">وضعیت:</span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusColor(
                    data.status
                  )}`}
                >
                  {data.status}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/20">
            <h2 className="text-lg font-bold text-blue-950 mb-4">تاریخ‌ها</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-blue-700">ورود به تولید:</span>
                <span className="font-bold">{formatDate(data.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-700">تاریخ سفارش فروش:</span>
                <span className="font-bold">{formatDate(data.order?.orderDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-700">تاریخ تحویل:</span>
                <span className="font-bold">{formatDate(data.order?.deliveryDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-700">شروع تولید:</span>
                <span className="font-bold">{formatDate(data.startedAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-700">پایان تولید:</span>
                <span className="font-bold">{formatDate(data.completedAt)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* اقلام + عملیات ایستگاه */}
        <div className="mb-4 rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/20">
          <h2 className="text-lg font-bold text-blue-950 mb-4">اقلام و مسیر تولید</h2>

          {data.items.length === 0 ? (
            <p className="text-center text-blue-700 py-8">اقلامی وجود ندارد</p>
          ) : (
            <div className="space-y-5">
              {data.items.map((item, index) => (
                <div
                  key={item.id}
                  className="rounded-xl bg-white/40 border border-teal-500/20 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full bg-teal-500 text-white flex items-center justify-center font-bold text-sm">
                        {index + 1}
                      </span>
                      <div>
                        <p className="font-bold text-blue-950">{item.productName}</p>
                        <p className="text-xs text-blue-700">
                          {item.length && item.width
                            ? `${item.length} × ${item.width} mm`
                            : "—"}
                          {item.meterage ? ` | متراژ: ${item.meterage}` : ""}
                          {` | تعداد: ${item.quantity}`}
                        </p>
                        {item.barcode && (
                          <p className="text-xs text-teal-800 font-bold mt-1">
                            بارکد: {item.barcode}
                          </p>
                        )}
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusColor(
                        item.status
                      )}`}
                    >
                      {item.status}
                    </span>
                  </div>

                  {item.stations && item.stations.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-teal-500/20 text-right text-blue-800">
                            <th className="p-2 font-bold text-center">ترتیب</th>
                            <th className="p-2 font-bold">ایستگاه</th>
                            <th className="p-2 font-bold text-center">وضعیت</th>
                            <th className="p-2 font-bold text-center">ورودی</th>
                            <th className="p-2 font-bold text-center">خروجی</th>
                            <th className="p-2 font-bold text-center">ضایعات</th>
                            <th className="p-2 font-bold text-center">عملیات</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.stations
                            .sort((a, b) => a.sequence - b.sequence)
                            .map((s) => (
                              <tr key={s.id} className="border-b border-teal-500/10">
                                <td className="p-2 text-center font-bold">{s.sequence}</td>
                                <td className="p-2 font-bold">{s.station.name}</td>
                                <td className="p-2 text-center">
                                  <span
                                    className={`rounded-full px-2 py-1 text-xs font-bold ${getStatusColor(
                                      s.status
                                    )}`}
                                  >
                                    {s.status}
                                  </span>
                                </td>
                                <td className="p-2 text-center">{s.quantityIn ?? "—"}</td>
                                <td className="p-2 text-center">{s.quantityOut ?? "—"}</td>
                                <td className="p-2 text-center">{s.quantityWaste ?? "—"}</td>
                                <td className="p-2 text-center">
                                  <div className="flex justify-center gap-2">
                                    {s.status === "در انتظار" && (
                                      <button
                                        onClick={() => startStation(s)}
                                        disabled={actionLoading === s.id}
                                        className="rounded-lg bg-blue-500 hover:bg-blue-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                                      >
                                        {actionLoading === s.id ? "..." : "شروع"}
                                      </button>
                                    )}
                                    {(s.status === "در انتظار" ||
                                      s.status === "در حال انجام") && (
                                      <button
                                        onClick={() => openCompleteModal(s)}
                                        disabled={actionLoading === s.id}
                                        className="rounded-lg bg-teal-500 hover:bg-teal-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                                      >
                                        پایان
                                      </button>
                                    )}
                                    {s.status === "تکمیل شده" && (
                                      <span className="text-xs text-green-700 font-bold">
                                        انجام شد
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-orange-600 font-semibold">
                      مسیر ایستگاه تعریف نشده
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* تاریخچه */}
        <div className="rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/20">
          <h2 className="text-lg font-bold text-blue-950 mb-4">تاریخچه عملیات</h2>
          {data.history.length === 0 ? (
            <p className="text-center text-blue-700 py-6">تاریخچه‌ای ثبت نشده</p>
          ) : (
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
          )}
        </div>
      </div>

      {/* مودال پایان کار */}
      {showCompleteModal && selectedStation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" dir="rtl">
            <h2 className="text-xl font-bold text-blue-950 mb-2">پایان کار ایستگاه</h2>
            <p className="text-sm text-blue-700 mb-4 font-bold">
              {selectedStation.station.name}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-blue-900 mb-1">
                  تعداد سالم خروجی
                </label>
                <input
                  type="number"
                  min={0}
                  value={quantityOut}
                  onChange={(e) => setQuantityOut(Number(e.target.value))}
                  className="w-full rounded-xl border border-teal-500/30 px-4 py-2.5 focus:border-teal-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-blue-900 mb-1">
                  تعداد ضایعات
                </label>
                <input
                  type="number"
                  min={0}
                  value={quantityWaste}
                  onChange={(e) => setQuantityWaste(Number(e.target.value))}
                  className="w-full rounded-xl border border-teal-500/30 px-4 py-2.5 focus:border-teal-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-blue-900 mb-1">
                  توضیحات / علت ضایعات
                </label>
                <textarea
                  value={completeNotes}
                  onChange={(e) => setCompleteNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-teal-500/30 px-4 py-2.5 focus:border-teal-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={() => setShowCompleteModal(false)}
                className="rounded-xl border border-gray-300 px-5 py-2.5 font-bold text-gray-700 hover:bg-gray-50"
              >
                انصراف
              </button>
              <button
                onClick={completeStation}
                disabled={actionLoading === selectedStation.id}
                className="rounded-xl bg-teal-500 hover:bg-teal-600 px-5 py-2.5 font-bold text-white disabled:opacity-50"
              >
                {actionLoading === selectedStation.id
                  ? "در حال ثبت..."
                  : "ثبت پایان کار"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}