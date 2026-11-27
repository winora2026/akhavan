"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import DatePicker from "react-multi-date-picker"
import persian from "react-date-object/calendars/persian"
import persian_fa from "react-date-object/locales/persian_fa"

const LEAVE_TYPES = [
  "مرخصی استحقاقی",
  "مرخصی استعلاجی",
  "مرخصی تشویقی",
  "مرخصی بدون حقوق",
  "مأموریت",
  "سایر",
]

type Row = {
  id: string
  type: string
  startDate: string
  endDate: string
  days: number
  description?: string | null
  status: string
  requestedBy?: string | null
  reviewedBy?: string | null
  reviewNote?: string | null
  employee?: { displayName: string; personnelCode: string }
}

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

export default function MyLeavePage() {
  const [items, setItems] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [type, setType] = useState(LEAVE_TYPES[0])
  const [start, setStart] = useState<any>(null)
  const [end, setEnd] = useState<any>(null)
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
    if (!start || !end) return alert("تاریخ شروع و پایان را انتخاب کنید")
    setSaving(true)
    try {
      const res = await fetch("/api/hr/leave-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          startDate: start.toDate?.() ? start.toDate().toISOString() : start,
          endDate: end.toDate?.() ? end.toDate().toISOString() : end,
          description,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا")
      setDescription("")
      setStart(null)
      setEnd(null)
      load()
      alert("درخواست ثبت شد و برای مدیر ارسال گردید")
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  const cancel = async (id: string) => {
    if (!confirm("لغو درخواست؟")) return
    const res = await fetch(`/api/hr/leave-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "CANCEL" }),
    })
    if (!res.ok) {
      const d = await res.json()
      return alert(d.error || "خطا")
    }
    load()
  }

  return (
    <div className="min-h-screen p-4 md:p-6 bg-slate-50" dir="rtl">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/" className="rounded-xl border px-4 py-2 font-bold">
            بازگشت
          </Link>
          <h1 className="text-xl font-black">درخواست مرخصی / مأموریت</h1>
          <Link
            href="/hr/approvals"
            className="mr-auto text-sm font-bold text-teal-700 underline"
          >
            کارتابل مدیر
          </Link>
        </div>

        <form
          onSubmit={submit}
          className="rounded-2xl bg-white border p-4 mb-6 shadow-sm space-y-3"
        >
          <div>
            <label className="text-xs font-bold">نوع</label>
            <select
              className="w-full rounded-xl border px-3 py-2 font-semibold"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {LEAVE_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold">از تاریخ</label>
              <DatePicker
                value={start}
                onChange={setStart}
                calendar={persian}
                locale={persian_fa}
                inputClass="w-full rounded-xl border px-3 py-2"
                calendarPosition="bottom-right"
              />
            </div>
            <div>
              <label className="text-xs font-bold">تا تاریخ</label>
              <DatePicker
                value={end}
                onChange={setEnd}
                calendar={persian}
                locale={persian_fa}
                inputClass="w-full rounded-xl border px-3 py-2"
                calendarPosition="bottom-right"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold">توضیحات</label>
            <textarea
              className="w-full rounded-xl border px-3 py-2"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <button
            disabled={saving}
            className="rounded-xl bg-teal-600 text-white font-bold px-5 py-2.5 disabled:opacity-50"
          >
            {saving ? "..." : "ثبت درخواست"}
          </button>
        </form>

        <div className="rounded-2xl bg-white border shadow-sm overflow-x-auto">
          {loading ? (
            <p className="p-4 text-center">...</p>
          ) : items.length === 0 ? (
            <p className="p-4 text-center text-gray-500">درخواستی ثبت نشده</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-teal-700 text-white">
                <tr>
                  <th className="p-2">نوع</th>
                  <th className="p-2">از</th>
                  <th className="p-2">تا</th>
                  <th className="p-2">روز</th>
                  <th className="p-2">وضعیت</th>
                  <th className="p-2">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className="border-b odd:bg-slate-50">
                    <td className="p-2 font-bold">{r.type}</td>
                    <td className="p-2 text-center">{formatFa(r.startDate)}</td>
                    <td className="p-2 text-center">{formatFa(r.endDate)}</td>
                    <td className="p-2 text-center">{r.days}</td>
                    <td className="p-2 text-center">
                      {STATUS_FA[r.status] || r.status}
                      {r.reviewNote ? (
                        <div className="text-xs text-gray-500">{r.reviewNote}</div>
                      ) : null}
                    </td>
                    <td className="p-2 text-center">
                      {r.status === "PENDING" && (
                        <button
                          className="text-red-600 text-xs font-bold"
                          onClick={() => cancel(r.id)}
                        >
                          لغو
                        </button>
                      )}
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