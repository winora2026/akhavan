"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

type Report = {
  range?: { StartDate: string; EndDate: string; days: number }
  sepidarInvoicesRead?: number
  akhavanInvoicesChecked?: number
  sentChecked?: number
  matchedOk?: number
  applied?: boolean
  refused?: string | null
  missingInSepidar?: { count: number; rows: any[] }
  markableAsSent?: { count: number; rows: any[] }
  wrongParty?: { count: number; rows: any[] }
  priceDiff?: { count: number; rows: any[] }
}

type TabKey = "missing" | "markable" | "party" | "price"

const TABS: { key: TabKey; label: string; desc: string }[] = [
  {
    key: "missing",
    label: "حذف‌شده از سپیدار",
    desc: "در اخوان SUCCESS است ولی در سپیدار نیست (شماره فاکتور)",
  },
  {
    key: "markable",
    label: "قابل علامت SUCCESS",
    desc: "در سپیدار هست ولی در اخوان ارسال‌نشده/خطا مانده",
  },
  {
    key: "party",
    label: "طرف‌حساب",
    desc: "شماره یکی است ولی طرف‌حساب فرق دارد",
  },
  {
    key: "price",
    label: "مبلغ",
    desc: "اختلاف جمع فاکتور بیش از ۱ ریال",
  },
]

function formatRial(n: number) {
  return Math.round(n || 0).toLocaleString("fa-IR")
}

