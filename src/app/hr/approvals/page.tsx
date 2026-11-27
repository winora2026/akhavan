"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

const BG =
  "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')"

type Row = {
  id: string
  type: string
  durationType?: string
  startDate: string
  endDate: string
  startTime?: string | null
  endTime?: string | null
  amount: number
  amountUnit?: string
  description?: string | null
  status: string
  requestedBy?: string | null
  reviewedBy?: string | null
  reviewNote?: string | null
  employee?: {
    displayName: string
    personnelCode: string
    department?: string | null
    groupName?: string | null
    mobile?: string | null
  }
}

const STATUS_FA: Record<string, string> = {
  PENDING: "در انتظار",
  APPROVED: "تأیید شده",
  REJECTED: "رد شده",
  CANCELLED: "لغو شده",
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
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/hr/leave-requests?status=${filter === "ALL" ? "ALL" : filter}`
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا")
      setItems(data.items || [])
    } catch (e: any) {
      alert(e.message || "خطا در دریافت کارتابل")
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  const act = async (id: string, action: "APPROVE" | "REJECT") => {
    let reviewNote = ""
    if (action === "REJECT") {
      reviewNote = prompt("علت رد (اختیاری):") || ""
    }
    setActionLoading(id)
    try {
      const res = await fetch(`/api/hr/leave-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reviewNote }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا")
      await load()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setActionLoading(null)
    }
  }

  const pendingCount = items.filter((i) => i.status === "PENDING").length

  return (
    <div
      className="min-h-screen p-4 md:p-6 bg-cover bg-center bg-fixed"
      dir="rtl"
      style={{
        fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif",
        backgroundImage: BG,
      }}
    >
      <div className="max-w-6xl mx-auto">
        {/* هدر */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Link
            href="/"
            className="rounded-xl bg-white/90 border border-teal-200 px-4 py-2 font-bold text-blue-900"
          >
            بازگشت
          </Link>
          <h1 className="text-xl md:text-2xl font-black text-blue-950">
            کارتابل مرخصی (مدیر)
          </h1>
          {filter === "PENDING" && !loading && (
            <span className="rounded-full bg-amber-500 text-white text-xs font-bold px-3 py-1">
              {pendingCount} مورد در انتظار
            </span>
          )}
          <div className="mr-auto flex flex-wrap gap-2 items-center">
            <Link
              href="/hr/leave"
              className="text-sm font-bold text-teal-800 underline"
            >
              درخواست مرخصی
            </Link>
            <Link
              href="/hr/employees"
              className="text-sm font-bold text-teal-800 underline"
            >
              پرسنل
            </Link>
            <select
              className="rounded-xl border border-teal-300 bg-white/95 px-3 py-2 font-bold text-blue-900"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="PENDING">در انتظار</option>
              <option value="APPROVED">تأیید شده</option>
              <option value="REJECTED">رد شده</option>
              <option value="ALL">همه</option>
            </select>
          </div>
        </div>

        {/* جدول */}
        <div className="rounded-2xl bg-white/90 backdrop-blur border border-teal-200 shadow overflow-x-auto">
          {loading ? (
            <p className="p-8 text-center font-bold text-blue-900">
              در حال بارگذاری...
            </p>
          ) : items.length === 0 ? (
            <p className="p-8 text-center font-bold text-gray-600">
              موردی برای نمایش نیست
            </p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-teal-700 text-white">
                  <th className="p-2.5 border border-teal-800">پرسنل</th>
                  <th className="p-2.5 border border-teal-800">کد</th>
                  <th className="p-2.5 border border-teal-800">واحد</th>
                  <th className="p-2.5 border border-teal-800">نوع</th>
                  <th className="p-2.5 border border-teal-800">حالت</th>
                  <th className="p-2.5 border border-teal-800">بازه</th>
                  <th className="p-2.5 border border-teal-800">مقدار</th>
                  <th className="p-2.5 border border-teal-800">توضیح</th>
                  <th className="p-2.5 border border-teal-800">وضعیت</th>
                  <th className="p-2.5 border border-teal-800">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => {
                  const isHourly = r.durationType === "HOURLY"
                  const rowBg =
                    r.status === "PENDING"
                      ? "bg-amber-50/80"
                      : r.status === "APPROVED"
                        ? "bg-green-50/70"
                        : r.status === "REJECTED"
                          ? "bg-red-50/60"
                          : "odd:bg-white even:bg-teal-50/40"

                  return (
                    <tr key={r.id} className={`${rowBg} hover:bg-teal-100/50`}>
                      <td className="p-2 border border-teal-100 font-bold text-blue-950">
                        {r.employee?.displayName || r.requestedBy || "—"}
                        {r.employee?.mobile ? (
                          <div className="text-[11px] font-normal">
                            <a
                              href={`tel:${r.employee.mobile}`}
                              className="text-teal-700 underline"
                              dir="ltr"
                            >
                              {r.employee.mobile}
                            </a>
                          </div>
                        ) : null}
                      </td>
                      <td className="p-2 border border-teal-100 text-center font-black text-teal-800">
                        {r.employee?.personnelCode || "—"}
                      </td>
                      <td className="p-2 border border-teal-100 text-center text-xs">
                        {r.employee?.department ||
                          r.employee?.groupName ||
                          "—"}
                      </td>
                      <td className="p-2 border border-teal-100 font-semibold">
                        {r.type}
                      </td>
                      <td className="p-2 border border-teal-100 text-center">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            isHourly
                              ? "bg-blue-100 text-blue-800"
                              : "bg-slate-100 text-slate-800"
                          }`}
                        >
                          {isHourly ? "ساعتی" : "روزانه"}
                        </span>
                      </td>
                      <td className="p-2 border border-teal-100 text-center text-xs whitespace-nowrap">
                        {formatFa(r.startDate)}
                        {isHourly ? (
                          <div className="font-bold text-blue-900" dir="ltr">
                            {r.startTime || "—"} – {r.endTime || "—"}
                          </div>
                        ) : (
                          <div>تا {formatFa(r.endDate)}</div>
                        )}
                      </td>
                      <td className="p-2 border border-teal-100 text-center font-black">
                        {r.amount}{" "}
                        {r.amountUnit === "HOUR" || isHourly ? "ساعت" : "روز"}
                      </td>
                      <td className="p-2 border border-teal-100 text-xs max-w-[160px] break-words">
                        {r.description || "—"}
                        {r.reviewNote ? (
                          <div className="mt-1 text-red-700 font-semibold">
                            نظر مدیر: {r.reviewNote}
                          </div>
                        ) : null}
                      </td>
                      <td className="p-2 border border-teal-100 text-center">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            r.status === "PENDING"
                              ? "bg-amber-200 text-amber-900"
                              : r.status === "APPROVED"
                                ? "bg-green-200 text-green-900"
                                : r.status === "REJECTED"
                                  ? "bg-red-200 text-red-900"
                                  : "bg-gray-200 text-gray-700"
                          }`}
                        >
                          {STATUS_FA[r.status] || r.status}
                        </span>
                        {r.reviewedBy ? (
                          <div className="text-[10px] text-gray-600 mt-0.5">
                            {r.reviewedBy}
                          </div>
                        ) : null}
                      </td>
                      <td className="p-2 border border-teal-100 text-center">
                        {r.status === "PENDING" ? (
                          <div className="flex flex-col sm:flex-row gap-1 justify-center">
                            <button
                              disabled={actionLoading === r.id}
                              onClick={() => act(r.id, "APPROVE")}
                              className="rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-2.5 py-1.5 disabled:opacity-50"
                            >
                              {actionLoading === r.id ? "..." : "تأیید"}
                            </button>
                            <button
                              disabled={actionLoading === r.id}
                              onClick={() => act(r.id, "REJECT")}
                              className="rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-2.5 py-1.5 disabled:opacity-50"
                            >
                              رد
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <p className="mt-3 text-xs font-semibold text-blue-900/80 bg-white/70 rounded-xl px-3 py-2 border border-teal-100 inline-block">
          ردیف زرد = در انتظار تأیید · سبز = تأیید شده · قرمز کم‌رنگ = رد شده.
          فقط نقش مدیریت / مالی امکان تأیید یا رد دارد.
        </p>
      </div>
    </div>
  )
}