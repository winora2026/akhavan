"use client"

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
  discountAmount: number | null
  discountPercent: number | null
  isOfficialInvoice?: boolean
  vatAmount?: number
  finalTotal?: number
  salesRep?: string | null
  convertedBy?: string | null
  invoicedAt?: string | null
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
  }[]
}

type SortKey =
  | "customer"
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

const toPersianStr = (d: Date) =>
  new DateObject({ date: d, calendar: persian, locale: persian_fa }).format(
    "YYYY/MM/DD"
  )

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
  // پیش‌فرض: فقط امروز؛ با گذشتن از نیمه‌شب صفحه خودکار روی روز جدید (خالی) می‌رود.
  // برای روزهای قبل از «از تاریخ / تا تاریخ» یا «همه روزها» استفاده کنید.
  const [dayFilter, setDayFilter] = useState<"all" | "today">("today")
  const [dayKey, setDayKey] = useState(() => new Date().toDateString())
  const [sending, setSending] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>("orderDate")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [currentUserName, setCurrentUserName] = useState<string | null>(null)
  // پیش‌نمایش کامل پیش‌فاکتور با دبل‌کلیک روی ردیف (iframe همان صفحه‌ی ثبت سفارش در حالت preview)
  const [previewId, setPreviewId] = useState<string | null>(null)

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
      // همه سفارش‌ها را نگه می‌داریم؛ فیلتر وضعیت سمت کلاینت است
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

  const statusCounts = useMemo(() => {
    const now = new Date()
    let pre = 0
    let inv = 0
    let preToday = 0
    let invToday = 0
    for (const o of orders) {
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
    return { pre, inv, all: orders.length, preToday, invToday }
  }, [orders, dayKey])

  const filtered = useMemo(() => {
    let result = [...orders]
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
          item.orderNumber?.toLowerCase().includes(q) ||
          (item.customerOrderNumber || "").toLowerCase().includes(q) ||
          (item.salesRep || "").toLowerCase().includes(q) ||
          (item.convertedBy || "").toLowerCase().includes(q)
      )
    }

    // فیلتر بازه/ماه روی تاریخ پیش‌فاکتور (createdAt)
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
    dayKey,
    sortKey,
    sortDir,
  ])

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

  const confirmSend = async () => {
    if (!confirmItem) return
    try {
      setSending(true)
      const { today, delivery } = calcNewDates(confirmItem)
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: confirmItem.id,
          status: "فاکتور",
          convertedBy: currentUserName || confirmItem.salesRep || "سیستم",
          orderDate: toPersianStr(today),
          deliveryDate: toPersianStr(delivery),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "خطا در انتقال")
      }
      // به‌جای حذف، وضعیت را در لیست به‌روز می‌کنیم
      setOrders((prev) =>
        prev.map((i) =>
          i.id === confirmItem.id
            ? {
                ...i,
                status: "فاکتور",
                convertedBy: currentUserName || i.salesRep || null,
                invoicedAt: new Date().toISOString(),
                orderDate: toPersianStr(today),
                deliveryDate: toPersianStr(delivery),
              }
            : i
        )
      )
      setConfirmItem(null)
      alert("پیش‌فاکتور به فاکتور منتقل شد و وارد تولید گردید")
    } catch (error: any) {
      console.error(error)
      alert(error.message || "خطا در انتقال به فاکتور")
    } finally {
      setSending(false)
    }
  }

  const thClass =
    "p-3 font-bold whitespace-nowrap text-center cursor-pointer select-none hover:bg-teal-500/25 transition"

  const newDates = confirmItem ? calcNewDates(confirmItem) : null

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
        href="#order-table"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:right-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:font-bold focus:text-teal-800"
      >
        رفتن به جدول سفارش‌ها
      </a>
      <div className="pointer-events-none fixed inset-0 bg-black/5" />

      <div className="relative z-10 max-w-[1920px] mx-auto lg:h-full lg:flex lg:flex-col">
        <div className="mb-4 lg:shrink-0 flex items-center justify-between rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/20">
          <div className="w-48" />
          <div className="text-center flex-1">
            <h1 className="text-3xl font-bold text-blue-950">
              لیست پیش‌فاکتورها
            </h1>
            <p className="text-lg font-bold text-blue-900 mt-1">
              نرم‌افزار اخوان | شیشه و آینه
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/order/new"
              className="rounded-xl bg-teal-500 hover:bg-teal-600 px-6 py-3 text-lg font-bold text-white shadow transition focus:outline-none focus:ring-2 focus:ring-teal-400"
            >
              + ثبت سفارش جدید
            </Link>
            <Link
              href="/invoices"
              className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-6 py-3 text-lg font-bold text-blue-900 transition focus:outline-none focus:ring-2 focus:ring-teal-400"
            >
              فاکتورها
            </Link>
          </div>
        </div>

        <div className="mb-4 lg:shrink-0 rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-4 shadow-lg border border-teal-500/20">
          {/* فیلتر وضعیت: پیش‌فاکتور / فاکتور / همه */}
          <div className="mb-3 flex flex-wrap gap-2 items-center">
            <span className="text-sm font-bold text-blue-900 ml-1">وضعیت:</span>
            <button
              type="button"
              onClick={() => setStatusFilter("pre")}
              className={chip(statusFilter === "pre")}
            >
              فقط پیش‌فاکتور ({statusCounts.pre})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("invoice")}
              className={chip(statusFilter === "invoice")}
            >
              فقط فاکتور ({statusCounts.inv})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={chip(statusFilter === "all")}
            >
              همه ({statusCounts.all})
            </button>

            <span className="text-sm font-bold text-blue-900 mr-3 ml-1">
              روز:
            </span>
            <button
              type="button"
              onClick={() => setDayFilter("all")}
              className={chip(dayFilter === "all")}
            >
              همه روزها
            </button>
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
              امروز (پیش‌فاکتور {statusCounts.preToday} / فاکتور{" "}
              {statusCounts.invToday})
            </button>
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
                ماه پیش‌فاکتور
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
                از تاریخ ثبت
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
                تا تاریخ ثبت
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
                کارشناس فروش
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
          id="order-table"
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
                          <button
                            onClick={() => setConfirmItem(item)}
                            className="rounded-lg bg-teal-500 hover:bg-teal-600 px-3 py-1.5 text-xs font-bold text-white shadow transition focus:ring-2 focus:ring-teal-300"
                          >
                            ارسال به فاکتور
                          </button>
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
                  <p>
                    تاریخ فاکتور (امروز):{" "}
                    <strong className="text-teal-700">
                      {formatDate(newDates.today.toISOString())}
                    </strong>
                  </p>
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
                <li>تاریخ فاکتور و تاریخ تحویل از امروز به‌روزرسانی می‌شود</li>
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
    </div>
  )
}