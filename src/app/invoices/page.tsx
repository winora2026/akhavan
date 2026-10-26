"use client"
// REV-2026-10-15 invoices: Sepidar single+bulk + role gate (finance/admin)

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import DatePicker, { DateObject } from "react-multi-date-picker"
import persian from "react-date-object/calendars/persian"
import persian_fa from "react-date-object/locales/persian_fa"

type OrderFromApi = {
  id: string
  orderNumber: string
  customerOrderNumber: string | null
  orderDate: string
  deliveryDate: string | null
  priority: string
  totalMeterage: number
  totalQuantity: number
  hasInstallation: boolean
  installationDate: string | null
  status: string
  notes: string | null
  createdAt: string
  updatedAt?: string
  discountAmount: number | null
  discountPercent: number | null
  isOfficialInvoice?: boolean
  vatAmount?: number
  finalTotal?: number
  salesRep?: string | null
  convertedBy?: string | null
  invoicedAt?: string | null
  sepidarSyncStatus?: string | null
  sepidarInvoiceId?: string | null
  sepidarSyncedAt?: string | null
  sepidarSyncError?: string | null
  customer: {
    id: string
    name: string
    customerGroup: string | null
  }
  items: {
    id: string
    productName: string
    totalPrice: number
    meterage: number
    length?: number | null
    width?: number | null
    quantity?: number
    unitPrice?: number
    notes?: string | null
  }[]
}

type SortKey =
  | "customer"
  | "orderNumber"
  | "customerOrderNumber"
  | "orderDate"
  | "invoiceDate"
  | "deliveryDate"
  | "priority"
  | "totalMeterage"
  | "totalQuantity"
  | "totalPrice"
  | "discountAmount"
  | "vatAmount"
  | "installationDate"
  | "salesRep"
  | "registrar"

const DEFAULT_EXPERTS = [
  "خانم حسینی",
  "خانم قنبرنژاد",
  "مائده عباس زاده",
  "مجتبی خاجی",
]

const PERSIAN_MONTHS = [
  { value: "همه", label: "همه ماه‌ها" },
  { value: "01", label: "فروردین" },
  { value: "02", label: "اردیبهشت" },
  { value: "03", label: "خرداد" },
  { value: "04", label: "تیر" },
  { value: "05", label: "مرداد" },
  { value: "06", label: "شهریور" },
  { value: "07", label: "مهر" },
  { value: "08", label: "آبان" },
  { value: "09", label: "آذر" },
  { value: "10", label: "دی" },
  { value: "11", label: "بهمن" },
  { value: "12", label: "اسفند" },
]

const PERSIAN_DATE_REGEX = /^\d{3,4}\/\d{1,2}\/\d{1,2}$/

const parseOrderDate = (dateStr: string | null | undefined): Date | null => {
  if (!dateStr) return null
  if (PERSIAN_DATE_REGEX.test(dateStr)) {
    try {
      const dObj = new DateObject({
        date: dateStr,
        format: "YYYY/M/D",
        calendar: persian,
        locale: persian_fa,
      })
      const d = dObj.toDate()
      return isNaN(d.getTime()) ? null : d
    } catch {
      return null
    }
  }
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? null : d
}

const normalizeText = (value: string | null | undefined) => {
  if (!value) return ""
  return String(value)
    .replace(/[\u200c\u200f\u200e]/g, " ")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim()
}

const formatDate = (dateStr: string | null | undefined) => {
  const d = parseOrderDate(dateStr)
  if (!d) return "—"
  try {
    return new DateObject({
      date: d,
      calendar: persian,
      locale: persian_fa,
    }).format("YYYY/MM/DD")
  } catch {
    return dateStr || "—"
  }
}

const isSameLocalDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

const getFaMonth = (dateStr: string | null | undefined) => {
  const d = parseOrderDate(dateStr)
  if (!d) return ""
  try {
    const dObj = new DateObject({
      date: d,
      calendar: persian,
      locale: persian_fa,
    })
    return String(dObj.month.number).padStart(2, "0")
  } catch {
    return ""
  }
}

function getInvoiceExpert(order: OrderFromApi): string {
  if (order.convertedBy && order.convertedBy.trim()) return order.convertedBy.trim()
  const m = (order.notes || "").match(/تبدیل شده توسط:\s*(.+)/)
  if (m?.[1]) return m[1].trim()
  return "—"
}

function getPreInvoiceDate(order: OrderFromApi): string | null {
  return order.createdAt || order.orderDate || null
}

