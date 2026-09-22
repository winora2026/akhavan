"use client"

import { useState, useEffect, useMemo } from "react"
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
  discountPercent: number | null
  salesRep?: string | null
  customer: {
    id: string
    name: string
    customerGroup: string | null
  }
  items: {
    id: string
    productName: string
    totalPrice: number
    meterage: number
  }[]
}

const DEFAULT_EXPERTS = [
  "خانم حسینی",
  "خانم قنبرنژاد",
  "مائده عباس زاده",
  "مجتبی خاجی",
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

const toFaMonthKey = (dateStr: string | null | undefined) => {
  const d = parseOrderDate(dateStr)
  if (!d) return ""
  try {
    return new DateObject({
      date: d,
      calendar: persian,
      locale: persian_fa,
    }).format("YYYY/MM")
  } catch {
    return ""
  }
}

export default function PreInvoicesPage() {
  const [orders, setOrders] = useState<OrderFromApi[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [fromDate, setFromDate] = useState<any>(null)
  const [toDate, setToDate] = useState<any>(null)
  const [selectedMonth, setSelectedMonth] = useState("همه")
  const [confirmItem, setConfirmItem] = useState<OrderFromApi | null>(null)
  const [selectedExpert, setSelectedExpert] = useState("همه کارشناسان")
  const [sending, setSending] = useState(false)

  useEffect(() => {
    fetchOrders()
  }, [])

  const fetchOrders = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/orders")
      if (!res.ok) throw new Error("خطا در دریافت سفارش‌ها")
      const data = await res.json()
      const preInvoices = (Array.isArray(data) ? data : []).filter(
        (o: OrderFromApi) =>
          o.status === "پیش‌فاکتور" || o.status === "ثبت‌شده"
      )
      setOrders(preInvoices)
    } catch (error) {
      console.error(error)
      alert("خطا در بارگذاری لیست پیش‌فاکتورها")
    } finally {
      setLoading(false)
    }
  }

  const salesExperts = useMemo(() => {
    const fromData = orders
      .map((o) => o.salesRep)
      .filter((n): n is string => Boolean(n && n.trim()))
    return [
      "همه کارشناسان",
      ...Array.from(new Set([...DEFAULT_EXPERTS, ...fromData])).sort(),
    ]
  }, [orders])

  const monthOptions = useMemo(() => {
    const keys = orders
      .map((o) => toFaMonthKey(o.orderDate))
      .filter(Boolean)
    return ["همه", ...Array.from(new Set(keys)).sort().reverse()]
  }, [orders])

  const filtered = useMemo(() => {
    let result = orders
    const q = search.trim().toLowerCase()
    if (q) {
      result = result.filter(
        (item) =>
          item.customer?.name?.toLowerCase().includes(q) ||
          item.orderNumber?.toLowerCase().includes(q) ||
          (item.customerOrderNumber || "").toLowerCase().includes(q) ||
          (item.salesRep || "").toLowerCase().includes(q)
      )
    }
    if (fromDate) {
      const from = fromDate?.toDate ? fromDate.toDate() : new Date(fromDate)
      from.setHours(0, 0, 0, 0)
      result = result.filter((item) => {
        const d = parseOrderDate(item.orderDate)
        if (!d) return false
        d.setHours(0, 0, 0, 0)
        return d >= from
      })
    }
    if (toDate) {
      const to = toDate?.toDate ? toDate.toDate() : new Date(toDate)
      to.setHours(23, 59, 59, 999)
      result = result.filter((item) => {
        const d = parseOrderDate(item.orderDate)
        if (!d) return false
        return d <= to
      })
    }
    if (selectedMonth !== "همه") {
      result = result.filter(
        (item) => toFaMonthKey(item.orderDate) === selectedMonth
      )
    }
    if (selectedExpert !== "همه کارشناسان") {
      result = result.filter((item) => item.salesRep === selectedExpert)
    }
    return result
  }, [orders, search, fromDate, toDate, selectedMonth, selectedExpert])

  const report = useMemo(() => {
    const totalCount = filtered.length
    const totalMeterage = filtered.reduce(
      (sum, o) => sum + (o.totalMeterage || 0),
      0
    )
    const totalPrice = filtered.reduce(
      (sum, o) =>
        sum + (o.items?.reduce((s, i) => s + (i.totalPrice || 0), 0) || 0),
      0
    )
    const totalDiscount = filtered.reduce(
      (sum, o) => sum + (o.discountAmount || 0),
      0
    )
    return { totalCount, totalMeterage, totalPrice, totalDiscount }
  }, [filtered])

  const formatPrice = (n: number) => {
    if (!n && n !== 0) return "—"
    return n.toLocaleString("en-US")
  }

  const getTotalPrice = (order: OrderFromApi) =>
    order.items?.reduce((sum, item) => sum + (item.totalPrice || 0), 0) || 0

  const confirmSend = async () => {
    if (!confirmItem) return
    try {
      setSending(true)
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: confirmItem.id,
          status: "فاکتور",
          convertedBy:
            selectedExpert === "همه کارشناسان"
              ? confirmItem.salesRep || "سیستم"
              : selectedExpert,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "خطا در انتقال")
      }
      setOrders((prev) => prev.filter((i) => i.id !== confirmItem.id))
      setConfirmItem(null)
      alert("پیش‌فاکتور به فاکتور منتقل شد و وارد تولید گردید")
    } catch (error: any) {
      console.error(error)
      alert(error.message || "خطا در انتقال به فاکتور")
    } finally {
      setSending(false)
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
      <a
        href="#order-table"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:right-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:font-bold focus:text-teal-800"
      >
        رفتن به جدول سفارش‌ها
      </a>
      <div className="pointer-events-none fixed inset-0 bg-black/5" />

      <div className="relative z-10 max-w-[1920px] mx-auto">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/20">
          <div className="text-center flex-1">
            <h1 className="text-3xl font-bold text-blue-950">لیست پیش‌فاکتورها</h1>
            <p className="text-lg font-bold text-blue-900 mt-1">
              نرم‌افزار اخوان | شیشه و آینه
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/order/new"
              className="rounded-xl bg-teal-500 hover:bg-teal-600 px-6 py-3 text-lg font-bold text-white shadow focus:outline-none focus:ring-2 focus:ring-teal-400"
            >
              + ثبت سفارش جدید
            </Link>
            <Link
              href="/invoices"
              className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-6 py-3 text-lg font-bold text-blue-900 focus:outline-none focus:ring-2 focus:ring-teal-400"
            >
              فاکتورها
            </Link>
          </div>
        </div>

        <div className="mb-4 rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-4 shadow-lg border border-teal-500/20">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-3">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                جستجو
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="نام مشتری / شماره سفارش / کارشناس..."
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-base font-semibold text-blue-950 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                ماه سفارش
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-base font-semibold text-blue-950 focus:ring-2 focus:ring-teal-400 focus:outline-none"
              >
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {m === "همه" ? "همه ماه‌ها" : m}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2 relative z-30">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                از تاریخ
              </label>
              <DatePicker
                value={fromDate}
                onChange={setFromDate}
                calendar={persian}
                locale={persian_fa}
                calendarPosition="bottom-right"
                inputClass="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-base font-semibold text-blue-950 focus:outline-none"
                containerClassName="w-full"
                placeholder="از تاریخ"
                portal
                zIndex={1000}
              />
            </div>
            <div className="md:col-span-2 relative z-30">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                تا تاریخ
              </label>
              <DatePicker
                value={toDate}
                onChange={setToDate}
                calendar={persian}
                locale={persian_fa}
                calendarPosition="bottom-right"
                inputClass="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-base font-semibold text-blue-950 focus:outline-none"
                containerClassName="w-full"
                placeholder="تا تاریخ"
                portal
                zIndex={1000}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                کارشناس فروش
              </label>
              <select
                value={selectedExpert}
                onChange={(e) => setSelectedExpert(e.target.value)}
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-base font-semibold text-blue-950 focus:ring-2 focus:ring-teal-400 focus:outline-none"
              >
                {salesExperts.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-1">
              <div className="rounded-xl bg-teal-500/20 border border-teal-500/30 px-3 py-2.5 text-center">
                <span className="text-sm text-blue-700">تعداد: </span>
                <span className="text-xl font-bold text-teal-700">
                  {filtered.length}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div
          id="order-table"
          tabIndex={-1}
          className="rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-4 shadow-lg border border-teal-500/20 overflow-x-auto focus:outline-none focus:ring-2 focus:ring-teal-400"
        >
          {loading ? (
            <p className="text-center text-blue-700 py-16 text-xl font-bold">
              در حال بارگذاری...
            </p>
          ) : (
            <table className="w-full text-sm text-blue-900 border-collapse">
              <thead>
                <tr className="border-b border-teal-500/30 bg-teal-500/15 text-right">
                  <th className="p-3 font-bold text-center">ردیف</th>
                  <th className="p-3 font-bold">نام مشتری</th>
                  <th className="p-3 font-bold text-center">ش سفارش</th>
                  <th className="p-3 font-bold text-center">ش سفارش مشتری</th>
                  <th className="p-3 font-bold text-center">تاریخ سفارش</th>
                  <th className="p-3 font-bold text-center">تاریخ تحویل</th>
                  <th className="p-3 font-bold text-center">اولویت</th>
                  <th className="p-3 font-bold text-center">متراژ کل</th>
                  <th className="p-3 font-bold text-center">تعداد کل</th>
                  <th className="p-3 font-bold text-left">قیمت کل</th>
                  <th className="p-3 font-bold text-left">تخفیف</th>
                  <th className="p-3 font-bold text-center">تاریخ نصب</th>
                  <th className="p-3 font-bold text-center">کارشناس</th>
                  <th className="p-3 font-bold text-center">ویرایش</th>
                  <th className="p-3 font-bold text-center">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, index) => (
                  <tr
                    key={item.id}
                    className="border-b border-teal-500/10 hover:bg-teal-400/20 bg-white/30"
                  >
                    <td className="p-3 text-center font-bold">{index + 1}</td>
                    <td className="p-3 font-bold">{item.customer?.name || "—"}</td>
                    <td className="p-3 text-center">{item.orderNumber}</td>
                    <td className="p-3 text-center">
                      {item.customerOrderNumber || "—"}
                    </td>
                    <td className="p-3 text-center">
                      {formatDate(item.orderDate)}
                    </td>
                    <td className="p-3 text-center">
                      {formatDate(item.deliveryDate)}
                    </td>
                    <td className="p-3 text-center">{item.priority || "عادی"}</td>
                    <td className="p-3 text-center">
                      {item.totalMeterage?.toFixed(4) || "0"}
                    </td>
                    <td className="p-3 text-center">{item.totalQuantity || 0}</td>
                    <td className="p-3 text-left font-bold text-teal-800">
                      {formatPrice(getTotalPrice(item))}
                    </td>
                    <td className="p-3 text-left text-orange-700">
                      {item.discountAmount
                        ? formatPrice(item.discountAmount)
                        : "—"}
                    </td>
                    <td className="p-3 text-center">
                      {item.installationDate
                        ? formatDate(item.installationDate)
                        : "—"}
                    </td>
                    <td className="p-3 text-center font-semibold">
                      {item.salesRep || "—"}
                    </td>
                    <td className="p-3 text-center">
                      <Link
                        href={`/order/new?edit=${item.id}`}
                        className="inline-block rounded-lg bg-blue-500/20 hover:bg-blue-500/40 px-3 py-1.5 text-xs font-bold text-blue-900 focus:ring-2 focus:ring-blue-400"
                      >
                        ویرایش
                      </Link>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => setConfirmItem(item)}
                        className="rounded-lg bg-teal-500 hover:bg-teal-600 px-3 py-1.5 text-xs font-bold text-white focus:ring-2 focus:ring-teal-300"
                      >
                        ارسال به فاکتور
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && filtered.length === 0 && (
            <p className="text-center text-blue-700 py-12 text-xl font-bold">
              موردی یافت نشد
            </p>
          )}
        </div>

        {!loading && filtered.length > 0 && (
          <div className="mt-4 rounded-2xl bg-teal-600/10 p-5 border border-teal-500/30">
            <h3 className="text-lg font-bold text-blue-950 mb-4 text-center">
              گزارش خلاصه
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-xl bg-white/50 p-4 text-center">
                <p className="text-sm text-blue-700">تعداد کل</p>
                <p className="text-2xl font-bold text-teal-700">
                  {report.totalCount}
                </p>
              </div>
              <div className="rounded-xl bg-white/50 p-4 text-center">
                <p className="text-sm text-blue-700">متراژ کل</p>
                <p className="text-2xl font-bold text-teal-700">
                  {report.totalMeterage.toFixed(4)}
                </p>
              </div>
              <div className="rounded-xl bg-white/50 p-4 text-center">
                <p className="text-sm text-blue-700">قیمت کل</p>
                <p className="text-2xl font-bold text-teal-700">
                  {formatPrice(report.totalPrice)}
                </p>
              </div>
              <div className="rounded-xl bg-white/50 p-4 text-center">
                <p className="text-sm text-blue-700">مجموع تخفیف</p>
                <p className="text-2xl font-bold text-orange-600">
                  {formatPrice(report.totalDiscount)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {confirmItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-blue-950 mb-3">
              تأیید ارسال به فاکتور و تولید
            </h3>
            <p className="mb-2">
              پیش‌فاکتور{" "}
              <strong>{confirmItem.orderNumber}</strong> —{" "}
              {confirmItem.customer?.name}
            </p>
            <p className="text-sm text-gray-600 mb-4">
              کارشناس: {confirmItem.salesRep || "—"}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmItem(null)}
                className="rounded-xl border px-5 py-2.5 font-bold focus:ring-2 focus:ring-gray-400"
              >
                انصراف
              </button>
              <button
                onClick={confirmSend}
                disabled={sending}
                className="rounded-xl bg-teal-500 text-white px-5 py-2.5 font-bold disabled:opacity-50 focus:ring-2 focus:ring-teal-300"
              >
                {sending ? "..." : "بله، منتقل کن"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}