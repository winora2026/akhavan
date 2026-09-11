"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"

type ProductionOrder = {
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
      id: string
      name: string
    }
  }
  items: {
    id: string
    productName: string
    quantity: number
    status: string
    barcode?: string | null
  }[]
}

export default function ProductionQueuePage() {
  const [orders, setOrders] = useState<ProductionOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("همه")
  const [priorityFilter, setPriorityFilter] = useState("همه")

  useEffect(() => {
    fetchOrders()
  }, [])

  const fetchOrders = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/production/orders")
      if (!res.ok) throw new Error("خطا در دریافت")
      const data = await res.json()
      setOrders(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error(error)
      alert("خطا در بارگذاری صف تولید")
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    let result = orders

    if (statusFilter !== "همه") {
      result = result.filter((o) => o.status === statusFilter)
    }

    if (priorityFilter !== "همه") {
      result = result.filter((o) => o.priority === priorityFilter)
    }

    const q = search.trim().toLowerCase()
    if (q) {
      result = result.filter(
        (o) =>
          o.order?.orderNumber?.toLowerCase().includes(q) ||
          o.order?.customer?.name?.toLowerCase().includes(q) ||
          o.items?.some(
            (i) =>
              i.productName?.toLowerCase().includes(q) ||
              (i.barcode || "").toLowerCase().includes(q)
          )
      )
    }

    return result
  }, [orders, search, statusFilter, priorityFilter])

  const getStatusColor = (status: string) => {
    switch (status) {
      case "در انتظار":
        return "bg-yellow-100 text-yellow-800"
      case "در حال تولید":
        return "bg-blue-100 text-blue-800"
      case "تکمیل‌شده":
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
      return "—"
    }
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
            <h1 className="text-2xl font-bold text-blue-950">صف تولید</h1>
            <p className="text-sm text-blue-800 mt-1">لیست سفارش‌های وارد شده به تولید</p>
          </div>
          <div className="flex flex-wrap gap-2">
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
              برنامه‌ریزی برش
            </Link>
            <Link
              href="/production/dashboard"
              className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-4 py-2.5 text-blue-900 font-bold"
            >
              داشبورد
            </Link>
            <Link
              href="/"
              className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-4 py-2.5 text-blue-900 font-bold"
            >
              بازگشت
            </Link>
          </div>
        </div>

        {/* فیلترها */}
        <div className="mb-4 rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-4 shadow-lg border border-teal-500/20">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-4">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">جستجو</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="مشتری / ش سفارش / کالا / بارکد..."
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-sm font-semibold text-blue-950 focus:border-teal-500 focus:outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">وضعیت</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-sm font-semibold text-blue-950 focus:border-teal-500 focus:outline-none"
              >
                <option value="همه">همه</option>
                <option value="در انتظار">در انتظار</option>
                <option value="در حال تولید">در حال تولید</option>
                <option value="تکمیل‌شده">تکمیل‌شده</option>
                <option value="متوقف‌شده">متوقف‌شده</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">اولویت</label>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-sm font-semibold text-blue-950 focus:border-teal-500 focus:outline-none"
              >
                <option value="همه">همه</option>
                <option value="عادی">عادی</option>
                <option value="فوری">فوری</option>
                <option value="خیلی فوری">خیلی فوری</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <div className="rounded-xl bg-teal-500/20 border border-teal-500/30 px-4 py-2.5 text-center">
                <span className="text-sm text-blue-700">تعداد: </span>
                <span className="text-xl font-bold text-teal-700">{filtered.length}</span>
              </div>
            </div>
            <div className="md:col-span-2">
              <button
                onClick={fetchOrders}
                className="w-full rounded-xl bg-teal-500 hover:bg-teal-600 px-4 py-2.5 text-white font-bold"
              >
                بروزرسانی
              </button>
            </div>
          </div>
        </div>

        {/* جدول */}
        <div className="rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-4 shadow-lg border border-teal-500/20 overflow-x-auto">
          {loading ? (
            <p className="text-center text-blue-700 py-16 text-xl font-bold">
              در حال بارگذاری...
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-blue-700 py-16 text-xl font-bold">
              سفارشی در صف تولید نیست
            </p>
          ) : (
            <table className="w-full text-sm text-blue-900 border-collapse">
              <thead>
                <tr className="border-b border-teal-500/30 bg-teal-500/15 text-right">
                  <th className="p-3 font-bold text-center">ردیف</th>
                  <th className="p-3 font-bold text-center">ش سفارش</th>
                  <th className="p-3 font-bold">مشتری</th>
                  <th className="p-3 font-bold text-center">اقلام</th>
                  <th className="p-3 font-bold text-center">اولویت</th>
                  <th className="p-3 font-bold text-center">وضعیت</th>
                  <th className="p-3 font-bold text-center">تاریخ سفارش</th>
                  <th className="p-3 font-bold text-center">تاریخ تحویل</th>
                  <th className="p-3 font-bold text-center">ورود به تولید</th>
                  <th className="p-3 font-bold text-center">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order, index) => (
                  <tr
                    key={order.id}
                    className="border-b border-teal-500/10 hover:bg-teal-400/20 bg-white/30 transition"
                  >
                    <td className="p-3 text-center font-bold">{index + 1}</td>
                    <td className="p-3 text-center font-bold text-teal-800">
                      {order.order?.orderNumber || "—"}
                    </td>
                    <td className="p-3 font-bold">
                      {order.order?.customer?.name || "—"}
                    </td>
                    <td className="p-3 text-center font-semibold">
                      {order.items?.length || 0}
                    </td>
                    <td className="p-3 text-center">{order.priority || "عادی"}</td>
                    <td className="p-3 text-center">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusColor(
                          order.status
                        )}`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {formatDate(order.order?.orderDate)}
                    </td>
                    <td className="p-3 text-center">
                      {formatDate(order.order?.deliveryDate)}
                    </td>
                    <td className="p-3 text-center">{formatDate(order.createdAt)}</td>
                    <td className="p-3 text-center">
                      <Link
                        href={`/production/orders/${order.id}`}
                        className="rounded-lg bg-blue-500/20 hover:bg-blue-500/40 px-3 py-1.5 text-xs font-bold text-blue-900"
                      >
                        جزئیات
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}