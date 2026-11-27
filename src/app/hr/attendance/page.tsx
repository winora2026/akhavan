"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import DatePicker, { DateObject } from "react-multi-date-picker"
import persian from "react-date-object/calendars/persian"
import persian_fa from "react-date-object/locales/persian_fa"

const BG =
  "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')"

type Emp = {
  id: string
  personnelCode: string
  displayName: string
  groupName?: string | null
}

type Row = {
  id: string
  date: string
  checkIn?: string | null
  checkOut?: string | null
  workMinutes?: number | null
  delayMinutes?: number | null
  earlyMinutes?: number | null
  overtimeMin?: number | null
  shiftName?: string | null
  deviceName?: string | null
  source?: string
  notes?: string | null
  employee: {
    personnelCode: string
    displayName: string
    groupName?: string | null
    department?: string | null
  }
}

function formatFa(d?: string) {
  if (!d) return "—"
  try {
    return new Date(d).toLocaleDateString("fa-IR")
  } catch {
    return "—"
  }
}

function fmtMin(m?: number | null) {
  if (m == null || Number.isNaN(m)) return "—"
  const h = Math.floor(m / 60)
  const min = m % 60
  if (h <= 0) return `${min}د`
  return `${h}:${String(min).padStart(2, "0")}`
}

export default function AttendancePage() {
  const [items, setItems] = useState<Row[]>([])
  const [summary, setSummary] = useState<{
    count: number
    totalWorkMinutes: number
    totalDelayMinutes: number
  } | null>(null)
  const [employees, setEmployees] = useState<Emp[]>([])
  const [loading, setLoading] = useState(false)

  const [from, setFrom] = useState<any>(
    new DateObject({ calendar: persian, locale: persian_fa })
  )
  const [to, setTo] = useState<any>(
    new DateObject({ calendar: persian, locale: persian_fa })
  )
  const [q, setQ] = useState("")
  const [employeeId, setEmployeeId] = useState("")

  // ثبت دستی
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    employeeId: "",
    date: new DateObject({ calendar: persian, locale: persian_fa }) as any,
    checkIn: "08:00",
    checkOut: "17:00",
    delayMinutes: "",
    notes: "",
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch("/api/hr/employees")
        const data = await res.json()
        setEmployees(data.items || [])
      } catch {}
    })()
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (from?.toDate) params.set("from", from.toDate().toISOString())
      if (to?.toDate) params.set("to", to.toDate().toISOString())
      if (q.trim()) params.set("q", q.trim())
      if (employeeId) params.set("employeeId", employeeId)

      const res = await fetch(`/api/hr/attendance?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا")
      setItems(data.items || [])
      setSummary(data.summary || null)
    } catch (e: any) {
      alert(e.message)
      setItems([])
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submitManual = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.employeeId) return alert("پرسنل را انتخاب کنید")
    if (!form.date) return alert("تاریخ را انتخاب کنید")
    setSaving(true)
    try {
      const res = await fetch("/api/hr/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: form.employeeId,
          date: form.date.toDate().toISOString(),
          checkIn: form.checkIn,
          checkOut: form.checkOut,
          delayMinutes: form.delayMinutes ? Number(form.delayMinutes) : null,
          notes: form.notes || null,
          source: "MANUAL",
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || data.errors?.[0] || "خطا")
      setShowForm(false)
      load()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  /** Import ساده CSV: personnelCode,date,checkIn,checkOut */
  const onImportFile = async (file: File) => {
    const text = await file.text()
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length < 2) return alert("فایل خالی است")

    const header = lines[0].split(/[,;\t]/).map((h) => h.trim().toLowerCase())
    const idx = (names: string[]) =>
      header.findIndex((h) => names.some((n) => h.includes(n)))

    const iCode = idx(["code", "personnel", "کد", "شماره"])
    const iDate = idx(["date", "تاریخ"])
    const iIn = idx(["in", "ورود", "checkin"])
    const iOut = idx(["out", "خروج", "checkout"])

    if (iCode < 0 || iDate < 0) {
      return alert(
        "ستون کد پرسنلی و تاریخ الزامی است. مثال هدر: personnelCode,date,checkIn,checkOut"
      )
    }

    const items = []
    for (let li = 1; li < lines.length; li++) {
      const cols = lines[li].split(/[,;\t]/)
      const code = (cols[iCode] || "").trim()
      const dateRaw = (cols[iDate] || "").trim()
      if (!code || !dateRaw) continue
      items.push({
        personnelCode: code,
        date: dateRaw,
        checkIn: iIn >= 0 ? (cols[iIn] || "").trim() : null,
        checkOut: iOut >= 0 ? (cols[iOut] || "").trim() : null,
        source: "IMPORT",
      })
    }

    if (!items.length) return alert("ردیفی پیدا نشد")

    const res = await fetch("/api/hr/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    })
    const data = await res.json()
    if (!res.ok) return alert(data.error || "خطا در ورود فایل")
    alert(
      `ثبت شد: ${data.created}${data.errors?.length ? ` | خطا: ${data.errors.length}` : ""}`
    )
    load()
  }

  const groups = useMemo(() => {
    const s = new Set<string>()
    employees.forEach((e) => {
      if (e.groupName) s.add(e.groupName)
    })
    return Array.from(s)
  }, [employees])

  return (
    <div
      className="min-h-screen p-4 md:p-6 bg-cover bg-center bg-fixed"
      dir="rtl"
      style={{
        fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif",
        backgroundImage: BG,
      }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Link
            href="/"
            className="rounded-xl bg-white/90 border border-teal-200 px-4 py-2 font-bold text-blue-900"
          >
            بازگشت
          </Link>
          <h1 className="text-xl md:text-2xl font-black text-blue-950">
            گزارش تردد روزانه
          </h1>
          <div className="mr-auto flex flex-wrap gap-2">
            <Link
              href="/hr/leave"
              className="text-sm font-bold text-teal-800 underline"
            >
              مرخصی
            </Link>
            <Link
              href="/hr/employees"
              className="text-sm font-bold text-teal-800 underline"
            >
              پرسنل
            </Link>
            <Link
              href="/hr/approvals"
              className="text-sm font-bold text-teal-800 underline"
            >
              کارتابل مدیر
            </Link>
          </div>
        </div>

        {/* فیلتر */}
        <div className="rounded-2xl bg-white/90 backdrop-blur border border-teal-200 p-4 mb-4 shadow flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-bold text-blue-900 mb-1">
              از تاریخ
            </label>
            <DatePicker
              value={from}
              onChange={setFrom}
              calendar={persian}
              locale={persian_fa}
              inputClass="rounded-xl border border-teal-300 px-3 py-2 w-[130px]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-blue-900 mb-1">
              تا تاریخ
            </label>
            <DatePicker
              value={to}
              onChange={setTo}
              calendar={persian}
              locale={persian_fa}
              inputClass="rounded-xl border border-teal-300 px-3 py-2 w-[130px]"
            />
          </div>
          <div className="min-w-[160px]">
            <label className="block text-xs font-bold text-blue-900 mb-1">
              پرسنل
            </label>
            <select
              className="w-full rounded-xl border border-teal-300 px-3 py-2 font-semibold"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">همه</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.personnelCode} — {e.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-bold text-blue-900 mb-1">
              جستجو
            </label>
            <input
              className="w-full rounded-xl border border-teal-300 px-3 py-2 font-semibold"
              placeholder="کد یا نام..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <button
            onClick={load}
            className="rounded-xl bg-blue-900 text-white font-bold px-5 py-2"
          >
            نمایش
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="rounded-xl bg-teal-600 text-white font-bold px-4 py-2"
          >
            + ثبت دستی
          </button>
          <label className="rounded-xl border border-teal-400 bg-white px-4 py-2 font-bold text-teal-800 cursor-pointer text-sm">
            ورود CSV
            <input
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onImportFile(f)
                e.target.value = ""
              }}
            />
          </label>
        </div>

        {/* خلاصه */}
        {summary && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl bg-white/90 border border-teal-200 p-3 text-center">
              <p className="text-xs text-blue-700">تعداد رکورد</p>
              <p className="text-xl font-black text-teal-800">{summary.count}</p>
            </div>
            <div className="rounded-xl bg-white/90 border border-teal-200 p-3 text-center">
              <p className="text-xs text-blue-700">جمع کارکرد</p>
              <p className="text-xl font-black text-teal-800">
                {fmtMin(summary.totalWorkMinutes)}
              </p>
            </div>
            <div className="rounded-xl bg-white/90 border border-teal-200 p-3 text-center">
              <p className="text-xs text-blue-700">جمع تأخیر</p>
              <p className="text-xl font-black text-orange-700">
                {fmtMin(summary.totalDelayMinutes)}
              </p>
            </div>
          </div>
        )}

        {/* جدول */}
        <div className="rounded-2xl bg-white/90 border border-teal-200 shadow overflow-x-auto">
          {loading ? (
            <p className="p-8 text-center font-bold">در حال بارگذاری...</p>
          ) : items.length === 0 ? (
            <p className="p-8 text-center font-bold text-gray-600">
              رکوردی نیست. از ثبت دستی یا ورود CSV استفاده کنید؛ بعداً به
              پردازش‌تردد وصل می‌شود.
            </p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-teal-700 text-white">
                  <th className="p-2 border border-teal-800">ردیف</th>
                  <th className="p-2 border border-teal-800">کد</th>
                  <th className="p-2 border border-teal-800">نام</th>
                  <th className="p-2 border border-teal-800">گروه</th>
                  <th className="p-2 border border-teal-800">تاریخ</th>
                  <th className="p-2 border border-teal-800">ورود</th>
                  <th className="p-2 border border-teal-800">خروج</th>
                  <th className="p-2 border border-teal-800">کارکرد</th>
                  <th className="p-2 border border-teal-800">تأخیر</th>
                  <th className="p-2 border border-teal-800">شیفت</th>
                  <th className="p-2 border border-teal-800">منبع</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r, idx) => (
                  <tr
                    key={r.id}
                    className="odd:bg-white even:bg-teal-50/40 border-b border-teal-100"
                  >
                    <td className="p-2 text-center font-bold">{idx + 1}</td>
                    <td className="p-2 text-center font-black text-teal-800">
                      {r.employee.personnelCode}
                    </td>
                    <td className="p-2 font-bold">{r.employee.displayName}</td>
                    <td className="p-2 text-center text-xs">
                      {r.employee.groupName || "—"}
                    </td>
                    <td className="p-2 text-center">{formatFa(r.date)}</td>
                    <td className="p-2 text-center font-bold dir-ltr">
                      {r.checkIn || "—"}
                    </td>
                    <td className="p-2 text-center font-bold dir-ltr">
                      {r.checkOut || "—"}
                    </td>
                    <td className="p-2 text-center">{fmtMin(r.workMinutes)}</td>
                    <td className="p-2 text-center text-orange-700 font-semibold">
                      {fmtMin(r.delayMinutes)}
                    </td>
                    <td className="p-2 text-center text-xs">
                      {r.shiftName || "—"}
                    </td>
                    <td className="p-2 text-center text-xs">
                      {r.source === "IMPORT"
                        ? "فایل"
                        : r.source === "API"
                          ? "API"
                          : "دستی"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="mt-2 text-xs font-semibold text-blue-900/80 bg-white/70 rounded-xl px-3 py-2 border border-teal-100 inline-block">
          فرمت CSV:{" "}
          <span className="font-mono" dir="ltr">
            personnelCode,date,checkIn,checkOut
          </span>{" "}
          — کد پرسنلی باید در لیست پرسنل باشد.
        </p>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3">
          <form
            onSubmit={submitManual}
            className="bg-white rounded-2xl p-5 w-full max-w-md space-y-3 shadow-2xl"
          >
            <h2 className="font-black text-lg text-blue-950">ثبت تردد دستی</h2>
            <div>
              <label className="text-xs font-bold">پرسنل</label>
              <select
                className="w-full rounded-xl border px-3 py-2"
                value={form.employeeId}
                onChange={(e) =>
                  setForm({ ...form, employeeId: e.target.value })
                }
                required
              >
                <option value="">انتخاب...</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.personnelCode} — {e.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold">تاریخ</label>
              <DatePicker
                value={form.date}
                onChange={(d) => setForm({ ...form, date: d })}
                calendar={persian}
                locale={persian_fa}
                inputClass="w-full rounded-xl border px-3 py-2"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold">ورود</label>
                <input
                  type="time"
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.checkIn}
                  onChange={(e) =>
                    setForm({ ...form, checkIn: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-xs font-bold">خروج</label>
                <input
                  type="time"
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.checkOut}
                  onChange={(e) =>
                    setForm({ ...form, checkOut: e.target.value })
                  }
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold">تأخیر (دقیقه)</label>
              <input
                type="number"
                className="w-full rounded-xl border px-3 py-2"
                value={form.delayMinutes}
                onChange={(e) =>
                  setForm({ ...form, delayMinutes: e.target.value })
                }
              />
            </div>
            <div>
              <label className="text-xs font-bold">توضیح</label>
              <input
                className="w-full rounded-xl border px-3 py-2"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-xl border px-4 py-2 font-bold"
              >
                انصراف
              </button>
              <button
                disabled={saving}
                className="rounded-xl bg-teal-600 text-white font-bold px-4 py-2 disabled:opacity-50"
              >
                {saving ? "..." : "ذخیره"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}