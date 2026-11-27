"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

type Row = {
  id: string
  type: string
  startDate: string
  endDate: string
  days: number
  description?: string | null
  status: string
  requestedBy?: string | null
  employee?: { displayName: string; personnelCode: string }
}

function formatFa(d?: string) {
  if (!d) return "—"
  try {
    return new Date(d).toLocaleDateString("fa-IR")
  } catch {
    return "—"
  }
}

export default function LeaveApprovalsPage() {
  const [items, setItems] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("PENDING")

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/hr/leave-requests?status=${filter === "ALL" ? "ALL" : filter}`
      )
      const data = await res.json()
      setItems(data.items || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [filter])

  const act = async (id: string, action: "APPROVE" | "REJECT") => {
    const reviewNote =
      action === "REJECT" ? prompt("علت رد (اختیاری):") || "" : ""
    const res = await fetch(`/api/hr/leave-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reviewNote }),
    })
    const data = await res.json()
    if (!res.ok) return alert(data.error || "خطا")
    load()
  }

  return (
    <div className="min-h-screen p-4 md:p-6 bg-slate-50" dir="rtl">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Link href="/" className="rounded-xl border px-4 py-2 font-bold">
            بازگشت
          </Link>
          <h1 className="text-xl font-black">کارتابل مرخصی (مدیر)</h1>
          <select
            className="mr-auto rounded-xl border px-3 py-2 font-bold"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="PENDING">در انتظار</option>
            <option value="APPROVED">تأیید شده</option>
            <option value="REJECTED">رد شده</option>
            <option value="ALL">همه</option>
          </select>
        </div>

        <div className="rounded-2xl bg-white border shadow-sm overflow-x-auto">
          {loading ? (
            <p className="p-4 text-center">...</p>
          ) : items.length === 0 ? (
            <p className="p-4 text-center text-gray-500">موردی نیست</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-blue-900 text-white">
                <tr>
                  <th className="p-2">پرسنل</th>
                  <th className="p-2">کد</th>
                  <th className="p-2">نوع</th>
                  <th className="p-2">از</th>
                  <th className="p-2">تا</th>
                  <th className="p-2">روز</th>
                  <th className="p-2">توضیح</th>
                  <th className="p-2">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className="border-b odd:bg-slate-50">
                    <td className="p-2 font-bold">
                      {r.employee?.displayName || r.requestedBy}
                    </td>
                    <td className="p-2 text-center">
                      {r.employee?.personnelCode}
                    </td>
                    <td className="p-2">{r.type}</td>
                    <td className="p-2 text-center">{formatFa(r.startDate)}</td>
                    <td className="p-2 text-center">{formatFa(r.endDate)}</td>
                    <td className="p-2 text-center">{r.days}</td>
                    <td className="p-2 text-xs max-w-[180px]">
                      {r.description || "—"}
                    </td>
                    <td className="p-2 text-center">
                      {r.status === "PENDING" ? (
                        <div className="flex gap-1 justify-center">
                          <button
                            className="rounded-lg bg-green-600 text-white text-xs font-bold px-2 py-1"
                            onClick={() => act(r.id, "APPROVE")}
                          >
                            تأیید
                          </button>
                          <button
                            className="rounded-lg bg-red-600 text-white text-xs font-bold px-2 py-1"
                            onClick={() => act(r.id, "REJECT")}
                          >
                            رد
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs font-bold">{r.status}</span>
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