"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

type ProductionOrder = {
  id: string
  productionNumber: string
  status: string
  priority: string
  notes: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  totalMeterage?: number | null
  /** خروج خورده بودن کل سفارش (از API) */
  isExited?: boolean | null
  order: {
    id: string
    orderNumber: string
    customerOrderNumber?: string | null
    orderDate: string
    deliveryDate: string | null
    totalMeterage?: number | null
    isExited?: boolean | null
    customer: {
      id: string
      name: string
    }
  }
  items: {
    id: string
    productName: string
    quantity: number
    status: string
    barcode?: string | null
    meterage?: number | null
    /** خروج خورده بودن همین کالا (از API) */
    isExited?: boolean | null
  }[]
}

/** یک ردیف = یک نوع کالا داخل یک سفارش */
type WorkflowRow = {
  rowKey: string
  productionOrderId: string
  itemId: string
  productName: string
  itemQuantity: number
  orderTotalQuantity: number
  itemMeterage: number | null
  orderTotalMeterage: number | null
  status: string
  itemStatus: string
  priority: string
  orderNumber: string
  customerOrderNumber: string
  customerName: string
  orderDate: string | null
  deliveryDate: string | null
  createdAt: string
  isExited: boolean
}

/** یک سفارش (چند قلم) = یک ردیف در لیست سطح اول */
type OrderGroup = {
  key: string
  productionOrderId: string
  orderNumber: string
  customerOrderNumber: string
  customerName: string
  priority: string
  status: string
  orderDate: string | null
  deliveryDate: string | null
  itemCount: number
  totalQty: number
  totalMeterage: number
  exitedCount: number
  isExited: boolean
  productSummary: string
  rows: WorkflowRow[]
}

type RouteStep = {
  id: string
  name: string
  sequence: number
  status: string
  quantityIn: number | null
  quantityOut: number | null
  completedAt: string | null
}
type RouteItem = {
  id: string
  productName: string
  length: number | null
  width: number | null
  quantity: number
  meterage: number | null
  barcode: string | null
  status: string
  route: RouteStep[]
}

type SortKey =
  | "orderNumber"
  | "customerName"
  | "customerOrderNumber"
  | "productSummary"
  | "itemCount"
  | "totalQty"
  | "totalMeterage"
  | "orderDate"
  | "deliveryDate"
  | "priority"
  | "status"
  | "exit"

type ItemSortKey = "productName" | "quantity" | "meterage" | "exit"

type DeadlineFilter = "all" | "overdue" | "near" | "overdue_and_near"
type ExitFilter = "all" | "exited" | "not_exited"

const STORAGE_KEY = "production-workflow-page-state-v2"

/**
 * نرمال‌سازی متن فارسی برای جستجو:
 * - ي/ى → ی ، ك → ک ، ة → ه
 * - حذف اعراب و کشیده
 * - تبدیل ارقام فارسی/عربی به لاتین
 * - حذف فاصله و نیم‌فاصله
 */
const compact = (value: string | null | undefined): string => {
  if (!value) return ""
  return String(value)
    .toLowerCase()
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[\s\u200c\u200d\u200e\u200f]+/g, "")
}

