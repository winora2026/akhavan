"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"

type FollowItem = {
  id: string
  type: string
  description?: string | null
  dueDate: string
  status: string
  result?: string | null
  lead?: { id: string; name: string; mobile?: string | null } | null
  customer?: { id: string; name: string; phone?: string | null } | null
  assignedTo?: { displayName: string } | null
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

function isOverdue(dt: string) {
  const d = new Date(dt)
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return d < start
}

export default function FollowUpsPage() {
  const searchParams = useSearchParams()
  const initial = searchParams.get("filter") || "pending"
  const [filter, setFilter] = useState(initial)
  const [items, setItems] = useState<FollowItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = async (f = filter) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/crm/follow-ups?filter=${f}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا")
      setItems(data.items || [])
    } catch (e) {
      console.error(e)
      alert("خطا در دریافت پیگیری‌ها")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(filter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  const markDone = async (id: string) => {
    setBusyId(id)
    try {
      const res = await fetch("/api/crm/follow-ups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "DONE", result: "انجام شد" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا")
      await load()
    } catch (e: any) {
      alert(e.message || "خطا")
    } finally {
      setBusyId(null)
    }
  }

  const tabs = [
    { id: "overdue", label: "عقب‌افتاده" },
    { id: "today", label: "امروز" },
    { id: "pending", label: "همه باز" },
    { id: "all", label: "همه" },
  ]

  return (
    <div className="min-h-screen p-4 md:p-6" dir="rtl">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h1 className="text-2xl font-black text-blue-950">کارتابل پیگیری</h1>
          <div className="flex gap-2">
            <Link
              href="/crm"
              className="rounded-xl border px-4 py-2 font-bold bg-white"
            >
              داشبورد CRM
            </Link>
            <Link
              href="/crm/leads"
              className="rounded-xl bg-teal-600 text-white px-4 py-2 font-bold"
            >
              سرنخ‌ها
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id)}
              className={`rounded-xl px-4 py-2 text-sm font-bold border ${
                filter === t.id
                  ? "bg-teal-600 text-white border-teal-700"
                  : "bg-white text-blue-900 border-teal-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-center font-bold text-blue-800 py-8">در حال بارگذاری...</p>
        ) : items.length === 0 ? (
          <p className="text-center text-gray-500 py-8">موردی نیست</p>
        ) : (
          <div className="space-y-2">
            {items.map((f) => {
              const overdue = f.status === "PENDING" && isOverdue(f.dueDate)
              return (
                <div
                  key={f.id}
                  className={`rounded-2xl border bg-white/95 p-4 flex flex-wrap gap-3 justify-between items-center ${
                    overdue ? "border-red-300" : "border-teal-200"
                  }`}
                >
                  <div>
                    <p className="font-black text-blue-950">
                      {f.lead?.name || f.customer?.name || "بدون نام"}
                    </p>
                    <p className="text-sm text-gray-700 mt-0.5">
                      {f.description || f.type}
                      {f.lead?.mobile || f.customer?.phone
                        ? ` · ${f.lead?.mobile || f.customer?.phone}`
                        : ""}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      موعد: {formatFa(f.dueDate)}
                      {f.assignedTo ? ` · ${f.assignedTo.displayName}` : ""}
                      {overdue ? " · عقب‌افتاده" : ""}
                      {f.status === "DONE" ? " · انجام‌شده" : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {f.lead?.id && (
                      <Link
                        href={`/crm/leads`}
                        className="rounded-xl border px-3 py-2 text-sm font-bold"
                      >
                        سرنخ‌ها
                      </Link>
                    )}
                    {f.status === "PENDING" && (
                      <button
                        type="button"
                        disabled={busyId === f.id}
                        onClick={() => markDone(f.id)}
                        className="rounded-xl bg-green-600 hover:bg-green-700 text-white px-3 py-2 text-sm font-bold disabled:opacity-50"
                      >
                        {busyId === f.id ? "..." : "انجام شد"}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}