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

export default function InvoicesPage() {
  const [orders, setOrders] = useState<OrderFromApi[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [fromDate, setFromDate] = useState<any>(null)
  const [toDate, setToDate] = useState<any>(null)
  const [selectedMonth, setSelectedMonth] = useState("همه")
  const [selectedExpert, setSelectedExpert] = useState("همه کارشناسان")
  const [revertItem, setRevertItem] = useState<OrderFromApi | null>(null)
  const [reverting, setReverting] = useState(false)

  useEffect(() => {
    fetchOrders()
  }, [])

  const fetchOrders = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/orders")
      if (!res.ok) throw new Error("خطا")
      const data = await res.json()
      setOrders(
        (Array.isArray(data) ? data : []).filter(
          (o: OrderFromApi) => o.status === "فاکتور"
        )
      )
    } catch {
      alert("خطا در بارگذاری لیست فاکتورها")
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
    return {
      totalCount: filtered.length,
      totalMeterage: filtered.reduce(
        (s, o) => s + (o.totalMeterage || 0),
        0
      ),
      totalPrice: filtered.reduce(
        (s, o) =>
          s + (o.items?.reduce((a, i) => a + (i.totalPrice || 0), 0) || 0),
        0
      ),
      totalDiscount: filtered.reduce(
        (s, o) => s + (o.discountAmount || 0),
        0
      ),
    }
  }, [filtered])

  const formatPrice = (n: number) =>
    n || n === 0 ? n.toLocaleString("en-US") : "—"

  const getTotalPrice = (order: OrderFromApi) =>
    order.items?.reduce((sum, item) => sum + (item.totalPrice || 0), 0) || 0

  const confirmRevert = async () => {
    if (!revertItem) return
    try {
      setReverting(true)
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: revertItem.id,
          status: "پیش‌فاکتور",
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا در برگشت")
      setOrders((prev) => prev.filter((o) => o.id !== revertItem.id))
      setRevertItem(null)
      alert("فاکتور به پیش‌فاکتور برگشت و از صف تولید حذف شد")
    } catch (e: any) {
      alert(e.message || "خطا")
    } finally {
      setReverting(false)
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
        href="#invoice-table"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:right-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:font-bold focus:text-teal-800"
      >
        رفتن به جدول فاکتورها
      </a>
      <div className="pointer-events-none fixed inset-0 bg-black/5" />

      <div className="relative z-10 max-w-[1920px] mx-auto">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-teal-500/10 p-5 border border-teal-500/20">
          <div className="text-center flex-1">
            <h1 className="text-3xl font-bold text-blue-950">لیست فاکتورها</h1>
            <p className="text-lg font-bold text-blue-900 mt-1">
              نرم‌افزار اخوان | شیشه و آینه
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/order/new"
              className="rounded-xl bg-teal-500 hover:bg-teal-600 px-6 py-3 text-lg font-bold text-white focus:ring-2 focus:ring-teal-400"
            >
              + ثبت سفارش جدید
            </Link>
            <Link
              href="/order"
              className="rounded-xl border border-teal-500/40 bg-white/40 px-6 py-3 text-lg font-bold text-blue-900 focus:ring-2 focus:ring-teal-400"
            >
              پیش‌فاکتورها
            </Link>
          </div>
        </div>

        <div className="mb-4 rounded-2xl bg-teal-500/10 p-4 border border-teal-500/20">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-3">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                جستجو
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="نام مشتری / شماره / کارشناس..."
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 font-semibold focus:ring-2 focus:ring-teal-400 focus:outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                ماه سفارش
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 font-semibold focus:ring-2 focus:ring-teal-400 focus:outline-none"
              >
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {m === "همه" ? "همه ماه‌ها" : m}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                از تاریخ
              </label>
              <DatePicker
                value={fromDate}
                onChange={setFromDate}
                calendar={persian}
                locale={persian_fa}
                inputClass="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 font-semibold"
                containerClassName="w-full"
                placeholder="از تاریخ"
                portal
                zIndex={1000}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                تا تاریخ
              </label>
              <DatePicker
                value={toDate}
                onChange={setToDate}
                calendar={persian}
                locale={persian_fa}
                inputClass="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 font-semibold"
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
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 font-semibold focus:ring-2 focus:ring-teal-400 focus:outline-none"
              >
                {salesExperts.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-1">
              <div className="rounded-xl bg-teal-500/20 border border-teal-500/30 px-3 py-2.5 text-center font-bold text-teal-800">
                {filtered.length}
              </div>
            </div>
          </div>
        </div>

        <div
          id="invoice-table"
          tabIndex={-1}
          className="rounded-2xl bg-teal-500/10 p-4 border border-teal-500/20 overflow-x-auto focus:ring-2 focus:ring-teal-400"
        >
          {loading ? (
            <p className="text-center py-16 font-bold text-blue-700">
              در حال بارگذاری...
            </p>
          ) : (
            <table className="w-full text-sm text-blue-900">
              <thead>
                <tr className="border-b border-teal-500/30 bg-teal-500/15">
                  <th className="p-3 text-center">ردیف</th>
                  <th className="p-3">نام مشتری</th>
                  <th className="p-3 text-center">ش سفارش</th>
                  <th className="p-3 text-center">ش سفارش مشتری</th>
                  <th className="p-3 text-center">تاریخ سفارش</th>
                  <th className="p-3 text-center">تاریخ تحویل</th>
                  <th className="p-3 text-center">اولویت</th>
                  <th className="p-3 text-center">متراژ</th>
                  <th className="p-3 text-center">تعداد</th>
                  <th className="p-3 text-left">قیمت کل</th>
                  <th className="p-3 text-left">تخفیف</th>
                  <th className="p-3 text-center">نصب</th>
                  <th className="p-3 text-center">کارشناس</th>
                  <th className="p-3 text-center">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, index) => (
                  <tr
                    key={item.id}
                    className="border-b border-teal-500/10 bg-white/30 hover:bg-teal-400/20"
                  >
                    <td className="p-3 text-center font-bold">{index + 1}</td>
                    <td className="p-3 font-bold">
                      {item.customer?.name || "—"}
                    </td>
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
                    <td className="p-3 text-center">
                      {item.priority || "عادی"}
                    </td>
                    <td className="p-3 text-center">
                      {item.totalMeterage?.toFixed(4) || "0"}
                    </td>
                    <td className="p-3 text-center">
                      {item.totalQuantity || 0}
                    </td>
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
                      <div className="flex flex-col gap-1 items-center">
                        <Link
                          href={`/order/new?edit=${item.id}`}
                          className="rounded-lg bg-blue-500/20 px-3 py-1.5 text-xs font-bold text-blue-900 focus:ring-2 focus:ring-blue-400"
                        >
                          ویرایش
                        </Link>
                        <button
                          onClick={() => setRevertItem(item)}
                          className="rounded-lg bg-amber-500/20 hover:bg-amber-500/40 px-3 py-1.5 text-xs font-bold text-amber-900 focus:ring-2 focus:ring-amber-400"
                        >
                          برگشت به پیش‌فاکتور
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && filtered.length === 0 && (
            <p className="text-center py-12 font-bold text-blue-700">
              موردی یافت نشد
            </p>
          )}
        </div>

        {!loading && filtered.length > 0 && (
          <div className="mt-4 rounded-2xl bg-teal-600/10 p-5 border border-teal-500/30">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="rounded-xl bg-white/50 p-4">
                <p className="text-sm text-blue-700">تعداد</p>
                <p className="text-2xl font-bold text-teal-700">
                  {report.totalCount}
                </p>
              </div>
              <div className="rounded-xl bg-white/50 p-4">
                <p className="text-sm text-blue-700">متراژ</p>
                <p className="text-2xl font-bold text-teal-700">
                  {report.totalMeterage.toFixed(4)}
                </p>
              </div>
              <div className="rounded-xl bg-white/50 p-4">
                <p className="text-sm text-blue-700">قیمت کل</p>
                <p className="text-2xl font-bold text-teal-700">
                  {formatPrice(report.totalPrice)}
                </p>
              </div>
              <div className="rounded-xl bg-white/50 p-4">
                <p className="text-sm text-blue-700">تخفیف</p>
                <p className="text-2xl font-bold text-orange-600">
                  {formatPrice(report.totalDiscount)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {revertItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-blue-950 mb-3">
              برگشت به پیش‌فاکتور
            </h3>
            <p className="mb-2">
              فاکتور <strong>{revertItem.orderNumber}</strong>
            </p>
            <p className="text-sm text-gray-600 mb-4">
              فقط اگر هنوز وارد ایستگاه برش نشده باشد، سفارش تولید حذف و وضعیت
              به پیش‌فاکتور برمی‌گردد.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setRevertItem(null)}
                className="rounded-xl border px-5 py-2.5 font-bold"
              >
                انصراف
              </button>
              <button
                onClick={confirmRevert}
                disabled={reverting}
                className="rounded-xl bg-amber-500 text-white px-5 py-2.5 font-bold disabled:opacity-50"
              >
                {reverting ? "..." : "تأیید برگشت"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}