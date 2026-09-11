"use client"

import { useState, useEffect } from "react"
import Link from "next/link"

type DashboardData = {
  orders: {
    total: number
    waiting: number
    inProgress: number
    completed: number
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
  }[]
  recentOrders: {
    id: string
    productionNumber: string
    status: string
    priority: string
    customerName?: string
    orderNumber?: string
    itemsCount: number
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
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const formatDate = (dateStr: string) => {
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
            <h1 className="text-2xl font-bold text-blue-950">داشبورد تولید</h1>
            <p className="text-sm text-blue-800 mt-1">نمای کلی وضعیت تولید</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={fetchData}
              className="rounded-xl bg-teal-500 hover:bg-teal-600 px-4 py-2.5 text-white font-bold"
            >
              بروزرسانی
            </button>
            <Link
              href="/production/queue"
              className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-4 py-2.5 text-blue-900 font-bold"
            >
              صف تولید
            </Link>
            <Link
              href="/production/station-queue"
              className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-4 py-2.5 text-blue-900 font-bold"
            >
              کارتابل
            </Link>
            <Link
              href="/production/cutting"
              className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-4 py-2.5 text-blue-900 font-bold"
            >
              برش
            </Link>
            <Link
              href="/"
              className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-4 py-2.5 text-blue-900 font-bold"
            >
              بازگشت
            </Link>
          </div>
        </div>

        {/* کارت‌های سفارش */}
        <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-2xl bg-white/50 border border-teal-500/20 p-4 text-center shadow">
            <p className="text-sm text-blue-700 mb-1">کل سفارش تولید</p>
            <p className="text-3xl font-bold text-teal-700">{data.orders.total}</p>
          </div>
          <div className="rounded-2xl bg-yellow-50 border border-yellow-200 p-4 text-center shadow">
            <p className="text-sm text-yellow-800 mb-1">در انتظار</p>
            <p className="text-3xl font-bold text-yellow-700">{data.orders.waiting}</p>
          </div>
          <div className="rounded-2xl bg-blue-50 border border-blue-200 p-4 text-center shadow">
            <p className="text-sm text-blue-800 mb-1">در حال تولید</p>
            <p className="text-3xl font-bold text-blue-700">{data.orders.inProgress}</p>
          </div>
          <div className="rounded-2xl bg-green-50 border border-green-200 p-4 text-center shadow">
            <p className="text-sm text-green-800 mb-1">تکمیل‌شده</p>
            <p className="text-3xl font-bold text-green-700">{data.orders.completed}</p>
          </div>
        </div>

        {/* اقلام + لیبل + ضایعات */}
        <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 border border-teal-500/20 shadow">
            <h3 className="font-bold text-blue-950 mb-3">اقلام تولید</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>کل</span>
                <span className="font-bold">{data.items.total}</span>
              </div>
              <div className="flex justify-between">
                <span>در انتظار</span>
                <span className="font-bold text-yellow-700">{data.items.waiting}</span>
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
        <div className="mb-4 rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 border border-teal-500/20 shadow">
          <h3 className="font-bold text-blue-950 mb-4">وضعیت ایستگاه‌ها</h3>
          {data.stationStats.length === 0 ? (
            <p className="text-blue-700">ایستگاهی تعریف نشده</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-blue-900">
                <thead>
                  <tr className="border-b border-teal-500/30 bg-teal-500/15 text-right">
                    <th className="p-2 font-bold">ایستگاه</th>
                    <th className="p-2 font-bold text-center">در انتظار</th>
                    <th className="p-2 font-bold text-center">در حال انجام</th>
                    <th className="p-2 font-bold text-center">تکمیل‌شده</th>
                    <th className="p-2 font-bold text-center">فعال الان</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stationStats.map((s) => (
                    <tr key={s.id} className="border-b border-teal-500/10 bg-white/30">
                      <td className="p-2 font-bold">{s.name}</td>
                      <td className="p-2 text-center text-yellow-700 font-semibold">
                        {s.waiting}
                      </td>
                      <td className="p-2 text-center text-blue-700 font-semibold">
                        {s.doing}
                      </td>
                      <td className="p-2 text-center text-green-700 font-semibold">
                        {s.done}
                      </td>
                      <td className="p-2 text-center font-bold">{s.active}</td>
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-blue-900">
                <thead>
                  <tr className="border-b border-teal-500/30 bg-teal-500/15 text-right">
                    <th className="p-2 font-bold text-center">ش سفارش</th>
                    <th className="p-2 font-bold">مشتری</th>
                    <th className="p-2 font-bold text-center">اقلام</th>
                    <th className="p-2 font-bold text-center">اولویت</th>
                    <th className="p-2 font-bold text-center">وضعیت</th>
                    <th className="p-2 font-bold text-center">تاریخ ورود</th>
                    <th className="p-2 font-bold text-center">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentOrders.map((o) => (
                    <tr key={o.id} className="border-b border-teal-500/10 bg-white/30">
                      <td className="p-2 text-center font-bold text-teal-800">
                        {o.orderNumber || "—"}
                      </td>
                      <td className="p-2 font-bold">{o.customerName || "—"}</td>
                      <td className="p-2 text-center">{o.itemsCount}</td>
                      <td className="p-2 text-center">{o.priority}</td>
                      <td className="p-2 text-center">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-bold ${getStatusColor(
                            o.status
                          )}`}
                        >
                          {o.status}
                        </span>
                      </td>
                      <td className="p-2 text-center">{formatDate(o.createdAt)}</td>
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
  )
}