"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import DatePicker, { DateObject } from "react-multi-date-picker"
import persian from "react-date-object/calendars/persian"
import persian_fa from "react-date-object/locales/persian_fa"

type OrderFromApi = {
  id: string
  orderNumber: string
  customerOrderNumber: string | null
  orderDate: string
  deliveryDate: string | null
  priority: string
  totalMeterage: number
  totalQuantity: number
  hasInstallation: boolean
  installationDate: string | null
  status: string
  notes: string | null
  createdAt: string
  discountAmount: number | null
  salesRep?: string | null
  cancelledAt?: string | null
  cancelledBy?: string | null
  cancelReason?: string | null
  customer: {
    id: string
    name: string
    customerGroup: string | null
    customerCode?: string | null
  }
  items: { id: string; productName: string; totalPrice: number; meterage: number }[]
}

type SortKey =
  | "customer"
  | "orderNumber"
  | "customerOrderNumber"
  | "createdAt"
  | "cancelledAt"
  | "cancelledBy"
  | "priority"
  | "totalMeterage"
  | "totalQuantity"
  | "totalPrice"
  | "salesRep"

const PERSIAN_MONTHS = [
  { value: "همه", label: "همه ماه‌ها" },
  { value: "01", label: "فروردین" },
  { value: "02", label: "اردیبهشت" },
  { value: "03", label: "خرداد" },
  { value: "04", label: "تیر" },
  { value: "05", label: "مرداد" },
  { value: "06", label: "شهریور" },
  { value: "07", label: "مهر" },
  { value: "08", label: "آبان" },
  { value: "09", label: "آذر" },
  { value: "10", label: "دی" },
  { value: "11", label: "بهمن" },
  { value: "12", label: "اسفند" },
]

const PERSIAN_DATE_REGEX = /^\d{3,4}\/\d{1,2}\/\d{1,2}$/

const parseOrderDate = (dateStr: string | null | undefined): Date | null => {
  if (!dateStr) return null
  if (PERSIAN_DATE_REGEX.test(dateStr)) {
    try {
      const dObj = new DateObject({
        date: dateStr,
        format: "YYYY/M/D",
        calendar: persian,
        locale: persian_fa,
      })
      const d = dObj.toDate()
      return isNaN(d.getTime()) ? null : d
    } catch {
      return null
    }
  }
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? null : d
}

const formatDate = (dateStr: string | null | undefined) => {
  const d = parseOrderDate(dateStr)
  if (!d) return "—"
  try {
    return new DateObject({
      date: d,
      calendar: persian,
      locale: persian_fa,
    }).format("YYYY/MM/DD")
  } catch {
    return dateStr || "—"
  }
}

const formatPrice = (n: number) =>
  Math.round(n || 0).toLocaleString("fa-IR")

const getTotalPrice = (order: OrderFromApi) =>
  order.items?.reduce((s, i) => s + (i.totalPrice || 0), 0) || 0

/** ماه شمسی تاریخ لغو (یا createdAt) به‌صورت 01..12 */
const getPersianMonth = (dateStr: string | null | undefined) => {
  const d = parseOrderDate(dateStr)
  if (!d) return null
  try {
    return new DateObject({
      date: d,
      calendar: persian,
      locale: persian_fa,
    }).format("MM")
  } catch {
    return null
  }
}

