"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import DatePicker, { DateObject } from "react-multi-date-picker"
import persian from "react-date-object/calendars/persian"
import persian_fa from "react-date-object/locales/persian_fa"

type Row = {
  id: string
  orderNumber: string
  orderDate: string
  invoicedAt?: string | null
  totalAmount: number
  customerName: string
  customerCode?: string | null
  sepidarSyncStatus?: string | null
  sepidarInvoiceId?: string | null
  sepidarSyncedAt?: string | null
  sepidarSyncError?: string | null
  convertedBy?: string | null
}

function formatRial(n: number) {
  return Math.round(n || 0).toLocaleString("fa-IR")
}

function formatFaDate(iso?: string | null) {
  if (!iso) return "—"
  try {
    return new DateObject({
      date: new Date(iso),
      calendar: persian,
      locale: persian_fa,
    }).format("YYYY/MM/DD")
  } catch {
    return "—"
  }
}

function syncBadge(status?: string | null) {
  if (!status) {
    return (
      <span className="rounded-full bg-gray-200 text-gray-800 px-2.5 py-0.5 text-xs font-bold">
        ارسال‌نشده
      </span>
    )
  }
  if (status === "SUCCESS") {
    return (
      <span className="rounded-full bg-green-600 text-white px-2.5 py-0.5 text-xs font-bold">
        موفق
      </span>
    )
  }
  if (status === "FAILED") {
    return (
      <span className="rounded-full bg-red-600 text-white px-2.5 py-0.5 text-xs font-bold">
        خطا
      </span>
    )
  }
  if (status === "PENDING") {
    return (
      <span className="rounded-full bg-amber-500 text-white px-2.5 py-0.5 text-xs font-bold">
        در صف
      </span>
    )
  }
  return (
    <span className="rounded-full bg-slate-300 px-2.5 py-0.5 text-xs font-bold">
      {status}
    </span>
  )
}

