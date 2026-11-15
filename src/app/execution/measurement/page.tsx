"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import DatePicker, { DateObject } from "react-multi-date-picker"
import persian from "react-date-object/calendars/persian"
import persian_fa from "react-date-object/locales/persian_fa"

type Measurement = {
  id: string
  measurementNumber: string
  introducerName?: string | null
  sources?: string | null
  customerName: string
  phones: string
  address?: string | null
  addressMedia?: string | null
  workTypes?: string | null
  workTypeOther?: string | null
  requestDate: string
  measurementDate?: string | null
  status: string
  salesRep?: string | null
  assignedTo?: string | null
  resultNotes?: string | null
  resultMedia?: string | null
  voiceNotes?: string | null
  orderNumber?: string | null
  notes?: string | null
  createdAt: string
}

type SortKey =
  | "measurementNumber"
  | "customerName"
  | "measurementDate"
  | "requestDate"
  | "salesRep"
  | "status"

const SOURCE_OPTIONS = [
  "مشتری حضوری",
  "تلفن",
  "واتساپ",
  "اینستاگرام",
  "سایت",
  "معرف",
  "سایر",
]

const WORK_OPTIONS = [
  "آینه دکوراتیو",
  "پارتیشن",
  "سکوریت",
  "حمام شیشه‌ای",
  "نرده شیشه‌ای",
  "باکس",
  "سایر",
]

