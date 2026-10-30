"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

type Row = {
  productionOrderId: string
  orderNumber: string
  customerName: string
  itemCount: number
  readyAt: string | null
  warehousePending: number
  hasMobile: boolean
  mobileMasked: string | null
  sms: "none" | "sent" | "failed" | "sending"
  smsAt: string | null
  smsNote: string | null
}

type Filter = "all" | "none" | "sent" | "failed"

const formatDateTime = (iso: string | null) => {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("fa-IR")
  } catch {
    return "—"
  }
}

export default function ReadySmsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [autoEnabled, setAutoEnabled] = useState(false)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [sendingId, setSendingId] = useState<string | null>(null)

  const load = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const res = await fetch("/api/production/ready-sms")
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "خطا در دریافت لیست")
      setRows(Array.isArray(data.rows) ? data.rows : [])
      setAutoEnabled(!!data.autoEnabled)
    } catch (e: any) {
      console.error(e)
      if (!silent) alert(e?.message || "خطا در دریافت لیست")
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(() => load(true), 60_000)
    return () => clearInterval(t)
  }, [])

  const send = async (row: Row) => {
    const again = row.sms === "sent"
    const question = again
      ? `پیامک سفارش ${row.orderNumber} قبلاً ارسال شده.\nدوباره برای ${row.customerName} ارسال شود؟`
      : `پیامک «آماده تحویل» سفارش ${row.orderNumber} برای ${row.customerName} ارسال شود؟`
    if (!confirm(question)) return

    setSendingId(row.productionOrderId)
    try {
      const res = await fetch("/api/production/ready-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productionOrderId: row.productionOrderId, force: again }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || "خطا در ارسال پیامک")
      } else if (data.mock) {
        alert("حالت آزمایشی: پیامک واقعی ارسال نشد.")
      } else {
        alert("پیامک ارسال شد")
      }
      await load(true)
    } catch {
      alert("خطا در ارتباط با سرور")
    } finally {
      setSendingId(null)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (filter === "none" && r.sms !== "none") return false
      if (filter === "sent" && r.sms !== "sent") return false
      if (filter === "failed" && r.sms !== "failed") return false
      if (q) {
        const hay = `${r.orderNumber} ${r.customerName}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rows, search, filter])

  const counts = useMemo(
    () => ({
      all: rows.length,
      none: rows.filter((r) => r.sms === "none").length,
      sent: rows.filter((r) => r.sms === "sent").length,
      failed: rows.filter((r) => r.sms === "failed").length,
    }),
    [rows]
  )

  const chip = (active: boolean) =>
    `rounded-xl px-4 py-2 text-sm font-bold transition ${
      active
        ? "bg-teal-600 text-white"
        : "bg-white/60 text-blue-900 border border-teal-500/30 hover:bg-white/80"
    }`

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
      <div className="relative z-10 max-w-[1500px] mx-auto">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/90 p-4 shadow-md border border-teal-300">
          <div>
            <h1 className="text-2xl font-bold text-blue-950">پیامک «آماده تحویل»</h1>
            <p className="mt-1 text-sm text-blue-800">
              سفارش‌هایی که همه‌ی قطعه‌هایشان در ۴۵ روز اخیر از انبار کالای نیمه‌ساخته رد شده‌اند
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-xl px-4 py-2 text-sm font-bold border ${
                autoEnabled
                  ? "bg-green-100 text-green-800 border-green-300"
                  : "bg-amber-100 text-amber-800 border-amber-300"
              }`}
              title="با READY_SMS_ENABLED=true در فایل .env سرور روشن می‌شود"
            >
              ارسال خودکار: {autoEnabled ? "روشن" : "خاموش"}
            </span>
            <button
              type="button"
              onClick={() => load()}
              className="rounded-xl bg-teal-500 hover:bg-teal-600 px-4 py-2 text-sm font-bold text-white"
            >
              بروزرسانی
            </button>
            <Link
              href="/production/queue"
              className="rounded-xl border border-teal-500/40 bg-white px-4 py-2 text-sm font-bold text-blue-900"
            >
              روند کاری
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
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="شماره سفارش / نام مشتری"
              className="min-w-[240px] flex-1 rounded-xl border border-teal-500/30 bg-white px-4 py-2.5 text-sm font-semibold"
            />
            <button type="button" className={chip(filter === "all")} onClick={() => setFilter("all")}>
              همه ({counts.all})
            </button>
            <button type="button" className={chip(filter === "none")} onClick={() => setFilter("none")}>
              ارسال‌نشده ({counts.none})
            </button>
            <button type="button" className={chip(filter === "sent")} onClick={() => setFilter("sent")}>
              ارسال‌شده ({counts.sent})
            </button>
            <button type="button" className={chip(filter === "failed")} onClick={() => setFilter("failed")}>
              ناموفق ({counts.failed})
            </button>
          </div>
        </div>

        <div className="overflow-auto rounded-2xl bg-white shadow-md p-4 border border-teal-300">
          {loading ? (
            <p className="py-16 text-center font-bold text-blue-800">در حال بارگذاری...</p>
          ) : filtered.length === 0 ? (
            <p className="py-16 text-center font-bold text-blue-800">موردی پیدا نشد</p>
          ) : (
            <table className="w-full border-collapse border border-gray-400 text-sm">
              <thead>
                <tr className="bg-teal-100">
                  <th className="border border-gray-400 p-2">ردیف</th>
                  <th className="border border-gray-400 p-2">شماره سفارش</th>
                  <th className="border border-gray-400 p-2">مشتری</th>
                  <th className="border border-gray-400 p-2">تعداد قلم</th>
                  <th className="border border-gray-400 p-2">زمان آماده شدن</th>
                  <th className="border border-gray-400 p-2">وضعیت انبار</th>
                  <th className="border border-gray-400 p-2">شماره موبایل</th>
                  <th className="border border-gray-400 p-2">وضعیت پیامک</th>
                  <th className="border border-gray-400 p-2">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.productionOrderId} className="border border-gray-400 bg-white hover:bg-yellow-50">
                    <td className="border border-gray-400 p-2 text-center font-bold">{i + 1}</td>
                    <td className="border border-gray-400 p-2 text-center font-black text-teal-800">
                      {r.orderNumber}
                    </td>
                    <td className="border border-gray-400 p-2 font-bold">{r.customerName}</td>
                    <td className="border border-gray-400 p-2 text-center">{r.itemCount}</td>
                    <td className="border border-gray-400 p-2 text-center text-xs">
                      {formatDateTime(r.readyAt)}
                    </td>
                    <td className="border border-gray-400 p-2 text-center text-xs font-bold">
                      {r.warehousePending > 0
                        ? `در انبار آماده تحویل (${r.warehousePending} قلم)`
                        : "از انبار آماده تحویل رد شده"}
                    </td>
                    <td className="border border-gray-400 p-2 text-center font-mono text-xs" dir="ltr">
                      {r.hasMobile ? (
                        r.mobileMasked
                      ) : (
                        <span className="font-sans font-bold text-red-700">ثبت نشده</span>
                      )}
                    </td>
                    <td className="border border-gray-400 p-2 text-center">
                      {r.sms === "sent" && (
                        <span
                          className="inline-block rounded-lg bg-green-100 px-2 py-1 text-xs font-bold text-green-800"
                          title={r.smsNote || ""}
                        >
                          ✓ ارسال‌شده — {formatDateTime(r.smsAt)}
                        </span>
                      )}
                      {r.sms === "failed" && (
                        <span
                          className="inline-block rounded-lg bg-red-100 px-2 py-1 text-xs font-bold text-red-800"
                          title={r.smsNote || ""}
                        >
                          ناموفق — {formatDateTime(r.smsAt)}
                        </span>
                      )}
                      {r.sms === "sending" && (
                        <span className="text-xs font-bold text-amber-700">در حال ارسال…</span>
                      )}
                      {r.sms === "none" && <span className="text-xs text-gray-500">ارسال نشده</span>}
                    </td>
                    <td className="border border-gray-400 p-2 text-center">
                      <button
                        type="button"
                        disabled={sendingId === r.productionOrderId || !r.hasMobile}
                        onClick={() => send(r)}
                        title={
                          r.hasMobile
                            ? "ارسال پیامک آماده تحویل به مشتری"
                            : "شماره موبایل مشتری ثبت نشده؛ در «مدیریت مشتریان» وارد کنید"
                        }
                        className="rounded-lg bg-sky-600 hover:bg-sky-700 disabled:bg-gray-400 disabled:cursor-not-allowed px-3 py-1.5 text-xs font-bold text-white"
                      >
                        {sendingId === r.productionOrderId
                          ? "..."
                          : r.sms === "sent"
                            ? "ارسال مجدد"
                            : r.sms === "failed"
                              ? "تلاش مجدد"
                              : "ارسال پیامک"}
                      </button>
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
