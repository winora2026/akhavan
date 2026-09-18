"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

type ProductionOrder = {
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
    customerOrderNumber?: string | null
    orderDate: string
    deliveryDate: string | null
    totalMeterage?: number | null
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
    meterage?: number | null
  }[]
}

type SortKey =
  | "orderNumber"
  | "customerName"
  | "customerOrderNumber"
  | "orderDate"
  | "deliveryDate"
  | "priority"
  | "itemsCount"
  | "totalMeterage"
  | "status"
  | "createdAt"

type DeadlineFilter = "all" | "overdue" | "near" | "overdue_and_near"

export default function ProductionWorkflowPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<ProductionOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("همه")
  const [deadlineFilter, setDeadlineFilter] = useState<DeadlineFilter>("all")
  const [sortKey, setSortKey] = useState<SortKey>("deliveryDate")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

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
      alert("خطا در بارگذاری روند کاری")
    } finally {
      setLoading(false)
    }
  }

  const parseDate = (dateStr: string | null | undefined): Date | null => {
    if (!dateStr) return null
    const d = new Date(dateStr)
    return isNaN(d.getTime()) ? null : d
  }

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "—"
    try {
      return new Date(dateStr).toLocaleDateString("fa-IR")
    } catch {
      return "—"
    }
  }

  const getTotalMeterage = (order: ProductionOrder) => {
    if (order.totalMeterage != null) return order.totalMeterage
    if (order.order?.totalMeterage != null) return order.order.totalMeterage
    if (!order.items?.length) return null
    const sum = order.items.reduce((acc, item) => acc + (item.meterage || 0), 0)
    return sum > 0 ? sum : null
  }

  // خلاصه اقلام سفارش
  const getItemsSummary = (order: ProductionOrder) => {
    if (!order.items?.length) return "—"
    const names = order.items.map((i) => i.productName)
    if (names.length <= 2) return names.join("، ")
    return `${names.slice(0, 2).join("، ")} + ${names.length - 2} قلم دیگر`
  }

  const isOverdue = (deliveryDate: string | null | undefined) => {
    const d = parseDate(deliveryDate)
    if (!d) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return d < today
  }

  const isNearDeadline = (deliveryDate: string | null | undefined) => {
    const d = parseDate(deliveryDate)
    if (!d) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const diffDays = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return diffDays >= 0 && diffDays <= 7
  }

  const filteredSorted = useMemo(() => {
    let result = [...orders]

    const q = search.trim().toLowerCase()
    if (q) {
      result = result.filter((o) => {
        const customerMatch = o.order?.customer?.name?.toLowerCase().includes(q)
        const orderNumMatch = o.order?.orderNumber?.toLowerCase().includes(q)
        const customerOrderNumMatch = (o.order?.customerOrderNumber || "")
          .toLowerCase()
          .includes(q)
        const productMatch = o.items?.some((item) =>
          item.productName?.toLowerCase().includes(q)
        )
        return customerMatch || orderNumMatch || customerOrderNumMatch || productMatch
      })
    }

    if (statusFilter !== "همه") {
      result = result.filter((o) => o.status === statusFilter)
    }

    // فیلتر موعد تحویل
    if (deadlineFilter === "overdue") {
      result = result.filter((o) => isOverdue(o.order?.deliveryDate))
    } else if (deadlineFilter === "near") {
      result = result.filter((o) => isNearDeadline(o.order?.deliveryDate))
    } else if (deadlineFilter === "overdue_and_near") {
      result = result.filter(
        (o) =>
          isOverdue(o.order?.deliveryDate) || isNearDeadline(o.order?.deliveryDate)
      )
    }

    result.sort((a, b) => {
      let av: string | number = ""
      let bv: string | number = ""

      switch (sortKey) {
        case "orderNumber":
          av = a.order?.orderNumber || ""
          bv = b.order?.orderNumber || ""
          break
        case "customerName":
          av = a.order?.customer?.name || ""
          bv = b.order?.customer?.name || ""
          break
        case "customerOrderNumber":
          av = a.order?.customerOrderNumber || ""
          bv = b.order?.customerOrderNumber || ""
          break
        case "orderDate":
          av = parseDate(a.order?.orderDate)?.getTime() || 0
          bv = parseDate(b.order?.orderDate)?.getTime() || 0
          break
        case "deliveryDate":
          av = parseDate(a.order?.deliveryDate)?.getTime() || Number.MAX_SAFE_INTEGER
          bv = parseDate(b.order?.deliveryDate)?.getTime() || Number.MAX_SAFE_INTEGER
          break
        case "priority":
          av = a.priority || ""
          bv = b.priority || ""
          break
        case "itemsCount":
          av = a.items?.length || 0
          bv = b.items?.length || 0
          break
        case "totalMeterage":
          av = getTotalMeterage(a) ?? 0
          bv = getTotalMeterage(b) ?? 0
          break
        case "status":
          av = a.status || ""
          bv = b.status || ""
          break
        case "createdAt":
        default:
          av = parseDate(a.createdAt)?.getTime() || 0
          bv = parseDate(b.createdAt)?.getTime() || 0
          break
      }

      if (av < bv) return sortDir === "asc" ? -1 : 1
      if (av > bv) return sortDir === "asc" ? 1 : -1
      return 0
    })

    return result
  }, [orders, search, statusFilter, deadlineFilter, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "deliveryDate" ? "asc" : "asc")
    }
  }

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return " ↕"
    return sortDir === "asc" ? " ↑" : " ↓"
  }

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

  const getRowClass = (order: ProductionOrder) => {
    if (isOverdue(order.order?.deliveryDate)) {
      return "border-b border-red-200 bg-red-50/60 hover:bg-red-100/70"
    }
    if (isNearDeadline(order.order?.deliveryDate)) {
      return "border-b border-orange-200 bg-orange-50/50 hover:bg-orange-100/60"
    }
    return "border-b border-teal-500/10 bg-white/30 hover:bg-teal-400/30"
  }

  const thClass =
    "p-3 font-bold whitespace-nowrap text-center cursor-pointer select-none hover:bg-teal-500/20 transition"

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
            <h1 className="text-2xl font-bold text-blue-950">مشاهده روند کاری</h1>
            <p className="text-sm text-blue-800 mt-1">
              لیست سفارش‌های تولید — برای جزئیات روی ردیف کلیک کنید
            </p>
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
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                جستجو (مشتری / ش سفارش / ش سفارش مشتری / نام کالا)
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="نام مشتری، شماره سفارش، شماره سفارش مشتری یا نام کالا..."
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

            <div className="md:col-span-3">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                فیلتر موعد تحویل
              </label>
              <select
                value={deadlineFilter}
                onChange={(e) => setDeadlineFilter(e.target.value as DeadlineFilter)}
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-sm font-semibold text-blue-950 focus:border-teal-500 focus:outline-none"
              >
                <option value="all">همه سفارش‌ها</option>
                <option value="overdue">فقط موعد گذشته</option>
                <option value="near">موعد نزدیک (۷ روز آینده)</option>
                <option value="overdue_and_near">موعد گذشته + نزدیک</option>
              </select>
            </div>

            <div className="md:col-span-1">
              <div className="rounded-xl bg-teal-500/20 border border-teal-500/30 px-3 py-2.5 text-center">
                <span className="text-sm text-blue-700">تعداد </span>
                <span className="text-lg font-bold text-teal-700">
                  {filteredSorted.length}
                </span>
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
          ) : filteredSorted.length === 0 ? (
            <p className="text-center text-blue-700 py-16 text-xl font-bold">
              سفارشی یافت نشد
            </p>
          ) : (
            <table className="w-full text-sm text-blue-900 border-collapse">
              <thead>
                <tr className="border-b border-teal-500/30 bg-teal-500/15 text-right">
                  <th className="p-3 font-bold text-center">ردیف</th>
                  <th className={thClass} onClick={() => toggleSort("customerName")}>
                    مشتری{sortIcon("customerName")}
                  </th>
                  <th className={thClass} onClick={() => toggleSort("customerOrderNumber")}>
                    ش سفارش مشتری{sortIcon("customerOrderNumber")}
                  </th>
                  <th className={thClass} onClick={() => toggleSort("orderNumber")}>
                    ش سفارش{sortIcon("orderNumber")}
                  </th>
                  <th className="p-3 font-bold text-center">اقلام</th>
                  <th className={thClass} onClick={() => toggleSort("itemsCount")}>
                    تعداد اقلام{sortIcon("itemsCount")}
                  </th>
                  <th className={thClass} onClick={() => toggleSort("totalMeterage")}>
                    متراژ کل{sortIcon("totalMeterage")}
                  </th>
                  <th className={thClass} onClick={() => toggleSort("priority")}>
                    اولویت{sortIcon("priority")}
                  </th>
                  <th className={thClass} onClick={() => toggleSort("orderDate")}>
                    تاریخ سفارش{sortIcon("orderDate")}
                  </th>
                  <th className={thClass} onClick={() => toggleSort("deliveryDate")}>
                    تاریخ تحویل{sortIcon("deliveryDate")}
                  </th>
                  <th className={thClass} onClick={() => toggleSort("status")}>
                    وضعیت{sortIcon("status")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredSorted.map((order, index) => {
                  const meterage = getTotalMeterage(order)
                  return (
                    <tr
                      key={order.id}
                      onClick={() => router.push(`/production/orders/${order.id}`)}
                      className={`transition cursor-pointer ${getRowClass(order)}`}
                    >
                      <td className="p-3 text-center font-bold">{index + 1}</td>
                      <td className="p-3 font-bold">
                        {order.order?.customer?.name || "—"}
                      </td>
                      <td className="p-3 text-center font-semibold">
                        {order.order?.customerOrderNumber || "—"}
                      </td>
                      <td className="p-3 text-center font-bold text-teal-800">
                        {order.order?.orderNumber || "—"}
                      </td>
                      <td className="p-3 text-xs max-w-[220px]">
                        {getItemsSummary(order)}
                      </td>
                      <td className="p-3 text-center font-semibold">
                        {order.items?.length || 0}
                      </td>
                      <td className="p-3 text-center font-semibold">
                        {meterage != null ? Number(meterage).toLocaleString("fa-IR") : "—"}
                      </td>
                      <td className="p-3 text-center">{order.priority || "عادی"}</td>
                      <td className="p-3 text-center">
                        {formatDate(order.order?.orderDate)}
                      </td>
                      <td className="p-3 text-center font-semibold">
                        {formatDate(order.order?.deliveryDate)}
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusColor(
                            order.status
                          )}`}
                        >
                          {order.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* راهنمای رنگ */}
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-blue-800">
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded bg-red-100 border border-red-300"></span>
            <span>عقب‌افتاده از موعد</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded bg-orange-100 border border-orange-300"></span>
            <span>موعد نزدیک (تا ۷ روز آینده)</span>
          </div>
        </div>
      </div>
    </div>
  )
}