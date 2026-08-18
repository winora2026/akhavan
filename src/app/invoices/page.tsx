"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import DatePicker from "react-multi-date-picker"
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

const salesExperts = ["همه کارشناسان", "خانم حسینی", "خانم قنبرنژاد", "خانم عباس‌زاده"]

export default function InvoicesPage() {
  const [orders, setOrders] = useState<OrderFromApi[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [fromDate, setFromDate] = useState<any>(null)
  const [toDate, setToDate] = useState<any>(null)
  const [selectedExpert, setSelectedExpert] = useState("همه کارشناسان")

  useEffect(() => {
    fetchOrders()
  }, [])

  const fetchOrders = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/orders")
      if (!res.ok) throw new Error("خطا در دریافت سفارش‌ها")
      const data = await res.json()

      // فقط فاکتورها
      const invoices = (Array.isArray(data) ? data : []).filter(
        (o: OrderFromApi) => o.status === "فاکتور"
      )
      setOrders(invoices)
    } catch (error) {
      console.error(error)
      alert("خطا در بارگذاری لیست فاکتورها")
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    let result = orders

    // جستجو
    const q = search.trim().toLowerCase()
    if (q) {
      result = result.filter((item) => {
        return (
          item.customer?.name?.toLowerCase().includes(q) ||
          item.orderNumber?.toLowerCase().includes(q) ||
          (item.customerOrderNumber || "").toLowerCase().includes(q) ||
          (item.notes || "").toLowerCase().includes(q)
        )
      })
    }

    // فیلتر کارشناس فروش
    if (selectedExpert !== "همه کارشناسان") {
      result = result.filter((item) =>
        (item.notes || "").includes(selectedExpert)
      )
    }

    // فیلتر تاریخ
    if (fromDate) {
      const from = new Date(fromDate)
      result = result.filter((item) => new Date(item.orderDate) >= from)
    }
    if (toDate) {
      const to = new Date(toDate)
      to.setHours(23, 59, 59, 999)
      result = result.filter((item) => new Date(item.orderDate) <= to)
    }

    return result
  }, [orders, search, selectedExpert, fromDate, toDate])

  const formatPrice = (n: number) => {
    if (!n && n !== 0) return "—"
    return n.toLocaleString("en-US")
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—"
    try {
      const d = new Date(dateStr)
      if (isNaN(d.getTime())) return dateStr
      return d.toLocaleDateString("fa-IR")
    } catch {
      return dateStr
    }
  }

  const getTotalPrice = (order: OrderFromApi) => {
    return order.items?.reduce((sum, item) => sum + (item.totalPrice || 0), 0) || 0
  }

  const getExpertName = (notes: string | null) => {
    if (!notes) return "—"
    for (const name of salesExperts) {
      if (name !== "همه کارشناسان" && notes.includes(name)) return name
    }
    return "—"
  }

  return (
    <div
      className="min-h-screen p-4 bg-cover bg-center bg-fixed"
      style={{
        backgroundImage: "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')",
        fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif",
      }}
      dir="rtl"
    >
      <link href="https://cdn.jsdelivr.net/npm/vazirmatn@33.003/Vazirmatn-font-face.css" rel="stylesheet" />
      <div className="pointer-events-none fixed inset-0 bg-black/5" />

      <div className="relative z-10 max-w-[1920px] mx-auto">
        {/* هدر */}
        <div className="mb-4 flex items-center justify-between rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/20">
          <div>
            <h1 className="text-3xl font-bold text-blue-950">لیست فاکتورها</h1>
            <p className="text-lg font-bold text-blue-900 mt-1">نرم‌افزار اخوان | شیشه و آینه</p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/order"
              className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-6 py-3 text-lg font-bold text-blue-900 transition"
            >
              پیش‌فاکتورها
            </Link>
            <Link
              href="/order/new"
              className="rounded-xl bg-teal-500 hover:bg-teal-600 px-6 py-3 text-lg font-bold text-white shadow transition"
            >
              + ثبت سفارش جدید
            </Link>
          </div>
        </div>

        {/* فیلترها */}
        <div className="mb-4 rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-4 shadow-lg border border-teal-500/20">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            {/* جستجو */}
            <div className="md:col-span-4">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">جستجو</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="نام مشتری / شماره سفارش / کارشناس..."
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-base font-semibold text-blue-950 focus:border-teal-500 focus:outline-none hover:bg-yellow-100 transition"
              />
            </div>

            {/* از تاریخ */}
            <div className="md:col-span-2 relative z-20">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">از تاریخ</label>
              <DatePicker
                value={fromDate}
                onChange={setFromDate}
                calendar={persian}
                locale={persian_fa}
                calendarPosition="bottom-right"
                inputClass="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-base font-semibold text-blue-950 focus:border-teal-500 focus:outline-none"
                containerClassName="w-full"
                placeholder="از تاریخ"
                portal
              />
            </div>

            {/* تا تاریخ */}
            <div className="md:col-span-2 relative z-20">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">تا تاریخ</label>
              <DatePicker
                value={toDate}
                onChange={setToDate}
                calendar={persian}
                locale={persian_fa}
                calendarPosition="bottom-right"
                inputClass="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-base font-semibold text-blue-950 focus:border-teal-500 focus:outline-none"
                containerClassName="w-full"
                placeholder="تا تاریخ"
                portal
              />
            </div>

            {/* کارشناس فروش */}
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">کارشناس فروش</label>
              <select
                value={selectedExpert}
                onChange={(e) => setSelectedExpert(e.target.value)}
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-base font-semibold text-blue-950 focus:border-teal-500 focus:outline-none"
              >
                {salesExperts.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {/* تعداد */}
            <div className="md:col-span-2">
              <div className="rounded-xl bg-teal-500/20 border border-teal-500/30 px-4 py-2.5 text-center">
                <span className="text-sm text-blue-700">تعداد فاکتور: </span>
                <span className="text-xl font-bold text-teal-700">{filtered.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* جدول */}
        <div className="rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-4 shadow-lg border border-teal-500/20 overflow-x-auto">
          {loading ? (
            <p className="text-center text-blue-700 py-16 text-xl font-bold">در حال بارگذاری...</p>
          ) : (
            <table className="w-full text-sm text-blue-900 border-collapse">
              <thead>
                <tr className="border-b border-teal-500/30 bg-teal-500/15 text-right">
                  <th className="p-3 font-bold whitespace-nowrap text-center">ردیف</th>
                  <th className="p-3 font-bold whitespace-nowrap">نام مشتری</th>
                  <th className="p-3 font-bold whitespace-nowrap text-center">ش سفارش</th>
                  <th className="p-3 font-bold whitespace-nowrap text-center">ش مشتری</th>
                  <th className="p-3 font-bold whitespace-nowrap text-center">تاریخ ثبت</th>
                  <th className="p-3 font-bold whitespace-nowrap text-center">تاریخ تحویل</th>
                  <th className="p-3 font-bold whitespace-nowrap text-center">اولویت</th>
                  <th className="p-3 font-bold whitespace-nowrap text-center">متراژ کل</th>
                  <th className="p-3 font-bold whitespace-nowrap text-center">تعداد کل</th>
                  <th className="p-3 font-bold whitespace-nowrap text-left">قیمت کل</th>
                  <th className="p-3 font-bold whitespace-nowrap text-left">تخفیف</th>
                  <th className="p-3 font-bold whitespace-nowrap text-center">تاریخ نصب</th>
                  <th className="p-3 font-bold whitespace-nowrap text-center">کارشناس فروش</th>
                  <th className="p-3 font-bold whitespace-nowrap text-center">ویرایش</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, index) => (
                  <tr
                    key={item.id}
                    className="border-b border-teal-500/10 transition-colors hover:bg-teal-400/20 bg-white/30"
                  >
                    <td className="p-3 text-center font-bold">{index + 1}</td>
                    <td className="p-3 font-bold whitespace-nowrap">{item.customer?.name || "—"}</td>
                    <td className="p-3 font-semibold text-center">{item.orderNumber}</td>
                    <td className="p-3 font-semibold text-center">{item.customerOrderNumber || "—"}</td>
                    <td className="p-3 whitespace-nowrap text-center font-semibold text-teal-800">
                      {formatDate(item.orderDate)}
                    </td>
                    <td className="p-3 whitespace-nowrap text-center">{formatDate(item.deliveryDate)}</td>
                    <td className="p-3 text-center">{item.priority || "عادی"}</td>
                    <td className="p-3 text-center font-semibold">
                      {item.totalMeterage?.toFixed(4) || "0"}
                    </td>
                    <td className="p-3 text-center font-semibold">{item.totalQuantity || 0}</td>
                    <td className="p-3 text-left font-bold text-teal-800 whitespace-nowrap">
                      {formatPrice(getTotalPrice(item))}
                    </td>
                    <td className="p-3 text-left font-semibold text-orange-700 whitespace-nowrap">—</td>
                    <td className="p-3 text-center whitespace-nowrap">
                      {item.hasInstallation ? formatDate(item.installationDate) : "—"}
                    </td>
                    <td className="p-3 text-center text-xs font-semibold text-blue-800 whitespace-nowrap">
                      {getExpertName(item.notes)}
                    </td>
                    <td className="p-3 text-center">
                      <Link
                        href={`/order/new?edit=${item.id}`}
                        className="inline-block rounded-lg bg-blue-500/20 hover:bg-blue-500/40 px-3 py-1.5 text-xs font-bold text-blue-900 transition"
                      >
                        ویرایش
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!loading && filtered.length === 0 && (
            <p className="text-center text-blue-700 py-12 text-xl font-bold">موردی یافت نشد</p>
          )}
        </div>
      </div>
    </div>
  )
}