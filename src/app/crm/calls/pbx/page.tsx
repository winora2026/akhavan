"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

type CallRow = {
  id: string
  uniqueId: string
  direction: "INBOUND" | "OUTBOUND" | "INTERNAL"
  callerNumber: string
  callerNorm: string | null
  calleeNumber: string | null
  agentExtension: string | null
  disposition: string | null
  startedAt: string
  answeredAt: string | null
  endedAt: string | null
  durationSec: number
  billSec: number
  recordingFile: string | null
  hasRecording: boolean
  customer: { id: string; name: string; customerCode: string | null } | null
  user: { id: string; displayName: string; extension: string | null } | null
}

const DIRECTION_LABEL: Record<string, string> = {
  INBOUND: "ورودی",
  OUTBOUND: "خروجی",
  INTERNAL: "داخلی",
}

function faDateTime(iso?: string | null) {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  try {
    return d.toLocaleString("fa-IR-u-nu-latn", {
      timeZone: "Asia/Tehran",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
  } catch {
    return d.toISOString()
  }
}

function faDuration(sec: number) {
  const s = Number(sec) || 0
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m <= 0) return `${r} ثانیه`
  return `${m}:${String(r).padStart(2, "0")} دقیقه`
}

function dispositionBadge(disposition: string | null) {
  const d = String(disposition || "").toUpperCase()
  if (d === "ANSWERED") return { label: "پاسخ داده شد", cls: "bg-emerald-100 text-emerald-800" }
  if (d === "BUSY") return { label: "اشغال", cls: "bg-amber-100 text-amber-800" }
  if (d === "FAILED") return { label: "ناموفق", cls: "bg-red-100 text-red-800" }
  if (d === "NO ANSWER" || d === "NOANSWER") return { label: "بی‌پاسخ", cls: "bg-slate-100 text-slate-700" }
  return { label: d || "—", cls: "bg-slate-100 text-slate-700" }
}

export default function PbxCallsPage() {
  const [items, setItems] = useState<CallRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [q, setQ] = useState("")
  const [direction, setDirection] = useState("")
  const [disposition, setDisposition] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(0)
  const limit = 50

  const fetchCalls = async (
    offset: number,
    f: { q: string; direction: string; disposition: string; from: string; to: string }
  ) => {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams()
      if (f.q.trim()) params.set("q", f.q.trim())
      if (f.direction) params.set("direction", f.direction)
      if (f.disposition) params.set("disposition", f.disposition)
      if (f.from) params.set("from", f.from)
      if (f.to) params.set("to", f.to)
      params.set("limit", String(limit))
      params.set("offset", String(offset))
      const res = await fetch(`/api/telephony/calls?${params.toString()}`, { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "خطا در دریافت تماس‌ها")
      setItems(Array.isArray(data.items) ? data.items : [])
      setTotal(Number(data.total) || 0)
      setPage(offset)
    } catch (e: any) {
      setError(e?.message || "خطا در دریافت تماس‌ها")
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  const load = (offset: number) =>
    fetchCalls(offset, { q, direction, disposition, from, to })

  useEffect(() => {
    load(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalPages = Math.max(1, Math.ceil(total / limit))
  const currentPage = Math.floor(page / limit) + 1

  const resetFilters = () => {
    setQ("")
    setDirection("")
    setDisposition("")
    setFrom("")
    setTo("")
    fetchCalls(0, { q: "", direction: "", disposition: "", from: "", to: "" })
  }

  return (
    <div dir="rtl" className="mx-auto max-w-[1500px]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 md:text-3xl">تاریخچه تماس‌های تلفنی</h1>
          <p className="mt-1 text-sm text-slate-600">
            تماس‌های ثبت‌شده از مرکز تلفن (Asterisk) به همراه ضبط مکالمات
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/crm/calls/settings"
            className="rounded-xl border border-teal-200 bg-white px-4 py-2 text-sm font-bold text-teal-800 hover:bg-teal-50"
          >
            تنظیمات داخلی
          </Link>
          <Link
            href="/crm/calls"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            تاریخچه ویس
          </Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-teal-100 bg-white/95 p-4 shadow-sm">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs font-bold text-slate-600">جستجو</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(0)}
            placeholder="شماره، نام مشتری یا داخلی..."
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold focus:border-teal-500 focus:outline-none"
          />
        </div>
        <div className="w-36">
          <label className="mb-1 block text-xs font-bold text-slate-600">جهت تماس</label>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold focus:border-teal-500 focus:outline-none"
          >
            <option value="">همه</option>
            <option value="INBOUND">ورودی</option>
            <option value="OUTBOUND">خروجی</option>
            <option value="INTERNAL">داخلی</option>
          </select>
        </div>
        <div className="w-36">
          <label className="mb-1 block text-xs font-bold text-slate-600">وضعیت</label>
          <select
            value={disposition}
            onChange={(e) => setDisposition(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold focus:border-teal-500 focus:outline-none"
          >
            <option value="">همه</option>
            <option value="ANSWERED">پاسخ داده شد</option>
            <option value="NO ANSWER">بی‌پاسخ</option>
            <option value="BUSY">اشغال</option>
            <option value="FAILED">ناموفق</option>
          </select>
        </div>
        <div className="w-36">
          <label className="mb-1 block text-xs font-bold text-slate-600">از تاریخ</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold focus:border-teal-500 focus:outline-none"
            dir="ltr"
          />
        </div>
        <div className="w-36">
          <label className="mb-1 block text-xs font-bold text-slate-600">تا تاریخ</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold focus:border-teal-500 focus:outline-none"
            dir="ltr"
          />
        </div>
        <button
          onClick={() => load(0)}
          className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-700"
        >
          اعمال فیلتر
        </button>
        <button
          onClick={resetFilters}
          className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          پاک کردن
        </button>
      </div>

      <div className="overflow-auto rounded-2xl border border-teal-100 bg-white/95 shadow-sm">
        {loading ? (
          <p className="p-12 text-center font-bold text-slate-500">در حال بارگذاری...</p>
        ) : error ? (
          <p className="p-12 text-center font-bold text-red-600">{error}</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="p-3 text-right">شماره</th>
                <th className="p-3 text-center">جهت</th>
                <th className="p-3 text-center">داخلی / کاربر</th>
                <th className="p-3 text-center">مشتری</th>
                <th className="p-3 text-center">زمان شروع</th>
                <th className="p-3 text-center">مدت مکالمه</th>
                <th className="p-3 text-center">وضعیت</th>
                <th className="p-3 text-center">ضبط</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const badge = dispositionBadge(row.disposition)
                return (
                  <tr key={row.id} className="border-t border-slate-100 hover:bg-teal-50/60">
                    <td className="whitespace-nowrap p-3 text-right">
                      <Link href={`/crm/calls/pbx/${row.id}`} className="block">
                        <span className="font-mono font-bold text-slate-900" dir="ltr">
                          {row.direction === "OUTBOUND" ? row.calleeNumber || row.callerNumber : row.callerNumber}
                        </span>
                        <span className="mt-0.5 block text-[11px] font-bold text-slate-400" dir="ltr">
                          {row.direction === "OUTBOUND" ? row.callerNumber : row.calleeNumber || ""}
                        </span>
                      </Link>
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`rounded-lg px-2 py-1 text-xs font-bold ${
                          row.direction === "INBOUND"
                            ? "bg-violet-100 text-violet-800"
                            : row.direction === "OUTBOUND"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {DIRECTION_LABEL[row.direction] || row.direction}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span className="font-mono text-xs font-bold text-slate-700" dir="ltr">
                        {row.agentExtension || "—"}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">{row.user?.displayName || ""}</span>
                    </td>
                    <td className="p-3 text-center text-xs font-bold text-slate-700">
                      {row.customer ? (
                        <Link
                          href={`/customers?phone=${encodeURIComponent(
                            row.direction === "OUTBOUND" ? row.calleeNumber || "" : row.callerNorm || row.callerNumber
                          )}`}
                          className="text-teal-700 hover:underline"
                        >
                          {row.customer.name}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap p-3 text-center text-xs font-semibold text-slate-700">
                      {faDateTime(row.startedAt)}
                    </td>
                    <td className="p-3 text-center text-xs font-bold text-slate-700">{faDuration(row.billSec || row.durationSec)}</td>
                    <td className="p-3 text-center">
                      <span className={`rounded-lg px-2 py-1 text-xs font-bold ${badge.cls}`}>{badge.label}</span>
                    </td>
                    <td className="p-3 text-center">
                      {row.hasRecording ? (
                        <Link
                          href={`/crm/calls/pbx/${row.id}`}
                          className="inline-flex items-center gap-1 rounded-lg bg-rose-100 px-2 py-1 text-xs font-bold text-rose-700 hover:bg-rose-200"
                        >
                          ▶ پخش
                        </Link>
                      ) : (
                        <span className="text-xs font-bold text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-12 text-center font-bold text-slate-500">
                    تماسی یافت نشد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-slate-600">
        <span>مجموع: {total.toLocaleString("fa-IR")} تماس</span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => load(Math.max(0, page - limit))}
              disabled={currentPage <= 1 || loading}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40"
            >
              قبلی
            </button>
            <span className="px-2">
              صفحه {currentPage.toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")}
            </span>
            <button
              onClick={() => load(page + limit)}
              disabled={currentPage >= totalPages || loading}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40"
            >
              بعدی
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
