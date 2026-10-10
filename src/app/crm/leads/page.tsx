"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

type Lead = {
  id: string
  name: string
  companyName?: string | null
  mobile?: string | null
  phone?: string | null
  city?: string | null
  source: string
  status: string
  productInterest?: string | null
  nextAction?: string | null
  nextActionDate?: string | null
  estimatedValue?: number | null
  assignedTo?: { displayName: string } | null
  createdAt: string
}

const SOURCES = [
  "همه",
  "Phone",
  "WhatsApp",
  "Instagram",
  "Website",
  "Referral",
  "Walk-in",
  "Other",
]

const STATUSES = [
  { value: "همه", label: "همه وضعیت‌ها" },
  { value: "NEW", label: "جدید" },
  { value: "CONTACTED", label: "تماس گرفته" },
  { value: "QUALIFIED", label: "واجد شرایط" },
  { value: "UNQUALIFIED", label: "رد صلاحیت" },
  { value: "CONVERTED", label: "تبدیل‌شده" },
  { value: "LOST", label: "از دست رفته" },
]

const STATUS_LABEL: Record<string, string> = {
  NEW: "جدید",
  CONTACTED: "تماس گرفته",
  QUALIFIED: "واجد شرایط",
  UNQUALIFIED: "رد صلاحیت",
  CONVERTED: "تبدیل‌شده",
  LOST: "از دست رفته",
}

