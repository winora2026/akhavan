"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import DatePicker, { DateObject } from "react-multi-date-picker"
import persian from "react-date-object/calendars/persian"
import persian_fa from "react-date-object/locales/persian_fa"

type Row = {
  id: string
  type: "order" | "ready"
  typeLabel: string
  customerName: string
  mobile: string | null
  orderNumber: string
  sentAt: string | null
  status: "SENT" | "FAILED" | "SENDING"
  statusLabel: string
  text: string
  note: string | null
}

type Summary = {
  total: number
  sent: number
  failed: number
  order: number
  ready: number
  truncated: boolean
}

const formatDateTime = (iso: string | null) => {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("fa-IR")
  } catch {
    return "—"
  }
}

const todayPersian = () => new DateObject({ calendar: persian, locale: persian_fa })

export default function SmsReportPage() {
  const [fromDate, setFromDate] = useState<any>(todayPersian())
  const [toDate, setToDate] = useState<any>(todayPersian())
  const [type, setType] = useState("all")
  const [status, setStatus] = useState("all")
  const [rows, setRows] = useState<Row[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)

  const search = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (fromDate?.toDate) {
        const d: Date = fromDate.toDate()
        d.setHours(0, 0, 0, 0)
        params.set("from", d.toISOString())
      }
      if (toDate?.toDate) {
        const d: Date = toDate.toDate()
        d.setHours(23, 59, 59, 999)
        params.set("to", d.toISOString())
      }
      params.set("type", type)
      params.set("status", status)

      const res = await fetch(`/api/sms/report?${params.toString()}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "خطا در دریافت گزارش")
      setRows(Array.isArray(data.rows) ? data.rows : [])
      setSummary(data.summary || null)
    } catch (e: any) {
      console.error(e)
      alert(e?.message || "خطا در دریافت گزارش")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    search()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const exportCsv = () => {
    if (!rows.length) {
      alert("ردیفی برای خروجی نیست")
      return
    }
    const header = ["ردیف", "مشتری", "موبایل", "نوع پیام", "شماره سفارش", "تاریخ ارسال", "وضعیت ارسال", "پیام", "توضیح"]
    const data = rows.map((r, i) => [
      i + 1,
      r.customerName,
      r.mobile || "",
      r.typeLabel,
      r.orderNumber,
      formatDateTime(r.sentAt),
      r.statusLabel,
      r.text,
      r.note || "",
    ])
    const csv =
      "\uFEFF" +
      [header, ...data]
        .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
        .join("\n")
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }))
    a.download = `sms-report-${Date.now()}.csv`
    a.click()
  }

  const inputCls =
    "w-full rounded-xl border border-teal-500/30 bg-white px-3 py-2.5 text-sm font-semibold text-blue-950 focus:border-teal-500 focus:outline-none"

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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/90 p-4 shadow-md border border-teal-300">
          <div>
            <h1 className="text-2xl font-bold text-blue-950">گزارش پیامک‌ها</h1>
            <p className="mt-1 text-sm text-blue-800">
              پیام‌هایی که برای مشتریان ارسال شده: «ثبت سفارش» و «آماده تحویل»
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/production/ready-sms"
              className="rounded-xl border border-teal-500/40 bg-white px-4 py-2 text-sm font-bold text-blue-900"
            >
              ارسال دستی «آماده تحویل»
            </Link>
            <Link
              href="/invoices"
              className="rounded-xl border border-teal-500/40 bg-white px-4 py-2 text-sm font-bold text-blue-900"
            >
              فاکتورها
            </Link>
            <Link
              href="/"
              className="rounded-xl border border-teal-500/40 bg-white px-4 py-2 text-sm font-bold text-blue-900"
            >
              بازگشت
            </Link>
          </div>
        </div>

        <div className="mb-4 rounded-2xl bg-white/90 p-4 shadow-md border border-teal-300">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-2 relative z-30">
              <label className="mb-1 block text-sm font-bold text-blue-900">از تاریخ</label>
              <DatePicker
                value={fromDate}
                onChange={setFromDate}
                calendar={persian}
                locale={persian_fa}
                calendarPosition="bottom-right"
                inputClass={inputCls}
                containerClassName="w-full"
                placeholder="از تاریخ"
                portal
                zIndex={1000}
              />
            </div>
            <div className="md:col-span-2 relative z-30">
              <label className="mb-1 block text-sm font-bold text-blue-900">تا تاریخ</label>
              <DatePicker
                value={toDate}
                onChange={setToDate}
                calendar={persian}
                locale={persian_fa}
                calendarPosition="bottom-right"
                inputClass={inputCls}
                containerClassName="w-full"
                placeholder="تا تاریخ"
                portal
                zIndex={1000}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-bold text-blue-900">وضعیت</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
                <option value="all">همه وضعیت‌ها</option>
                <option value="SENT">ارسال‌شده</option>
                <option value="FAILED">ناموفق</option>
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="mb-1 block text-sm font-bold text-blue-900">نوع پیام</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
                <option value="all">همه پیام‌ها</option>
                <option value="order">پیام ثبت سفارش</option>
                <option value="ready">پیام آماده تحویل</option>
              </select>
            </div>
            <div className="md:col-span-3 flex gap-2">
              <button
                type="button"
                onClick={search}
                disabled={loading}
                className="flex-1 rounded-xl bg-teal-500 hover:bg-teal-600 disabled:opacity-50 px-4 py-2.5 text-sm font-bold text-white"
              >
                {loading ? "..." : "جستجو"}
              </button>
              <button
                type="button"
                onClick={exportCsv}
                className="flex-1 rounded-xl border border-teal-600 bg-white px-4 py-2.5 text-sm font-bold text-teal-800 hover:bg-teal-50"
              >
                خروجی اکسل
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-auto rounded-2xl bg-white shadow-md p-4 border border-teal-300">
          {loading ? (
            <p className="py-16 text-center font-bold text-blue-800">در حال بارگذاری...</p>
          ) : rows.length === 0 ? (
            <p className="py-16 text-center font-bold text-blue-800">پیامی در این بازه پیدا نشد</p>
          ) : (
            <table className="w-full border-collapse border border-gray-400 text-sm">
              <thead>
                <tr className="bg-teal-100">
                  <th className="border border-gray-400 p-2">ردیف</th>
                  <th className="border border-gray-400 p-2">مشتری</th>
                  <th className="border border-gray-400 p-2">موبایل</th>
                  <th className="border border-gray-400 p-2">نوع پیام</th>
                  <th className="border border-gray-400 p-2">ش سفارش</th>
                  <th className="border border-gray-400 p-2">تاریخ ارسال</th>
                  <th className="border border-gray-400 p-2">وضعیت ارسال</th>
                  <th className="border border-gray-400 p-2">پیام</th>
                  <th className="border border-gray-400 p-2">توضیح</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="border border-gray-400 bg-white hover:bg-yellow-50">
                    <td className="border border-gray-400 p-2 text-center font-bold">{i + 1}</td>
                    <td className="border border-gray-400 p-2 font-bold">{r.customerName}</td>
                    <td className="border border-gray-400 p-2 text-center font-mono text-xs" dir="ltr">
                      {r.mobile || <span className="font-sans font-bold text-red-700">ثبت نشده</span>}
                    </td>
                    <td className="border border-gray-400 p-2 text-center">
                      <span
                        className={`inline-block rounded-lg px-2 py-1 text-xs font-bold ${
                          r.type === "order" ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800"
                        }`}
                      >
                        {r.typeLabel}
                      </span>
                    </td>
                    <td className="border border-gray-400 p-2 text-center font-bold text-teal-800">
                      {r.orderNumber}
                    </td>
                    <td className="border border-gray-400 p-2 text-center text-xs whitespace-nowrap">
                      {formatDateTime(r.sentAt)}
                    </td>
                    <td className="border border-gray-400 p-2 text-center">
                      <span
                        className={`inline-block rounded-lg px-2 py-1 text-xs font-bold ${
                          r.status === "SENT"
                            ? "bg-green-100 text-green-800"
                            : r.status === "FAILED"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {r.statusLabel}
                      </span>
                    </td>
                    <td className="border border-gray-400 p-2 text-xs max-w-[420px] leading-6">{r.text}</td>
                    <td className="border border-gray-400 p-2 text-xs">{r.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-3 rounded-2xl bg-white/90 p-3 shadow-md border border-teal-300">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm font-bold text-blue-900">
            <span>
              تعداد کل: <span className="text-teal-700">{summary?.total ?? 0}</span>
            </span>
            <span>
              ارسال‌شده: <span className="text-green-700">{summary?.sent ?? 0}</span>
            </span>
            <span>
              ناموفق: <span className="text-red-700">{summary?.failed ?? 0}</span>
            </span>
            <span>
              ثبت سفارش: <span className="text-blue-700">{summary?.order ?? 0}</span>
            </span>
            <span>
              آماده تحویل: <span className="text-purple-700">{summary?.ready ?? 0}</span>
            </span>
          </div>
          {summary?.truncated && (
            <p className="mt-1 text-xs font-bold text-amber-700">
              فقط ۸۰۰ مورد آخر نمایش داده شده؛ بازهٔ تاریخ را کوتاه‌تر کنید.
            </p>
          )}
          <p className="mt-2 text-xs text-blue-700">
            شماره‌ی موبایل از اطلاعات فعلی مشتری و متن پیام از روی قالب ساخته می‌شود. برای «ثبت سفارش» فقط
            آخرین ارسال هر فاکتور نگه داشته می‌شود. هزینه و تاریخ دریافت پیام در پنل sms.ir قابل مشاهده است.
          </p>
        </div>
      </div>
    </div>
  )
}
