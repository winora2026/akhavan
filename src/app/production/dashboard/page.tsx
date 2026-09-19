"use client"

import { useState, useEffect } from "react"
import Link from "next/link"

type DashboardData = {
  orders: {
    total: number
    waiting: number
    inProgress: number
    completed: number
    loading?: number
  }
  items: {
    total: number
    waiting: number
    inProgress: number
    completed: number
  }
  labels: {
    unprinted: number
    printed: number
    reprintAllowed: number
  }
  waste: {
    count: number
    quantity: number
  }
  stationStats: {
    id: string
    name: string
    waiting: number
    doing: number
    done: number
    active: number
    loading?: number
  }[]
  recentOrders: {
    id: string
    productionNumber: string
    status: string
    priority: string
    customerName?: string
    orderNumber?: string
    customerOrderNumber?: string | null
    itemsCount: number
    totalMeterage?: number | null
    deliveryDate?: string | null
    createdAt: string
  }[]
}

export default function ProductionDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/production/dashboard")
      if (!res.ok) throw new Error("خطا")
      const json = await res.json()
      setData(json)
    } catch (error) {
      console.error(error)
      alert("خطا در بارگذاری داشبورد")
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "در انتظار":
        return "bg-yellow-100 text-yellow-800"
      case "در حال تولید":
        return "bg-blue-100 text-blue-800"
      case "تکمیل‌شده":
        return "bg-green-100 text-green-800"
      case "بارگیری":
      case "آماده بارگیری":
        return "bg-emerald-100 text-emerald-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "—"
    try {
      return new Date(dateStr).toLocaleDateString("fa-IR")
    } catch {
      return dateStr
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <p className="text-xl font-bold text-blue-800">در حال بارگذاری داشبورد...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <p className="text-xl font-bold text-red-700">خطا در دریافت اطلاعات</p>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-fixed"
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
        {/* ========== بخش ثابت بالای صفحه (Sticky) ========== */}
        <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-teal-500/20 shadow-sm">
          <div className="p-4">
            {/* هدر */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-4 shadow border border-teal-500/20">
              <div>
                <h1 className="text-2xl font-bold text-blue-950">داشبورد تولید</h1>
                <p className="text-sm text-blue-800 mt-0.5">نمای کلی وضعیت تولید</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={fetchData}
                  className="rounded-xl bg-teal-500 hover:bg-teal-600 px-4 py-2 text-white font-bold text-sm"
                >
                  بروزرسانی
                </button>
                <Link
                  href="/production/queue"
                  className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-4 py-2 text-blue-900 font-bold text-sm"
                >
                  مشاهده روند کاری
                </Link>
                <Link
                  href="/production/station-queue"
                  className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-4 py-2 text-blue-900 font-bold text-sm"
                >
                  کارتابل
                </Link>
                <Link
                  href="/production/cutting"
                  className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-4 py-2 text-blue-900 font-bold text-sm"
                >
                  برش
                </Link>
                <Link
                  href="/"
                  className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-4 py-2 text-blue-900 font-bold text-sm"
                >
                  بازگشت
                </Link>
              </div>
            </div>

            {/* کارت‌های خلاصه */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl bg-white/70 border border-teal-500/20 p-3 text-center shadow-sm">
                <p className="text-xs text-blue-700 mb-0.5">کل سفارش تولید</p>
                <p className="text-2xl font-bold text-teal-700">{data.orders.total}</p>
              </div>
              <div className="rounded-xl bg-blue-50/90 border border-blue-200 p-3 text-center shadow-sm">
                <p className="text-xs text-blue-800 mb-0.5">در حال تولید</p>
                <p className="text-2xl font-bold text-blue-700">{data.orders.inProgress}</p>
                <p className="text-[10px] text-blue-600">انبار محصول ۱</p>
              </div>
              <div className="rounded-xl bg-green-50/90 border border-green-200 p-3 text-center shadow-sm">
                <p className="text-xs text-green-800 mb-0.5">تکمیل‌شده</p>
                <p className="text-2xl font-bold text-green-700">{data.orders.completed}</p>
                <p className="text-[10px] text-green-600">انبار محصول ۲</p>
              </div>
              <div className="rounded-xl bg-emerald-50/90 border border-emerald-200 p-3 text-center shadow-sm">
                <p className="text-xs text-emerald-800 mb-0.5">بارگیری</p>
                <p className="text-2xl font-bold text-emerald-700">
                  {data.orders.loading ?? 0}
                </p>
                <p className="text-[10px] text-emerald-600">آماده خروج</p>
              </div>
            </div>
          </div>
        </div>

        {/* ========== محتوای اسکرول‌شونده ========== */}
        <div className="p-4 pt-5 space-y-4">
          {/* اقلام + لیبل + ضایعات */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 border border-teal-500/20 shadow">
              <h3 className="font-bold text-blue-950 mb-3">اقلام تولید</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>کل</span>
                  <span className="font-bold">{data.items.total}</span>
                </div>
                <div className="flex justify-between">
                  <span>در حال تولید</span>
                  <span className="font-bold text-blue-700">{data.items.inProgress}</span>
                </div>
                <div className="flex justify-between">
                  <span>تکمیل‌شده</span>
                  <span className="font-bold text-green-700">{data.items.completed}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 border border-teal-500/20 shadow">
              <h3 className="font-bold text-blue-950 mb-3">وضعیت لیبل</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>چاپ‌نشده</span>
                  <span className="font-bold text-yellow-700">{data.labels.unprinted}</span>
                </div>
                <div className="flex justify-between">
                  <span>چاپ‌شده</span>
                  <span className="font-bold text-green-700">{data.labels.printed}</span>
                </div>
                <div className="flex justify-between">
                  <span>مجاز چاپ مجدد</span>
                  <span className="font-bold text-orange-700">
                    {data.labels.reprintAllowed}
                  </span>
                </div>
              </div>
              <Link
                href="/production/cutting"
                className="mt-4 inline-block text-sm font-bold text-teal-700 hover:underline"
              >
                رفتن به برنامه‌ریزی برش ←
              </Link>
            </div>

            <div className="rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 border border-teal-500/20 shadow">
              <h3 className="font-bold text-blue-950 mb-3">ضایعات</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>تعداد ثبت</span>
                  <span className="font-bold">{data.waste.count}</span>
                </div>
                <div className="flex justify-between">
                  <span>جمع تعداد ضایعات</span>
                  <span className="font-bold text-red-700">{data.waste.quantity}</span>
                </div>
              </div>
            </div>
          </div>

          {/* آمار ایستگاه‌ها */}
          <div className="rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 border border-teal-500/20 shadow">
            <h3 className="font-bold text-blue-950 mb-4">وضعیت ایستگاه‌ها</h3>
            {data.stationStats.length === 0 ? (
              <p className="text-blue-700">ایستگاهی تعریف نشده</p>
            ) : (
              <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
                <table className="w-full text-sm text-blue-900">
                  <thead className="sticky top-0 z-10 bg-teal-100/95 backdrop-blur">
                    <tr className="border-b border-teal-500/30 text-right">
                      <th className="p-2 font-bold">ایستگاه</th>
                      <th className="p-2 font-bold text-center">در حال تولید</th>
                      <th className="p-2 font-bold text-center">تکمیل‌شده</th>
                      <th className="p-2 font-bold text-center">بارگیری</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.stationStats.map((s) => (
                      <tr key={s.id} className="border-b border-teal-500/10 bg-white/30">
                        <td className="p-2 font-bold">{s.name}</td>
                        <td className="p-2 text-center text-blue-700 font-semibold">
                          {s.doing}
                        </td>
                        <td className="p-2 text-center text-green-700 font-semibold">
                          {s.done}
                        </td>
                        <td className="p-2 text-center text-emerald-700 font-semibold">
                          {s.loading ?? 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* آخرین سفارش‌ها */}
          <div className="rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 border border-teal-500/20 shadow">
            <h3 className="font-bold text-blue-950 mb-4">آخرین سفارش‌های تولید</h3>
            {data.recentOrders.length === 0 ? (
              <p className="text-blue-700">سفارشی وجود ندارد</p>
            ) : (
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm text-blue-900">
                  <thead className="sticky top-0 z-10 bg-teal-100/95 backdrop-blur">
                    <tr className="border-b border-teal-500/30 text-right">
                      <th className="p-2 font-bold text-center">ش سفارش</th>
                      <th className="p-2 font-bold text-center">ش سفارش مشتری</th>
                      <th className="p-2 font-bold">مشتری</th>
                      <th className="p-2 font-bold text-center">تعداد اقلام</th>
                      <th className="p-2 font-bold text-center">متراژ</th>
                      <th className="p-2 font-bold text-center">اولویت</th>
                      <th className="p-2 font-bold text-center">تاریخ تحویل</th>
                      <th className="p-2 font-bold text-center">وضعیت</th>
                      <th className="p-2 font-bold text-center">عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentOrders.map((o) => (
                      <tr
                        key={o.id}
                        className="border-b border-teal-500/10 bg-white/30 hover:bg-teal-50/50"
                      >
                        <td className="p-2 text-center font-bold text-teal-800">
                          {o.orderNumber || "—"}
                        </td>
                        <td className="p-2 text-center font-semibold">
                          {o.customerOrderNumber || "—"}
                        </td>
                        <td className="p-2 font-bold">{o.customerName || "—"}</td>
                        <td className="p-2 text-center">{o.itemsCount}</td>
                        <td className="p-2 text-center">
                          {o.totalMeterage != null
                            ? Number(o.totalMeterage).toLocaleString("fa-IR")
                            : "—"}
                        </td>
                        <td className="p-2 text-center">{o.priority}</td>
                        <td className="p-2 text-center">
                          {formatDate(o.deliveryDate || o.createdAt)}
                        </td>
                        <td className="p-2 text-center">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-bold ${getStatusColor(
                              o.status
                            )}`}
                          >
                            {o.status}
                          </span>
                        </td>
                        <td className="p-2 text-center">
                          <Link
                            href={`/production/orders/${o.id}`}
                            className="rounded-lg bg-blue-500/20 hover:bg-blue-500/40 px-3 py-1 text-xs font-bold text-blue-900"
                          >
                            جزئیات
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}