"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { DateObject } from "react-multi-date-picker"
import persian from "react-date-object/calendars/persian"
import persian_fa from "react-date-object/locales/persian_fa"

type CallRow = {
  id: string
  phone: string
  status: string
  endReason?: string | null
  startedAt: string
  durationSec: number
  cost: number
  goal?: string | null
  direction?: string
}

function faTime(iso: string) {
  try {
    return new DateObject({
      date: new Date(iso),
      calendar: persian,
      locale: persian_fa,
    }).format("HH:mm · YYYY/MM/DD")
  } catch {
    return "—"
  }
}

export default function CallsDashboardPage() {
  const [items, setItems] = useState<CallRow[]>([])
  const [loading, setLoading] = useState(true)
  const [rangeDays, setRangeDays] = useState<7 | 14 | 30>(7)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch("/api/crm/calls")
        const data = await res.json()
        setItems(Array.isArray(data.items) ? data.items : [])
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const stats = useMemo(() => {
    const now = Date.now()
    const startToday = new Date()
    startToday.setHours(0, 0, 0, 0)
    const rangeStart = now - rangeDays * 86400000

    const todays = items.filter(
      (c) => new Date(c.startedAt).getTime() >= startToday.getTime()
    )
    const inRange = items.filter(
      (c) => new Date(c.startedAt).getTime() >= rangeStart
    )
    const completed = inRange.filter((c) => c.status === "COMPLETED")
    const failed = inRange.filter((c) => c.status === "FAILED")
    const live = items.filter((c) => c.status === "LIVE")
    const totalDur = inRange.reduce((s, c) => s + (c.durationSec || 0), 0)
    const avg = inRange.length ? Math.round(totalDur / inRange.length) : 0
    const cost = inRange.reduce((s, c) => s + (Number(c.cost) || 0), 0)
    const answerRate =
      inRange.length > 0
        ? Math.round((completed.length / inRange.length) * 100)
        : 0

    // توزیع موضوع (goal)
    const topicMap = new Map<string, number>()
    for (const c of inRange) {
      const t = (c.goal || "سایر").trim() || "سایر"
      topicMap.set(t, (topicMap.get(t) || 0) + 1)
    }
    const topics = Array.from(topicMap.entries()).sort((a, b) => b[1] - a[1])

    // روند روزانه (آخر rangeDays روز)
    const dayBuckets: { label: string; count: number }[] = []
    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() - i)
      const next = new Date(d)
      next.setDate(next.getDate() + 1)
      const count = items.filter((c) => {
        const t = new Date(c.startedAt).getTime()
        return t >= d.getTime() && t < next.getTime()
      }).length
      const label = new DateObject({
        date: d,
        calendar: persian,
        locale: persian_fa,
      }).format("MM/DD")
      dayBuckets.push({ label, count })
    }

    // تماس در ساعت‌های شبانه‌روز (۰–۲۳)
    const hours = Array.from({ length: 24 }, () => 0)
    for (const c of inRange) {
      const h = new Date(c.startedAt).getHours()
      hours[h] += 1
    }

    const recent = [...items]
      .sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      )
      .slice(0, 12)

    return {
      todayCount: todays.length,
      inRangeCount: inRange.length,
      completed: completed.length,
      failed: failed.length,
      live: live.length,
      avg,
      cost,
      answerRate,
      topics,
      dayBuckets,
      hours,
      recent,
      maxDay: Math.max(1, ...dayBuckets.map((d) => d.count)),
      maxHour: Math.max(1, ...hours),
    }
  }, [items, rangeDays])

  const Kpi = ({
    title,
    value,
    sub,
  }: {
    title: string
    value: string | number
    sub?: string
  }) => (
    <div className="rounded-xl bg-white/90 border border-teal-200 p-3 text-center shadow-sm min-w-[110px]">
      <p className="text-[11px] font-bold text-blue-700 mb-1">{title}</p>
      <p className="text-xl font-black text-teal-700">{value}</p>
      {sub ? (
        <p className="text-[10px] text-blue-600 mt-0.5 font-semibold">{sub}</p>
      ) : null}
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto space-y-4" dir="rtl">
      {/* هدر + دکمه‌های سریع */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-blue-950 bg-white/85 rounded-xl px-4 py-2 inline-block">
            نمای کلی
          </h1>
          <p className="text-sm text-blue-800 font-bold mt-1 bg-white/70 inline-block rounded-lg px-3 py-1">
            نبض مکالمه‌ها و کارهای امروز، در یک نگاه
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/crm/calls/outbound"
            className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold px-4 py-2.5 shadow"
          >
            تماس خروجی
          </Link>
          <Link
            href="/crm/calls"
            className="rounded-xl bg-white/90 border border-teal-300 text-blue-900 font-bold px-4 py-2.5"
          >
            تاریخچه تماس‌ها
          </Link>
        </div>
      </div>

      {/* وضعیت منشی / پل */}
      <div className="rounded-2xl bg-white/90 border border-teal-200 shadow p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-black">
            AI
          </div>
          <div>
            <p className="font-black text-blue-950">منشی هوشمند</p>
            <p className="text-xs text-blue-700 font-semibold">
              {process.env.NEXT_PUBLIC_ZITECH_MOCK !== "false"
                ? "حالت آزمایشی (Mock) — هنوز به پل زی‌تک وصل نیست"
                : "متصل به سرویس"}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-amber-100 text-amber-800 text-xs font-black px-3 py-1">
          ارتباط قطع است (تا فعال‌سازی API)
        </span>
        <Link
          href="/crm/calls/live"
          className="text-sm font-bold text-teal-700 hover:underline"
        >
          وضعیت سیستم ←
        </Link>
      </div>

      {loading ? (
        <p className="text-center font-bold bg-white/80 rounded-xl p-8">
          در حال بارگذاری...
        </p>
      ) : (
        <>
          {/* ردیف KPI مثل دمو */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <Kpi
              title="تماس‌های امروز"
              value={stats.todayCount}
              sub="نسبت به دیروز —"
            />
            <Kpi title="نرخ پاسخ‌گویی" value={`${stats.answerRate}%`} />
            <Kpi title="میانگین مدت" value={`${stats.avg} ثانیه`} />
            <Kpi title="هزینه بازه" value={`$${stats.cost.toFixed(3)}`} />
            <Kpi title="خطا / ناموفق" value={stats.failed} />
            <Kpi title="نیازمند پیگیری" value={0} sub="کاری باقی نمانده" />
          </div>

          {/* تماس‌های زنده */}
          <div className="rounded-2xl bg-white/90 border border-teal-200 shadow p-5">
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-black text-blue-950">تماس‌های زنده</h2>
              <Link
                href="/crm/calls/live"
                className="text-sm font-bold text-teal-700"
              >
                نمای کامل ←
              </Link>
            </div>
            {stats.live > 0 ? (
              <p className="font-bold text-teal-700">
                {stats.live} تماس فعال
              </p>
            ) : (
              <p className="text-center text-blue-700 font-bold py-8">
                در حال حاضر تماس فعالی وجود ندارد
              </p>
            )}
          </div>

          {/* بازه تحلیل */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-black text-blue-950 bg-white/80 rounded-lg px-3 py-1">
              تحلیل مکالمه‌ها
            </h2>
            <div className="flex gap-1 bg-white/90 rounded-xl border border-teal-200 p-1">
              {([7, 14, 30] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setRangeDays(d)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-bold ${
                    rangeDays === d
                      ? "bg-violet-600 text-white"
                      : "text-blue-900"
                  }`}
                >
                  {d} روز اخیر
                </button>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* موضوع مکالمه‌ها */}
            <div className="rounded-2xl bg-white/90 border border-teal-200 shadow p-5">
              <h3 className="font-black text-blue-950 mb-3">موضوع مکالمه‌ها</h3>
              {stats.topics.length === 0 ? (
                <p className="text-sm text-blue-700 font-semibold">
                  داده‌ای در این بازه نیست
                </p>
              ) : (
                <ul className="space-y-2">
                  {stats.topics.map(([name, n]) => (
                    <li key={name}>
                      <div className="flex justify-between text-sm font-bold text-blue-900 mb-0.5">
                        <span>{name}</span>
                        <span>{n}</span>
                      </div>
                      <div className="h-2 rounded-full bg-teal-100 overflow-hidden">
                        <div
                          className="h-full bg-violet-500 rounded-full"
                          style={{
                            width: `${Math.round(
                              (n / stats.inRangeCount) * 100
                            )}%`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-blue-600 mt-3 font-semibold">
                بر پایه {stats.inRangeCount} تماس این بازه
              </p>
            </div>

            {/* روند تماس‌ها */}
            <div className="rounded-2xl bg-white/90 border border-teal-200 shadow p-5">
              <h3 className="font-black text-blue-950 mb-3">روند تماس‌ها</h3>
              <div className="flex items-end gap-1 h-40">
                {stats.dayBuckets.map((b) => (
                  <div
                    key={b.label}
                    className="flex-1 flex flex-col items-center gap-1"
                  >
                    <div
                      className="w-full max-w-[18px] rounded-t bg-slate-400"
                      style={{
                        height: `${Math.max(
                          4,
                          (b.count / stats.maxDay) * 120
                        )}px`,
                      }}
                      title={`${b.count}`}
                    />
                    <span className="text-[9px] text-blue-700 font-bold rotate-0">
                      {b.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* سلامت سرویس */}
            <div className="rounded-2xl bg-white/90 border border-teal-200 shadow p-5">
              <div className="flex justify-between items-start">
                <h3 className="font-black text-blue-950">سلامت سرویس صوتی</h3>
                <span className="text-xs font-black text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                  قطع
                </span>
              </div>
              <p className="text-sm text-blue-800 font-semibold mt-2 leading-6">
                پل زی‌تک هنوز به اخوان وصل نشده. بعد از توکن/API، وضعیت اینجا
                به‌روز می‌شود.
              </p>
            </div>

            {/* تماس در ساعات شبانه‌روز */}
            <div className="rounded-2xl bg-white/90 border border-teal-200 shadow p-5">
              <h3 className="font-black text-blue-950 mb-3">
                تماس در ساعت‌های شبانه‌روز
              </h3>
              <div className="flex items-end gap-0.5 h-36">
                {stats.hours.map((n, h) => (
                  <div
                    key={h}
                    className="flex-1 flex flex-col items-center"
                    title={`${h}:00 — ${n}`}
                  >
                    <div
                      className="w-full rounded-t bg-violet-500"
                      style={{
                        height: `${Math.max(2, (n / stats.maxHour) * 110)}px`,
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-blue-600 font-bold mt-1">
                <span>۰</span>
                <span>۱۲</span>
                <span>۲۳</span>
              </div>
            </div>
          </div>

          {/* ردیف پایین: کلیدها + پیگیری + فعالیت اخیر */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-white/90 border border-teal-200 shadow p-5">
              <div className="flex justify-between mb-2">
                <h3 className="font-black text-blue-950">کلیدهای Gemini</h3>
                <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full">
                  بعد از API
                </span>
              </div>
              <p className="text-sm text-blue-700 font-semibold">
                مدیریت کلیدها سمت زی‌تک انجام می‌شود؛ اینجا فقط وضعیت نمایش داده
                خواهد شد.
              </p>
            </div>
            <div className="rounded-2xl bg-white/90 border border-teal-200 shadow p-5">
              <h3 className="font-black text-blue-950 mb-2">
                کارهای پیگیری امروز
              </h3>
              <p className="text-center text-blue-700 font-bold py-6">
                کار پیگیری‌نشده‌ای برای امروز نیست
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-white/90 border border-teal-200 shadow p-5">
            <h3 className="font-black text-blue-950 mb-3">فعالیت‌های اخیر</h3>
            {stats.recent.length === 0 ? (
              <p className="text-sm text-blue-700 font-semibold">موردی نیست</p>
            ) : (
              <ul className="space-y-2">
                {stats.recent.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/crm/calls/${c.id}`}
                      className="flex flex-wrap justify-between gap-2 rounded-xl hover:bg-teal-50 px-2 py-2 text-sm"
                    >
                      <span className="font-bold text-blue-900" dir="ltr">
                        تماس با {c.phone} تمام شد
                        {c.endReason ? ` (${c.endReason})` : ""} —{" "}
                        {c.durationSec} ثانیه
                      </span>
                      <span className="text-blue-600 font-semibold">
                        {faTime(c.startedAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}