"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import DatePicker, { DateObject } from "react-multi-date-picker"
import persian from "react-date-object/calendars/persian"
import persian_fa from "react-date-object/locales/persian_fa"
import gregorian from "react-date-object/calendars/gregorian"
// ⚠ مسیر را مطابق محل این فایل تنظیم کنید (همان فایل لیست مشتریان که ثبت سفارش و فاکتورها هم می‌خوانند)
import customersSeedRaw from "../../customers/customers-seed.json"

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

// حروف عربی → فارسی، ارقام فارسی/عربی → لاتین، حذف نیم‌فاصله و کاراکترهای جهت‌ساز
const normalizeText = (value: string | null | undefined) => {
  if (!value) return ""
  return String(value)
    .replace(/[\u200c\u200f\u200e]/g, " ")
    .replace(/ي/g, "ی")
    .replace(/ى/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim()
}

// ===== کد مشتری (همان منطق صفحه‌ی فاکتورها / پیش‌فاکتورها) =====
// کدهای مشتریان قدیمی (از فایل لیست مشتریان): نام نرمال‌شده → کد
const seedCodeByName = (() => {
  const map = new Map<string, string>()
  ;(customersSeedRaw as any[]).forEach((c: any) => {
    const code = String(c.code || "").trim()
    if (!code) return
    const names = [
      c.companyName,
      `${c.lastName || ""} ${c.firstName || ""}`,
      `${c.firstName || ""} ${c.lastName || ""}`,
    ]
    names.forEach((n) => {
      const key = normalizeText(String(n || ""))
      if (key && !map.has(key)) map.set(key, code)
    })
  })
  return map
})()

// اگر در دیتابیس کد واقعی ثبت شده همان؛ وگرنه (خالی یا کد خودکارِ C-عدد) از لیست قدیمی به‌اسم پیدا می‌شود
function resolveCustomerCode(
  name: string | null | undefined,
  dbCode?: string | null
): string {
  const c = String(dbCode || "").trim()
  if (c && !/^C-\d{8,}$/.test(c)) return c
  return seedCodeByName.get(normalizeText(name)) || ""
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

/** ابتدای همان روز تقویمی انتخاب‌شده، به‌وقت تهران */
function dayStartIsoTehran(dObj: any): string | null {
  if (!dObj) return null
  try {
    const g = new DateObject(dObj).convert(gregorian)
    const y = g.year
    const m = String(g.month.number).padStart(2, "0")
    const day = String(g.day).padStart(2, "0")
    return new Date(`${y}-${m}-${day}T00:00:00+03:30`).toISOString()
  } catch {
    return null
  }
}

/** انتهای همان روز تقویمی انتخاب‌شده، به‌وقت تهران */
function dayEndIsoTehran(dObj: any): string | null {
  if (!dObj) return null
  try {
    const g = new DateObject(dObj).convert(gregorian)
    const y = g.year
    const m = String(g.month.number).padStart(2, "0")
    const day = String(g.day).padStart(2, "0")
    return new Date(`${y}-${m}-${day}T23:59:59.999+03:30`).toISOString()
  } catch {
    return null
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

// فیلترها در sessionStorage ذخیره می‌شوند تا با رفتن به صفحه‌ی دیگر و برگشتن، از اول نشود
const FILTERS_KEY = "financeConvertFilters"

// کلاس‌های مشترک ظاهر (هم‌سبک صفحه‌های پیش‌فاکتورها و فاکتورها)
const glassCard =
  "rounded-2xl bg-teal-500/10 backdrop-blur-2xl shadow-lg border border-teal-500/20"
const fieldClass =
  "w-full rounded-xl border border-teal-500/30 bg-white/50 px-3 py-2.5 text-base font-semibold text-blue-950 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-400 hover:bg-yellow-100 transition"
const labelClass = "mb-1 block text-sm font-bold text-blue-900"

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
  const [me, setMe] = useState<{ role: string; displayName: string } | null>(
    null
  )
  const [filtersReady, setFiltersReady] = useState(false)

  const canSync = me?.role === "finance" || me?.role === "admin"

  // بارگذاری لیست: بازه‌ی تاریخ از ابتدای روز «از» تا انتهای روز «تا» (به‌وقت تهران)
  const loadWith = async (
    f: any,
    t: any,
    fNo: string,
    tNo: string,
    st: string
  ) => {
    setLoading(true)
    setSelected([])
    try {
      const params = new URLSearchParams()
      const fromIso = dayStartIsoTehran(f)
      const toIso = dayEndIsoTehran(t)
      if (fromIso) params.set("from", fromIso)
      if (toIso) params.set("to", toIso)
      if (fNo.trim()) params.set("fromNo", fNo.trim())
      if (tNo.trim()) params.set("toNo", tNo.trim())
      if (st !== "همه") params.set("syncStatus", st)

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

  const load = () => loadWith(fromDate, toDate, fromNo, toNo, syncStatus)

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

    // بازیابی فیلترهای قبلی؛ تاریخ‌های ذخیره‌شده فقط در همان روز معتبرند (تا فردا با تاریخ دیروز باز نشود)
    let f: any = today
    let t: any = today
    let fNo = ""
    let tNo = ""
    let st = "همه"
    let q = ""
    try {
      const raw = sessionStorage.getItem(FILTERS_KEY)
      if (raw) {
        const s = JSON.parse(raw)
        if (typeof s.search === "string") q = s.search
        if (typeof s.fromNo === "string") fNo = s.fromNo
        if (typeof s.toNo === "string") tNo = s.toNo
        if (typeof s.syncStatus === "string") st = s.syncStatus
        if (
          s.dayStamp === new Date().toDateString() &&
          "fromDate" in s &&
          "toDate" in s
        ) {
          const toDO = (iso: string) =>
            new DateObject({
              date: new Date(iso),
              calendar: persian,
              locale: persian_fa,
            })
          f = s.fromDate ? toDO(s.fromDate) : null
          t = s.toDate ? toDO(s.toDate) : null
        }
      }
    } catch {}
    setSearch(q)
    setFromNo(fNo)
    setToNo(tNo)
    setSyncStatus(st)
    setFromDate(f)
    setToDate(t)
    setFiltersReady(true)
    loadWith(f, t, fNo, tNo, st)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ذخیره‌ی خودکار فیلترها
  useEffect(() => {
    if (!filtersReady) return
    try {
      sessionStorage.setItem(
        FILTERS_KEY,
        JSON.stringify({
          dayStamp: new Date().toDateString(),
          search,
          fromNo,
          toNo,
          syncStatus,
          fromDate: fromDate?.toDate ? fromDate.toDate().toISOString() : null,
          toDate: toDate?.toDate ? toDate.toDate().toISOString() : null,
        })
      )
    } catch {}
  }, [filtersReady, search, fromNo, toNo, syncStatus, fromDate, toDate])

  // جستجوی صفحه (سمت مرورگر): نام، کد مشتری (با پیدا کردن کد از لیست قدیمی) و شماره فاکتور،
  // با یکسان‌سازی حروف/ارقام و همه‌ی کلمه‌ها (ترتیب مهم نیست)
  const visibleRows = useMemo(() => {
    const tokens = normalizeText(search).split(" ").filter(Boolean)
    if (!tokens.length) return rows
    return rows.filter((r) => {
      const code = resolveCustomerCode(r.customerName, r.customerCode)
      const haystack = normalizeText(
        [r.customerName, code, r.orderNumber, r.sepidarInvoiceId]
          .filter(Boolean)
          .join(" ")
      )
      return tokens.every((t) => haystack.includes(t))
    })
  }, [rows, search])

  // فقط ردیف‌های دیده‌شده در لیست «انتخاب‌شده» حساب می‌شوند (تا ردیف پنهانِ فیلتر ناخواسته ارسال نشود)
  const visibleIds = useMemo(() => visibleRows.map((r) => r.id), [visibleRows])
  const selectedVisible = useMemo(
    () => selected.filter((id) => visibleIds.includes(id)),
    [selected, visibleIds]
  )
  const allSelected =
    visibleIds.length > 0 && selectedVisible.length === visibleIds.length

  const toggleAll = () => {
    if (allSelected)
      setSelected((prev) => prev.filter((id) => !visibleIds.includes(id)))
    else setSelected((prev) => Array.from(new Set([...prev, ...visibleIds])))
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
    if (!selectedVisible.length) {
      alert("حداقل یک فاکتور انتخاب کنید")
      return
    }
    if (force) {
      const ok = confirm(
        "ارسال مجدد: اگر فاکتور در سپیدار هست ممکن است تکراری ثبت شود. ادامه؟"
      )
      if (!ok) return
    } else {
      const ok = confirm(`${selectedVisible.length} فاکتور به سپیدار ارسال شود؟`)
      if (!ok) return
    }

    setSyncing(true)
    try {
      const res = await fetch("/api/finance/convert/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: selectedVisible, force }),
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

  const totalSelected = visibleRows
    .filter((r) => selectedVisible.includes(r.id))
    .reduce((s, r) => s + (r.totalAmount || 0), 0)

  return (
    <div
      className="min-h-screen p-4 md:p-6 relative bg-cover bg-center bg-fixed"
      dir="rtl"
      style={{
        backgroundImage:
          "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')",
        fontFamily: "Vazirmatn, Tahoma, sans-serif",
      }}
    >
      <div className="pointer-events-none fixed inset-0 bg-black/5" />

      <div className="relative z-10 max-w-[1400px] mx-auto">
        <div
          className={`${glassCard} flex flex-wrap items-center justify-between gap-3 mb-4 p-4`}
        >
          <div>
            <h1 className="text-3xl font-black text-blue-950">
              کانورت فاکتورها
            </h1>
            <p className="text-base font-semibold text-blue-900 mt-1">
              ارسال دستی فاکتورهای اخوان به سپیدار | فیلتر تاریخ و بازه شماره
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/"
              className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-4 py-2.5 font-bold text-blue-900 transition"
            >
              داشبورد
            </Link>
            <Link
              href="/finance/deposits"
              className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-4 py-2.5 font-bold text-blue-900 transition"
            >
              واریزی‌ها
            </Link>
            <Link
              href="/invoices"
              className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-4 py-2.5 font-bold text-blue-900 transition"
            >
              لیست فاکتورها
            </Link>
          </div>
        </div>

        {/* فیلتر */}
        <div
          className={`${glassCard} p-4 mb-4 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3`}
        >
          <div className="relative z-30">
            <label className={labelClass}>از تاریخ</label>
            <DatePicker
              value={fromDate}
              onChange={setFromDate}
              calendar={persian}
              locale={persian_fa}
              inputClass={fieldClass}
              containerClassName="w-full"
              portal
              zIndex={1000}
            />
          </div>
          <div className="relative z-30">
            <label className={labelClass}>تا تاریخ</label>
            <DatePicker
              value={toDate}
              onChange={setToDate}
              calendar={persian}
              locale={persian_fa}
              inputClass={fieldClass}
              containerClassName="w-full"
              portal
              zIndex={1000}
            />
          </div>
          <div>
            <label className={labelClass}>از شماره فاکتور</label>
            <input
              className={fieldClass}
              value={fromNo}
              onChange={(e) => setFromNo(e.target.value)}
              dir="ltr"
              placeholder="مثلاً 1000"
            />
          </div>
          <div>
            <label className={labelClass}>تا شماره فاکتور</label>
            <input
              className={fieldClass}
              value={toNo}
              onChange={(e) => setToNo(e.target.value)}
              dir="ltr"
              placeholder="مثلاً 1100"
            />
          </div>
          <div>
            <label className={labelClass}>وضعیت کانورت</label>
            <select
              className={fieldClass}
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
            <label className={labelClass}>جستجو</label>
            <input
              className={fieldClass}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="نام / کد / شماره"
            />
          </div>
          <div className="md:col-span-3 lg:col-span-6 flex flex-wrap items-center gap-2">
            <button
              onClick={load}
              className="rounded-xl bg-blue-900 hover:bg-blue-950 text-white font-bold px-5 py-2.5 transition"
            >
              اعمال فیلتر
            </button>
            {canSync && (
              <>
                <button
                  disabled={syncing || !selectedVisible.length}
                  onClick={() => syncSelected(false)}
                  className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold px-5 py-2.5 disabled:opacity-50 transition"
                >
                  {syncing
                    ? "در حال ارسال..."
                    : `ارسال انتخاب‌شده‌ها (${selectedVisible.length})`}
                </button>
                <button
                  disabled={syncing || !selectedVisible.length}
                  onClick={() => syncSelected(true)}
                  className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold px-5 py-2.5 disabled:opacity-50 transition"
                >
                  ارسال مجدد (force)
                </button>
              </>
            )}
            <span className="text-xs font-semibold text-blue-700 mr-2">
              جستجوی نام/کد فقط بین فاکتورهای بازه‌ی تاریخ و شماره‌ی انتخاب‌شده
              است.
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <div className={`${glassCard} p-4 text-center`}>
            <p className="text-sm font-bold text-blue-900">تعداد در فیلتر</p>
            <p className="text-2xl font-black text-blue-950">
              {visibleRows.length}
            </p>
          </div>
          <div className={`${glassCard} p-4 text-center`}>
            <p className="text-sm font-bold text-blue-900">انتخاب‌شده</p>
            <p className="text-2xl font-black text-teal-700">
              {selectedVisible.length}
            </p>
          </div>
          <div className={`${glassCard} p-4 text-center`}>
            <p className="text-sm font-bold text-blue-900">
              جمع مبلغ انتخابی (ریال)
            </p>
            <p className="text-xl font-black text-green-700" dir="ltr">
              {formatRial(totalSelected)}
            </p>
          </div>
        </div>

        <div className={`${glassCard} p-2 overflow-auto`}>
          {loading ? (
            <p className="p-8 text-center text-lg font-bold text-blue-700">
              در حال بارگذاری...
            </p>
          ) : (
            <table className="min-w-full text-base text-blue-900 border-collapse">
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
                {visibleRows.map((r, idx) => (
                  <tr
                    key={r.id}
                    className="border-b border-teal-500/10 bg-white/30 hover:bg-teal-400/20 cursor-pointer transition-colors"
                    onClick={() => toggleOne(r.id)}
                  >
                    <td
                      className="p-3 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
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
                    <td
                      className="p-3 text-center text-sm font-mono font-semibold text-teal-700"
                      dir="ltr"
                    >
                      {resolveCustomerCode(r.customerName, r.customerCode) ||
                        "—"}
                    </td>
                    <td className="p-3 font-bold">{r.customerName}</td>
                    <td className="p-3 text-center font-black" dir="ltr">
                      {formatRial(r.totalAmount)}
                    </td>
                    <td className="p-3 text-center">
                      {syncBadge(r.sepidarSyncStatus)}
                    </td>
                    <td className="p-3 text-center text-sm" dir="ltr">
                      {r.sepidarInvoiceId || "—"}
                    </td>
                    <td className="p-3 text-xs text-red-700 max-w-[180px]">
                      {r.sepidarSyncError || ""}
                    </td>
                  </tr>
                ))}
                {visibleRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={10}
                      className="p-8 text-center text-blue-700 font-bold"
                    >
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