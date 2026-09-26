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

/** یک ردیف = یک نوع کالا داخل یک سفارش */
type WorkflowRow = {
  rowKey: string
  productionOrderId: string
  itemId: string
  productName: string
  itemQuantity: number
  orderTotalQuantity: number
  itemMeterage: number | null
  orderTotalMeterage: number | null
  status: string
  itemStatus: string
  priority: string
  orderNumber: string
  customerOrderNumber: string
  customerName: string
  orderDate: string | null
  deliveryDate: string | null
  createdAt: string
}

type SortKey =
  | "orderNumber"
  | "customerName"
  | "customerOrderNumber"
  | "productName"
  | "itemQuantity"
  | "orderTotalQuantity"
  | "itemMeterage"
  | "orderTotalMeterage"
  | "orderDate"
  | "deliveryDate"
  | "priority"
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

  // Escape → بازگشت به داشبورد
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        router.push("/")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [router])

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

  const getOrderTotalMeterage = (order: ProductionOrder) => {
    if (order.totalMeterage != null) return order.totalMeterage
    if (order.order?.totalMeterage != null) return order.order.totalMeterage
    if (!order.items?.length) return null
    const sum = order.items.reduce((acc, item) => acc + (item.meterage || 0), 0)
    return sum > 0 ? sum : null
  }

  const getOrderTotalQuantity = (order: ProductionOrder) => {
    if (!order.items?.length) return 0
    return order.items.reduce((acc, item) => acc + (item.quantity || 0), 0)
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
    const diffDays = Math.ceil(
      (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    )
    return diffDays >= 0 && diffDays <= 7
  }

  /** تبدیل سفارش‌ها به ردیف‌های سطح کالا */
  const allRows = useMemo((): WorkflowRow[] => {
    const rows: WorkflowRow[] = []
    for (const order of orders) {
      const orderTotalQty = getOrderTotalQuantity(order)
      const orderTotalM = getOrderTotalMeterage(order)
      const items = order.items?.length
        ? order.items
        : [
            {
              id: `${order.id}-empty`,
              productName: "—",
              quantity: 0,
              status: order.status,
              meterage: null as number | null,
            },
          ]

      for (const item of items) {
        rows.push({
          rowKey: `${order.id}-${item.id}`,
          productionOrderId: order.id,
          itemId: item.id,
          productName: item.productName || "—",
          itemQuantity: item.quantity || 0,
          orderTotalQuantity: orderTotalQty,
          itemMeterage: item.meterage != null ? item.meterage : null,
          orderTotalMeterage: orderTotalM,
          status: order.status,
          itemStatus: item.status || order.status,
          priority: order.priority || "عادی",
          orderNumber: order.order?.orderNumber || "",
          customerOrderNumber: order.order?.customerOrderNumber || "",
          customerName: order.order?.customer?.name || "",
          orderDate: order.order?.orderDate || null,
          deliveryDate: order.order?.deliveryDate || null,
          createdAt: order.createdAt,
        })
      }
    }
    return rows
  }, [orders])

  const filteredSorted = useMemo(() => {
    let result = [...allRows]

    const q = search.trim().toLowerCase()
    if (q) {
      result = result.filter((r) => {
        return (
          r.customerName.toLowerCase().includes(q) ||
          r.orderNumber.toLowerCase().includes(q) ||
          r.customerOrderNumber.toLowerCase().includes(q) ||
          r.productName.toLowerCase().includes(q)
        )
      })
    }

    if (statusFilter !== "همه") {
      result = result.filter((r) => r.status === statusFilter)
    }

    if (deadlineFilter === "overdue") {
      result = result.filter((r) => isOverdue(r.deliveryDate))
    } else if (deadlineFilter === "near") {
      result = result.filter((r) => isNearDeadline(r.deliveryDate))
    } else if (deadlineFilter === "overdue_and_near") {
      result = result.filter(
        (r) => isOverdue(r.deliveryDate) || isNearDeadline(r.deliveryDate)
      )
    }

    result.sort((a, b) => {
      let av: string | number = ""
      let bv: string | number = ""

      switch (sortKey) {
        case "orderNumber":
          av = a.orderNumber
          bv = b.orderNumber
          break
        case "customerName":
          av = a.customerName
          bv = b.customerName
          break
        case "customerOrderNumber":
          av = a.customerOrderNumber
          bv = b.customerOrderNumber
          break
        case "productName":
          av = a.productName
          bv = b.productName
          break
        case "itemQuantity":
          av = a.itemQuantity
          bv = b.itemQuantity
          break
        case "orderTotalQuantity":
          av = a.orderTotalQuantity
          bv = b.orderTotalQuantity
          break
        case "itemMeterage":
          av = a.itemMeterage ?? 0
          bv = b.itemMeterage ?? 0
          break
        case "orderTotalMeterage":
          av = a.orderTotalMeterage ?? 0
          bv = b.orderTotalMeterage ?? 0
          break
        case "orderDate":
          av = parseDate(a.orderDate)?.getTime() || 0
          bv = parseDate(b.orderDate)?.getTime() || 0
          break
        case "deliveryDate":
          av =
            parseDate(a.deliveryDate)?.getTime() || Number.MAX_SAFE_INTEGER
          bv =
            parseDate(b.deliveryDate)?.getTime() || Number.MAX_SAFE_INTEGER
          break
        case "priority":
          av = a.priority
          bv = b.priority
          break
        case "status":
          av = a.status
          bv = b.status
          break
        case "createdAt":
        default:
          av = parseDate(a.createdAt)?.getTime() || 0
          bv = parseDate(b.createdAt)?.getTime() || 0
          break
      }

      if (typeof av === "string" && typeof bv === "string") {
        const cmp = av.localeCompare(bv, "fa", { numeric: true })
        return sortDir === "asc" ? cmp : -cmp
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1
      if (av > bv) return sortDir === "asc" ? 1 : -1
      return 0
    })

    return result
  }, [allRows, search, statusFilter, deadlineFilter, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
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

  const getRowClass = (row: WorkflowRow) => {
    if (isOverdue(row.deliveryDate)) {
      return "border-b border-red-200 bg-red-50/60 hover:bg-red-100/70"
    }
    if (isNearDeadline(row.deliveryDate)) {
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
      <div className="pointer-events-none fixed inset-0 bg-black/5" />

      <div className="relative z-10 max-w-[1600px] mx-auto">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/20">
          <div>
            <h1 className="text-2xl font-bold text-blue-950">مشاهده روند کاری</h1>
            <p className="text-sm text-blue-800 mt-1">
              هر ردیف = یک نوع کالا در سفارش — برای جزئیات روی ردیف کلیک کنید · Esc =
              بازگشت
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
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                وضعیت
              </label>
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
                onChange={(e) =>
                  setDeadlineFilter(e.target.value as DeadlineFilter)
                }
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
                  <th
                    className={thClass}
                    onClick={() => toggleSort("customerName")}
                  >
                    مشتری{sortIcon("customerName")}
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("customerOrderNumber")}
                  >
                    ش سفارش مشتری{sortIcon("customerOrderNumber")}
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("orderNumber")}
                  >
                    ش سفارش{sortIcon("orderNumber")}
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("productName")}
                  >
                    نام کالا{sortIcon("productName")}
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("itemQuantity")}
                  >
                    تعداد کالا{sortIcon("itemQuantity")}
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("orderTotalQuantity")}
                  >
                    تعداد کل{sortIcon("orderTotalQuantity")}
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("itemMeterage")}
                  >
                    متراژ{sortIcon("itemMeterage")}
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("orderTotalMeterage")}
                  >
                    متراژ کل{sortIcon("orderTotalMeterage")}
                  </th>
                  <th className={thClass} onClick={() => toggleSort("priority")}>
                    اولویت{sortIcon("priority")}
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("orderDate")}
                  >
                    تاریخ سفارش{sortIcon("orderDate")}
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("deliveryDate")}
                  >
                    تاریخ تحویل{sortIcon("deliveryDate")}
                  </th>
                  <th className={thClass} onClick={() => toggleSort("status")}>
                    وضعیت{sortIcon("status")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredSorted.map((row, index) => (
                  <tr
                    key={row.rowKey}
                    onClick={() =>
                      router.push(`/production/orders/${row.productionOrderId}`)
                    }
                    className={`transition cursor-pointer ${getRowClass(row)}`}
                  >
                    <td className="p-3 text-center font-bold">{index + 1}</td>
                    <td className="p-3 font-bold">{row.customerName || "—"}</td>
                    <td className="p-3 text-center font-semibold">
                      {row.customerOrderNumber || "—"}
                    </td>
                    <td className="p-3 text-center font-bold text-teal-800">
                      {row.orderNumber || "—"}
                    </td>
                    <td className="p-3 font-bold">{row.productName}</td>
                    <td className="p-3 text-center font-semibold">
                      {row.itemQuantity}
                    </td>
                    <td className="p-3 text-center font-semibold">
                      {row.orderTotalQuantity}
                    </td>
                    <td className="p-3 text-center font-semibold">
                      {row.itemMeterage != null
                        ? Number(row.itemMeterage).toLocaleString("fa-IR")
                        : "—"}
                    </td>
                    <td className="p-3 text-center font-semibold">
                      {row.orderTotalMeterage != null
                        ? Number(row.orderTotalMeterage).toLocaleString("fa-IR")
                        : "—"}
                    </td>
                    <td className="p-3 text-center">{row.priority}</td>
                    <td className="p-3 text-center">
                      {formatDate(row.orderDate)}
                    </td>
                    <td className="p-3 text-center font-semibold">
                      {formatDate(row.deliveryDate)}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusColor(
                          row.status
                        )}`}
                      >
                        {row.status}
                      </span>
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