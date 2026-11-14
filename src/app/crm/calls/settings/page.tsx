"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

type SettingUser = {
  id: string
  username: string
  displayName: string
  role: string
  stationName: string | null
  isActive: boolean
  extension: string | null
  callCount: number
}

type Status = {
  enabled: boolean
  amiReady: boolean
  events: number
  lastEventAt: number | null
  lastEventName: string | null
  startedAt: number | null
}

const ROLE_LABEL: Record<string, string> = {
  admin: "مدیر",
  sales: "فروش",
  finance: "مالی",
  operator: "اپراتور",
}

function faTime(ts?: number | null) {
  if (!ts) return "—"
  try {
    return new Date(ts).toLocaleString("fa-IR-u-nu-latn", {
      timeZone: "Asia/Tehran",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
  } catch {
    return new Date(ts).toISOString()
  }
}

export default function TelephonySettingsPage() {
  const [users, setUsers] = useState<SettingUser[]>([])
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const load = async () => {
    setLoading(true)
    setError("")
    try {
      const [usersRes, statusRes] = await Promise.all([
        fetch("/api/telephony/settings", { cache: "no-store" }),
        fetch("/api/telephony/status", { cache: "no-store" }),
      ])
      const usersData = await usersRes.json().catch(() => ({}))
      if (!usersRes.ok) throw new Error(usersData?.error || "خطا در دریافت تنظیمات")
      const items: SettingUser[] = Array.isArray(usersData.items) ? usersData.items : []
      setUsers(items)
      setDraft(Object.fromEntries(items.map((u) => [u.id, u.extension || ""])))
      if (statusRes.ok) setStatus(await statusRes.json())
    } catch (e: any) {
      setError(e?.message || "خطا در دریافت تنظیمات")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const duplicateExtension = useMemo(() => {
    const seen = new Map<string, number>()
    for (const value of Object.values(draft)) {
      const ext = value.trim()
      if (!ext) continue
      seen.set(ext, (seen.get(ext) || 0) + 1)
    }
    for (const [ext, count] of seen) {
      if (count > 1) return ext
    }
    return null
  }, [draft])

  const dirty = useMemo(
    () => users.some((u) => (u.extension || "") !== (draft[u.id] || "").trim()),
    [users, draft]
  )

  const save = async () => {
    if (duplicateExtension) {
      alert(`شماره داخلی ${duplicateExtension} برای بیش از یک کاربر وارد شده است`)
      return
    }
    setSaving(true)
    setSuccess("")
    try {
      const res = await fetch("/api/telephony/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: users.map((u) => ({ userId: u.id, extension: draft[u.id] || "" })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "خطا در ذخیره تنظیمات")
      setSuccess("تنظیمات داخلی ذخیره شد")
      await load()
    } catch (e: any) {
      alert(e?.message || "خطا در ذخیره تنظیمات")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div dir="rtl" className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 md:text-3xl">تنظیمات داخلی تلفن</h1>
          <p className="mt-1 text-sm text-slate-600">
            هر کاربر CRM را به داخلی خودش در مرکز تلفن (Issabel) وصل کنید. پاپ‌آپ تماس و تماس کلیکی بر اساس همین داخلی کار می‌کند.
          </p>
        </div>
        <Link
          href="/crm/calls/pbx"
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          تاریخچه تلفنی
        </Link>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatusCard
          title="سرویس تلفنی"
          value={status ? (status.enabled ? "فعال" : "غیرفعال") : "—"}
          ok={!!status?.enabled}
        />
        <StatusCard title="اتصال به AMI" value={status ? (status.amiReady ? "متصل" : "قطع") : "—"} ok={!!status?.amiReady} />
        <StatusCard title="رویدادهای دریافتی" value={status ? status.events.toLocaleString("fa-IR") : "—"} ok={!!status?.events} />
        <StatusCard
          title="آخرین رویداد"
          value={status?.lastEventName || "—"}
          hint={status?.lastEventAt ? faTime(status.lastEventAt) : undefined}
          ok={!!status?.lastEventAt}
        />
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
          {success}
        </div>
      )}

      <div className="overflow-auto rounded-2xl border border-teal-100 bg-white/95 shadow-sm">
        {loading ? (
          <p className="p-12 text-center font-bold text-slate-500">در حال بارگذاری...</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="p-3 text-right">کاربر</th>
                <th className="p-3 text-center">نقش</th>
                <th className="p-3 text-center">ایستگاه</th>
                <th className="p-3 text-center">تماس‌های ثبت‌شده</th>
                <th className="p-3 text-center">شماره داخلی</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className={`border-t border-slate-100 ${user.isActive ? "" : "bg-slate-50/60 opacity-70"}`}>
                  <td className="p-3 text-right">
                    <p className="font-bold text-slate-900">{user.displayName}</p>
                    <p className="mt-0.5 text-xs text-slate-500" dir="ltr">
                      {user.username}
                    </p>
                  </td>
                  <td className="p-3 text-center text-xs font-bold text-slate-600">
                    {ROLE_LABEL[user.role] || user.role}
                    {!user.isActive && <span className="mr-1 text-red-500">(غیرفعال)</span>}
                  </td>
                  <td className="p-3 text-center text-xs text-slate-600">{user.stationName || "—"}</td>
                  <td className="p-3 text-center text-xs font-bold text-slate-700">
                    {user.callCount.toLocaleString("fa-IR")}
                  </td>
                  <td className="p-3 text-center">
                    <input
                      value={draft[user.id] ?? ""}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [user.id]: e.target.value.replace(/[^0-9]/g, "").slice(0, 8),
                        }))
                      }
                      placeholder="مثلاً 103"
                      inputMode="numeric"
                      dir="ltr"
                      className={`w-28 rounded-xl border px-3 py-2 text-center font-mono text-sm font-bold focus:outline-none ${
                        duplicateExtension && duplicateExtension === (draft[user.id] || "").trim()
                          ? "border-red-400 bg-red-50"
                          : "border-slate-300 focus:border-teal-500"
                      }`}
                    />
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-12 text-center font-bold text-slate-500">
                    کاربری یافت نشد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {duplicateExtension && (
        <p className="mt-3 text-sm font-bold text-red-600">
          شماره داخلی {duplicateExtension} تکراری است؛ برای هر کاربر یک داخلی یکتا وارد کنید.
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs font-bold text-slate-500">
          داخلی‌های رایج مرکز تلفن شما: ۱۰۳ تا ۱۰۶ (در صورت متفاوت بودن، از خود Issabel 확인 کنید).
        </p>
        <button
          onClick={save}
          disabled={saving || loading || !!duplicateExtension || !dirty}
          className="rounded-xl bg-teal-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {saving ? "در حال ذخیره..." : "ذخیره تنظیمات"}
        </button>
      </div>
    </div>
  )
}

function StatusCard({
  title,
  value,
  hint,
  ok,
}: {
  title: string
  value: string
  hint?: string
  ok: boolean
}) {
  return (
    <div className="rounded-2xl border border-teal-100 bg-white/95 p-4 shadow-sm">
      <p className="text-xs font-bold text-slate-500">{title}</p>
      <div className="mt-1 flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-red-400"}`} />
        <p className="text-lg font-black text-slate-900">{value}</p>
      </div>
      {hint && <p className="mt-1 text-[11px] font-bold text-slate-400">{hint}</p>}
    </div>
  )
}
