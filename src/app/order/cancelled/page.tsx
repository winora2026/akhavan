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

export default function CancelledPreInvoicesPage() {
  const [orders, setOrders] = useState<OrderFromApi[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [fromDate, setFromDate] = useState<any>(null)
  const [toDate, setToDate] = useState<any>(null)
  const [detail, setDetail] = useState<OrderFromApi | null>(null)

  useEffect(() => {
    ;(async () => {
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
    })()
  }, [])

  const filtered = useMemo(() => {
    let result = orders.filter((o) => o.status === "لغو شده")

    const q = search.trim().toLowerCase()
    if (q) {
      result = result.filter(
        (item) =>
          item.customer?.name?.toLowerCase().includes(q) ||
          item.orderNumber?.toLowerCase().includes(q) ||
          (item.cancelledBy || "").toLowerCase().includes(q) ||
          (item.cancelReason || "").toLowerCase().includes(q) ||
          (item.salesRep || "").toLowerCase().includes(q)
      )
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

    result.sort((a, b) => {
      const da = parseOrderDate(a.cancelledAt)?.getTime() || 0
      const db = parseOrderDate(b.cancelledAt)?.getTime() || 0
      return db - da
    })

    return result
  }, [orders, search, fromDate, toDate])

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
              پیش‌فاکتورهایی که برای همیشه لغو شده‌اند — با دلیل، کاربر و تاریخ
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

        <div className="rounded-2xl border border-amber-300/50 bg-amber-50/40 p-3 mb-3 grid grid-cols-1 md:grid-cols-6 gap-2">
          <div className="md:col-span-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجو: مشتری، شماره، دلیل، لغو‌کننده..."
              className="w-full rounded-xl border border-amber-300 px-3 py-2 font-semibold"
            />
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
        </div>

        <div className="rounded-2xl border border-amber-200 overflow-auto bg-white/95">
          {loading ? (
            <p className="text-center py-16 font-bold text-blue-800">
              در حال بارگذاری...
            </p>
          ) : (
            <table className="w-full text-sm text-blue-900 border-collapse">
              <thead className="bg-amber-700 text-white sticky top-0">
                <tr className="text-right">
                  <th className="p-3">ردیف</th>
                  <th className="p-3">نام مشتری</th>
                  <th className="p-3">ش سفارش</th>
                  <th className="p-3">ش سفارش مشتری</th>
                  <th className="p-3">تاریخ پیش‌فاکتور</th>
                  <th className="p-3">تاریخ لغو</th>
                  <th className="p-3">لغو توسط</th>
                  <th className="p-3">دلیل لغو</th>
                  <th className="p-3">اولویت</th>
                  <th className="p-3">متراژ</th>
                  <th className="p-3">تعداد</th>
                  <th className="p-3">قیمت</th>
                  <th className="p-3">کارشناس</th>
                  <th className="p-3">جزئیات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, index) => (
                  <tr
                    key={item.id}
                    className="border-b border-amber-100 hover:bg-amber-50/50"
                  >
                    <td className="p-3 text-center font-bold">{index + 1}</td>
                    <td className="p-3 font-bold whitespace-nowrap">
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
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => setDetail(item)}
                        className="rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 text-xs font-bold"
                      >
                        مشاهده
                      </button>
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
      </div>

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
                تاریخ پیش‌فاکتور: <strong>{formatDate(detail.createdAt)}</strong>
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
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-xl bg-blue-900 text-white px-5 py-2 font-bold"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}