function formatFa(dt?: string | null) {
  if (!dt) return "—"
  try {
    return new Date(dt).toLocaleString("fa-IR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return "—"
  }
}

function isOverdue(dt?: string | null) {
  if (!dt) return false
  return new Date(dt).getTime() < Date.now()
}

export default function CrmLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [q, setQ] = useState("")
  const [status, setStatus] = useState("همه")
  const [source, setSource] = useState("همه")
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name: "",
    mobile: "",
    companyName: "",
    city: "",
    source: "Phone",
    productInterest: "",
    description: "",
    nextAction: "تماس اولیه",
    nextActionDate: "",
    estimatedValue: "",
  })

  const load = async () => {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set("q", q.trim())
      if (status !== "همه") params.set("status", status)
      if (source !== "همه") params.set("source", source)
      const res = await fetch(`/api/crm/leads?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا در دریافت")
      setLeads(Array.isArray(data) ? data : [])
    } catch (e: any) {
      setError(e.message || "خطا")
      setLeads([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stats = useMemo(() => {
    const total = leads.length
    const overdue = leads.filter((l) => isOverdue(l.nextActionDate)).length
    const today = leads.filter((l) => {
      if (!l.nextActionDate) return false
      const d = new Date(l.nextActionDate)
      const n = new Date()
      return (
        d.getFullYear() === n.getFullYear() &&
        d.getMonth() === n.getMonth() &&
        d.getDate() === n.getDate()
      )
    }).length
    return { total, overdue, today }
  }, [leads])

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      alert("نام الزامی است")
      return
    }
    if (!form.nextAction.trim() || !form.nextActionDate) {
      alert("اقدام بعدی و تاریخ آن الزامی است")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/crm/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          mobile: form.mobile.trim() || null,
          companyName: form.companyName.trim() || null,
          city: form.city.trim() || null,
          source: form.source,
          productInterest: form.productInterest.trim() || null,
          description: form.description.trim() || null,
          nextAction: form.nextAction.trim(),
          nextActionDate: new Date(form.nextActionDate).toISOString(),
          estimatedValue: form.estimatedValue
            ? Number(form.estimatedValue)
            : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا در ذخیره")
      setShowForm(false)
      setForm({
        name: "",
        mobile: "",
        companyName: "",
        city: "",
        source: "Phone",
        productInterest: "",
        description: "",
        nextAction: "تماس اولیه",
        nextActionDate: "",
        estimatedValue: "",
      })
      await load()
    } catch (err: any) {
      alert(err.message || "خطا")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="min-h-screen p-4 md:p-6"
      dir="rtl"
      style={{
        fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif",
        backgroundImage:
          "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')",
        backgroundSize: "cover",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-black text-blue-950">CRM · سرنخ‌ها (Lead)</h1>
            <p className="text-sm text-blue-800 mt-1">
              هیچ سرنخی بدون اقدام بعدی نماند
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/"
              className="rounded-xl border border-teal-300 bg-white/80 px-4 py-2 font-bold text-blue-900"
            >
              داشبورد
            </Link>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="rounded-xl bg-teal-600 hover:bg-teal-700 px-4 py-2 font-bold text-white"
            >
              + سرنخ جدید
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="rounded-2xl bg-white/85 border border-teal-200 p-4 text-center">
            <p className="text-sm text-blue-700">تعداد در لیست</p>
            <p className="text-2xl font-black text-teal-700">{stats.total}</p>
          </div>
          <div className="rounded-2xl bg-white/85 border border-orange-200 p-4 text-center">
            <p className="text-sm text-blue-700">پیگیری امروز</p>
            <p className="text-2xl font-black text-orange-600">{stats.today}</p>
          </div>
          <div className="rounded-2xl bg-white/85 border border-red-200 p-4 text-center">
            <p className="text-sm text-blue-700">عقب‌افتاده</p>
            <p className="text-2xl font-black text-red-600">{stats.overdue}</p>
          </div>
        </div>

        <div className="rounded-2xl bg-white/90 border border-teal-200 p-4 mb-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-bold text-blue-900 mb-1">جستجو</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full rounded-xl border border-teal-300 px-3 py-2 font-semibold"
              placeholder="نام / موبایل / شهر"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-blue-900 mb-1">وضعیت</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-xl border border-teal-300 px-3 py-2 font-semibold"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-blue-900 mb-1">منبع</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="rounded-xl border border-teal-300 px-3 py-2 font-semibold"
            >
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={load}
            className="rounded-xl bg-blue-900 hover:bg-blue-950 text-white font-bold px-5 py-2"
          >
            اعمال فیلتر
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 font-bold">
            {error}
          </div>
        )}

        <div className="rounded-2xl bg-white/90 border border-teal-200 overflow-x-auto">
          {loading ? (
            <p className="p-6 text-center font-bold text-blue-800">در حال بارگذاری...</p>
          ) : leads.length === 0 ? (
            <p className="p-6 text-center font-bold text-blue-800">سرنخی یافت نشد</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-teal-600 text-white text-right">
                  <th className="p-3">نام</th>
                  <th className="p-3">موبایل</th>
                  <th className="p-3">شهر</th>
                  <th className="p-3">منبع</th>
                  <th className="p-3">وضعیت</th>
                  <th className="p-3">اقدام بعدی</th>
                  <th className="p-3">موعد</th>
                  <th className="p-3">کارشناس</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => {
                  const overdue = isOverdue(l.nextActionDate)
                  return (
                    <tr
                      key={l.id}
                      className={`border-b border-teal-100 ${
                        overdue ? "bg-red-50" : "hover:bg-teal-50/50"
                      }`}
                    >
                      <td className="p-3 font-bold text-blue-950">
                        {l.name}
                        {l.companyName ? (
                          <span className="block text-xs font-normal text-gray-600">
                            {l.companyName}
                          </span>
                        ) : null}
                      </td>
                      <td className="p-3" dir="ltr">
                        {l.mobile || l.phone || "—"}
                      </td>
                      <td className="p-3">{l.city || "—"}</td>
                      <td className="p-3">{l.source}</td>
                      <td className="p-3">{STATUS_LABEL[l.status] || l.status}</td>
                      <td className="p-3 font-semibold">{l.nextAction || "—"}</td>
                      <td
                        className={`p-3 font-bold ${
                          overdue ? "text-red-600" : "text-blue-900"
                        }`}
                      >
                        {formatFa(l.nextActionDate)}
                      </td>
                      <td className="p-3">
                        {l.assignedTo?.displayName || "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={onCreate}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
            dir="rtl"
          >
            <h2 className="text-xl font-black text-blue-950 mb-4">سرنخ جدید</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold">نام *</label>
                <input
                  className="w-full rounded-xl border border-teal-300 px-3 py-2 font-semibold"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold">موبایل</label>
                  <input
                    className="w-full rounded-xl border border-teal-300 px-3 py-2"
                    value={form.mobile}
                    onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold">شهر</label>
                  <input
                    className="w-full rounded-xl border border-teal-300 px-3 py-2"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold">شرکت / پروژه</label>
                <input
                  className="w-full rounded-xl border border-teal-300 px-3 py-2"
                  value={form.companyName}
                  onChange={(e) =>
                    setForm({ ...form, companyName: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold">منبع</label>
                  <select
                    className="w-full rounded-xl border border-teal-300 px-3 py-2"
                    value={form.source}
                    onChange={(e) => setForm({ ...form, source: e.target.value })}
                  >
                    {SOURCES.filter((s) => s !== "همه").map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold">علاقه محصول</label>
                  <input
                    className="w-full rounded-xl border border-teal-300 px-3 py-2"
                    value={form.productInterest}
                    onChange={(e) =>
                      setForm({ ...form, productInterest: e.target.value })
                    }
                    placeholder="مثلاً آینه ۶ میل"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold">توضیح</label>
                <textarea
                  className="w-full rounded-xl border border-teal-300 px-3 py-2"
                  rows={2}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold">اقدام بعدی *</label>
                  <input
                    className="w-full rounded-xl border border-teal-300 px-3 py-2 font-semibold"
                    value={form.nextAction}
                    onChange={(e) =>
                      setForm({ ...form, nextAction: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold">موعد اقدام *</label>
                  <input
                    type="datetime-local"
                    className="w-full rounded-xl border border-teal-300 px-3 py-2"
                    value={form.nextActionDate}
                    onChange={(e) =>
                      setForm({ ...form, nextActionDate: e.target.value })
                    }
                    required
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold">ارزش تخمینی (تومان)</label>
                <input
                  type="number"
                  className="w-full rounded-xl border border-teal-300 px-3 py-2"
                  value={form.estimatedValue}
                  onChange={(e) =>
                    setForm({ ...form, estimatedValue: e.target.value })
                  }
                  dir="ltr"
                />
              </div>
            </div>
            <div className="mt-5 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-xl border px-4 py-2 font-bold"
              >
                انصراف
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold px-5 py-2 disabled:opacity-50"
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