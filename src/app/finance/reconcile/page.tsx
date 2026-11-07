"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import DatePicker, { DateObject } from "react-multi-date-picker"
import persian from "react-date-object/calendars/persian"
import persian_fa from "react-date-object/locales/persian_fa"

type Bucket = { count: number; rows: any[] }

type Report = {
  range?: { StartDate: string; EndDate: string; days: number }
  sepidarInvoicesRead?: number
  akhavanInvoicesChecked?: number
  sentChecked?: number
  matchedOk?: number
  applied?: boolean
  refused?: string | null
  missingInSepidar?: Bucket
  markableAsSent?: Bucket
  wrongParty?: Bucket
  priceDiff?: Bucket
  dateDiff?: Bucket
  itemDiff?: Bucket
  numberMismatch?: Bucket
  duplicateInSepidar?: Bucket
}

type TabKey =
  | "duplicate"
  | "number"
  | "party"
  | "price"
  | "date"
  | "item"
  | "missing"
  | "markable"

const TABS: { key: TabKey; label: string; desc: string }[] = [
  {
    key: "duplicate",
    label: "تکراری سپیدار",
    desc: "یک شماره فاکتور بیش از یک‌بار در سپیدار ثبت شده (خطر دوبار کانورت)",
  },
  {
    key: "number",
    label: "شماره فاکتور",
    desc: "شناسه ذخیره‌شده در اخوان به فاکتوری با شماره متفاوت در سپیدار وصل است",
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
  {
    key: "date",
    label: "تاریخ فاکتور",
    desc: "روز تاریخ فاکتور در اخوان با سپیدار یکی نیست",
  },
  {
    key: "item",
    label: "کالا",
    desc: "اختلاف نوع/کد یا تعداد اقلام (اگر API سپیدار اقلام را برگرداند)",
  },
  {
    key: "missing",
    label: "حذف‌شده از سپیدار",
    desc: "در اخوان SUCCESS است ولی آن شماره در سپیدار نیست — برای اصلاح وضعیت اخوان",
  },
  {
    key: "markable",
    label: "قابل علامت SUCCESS",
    desc: "در سپیدار هست ولی در اخوان هنوز SUCCESS نشده — می‌توانید وضعیت را هم‌تراز کنید",
  },
]

const BG =
  "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')"

function formatRial(n: number) {
  return Math.round(n || 0).toLocaleString("fa-IR")
}

function defaultFrom() {
  return new DateObject({ calendar: persian, locale: persian_fa }).subtract(
    45,
    "days"
  )
}

function defaultTo() {
  return new DateObject({ calendar: persian, locale: persian_fa })
}

/** ارسال به API به‌صورت YYYY-MM-DD (مرز روز در سرور با تهران بسته می‌شود) */
function toYmd(d: DateObject | null) {
  if (!d) return null
  const x = d.toDate()
  const fa = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(x)
  return fa
}

function daysBetween(from: DateObject | null, to: DateObject | null) {
  if (!from || !to) return 45
  const a = from.toDate().getTime()
  const b = to.toDate().getTime()
  const diff = Math.max(1, Math.round((b - a) / (24 * 60 * 60 * 1000)) + 1)
  return Math.min(400, diff)
}

export default function FinanceReconcilePage() {
  const [fromDate, setFromDate] = useState<DateObject | null>(null)
  const [toDate, setToDate] = useState<DateObject | null>(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState("")
  const [tab, setTab] = useState<TabKey>("duplicate")
  const [me, setMe] = useState<{ role: string } | null>(null)

  const canRun = me?.role === "finance" || me?.role === "admin"

  useEffect(() => {
    setFromDate(defaultFrom())
    setToDate(defaultTo())
  }, [])

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

  const rangeQuery = () => {
    const from = toYmd(fromDate)
    const to = toYmd(toDate)
    const days = daysBetween(fromDate, toDate)
    const q = new URLSearchParams()
    q.set("days", String(days))
    if (from) q.set("from", from)
    if (to) q.set("to", to)
    return q.toString()
  }

  const runReport = async () => {
    if (!canRun) {
      alert("فقط مالی/مدیر")
      return
    }
    if (!fromDate || !toDate) {
      alert("بازه تاریخ را انتخاب کنید")
      return
    }
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/finance/reconcile?${rangeQuery()}`)
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
        body: JSON.stringify({
          days: daysBetween(fromDate, toDate),
          from: toYmd(fromDate),
          to: toYmd(toDate),
          apply: true,
          force,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا")
      setReport(data)
      if (data.refused) alert(data.refused)
      else alert(data.applied ? "اصلاح وضعیت‌ها اعمال شد" : "چیزی اعمال نشد")
    } catch (e: any) {
      setError(e.message || "خطا")
    } finally {
      setApplying(false)
    }
  }

  const counts: Record<TabKey, number> = {
    duplicate: report?.duplicateInSepidar?.count || 0,
    number: report?.numberMismatch?.count || 0,
    party: report?.wrongParty?.count || 0,
    price: report?.priceDiff?.count || 0,
    date: report?.dateDiff?.count || 0,
    item: report?.itemDiff?.count || 0,
    missing: report?.missingInSepidar?.count || 0,
    markable: report?.markableAsSent?.count || 0,
  }

  const currentRows =
    tab === "duplicate"
      ? report?.duplicateInSepidar?.rows || []
      : tab === "number"
        ? report?.numberMismatch?.rows || []
        : tab === "party"
          ? report?.wrongParty?.rows || []
          : tab === "price"
            ? report?.priceDiff?.rows || []
            : tab === "date"
              ? report?.dateDiff?.rows || []
              : tab === "item"
                ? report?.itemDiff?.rows || []
                : tab === "missing"
                  ? report?.missingInSepidar?.rows || []
                  : report?.markableAsSent?.rows || []

  return (
    <div
      className="min-h-screen p-4 md:p-6 bg-cover bg-center bg-fixed"
      dir="rtl"
      style={{
        fontFamily: "Vazirmatn, Tahoma, sans-serif",
        backgroundImage: BG,
      }}
    >
      <div className="pointer-events-none fixed inset-0 bg-black/25" />

      <div className="relative z-10 max-w-[1400px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-3xl font-black text-blue-950">
              گزارش مغایرت‌گیری
            </h1>
            <p className="text-base text-blue-900 mt-1 font-semibold">
              شماره، طرف‌حساب، مبلغ، تاریخ، کالا و فاکتور تکراری در سپیدار
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/"
              className="rounded-xl border border-white/40 bg-white/80 px-4 py-2.5 font-bold"
            >
              داشبورد
            </Link>
            <Link
              href="/finance/convert"
              className="rounded-xl border border-white/40 bg-white/80 px-4 py-2.5 font-bold"
            >
              کانورت
            </Link>
            <Link
              href="/finance/deposits"
              className="rounded-xl border border-white/40 bg-white/80 px-4 py-2.5 font-bold"
            >
              واریزی‌ها
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-teal-500/25 bg-white/90 backdrop-blur-xl p-4 mb-4 flex flex-wrap items-end gap-3 shadow">
          <div>
            <label className="text-sm font-bold block mb-1 text-blue-900">
              از تاریخ
            </label>
            <DatePicker
              value={fromDate}
              onChange={(d) => setFromDate(d as DateObject)}
              calendar={persian}
              locale={persian_fa}
              calendarPosition="bottom-right"
              inputClass="w-40 rounded-xl border border-teal-400 px-3 py-2.5 text-base font-bold"
              containerClassName="w-auto"
            />
          </div>
          <div>
            <label className="text-sm font-bold block mb-1 text-blue-900">
              تا تاریخ
            </label>
            <DatePicker
              value={toDate}
              onChange={(d) => setToDate(d as DateObject)}
              calendar={persian}
              locale={persian_fa}
              calendarPosition="bottom-right"
              inputClass="w-40 rounded-xl border border-teal-400 px-3 py-2.5 text-base font-bold"
              containerClassName="w-auto"
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
              <div className="rounded-xl bg-white/90 border border-teal-500/20 p-3 text-center">
                <p className="text-xs font-bold text-gray-600">خوانده از سپیدار</p>
                <p className="text-xl font-black">
                  {report.sepidarInvoicesRead ?? 0}
                </p>
              </div>
              <div className="rounded-xl bg-white/90 border border-teal-500/20 p-3 text-center">
                <p className="text-xs font-bold text-gray-600">بررسی اخوان</p>
                <p className="text-xl font-black">
                  {report.akhavanInvoicesChecked ?? 0}
                </p>
              </div>
              <div className="rounded-xl bg-white/90 border border-teal-500/20 p-3 text-center">
                <p className="text-xs font-bold text-gray-600">SUCCESS بررسی‌شده</p>
                <p className="text-xl font-black">{report.sentChecked ?? 0}</p>
              </div>
              <div className="rounded-xl bg-green-50/95 border border-green-200 p-3 text-center">
                <p className="text-xs font-bold text-gray-600">تطبیق سالم</p>
                <p className="text-xl font-black text-green-700">
                  {report.matchedOk ?? 0}
                </p>
              </div>
              <div className="rounded-xl bg-red-50/95 border border-red-200 p-3 text-center">
                <p className="text-xs font-bold text-gray-600">تکراری سپیدار</p>
                <p className="text-xl font-black text-red-700">
                  {counts.duplicate}
                </p>
              </div>
              <div className="rounded-xl bg-white/90 border border-teal-500/20 p-3 text-center">
                <p className="text-xs font-bold text-gray-600">بازه API</p>
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
                  className={`rounded-xl px-3 py-2 text-sm font-bold border ${
                    tab === t.key
                      ? "bg-teal-600 text-white border-teal-700"
                      : "bg-white/90 text-blue-900 border-teal-200"
                  }`}
                >
                  {t.label}{" "}
                  <span className="opacity-90">({counts[t.key]})</span>
                </button>
              ))}
            </div>

            <p className="text-sm text-blue-900 mb-2 font-semibold">
              {TABS.find((t) => t.key === tab)?.desc}
            </p>

            <div className="rounded-2xl border border-teal-500/25 overflow-auto bg-white/95 shadow-sm backdrop-blur">
              <table className="min-w-full text-base">
                <thead className="bg-teal-700 text-white">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">شماره فاکتور</th>
                    <th className="p-3">مشتری</th>
                    <th className="p-3">وضعیت اخوان</th>
                    {tab === "duplicate" && (
                      <>
                        <th className="p-3">تعداد در سپیدار</th>
                        <th className="p-3">شناسه‌ها</th>
                      </>
                    )}
                    {tab === "number" && (
                      <>
                        <th className="p-3">شماره مورد انتظار</th>
                        <th className="p-3">شماره سپیدار</th>
                        <th className="p-3">شناسه سپیدار</th>
                      </>
                    )}
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
                    {tab === "date" && (
                      <>
                        <th className="p-3">تاریخ اخوان</th>
                        <th className="p-3">تاریخ سپیدار</th>
                      </>
                    )}
                    {tab === "item" && (
                      <>
                        <th className="p-3">شرح مغایرت کالا</th>
                        <th className="p-3">تعداد اقلام</th>
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
                      {tab === "duplicate" && (
                        <>
                          <td className="p-3 text-center font-black text-red-700">
                            {r.count ?? "—"}
                          </td>
                          <td className="p-3 text-center text-xs" dir="ltr">
                            {(r.sepidarInvoiceIds || []).join(", ") || "—"}
                          </td>
                        </>
                      )}
                      {tab === "number" && (
                        <>
                          <td className="p-3 text-center" dir="ltr">
                            {r.expectedNumber ?? "—"}
                          </td>
                          <td className="p-3 text-center" dir="ltr">
                            {r.sepidarNumber ?? "—"}
                          </td>
                          <td className="p-3 text-center" dir="ltr">
                            {r.sepidarInvoiceId ?? "—"}
                          </td>
                        </>
                      )}
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
                              Math.abs(r.diff || 0) > 1 ? "text-red-700" : ""
                            }`}
                            dir="ltr"
                          >
                            {formatRial(r.diff)}
                          </td>
                        </>
                      )}
                      {tab === "date" && (
                        <>
                          <td className="p-3 text-center" dir="ltr">
                            {r.akhavanDate ?? "—"}
                          </td>
                          <td className="p-3 text-center" dir="ltr">
                            {r.sepidarDate ?? "—"}
                          </td>
                        </>
                      )}
                      {tab === "item" && (
                        <>
                          <td className="p-3 text-sm">{r.detail || "—"}</td>
                          <td className="p-3 text-center text-sm" dir="ltr">
                            {r.akhavanItemCount ?? "—"} /{" "}
                            {r.sepidarItemCount ?? "—"}
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

            <p className="text-sm text-blue-950/80 mt-3 font-semibold">
              حداکثر ۲۰۰ ردیف در هر دسته. تب «تکراری سپیدار» همان مشکل دوبار
              کانورت را نشان می‌دهد. تب کالا فقط وقتی پر می‌شود که GetAllInvoices
              اقلام را برگرداند.
            </p>
          </>
        )}

        {!report && !loading && !error && (
          <p className="text-center text-blue-950 font-bold py-12 text-lg bg-white/70 rounded-2xl border border-white/40">
            بازه تاریخ را انتخاب و «اجرای گزارش» را بزنید
          </p>
        )}
      </div>
    </div>
  )
}