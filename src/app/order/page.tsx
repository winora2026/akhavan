"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import Link from "next/link"
import DatePicker, { DateObject } from "react-multi-date-picker"
import persian from "react-date-object/calendars/persian"
import persian_fa from "react-date-object/locales/persian_fa"
import customersSeedRaw from "../customers/customers-seed.json"

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
  discountAmount: number | null
  discountPercent: number | null
  isOfficialInvoice?: boolean
  vatAmount?: number
  finalTotal?: number
  salesRep?: string | null
  convertedBy?: string | null
  invoicedAt?: string | null
  cancelledAt?: string | null
  cancelledBy?: string | null
  cancelReason?: string | null
  customer: {
    id: string
    name: string
    customerGroup: string | null
    customerCode?: string | null
    code?: string | null
  }
  items: {
    id: string
    productName: string
    totalPrice: number
    meterage: number
  }[]
}

type SortKey =
  | "customer"
  | "customerCode"
  | "orderNumber"
  | "customerOrderNumber"
  | "orderDate"
  | "deliveryDate"
  | "priority"
  | "totalMeterage"
  | "totalQuantity"
  | "totalPrice"
  | "discountAmount"
  | "vatAmount"
  | "installationDate"
  | "salesRep"
  | "status"

type StatusFilter = "pre" | "invoice" | "all"

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

const FILTERS_STORAGE_KEY = "preInvoicesFilters"
const SCROLL_STORAGE_KEY = "preInvoicesTableScroll"

const serializeFilterDate = (d: any): string | null =>
  d && typeof d.toDate === "function" ? d.toDate().toISOString() : null

const deserializeFilterDate = (iso: string | null | undefined) =>
  iso
    ? new DateObject({
        date: new Date(iso),
        calendar: persian,
        locale: persian_fa,
      })
    : null

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

const getCustomerCode = (o: OrderFromApi) => {
  const dbCode = String(o.customer?.customerCode || o.customer?.code || "").trim()
  if (dbCode && !/^C-\d{8,}$/.test(dbCode)) return dbCode
  return seedCodeByName.get(normalizeText(o.customer?.name)) || ""
}

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

const isSameLocalDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

const isPreStatus = (s: string) => s === "پیش‌فاکتور" || s === "ثبت‌شده"
const isInvoiceStatus = (s: string) => s === "فاکتور"
const isCancelledStatus = (s: string) => s === "لغو شده"

const IRAN_HOLIDAYS: string[] = []
const DEFAULT_LEAD_DAYS = 4

const isNonWorkingDay = (d: Date) => {
  if (d.getDay() === 5) return true
  return IRAN_HOLIDAYS.includes(d.toISOString().slice(0, 10))
}

const addBusinessDays = (start: Date, n: number) => {
  const result = new Date(start)
  let added = 0
  while (added < n) {
    result.setDate(result.getDate() + 1)
    if (!isNonWorkingDay(result)) added++
  }
  return result
}

const countBusinessDays = (from: Date, to: Date) => {
  const cur = new Date(from)
  cur.setHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setHours(0, 0, 0, 0)
  let n = 0
  while (cur < end) {
    cur.setDate(cur.getDate() + 1)
    if (!isNonWorkingDay(cur)) n++
  }
  return n
}

const calcNewDates = (order: {
  orderDate: string
  deliveryDate: string | null
}) => {
  const today = new Date()
  const oldOrder = parseOrderDate(order.orderDate)
  const oldDelivery = parseOrderDate(order.deliveryDate)
  let lead =
    oldOrder && oldDelivery ? countBusinessDays(oldOrder, oldDelivery) : 0
  if (lead <= 0) lead = DEFAULT_LEAD_DAYS
  return { today, delivery: addBusinessDays(today, lead), lead }
}

const formatPrice = (n: number) =>
  Math.round(n || 0).toLocaleString("fa-IR")

const thClass =
  "p-3 font-bold text-center cursor-pointer select-none hover:bg-teal-200/60 whitespace-nowrap"