function getInvoiceDate(order: OrderFromApi): string | null {
  if (order.invoicedAt) return order.invoicedAt
  if ((order.notes || "").includes("تبدیل شده توسط") && order.updatedAt) {
    return order.updatedAt
  }
  return order.updatedAt || null
}

function isAlreadySynced(o: OrderFromApi) {
  return o.sepidarSyncStatus === "SUCCESS" && !!o.sepidarInvoiceId
}

export default function InvoicesPage() {
  const [orders, setOrders] = useState<OrderFromApi[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [fromDate, setFromDate] = useState<any>(null)
  const [toDate, setToDate] = useState<any>(null)
  const [selectedMonth, setSelectedMonth] = useState("همه")
  const [selectedExpert, setSelectedExpert] = useState("همه کارشناسان")
  const [sortKey, setSortKey] = useState<SortKey>("invoiceDate")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [revertItem, setRevertItem] = useState<OrderFromApi | null>(null)
  const [reverting, setReverting] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [bulkSyncing, setBulkSyncing] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [canSyncSepidar, setCanSyncSepidar] = useState(false)
  // پیش‌فرض: فقط فاکتورهای امروز؛ با گذشتن از نیمه‌شب صفحه خودکار روی روز جدید (خالی) می‌رود.
  // برای روزهای قبل از «از تاریخ / تا تاریخ» یا «همه روزها» استفاده کنید.
  const [dayFilter, setDayFilter] = useState<"today" | "all">("today")
  const [dayKey, setDayKey] = useState(() => new Date().toDateString())

  useEffect(() => {
    fetchOrders()
    ;(async () => {
      try {
        const res = await fetch("/api/auth/me")
        if (!res.ok) return
        const data = await res.json()
        const role = String(data?.user?.role || "").toLowerCase()
        setCanSyncSepidar(role === "finance" || role === "admin")
      } catch {
        setCanSyncSepidar(false)
      }
    })()
  }, [])

  // به‌روزرسانی خودکار: هر ۶۰ ثانیه (و وقتی دوباره به تب برمی‌گردید) لیست بدون رفرش و بدون چشمک‌زدن
  // دوباره خوانده می‌شود. کلید روز هم همین‌جا عوض می‌شود تا با رد شدن از نیمه‌شب، صفحه خودکار روی روز جدید برود.
  useEffect(() => {
    const tick = () => {
      if (document.hidden) return
      setDayKey(new Date().toDateString())
      fetchOrders(true)
    }
    const timer = setInterval(tick, 60_000)
    document.addEventListener("visibilitychange", tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [])

  // انتخاب تاریخ/ماه دستی یعنی کاربر روزهای دیگر را می‌خواهد؛ پس فیلتر «امروز» کنار می‌رود
  useEffect(() => {
    if (fromDate || toDate || selectedMonth !== "همه") setDayFilter("all")
  }, [fromDate, toDate, selectedMonth])

  const fetchOrders = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const res = await fetch("/api/orders")
      if (!res.ok) throw new Error("خطا در دریافت سفارش‌ها")
      const data = await res.json()
      const invoices = (Array.isArray(data) ? data : []).filter(
        (o: OrderFromApi) => o.status === "فاکتور"
      )
      setOrders(invoices)
    } catch (error) {
      console.error(error)
      if (!silent) alert("خطا در بارگذاری لیست فاکتورها")
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    if (!previewId) return
    const onMessage = (e: MessageEvent) => {
      if (
        e.origin === window.location.origin &&
        e.data?.type === "invoice-preview-close"
      ) {
        setPreviewId(null)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewId(null)
    }
    window.addEventListener("message", onMessage)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("message", onMessage)
      window.removeEventListener("keydown", onKey)
    }
  }, [previewId])

  const sendOneToSepidar = async (order: OrderFromApi, silent = false) => {
    if (isAlreadySynced(order)) {
      if (!silent) {
        alert(`قبلاً ارسال شده\nشناسه سپیدار: ${order.sepidarInvoiceId}`)
      }
      return { ok: false, skipped: true, orderNumber: order.orderNumber }
    }
    const res = await fetch("/api/sepidar/sync-invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: order.id }),
    })
    const data = await res.json()
    if (!res.ok) {
      return {
        ok: false,
        error: data.error || "خطا",
        orderNumber: order.orderNumber,
      }
    }
    return {
      ok: true,
      mock: !!data.mock,
      sepidarInvoiceId: data.sepidarInvoiceId,
      orderNumber: order.orderNumber,
    }
  }

  const sendToSepidar = async (order: OrderFromApi) => {
    if (!canSyncSepidar) {
      alert("فقط مالی و مدیریت مجاز به ارسال سپیدار هستند")
      return
    }
    if (isAlreadySynced(order)) {
      alert(`قبلاً ارسال شده\nشناسه سپیدار: ${order.sepidarInvoiceId}`)
      return
    }
    if (
      !confirm(
        `فاکتور ${order.orderNumber} — ${order.customer?.name}\nبه سپیدار ارسال شود؟`
      )
    ) {
      return
    }
    setSyncingId(order.id)
    try {
      const result = await sendOneToSepidar(order)
      if (!result.ok && !result.skipped) {
        alert(result.error || "خطا در ارسال به سپیدار")
        await fetchOrders()
        return
      }
      if (result.ok) {
        if (result.mock) {
          alert(
            `حالت آزمایشی (mock)\nشناسه: ${result.sepidarInvoiceId}\n\nشنبه با توکن واقعی وصل می‌شود.`
          )
        } else {
          alert(`ارسال شد\nشناسه سپیدار: ${result.sepidarInvoiceId}`)
        }
      }
      await fetchOrders()
    } catch {
      alert("خطا در ارتباط با سرور")
    } finally {
      setSyncingId(null)
    }
  }

  const sendSelectedToSepidar = async () => {
    if (!canSyncSepidar) {
      alert("فقط مالی و مدیریت مجاز به ارسال سپیدار هستند")
      return
    }
    const targets = filtered.filter(
      (o) => selectedIds.includes(o.id) && !isAlreadySynced(o)
    )
    if (targets.length === 0) {
      alert("فاکتور قابل ارسالی انتخاب نشده (یا همه قبلاً ارسال شده‌اند)")
      return
    }
    if (
      !confirm(
        `${targets.length} فاکتور انتخاب‌شده به سپیدار ارسال شود؟\n(موارد ارسال‌شده قبلی رد می‌شوند)`
      )
    ) {
      return
    }
    setBulkSyncing(true)
    let okCount = 0
    let failCount = 0
    let mockAny = false
    const errors: string[] = []
    try {
      for (const order of targets) {
        try {
          const r = await sendOneToSepidar(order, true)
          if (r.ok) {
            okCount++
            if (r.mock) mockAny = true
          } else if (!r.skipped) {
            failCount++
            errors.push(`${r.orderNumber}: ${r.error || "خطا"}`)
          }
        } catch {
          failCount++
          errors.push(`${order.orderNumber}: خطای شبکه`)
        }
      }
      await fetchOrders()
      setSelectedIds([])
      let msg = `ارسال گروهی تمام شد\nموفق: ${okCount}\nناموفق: ${failCount}`
      if (mockAny) msg += "\n\n(حداقل یک مورد در حالت mock بود)"
      if (errors.length) msg += "\n\n" + errors.slice(0, 8).join("\n")
      alert(msg)
    } finally {
      setBulkSyncing(false)
    }
  }

  const salesExperts = useMemo(() => {
    const fromData = orders
      .map((o) => getInvoiceExpert(o))
      .filter((n) => n && n !== "—")
    return [
      "همه کارشناسان",
      ...Array.from(new Set([...DEFAULT_EXPERTS, ...fromData])).sort(),
    ]
  }, [orders])

  // جمع اقلام (کالا + خدمات) بدون تخفیف و ارزش افزوده
  const getSubtotal = (order: OrderFromApi) =>
    order.items?.reduce((sum, item) => sum + (item.totalPrice || 0), 0) || 0

  // ارزش افزوده: فقط برای فاکتور رسمی، ۱۰٪ بعد از کسر تخفیف
  const getVatAmount = (order: OrderFromApi) => {
    if (!order.isOfficialInvoice) return 0
    if (typeof order.vatAmount === "number") return order.vatAmount
    const afterDiscount = getSubtotal(order) - (order.discountAmount || 0)
    return Math.round(afterDiscount * 0.1)
  }

  // قیمت کل: برای فاکتور رسمی، مبلغ قابل پرداخت با ارزش افزوده؛ برای غیررسمی همان جمع اقلام
  const getTotalPrice = (order: OrderFromApi) => {
    const subtotal = getSubtotal(order)
    if (!order.isOfficialInvoice) return subtotal
    if (typeof order.finalTotal === "number") return order.finalTotal
    return subtotal - (order.discountAmount || 0) + getVatAmount(order)
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return " ↕"
    return sortDir === "asc" ? " ↑" : " ↓"
  }

  const filtered = useMemo(() => {
    let result = [...orders]

    const tokens = normalizeText(search).split(" ").filter(Boolean)
    if (tokens.length) {
      result = result.filter((item) => {
        const haystack = normalizeText(
          [
            item.customer?.name,
            item.orderNumber,
            item.customerOrderNumber,
            item.salesRep,
            getInvoiceExpert(item),
          ]
            .filter(Boolean)
            .join(" ")
        )
        return tokens.every((t) => haystack.includes(t))
      })
    }

    if (dayFilter === "today") {
      const now = new Date()
      result = result.filter((item) => {
        const d = parseOrderDate(getInvoiceDate(item) || item.orderDate)
        return d ? isSameLocalDay(d, now) : false
      })
    }

    if (fromDate) {
      const from = fromDate?.toDate ? fromDate.toDate() : new Date(fromDate)
      from.setHours(0, 0, 0, 0)
      result = result.filter((item) => {
        const d = parseOrderDate(getInvoiceDate(item) || item.orderDate)
        if (!d) return false
        d.setHours(0, 0, 0, 0)
        return d >= from
      })
    }
    if (toDate) {
      const to = toDate?.toDate ? toDate.toDate() : new Date(toDate)
      to.setHours(23, 59, 59, 999)
      result = result.filter((item) => {
        const d = parseOrderDate(getInvoiceDate(item) || item.orderDate)
        if (!d) return false
        return d <= to
      })
    }

    if (selectedMonth !== "همه") {
      result = result.filter(
        (item) =>
          getFaMonth(getInvoiceDate(item) || item.orderDate) === selectedMonth
      )
    }

    if (selectedExpert !== "همه کارشناسان") {
      result = result.filter(
        (item) => getInvoiceExpert(item) === selectedExpert
      )
    }

    const dir = sortDir === "asc" ? 1 : -1
    result.sort((a, b) => {
      const priceA = getTotalPrice(a)
      const priceB = getTotalPrice(b)
      switch (sortKey) {
        case "customer":
          return (
            dir *
            (a.customer?.name || "").localeCompare(b.customer?.name || "", "fa")
          )
        case "orderNumber":
          return (
            dir *
            String(a.orderNumber).localeCompare(String(b.orderNumber), "fa", {
              numeric: true,
            })
          )
        case "customerOrderNumber":
          return (
            dir *
            String(a.customerOrderNumber || "").localeCompare(
              String(b.customerOrderNumber || ""),
              "fa",
              { numeric: true }
            )
          )
        case "orderDate": {
          const da = parseOrderDate(getPreInvoiceDate(a))?.getTime() || 0
          const db = parseOrderDate(getPreInvoiceDate(b))?.getTime() || 0
          return dir * (da - db)
        }
        case "invoiceDate": {
          const da = parseOrderDate(getInvoiceDate(a))?.getTime() || 0
          const db = parseOrderDate(getInvoiceDate(b))?.getTime() || 0
          return dir * (da - db)
        }
        case "deliveryDate": {
          const da = parseOrderDate(a.deliveryDate)?.getTime() || 0
          const db = parseOrderDate(b.deliveryDate)?.getTime() || 0
          return dir * (da - db)
        }
        case "priority":
          return dir * (a.priority || "").localeCompare(b.priority || "", "fa")
        case "totalMeterage":
          return dir * ((a.totalMeterage || 0) - (b.totalMeterage || 0))
        case "totalQuantity":
          return dir * ((a.totalQuantity || 0) - (b.totalQuantity || 0))
        case "totalPrice":
          return dir * (priceA - priceB)
        case "discountAmount":
          return dir * ((a.discountAmount || 0) - (b.discountAmount || 0))
        case "vatAmount":
          return dir * (getVatAmount(a) - getVatAmount(b))
        case "installationDate": {
          const da = parseOrderDate(a.installationDate)?.getTime() || 0
          const db = parseOrderDate(b.installationDate)?.getTime() || 0
          return dir * (da - db)
        }
        case "salesRep":
          return (
            dir * getInvoiceExpert(a).localeCompare(getInvoiceExpert(b), "fa")
          )
        case "registrar":
          return dir * (a.salesRep || "").localeCompare(b.salesRep || "", "fa")
        default:
          return 0
      }
    })

    return result
  }, [
    orders,
    search,
    fromDate,
    toDate,
    selectedMonth,
    selectedExpert,
    dayFilter,
    dayKey,
    sortKey,
    sortDir,
  ])

  const selectableIds = useMemo(
    () => filtered.filter((o) => !isAlreadySynced(o)).map((o) => o.id),
    [filtered]
  )

  const allSelectableChecked =
    selectableIds.length > 0 &&
    selectableIds.every((id) => selectedIds.includes(id))

  const toggleSelectAll = () => {
    if (allSelectableChecked) {
      setSelectedIds((prev) => prev.filter((id) => !selectableIds.includes(id)))
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...selectableIds])))
    }
  }

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const report = useMemo(() => {
    const totalCount = filtered.length
    const totalMeterage = filtered.reduce(
      (sum, o) => sum + (o.totalMeterage || 0),
      0
    )
    const totalPrice = filtered.reduce((sum, o) => sum + getTotalPrice(o), 0)
    const totalDiscount = filtered.reduce(
      (sum, o) => sum + (o.discountAmount || 0),
      0
    )
    const totalVat = filtered.reduce((sum, o) => sum + getVatAmount(o), 0)
    return { totalCount, totalMeterage, totalPrice, totalDiscount, totalVat }
  }, [filtered])

  const formatPrice = (n: number) => {
    if (!n && n !== 0) return "—"
    return n.toLocaleString("en-US")
  }

  const confirmRevert = async () => {
    if (!revertItem) return
    try {
      setReverting(true)
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: revertItem.id,
          status: "پیش‌فاکتور",
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا در برگشت")
      setOrders((prev) => prev.filter((o) => o.id !== revertItem.id))
      setSelectedIds((prev) => prev.filter((id) => id !== revertItem.id))
      setRevertItem(null)
      alert("فاکتور به پیش‌فاکتور برگشت و از صف تولید حذف شد")
    } catch (e: any) {
      alert(e.message || "خطا")
    } finally {
      setReverting(false)
    }
  }

  const thClass =
    "p-3 font-bold whitespace-nowrap text-center cursor-pointer select-none hover:bg-teal-500/25 transition"

  const chip = (active: boolean) =>
    `rounded-xl px-4 py-2 text-sm font-bold transition ${
      active
        ? "bg-teal-600 text-white"
        : "bg-white/50 text-blue-900 border border-teal-500/30 hover:bg-white/70"
    }`

  return (
    <div
      className="min-h-screen lg:h-screen lg:overflow-hidden p-4 bg-cover bg-center bg-fixed"
      style={{
        backgroundImage:
          "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')",
        fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif",
      }}
      dir="rtl"
    >
      <a
        href="#invoice-table"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:right-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:font-bold focus:text-teal-800"
      >
        رفتن به جدول فاکتورها
      </a>
      <div className="pointer-events-none fixed inset-0 bg-black/5" />

      <div className="relative z-10 max-w-[1920px] mx-auto lg:h-full lg:flex lg:flex-col">
        <div className="mb-4 lg:shrink-0 flex items-center justify-between rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/20">
          <div className="w-48" />
          <div className="text-center flex-1">
            <h1 className="text-3xl font-bold text-blue-950">لیست فاکتورها</h1>
            <p className="text-lg font-bold text-blue-900 mt-1">
              نرم‌افزار اخوان | شیشه و آینه
            </p>
          </div>
          <div className="flex gap-3 flex-wrap justify-end">
            {canSyncSepidar && (
              <button
                type="button"
                disabled={bulkSyncing || selectedIds.length === 0}
                onClick={sendSelectedToSepidar}
                className="rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-3 text-base font-bold text-white shadow transition focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                {bulkSyncing
                  ? "در حال ارسال گروهی..."
                  : `ارسال انتخاب‌شده‌ها (${selectedIds.length})`}
              </button>
            )}
            <Link
              href="/order/new"
              className="rounded-xl bg-teal-500 hover:bg-teal-600 px-6 py-3 text-lg font-bold text-white shadow transition focus:outline-none focus:ring-2 focus:ring-teal-400"
            >
              + ثبت سفارش جدید
            </Link>
            <Link
              href="/order"
              className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-6 py-3 text-lg font-bold text-blue-900 transition focus:outline-none focus:ring-2 focus:ring-teal-400"
            >
              پیش‌فاکتورها
            </Link>
          </div>
        </div>

        <div className="mb-4 lg:shrink-0 rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-4 shadow-lg border border-teal-500/20">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-blue-900 ml-1">نمایش:</span>
            <button
              type="button"
              onClick={() => {
                setDayFilter("today")
                setFromDate(null)
                setToDate(null)
                setSelectedMonth("همه")
              }}
              className={chip(dayFilter === "today")}
            >
              امروز ({formatDate(new Date().toISOString())})
            </button>
            <button
              type="button"
              onClick={() => setDayFilter("all")}
              className={chip(dayFilter === "all")}
            >
              همه روزها
            </button>
            {dayFilter === "today" && (
              <span className="text-xs font-semibold text-blue-700 mr-2">
                برای دیدن روزهای قبل، «از تاریخ / تا تاریخ» را انتخاب کنید.
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-3">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                جستجو
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="نام مشتری / شماره سفارش / کارشناس..."
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-base font-semibold text-blue-950 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-400 hover:bg-yellow-100 transition"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                ماه سفارش
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-base font-semibold text-blue-950 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-400"
              >
                {PERSIAN_MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2 relative z-30">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                از تاریخ
              </label>
              <DatePicker
                value={fromDate}
                onChange={setFromDate}
                calendar={persian}
                locale={persian_fa}
                calendarPosition="bottom-right"
                inputClass="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-base font-semibold text-blue-950 focus:border-teal-500 focus:outline-none"
                containerClassName="w-full"
                placeholder="از تاریخ"
                portal
                zIndex={1000}
              />
            </div>
            <div className="md:col-span-2 relative z-30">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                تا تاریخ
              </label>
              <DatePicker
                value={toDate}
                onChange={setToDate}
                calendar={persian}
                locale={persian_fa}
                calendarPosition="bottom-right"
                inputClass="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-base font-semibold text-blue-950 focus:border-teal-500 focus:outline-none"
                containerClassName="w-full"
                placeholder="تا تاریخ"
                portal
                zIndex={1000}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                کارشناس (انتقال به فاکتور)
              </label>
              <select
                value={selectedExpert}
                onChange={(e) => setSelectedExpert(e.target.value)}
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-base font-semibold text-blue-950 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-400"
              >
                {salesExperts.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-1">
              <div className="rounded-xl bg-teal-500/20 border border-teal-500/30 px-3 py-2.5 text-center">
                <span className="text-sm text-blue-700">تعداد: </span>
                <span className="text-xl font-bold text-teal-700">
                  {filtered.length}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div
          id="invoice-table"
          tabIndex={-1}
          className="rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-4 shadow-lg border border-teal-500/20 overflow-auto min-h-[260px] lg:flex-1 lg:min-h-0 focus:outline-none focus:ring-2 focus:ring-teal-400"
        >
          {loading ? (
            <p className="text-center text-blue-700 py-16 text-xl font-bold">
              در حال بارگذاری...
            </p>
          ) : (
            <table className="w-full text-sm text-blue-900 border-collapse">
              <thead className="sticky top-0 z-10 shadow-[0_1px_0_rgba(20,184,166,0.35)]">
                <tr className="border-b border-teal-500/30 bg-teal-100 text-right">
                  {canSyncSepidar && (
                    <th className="p-3 font-bold text-center w-10">
                      <input
                        type="checkbox"
                        checked={allSelectableChecked}
                        onChange={toggleSelectAll}
                        title="انتخاب همه قابل‌ارسال در لیست فیلترشده"
                        className="w-4 h-4 cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="p-3 font-bold text-center">ردیف</th>
                  <th className={thClass} onClick={() => toggleSort("customer")}>
                    نام مشتری{sortIndicator("customer")}
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("orderNumber")}
                  >
                    ش سفارش{sortIndicator("orderNumber")}
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("customerOrderNumber")}
                  >
                    ش سفارش مشتری{sortIndicator("customerOrderNumber")}
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("orderDate")}
                  >
                    تاریخ پیش‌فاکتور{sortIndicator("orderDate")}
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("invoiceDate")}
                  >
                    تاریخ فاکتور{sortIndicator("invoiceDate")}
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("deliveryDate")}
                  >
                    تاریخ تحویل{sortIndicator("deliveryDate")}
                  </th>
                  <th className={thClass} onClick={() => toggleSort("priority")}>
                    اولویت{sortIndicator("priority")}
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("totalMeterage")}
                  >
                    متراژ کل{sortIndicator("totalMeterage")}
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("totalQuantity")}
                  >
                    تعداد کل{sortIndicator("totalQuantity")}
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("totalPrice")}
                  >
                    قیمت کل{sortIndicator("totalPrice")}
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("discountAmount")}
                  >
                    تخفیف{sortIndicator("discountAmount")}
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("vatAmount")}
                  >
                    ارزش افزوده{sortIndicator("vatAmount")}
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("installationDate")}
                  >
                    تاریخ نصب{sortIndicator("installationDate")}
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("registrar")}
                  >
                    کارشناس ثبت{sortIndicator("registrar")}
                  </th>
                  <th className={thClass} onClick={() => toggleSort("salesRep")}>
                    منتقل‌کننده{sortIndicator("salesRep")}
                  </th>
                  <th className="p-3 font-bold text-center">سپیدار</th>
                  <th className="p-3 font-bold text-center">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, index) => {
                  const vat = getVatAmount(item)
                  return (
                    <tr
                      key={item.id}
                      className="border-b border-teal-500/10 transition-colors hover:bg-teal-400/20 bg-white/30 cursor-pointer"
                      title="دبل‌کلیک: نمایش کامل پیش‌فاکتور"
                      onDoubleClick={() => setPreviewId(item.id)}
                    >
                      {canSyncSepidar && (
                        <td
                          className="p-3 text-center"
                          onClick={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(item.id)}
                            disabled={isAlreadySynced(item)}
                            onChange={() => toggleSelectOne(item.id)}
                            className="w-4 h-4 cursor-pointer disabled:opacity-40"
                          />
                        </td>
                      )}
                      <td className="p-3 text-center font-bold">{index + 1}</td>
                      <td className="p-3 font-bold whitespace-nowrap">
                        {item.customer?.name || "—"}
                      </td>
                      <td className="p-3 font-semibold text-center">
                        {item.orderNumber}
                      </td>
                      <td className="p-3 font-semibold text-center">
                        {item.customerOrderNumber || "—"}
                      </td>
                      <td className="p-3 whitespace-nowrap text-center">
                        {formatDate(getPreInvoiceDate(item))}
                      </td>
                      <td className="p-3 whitespace-nowrap text-center font-semibold text-teal-800">
                        {formatDate(getInvoiceDate(item))}
                      </td>
                      <td className="p-3 whitespace-nowrap text-center">
                        {formatDate(item.deliveryDate)}
                      </td>
                      <td className="p-3 text-center">
                        {item.priority || "عادی"}
                      </td>
                      <td className="p-3 text-center font-semibold">
                        {item.totalMeterage?.toFixed(4) || "0"}
                      </td>
                      <td className="p-3 text-center font-semibold">
                        {item.totalQuantity || 0}
                      </td>
                      <td className="p-3 text-left font-bold text-teal-800 whitespace-nowrap">
                        {formatPrice(getTotalPrice(item))}
                      </td>
                      <td className="p-3 text-left font-semibold text-orange-700 whitespace-nowrap">
                        {item.discountAmount
                          ? formatPrice(item.discountAmount)
                          : "—"}
                      </td>
                      <td className="p-3 text-left font-semibold text-amber-700 whitespace-nowrap">
                        {vat ? formatPrice(vat) : "—"}
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        {item.installationDate
                          ? formatDate(item.installationDate)
                          : "—"}
                      </td>
                      <td className="p-3 text-center text-xs font-semibold text-blue-800">
                        {item.salesRep || "—"}
                      </td>
                      <td className="p-3 text-center text-xs font-semibold text-blue-800">
                        {getInvoiceExpert(item)}
                      </td>
                      <td
                        className="p-3 text-center"
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        {item.sepidarSyncStatus === "SUCCESS" ? (
                          <span
                            className="inline-block rounded-lg bg-green-100 text-green-800 text-xs font-bold px-2 py-1"
                            title={item.sepidarInvoiceId || ""}
                          >
                            ✓ ارسال‌شده
                          </span>
                        ) : item.sepidarSyncStatus === "FAILED" ? (
                          <span
                            className="inline-block rounded-lg bg-red-100 text-red-800 text-xs font-bold px-2 py-1"
                            title={item.sepidarSyncError || ""}
                          >
                            خطا
                          </span>
                        ) : item.sepidarSyncStatus === "PENDING" ? (
                          <span className="text-xs font-bold text-amber-700">
                            در حال ارسال…
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500">—</span>
                        )}
                      </td>
                      <td
                        className="p-3 text-center"
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex flex-col gap-1 items-center">
                          <Link
                            href={`/order/new?edit=${item.id}`}
                            className="inline-block rounded-lg bg-blue-500/20 hover:bg-blue-500/40 px-3 py-1.5 text-xs font-bold text-blue-900 transition focus:ring-2 focus:ring-blue-400"
                            onClick={(e) => e.stopPropagation()}
                          >
                            ویرایش
                          </Link>
                          {canSyncSepidar && (
                            <button
                              type="button"
                              disabled={
                                syncingId === item.id ||
                                bulkSyncing ||
                                item.sepidarSyncStatus === "SUCCESS"
                              }
                              onClick={(e) => {
                                e.stopPropagation()
                                sendToSepidar(item)
                              }}
                              className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed px-3 py-1.5 text-xs font-bold text-white transition focus:ring-2 focus:ring-indigo-400"
                              title={
                                item.sepidarSyncStatus === "SUCCESS"
                                  ? `ارسال‌شده: ${item.sepidarInvoiceId}`
                                  : item.sepidarSyncError ||
                                    "ارسال دستی به سپیدار"
                              }
                            >
                              {syncingId === item.id
                                ? "..."
                                : item.sepidarSyncStatus === "SUCCESS"
                                  ? "✓ سپیدار"
                                  : item.sepidarSyncStatus === "FAILED"
                                    ? "تلاش مجدد سپیدار"
                                    : "ارسال سپیدار"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setRevertItem(item)
                            }}
                            className="rounded-lg bg-amber-500/30 hover:bg-amber-500/50 px-3 py-1.5 text-xs font-bold text-amber-900 transition focus:ring-2 focus:ring-amber-400"
                          >
                            برگشت به پیش‌فاکتور
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {!loading && filtered.length === 0 && (
            <p className="text-center text-blue-700 py-12 text-xl font-bold">
              موردی یافت نشد
            </p>
          )}
        </div>

        {!loading && filtered.length > 0 && (
          <div className="mt-3 lg:shrink-0 rounded-2xl bg-teal-600/10 backdrop-blur-2xl p-3 shadow-lg border border-teal-500/30">
            <h3 className="text-lg font-bold text-blue-950 mb-2 text-center">
              گزارش خلاصه
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="rounded-xl bg-white/50 border border-teal-500/20 p-2.5 text-center">
                <p className="text-sm text-blue-700 mb-1">تعداد کل</p>
                <p className="text-2xl font-bold text-teal-700">
                  {report.totalCount}
                </p>
              </div>
              <div className="rounded-xl bg-white/50 border border-teal-500/20 p-2.5 text-center">
                <p className="text-sm text-blue-700 mb-1">متراژ کل</p>
                <p className="text-2xl font-bold text-teal-700">
                  {report.totalMeterage.toFixed(4)}
                </p>
              </div>
              <div className="rounded-xl bg-white/50 border border-teal-500/20 p-2.5 text-center">
                <p className="text-sm text-blue-700 mb-1">قیمت کل</p>
                <p className="text-2xl font-bold text-teal-700">
                  {formatPrice(report.totalPrice)}
                </p>
              </div>
              <div className="rounded-xl bg-white/50 border border-teal-500/20 p-2.5 text-center">
                <p className="text-sm text-blue-700 mb-1">مجموع تخفیف</p>
                <p className="text-2xl font-bold text-orange-600">
                  {formatPrice(report.totalDiscount)}
                </p>
              </div>
              <div className="rounded-xl bg-white/50 border border-teal-500/20 p-2.5 text-center">
                <p className="text-sm text-blue-700 mb-1">مجموع ارزش افزوده</p>
                <p className="text-2xl font-bold text-amber-600">
                  {formatPrice(report.totalVat)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {previewId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
          <iframe
            key={previewId}
            src={`/order/new?edit=${previewId}&preview=1`}
            title="پیش‌نمایش پیش‌فاکتور"
            className="h-full w-full border-0"
            style={{ background: "transparent" }}
          />
          <Link
            href={`/order/new?edit=${previewId}`}
            className="fixed bottom-3 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-blue-600 hover:bg-blue-700 px-5 py-2 text-sm font-bold text-white shadow-lg"
          >
            باز کردن برای ویرایش
          </Link>
        </div>
      )}

      {revertItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white/95 backdrop-blur-xl p-6 shadow-2xl border border-teal-500/30">
            <h3 className="text-xl font-bold text-blue-950 mb-3">
              برگشت به پیش‌فاکتور
            </h3>
            <div className="space-y-2 text-base text-blue-900 mb-4">
              <p>
                فاکتور شماره{" "}
                <strong className="text-teal-700">
                  {revertItem.orderNumber}
                </strong>
              </p>
              <p>
                مشتری:{" "}
                <strong className="text-teal-700">
                  {revertItem.customer?.name}
                </strong>
              </p>
              <p className="text-sm text-gray-600 mt-3">
                فقط اگر هنوز وارد ایستگاه برش نشده باشد، سفارش تولید حذف و وضعیت
                به پیش‌فاکتور برمی‌گردد تا بتوانید ویرایش کنید.
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setRevertItem(null)}
                disabled={reverting}
                className="rounded-xl border border-gray-300 px-5 py-2.5 text-base font-bold text-blue-900 hover:bg-gray-100 transition disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                onClick={confirmRevert}
                disabled={reverting}
                className="rounded-xl bg-amber-500 hover:bg-amber-600 px-5 py-2.5 text-base font-bold text-white shadow transition disabled:opacity-50"
              >
                {reverting ? "در حال برگشت..." : "تأیید برگشت"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}