function parseJsonArray(raw?: string | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

function formatFa(dt?: string | null) {
  if (!dt) return "—"
  try {
    return new Date(dt).toLocaleDateString("fa-IR")
  } catch {
    return "—"
  }
}

function defaultMeasurementDate(): DateObject {
  const d = new Date()
  d.setDate(d.getDate() + 2)
  return new DateObject({ date: d, calendar: persian, locale: persian_fa })
}

export default function MeasurementPage() {
  const [tab, setTab] = useState<"PENDING" | "DONE">("PENDING")
  const [items, setItems] = useState<Measurement[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("measurementDate")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [currentUser, setCurrentUser] = useState("")

  // فرم ثبت (فروش)
  const [introducerName, setIntroducerName] = useState("")
  const [sources, setSources] = useState<string[]>([])
  const [customerName, setCustomerName] = useState("")
  const [phones, setPhones] = useState<string[]>([""])
  const [address, setAddress] = useState("")
  const [addressFiles, setAddressFiles] = useState<{ url: string; name: string }[]>([])
  const [workTypes, setWorkTypes] = useState<string[]>([])
  const [workTypeOther, setWorkTypeOther] = useState("")
  const [requestDate, setRequestDate] = useState<any>(
    new DateObject({ calendar: persian, locale: persian_fa })
  )
  const [measurementDate, setMeasurementDate] = useState<any>(defaultMeasurementDate())
  const [notes, setNotes] = useState("")

  // پنل نصاب
  const [detail, setDetail] = useState<Measurement | null>(null)
  const [resultNotes, setResultNotes] = useState("")
  const [resultFiles, setResultFiles] = useState<{ url: string; name: string; type?: string }[]>([])
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch("/api/auth/me")
        if (res.ok) {
          const data = await res.json()
          if (data.user?.displayName) setCurrentUser(data.user.displayName)
        }
      } catch {}
    })()
  }, [])

  const fetchList = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/measurements?status=${tab}&q=${encodeURIComponent(search)}`)
      const data = await res.json()
      setItems(data.items || [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const sorted = useMemo(() => {
    const arr = [...items]
    arr.sort((a, b) => {
      const av = (a as any)[sortKey] ?? ""
      const bv = (b as any)[sortKey] ?? ""
      if (av < bv) return sortDir === "asc" ? -1 : 1
      if (av > bv) return sortDir === "asc" ? 1 : -1
      return 0
    })
    return arr
  }, [items, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const sortMark = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : ""

  const toggleIn = (list: string[], value: string, set: (v: string[]) => void) => {
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value])
  }

  const uploadFile = async (file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch("/api/upload", { method: "POST", body: fd })
    if (!res.ok) throw new Error("آپلود ناموفق")
    return res.json() as Promise<{ url: string; name: string; type?: string }>
  }

  const resetForm = () => {
    setIntroducerName("")
    setSources([])
    setCustomerName("")
    setPhones([""])
    setAddress("")
    setAddressFiles([])
    setWorkTypes([])
    setWorkTypeOther("")
    setRequestDate(new DateObject({ calendar: persian, locale: persian_fa }))
    setMeasurementDate(defaultMeasurementDate())
    setNotes("")
  }

  const submitForm = async () => {
    if (!customerName.trim()) return alert("نام مشتری الزامی است")
    const cleanPhones = phones.map((p) => p.trim()).filter(Boolean)
    if (!cleanPhones.length) return alert("حداقل یک شماره تلفن لازم است")

    setSaving(true)
    try {
      const res = await fetch("/api/measurements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          introducerName,
          sources,
          customerName,
          phones: cleanPhones,
          address,
          addressMedia: addressFiles.map((f) => f.url),
          workTypes,
          workTypeOther,
          requestDate: requestDate?.toDate?.()?.toISOString?.() || new Date().toISOString(),
          measurementDate:
            measurementDate?.toDate?.()?.toISOString?.() ||
            new Date(Date.now() + 2 * 86400000).toISOString(),
          notes,
          salesRep: currentUser,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا")
      setShowForm(false)
      resetForm()
      setTab("PENDING")
      fetchList()
      alert(`ثبت شد: ${data.item?.measurementNumber || ""}`)
    } catch (e: any) {
      alert(e.message || "خطا در ثبت")
    } finally {
      setSaving(false)
    }
  }

  const openDetail = (row: Measurement) => {
    setDetail(row)
    setResultNotes(row.resultNotes || "")
    setResultFiles(
      parseJsonArray(row.resultMedia).map((url) => ({ url, name: url.split("/").pop() || "file" }))
    )
  }

  const saveInstaller = async (markDone: boolean) => {
    if (!detail) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/measurements/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resultNotes,
          resultMedia: resultFiles.map((f) => f.url),
          status: markDone ? "DONE" : detail.status,
          assignedTo: currentUser || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا")
      setDetail(null)
      fetchList()
    } catch (e: any) {
      alert(e.message || "خطا")
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen p-4 md:p-6 bg-cover bg-center bg-fixed"
      dir="rtl"
      style={{
        fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif",
        backgroundImage:
          "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')",
      }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-xl border border-teal-300 bg-white/80 px-4 py-2 font-bold text-blue-900"
            >
              بازگشت
            </Link>
            <h1 className="text-xl md:text-2xl font-black text-blue-950">اندازه‌گیری</h1>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold px-5 py-2.5 shadow"
          >
            + ثبت درخواست (فروش)
          </button>
        </div>

        {/* تب‌ها */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab("PENDING")}
            className={`rounded-xl px-4 py-2 font-bold border ${
              tab === "PENDING"
                ? "bg-teal-600 text-white border-teal-700"
                : "bg-white/80 text-blue-900 border-teal-200"
            }`}
          >
            انجام‌نشده
          </button>
          <button
            onClick={() => setTab("DONE")}
            className={`rounded-xl px-4 py-2 font-bold border ${
              tab === "DONE"
                ? "bg-teal-600 text-white border-teal-700"
                : "bg-white/80 text-blue-900 border-teal-200"
            }`}
          >
            انجام‌شده
          </button>
        </div>

        {/* فیلتر */}
        <div className="rounded-2xl bg-white/85 backdrop-blur border border-teal-200 p-4 mb-4 shadow flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-bold text-blue-900 mb-1">جستجو</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="نام، تلفن، شماره اندازه‌گیری، آدرس..."
              className="w-full rounded-xl border border-teal-300 px-3 py-2 font-semibold"
            />
          </div>
          <button
            onClick={fetchList}
            className="rounded-xl bg-blue-900 text-white font-bold px-5 py-2"
          >
            اعمال
          </button>
        </div>

        {/* جدول */}
        <div className="rounded-2xl bg-white/90 border border-teal-200 shadow overflow-x-auto">
          {loading ? (
            <p className="p-6 text-center font-bold text-blue-800">در حال بارگذاری...</p>
          ) : sorted.length === 0 ? (
            <p className="p-6 text-center font-bold text-gray-600">موردی نیست</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-teal-700 text-white">
                  <th className="p-2 border border-teal-800">ردیف</th>
                  <th
                    className="p-2 border border-teal-800 cursor-pointer"
                    onClick={() => toggleSort("measurementNumber")}
                  >
                    شماره اندازه‌گیری{sortMark("measurementNumber")}
                  </th>
                  <th
                    className="p-2 border border-teal-800 cursor-pointer"
                    onClick={() => toggleSort("customerName")}
                  >
                    مشتری{sortMark("customerName")}
                  </th>
                  <th className="p-2 border border-teal-800">تلفن</th>
                  <th className="p-2 border border-teal-800">نوع کار</th>
                  <th
                    className="p-2 border border-teal-800 cursor-pointer"
                    onClick={() => toggleSort("requestDate")}
                  >
                    تاریخ ثبت{sortMark("requestDate")}
                  </th>
                  <th
                    className="p-2 border border-teal-800 cursor-pointer"
                    onClick={() => toggleSort("measurementDate")}
                  >
                    تاریخ اندازه‌گیری{sortMark("measurementDate")}
                  </th>
                  <th
                    className="p-2 border border-teal-800 cursor-pointer"
                    onClick={() => toggleSort("salesRep")}
                  >
                    کارشناس{sortMark("salesRep")}
                  </th>
                  <th className="p-2 border border-teal-800">وضعیت</th>
                  <th className="p-2 border border-teal-800">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, idx) => {
                  const ph = parseJsonArray(row.phones).join(" / ")
                  const wt = [
                    ...parseJsonArray(row.workTypes),
                    row.workTypeOther || "",
                  ]
                    .filter(Boolean)
                    .join("، ")
                  return (
                    <tr key={row.id} className="odd:bg-white even:bg-teal-50/40 hover:bg-teal-100/50">
                      <td className="p-2 border border-teal-100 text-center font-bold">
                        {idx + 1}
                      </td>
                      <td className="p-2 border border-teal-100 text-center font-black text-teal-800">
                        {row.measurementNumber}
                      </td>
                      <td className="p-2 border border-teal-100 font-bold">{row.customerName}</td>
                      <td className="p-2 border border-teal-100 text-center dir-ltr">{ph || "—"}</td>
                      <td className="p-2 border border-teal-100 text-xs">{wt || "—"}</td>
                      <td className="p-2 border border-teal-100 text-center">
                        {formatFa(row.requestDate)}
                      </td>
                      <td className="p-2 border border-teal-100 text-center font-semibold">
                        {formatFa(row.measurementDate)}
                      </td>
                      <td className="p-2 border border-teal-100 text-center">
                        {row.salesRep || "—"}
                      </td>
                      <td className="p-2 border border-teal-100 text-center">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            row.status === "DONE"
                              ? "bg-green-100 text-green-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {row.status === "DONE" ? "انجام‌شده" : "انجام‌نشده"}
                        </span>
                      </td>
                      <td className="p-2 border border-teal-100 text-center">
                        <button
                          onClick={() => openDetail(row)}
                          className="rounded-lg bg-blue-900 text-white text-xs font-bold px-3 py-1.5"
                        >
                          {row.status === "PENDING" ? "ثبت نتیجه / اتمام" : "مشاهده"}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <p className="mt-2 text-xs text-blue-900/80 font-semibold">
          ثبت درخواست توسط کارشناس فروش است. تکمیل عکس/توضیح و اتمام کار توسط نصاب انجام می‌شود.
        </p>
      </div>

      {/* مودال ثبت فروش */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-5 shadow-2xl">
            <h2 className="text-lg font-black text-blue-950 mb-4">ثبت درخواست اندازه‌گیری</h2>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold">نام معرف</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={introducerName}
                  onChange={(e) => setIntroducerName(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-bold mb-1 block">ورودی از کجا؟</label>
                <div className="flex flex-wrap gap-2">
                  {SOURCE_OPTIONS.map((s) => (
                    <label key={s} className="flex items-center gap-1 text-sm border rounded-lg px-2 py-1">
                      <input
                        type="checkbox"
                        checked={sources.includes(s)}
                        onChange={() => toggleIn(sources, s, setSources)}
                      />
                      {s}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold">نام و نام خانوادگی *</label>
                <input
                  className="w-full rounded-xl border px-3 py-2 font-bold"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-bold mb-1 block">شماره تلفن *</label>
                {phones.map((p, i) => (
                  <div key={i} className="flex gap-2 mb-1">
                    <input
                      className="flex-1 rounded-xl border px-3 py-2"
                      dir="ltr"
                      value={p}
                      onChange={(e) => {
                        const next = [...phones]
                        next[i] = e.target.value
                        setPhones(next)
                      }}
                    />
                    {phones.length > 1 && (
                      <button
                        type="button"
                        className="text-red-600 font-bold px-2"
                        onClick={() => setPhones(phones.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="text-teal-700 text-sm font-bold"
                  onClick={() => setPhones([...phones, ""])}
                >
                  + تلفن دیگر
                </button>
              </div>

              <div>
                <label className="text-xs font-bold">آدرس *</label>
                <textarea
                  className="w-full rounded-xl border px-3 py-2"
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="mt-1 text-sm"
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    try {
                      const up = await uploadFile(f)
                      setAddressFiles((prev) => [...prev, up])
                    } catch {
                      alert("خطا در آپلود")
                    }
                  }}
                />
                {addressFiles.length > 0 && (
                  <ul className="text-xs mt-1 text-teal-800">
                    {addressFiles.map((f) => (
                      <li key={f.url}>📎 {f.name}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <label className="text-xs font-bold mb-1 block">نوع کار</label>
                <div className="flex flex-wrap gap-2">
                  {WORK_OPTIONS.map((w) => (
                    <label key={w} className="flex items-center gap-1 text-sm border rounded-lg px-2 py-1">
                      <input
                        type="checkbox"
                        checked={workTypes.includes(w)}
                        onChange={() => toggleIn(workTypes, w, setWorkTypes)}
                      />
                      {w}
                    </label>
                  ))}
                </div>
                {workTypes.includes("سایر") && (
                  <input
                    className="w-full rounded-xl border px-3 py-2 mt-1"
                    placeholder="توضیح نوع کار"
                    value={workTypeOther}
                    onChange={(e) => setWorkTypeOther(e.target.value)}
                  />
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold block mb-1">تاریخ ثبت</label>
                  <DatePicker
                    value={requestDate}
                    onChange={setRequestDate}
                    calendar={persian}
                    locale={persian_fa}
                    calendarPosition="bottom-right"
                    inputClass="w-full rounded-xl border px-3 py-2"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1">
                    تاریخ اندازه‌گیری (پیش‌فرض +۲ روز)
                  </label>
                  <DatePicker
                    value={measurementDate}
                    onChange={setMeasurementDate}
                    calendar={persian}
                    locale={persian_fa}
                    calendarPosition="bottom-right"
                    inputClass="w-full rounded-xl border px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold">توضیحات</label>
                <textarea
                  className="w-full rounded-xl border px-3 py-2"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                className="rounded-xl border px-4 py-2 font-bold"
                onClick={() => setShowForm(false)}
              >
                انصراف
              </button>
              <button
                disabled={saving}
                className="rounded-xl bg-teal-600 text-white font-bold px-5 py-2 disabled:opacity-50"
                onClick={submitForm}
              >
                {saving ? "..." : "ثبت درخواست"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* مودال نصاب */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[92vh] overflow-y-auto p-5 shadow-2xl">
            <h2 className="text-lg font-black text-blue-950 mb-1">
              {detail.measurementNumber} — {detail.customerName}
            </h2>
            <p className="text-sm text-gray-600 mb-3">
              آدرس: {detail.address || "—"} | تلفن:{" "}
              {parseJsonArray(detail.phones).join(" / ")}
            </p>
            <p className="text-xs text-blue-800 mb-3">
              کارشناس ثبت‌کننده: {detail.salesRep || "—"} | اندازه‌گیری:{" "}
              {formatFa(detail.measurementDate)}
            </p>

            <label className="text-xs font-bold">توضیحات نصاب / نتیجه اندازه‌گیری</label>
            <textarea
              className="w-full rounded-xl border px-3 py-2 mb-2"
              rows={3}
              value={resultNotes}
              onChange={(e) => setResultNotes(e.target.value)}
              disabled={detail.status === "DONE"}
            />

            {detail.status !== "DONE" && (
              <input
                type="file"
                accept="image/*,video/*,audio/*"
                className="text-sm mb-2"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  try {
                    const up = await uploadFile(f)
                    setResultFiles((prev) => [...prev, up])
                  } catch {
                    alert("خطا در آپلود")
                  }
                }}
              />
            )}
            {resultFiles.length > 0 && (
              <ul className="text-xs text-teal-800 mb-3">
                {resultFiles.map((f) => (
                  <li key={f.url}>
                    <a href={f.url} target="_blank" rel="noreferrer" className="underline">
                      {f.name}
                    </a>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap gap-2 justify-end">
              <button
                className="rounded-xl border px-4 py-2 font-bold"
                onClick={() => setDetail(null)}
              >
                بستن
              </button>
              {detail.status !== "DONE" && (
                <>
                  <button
                    disabled={actionLoading}
                    className="rounded-xl bg-blue-800 text-white font-bold px-4 py-2"
                    onClick={() => saveInstaller(false)}
                  >
                    ذخیره پیش‌نویس
                  </button>
                  <button
                    disabled={actionLoading}
                    className="rounded-xl bg-green-600 text-white font-bold px-4 py-2"
                    onClick={() => saveInstaller(true)}
                  >
                    اتمام و انتقال به انجام‌شده
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}