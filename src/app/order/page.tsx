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

export default function PreInvoicesPage() {
  const [orders, setOrders] = useState<OrderFromApi[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [fromDate, setFromDate] = useState<any>(null)
  const [toDate, setToDate] = useState<any>(null)
  const [confirmItem, setConfirmItem] = useState<OrderFromApi | null>(null)
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
      const preInvoices = (Array.isArray(data) ? data : []).filter(
        (o: OrderFromApi) => o.status === "پیش‌فاکتور" || o.status === "ثبت‌شده"
      )
      setOrders(preInvoices)
    } catch (error) {
      console.error(error)
      alert("خطا در بارگذاری لیست پیش‌فاکتورها")
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    let result = orders

    const q = search.trim().toLowerCase()
    if (q) {
      result = result.filter((item) => {
        return (
          item.customer?.name?.toLowerCase().includes(q) ||
          item.orderNumber?.toLowerCase().includes(q) ||
          (item.customerOrderNumber || "").toLowerCase().includes(q)
        )
      })
    }

    // فیلتر تاریخ (اصلاح‌شده)
    if (fromDate) {
      const from = fromDate?.toDate ? fromDate.toDate() : new Date(fromDate)
      from.setHours(0, 0, 0, 0)
      result = result.filter((item) => {
        const d = new Date(item.orderDate)
        d.setHours(0, 0, 0, 0)
        return d >= from
      })
    }
    if (toDate) {
      const to = toDate?.toDate ? toDate.toDate() : new Date(toDate)
      to.setHours(23, 59, 59, 999)
      result = result.filter((item) => {
        const d = new Date(item.orderDate)
        return d <= to
      })
    }

    return result
  }, [orders, search, fromDate, toDate])

  // ========== گزارش پایین صفحه ==========
  const report = useMemo(() => {
    const totalCount = filtered.length
    const totalMeterage = filtered.reduce((sum, o) => sum + (o.totalMeterage || 0), 0)
    const totalPrice = filtered.reduce(
      (sum, o) => sum + (o.items?.reduce((s, i) => s + (i.totalPrice || 0), 0) || 0),
      0
    )
    const totalDiscount = 0 // فعلاً فیلد تخفیف نداریم
    return { totalCount, totalMeterage, totalPrice, totalDiscount }
  }, [filtered])

  const formatPrice = (n: number) => {
    if (!n && n !== 0) return "—"
    return n.toLocaleString("en-US")
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—"
    try {
      // اگر به صورت رشته شمسی ذخیره شده
      if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(dateStr)) {
        return dateStr
      }
      const d = new Date(dateStr)
      if (isNaN(d.getTime())) return dateStr

      // نمایش با تقویم شمسی
      return d.toLocaleDateString("fa-IR-u-ca-persian", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
      })
    } catch {
      return dateStr
    }
  }

  const getTotalPrice = (order: OrderFromApi) => {
    return order.items?.reduce((sum, item) => sum + (item.totalPrice || 0), 0) || 0
  }

  const handleSendToInvoice = (item: OrderFromApi) => {
    setConfirmItem(item)
  }

  const confirmSend = async () => {
    if (!confirmItem) return
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: confirmItem.id,
          status: "فاکتور",
          convertedBy: selectedExpert === "همه کارشناسان" ? "خانم حسینی" : selectedExpert,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "خطا در انتقال")
      }
      setOrders((prev) => prev.filter((i) => i.id !== confirmItem.id))
      setConfirmItem(null)
      alert("پیش‌فاکتور با موفقیت به لیست فاکتورها منتقل شد")
    } catch (error: any) {
      console.error(error)
      alert(error.message || "خطا در انتقال به فاکتور")
    }
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
        {/* هدر - عنوان وسط‌چین */}
        <div className="mb-4 flex items-center justify-between rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/20">
          <div className="w-48" /> {/* فاصله سمت راست برای تعادل */}
          <div className="text-center flex-1">
            <h1 className="text-3xl font-bold text-blue-950">لیست پیش‌فاکتورها</h1>
            <p className="text-lg font-bold text-blue-900 mt-1">نرم‌افزار اخوان | شیشه و آینه</p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/orders/new"
              className="rounded-xl bg-teal-500 hover:bg-teal-600 px-6 py-3 text-lg font-bold text-white shadow transition"
            >
              + ثبت سفارش جدید
            </Link>
            <Link
              href="/invoices"
              className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-6 py-3 text-lg font-bold text-blue-900 transition"
            >
              فاکتورها
            </Link>
          </div>
        </div>

        {/* فیلترها */}
        <div className="mb-4 rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-4 shadow-lg border border-teal-500/20">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-4">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">جستجو</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="نام مشتری / شماره سفارش..."
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-base font-semibold text-blue-950 focus:border-teal-500 focus:outline-none hover:bg-yellow-100 transition"
              />
            </div>
            <div className="md:col-span-2 relative z-30">
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
                zIndex={1000}
              />
            </div>
            <div className="md:col-span-2 relative z-30">
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
                zIndex={1000}
              />
            </div>
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
            <div className="md:col-span-2">
              <div className="rounded-xl bg-teal-500/20 border border-teal-500/30 px-4 py-2.5 text-center">
                <span className="text-sm text-blue-700">تعداد: </span>
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
                  <th className="p-3 font-bold whitespace-nowrap text-center">ش سفارش مشتری</th>
                  <th className="p-3 font-bold whitespace-nowrap text-center">تاریخ سفارش</th>
                  <th className="p-3 font-bold whitespace-nowrap text-center">تاریخ تحویل</th>
                  <th className="p-3 font-bold whitespace-nowrap text-center">اولویت</th>
                  <th className="p-3 font-bold whitespace-nowrap text-center">متراژ کل</th>
                  <th className="p-3 font-bold whitespace-nowrap text-center">تعداد کل</th>
                  <th className="p-3 font-bold whitespace-nowrap text-left">قیمت کل</th>
                  <th className="p-3 font-bold whitespace-nowrap text-left">تخفیف</th>
                  <th className="p-3 font-bold whitespace-nowrap text-center">تاریخ نصب</th>
                  <th className="p-3 font-bold whitespace-nowrap text-center">کارشناس</th>
                  <th className="p-3 font-bold whitespace-nowrap text-center">ویرایش</th>
                  <th className="p-3 font-bold whitespace-nowrap text-center">عملیات</th>
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
                    <td className="p-3 whitespace-nowrap text-center">{formatDate(item.orderDate)}</td>
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
                    <td className="p-3 text-center text-xs font-semibold text-blue-800">
                      {selectedExpert === "همه کارشناسان" ? "—" : selectedExpert}
                    </td>
                    <td className="p-3 text-center">
                      <Link
                        href={`/orders/new?edit=${item.id}`}
                        className="inline-block rounded-lg bg-blue-500/20 hover:bg-blue-500/40 px-3 py-1.5 text-xs font-bold text-blue-900 transition"
                      >
                        ویرایش
                      </Link>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleSendToInvoice(item)}
                        className="rounded-lg bg-teal-500 hover:bg-teal-600 px-3 py-1.5 text-xs font-bold text-white shadow transition"
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
            <p className="text-center text-blue-700 py-12 text-xl font-bold">موردی یافت نشد</p>
          )}
        </div>

        {/* ========== گزارش مدیریتی ========== */}
        {!loading && filtered.length > 0 && (
          <div className="mt-4 rounded-2xl bg-teal-600/10 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/30">
            <h3 className="text-lg font-bold text-blue-950 mb-4 text-center">گزارش خلاصه</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-xl bg-white/50 border border-teal-500/20 p-4 text-center">
                <p className="text-sm text-blue-700 mb-1">تعداد کل</p>
                <p className="text-2xl font-bold text-teal-700">{report.totalCount}</p>
              </div>
              <div className="rounded-xl bg-white/50 border border-teal-500/20 p-4 text-center">
                <p className="text-sm text-blue-700 mb-1">متراژ کل</p>
                <p className="text-2xl font-bold text-teal-700">
                  {report.totalMeterage.toFixed(4)}
                </p>
              </div>
              <div className="rounded-xl bg-white/50 border border-teal-500/20 p-4 text-center">
                <p className="text-sm text-blue-700 mb-1">قیمت کل</p>
                <p className="text-2xl font-bold text-teal-700">
                  {formatPrice(report.totalPrice)}
                </p>
              </div>
              <div className="rounded-xl bg-white/50 border border-teal-500/20 p-4 text-center">
                <p className="text-sm text-blue-700 mb-1">مجموع تخفیف</p>
                <p className="text-2xl font-bold text-orange-600">
                  {formatPrice(report.totalDiscount)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* پاپ‌آپ تأیید */}
      {confirmItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white/95 backdrop-blur-xl p-6 shadow-2xl border border-teal-500/30">
            <h3 className="text-xl font-bold text-blue-950 mb-3">تأیید ارسال به فاکتور</h3>
            <div className="space-y-2 text-base text-blue-900 mb-4">
              <p>
                پیش‌فاکتور شماره{" "}
                <strong className="text-teal-700">{confirmItem.orderNumber}</strong>
              </p>
              <p>
                مشتری: <strong className="text-teal-700">{confirmItem.customer?.name}</strong>
              </p>
              <p className="text-sm text-gray-600 mt-3">با تأیید:</p>
              <ul className="text-sm text-gray-700 list-disc list-inside space-y-1">
                <li>وضعیت به «فاکتور» تغییر می‌کند</li>
                <li>
                  کارشناس فروش:{" "}
                  <strong>
                    {selectedExpert === "همه کارشناسان" ? "خانم حسینی" : selectedExpert}
                  </strong>
                </li>
                <li>از لیست پیش‌فاکتورها حذف و به فاکتورها اضافه می‌شود</li>
              </ul>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmItem(null)}
                className="rounded-xl border border-gray-300 px-5 py-2.5 text-base font-bold text-blue-900 hover:bg-gray-100 transition"
              >
                انصراف
              </button>
              <button
                onClick={confirmSend}
                className="rounded-xl bg-teal-500 hover:bg-teal-600 px-5 py-2.5 text-base font-bold text-white shadow transition"
              >
                بله، منتقل کن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}