export default function CancelledPreInvoicesPage() {
  const [orders, setOrders] = useState<OrderFromApi[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [fromDate, setFromDate] = useState<any>(null)
  const [toDate, setToDate] = useState<any>(null)
  const [monthFilter, setMonthFilter] = useState("همه")
  const [sortKey, setSortKey] = useState<SortKey>("cancelledAt")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [detail, setDetail] = useState<OrderFromApi | null>(null)
  const [restoreItem, setRestoreItem] = useState<OrderFromApi | null>(null)
  const [restoring, setRestoring] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/orders")
      if (!res.ok) throw new Error("خطا")
      const data = await res.json()
      setOrders(Array.isArray(data) ? data : [])
    } catch {
      alert("خطا در بارگذاری")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "customer" || key === "cancelledBy" ? "asc" : "desc")
    }
  }

  const sortMark = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : ""

  const filtered = useMemo(() => {
    let result = orders.filter((o) => o.status === "لغو شده")

    const q = search.trim().toLowerCase()
    if (q) {
      result = result.filter(
        (item) =>
          item.customer?.name?.toLowerCase().includes(q) ||
          item.orderNumber?.toLowerCase().includes(q) ||
          (item.customerOrderNumber || "").toLowerCase().includes(q) ||
          (item.cancelledBy || "").toLowerCase().includes(q) ||
          (item.cancelReason || "").toLowerCase().includes(q) ||
          (item.salesRep || "").toLowerCase().includes(q)
      )
    }

    if (monthFilter !== "همه") {
      result = result.filter((item) => {
        const m = getPersianMonth(item.cancelledAt || item.createdAt)
        return m === monthFilter
      })
    }

    if (fromDate) {
      const from = fromDate?.toDate ? fromDate.toDate() : new Date(fromDate)
      from.setHours(0, 0, 0, 0)
      result = result.filter((item) => {
        const d = parseOrderDate(item.cancelledAt || item.createdAt)
        if (!d) return false
        d.setHours(0, 0, 0, 0)
        return d >= from
      })
    }
    if (toDate) {
      const to = toDate?.toDate ? toDate.toDate() : new Date(toDate)
      to.setHours(23, 59, 59, 999)
      result = result.filter((item) => {
        const d = parseOrderDate(item.cancelledAt || item.createdAt)
        return d ? d <= to : false
      })
    }

    const dir = sortDir === "asc" ? 1 : -1
    result = [...result].sort((a, b) => {
      const priceA = getTotalPrice(a)
      const priceB = getTotalPrice(b)
      switch (sortKey) {
        case "customer":
          return (
            dir *
            (a.customer?.name || "").localeCompare(b.customer?.name || "", "fa")
          )
        case "orderNumber":
          return dir * String(a.orderNumber).localeCompare(String(b.orderNumber), "fa", { numeric: true })
        case "customerOrderNumber":
          return (
            dir *
            String(a.customerOrderNumber || "").localeCompare(
              String(b.customerOrderNumber || ""),
              "fa",
              { numeric: true }
            )
          )
        case "createdAt": {
          const da = parseOrderDate(a.createdAt)?.getTime() || 0
          const db = parseOrderDate(b.createdAt)?.getTime() || 0
          return dir * (da - db)
        }
        case "cancelledAt": {
          const da = parseOrderDate(a.cancelledAt)?.getTime() || 0
          const db = parseOrderDate(b.cancelledAt)?.getTime() || 0
          return dir * (da - db)
        }
        case "cancelledBy":
          return (
            dir *
            (a.cancelledBy || "").localeCompare(b.cancelledBy || "", "fa")
          )
        case "priority":
          return dir * (a.priority || "").localeCompare(b.priority || "", "fa")
        case "totalMeterage":
          return dir * ((a.totalMeterage || 0) - (b.totalMeterage || 0))
        case "totalQuantity":
          return dir * ((a.totalQuantity || 0) - (b.totalQuantity || 0))
        case "totalPrice":
          return dir * (priceA - priceB)
        case "salesRep":
          return dir * (a.salesRep || "").localeCompare(b.salesRep || "", "fa")
        default:
          return 0
      }
    })

    return result
  }, [orders, search, fromDate, toDate, monthFilter, sortKey, sortDir])

  const report = useMemo(() => {
    const totalCount = filtered.length
    const totalMeterage = filtered.reduce(
      (s, o) => s + (o.totalMeterage || 0),
      0
    )
    const totalQuantity = filtered.reduce(
      (s, o) => s + (o.totalQuantity || 0),
      0
    )
    const totalPrice = filtered.reduce((s, o) => s + getTotalPrice(o), 0)
    const totalDiscount = filtered.reduce(
      (s, o) => s + (o.discountAmount || 0),
      0
    )
    return {
      totalCount,
      totalMeterage,
      totalQuantity,
      totalPrice,
      totalDiscount,
    }
  }, [filtered])

  const confirmRestore = async () => {
    if (!restoreItem) return
    setRestoring(true)
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: restoreItem.id,
          status: "پیش‌فاکتور",
          // اگر در API پشتیبانی شود، فیلدهای لغو پاک می‌شوند
          clearCancel: true,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || "خطا در بازگردانی")
        return
      }
      setOrders((prev) =>
        prev.map((o) =>
          o.id === restoreItem.id
            ? {
                ...o,
                status: "پیش‌فاکتور",
                cancelledAt: null,
                cancelledBy: null,
                cancelReason: null,
              }
            : o
        )
      )
      setRestoreItem(null)
      setDetail(null)
    } catch {
      alert("خطا در ارتباط با سرور")
    } finally {
      setRestoring(false)
    }
  }

  const Th = ({
    k,
    children,
    className = "",
  }: {
    k: SortKey
    children: React.ReactNode
    className?: string
  }) => (
    <th
      className={`p-3 cursor-pointer select-none hover:bg-amber-800 ${className}`}
      onClick={() => toggleSort(k)}
    >
      {children}
      {sortMark(k)}
    </th>
  )

  return (
    <div
      className="min-h-screen p-4 md:p-6"
      dir="rtl"
      style={{ fontFamily: "Vazirmatn, Tahoma, sans-serif" }}
    >
      <div className="max-w-[1600px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-blue-950">
              پیش‌فاکتورهای لغوشده
            </h1>
            <p className="text-sm text-blue-800 mt-1 font-semibold">
              لغو‌شده‌ها با دلیل و تاریخ — در صورت نیاز قابل بازگردانی به
              پیش‌فاکتورها
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/order"
              className="rounded-xl border border-teal-400 bg-white px-4 py-2 font-bold text-teal-800"
            >
              پیش‌فاکتورها
            </Link>
            <Link
              href="/"
              className="rounded-xl border bg-white px-4 py-2 font-bold"
            >
              داشبورد
            </Link>
          </div>
        </div>

        {/* فیلترها */}
        <div className="rounded-2xl border border-amber-300/50 bg-amber-50/40 p-3 mb-3 grid grid-cols-1 md:grid-cols-8 gap-2">
          <div className="md:col-span-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجو: مشتری، شماره، دلیل، لغو‌کننده..."
              className="w-full rounded-xl border border-amber-300 px-3 py-2 font-semibold"
            />
          </div>
          <div>
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="w-full rounded-xl border border-amber-300 px-3 py-2 font-semibold bg-white"
            >
              {PERSIAN_MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <DatePicker
              value={fromDate}
              onChange={setFromDate}
              calendar={persian}
              locale={persian_fa}
              inputClass="w-full rounded-xl border border-amber-300 px-3 py-2 font-semibold"
              placeholder="از تاریخ لغو"
            />
          </div>
          <div>
            <DatePicker
              value={toDate}
              onChange={setToDate}
              calendar={persian}
              locale={persian_fa}
              inputClass="w-full rounded-xl border border-amber-300 px-3 py-2 font-semibold"
              placeholder="تا تاریخ لغو"
            />
          </div>
          <div className="rounded-xl bg-white border border-amber-200 px-3 py-2 text-center font-bold">
            تعداد: {filtered.length}
          </div>
          <button
            type="button"
            onClick={() => {
              setSearch("")
              setFromDate(null)
              setToDate(null)
              setMonthFilter("همه")
            }}
            className="rounded-xl border border-amber-400 bg-white px-3 py-2 font-bold text-amber-900"
          >
            پاک فیلتر
          </button>
        </div>

        {/* جدول */}
        <div className="rounded-2xl border border-amber-200 overflow-auto bg-white/95 max-h-[70vh]">
          {loading ? (
            <p className="text-center py-16 font-bold text-blue-800">
              در حال بارگذاری...
            </p>
          ) : (
            <table className="w-full text-sm text-blue-900 border-collapse">
              <thead className="bg-amber-700 text-white sticky top-0 z-20">
                <tr className="text-right">
                  <th className="p-3 sticky right-0 bg-amber-700 z-30">ردیف</th>
                  <Th k="customer" className="sticky right-12 bg-amber-700 z-30 min-w-[140px]">
                    نام مشتری
                  </Th>
                  <Th k="orderNumber">ش سفارش</Th>
                  <Th k="customerOrderNumber">ش سفارش مشتری</Th>
                  <Th k="createdAt">تاریخ پیش‌فاکتور</Th>
                  <Th k="cancelledAt">تاریخ لغو</Th>
                  <Th k="cancelledBy">لغو توسط</Th>
                  <th className="p-3">دلیل لغو</th>
                  <Th k="priority">اولویت</Th>
                  <Th k="totalMeterage">متراژ</Th>
                  <Th k="totalQuantity">تعداد</Th>
                  <Th k="totalPrice">قیمت</Th>
                  <Th k="salesRep">کارشناس</Th>
                  <th className="p-3">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, index) => (
                  <tr
                    key={item.id}
                    className="border-b border-amber-100 hover:bg-amber-50/50"
                  >
                    <td className="p-3 text-center font-bold sticky right-0 bg-white z-10">
                      {index + 1}
                    </td>
                    <td className="p-3 font-bold whitespace-nowrap sticky right-12 bg-white z-10">
                      {item.customer?.name || "—"}
                    </td>
                    <td className="p-3 text-center font-semibold">
                      {item.orderNumber}
                    </td>
                    <td className="p-3 text-center">
                      {item.customerOrderNumber || "—"}
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      {formatDate(item.createdAt)}
                    </td>
                    <td className="p-3 text-center whitespace-nowrap font-bold text-amber-800">
                      {formatDate(item.cancelledAt)}
                    </td>
                    <td className="p-3 text-center font-semibold">
                      {item.cancelledBy || "—"}
                    </td>
                    <td
                      className="p-3 max-w-[220px] truncate"
                      title={item.cancelReason || ""}
                    >
                      {item.cancelReason || "—"}
                    </td>
                    <td className="p-3 text-center">{item.priority || "عادی"}</td>
                    <td className="p-3 text-center">
                      {item.totalMeterage?.toFixed(4) || "0"}
                    </td>
                    <td className="p-3 text-center">{item.totalQuantity || 0}</td>
                    <td className="p-3 text-left font-bold whitespace-nowrap">
                      {formatPrice(getTotalPrice(item))}
                    </td>
                    <td className="p-3 text-center text-xs">
                      {item.salesRep || "—"}
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <div className="flex flex-wrap gap-1 justify-center">
                        <button
                          type="button"
                          onClick={() => setDetail(item)}
                          className="rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1 text-xs font-bold"
                        >
                          مشاهده
                        </button>
                        <button
                          type="button"
                          onClick={() => setRestoreItem(item)}
                          className="rounded-lg bg-teal-600 hover:bg-teal-700 text-white px-2.5 py-1 text-xs font-bold"
                        >
                          بازگردانی
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && filtered.length === 0 && (
            <p className="text-center py-12 font-bold text-blue-800">
              موردی یافت نشد
            </p>
          )}
        </div>

        {/* جمع پایین مثل پیش‌فاکتورها */}
        {!loading && filtered.length > 0 && (
          <div className="mt-4 rounded-2xl bg-white/90 border border-amber-200 p-4 shadow">
            <h3 className="text-lg font-bold text-blue-950 mb-3 text-center">
              گزارش خلاصه (فیلتر فعلی)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-center">
                <p className="text-sm text-blue-700 mb-1">تعداد کل</p>
                <p className="text-xl font-bold text-amber-800">
                  {report.totalCount}
                </p>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-center">
                <p className="text-sm text-blue-700 mb-1">متراژ کل</p>
                <p className="text-xl font-bold text-amber-800">
                  {report.totalMeterage.toFixed(4)}
                </p>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-center">
                <p className="text-sm text-blue-700 mb-1">تعداد اقلام</p>
                <p className="text-xl font-bold text-amber-800">
                  {report.totalQuantity}
                </p>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-center">
                <p className="text-sm text-blue-700 mb-1">قیمت کل</p>
                <p className="text-xl font-bold text-amber-800">
                  {formatPrice(report.totalPrice)}
                </p>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-center">
                <p className="text-sm text-blue-700 mb-1">مجموع تخفیف</p>
                <p className="text-xl font-bold text-orange-600">
                  {formatPrice(report.totalDiscount)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* جزئیات */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-amber-300">
            <h3 className="text-xl font-black text-blue-950 mb-3">
              جزئیات لغو
            </h3>
            <div className="space-y-2 text-blue-900">
              <p>
                شماره سفارش: <strong>{detail.orderNumber}</strong>
              </p>
              <p>
                مشتری: <strong>{detail.customer?.name}</strong>
              </p>
              <p>
                تاریخ پیش‌فاکتور:{" "}
                <strong>{formatDate(detail.createdAt)}</strong>
              </p>
              <p>
                تاریخ لغو:{" "}
                <strong className="text-amber-800">
                  {formatDate(detail.cancelledAt)}
                </strong>
              </p>
              <p>
                لغو توسط: <strong>{detail.cancelledBy || "—"}</strong>
              </p>
              <p>
                کارشناس ثبت: <strong>{detail.salesRep || "—"}</strong>
              </p>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 mt-2">
                <p className="text-sm font-bold mb-1">دلیل لغو</p>
                <p className="font-semibold whitespace-pre-wrap">
                  {detail.cancelReason || "—"}
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-xl border px-5 py-2 font-bold"
              >
                بستن
              </button>
              <button
                type="button"
                onClick={() => {
                  setRestoreItem(detail)
                }}
                className="rounded-xl bg-teal-600 text-white px-5 py-2 font-bold"
              >
                بازگردانی به پیش‌فاکتور
              </button>
            </div>
          </div>
        </div>
      )}

      {/* تأیید بازگردانی */}
      {restoreItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-teal-300">
            <h3 className="text-xl font-black text-blue-950 mb-3">
              بازگردانی به پیش‌فاکتورها
            </h3>
            <div className="space-y-2 text-blue-900 mb-4">
              <p>
                سفارش{" "}
                <strong className="text-teal-700">
                  {restoreItem.orderNumber}
                </strong>
              </p>
              <p>
                مشتری:{" "}
                <strong className="text-teal-700">
                  {restoreItem.customer?.name}
                </strong>
              </p>
              <p className="text-sm text-gray-600 mt-2">
                وضعیت از «لغو شده» به «پیش‌فاکتور» برمی‌گردد و دوباره در لیست
                پیش‌فاکتورها دیده می‌شود.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                disabled={restoring}
                onClick={() => setRestoreItem(null)}
                className="rounded-xl border px-5 py-2.5 font-bold disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={restoring}
                onClick={confirmRestore}
                className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 font-bold disabled:opacity-50"
              >
                {restoring ? "در حال بازگردانی..." : "تأیید بازگردانی"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}