export default function FinanceReconcilePage() {
  const [days, setDays] = useState(45)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState("")
  const [tab, setTab] = useState<TabKey>("missing")
  const [me, setMe] = useState<{ role: string } | null>(null)

  const canRun = me?.role === "finance" || me?.role === "admin"

  useEffect(() => {
    ;(async () => {
      try {
        const r = await fetch("/api/auth/me")
        if (r.ok) {
          const d = await r.json()
          if (d.user) setMe({ role: d.user.role })
        }
      } catch {}
    })()
  }, [])

  const runReport = async () => {
    if (!canRun) {
      alert("فقط مالی/مدیر")
      return
    }
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/finance/reconcile?days=${days}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا")
      setReport(data)
    } catch (e: any) {
      setReport(null)
      setError(e.message || "خطا")
    } finally {
      setLoading(false)
    }
  }

  const applyFix = async (force = false) => {
    if (!canRun) return
    const msg = force
      ? "اعمال با force: حتی اگر تعداد «حذف‌شده» زیاد باشد وضعیت‌ها اصلاح می‌شود. مطمئنید؟"
      : "وضعیت‌های قابل اصلاح در اخوان اعمال شود؟ (ریست حذف‌شده‌ها + علامت SUCCESS برای موجود در سپیدار)"
    if (!confirm(msg)) return

    setApplying(true)
    setError("")
    try {
      const res = await fetch("/api/finance/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days, apply: true, force }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا")
      setReport(data)
      if (data.refused) {
        alert(data.refused)
      } else {
        alert(
          data.applied
            ? "اصلاح وضعیت‌ها اعمال شد"
            : "چیزی اعمال نشد"
        )
      }
    } catch (e: any) {
      setError(e.message || "خطا")
    } finally {
      setApplying(false)
    }
  }

  const counts = {
    missing: report?.missingInSepidar?.count || 0,
    markable: report?.markableAsSent?.count || 0,
    party: report?.wrongParty?.count || 0,
    price: report?.priceDiff?.count || 0,
  }

  const currentRows =
    tab === "missing"
      ? report?.missingInSepidar?.rows || []
      : tab === "markable"
        ? report?.markableAsSent?.rows || []
        : tab === "party"
          ? report?.wrongParty?.rows || []
          : report?.priceDiff?.rows || []

  return (
    <div
      className="min-h-screen p-4 md:p-6 bg-slate-50"
      dir="rtl"
      style={{ fontFamily: "Vazirmatn, Tahoma, sans-serif" }}
    >
      <div className="max-w-[1400px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-3xl font-black text-blue-950">
              گزارش مغایرت‌گیری
            </h1>
            <p className="text-base text-blue-800 mt-1">
              مقایسه فاکتورهای اخوان با سپیدار (شماره، طرف‌حساب، مبلغ)
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/"
              className="rounded-xl border px-4 py-2.5 font-bold"
            >
              داشبورد
            </Link>
            <Link
              href="/finance/convert"
              className="rounded-xl border px-4 py-2.5 font-bold"
            >
              کانورت
            </Link>
            <Link
              href="/finance/deposits"
              className="rounded-xl border px-4 py-2.5 font-bold"
            >
              واریزی‌ها
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-sm font-bold block mb-1">
              بازه بررسی (روز اخیر)
            </label>
            <input
              type="number"
              min={1}
              max={400}
              className="w-28 rounded-xl border px-3 py-2.5 text-base"
              value={days}
              onChange={(e) => setDays(Number(e.target.value) || 45)}
            />
          </div>
          <button
            onClick={runReport}
            disabled={loading || !canRun}
            className="rounded-xl bg-blue-900 text-white font-bold px-5 py-2.5 disabled:opacity-50"
          >
            {loading ? "در حال بررسی..." : "اجرای گزارش"}
          </button>
          <button
            onClick={() => applyFix(false)}
            disabled={applying || !report || !canRun}
            className="rounded-xl bg-teal-600 text-white font-bold px-5 py-2.5 disabled:opacity-50"
          >
            {applying ? "..." : "اعمال اصلاح وضعیت"}
          </button>
          <button
            onClick={() => applyFix(true)}
            disabled={applying || !report || !canRun}
            className="rounded-xl bg-amber-600 text-white font-bold px-5 py-2.5 disabled:opacity-50"
          >
            اعمال با force
          </button>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 p-4 mb-4 font-bold">
            {error}
          </div>
        )}

        {report?.refused && (
          <div className="rounded-xl bg-amber-50 border border-amber-300 text-amber-900 p-4 mb-4">
            {report.refused}
          </div>
        )}

        {report && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
              <div className="rounded-xl bg-white border p-3 text-center">
                <p className="text-xs font-bold text-gray-600">خوانده از سپیدار</p>
                <p className="text-xl font-black">{report.sepidarInvoicesRead ?? 0}</p>
              </div>
              <div className="rounded-xl bg-white border p-3 text-center">
                <p className="text-xs font-bold text-gray-600">بررسی اخوان</p>
                <p className="text-xl font-black">{report.akhavanInvoicesChecked ?? 0}</p>
              </div>
              <div className="rounded-xl bg-white border p-3 text-center">
                <p className="text-xs font-bold text-gray-600">SUCCESS بررسی‌شده</p>
                <p className="text-xl font-black">{report.sentChecked ?? 0}</p>
              </div>
              <div className="rounded-xl bg-green-50 border p-3 text-center">
                <p className="text-xs font-bold text-gray-600">تطبیق سالم</p>
                <p className="text-xl font-black text-green-700">{report.matchedOk ?? 0}</p>
              </div>
              <div className="rounded-xl bg-white border p-3 text-center col-span-2">
                <p className="text-xs font-bold text-gray-600">بازه</p>
                <p className="text-sm font-bold" dir="ltr">
                  {report.range?.StartDate} → {report.range?.EndDate}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`rounded-xl px-4 py-2 font-bold border ${
                    tab === t.key
                      ? "bg-teal-600 text-white border-teal-700"
                      : "bg-white text-blue-900 border-teal-200"
                  }`}
                >
                  {t.label}{" "}
                  <span className="opacity-90">({counts[t.key]})</span>
                </button>
              ))}
            </div>

            <p className="text-sm text-blue-800 mb-2">
              {TABS.find((t) => t.key === tab)?.desc}
            </p>

            <div className="rounded-2xl border overflow-auto bg-white shadow-sm">
              <table className="min-w-full text-base">
                <thead className="bg-teal-700 text-white">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">شماره فاکتور</th>
                    <th className="p-3">مشتری</th>
                    <th className="p-3">وضعیت اخوان</th>
                    {tab === "missing" && (
                      <th className="p-3">شماره مورد انتظار</th>
                    )}
                    {tab === "markable" && (
                      <th className="p-3">شناسه سپیدار</th>
                    )}
                    {tab === "party" && (
                      <>
                        <th className="p-3">طرف‌حساب سپیدار</th>
                        <th className="p-3">طرف‌حساب اخوان</th>
                        <th className="p-3">شناسه فاکتور سپیدار</th>
                      </>
                    )}
                    {tab === "price" && (
                      <>
                        <th className="p-3">مبلغ اخوان</th>
                        <th className="p-3">مبلغ سپیدار</th>
                        <th className="p-3">اختلاف</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {currentRows.map((r: any, idx: number) => (
                    <tr key={idx} className="border-b hover:bg-teal-50/40">
                      <td className="p-3 text-center font-bold">{idx + 1}</td>
                      <td className="p-3 text-center font-black" dir="ltr">
                        {r.orderNumber}
                      </td>
                      <td className="p-3 font-bold">{r.customer || "—"}</td>
                      <td className="p-3 text-center text-sm">{r.status || "—"}</td>
                      {tab === "missing" && (
                        <td className="p-3 text-center" dir="ltr">
                          {r.expectedNumber ?? "—"}
                        </td>
                      )}
                      {tab === "markable" && (
                        <td className="p-3 text-center" dir="ltr">
                          {r.sepidarInvoiceId ?? "—"}
                        </td>
                      )}
                      {tab === "party" && (
                        <>
                          <td className="p-3 text-center" dir="ltr">
                            {r.sepidarPartyRef ?? "—"}
                          </td>
                          <td className="p-3 text-center" dir="ltr">
                            {r.akhavanPartyRef ?? "—"}
                          </td>
                          <td className="p-3 text-center" dir="ltr">
                            {r.sepidarInvoiceId ?? "—"}
                          </td>
                        </>
                      )}
                      {tab === "price" && (
                        <>
                          <td className="p-3 text-center" dir="ltr">
                            {formatRial(r.appTotal)}
                          </td>
                          <td className="p-3 text-center" dir="ltr">
                            {formatRial(r.sepidarNet)}
                          </td>
                          <td
                            className={`p-3 text-center font-black ${
                              Math.abs(r.diff || 0) > 1
                                ? "text-red-700"
                                : ""
                            }`}
                            dir="ltr"
                          >
                            {formatRial(r.diff)}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {currentRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="p-8 text-center text-gray-500"
                      >
                        در این دسته مغایرتی نیست
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="text-sm text-gray-600 mt-3">
              تاریخ و کالا در نسخه بعدی اضافه می‌شود. حداکثر ۲۰۰ ردیف در هر دسته
              نمایش داده می‌شود.
            </p>
          </>
        )}

        {!report && !loading && !error && (
          <p className="text-center text-gray-500 py-12 text-lg">
            بازه را انتخاب و «اجرای گزارش» را بزنید
          </p>
        )}
      </div>
    </div>
  )
}