export default function PreInvoicesPage() {
  const [orders, setOrders] = useState<OrderFromApi[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [fromDate, setFromDate] = useState<any>(null)
  const [toDate, setToDate] = useState<any>(null)
  const [selectedMonth, setSelectedMonth] = useState("همه")
  const [confirmItem, setConfirmItem] = useState<OrderFromApi | null>(null)
  const [selectedExpert, setSelectedExpert] = useState("همه کارشناسان")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pre")
  const [dayFilter, setDayFilter] = useState<"all" | "today">("today")
  const [dayKey, setDayKey] = useState(() => new Date().toDateString())
  const [sending, setSending] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>("orderDate")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [currentUserName, setCurrentUserName] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [cancelItem, setCancelItem] = useState<OrderFromApi | null>(null)
  const [cancelReason, setCancelReason] = useState("")
  const [cancelling, setCancelling] = useState(false)
  const [filtersRestored, setFiltersRestored] = useState(false)
  const tableRef = useRef<HTMLDivElement>(null)
  const scrollRestoredRef = useRef(false)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(FILTERS_STORAGE_KEY)
      if (raw) {
        const f = JSON.parse(raw)
        if (typeof f.search === "string") setSearch(f.search)
        if (f.fromDate) setFromDate(deserializeFilterDate(f.fromDate))
        if (f.toDate) setToDate(deserializeFilterDate(f.toDate))
        if (typeof f.selectedMonth === "string") setSelectedMonth(f.selectedMonth)
        if (typeof f.selectedExpert === "string")
          setSelectedExpert(f.selectedExpert)
        if (
          f.statusFilter === "pre" ||
          f.statusFilter === "invoice" ||
          f.statusFilter === "all"
        )
          setStatusFilter(f.statusFilter)
        if (f.dayFilter === "all" || f.dayFilter === "today")
          setDayFilter(f.dayFilter)
        if (f.sortKey) setSortKey(f.sortKey)
        if (f.sortDir === "asc" || f.sortDir === "desc") setSortDir(f.sortDir)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setFiltersRestored(true)
    }
  }, [])

  useEffect(() => {
    if (!filtersRestored) return
    try {
      sessionStorage.setItem(
        FILTERS_STORAGE_KEY,
        JSON.stringify({
          search,
          fromDate: serializeFilterDate(fromDate),
          toDate: serializeFilterDate(toDate),
          selectedMonth,
          selectedExpert,
          statusFilter,
          dayFilter,
          sortKey,
          sortDir,
        })
      )
    } catch (err) {
      console.error(err)
    }
  }, [
    filtersRestored,
    search,
    fromDate,
    toDate,
    selectedMonth,
    selectedExpert,
    statusFilter,
    dayFilter,
    sortKey,
    sortDir,
  ])

  useEffect(() => {
    if (loading || scrollRestoredRef.current) return
    const el = tableRef.current
    if (!el) return
    scrollRestoredRef.current = true
    try {
      const saved = Number(sessionStorage.getItem(SCROLL_STORAGE_KEY) || 0)
      if (saved > 0) requestAnimationFrame(() => (el.scrollTop = saved))
    } catch {}
  }, [loading, filtersRestored])

  useEffect(() => {
    fetchOrders()
    ;(async () => {
      try {
        const res = await fetch("/api/auth/me")
        if (!res.ok) return
        const data = await res.json()
        if (data?.user?.displayName) {
          setCurrentUserName(data.user.displayName)
        }
      } catch {}
    })()
  }, [])

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

  useEffect(() => {
    if (fromDate || toDate || selectedMonth !== "همه") setDayFilter("all")
  }, [fromDate, toDate, selectedMonth])

  const fetchOrders = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const res = await fetch("/api/orders")
      if (!res.ok) throw new Error("خطا در دریافت سفارش‌ها")
      const data = await res.json()
      setOrders(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error(error)
      if (!silent) alert("خطا در بارگذاری لیست سفارش‌ها")
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const salesExperts = useMemo(() => {
    const fromData = orders
      .map((o) => o.salesRep)
      .filter((n): n is string => Boolean(n && n.trim()))
    return [
      "همه کارشناسان",
      ...Array.from(new Set([...DEFAULT_EXPERTS, ...fromData])).sort(),
    ]
  }, [orders])

  const getSubtotal = (order: OrderFromApi) =>
    order.items?.reduce((sum, item) => sum + (item.totalPrice || 0), 0) || 0

  const getVatAmount = (order: OrderFromApi) => {
    if (!order.isOfficialInvoice) return 0
    if (typeof order.vatAmount === "number") return order.vatAmount
    const afterDiscount = getSubtotal(order) - (order.discountAmount || 0)
    return Math.round(afterDiscount * 0.1)
  }

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

  const statusCounts = useMemo(() => {
    const now = new Date()
    let pre = 0
    let inv = 0
    let preToday = 0
    let invToday = 0
    for (const o of orders) {
      if (isCancelledStatus(o.status)) continue
      const created = parseOrderDate(o.createdAt)
      const invAt = parseOrderDate(o.invoicedAt || null)
      if (isPreStatus(o.status)) {
        pre++
        if (created && isSameLocalDay(created, now)) preToday++
      }
      if (isInvoiceStatus(o.status)) {
        inv++
        if (invAt && isSameLocalDay(invAt, now)) invToday++
        else if (!invAt && created && isSameLocalDay(created, now)) invToday++
      }
    }
    return {
      pre,
      inv,
      all: orders.filter((o) => !isCancelledStatus(o.status)).length,
      preToday,
      invToday,
    }
  }, [orders, dayKey])

  const filtered = useMemo(() => {
    // لغوشده‌ها در این صفحه نیستند
    let result = orders.filter((o) => !isCancelledStatus(o.status))
    const now = new Date()

    if (statusFilter === "pre") {
      result = result.filter((o) => isPreStatus(o.status))
    } else if (statusFilter === "invoice") {
      result = result.filter((o) => isInvoiceStatus(o.status))
    }

    if (dayFilter === "today") {
      result = result.filter((item) => {
        if (isInvoiceStatus(item.status)) {
          const d = parseOrderDate(item.invoicedAt || item.createdAt)
          return d ? isSameLocalDay(d, now) : false
        }
        const d = parseOrderDate(item.createdAt)
        return d ? isSameLocalDay(d, now) : false
      })
    }

    const q = search.trim().toLowerCase()
    if (q) {
      result = result.filter(
        (item) =>
          item.customer?.name?.toLowerCase().includes(q) ||
          getCustomerCode(item).toLowerCase().includes(q) ||
          item.orderNumber?.toLowerCase().includes(q) ||
          (item.customerOrderNumber || "").toLowerCase().includes(q) ||
          (item.salesRep || "").toLowerCase().includes(q) ||
          (item.convertedBy || "").toLowerCase().includes(q)
      )
    }

    if (fromDate) {
      const from = fromDate?.toDate ? fromDate.toDate() : new Date(fromDate)
      from.setHours(0, 0, 0, 0)
      result = result.filter((item) => {
        const d = parseOrderDate(item.createdAt)
        if (!d) return false
        d.setHours(0, 0, 0, 0)
        return d >= from
      })
    }
    if (toDate) {
      const to = toDate?.toDate ? toDate.toDate() : new Date(toDate)
      to.setHours(23, 59, 59, 999)
      result = result.filter((item) => {
        const d = parseOrderDate(item.createdAt)
        if (!d) return false
        return d <= to
      })
    }

    if (selectedMonth !== "همه") {
      result = result.filter(
        (item) => getFaMonth(item.createdAt) === selectedMonth
      )
    }

    if (selectedExpert !== "همه کارشناسان") {
      result = result.filter((item) => item.salesRep === selectedExpert)
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
        case "customerCode":
          return (
            dir *
            getCustomerCode(a).localeCompare(getCustomerCode(b), "fa", {
              numeric: true,
            })
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
          const da = parseOrderDate(a.createdAt)?.getTime() || 0
          const db = parseOrderDate(b.createdAt)?.getTime() || 0
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
          return dir * (a.salesRep || "").localeCompare(b.salesRep || "", "fa")
        case "status":
          return dir * (a.status || "").localeCompare(b.status || "", "fa")
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
    statusFilter,
    dayFilter,
    sortKey,
    sortDir,
    dayKey,
  ])

  const report = useMemo(() => {
    let totalCount = 0
    let totalMeterage = 0
    let totalPrice = 0
    let totalDiscount = 0
    let totalVat = 0
    for (const o of filtered) {
      totalCount++
      totalMeterage += o.totalMeterage || 0
      totalPrice += getTotalPrice(o)
      totalDiscount += o.discountAmount || 0
      totalVat += getVatAmount(o)
    }
    return { totalCount, totalMeterage, totalPrice, totalDiscount, totalVat }
  }, [filtered])

  const newDates = useMemo(() => {
    if (!confirmItem) return null
    return calcNewDates(confirmItem)
  }, [confirmItem])

  const confirmSend = async () => {
    if (!confirmItem || !newDates) return
    setSending(true)
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: confirmItem.id,
          status: "فاکتور",
          convertedBy: currentUserName || undefined,
          orderDate: newDates.today.toISOString(),
          deliveryDate: newDates.delivery.toISOString(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا در انتقال")
      setConfirmItem(null)
      await fetchOrders()
    } catch (e: any) {
      alert(e.message || "خطا")
    } finally {
      setSending(false)
    }
  }

  const confirmCancel = async () => {
    if (!cancelItem) return
    const reason = cancelReason.trim()
    if (!reason) {
      alert("دلیل لغو را بنویسید")
      return
    }
    setCancelling(true)
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: cancelItem.id,
          status: "لغو شده",
          cancelReason: reason,
          convertedBy: currentUserName || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا در لغو")
      setCancelItem(null)
      setCancelReason("")
      await fetchOrders()
      alert("پیش‌فاکتور به لیست لغوشده‌ها منتقل شد")
    } catch (e: any) {
      alert(e.message || "خطا")
    } finally {
      setCancelling(false)
    }
  }

  const deleteOrder = async (item: OrderFromApi) => {
    if (
      !confirm(
        `پیش‌فاکتور ${item.orderNumber} برای همیشه حذف شود؟\n(برای لغو با ثبت دلیل از دکمه «لغو» استفاده کنید)`
      )
    )
      return
    setDeletingId(item.id)
    try {
      const res = await fetch(`/api/orders/${item.id}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "خطا در حذف")
      await fetchOrders()
    } catch (e: any) {
      alert(e.message || "خطا")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div
      className="min-h-screen p-3 md:p-4 bg-cover bg-center bg-fixed"
      dir="rtl"
      style={{
        fontFamily: "Vazirmatn, Tahoma, sans-serif",
        backgroundImage:
          "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')",
      }}
    >
      <div className="pointer-events-none fixed inset-0 bg-black/20" />
      <div className="relative z-10 max-w-[1800px] mx-auto flex flex-col lg:h-[calc(100vh-1.5rem)] lg:overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2 lg:shrink-0">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-blue-950">
              پیش‌فاکتورها
            </h1>
            <p className="text-sm text-blue-900 font-semibold">
              مدیریت پیش‌فاکتور، ارسال به فاکتور و لغو
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/order/new"
              className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 font-bold"
            >
              ثبت سفارش
            </Link>
            <Link
              href="/order/cancelled"
              className="rounded-xl border border-amber-400 bg-amber-50 px-4 py-2 font-bold text-amber-900"
            >
              لغوشده‌ها
            </Link>
            <Link
              href="/invoices"
              className="rounded-xl border bg-white/90 px-4 py-2 font-bold"
            >
              فاکتورها
            </Link>
            <Link
              href="/"
              className="rounded-xl border bg-white/90 px-4 py-2 font-bold"
            >
              داشبورد
            </Link>
          </div>
        </div>

        <div className="rounded-2xl bg-white/85 backdrop-blur border border-teal-500/25 p-3 mb-2 lg:shrink-0 shadow">
          <div className="flex flex-wrap gap-2 mb-2">
            <button
              type="button"
              onClick={() => setStatusFilter("pre")}
              className={`rounded-xl px-3 py-1.5 text-sm font-bold border ${
                statusFilter === "pre"
                  ? "bg-teal-600 text-white border-teal-700"
                  : "bg-white text-blue-900 border-teal-200"
              }`}
            >
              پیش‌فاکتور ({statusCounts.pre})
              {dayFilter === "today" ? ` · امروز ${statusCounts.preToday}` : ""}
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("invoice")}
              className={`rounded-xl px-3 py-1.5 text-sm font-bold border ${
                statusFilter === "invoice"
                  ? "bg-amber-600 text-white border-amber-700"
                  : "bg-white text-blue-900 border-teal-200"
              }`}
            >
              فاکتور ({statusCounts.inv})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`rounded-xl px-3 py-1.5 text-sm font-bold border ${
                statusFilter === "all"
                  ? "bg-blue-900 text-white border-blue-950"
                  : "bg-white text-blue-900 border-teal-200"
              }`}
            >
              همه ({statusCounts.all})
            </button>
            <button
              type="button"
              onClick={() =>
                setDayFilter((d) => (d === "today" ? "all" : "today"))
              }
              className={`rounded-xl px-3 py-1.5 text-sm font-bold border ${
                dayFilter === "today"
                  ? "bg-blue-600 text-white border-blue-700"
                  : "bg-white text-blue-900 border-teal-200"
              }`}
            >
              {dayFilter === "today" ? "فقط امروز" : "همه روزها"}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end">
            <div className="md:col-span-3">
              <label className="mb-0.5 block text-xs font-bold text-blue-900">
                جستجو
              </label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="مشتری، کد، شماره سفارش..."
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-3 py-1.5 text-sm font-semibold"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-0.5 block text-xs font-bold text-blue-900">
                ماه
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-3 py-1.5 text-sm font-semibold"
              >
                {PERSIAN_MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2 relative z-30">
              <label className="mb-0.5 block text-xs font-bold text-blue-900">
                از تاریخ ثبت
              </label>
              <DatePicker
                value={fromDate}
                onChange={setFromDate}
                calendar={persian}
                locale={persian_fa}
                calendarPosition="bottom-right"
                inputClass="w-full rounded-xl border border-teal-500/30 bg-white/50 px-3 py-1.5 text-sm font-semibold text-blue-950 focus:border-teal-500 focus:outline-none"
                containerClassName="w-full"
                placeholder="از تاریخ"
                portal
                zIndex={1000}
              />
            </div>
            <div className="md:col-span-2 relative z-30">
              <label className="mb-0.5 block text-xs font-bold text-blue-900">
                تا تاریخ ثبت
              </label>
              <DatePicker
                value={toDate}
                onChange={setToDate}
                calendar={persian}
                locale={persian_fa}
                calendarPosition="bottom-right"
                inputClass="w-full rounded-xl border border-teal-500/30 bg-white/50 px-3 py-1.5 text-sm font-semibold text-blue-950 focus:border-teal-500 focus:outline-none"
                containerClassName="w-full"
                placeholder="تا تاریخ"
                portal
                zIndex={1000}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-0.5 block text-xs font-bold text-blue-900">
                کارشناس فروش
              </label>
              <select
                value={selectedExpert}
                onChange={(e) => setSelectedExpert(e.target.value)}
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-3 py-1.5 text-sm font-semibold text-blue-950 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-400"
              >
                {salesExperts.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-1">
              <div className="rounded-xl bg-teal-500/20 border border-teal-500/30 px-3 py-1.5 text-center">
                <span className="text-sm text-blue-700">تعداد: </span>
                <span className="text-xl font-bold text-teal-700">
                  {filtered.length}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div
          id="order-table"
          ref={tableRef}
          tabIndex={-1}
          onScroll={(e) => {
            const top = e.currentTarget.scrollTop
            try {
              sessionStorage.setItem(SCROLL_STORAGE_KEY, String(top))
            } catch {}
          }}
          className="rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-2 shadow-lg border border-teal-500/20 overflow-auto min-h-[260px] lg:flex-1 lg:min-h-0 focus:outline-none focus:ring-2 focus:ring-teal-400"
        >
          {loading ? (
            <p className="text-center text-blue-700 py-16 text-xl font-bold">
              در حال بارگذاری...
            </p>
          ) : (
            <table className="w-full text-sm text-blue-900 border-collapse">
              <thead className="sticky top-0 z-10 shadow-[0_1px_0_rgba(20,184,166,0.35)]">
                <tr className="border-b border-teal-500/30 bg-teal-100 text-right">
                  <th className="p-3 font-bold text-center">ردیف</th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("customerCode")}
                  >
                    کد مشتری{sortIndicator("customerCode")}
                  </th>
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
                  <th className={thClass} onClick={() => toggleSort("status")}>
                    وضعیت{sortIndicator("status")}
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("orderDate")}
                  >
                    تاریخ پیش‌فاکتور{sortIndicator("orderDate")}
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
                  <th className={thClass} onClick={() => toggleSort("salesRep")}>
                    کارشناس{sortIndicator("salesRep")}
                  </th>
                  <th className="p-3 font-bold text-center">ویرایش</th>
                  <th className="p-3 font-bold text-center">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, index) => {
                  const isInv = isInvoiceStatus(item.status)
                  const vat = getVatAmount(item)
                  return (
                    <tr
                      key={item.id}
                      title="دبل‌کلیک: نمایش کامل پیش‌فاکتور"
                      onDoubleClick={() => setPreviewId(item.id)}
                      className={`border-b border-teal-500/10 transition-colors hover:bg-teal-400/20 cursor-pointer ${
                        isInv ? "bg-amber-50/40" : "bg-white/30"
                      }`}
                    >
                      <td className="p-3 text-center font-bold">{index + 1}</td>
                      <td className="p-3 text-center font-mono font-semibold text-teal-700 whitespace-nowrap">
                        <bdi>{getCustomerCode(item) || "—"}</bdi>
                      </td>
                      <td className="p-3 font-bold whitespace-nowrap">
                        {item.customer?.name || "—"}
                      </td>
                      <td className="p-3 font-semibold text-center">
                        {item.orderNumber}
                      </td>
                      <td className="p-3 font-semibold text-center">
                        {item.customerOrderNumber || "—"}
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                            isInv
                              ? "bg-amber-100 text-amber-800"
                              : "bg-teal-100 text-teal-800"
                          }`}
                        >
                          {isInv ? "فاکتور" : "پیش‌فاکتور"}
                        </span>
                      </td>
                      <td className="p-3 whitespace-nowrap text-center">
                        {formatDate(item.createdAt)}
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
                        {isInv
                          ? item.convertedBy || item.salesRep || "—"
                          : item.salesRep || "—"}
                      </td>
                      <td
                        className="p-3 text-center"
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        {!isInv ? (
                          <Link
                            href={`/order/new?edit=${item.id}`}
                            className="inline-block rounded-lg bg-blue-500/20 hover:bg-blue-500/40 px-3 py-1.5 text-xs font-bold text-blue-900 transition focus:ring-2 focus:ring-blue-400"
                          >
                            ویرایش
                          </Link>
                        ) : (
                          <Link
                            href="/invoices"
                            className="inline-block rounded-lg bg-gray-200/60 hover:bg-gray-300/60 px-3 py-1.5 text-xs font-bold text-blue-900 transition"
                          >
                            لیست فاکتور
                          </Link>
                        )}
                      </td>
                      <td
                        className="p-3 text-center"
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        {!isInv ? (
                          <div className="flex flex-wrap gap-1.5 justify-center">
                            <button
                              onClick={() => setConfirmItem(item)}
                              className="rounded-lg bg-teal-500 hover:bg-teal-600 px-3 py-1.5 text-xs font-bold text-white shadow transition focus:ring-2 focus:ring-teal-300"
                            >
                              ارسال به فاکتور
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCancelReason("")
                                setCancelItem(item)
                              }}
                              className="rounded-lg bg-amber-500/20 hover:bg-amber-500/40 px-3 py-1.5 text-xs font-bold text-amber-900 transition"
                            >
                              لغو
                            </button>
                            <button
                              type="button"
                              disabled={deletingId === item.id}
                              onClick={() => deleteOrder(item)}
                              className="rounded-lg bg-red-500/15 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 text-xs font-bold text-red-700 transition focus:ring-2 focus:ring-red-300"
                            >
                              {deletingId === item.id ? "..." : "حذف"}
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

          {!loading && filtered.length === 0 && (
            <p className="text-center text-blue-700 py-12 text-xl font-bold">
              موردی یافت نشد
            </p>
          )}
        </div>

        {!loading && filtered.length > 0 && (
          <div className="mt-2 lg:shrink-0 rounded-2xl bg-teal-600/10 backdrop-blur-2xl p-1.5 shadow-lg border border-teal-500/30">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <div className="rounded-lg bg-white/50 border border-teal-500/20 px-2 py-1 text-center">
                <p className="text-xs text-blue-700">تعداد کل</p>
                <p className="text-lg font-bold text-teal-700">
                  {report.totalCount}
                </p>
              </div>
              <div className="rounded-lg bg-white/50 border border-teal-500/20 px-2 py-1 text-center">
                <p className="text-xs text-blue-700">متراژ کل</p>
                <p className="text-lg font-bold text-teal-700">
                  {report.totalMeterage.toFixed(4)}
                </p>
              </div>
              <div className="rounded-lg bg-white/50 border border-teal-500/20 px-2 py-1 text-center">
                <p className="text-xs text-blue-700">قیمت کل</p>
                <p className="text-lg font-bold text-teal-700">
                  {formatPrice(report.totalPrice)}
                </p>
              </div>
              <div className="rounded-lg bg-white/50 border border-teal-500/20 px-2 py-1 text-center">
                <p className="text-xs text-blue-700">مجموع تخفیف</p>
                <p className="text-lg font-bold text-orange-600">
                  {formatPrice(report.totalDiscount)}
                </p>
              </div>
              <div className="rounded-lg bg-white/50 border border-teal-500/20 px-2 py-1 text-center">
                <p className="text-xs text-blue-700">مجموع ارزش افزوده</p>
                <p className="text-lg font-bold text-amber-600">
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

      {confirmItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white/95 backdrop-blur-xl p-6 shadow-2xl border border-teal-500/30">
            <h3 className="text-xl font-bold text-blue-950 mb-3">
              تأیید ارسال به فاکتور و تولید
            </h3>
            <div className="space-y-2 text-base text-blue-900 mb-4">
              <p>
                پیش‌فاکتور شماره{" "}
                <strong className="text-teal-700">
                  {confirmItem.orderNumber}
                </strong>
              </p>
              <p>
                مشتری:{" "}
                <strong className="text-teal-700">
                  {confirmItem.customer?.name}
                </strong>
              </p>
              <p>
                کارشناس ثبت:{" "}
                <strong className="text-teal-700">
                  {confirmItem.salesRep || "—"}
                </strong>
              </p>
              <p>
                منتقل‌کننده:{" "}
                <strong className="text-teal-700">
                  {currentUserName || "—"}
                </strong>
              </p>
              <p>
                تاریخ پیش‌فاکتور:{" "}
                <strong className="text-teal-700">
                  {formatDate(confirmItem.createdAt)}
                </strong>
                <span className="text-xs text-gray-500 mr-1">(ثابت می‌ماند)</span>
              </p>

              {newDates && (
                <div className="rounded-xl bg-teal-50 border border-teal-200 p-3 text-sm">
                  {confirmItem.invoicedAt ? (
                    <p>
                      تاریخ فاکتور (اولیه):{" "}
                      <strong className="text-teal-700">
                        {formatDate(confirmItem.invoicedAt)}
                      </strong>
                      <span className="text-xs text-gray-500 mr-1">
                        (این سفارش قبلاً فاکتور شده؛ ثابت می‌ماند)
                      </span>
                    </p>
                  ) : (
                    <p>
                      تاریخ فاکتور (امروز):{" "}
                      <strong className="text-teal-700">
                        {formatDate(newDates.today.toISOString())}
                      </strong>
                    </p>
                  )}
                  <p className="mt-1">
                    تاریخ تحویل جدید:{" "}
                    <strong className="text-teal-700">
                      {formatDate(newDates.delivery.toISOString())}
                    </strong>
                    <span className="text-xs text-gray-500 mr-2">
                      ({newDates.lead} روز کاری)
                    </span>
                  </p>
                </div>
              )}

              <p className="text-sm text-gray-600 mt-3">با تأیید:</p>
              <ul className="text-sm text-gray-700 list-disc list-inside space-y-1">
                <li>وضعیت به «فاکتور» تغییر می‌کند</li>
                <li>
                  {confirmItem.invoicedAt
                    ? "تاریخ فاکتور اولیه ثابت می‌ماند و فقط تاریخ تحویل به‌روزرسانی می‌شود"
                    : "تاریخ فاکتور و تاریخ تحویل از امروز به‌روزرسانی می‌شود"}
                </li>
                <li>تاریخ پیش‌فاکتور (اولین ثبت) ثابت می‌ماند</li>
                <li>سفارش به‌صورت خودکار وارد تولید می‌شود</li>
              </ul>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmItem(null)}
                disabled={sending}
                className="rounded-xl border border-gray-300 px-5 py-2.5 text-base font-bold text-blue-900 hover:bg-gray-100 transition disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                onClick={confirmSend}
                disabled={sending}
                className="rounded-xl bg-teal-500 hover:bg-teal-600 px-5 py-2.5 text-base font-bold text-white shadow transition disabled:opacity-50"
              >
                {sending ? "در حال انتقال..." : "بله، منتقل کن"}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white/95 p-6 shadow-2xl border border-amber-500/40">
            <h3 className="text-xl font-bold text-blue-950 mb-3">
              لغو پیش‌فاکتور
            </h3>
            <div className="space-y-2 text-base text-blue-900 mb-3">
              <p>
                شماره:{" "}
                <strong className="text-teal-700">
                  {cancelItem.orderNumber}
                </strong>
              </p>
              <p>
                مشتری:{" "}
                <strong className="text-teal-700">
                  {cancelItem.customer?.name}
                </strong>
              </p>
              <p>
                لغو توسط:{" "}
                <strong className="text-teal-700">
                  {currentUserName || "—"}
                </strong>
              </p>
            </div>
            <label className="block text-sm font-bold text-blue-900 mb-1">
              دلیل لغو *
            </label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-amber-400 px-3 py-2 mb-4 font-semibold"
              placeholder="مثلاً: انصراف مشتری / قیمت / اشتباه ثبت / ..."
            />
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                disabled={cancelling}
                onClick={() => {
                  setCancelItem(null)
                  setCancelReason("")
                }}
                className="rounded-xl border px-5 py-2.5 font-bold"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={cancelling}
                onClick={confirmCancel}
                className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 font-bold disabled:opacity-50"
              >
                {cancelling ? "..." : "تأیید لغو"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}