export default function ProductionWorkflowPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<ProductionOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("همه")
  const [deadlineFilter, setDeadlineFilter] = useState<DeadlineFilter>("all")
  const [exitFilter, setExitFilter] = useState<ExitFilter>("all")
  const [sortKey, setSortKey] = useState<SortKey>("deliveryDate")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  // سطح دوم: سفارشی که واردش شده‌ایم + مسیر ایستگاه‌های اقلامش
  const [openOrderId, setOpenOrderId] = useState<string | null>(null)
  const [routeData, setRouteData] = useState<
    Record<string, { loading: boolean; error: string | null; items: RouteItem[] }>
  >({})
  const [itemSort, setItemSort] = useState<{
    key: ItemSortKey
    dir: "asc" | "desc"
  } | null>(null)
  const listScrollRef = useRef(0)
  const openRef = useRef<string | null>(null)
  openRef.current = openOrderId
  const sentinelRef = useRef(false)
  const ignorePopRef = useRef(false)

  const [hydrated, setHydrated] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const savedScrollRef = useRef<number>(0)
  const scrollRestoredRef = useRef(false)

  // بازیابی فیلترها از sessionStorage (فقط یک‌بار هنگام ورود به صفحه)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (raw) {
        const s = JSON.parse(raw)
        if (typeof s.search === "string") setSearch(s.search)
        if (typeof s.statusFilter === "string") setStatusFilter(s.statusFilter)
        if (typeof s.deadlineFilter === "string")
          setDeadlineFilter(s.deadlineFilter)
        if (typeof s.exitFilter === "string") setExitFilter(s.exitFilter)
        if (typeof s.sortKey === "string") setSortKey(s.sortKey)
        if (s.sortDir === "asc" || s.sortDir === "desc") setSortDir(s.sortDir)
        if (typeof s.scrollTop === "number") savedScrollRef.current = s.scrollTop
      }
    } catch {
      // ignore
    }
    setHydrated(true)
  }, [])

  // ذخیره فیلترها با هر تغییر
  useEffect(() => {
    if (!hydrated) return
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          search,
          statusFilter,
          deadlineFilter,
          exitFilter,
          sortKey,
          sortDir,
          scrollTop: scrollRef.current?.scrollTop ?? savedScrollRef.current,
        })
      )
    } catch {
      // ignore
    }
  }, [hydrated, search, statusFilter, deadlineFilter, exitFilter, sortKey, sortDir])

  const saveScroll = () => {
    if (openRef.current) return
    const top = scrollRef.current?.scrollTop ?? 0
    savedScrollRef.current = top
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      const s = raw ? JSON.parse(raw) : {}
      s.scrollTop = top
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    fetchOrders()
  }, [])

  // Esc: اگر داخل سفارش هستیم فقط یک مرحله به لیست سفارش‌ها برمی‌گردد؛ از لیست، به داشبورد
  const goBackStep = () => {
    if (openRef.current) {
      setOpenOrderId(null)
      return
    }
    router.push("/")
  }
  const goBackRef = useRef(goBackStep)
  goBackRef.current = goBackStep

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") goBackRef.current()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // دکمه‌ی back مرورگر هم وقتی داخل سفارش هستیم فقط به لیست سفارش‌ها برمی‌گردد
  useEffect(() => {
    if (openOrderId && !sentinelRef.current) {
      window.history.pushState({ wf: 1 }, "")
      sentinelRef.current = true
    } else if (!openOrderId && sentinelRef.current) {
      sentinelRef.current = false
      ignorePopRef.current = true
      window.history.back()
    }
  }, [openOrderId])

  useEffect(() => {
    const onPop = () => {
      if (ignorePopRef.current) {
        ignorePopRef.current = false
        return
      }
      sentinelRef.current = false
      if (openRef.current) setOpenOrderId(null)
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  // با ورود به سفارش، مسیر ایستگاه‌های اقلامش خوانده می‌شود؛ با خروج، محل اسکرول لیست برمی‌گردد
  useEffect(() => {
    if (openOrderId) {
      if (scrollRef.current) {
        listScrollRef.current = scrollRef.current.scrollTop
        scrollRef.current.scrollTop = 0
      }
      setItemSort(null)
      if (!routeData[openOrderId]) loadRoute(openOrderId)
    } else {
      const top = listScrollRef.current
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = top
      })
    }
  }, [openOrderId])

  const loadRoute = async (orderId: string) => {
    setRouteData((p) => ({
      ...p,
      [orderId]: { loading: true, error: null, items: p[orderId]?.items || [] },
    }))
    try {
      // همان API صفحه‌ی «جزئیات سفارش تولید» که اقلام را همراه ایستگاه‌هایشان برمی‌گرداند
      const res = await fetch(`/api/production/orders/${orderId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا در دریافت مسیر")
      const items: RouteItem[] = (Array.isArray(data.items) ? data.items : []).map(
        (it: any) => ({
          id: it.id,
          productName: it.productName,
          length: it.length ?? null,
          width: it.width ?? null,
          quantity: it.quantity,
          meterage: it.meterage ?? null,
          barcode: it.barcode ?? null,
          status: it.status,
          route: (Array.isArray(it.stations) ? it.stations : [])
            .slice()
            .sort((a: any, b: any) => (a.sequence ?? 0) - (b.sequence ?? 0))
            .map((s: any) => ({
              id: s.id,
              name: s.station?.name || "—",
              sequence: s.sequence ?? 0,
              status: s.status === "تکمیل‌شده" ? "تکمیل شده" : s.status,
              quantityIn: s.quantityIn ?? null,
              quantityOut: s.quantityOut ?? 0,
              completedAt: s.completedAt ?? null,
            })),
        })
      )
      setRouteData((p) => ({
        ...p,
        [orderId]: { loading: false, error: null, items },
      }))
    } catch (e: any) {
      setRouteData((p) => ({
        ...p,
        [orderId]: {
          loading: false,
          error: e?.message || "خطا در دریافت مسیر",
          items: p[orderId]?.items || [],
        },
      }))
    }
  }

  const fetchOrders = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/production/orders")
      if (!res.ok) throw new Error("خطا در دریافت")
      const data = await res.json()
      setOrders(Array.isArray(data) ? data : [])
      if (openRef.current) loadRoute(openRef.current)
    } catch (error) {
      console.error(error)
      alert("خطا در بارگذاری روند کاری")
    } finally {
      setLoading(false)
    }
  }

  const parseDate = (dateStr: string | null | undefined): Date | null => {
    if (!dateStr) return null
    const d = new Date(dateStr)
    return isNaN(d.getTime()) ? null : d
  }

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "—"
    try {
      return new Date(dateStr).toLocaleDateString("fa-IR")
    } catch {
      return "—"
    }
  }

  const getOrderTotalMeterage = (order: ProductionOrder) => {
    if (order.totalMeterage != null) return order.totalMeterage
    if (order.order?.totalMeterage != null) return order.order.totalMeterage
    if (!order.items?.length) return null
    const sum = order.items.reduce((acc, item) => acc + (item.meterage || 0), 0)
    return sum > 0 ? sum : null
  }

  const getOrderTotalQuantity = (order: ProductionOrder) => {
    if (!order.items?.length) return 0
    return order.items.reduce((acc, item) => acc + (item.quantity || 0), 0)
  }

  const isOverdue = (deliveryDate: string | null | undefined) => {
    const d = parseDate(deliveryDate)
    if (!d) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return d < today
  }

  const isNearDeadline = (deliveryDate: string | null | undefined) => {
    const d = parseDate(deliveryDate)
    if (!d) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const diffDays = Math.ceil(
      (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    )
    return diffDays >= 0 && diffDays <= 7
  }

  /** تبدیل سفارش‌ها به ردیف‌های سطح کالا */
  const allRows = useMemo((): WorkflowRow[] => {
    const rows: WorkflowRow[] = []
    for (const order of orders) {
      const orderTotalQty = getOrderTotalQuantity(order)
      const orderTotalM = getOrderTotalMeterage(order)
      const items: ProductionOrder["items"] = order.items?.length
        ? order.items
        : [
            {
              id: `${order.id}-empty`,
              productName: "—",
              quantity: 0,
              status: order.status,
              meterage: null,
            },
          ]

      for (const item of items) {
        const exited = Boolean(
          item.isExited ?? order.isExited ?? order.order?.isExited ?? false
        )
        rows.push({
          rowKey: `${order.id}-${item.id}`,
          productionOrderId: order.id,
          itemId: item.id,
          productName: item.productName || "—",
          itemQuantity: item.quantity || 0,
          orderTotalQuantity: orderTotalQty,
          itemMeterage: item.meterage != null ? item.meterage : null,
          orderTotalMeterage: orderTotalM,
          status: order.status,
          itemStatus: item.status || order.status,
          priority: order.priority || "عادی",
          orderNumber: order.order?.orderNumber || "",
          customerOrderNumber: order.order?.customerOrderNumber || "",
          customerName: order.order?.customer?.name || "",
          orderDate: order.order?.orderDate || null,
          deliveryDate: order.order?.deliveryDate || null,
          createdAt: order.createdAt,
          isExited: exited,
        })
      }
    }
    return rows
  }, [orders])

  /** گروه‌بندی ردیف‌های کالا بر اساس سفارش: هر سفارش یک ردیف */
  const allGroups = useMemo((): OrderGroup[] => {
    const map = new Map<string, WorkflowRow[]>()
    for (const r of allRows) {
      const list = map.get(r.productionOrderId)
      if (list) list.push(r)
      else map.set(r.productionOrderId, [r])
    }
    return Array.from(map.entries()).map(([id, rows]) => {
      const first = rows[0]
      const names = Array.from(new Set(rows.map((r) => r.productName)))
      const exitedCount = rows.filter((r) => r.isExited).length
      const sumM = rows.reduce((s, r) => s + (r.itemMeterage || 0), 0)
      return {
        key: id,
        productionOrderId: id,
        orderNumber: first.orderNumber,
        customerOrderNumber: first.customerOrderNumber,
        customerName: first.customerName,
        priority: first.priority,
        status: first.status,
        orderDate: first.orderDate,
        deliveryDate: first.deliveryDate,
        itemCount: rows.length,
        totalQty: first.orderTotalQuantity,
        totalMeterage: first.orderTotalMeterage ?? (sumM > 0 ? sumM : 0),
        exitedCount,
        isExited: exitedCount === rows.length,
        productSummary:
          names.length > 1 ? `${names[0]} (+${names.length - 1})` : names[0] || "—",
        rows,
      }
    })
  }, [allRows])

  // فیلترها (جستجو / وضعیت / موعد) روی سفارش‌ها؛ فیلتر خروج جدا شمرده می‌شود تا تعدادش نمایش داده شود
  const baseGroups = useMemo(() => {
    let result = allGroups

    // جستجو با نرمال‌سازی؛ همه‌ی کلمات باید در نام مشتری، شماره‌ها یا یکی از کالاهای سفارش پیدا شوند
    const tokens = search
      .trim()
      .split(/[\s\u200c]+/)
      .map(compact)
      .filter(Boolean)
    if (tokens.length > 0) {
      result = result.filter((g) => {
        const hay = [
          compact(g.customerName),
          compact(g.orderNumber),
          compact(g.customerOrderNumber),
          ...g.rows.map((r) => compact(r.productName)),
        ].join("|")
        return tokens.every((tk) => hay.includes(tk))
      })
    }

    if (statusFilter !== "همه") {
      result = result.filter((g) => g.status === statusFilter)
    }

    if (deadlineFilter === "overdue") {
      result = result.filter((g) => isOverdue(g.deliveryDate))
    } else if (deadlineFilter === "near") {
      result = result.filter((g) => isNearDeadline(g.deliveryDate))
    } else if (deadlineFilter === "overdue_and_near") {
      result = result.filter(
        (g) => isOverdue(g.deliveryDate) || isNearDeadline(g.deliveryDate)
      )
    }
    return result
  }, [allGroups, search, statusFilter, deadlineFilter])

  const exitCounts = useMemo(
    () => ({
      all: baseGroups.length,
      exited: baseGroups.filter((g) => g.isExited).length,
      notExited: baseGroups.filter((g) => !g.isExited).length,
    }),
    [baseGroups]
  )

  const filteredSorted = useMemo(() => {
    let result = [...baseGroups]

    // سفارش خروج‌خورده = همه‌ی اقلامش خروج خورده؛ اگر حتی یک قلم مانده باشد «خروج نخورده» حساب می‌شود
    if (exitFilter === "exited") {
      result = result.filter((g) => g.isExited)
    } else if (exitFilter === "not_exited") {
      result = result.filter((g) => !g.isExited)
    }

    const ts = (d: string | null) => parseDate(d)?.getTime() || 0
    const val = (g: OrderGroup): string | number => {
      switch (sortKey) {
        case "orderNumber":
          return g.orderNumber
        case "customerName":
          return g.customerName
        case "customerOrderNumber":
          return g.customerOrderNumber
        case "productSummary":
          return g.productSummary
        case "itemCount":
          return g.itemCount
        case "totalQty":
          return g.totalQty
        case "totalMeterage":
          return g.totalMeterage
        case "orderDate":
          return ts(g.orderDate)
        case "priority":
          return g.priority
        case "status":
          return g.status
        case "exit":
          return g.exitedCount / Math.max(1, g.itemCount)
        case "deliveryDate":
        default:
          return parseDate(g.deliveryDate)?.getTime() || Number.MAX_SAFE_INTEGER
      }
    }
    result.sort((a, b) => {
      const av = val(a)
      const bv = val(b)
      let cmp = 0
      if (typeof av === "string" && typeof bv === "string")
        cmp = av.localeCompare(bv, "fa", { numeric: true })
      else cmp = (av as number) - (bv as number)
      return sortDir === "asc" ? cmp : -cmp
    })
    return result
  }, [baseGroups, exitFilter, sortKey, sortDir])

  const openGroup = openOrderId
    ? allGroups.find((g) => g.productionOrderId === openOrderId) || null
    : null

  const openRoute = openOrderId ? routeData[openOrderId] : undefined
  const sortedItemRows = useMemo(() => {
    const rows = openGroup?.rows || []
    if (!itemSort) return rows
    const byId = new Map<string, RouteItem>(
      (openRoute?.items || []).map((i): [string, RouteItem] => [i.id, i])
    )
    const val = (r: WorkflowRow): string | number => {
      switch (itemSort.key) {
        case "productName":
          return r.productName
        case "quantity":
          return r.itemQuantity
        case "meterage":
          return r.itemMeterage ?? byId.get(r.itemId)?.meterage ?? 0
        case "exit":
          return r.isExited ? 1 : 0
      }
    }
    return [...rows].sort((a, b) => {
      const av = val(a)
      const bv = val(b)
      const cmp =
        typeof av === "string" && typeof bv === "string"
          ? av.localeCompare(bv, "fa", { numeric: true })
          : (av as number) - (bv as number)
      return itemSort.dir === "asc" ? cmp : -cmp
    })
  }, [openGroup, itemSort, openRoute])

  const toggleItemSort = (key: ItemSortKey) =>
    setItemSort((cur) =>
      !cur || cur.key !== key
        ? { key, dir: "asc" }
        : cur.dir === "asc"
          ? { key, dir: "desc" }
          : null
    )
  const itemSortIcon = (key: ItemSortKey) =>
    !itemSort || itemSort.key !== key ? " ↕" : itemSort.dir === "asc" ? " ↑" : " ↓"

  // بازیابی محل اسکرول بعد از برگشت از صفحه جزئیات
  useEffect(() => {
    if (scrollRestoredRef.current) return
    if (loading || !hydrated) return
    if (filteredSorted.length === 0) return
    const el = scrollRef.current
    if (el && savedScrollRef.current > 0) {
      el.scrollTop = savedScrollRef.current
    }
    scrollRestoredRef.current = true
  }, [loading, hydrated, filteredSorted.length])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return " ↕"
    return sortDir === "asc" ? " ↑" : " ↓"
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "در انتظار":
        return "bg-yellow-100 text-yellow-800"
      case "در حال تولید":
        return "bg-blue-100 text-blue-800"
      case "تکمیل‌شده":
        return "bg-green-100 text-green-800"
      case "متوقف‌شده":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getRowClass = (row: WorkflowRow) => {
    if (isOverdue(row.deliveryDate)) {
      return "border-b border-red-200 bg-red-50/60 hover:bg-red-100/70"
    }
    if (isNearDeadline(row.deliveryDate)) {
      return "border-b border-orange-200 bg-orange-50/50 hover:bg-orange-100/60"
    }
    return "border-b border-teal-500/10 bg-white/30 hover:bg-teal-400/30"
  }

  // th ها sticky هستند، پس پس‌زمینه‌ی کاملاً مات لازم دارند
  const thBase =
    "sticky top-0 z-20 bg-teal-100 p-3 font-bold whitespace-nowrap text-center shadow-[0_1px_0_0_rgba(20,184,166,0.4)]"
  const thClass = `${thBase} cursor-pointer select-none hover:bg-teal-200 transition`

  return (
    <div
      className="h-screen overflow-hidden p-4 bg-cover bg-center bg-fixed"
      style={{
        backgroundImage:
          "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')",
        fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif",
      }}
      dir="rtl"
    >
      <div className="pointer-events-none fixed inset-0 bg-black/5" />

      <div className="relative z-10 max-w-[1600px] mx-auto h-full flex flex-col">
        {/* هدر صفحه (ثابت) */}
        <div className="mb-4 shrink-0 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/20">
          <div>
            <h1 className="text-2xl font-bold text-blue-950">مشاهده روند کاری</h1>
            <p className="text-sm text-blue-800 mt-1">
              هر ردیف = یک سفارش — برای دیدن مسیر ایستگاه‌های هر قلم روی سفارش کلیک کنید ·
              Esc = یک مرحله بازگشت
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/production/station-queue"
              className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-4 py-2.5 text-blue-900 font-bold"
            >
              کارتابل
            </Link>
            <Link
              href="/production/cutting"
              className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-4 py-2.5 text-blue-900 font-bold"
            >
              برنامه‌ریزی برش
            </Link>
            <Link
              href="/production/dashboard"
              className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-4 py-2.5 text-blue-900 font-bold"
            >
              داشبورد
            </Link>
            <Link
              href="/"
              className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-4 py-2.5 text-blue-900 font-bold"
            >
              بازگشت
            </Link>
          </div>
        </div>

        {/* فیلترها (ثابت) */}
        <div className="mb-4 shrink-0 rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-4 shadow-lg border border-teal-500/20">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-blue-900 ml-1">وضعیت خروج:</span>
            {(
              [
                ["all", `همه (${exitCounts.all})`],
                ["exited", `خروج خورده (${exitCounts.exited})`],
                ["not_exited", `خروج نخورده (${exitCounts.notExited})`],
              ] as [ExitFilter, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setExitFilter(k)}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                  exitFilter === k
                    ? k === "exited"
                      ? "bg-green-600 text-white"
                      : k === "not_exited"
                        ? "bg-orange-500 text-white"
                        : "bg-teal-600 text-white"
                    : "bg-white/50 text-blue-900 border border-teal-500/30 hover:bg-white/70"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-5">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                جستجو (مشتری / ش سفارش / ش سفارش مشتری / نام کالا)
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="نام مشتری، شماره سفارش، شماره سفارش مشتری یا نام کالا..."
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-sm font-semibold text-blue-950 focus:border-teal-500 focus:outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                وضعیت
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-sm font-semibold text-blue-950 focus:border-teal-500 focus:outline-none"
              >
                <option value="همه">همه</option>
                <option value="در انتظار">در انتظار</option>
                <option value="در حال تولید">در حال تولید</option>
                <option value="تکمیل‌شده">تکمیل‌شده</option>
                <option value="متوقف‌شده">متوقف‌شده</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                فیلتر موعد تحویل
              </label>
              <select
                value={deadlineFilter}
                onChange={(e) =>
                  setDeadlineFilter(e.target.value as DeadlineFilter)
                }
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-sm font-semibold text-blue-950 focus:border-teal-500 focus:outline-none"
              >
                <option value="all">همه سفارش‌ها</option>
                <option value="overdue">فقط موعد گذشته</option>
                <option value="near">موعد نزدیک (۷ روز آینده)</option>
                <option value="overdue_and_near">موعد گذشته + نزدیک</option>
              </select>
            </div>

            <div className="md:col-span-1">
              <div className="rounded-xl bg-teal-500/20 border border-teal-500/30 px-3 py-2.5 text-center">
                <span className="text-sm text-blue-700">سفارش </span>
                <span className="text-lg font-bold text-teal-700">
                  {filteredSorted.length}
                </span>
              </div>
            </div>

            <div className="md:col-span-2">
              <button
                onClick={fetchOrders}
                className="w-full rounded-xl bg-teal-500 hover:bg-teal-600 px-4 py-2.5 text-white font-bold"
              >
                بروزرسانی
              </button>
            </div>
          </div>
        </div>

        {openOrderId && openGroup && (
                <div className="mb-2 shrink-0 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-500/30 bg-teal-100 p-3 shadow-lg">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setOpenOrderId(null)}
                      className="rounded-xl border border-teal-500 bg-white px-4 py-2 font-bold text-teal-800 hover:bg-teal-50"
                    >
                      → بازگشت به لیست سفارش‌ها
                    </button>
                    <span className="text-lg font-black text-blue-950">
                      سفارش {openGroup.orderNumber}
                    </span>
                    <span className="font-bold text-blue-900">
                      {openGroup.customerName}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm font-bold text-blue-900">
                    <span>اولویت: {openGroup.priority}</span>
                    <span>تحویل: {formatDate(openGroup.deliveryDate)}</span>
                    <span>
                      {openGroup.itemCount} قلم | {openGroup.totalQty} عدد
                    </span>
                    <Link
                      href={`/production/orders/${openGroup.productionOrderId}`}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                    >
                      صفحه جزئیات سفارش
                    </Link>
                    <button
                      type="button"
                      onClick={() => loadRoute(openGroup.productionOrderId)}
                      className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-700"
                    >
                      بروزرسانی مسیر
                    </button>
                  </div>
                </div>
        )}

        {/* جدول: فقط همین بخش اسکرول می‌شود و تیترها ثابت می‌مانند */}
        <div
          ref={scrollRef}
          onScroll={saveScroll}
          className="flex-1 min-h-0 overflow-auto rounded-2xl bg-teal-500/10 backdrop-blur-2xl shadow-lg border border-teal-500/20"
        >
          {loading ? (
            <p className="text-center text-blue-700 py-16 text-xl font-bold">
              در حال بارگذاری...
            </p>
          ) : openOrderId ? (
            /* ---------- سطح دوم: اقلام سفارش و مسیر ایستگاه‌های هر قلم ---------- */
            openGroup ? (
              <div>
                {openRoute?.loading && openRoute.items.length === 0 ? (
                  <p className="py-12 text-center text-lg font-bold text-blue-700">
                    در حال دریافت مسیر ایستگاه‌ها...
                  </p>
                ) : openRoute?.error ? (
                  <p className="py-12 text-center text-lg font-bold text-red-700">
                    {openRoute.error}
                  </p>
                ) : (
                  <table className="w-full text-sm text-blue-900 border-separate border-spacing-0">
                    <thead>
                      <tr className="text-right">
                        <th className={`${thBase}`}>ردیف</th>
                        <th
                          className={`${thClass}`}
                          onClick={() => toggleItemSort("productName")}
                        >
                          نام کالا{itemSortIcon("productName")}
                        </th>
                        <th className={`${thBase}`}>ابعاد</th>
                        <th
                          className={`${thClass}`}
                          onClick={() => toggleItemSort("quantity")}
                        >
                          تعداد{itemSortIcon("quantity")}
                        </th>
                        <th
                          className={`${thClass}`}
                          onClick={() => toggleItemSort("meterage")}
                        >
                          متراژ{itemSortIcon("meterage")}
                        </th>
                        <th
                          className={`${thClass}`}
                          onClick={() => toggleItemSort("exit")}
                        >
                          خروج{itemSortIcon("exit")}
                        </th>
                        <th className={`${thBase}`}>
                          مسیر ایستگاه‌ها (سبز = رد شده، آبی = در حال انجام، خاکستری = در انتظار)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedItemRows.map((row, index) => {
                        const ri = (openRoute?.items || []).find(
                          (x) => x.id === row.itemId
                        )
                        const steps = ri?.route || []
                        return (
                          <tr
                            key={row.rowKey}
                            className="border-b border-teal-500/10 bg-white/40 align-top"
                          >
                            <td className="p-3 text-center font-bold">{index + 1}</td>
                            <td className="p-3 font-bold">
                              {row.productName}
                              {ri?.barcode && (
                                <div className="font-mono text-xs font-semibold text-gray-600" dir="ltr">
                                  {ri.barcode}
                                </div>
                              )}
                            </td>
                            <td className="p-3 text-center font-semibold whitespace-nowrap">
                              {ri?.length && ri?.width ? `${ri.length}×${ri.width}` : "—"}
                            </td>
                            <td className="p-3 text-center font-semibold">
                              {row.itemQuantity}
                            </td>
                            <td className="p-3 text-center font-semibold">
                              {(row.itemMeterage ?? ri?.meterage) != null
                                ? Number(row.itemMeterage ?? ri?.meterage).toLocaleString("fa-IR")
                                : "—"}
                            </td>
                            <td className="p-3 text-center">
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap ${
                                  row.isExited
                                    ? "bg-green-100 text-green-800"
                                    : "bg-gray-100 text-gray-600"
                                }`}
                              >
                                {row.isExited ? "خروج خورده" : "خروج نخورده"}
                              </span>
                            </td>
                            <td className="p-3">
                              {steps.length === 0 ? (
                                <span className="text-xs text-gray-500">
                                  {openRoute?.loading ? "..." : "مسیری ثبت نشده"}
                                </span>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {steps.map((s, i) => {
                                    const done = s.status === "تکمیل شده"
                                    const active = s.status === "در حال انجام"
                                    return (
                                      <span
                                        key={s.id}
                                        title={`${s.name} — ${
                                          done
                                            ? "رد شده"
                                            : active
                                              ? `در حال انجام (${s.quantityOut ?? 0} رد شده)`
                                              : `در انتظار ${s.name}`
                                        }${
                                          done && s.completedAt
                                            ? " | " +
                                              new Date(s.completedAt).toLocaleString("fa-IR")
                                            : ""
                                        }`}
                                        className={`rounded-lg border px-2 py-1 text-xs font-bold whitespace-nowrap ${
                                          done
                                            ? "border-green-400 bg-green-100 text-green-800"
                                            : active
                                              ? "border-blue-400 bg-blue-100 text-blue-800"
                                              : "border-gray-300 bg-gray-100 text-gray-600"
                                        }`}
                                      >
                                        {i + 1}. {s.name}
                                        {done ? " ✓" : active ? " …" : ""}
                                      </span>
                                    )
                                  })}
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            ) : (
              <div className="py-12 text-center">
                <p className="mb-4 text-lg font-bold text-blue-700">
                  این سفارش در لیست پیدا نشد
                </p>
                <button
                  type="button"
                  onClick={() => setOpenOrderId(null)}
                  className="rounded-xl bg-teal-600 px-6 py-2.5 font-bold text-white hover:bg-teal-700"
                >
                  → بازگشت به لیست سفارش‌ها
                </button>
              </div>
            )
          ) : filteredSorted.length === 0 ? (
            <p className="text-center text-blue-700 py-16 text-xl font-bold">
              سفارشی یافت نشد
            </p>
          ) : (
            /* ---------- سطح اول: لیست سفارش‌ها (هر سفارش یک ردیف) ---------- */
            <table className="w-full text-sm text-blue-900 border-separate border-spacing-0">
              <thead>
                <tr className="text-right">
                  <th className={thBase}>ردیف</th>
                  <th className={thClass} onClick={() => toggleSort("customerName")}>
                    مشتری{sortIcon("customerName")}
                  </th>
                  <th className={thClass} onClick={() => toggleSort("customerOrderNumber")}>
                    ش سفارش مشتری{sortIcon("customerOrderNumber")}
                  </th>
                  <th className={thClass} onClick={() => toggleSort("orderNumber")}>
                    ش سفارش{sortIcon("orderNumber")}
                  </th>
                  <th className={thClass} onClick={() => toggleSort("productSummary")}>
                    نام کالا{sortIcon("productSummary")}
                  </th>
                  <th className={thClass} onClick={() => toggleSort("itemCount")}>
                    تعداد قلم{sortIcon("itemCount")}
                  </th>
                  <th className={thClass} onClick={() => toggleSort("totalQty")}>
                    تعداد کل{sortIcon("totalQty")}
                  </th>
                  <th className={thClass} onClick={() => toggleSort("totalMeterage")}>
                    متراژ کل{sortIcon("totalMeterage")}
                  </th>
                  <th className={thClass} onClick={() => toggleSort("priority")}>
                    اولویت{sortIcon("priority")}
                  </th>
                  <th className={thClass} onClick={() => toggleSort("orderDate")}>
                    تاریخ سفارش{sortIcon("orderDate")}
                  </th>
                  <th className={thClass} onClick={() => toggleSort("deliveryDate")}>
                    تاریخ تحویل{sortIcon("deliveryDate")}
                  </th>
                  <th className={thClass} onClick={() => toggleSort("status")}>
                    وضعیت{sortIcon("status")}
                  </th>
                  <th className={thClass} onClick={() => toggleSort("exit")}>
                    خروج{sortIcon("exit")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredSorted.map((g, index) => (
                  <tr
                    key={g.key}
                    onClick={() => {
                      saveScroll()
                      setOpenOrderId(g.productionOrderId)
                    }}
                    title="کلیک = ورود به سفارش و دیدن مسیر ایستگاه‌ها"
                    className={`transition cursor-pointer ${getRowClass({
                      deliveryDate: g.deliveryDate,
                    } as WorkflowRow)}`}
                  >
                    <td className="p-3 text-center font-bold">{index + 1}</td>
                    <td className="p-3 font-bold">{g.customerName || "—"}</td>
                    <td className="p-3 text-center font-semibold">
                      {g.customerOrderNumber || "—"}
                    </td>
                    <td className="p-3 text-center font-bold text-teal-800">
                      {g.orderNumber || "—"}
                    </td>
                    <td className="p-3 font-bold">{g.productSummary}</td>
                    <td className="p-3 text-center font-semibold">{g.itemCount}</td>
                    <td className="p-3 text-center font-semibold">{g.totalQty}</td>
                    <td className="p-3 text-center font-semibold">
                      {Number(g.totalMeterage).toLocaleString("fa-IR")}
                    </td>
                    <td className="p-3 text-center">{g.priority}</td>
                    <td className="p-3 text-center">{formatDate(g.orderDate)}</td>
                    <td className="p-3 text-center font-semibold">
                      {formatDate(g.deliveryDate)}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusColor(
                          g.status
                        )}`}
                      >
                        {g.status}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap ${
                          g.isExited
                            ? "bg-green-100 text-green-800"
                            : g.exitedCount > 0
                              ? "bg-amber-100 text-amber-800"
                              : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {g.isExited
                          ? "خروج خورده"
                          : g.exitedCount > 0
                            ? `خروج ${g.exitedCount} از ${g.itemCount}`
                            : "خروج نخورده"}
                      </span>
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
