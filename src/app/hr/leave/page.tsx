"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import DatePicker from "react-multi-date-picker"
import persian from "react-date-object/calendars/persian"
import persian_fa from "react-date-object/locales/persian_fa"

const BG =
  "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')"

const LEAVE_TYPES = [
  "مرخصی استحقاقی",
  "مرخصی استعلاجی",
  "مرخصی تشویقی",
  "مرخصی بدون حقوق",
  "مأموریت",
  "سایر",
]

const STATUS_FA: Record<string, string> = {
  PENDING: "در انتظار تأیید",
  APPROVED: "تأیید شده",
  REJECTED: "رد شده",
  CANCELLED: "لغو شده",
}

function formatFa(d?: string) {
  if (!d) return "—"
  try {
    return new Date(d).toLocaleDateString("fa-IR")
  } catch {
    return "—"
  }
}

export default function LeavePage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [durationType, setDurationType] = useState<"DAILY" | "HOURLY">("DAILY")
  const [type, setType] = useState(LEAVE_TYPES[0])
  const [start, setStart] = useState<any>(null)
  const [end, setEnd] = useState<any>(null)
  const [startTime, setStartTime] = useState("08:00")
  const [endTime, setEndTime] = useState("12:00")
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/hr/leave-requests?mine=1")
      const data = await res.json()
      setItems(data.items || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!start) return alert("تاریخ را انتخاب کنید")
    if (durationType === "DAILY" && !end) return alert("تاریخ پایان را انتخاب کنید")
    setSaving(true)
    try {
      const res = await fetch("/api/hr/leave-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          durationType,
          startDate: start.toDate().toISOString(),
          endDate:
            durationType === "DAILY"
              ? end.toDate().toISOString()
              : start.toDate().toISOString(),
          startTime: durationType === "HOURLY" ? startTime : undefined,
          endTime: durationType === "HOURLY" ? endTime : undefined,
          description,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDescription("")
      load()
      alert("درخواست ثبت شد")
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="min-h-screen p-4 md:p-6 bg-cover bg-center bg-fixed"
      dir="rtl"
      style={{ fontFamily: "Vazirmatn, Tahoma, sans-serif", backgroundImage: BG }}
    >
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-wrap gap-3 items-center mb-4">
          <Link href="/" className="rounded-xl bg-white/90 border border-teal-200 px-4 py-2 font-bold">
            بازگشت
          </Link>
          <h1 className="text-xl font-black text-blue-950">درخواست مرخصی / مأموریت</h1>
          <Link href="/hr/employees" className="text-sm font-bold text-teal-800 underline">پرسنل</Link>
          <Link href="/hr/approvals" className="text-sm font-bold text-teal-800 underline mr-auto">
            کارتابل مدیر
          </Link>
        </div>

        <form
          onSubmit={submit}
          className="rounded-2xl bg-white/90 backdrop-blur border border-teal-200 p-5 mb-5 shadow space-y-3"
        >
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDurationType("DAILY")}
              className={`flex-1 rounded-xl py-2.5 font-bold border ${
                durationType === "DAILY"
                  ? "bg-teal-600 text-white border-teal-700"
                  : "bg-white text-blue-900 border-teal-200"
              }`}
            >
              مرخصی روزانه
            </button>
            <button
              type="button"
              onClick={() => setDurationType("HOURLY")}
              className={`flex-1 rounded-xl py-2.5 font-bold border ${
                durationType === "HOURLY"
                  ? "bg-teal-600 text-white border-teal-700"
                  : "bg-white text-blue-900 border-teal-200"
              }`}
            >
              مرخصی ساعتی
            </button>
          </div>

          <div>
            <label className="text-xs font-bold">نوع</label>
            <select
              className="w-full rounded-xl border border-teal-300 px-3 py-2 font-semibold"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {LEAVE_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>

          {durationType === "DAILY" ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold">از تاریخ</label>
                <DatePicker
                  value={start}
                  onChange={setStart}
                  calendar={persian}
                  locale={persian_fa}
                  inputClass="w-full rounded-xl border border-teal-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="text-xs font-bold">تا تاریخ</label>
                <DatePicker
                  value={end}
                  onChange={setEnd}
                  calendar={persian}
                  locale={persian_fa}
                  inputClass="w-full rounded-xl border border-teal-300 px-3 py-2"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-bold">تاریخ</label>
                <DatePicker
                  value={start}
                  onChange={setStart}
                  calendar={persian}
                  locale={persian_fa}
                  inputClass="w-full rounded-xl border border-teal-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="text-xs font-bold">از ساعت</label>
                <input
                  type="time"
                  className="w-full rounded-xl border border-teal-300 px-3 py-2"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-bold">تا ساعت</label>
                <input
                  type="time"
                  className="w-full rounded-xl border border-teal-300 px-3 py-2"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-bold">توضیحات</label>
            <textarea
              className="w-full rounded-xl border border-teal-300 px-3 py-2"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <button
            disabled={saving}
            className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold px-6 py-2.5 disabled:opacity-50"
          >
            {saving ? "..." : "ثبت درخواست"}
          </button>
        </form>

        <div className="rounded-2xl bg-white/90 border border-teal-200 shadow overflow-x-auto">
          {loading ? (
            <p className="p-6 text-center font-bold">در حال بارگذاری...</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-teal-700 text-white">
                <tr>
                  <th className="p-2">نوع</th>
                  <th className="p-2">حالت</th>
                  <th className="p-2">بازه</th>
                  <th className="p-2">مقدار</th>
                  <th className="p-2">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className="border-b odd:bg-white even:bg-teal-50/40">
                    <td className="p-2 font-bold">{r.type}</td>
                    <td className="p-2 text-center">
                      {r.durationType === "HOURLY" ? "ساعتی" : "روزانه"}
                    </td>
                    <td className="p-2 text-center text-xs">
                      {formatFa(r.startDate)}
                      {r.durationType === "HOURLY"
                        ? ` | ${r.startTime}–${r.endTime}`
                        : ` تا ${formatFa(r.endDate)}`}
                    </td>
                    <td className="p-2 text-center font-bold">
                      {r.amount} {r.amountUnit === "HOUR" ? "ساعت" : "روز"}
                    </td>
                    <td className="p-2 text-center">{STATUS_FA[r.status] || r.status}</td>
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