export default function FinanceConvertPage() {
  const today = useMemo(
    () => new DateObject({ calendar: persian, locale: persian_fa }),
    []
  )
  const [fromDate, setFromDate] = useState<any>(today)
  const [toDate, setToDate] = useState<any>(today)
  const [fromNo, setFromNo] = useState("")
  const [toNo, setToNo] = useState("")
  const [search, setSearch] = useState("")
  const [syncStatus, setSyncStatus] = useState("همه")
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [syncing, setSyncing] = useState(false)
  const [me, setMe] = useState<{ role: string; displayName: string } | null>(null)

  const canSync = me?.role === "finance" || me?.role === "admin"

  useEffect(() => {
    ;(async () => {
      try {
        const r = await fetch("/api/auth/me")
        if (r.ok) {
          const d = await r.json()
          if (d.user)
            setMe({ role: d.user.role, displayName: d.user.displayName })
        }
      } catch {}
    })()
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = async () => {
    setLoading(true)
    setSelected([])
    try {
      const params = new URLSearchParams()
      const from = fromDate?.toDate?.()?.toISOString?.()
      const to = toDate?.toDate?.()?.toISOString?.()
      if (from) params.set("from", from)
      if (to) params.set("to", to)
      if (fromNo.trim()) params.set("fromNo", fromNo.trim())
      if (toNo.trim()) params.set("toNo", toNo.trim())
      if (search.trim()) params.set("q", search.trim())
      if (syncStatus !== "همه") params.set("syncStatus", syncStatus)

      const res = await fetch(`/api/finance/convert?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا")
      setRows(Array.isArray(data.items) ? data.items : [])
    } catch (e: any) {
      alert(e.message || "خطا در دریافت")
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  const allIds = rows.map((r) => r.id)
  const allSelected = allIds.length > 0 && selected.length === allIds.length

  const toggleAll = () => {
    if (allSelected) setSelected([])
    else setSelected(allIds)
  }

  const toggleOne = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const syncSelected = async (force = false) => {
    if (!canSync) {
      alert("فقط مالی/مدیر")
      return
    }
    if (!selected.length) {
      alert("حداقل یک فاکتور انتخاب کنید")
      return
    }
    if (force) {
      const ok = confirm(
        "ارسال مجدد: اگر فاکتور در سپیدار هست ممکن است تکراری ثبت شود. ادامه؟"
      )
      if (!ok) return
    } else {
      const ok = confirm(`${selected.length} فاکتور به سپیدار ارسال شود؟`)
      if (!ok) return
    }

    setSyncing(true)
    try {
      const res = await fetch("/api/finance/convert/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: selected, force }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا در ارسال")
      alert(
        `موفق: ${data.okCount} | ناموفق: ${data.failCount}${
          data.failCount
            ? "\n" +
              (data.results || [])
                .filter((r: any) => !r.ok)
                .map((r: any) => r.error)
                .join("\n")
            : ""
        }`
      )
      await load()
    } catch (e: any) {
      alert(e.message || "خطا")
    } finally {
      setSyncing(false)
    }
  }

  const totalSelected = rows
    .filter((r) => selected.includes(r.id))
    .reduce((s, r) => s + (r.totalAmount || 0), 0)

  return (
    <div
      className="min-h-screen p-4 md:p-6 bg-slate-50"
      dir="rtl"
      style={{ fontFamily: "Vazirmatn, Tahoma, sans-serif" }}
    >
      <div className="max-w-[1400px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-3xl font-black text-blue-950">کانورت فاکتورها</h1>
            <p className="text-base text-blue-800 mt-1">
              ارسال دستی فاکتورهای اخوان به سپیدار | فیلتر تاریخ و بازه شماره
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/"
              className="rounded-xl border px-4 py-2.5 font-bold text-blue-900"
            >
              داشبورد
            </Link>
            <Link
              href="/finance/deposits"
              className="rounded-xl border px-4 py-2.5 font-bold text-blue-900"
            >
              واریزی‌ها
            </Link>
            <Link
              href="/invoices"
              className="rounded-xl border px-4 py-2.5 font-bold text-blue-900"
            >
              لیست فاکتورها
            </Link>
          </div>
        </div>

        {/* فیلتر */}
        <div className="rounded-2xl border bg-white p-4 mb-4 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="text-sm font-bold">از تاریخ</label>
            <DatePicker
              value={fromDate}
              onChange={setFromDate}
              calendar={persian}
              locale={persian_fa}
              inputClass="w-full rounded-xl border px-3 py-2.5"
            />
          </div>
          <div>
            <label className="text-sm font-bold">تا تاریخ</label>
            <DatePicker
              value={toDate}
              onChange={setToDate}
              calendar={persian}
              locale={persian_fa}
              inputClass="w-full rounded-xl border px-3 py-2.5"
            />
          </div>
          <div>
            <label className="text-sm font-bold">از شماره فاکتور</label>
            <input
              className="w-full rounded-xl border px-3 py-2.5"
              value={fromNo}
              onChange={(e) => setFromNo(e.target.value)}
              dir="ltr"
              placeholder="مثلاً 1000"
            />
          </div>
          <div>
            <label className="text-sm font-bold">تا شماره فاکتور</label>
            <input
              className="w-full rounded-xl border px-3 py-2.5"
              value={toNo}
              onChange={(e) => setToNo(e.target.value)}
              dir="ltr"
              placeholder="مثلاً 1100"
            />
          </div>
          <div>
            <label className="text-sm font-bold">وضعیت کانورت</label>
            <select
              className="w-full rounded-xl border px-3 py-2.5"
              value={syncStatus}
              onChange={(e) => setSyncStatus(e.target.value)}
            >
              <option value="همه">همه</option>
              <option value="NONE">ارسال‌نشده</option>
              <option value="SUCCESS">موفق</option>
              <option value="FAILED">خطا</option>
              <option value="PENDING">در صف</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-bold">جستجو</label>
            <input
              className="w-full rounded-xl border px-3 py-2.5"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="نام / کد / شماره"
            />
          </div>
          <div className="md:col-span-3 lg:col-span-6 flex flex-wrap gap-2">
            <button
              onClick={load}
              className="rounded-xl bg-blue-900 text-white font-bold px-5 py-2.5"
            >
              اعمال فیلتر
            </button>
            {canSync && (
              <>
                <button
                  disabled={syncing || !selected.length}
                  onClick={() => syncSelected(false)}
                  className="rounded-xl bg-teal-600 text-white font-bold px-5 py-2.5 disabled:opacity-50"
                >
                  {syncing ? "در حال ارسال..." : `ارسال انتخاب‌شده‌ها (${selected.length})`}
                </button>
                <button
                  disabled={syncing || !selected.length}
                  onClick={() => syncSelected(true)}
                  className="rounded-xl bg-amber-600 text-white font-bold px-5 py-2.5 disabled:opacity-50"
                >
                  ارسال مجدد (force)
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl bg-white border p-4 text-center">
            <p className="text-sm font-bold">تعداد در فیلتر</p>
            <p className="text-2xl font-black">{rows.length}</p>
          </div>
          <div className="rounded-xl bg-white border p-4 text-center">
            <p className="text-sm font-bold">انتخاب‌شده</p>
            <p className="text-2xl font-black text-teal-700">{selected.length}</p>
          </div>
          <div className="rounded-xl bg-white border p-4 text-center">
            <p className="text-sm font-bold">جمع مبلغ انتخابی (ریال)</p>
            <p className="text-xl font-black text-green-700" dir="ltr">
              {formatRial(totalSelected)}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border overflow-auto bg-white shadow-sm">
          {loading ? (
            <p className="p-8 text-center text-lg">در حال بارگذاری...</p>
          ) : (
            <table className="min-w-full text-base">
              <thead className="bg-teal-700 text-white">
                <tr>
                  <th className="p-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="p-3">#</th>
                  <th className="p-3">شماره فاکتور</th>
                  <th className="p-3">تاریخ فاکتور</th>
                  <th className="p-3">کد مشتری</th>
                  <th className="p-3">نام مشتری</th>
                  <th className="p-3">مبلغ (ریال)</th>
                  <th className="p-3">وضعیت کانورت</th>
                  <th className="p-3">شناسه سپیدار</th>
                  <th className="p-3">خطا</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr
                    key={r.id}
                    className="border-b hover:bg-teal-50/50 cursor-pointer"
                    onClick={() => toggleOne(r.id)}
                  >
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.includes(r.id)}
                        onChange={() => toggleOne(r.id)}
                      />
                    </td>
                    <td className="p-3 text-center font-bold">{idx + 1}</td>
                    <td className="p-3 text-center font-black" dir="ltr">
                      {r.orderNumber}
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      {formatFaDate(r.invoicedAt || r.orderDate)}
                    </td>
                    <td className="p-3 text-center text-sm" dir="ltr">
                      {r.customerCode || "—"}
                    </td>
                    <td className="p-3 font-bold">{r.customerName}</td>
                    <td className="p-3 text-center font-black" dir="ltr">
                      {formatRial(r.totalAmount)}
                    </td>
                    <td className="p-3 text-center">{syncBadge(r.sepidarSyncStatus)}</td>
                    <td className="p-3 text-center text-sm" dir="ltr">
                      {r.sepidarInvoiceId || "—"}
                    </td>
                    <td className="p-3 text-xs text-red-700 max-w-[180px]">
                      {r.sepidarSyncError || ""}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-gray-500">
                      فاکتوری در این فیلتر نیست
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