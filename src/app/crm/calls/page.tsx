"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { DateObject } from "react-multi-date-picker"
import persian from "react-date-object/calendars/persian"
import persian_fa from "react-date-object/locales/persian_fa"

type CallRow = {
  id: string
  externalId?: string | null
  phone: string
  status: string
  endReason?: string | null
  startedAt: string
  durationSec: number
  turns: number
  cost: number
  answerer?: string | null
  goal?: string | null
  customer?: { id: string; name: string } | null
  lead?: { id: string; name: string } | null
}

function formatFaDateTime(iso: string) {
  try {
    return new DateObject({
      date: new Date(iso),
      calendar: persian,
      locale: persian_fa,
    }).format("YYYY/MM/DD HH:mm")
  } catch {
    return "—"
  }
}

function formatDuration(sec: number) {
  if (!sec) return "۰ ثانیه"
  if (sec < 60) return `${sec} ثانیه`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s ? `${m} دقیقه و ${s} ثانیه` : `${m} دقیقه`
}

function statusBadge(status: string) {
  if (status === "COMPLETED" || status === "کامل")
    return (
      <span className="rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-0.5 text-xs font-bold">
        کامل
      </span>
    )
  if (status === "FAILED" || status === "خطا")
    return (
      <span className="rounded-full bg-red-100 text-red-700 px-2.5 py-0.5 text-xs font-bold">
        خطا
      </span>
    )
  if (status === "LIVE")
    return (
      <span className="rounded-full bg-blue-100 text-blue-800 px-2.5 py-0.5 text-xs font-bold">
        زنده
      </span>
    )
  return (
    <span className="rounded-full bg-gray-100 text-gray-700 px-2.5 py-0.5 text-xs font-bold">
      {status}
    </span>
  )
}

export default function CrmCallsPage() {
  const [items, setItems] = useState<CallRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [status, setStatus] = useState("همه")

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set("q", q.trim())
      if (status !== "همه") params.set("status", status)
      const res = await fetch(`/api/crm/calls?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا")
      setItems(Array.isArray(data.items) ? data.items : [])
    } catch (e: any) {
      alert(e.message || "خطا")
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visible = useMemo(() => items, [items])

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-fixed p-4 md:p-6"
style={{
  fontFamily: "Vazirmatn, Tahoma, sans-serif",
  backgroundImage:
    "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')",
}}
    >
      <div className="max-w-[1400px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900">
              تاریخچه تماس‌ها
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              مکالمه‌ها، مدت و نتیجه هر تماس — آماده اتصال به زی‌تک
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/crm"
              className="rounded-xl border px-4 py-2 font-bold text-slate-700 bg-white hover:bg-slate-50"
            >
              داشبورد CRM
            </Link>
            <Link
              href="/crm/leads"
              className="rounded-xl border px-4 py-2 font-bold text-slate-700 bg-white hover:bg-slate-50"
            >
              لیدها
            </Link>
          </div>
        </div>

        <div className="rounded-2xl bg-white border shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-bold text-slate-600 mb-1">
              جستجو
            </label>
            <input
              className="w-full rounded-xl border px-3 py-2.5 font-semibold"
              placeholder="شماره تلفن یا شناسه تماس..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              dir="ltr"
            />
          </div>
          <div className="w-40">
            <label className="block text-xs font-bold text-slate-600 mb-1">
              وضعیت
            </label>
            <select
              className="w-full rounded-xl border px-3 py-2.5 font-semibold"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="همه">همه</option>
              <option value="COMPLETED">کامل</option>
              <option value="FAILED">خطا</option>
              <option value="LIVE">زنده</option>
            </select>
          </div>
          <button
            type="button"
            onClick={load}
            className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold px-5 py-2.5"
          >
            جست‌وجو
          </button>
        </div>

        <div className="rounded-2xl bg-white border shadow-sm overflow-auto">
          {loading ? (
            <p className="p-10 text-center font-bold text-slate-500">
              در حال بارگذاری...
            </p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="p-3 text-right">تماس‌گیرنده</th>
                  <th className="p-3 text-center">زمان شروع</th>
                  <th className="p-3 text-center">مدت</th>
                  <th className="p-3 text-center">نوبت‌ها</th>
                  <th className="p-3 text-center">دلیل پایان</th>
                  <th className="p-3 text-center">هزینه</th>
                  <th className="p-3 text-center">وضعیت</th>
                  <th className="p-3 text-center">مشتری / لید</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t hover:bg-violet-50 cursor-pointer"
                    onClick={() =>
                      (window.location.href = `/crm/calls/${r.id}`)
                    }
                  >
                    <td className="p-3 font-bold" dir="ltr">
                      {r.phone}
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      {formatFaDateTime(r.startedAt)}
                    </td>
                    <td className="p-3 text-center">
                      {formatDuration(r.durationSec)}
                    </td>
                    <td className="p-3 text-center">{r.turns}</td>
                    <td className="p-3 text-center text-xs">
                      {r.endReason || "—"}
                    </td>
                    <td className="p-3 text-center" dir="ltr">
                      ${Number(r.cost || 0).toFixed(4)}
                    </td>
                    <td className="p-3 text-center">
                      {statusBadge(r.status)}
                    </td>
                    <td className="p-3 text-center text-xs">
                      {r.customer?.name || r.lead?.name || "—"}
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="p-10 text-center text-slate-500 font-bold"
                    >
                      تماسی یافت نشد
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}