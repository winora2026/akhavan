"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

const BG =
  "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')"

export default function CallCustomersPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

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

  const rows = useMemo(() => {
    const map = new Map<string, any>()
    for (const c of items) {
      const phone = c.phone
      const prev = map.get(phone)
      if (!prev) {
        map.set(phone, {
          phone,
          count: 1,
          lastAt: c.startedAt,
          goal: c.goal,
          answerer: c.answerer,
          name: c.customer?.name || "—",
        })
      } else {
        prev.count += 1
        if (new Date(c.startedAt) > new Date(prev.lastAt)) {
          prev.lastAt = c.startedAt
          prev.goal = c.goal
          prev.answerer = c.answerer
        }
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
    )
  }, [items])

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-fixed p-4 md:p-6"
      dir="rtl"
      style={{
        fontFamily: "Vazirmatn, Tahoma, sans-serif",
        backgroundImage: BG,
      }}
    >
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between mb-5 flex-wrap gap-2">
          <h1 className="text-2xl font-black text-blue-950 bg-white/80 rounded-xl px-4 py-2">
            مشتریان تماس
          </h1>
          <Link
            href="/crm/calls"
            className="rounded-xl bg-white/90 border border-teal-200 px-4 py-2 font-bold"
          >
            تاریخچه تماس‌ها
          </Link>
        </div>

        <div className="rounded-2xl bg-white/90 backdrop-blur border border-teal-200 shadow-lg overflow-auto">
          {loading ? (
            <p className="p-10 text-center font-bold">در حال بارگذاری...</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-teal-50 text-blue-900">
                <tr>
                  <th className="p-3 text-right">شماره</th>
                  <th className="p-3 text-right">نام</th>
                  <th className="p-3 text-center">تعداد تماس</th>
                  <th className="p-3 text-center">پاسخ‌دهنده</th>
                  <th className="p-3 text-center">آخرین هدف</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.phone} className="border-t hover:bg-teal-50/50">
                    <td className="p-3 font-bold" dir="ltr">
                      {r.phone}
                    </td>
                    <td className="p-3">{r.name}</td>
                    <td className="p-3 text-center">{r.count}</td>
                    <td className="p-3 text-center">{r.answerer || "—"}</td>
                    <td className="p-3 text-center">{r.goal || "—"}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-gray-500">
                      موردی نیست
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}