"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

const BG =
  "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')"

type Row = {
  id: string
  personnelCode: string
  firstName: string
  lastName: string
  displayName: string
  department?: string | null
  groupName?: string | null
  mobile?: string | null
  phone?: string | null
  shiftName?: string | null
  employmentType?: string | null
  userId?: string | null
  isActive: boolean
  leaveBalances?: { year: number; leaveType: string; remaining: number; remainingHours: number }[]
}

type HrUser = {
  id: string
  displayName: string
  role: string
  stationName?: string | null
}

type ProfileCustomer = {
  id: string
  customerCode?: string | null
  name: string
  phone?: string | null
}

const EMPTY_FORM = {
  personnelCode: "",
  firstName: "",
  lastName: "",
  department: "",
  groupName: "",
  mobile: "",
  shiftName: "",
  employmentType: "",
  entitledDays: "30",
  userId: "",
}

export default function EmployeesPage() {
  const [items, setItems] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [canEdit, setCanEdit] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState("")

  const [candidates, setCandidates] = useState<ProfileCustomer[]>([])
  const [users, setUsers] = useState<HrUser[]>([])

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/hr/employees")
      const data = await res.json()
      setItems(data.items || [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    ;(async () => {
      try {
        const me = await fetch("/api/auth/me").then((r) => r.json())
        const editable = ["admin", "finance"].includes(me?.user?.role)
        setCanEdit(editable)
        if (editable) {
          const ures = await fetch("/api/hr/users")
          if (ures.ok) {
            const udata = await ures.json()
            setUsers(udata.users || [])
          }
        }
      } catch {}
      try {
        const res = await fetch("/api/customer-profiles")
        if (res.ok) {
          const list: ProfileCustomer[] = await res.json()
          setCandidates(
            (list || []).filter(
              (c) => c.name && c.name.includes("پرسنل") && c.customerCode
            )
          )
        }
      } catch {}
      load()
    })()
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim()
    if (!s) return items
    return items.filter((e) =>
      [e.personnelCode, e.displayName, e.department, e.groupName, e.mobile, e.phone]
        .filter(Boolean)
        .some((v) => String(v).includes(s))
    )
  }, [items, q])

  const available = useMemo(() => {
    const codes = new Set(items.map((e) => e.personnelCode))
    const names = new Set(items.map((e) => e.displayName.replace(/\s+/g, " ")))
    return candidates.filter((c) => {
      const code = String(c.customerCode || "").trim()
      const clean = c.name.replace(/\(?\s*پرسنل\s*\)?/g, "").replace(/\s+/g, " ").trim()
      return !codes.has(code) && !names.has(clean)
    })
  }, [candidates, items])

  const startFromCustomer = (c: ProfileCustomer) => {
    const clean = c.name.replace(/\(?\s*پرسنل\s*\)?/g, "").replace(/\s+/g, " ").trim()
    const parts = clean.split(" ")
    setForm({
      ...EMPTY_FORM,
      personnelCode: String(c.customerCode || "").trim(),
      firstName: parts[0] || clean,
      lastName: parts.slice(1).join(" ") || "-",
      mobile: c.phone || "",
    })
    setErr("")
    setShowForm(true)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr("")
    if (!form.personnelCode.trim() || !form.firstName.trim() || !form.lastName.trim()) {
      setErr("کد پرسنلی، نام و نام خانوادگی الزامی است")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/hr/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personnelCode: form.personnelCode.trim(),
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          department: form.department || undefined,
          groupName: form.groupName || undefined,
          mobile: form.mobile || undefined,
          shiftName: form.shiftName || undefined,
          employmentType: form.employmentType || undefined,
          entitledDays: Number(form.entitledDays) || 30,
          userId: form.userId || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا")
      setShowForm(false)
      setForm({ ...EMPTY_FORM })
      load()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  const linkUser = async (id: string, userId: string) => {
    try {
      const res = await fetch(`/api/hr/employees/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userId || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا")
      await load()
    } catch (e: any) {
      alert(e.message)
      await load()
    }
  }

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
          <h1 className="text-xl md:text-2xl font-black text-blue-950">پرسنل</h1>
          <div className="mr-auto flex flex-wrap gap-2 items-center">
            <Link href="/hr/leave" className="text-sm font-bold text-teal-800 underline">
              مرخصی
            </Link>
            <Link href="/hr/attendance" className="text-sm font-bold text-teal-800 underline">
              تردد
            </Link>
            <Link href="/hr/approvals" className="text-sm font-bold text-teal-800 underline">
              کارتابل مدیر
            </Link>
            {canEdit && (
              <button
                onClick={() => {
                  setForm({ ...EMPTY_FORM })
                  setErr("")
                  setShowForm(true)
                }}
                className="rounded-xl bg-teal-600 text-white font-bold px-4 py-2"
              >
                + پرسنل جدید
              </button>
            )}
          </div>
        </div>

        {canEdit && available.length > 0 && (
          <div className="rounded-2xl bg-amber-50/90 border border-amber-300 p-3 mb-4">
            <p className="text-xs font-bold text-amber-900 mb-2">
              در لیست مشتریان، {available.length} نفر با پسوند «پرسنل» ثبت شده‌اند که در لیست پرسنل نیستند — برای پیش‌پر کردن فرم انتخاب کنید:
            </p>
            <div className="flex flex-wrap gap-2">
              {available.map((c) => (
                <button
                  key={c.id}
                  onClick={() => startFromCustomer(c)}
                  className="rounded-full bg-white border border-amber-300 px-3 py-1 text-xs font-bold text-amber-900 hover:bg-amber-100"
                >
                  {c.customerCode} — {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-white/90 backdrop-blur border border-teal-200 p-3 mb-4 shadow flex flex-wrap gap-3 items-center">
          <input
            className="flex-1 min-w-[200px] rounded-xl border border-teal-300 px-3 py-2 font-semibold"
            placeholder="جستجو: کد، نام، واحد، موبایل..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className="text-sm font-bold text-blue-900">
            {filtered.length} از {items.length} نفر
          </span>
        </div>

        <div className="rounded-2xl bg-white/90 border border-teal-200 shadow overflow-x-auto">
          {loading ? (
            <p className="p-8 text-center font-bold">در حال بارگذاری...</p>
          ) : filtered.length === 0 ? (
            <p className="p-8 text-center font-bold text-gray-600">
              پرسنلی ثبت نشده{canEdit ? " — از دکمه «پرسنل جدید» یا لیست مشتریان استفاده کنید" : ""}
            </p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-teal-700 text-white">
                  <th className="p-2 border border-teal-800">کد</th>
                  <th className="p-2 border border-teal-800">نام</th>
                  <th className="p-2 border border-teal-800">واحد</th>
                  <th className="p-2 border border-teal-800">گروه</th>
                  <th className="p-2 border border-teal-800">موبایل</th>
                  <th className="p-2 border border-teal-800">شیفت</th>
                  <th className="p-2 border border-teal-800">کاربر سیستم</th>
                  <th className="p-2 border border-teal-800">مانده ۱۴۰۵</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const bal = e.leaveBalances?.find((b) => b.leaveType === "استحقاقی")
                  return (
                    <tr key={e.id} className="odd:bg-white even:bg-teal-50/40 border-b border-teal-100">
                      <td className="p-2 text-center font-black text-teal-800">
                        {e.personnelCode}
                      </td>
                      <td className="p-2 font-bold text-blue-950">{e.displayName}</td>
                      <td className="p-2 text-center text-xs">{e.department || "—"}</td>
                      <td className="p-2 text-center text-xs">{e.groupName || "—"}</td>
                      <td className="p-2 text-center text-xs" dir="ltr">
                        {e.mobile || e.phone || "—"}
                      </td>
                      <td className="p-2 text-center text-xs">{e.shiftName || "—"}</td>
                      <td className="p-2 text-center text-xs">
                        {canEdit ? (
                          <select
                            className="rounded-lg border border-teal-300 px-1 py-1 text-xs max-w-[150px]"
                            value={e.userId || ""}
                            onChange={(ev) => linkUser(e.id, ev.target.value)}
                          >
                            <option value="">— وصل نشده —</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.displayName}
                              </option>
                            ))}
                          </select>
                        ) : (
                          users.find((u) => u.id === e.userId)?.displayName || "—"
                        )}
                      </td>
                      <td className="p-2 text-center font-bold">
                        {bal ? `${bal.remaining} روز` : "—"}
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
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3">
          <form
            onSubmit={submit}
            className="bg-white rounded-2xl p-5 w-full max-w-lg space-y-3 shadow-2xl max-h-[92vh] overflow-y-auto"
          >
            <h2 className="font-black text-lg text-blue-950">ثبت پرسنل جدید</h2>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold">کد پرسنلی *</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.personnelCode}
                  onChange={(e) => setForm({ ...form, personnelCode: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold">موبایل</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  dir="ltr"
                  value={form.mobile}
                  onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-bold">نام *</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold">نام خانوادگی *</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold">واحد</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-bold">گروه</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  placeholder="کارمندان، توافقی نوری..."
                  value={form.groupName}
                  onChange={(e) => setForm({ ...form, groupName: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-bold">شیفت</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  placeholder="مثلاً 08:00-17:00"
                  value={form.shiftName}
                  onChange={(e) => setForm({ ...form, shiftName: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-bold">نوع همکاری</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  placeholder="رسمی، قراردادی، روزمزد..."
                  value={form.employmentType}
                  onChange={(e) => setForm({ ...form, employmentType: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-bold">کاربر سیستم (برای ورود به مرخصی/تردد)</label>
                <select
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.userId}
                  onChange={(e) => setForm({ ...form, userId: e.target.value })}
                >
                  <option value="">— وصل نشده —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName} ({u.role})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold">مانده استحقاقی ۱۴۰۵ (روز)</label>
                <input
                  type="number"
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.entitledDays}
                  onChange={(e) => setForm({ ...form, entitledDays: e.target.value })}
                />
              </div>
            </div>
            {err && <p className="text-sm font-bold text-red-600">{err}</p>}
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