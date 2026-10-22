"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

type Cards = {
  leadsNewToday: number
  leadsNewMonth: number
  leadsActive: number
  followUpsToday: number
  followUpsOverdue: number
  opportunitiesOpen: number
  opportunitiesValue: number
  preInvoicesCount: number
  preInvoicesValue: number
}

type FollowItem = {
  id: string
  type: string
  description?: string | null
  dueDate: string
  lead?: { id: string; name: string } | null
  customer?: { id: string; name: string } | null
  assignedTo?: { displayName: string } | null
}

function formatMoney(n: number) {
  return new Intl.NumberFormat("fa-IR").format(Math.round(n || 0))
}

function formatFa(dt?: string | null) {
  if (!dt) return "—"
  try {
    return new Date(dt).toLocaleString("fa-IR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return "—"
  }
}

export default function CrmDashboardPage() {
  const [cards, setCards] = useState<Cards | null>(null)
  const [overdue, setOverdue] = useState<FollowItem[]>([])
  const [today, setToday] = useState<FollowItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch("/api/crm/dashboard")
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "خطا")
        setCards(data.cards)
        setOverdue(data.overdueList || [])
        setToday(data.todayList || [])
      } catch (e: any) {
        setError(e.message || "خطا در بارگذاری")
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const cardUi = [
    {
      title: "Lead جدید امروز",
      value: cards?.leadsNewToday ?? "—",
      href: "/crm/leads",
      color: "border-teal-400",
    },
    {
      title: "Lead این ماه",
      value: cards?.leadsNewMonth ?? "—",
      href: "/crm/leads",
      color: "border-cyan-400",
    },
    {
      title: "Lead فعال",
      value: cards?.leadsActive ?? "—",
      href: "/crm/leads",
      color: "border-blue-400",
    },
    {
      title: "پیگیری امروز",
      value: cards?.followUpsToday ?? "—",
      href: "/crm/follow-ups?filter=today",
      color: "border-emerald-400",
    },
    {
      title: "پیگیری عقب‌افتاده",
      value: cards?.followUpsOverdue ?? "—",
      href: "/crm/follow-ups?filter=overdue",
      color: "border-red-400",
    },
    {
      title: "فرصت باز",
      value: cards?.opportunitiesOpen ?? "—",
      href: "/crm/leads",
      color: "border-indigo-400",
    },
    {
      title: "ارزش فرصت‌ها (تومان)",
      value: cards ? formatMoney(cards.opportunitiesValue) : "—",
      href: "/crm/leads",
      color: "border-violet-400",
    },
    {
      title: "پیش‌فاکتور باز",
      value: cards
        ? `${cards.preInvoicesCount} | ${formatMoney(cards.preInvoicesValue)}`
        : "—",
      href: "/order",
      color: "border-amber-400",
    },
  ]

  return (
    <div className="min-h-screen p-4 md:p-6" dir="rtl">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-black text-blue-950">داشبورد CRM</h1>
            <p className="text-sm text-blue-800/80 mt-1">
              هیچ سرنخی بدون پیگیری نماند
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/crm/leads"
              className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-2.5"
            >
              سرنخ‌ها
            </Link>
            <Link
              href="/crm/follow-ups"
              className="rounded-xl border border-teal-400 bg-white font-bold px-4 py-2.5 text-teal-800"
            >
              کارتابل پیگیری
            </Link>
            <Link
              href="/"
              className="rounded-xl border border-gray-300 bg-white font-bold px-4 py-2.5"
            >
              خانه
            </Link>
          </div>
        </div>

        {loading && (
          <p className="text-center text-blue-800 font-bold py-10">در حال بارگذاری...</p>
        )}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 p-4 font-bold mb-4">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {cardUi.map((c) => (
                <Link
                  key={c.title}
                  href={c.href}
                  className={`rounded-2xl bg-white/90 border-2 ${c.color} p-4 shadow-sm hover:shadow-md transition`}
                >
                  <p className="text-xs font-bold text-blue-800 mb-2">{c.title}</p>
                  <p className="text-xl font-black text-blue-950">{c.value}</p>
                </Link>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <section className="rounded-2xl bg-white/90 border border-red-200 p-4">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="font-black text-red-800">عقب‌افتاده‌ها</h2>
                  <Link
                    href="/crm/follow-ups?filter=overdue"
                    className="text-sm font-bold text-teal-700"
                  >
                    همه
                  </Link>
                </div>
                {overdue.length === 0 ? (
                  <p className="text-sm text-gray-500">موردی نیست</p>
                ) : (
                  <ul className="space-y-2">
                    {overdue.map((f) => (
                      <li
                        key={f.id}
                        className="rounded-xl border border-red-100 bg-red-50/50 px-3 py-2 text-sm"
                      >
                        <p className="font-bold text-blue-950">
                          {f.lead?.name || f.customer?.name || "—"}
                        </p>
                        <p className="text-gray-600">
                          {f.description || f.type} · {formatFa(f.dueDate)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-2xl bg-white/90 border border-emerald-200 p-4">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="font-black text-emerald-800">پیگیری امروز</h2>
                  <Link
                    href="/crm/follow-ups?filter=today"
                    className="text-sm font-bold text-teal-700"
                  >
                    همه
                  </Link>
                </div>
                {today.length === 0 ? (
                  <p className="text-sm text-gray-500">موردی نیست</p>
                ) : (
                  <ul className="space-y-2">
                    {today.map((f) => (
                      <li
                        key={f.id}
                        className="rounded-xl border border-emerald-100 bg-emerald-50/40 px-3 py-2 text-sm"
                      >
                        <p className="font-bold text-blue-950">
                          {f.lead?.name || f.customer?.name || "—"}
                        </p>
                        <p className="text-gray-600">
                          {f.description || f.type} · {formatFa(f.dueDate)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  )
}