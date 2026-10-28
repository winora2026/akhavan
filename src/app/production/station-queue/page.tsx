"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import Link from "next/link"

type Station = {
  id: string
  name: string
  sortOrder: number
}

type QueueItem = {
  id: string
  sequence: number
  status: string
  quantityIn: number | null
  quantityOut?: number | null
  completedAt?: string | null
  canUndo?: boolean
  station: { id: string; name: string }
  productionItem: {
    id: string
    productName: string
    length: number | null
    width: number | null
    quantity: number
    meterage: number | null
    status: string
    barcode?: string | null
    notes?: string | null
    servicesText?: string
    /** روند کاری قطعه: همه‌ی ایستگاه‌های مسیر به‌ترتیب */
    route?: {
      id: string
      name: string
      sequence: number
      status: string
      quantityIn: number | null
      quantityOut: number | null
      completedAt: string | null
      operatorId: string | null
    }[]
    installationCode?: string | null
    mapImageUrl?: string | null
    orderDate?: string | null
    deliveryDate?: string | null
    productionOrder: {
      id: string
      productionNumber?: string
      priority: string
      /** تعداد قلم‌های رد شده‌ی این سفارش در همین ایستگاه */
      stationDoneItems?: number
      order: {
        orderNumber?: string
        customer: { name: string }
      }
    }
  }
}

/** یک سفارش (چند قلم) در کارتابل یک ایستگاه */
type OrderGroup = {
  key: string
  orderNumber: string
  customerName: string
  priority: string
  orderDate: string | null
  deliveryDate: string | null
  productSummary: string
  servicesSummary: string[]
  itemCount: number
  totalQty: number
  totalMeterage: number
  /** قلم‌های رد شده‌ی همین سفارش در این ایستگاه */
  doneItems: number
  /** قلم باقی‌مانده + قلم رد شده */
  totalItems: number
  rows: QueueItem[]
}

type SortState = { key: string; dir: "asc" | "desc" } | null

/** مقایسه‌ی عدد/متن برای سورت ستون‌ها (متن فارسی با ترتیب عددی) */
function compareValues(a: string | number, b: string | number, dir: "asc" | "desc") {
  let c = 0
  if (typeof a === "number" && typeof b === "number") c = a - b
  else c = String(a).localeCompare(String(b), "fa", { numeric: true })
  return dir === "asc" ? c : -c
}

type Summary = {
  stationName: string
  count: number
  totalQuantity: number
  totalMeterage: number
}

type SessionUser = {
  displayName?: string
  role?: string
  stationName?: string | null
}

type ReadyItem = {
  productionItemId: string
  barcode?: string | null
  productName: string
  length: number | null
  width: number | null
  quantity: number
  meterage: number | null
  orderId?: string | null
  orderNumber?: string | null
  customerId?: string | null
  customerName: string
  customerPhone?: string | null
  installationCode?: string | null
  servicesText?: string | null
  notes?: string | null
}

type ExitSlip = {
  id: string
  exitNumber: string
  customerName: string
  customerPhone?: string | null
  exitDate: string
  driverName?: string | null
  driverNationalId?: string | null
  driverPhone?: string | null
  vehicleName?: string | null
  plateNumber?: string | null
  printCount: number
  notes?: string | null
  status: string
  items: {
    id: string
    productionItemId: string
    orderNumber?: string | null
    productName: string
    length: number | null
    width: number | null
    quantity: number
    meterage: number | null
    installationCode?: string | null
    servicesText?: string | null
    notes?: string | null
    barcode?: string | null
    loadedAt?: string | null
  }[]
}

function norm(s: string) {
  return (s || "")
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

/**
 * بارکد دریافتی از اسکنر را تمیز می‌کند: ارقام فارسی/عربی (وقتی زبان کیبورد ویندوز FA است)
 * به لاتین تبدیل می‌شوند و کاراکترهای نامرئی/خط جدید حذف می‌شوند.
 */
function cleanBarcode(s: string) {
  return (s || "")
    .replace(/[\u200b\u200c\u200d\u200e\u200f\ufeff]/g, "")
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\r\n\t]/g, "")
    .trim()
}

// حداکثر زمان انتظار برای پاسخ سرور هنگام اسکن؛ بعد از آن فرم آزاد می‌شود تا قفل نماند
const SCAN_TIMEOUT_MS = 20000

/** هر خدمت در یک خط */
function servicesLines(text?: string | null): string[] {
  return (text || "")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** تطبیق نام ایستگاه یوزر با لیست (برای قفل کشویی) */
function stationMatches(userStation: string, stationName: string) {
  const a = norm(userStation)
  const b = norm(stationName)
  if (!a || !b) return false
  if (a === b) return true
  // بدون فاصله/نیم‌فاصله و بدون «کالا / کالای / محصول»: «انبار نیمه ساخته» = «انبار کالای نیمه‌ساخته»
  const squash = (s: string) =>
    s.replace(/[\s\u200c]+/g, "").replace(/کالای|کالا|محصول/g, "")
  const sa = squash(a)
  const sb = squash(b)
  if (sa && sa === sb) return true
  // دو انبار: نیمه‌ساخته (انبار محصول یک) و آماده تحویل (انبار محصول دو)
  const kind = (s: string) =>
    s.includes("بارگیری")
      ? "load"
      : s.includes("نیمه") || s.includes("محصول یک") || s.includes("محصول 1")
        ? "semi"
        : s.includes("آماده") || s.includes("محصول دو") || s.includes("محصول 2")
          ? "ready"
          : ""
  const ka = kind(a)
  if (ka && ka === kind(b)) return true
  // مثلاً «تراش» با «تراش ۱»
  if (a.length >= 3 && b.includes(a)) return true
  if (b.length >= 3 && a.includes(b)) return true
  return false
}

/** فقط متن مربوط به آرم استاندارد از خدمات/توضیحات */
function extractArmNote(servicesText?: string | null, notes?: string | null) {
  const blob = `${servicesText || ""} ${notes || ""}`
  const out: string[] = []
  if (/بدون\s*آرم\s*استاندارد/.test(blob)) out.push("بدون آرم استاندارد")
  else if (/با\s*آرم\s*استاندارد/.test(blob) || /آرم\s*استاندارد/.test(blob))
    out.push("با آرم استاندارد")
  return out.join(" — ")
}

export default function StationQueuePage() {
  const [stations, setStations] = useState<Station[]>([])
  const [selectedStationId, setSelectedStationId] = useState("")
  const [stationLocked, setStationLocked] = useState(false)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [undoable, setUndoable] = useState<QueueItem[]>([])
  const [showUndoList, setShowUndoList] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [operatorName, setOperatorName] = useState("")
  const [productFilter, setProductFilter] = useState("")
  const [search, setSearch] = useState("")
  const [filtersFrozen, setFiltersFrozen] = useState(false)

  // سورت ستون‌ها (کلیک روی عنوان ستون: صعودی ← نزولی ← بدون سورت)
  const [orderSort, setOrderSort] = useState<SortState>(null)
  const [itemSort, setItemSort] = useState<SortState>(null)
  // انتخاب چند قلم برای رد گروهی داخل یک سفارش
  const [checkedIds, setCheckedIds] = useState<string[]>([])
  const [batchBusy, setBatchBusy] = useState(false)
  // پنجره‌ی روند کاری یک قطعه (برای انبارها)
  const [routeItem, setRouteItem] = useState<QueueItem | null>(null)

  // سفارشی که واردش شده‌ایم (null = لیست سفارش‌ها) و ردیف انتخاب‌شده داخل سفارش
  const [openOrderKey, setOpenOrderKey] = useState<string | null>(null)
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)

  const [barcode, setBarcode] = useState("")
  // آخرین بارکدی که صفحه از اسکنر گرفته (برای عیب‌یابی: می‌بینید اسکنر دقیقاً چه چیزی فرستاده)
  const [lastScanned, setLastScanned] = useState("")
  const [scanLoading, setScanLoading] = useState(false)
  const [lastResult, setLastResult] = useState<{
    type: "ok" | "err"
    text: string
  } | null>(null)

  const [confirmData, setConfirmData] = useState<any | null>(null)
  const [partialQty, setPartialQty] = useState("")
  const [detail, setDetail] = useState<any | null>(null)
  /** preview = فقط نمایش (بدون رد) | done = بعد از رد واقعی */
  const [detailMode, setDetailMode] = useState<"preview" | "done">("done")
  const [mapPreviewUrl, setMapPreviewUrl] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  // وضعیت اسکن در حال انجام + اسکنی که وسط پردازش قبلی رسیده (گم نمی‌شود، بعداً اجرا می‌شود)
  const scanBusyRef = useRef(false)
  const pendingScanRef = useRef<string | null>(null)
  // آخرین نسخه‌ی doScan (برای شنونده‌ی سراسری کیبورد)
  const doScanRef = useRef<
    | ((
        confirmed?: boolean,
        quantityDone?: number | null,
        codeOverride?: string
      ) => Promise<void>)
    | null
  >(null)
  // بافر شنونده‌ی سراسری اسکنر (وقتی فوکوس روی هیچ فیلتی نیست)
  const scanBufRef = useRef("")
  const scanBufTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // تشخیص سرعتِ تایپ داخل فیلد فیلتر/جستجو (اسکنر خیلی سریع‌تر از دست تایپ می‌کند)
  const fastKeysRef = useRef({ last: 0, count: 0 })

  const [mainTab, setMainTab] = useState<"queue" | "exit">("queue")

  // خروج
  const [exitFilter, setExitFilter] = useState<"pending" | "done">("pending")
  const [customerQuery, setCustomerQuery] = useState("")
  const [lockedCustomer, setLockedCustomer] = useState<string | null>(null)
  const [readyItems, setReadyItems] = useState<ReadyItem[]>([])
  const [exitLoading, setExitLoading] = useState(false)
  const [selectedExitIds, setSelectedExitIds] = useState<string[]>([])
  const [showDriverModal, setShowDriverModal] = useState(false)
  const [savingExit, setSavingExit] = useState(false)
  const [currentSlip, setCurrentSlip] = useState<ExitSlip | null>(null)
  const [showPrint, setShowPrint] = useState(false)
  const [exitHistory, setExitHistory] = useState<ExitSlip[]>([])
  const [driverName, setDriverName] = useState("")
  const [driverNationalId, setDriverNationalId] = useState("")
  const [driverPhone, setDriverPhone] = useState("")
  const [vehicleName, setVehicleName] = useState("")
  const [plateNumber, setPlateNumber] = useState("")
  const [slipNotes, setSlipNotes] = useState("")

  const selectedStationName =
    stations.find((s) => s.id === selectedStationId)?.name || "—"
  const isLoadingStation = norm(selectedStationName).includes("بارگیری")
  const todayFa = new Date().toLocaleDateString("fa-IR")
  // حالت کارتابل: صفحه ثابت و فقط جدول اسکرول می‌شود (تب خروج مثل قبل)
  const queueMode = !(mainTab === "exit" && isLoadingStation)
  // دیدن روند کاری قطعه: برای انبار نیمه‌ساخته و انبار آماده تحویل
  const showRouteBtn =
    norm(selectedStationName).includes("نیمه") ||
    norm(selectedStationName).includes("آماده تحویل")
  /** «در انتظار» را کامل می‌نویسد: در انتظار برش / در انتظار تراش ۱ ... */
  const statusLabel = (s: string) =>
    s === "در انتظار"
      ? `در انتظار ${selectedStationName}`
      : s === "در حال انجام"
        ? `در حال انجام در ${selectedStationName}`
        : s

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch("/api/auth/me")
        if (!res.ok) {
          await fetchStations(null)
          return
        }
        const data = await res.json()
        const user: SessionUser | null = data.user || null
        if (user?.displayName) setOperatorName(user.displayName)
        await fetchStations(user)
      } catch (e) {
        console.error(e)
        await fetchStations(null)
      }
    })()
  }, [])

  useEffect(() => {
    setOpenOrderKey(null)
    setSelectedRowId(null)
    if (selectedStationId) fetchQueue()
    else {
      setQueue([])
      setUndoable([])
      setSummary(null)
    }
  }, [selectedStationId])

  useEffect(() => {
    setCheckedIds([])
  }, [openOrderKey, selectedStationId])

  useEffect(() => {
    if (!selectedStationId) return
    const t = setInterval(() => fetchQueue(true), 60_000)
    return () => clearInterval(t)
  }, [selectedStationId])

  useEffect(() => {
    if (!isLoadingStation) {
      setMainTab("queue")
      return
    }
    if (mainTab === "exit") {
      fetchExitReady()
      fetchExitHistory()
    }
  }, [isLoadingStation, mainTab])

  useEffect(() => {
    if (confirmData || detail || mapPreviewUrl || mainTab === "exit") return
    const t = setTimeout(() => inputRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [selectedStationId, scanLoading, confirmData, detail, mapPreviewUrl, mainTab])

  // ---- بازگشت مرحله‌به‌مرحله (Esc، دکمه‌ی بازگشت و دکمه‌ی back مرورگر) ----
  // لایه‌ها از بالا به پایین: چاپ ← راننده ← نقشه ← تأیید تعداد ← جزئیات ← سفارش باز
  // هر بار فقط یک لایه بسته می‌شود؛ از صفحه بیرون نمی‌رود تا همه‌ی لایه‌ها بسته شوند.
  const layerCount = [
    showPrint,
    showDriverModal,
    mapPreviewUrl,
    routeItem,
    confirmData,
    detail,
    openOrderKey,
  ].filter(Boolean).length
  const layerOpen = layerCount > 0

  const closeTopLayer = (): boolean => {
    if (showPrint) {
      setShowPrint(false)
      return true
    }
    if (showDriverModal) {
      setShowDriverModal(false)
      return true
    }
    if (mapPreviewUrl) {
      setMapPreviewUrl(null)
      return true
    }
    if (routeItem) {
      setRouteItem(null)
      return true
    }
    if (confirmData) {
      setConfirmData(null)
      setPartialQty("")
      setBarcode("")
      if (inputRef.current) inputRef.current.value = ""
      return true
    }
    if (detail) {
      setDetail(null)
      setDetailMode("done")
      return true
    }
    if (openOrderKey) {
      setOpenOrderKey(null)
      return true
    }
    return false
  }
  const closeTopRef = useRef(closeTopLayer)
  closeTopRef.current = closeTopLayer
  const layerCountRef = useRef(0)
  layerCountRef.current = layerCount
  const sentinelRef = useRef(false)
  const ignorePopRef = useRef(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      closeTopRef.current()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // وقتی لایه‌ای باز است یک ورودی به history اضافه می‌شود تا دکمه‌ی back مرورگر
  // به‌جای خروج از کارتابل، فقط همان لایه را ببندد
  useEffect(() => {
    if (layerOpen && !sentinelRef.current) {
      window.history.pushState({ kq: 1 }, "")
      sentinelRef.current = true
    } else if (!layerOpen && sentinelRef.current) {
      sentinelRef.current = false
      ignorePopRef.current = true
      window.history.back()
    }
  }, [layerOpen])

  useEffect(() => {
    const onPop = () => {
      if (ignorePopRef.current) {
        ignorePopRef.current = false
        return
      }
      if (layerCountRef.current === 0) {
        sentinelRef.current = false
        return
      }
      sentinelRef.current = false
      const remaining = layerCountRef.current - 1
      closeTopRef.current()
      if (remaining > 0) {
        window.history.pushState({ kq: 1 }, "")
        sentinelRef.current = true
      }
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  // شنونده‌ی سراسری اسکنر: وقتی فوکوس روی بدنه‌ی صفحه یا یک دکمه/ردیف جدول است
  // (مثلاً بعد از کلیک روی سفارش)، کاراکترهای پشت‌سرهمِ سریع جمع می‌شوند و با Enter اسکن می‌شوند.
  // داخل فیلدهای متنی خود همان فیلد مدیریت می‌کند (فیلد بارکد، فیلتر و جستجو).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mainTab === "exit") return
      if (confirmData || showDriverModal || showPrint || mapPreviewUrl) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return

      if (e.key === "Enter") {
        const code = cleanBarcode(scanBufRef.current)
        scanBufRef.current = ""
        if (code.length >= 4) {
          e.preventDefault()
          e.stopPropagation()
          if (detail) {
            setDetail(null)
            setDetailMode("done")
          }
          doScanRef.current?.(false, null, code)
        }
        return
      }
      if (e.key.length === 1) {
        scanBufRef.current += e.key
        if (scanBufTimerRef.current) clearTimeout(scanBufTimerRef.current)
        // فاصله‌ی بین کاراکترهای اسکنر چند میلی‌ثانیه است؛ تایپ دستی کندتر است و بافر را خالی می‌کند
        scanBufTimerRef.current = setTimeout(() => {
          scanBufRef.current = ""
        }, 120)
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [mainTab, confirmData, showDriverModal, showPrint, mapPreviewUrl, detail])

  const fetchStations = async (user: SessionUser | null) => {
    try {
      const res = await fetch("/api/production/stations")
      if (!res.ok) return
      const data = await res.json()
      const list: Station[] = (Array.isArray(data) ? data : []).sort(
        (a: Station, b: Station) => a.sortOrder - b.sortOrder
      )
      setStations(list)

      const userStation = (user?.stationName || "").trim()
      if (userStation && list.length > 0) {
        const match = list.find((s) => stationMatches(userStation, s.name))
        if (match) {
          setSelectedStationId(match.id)
          setStationLocked(true)
          return
        }
      }

      // ادمین / فروش بدون ایستگاه → کشویی آزاد
      setStationLocked(false)
      if (list.length > 0) {
        const cut = list.find((s) => norm(s.name) === "برش")
        setSelectedStationId(cut?.id || list[0].id)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const fetchQueue = async (silent = false) => {
    if (!selectedStationId) return
    try {
      if (!silent) setLoading(true)
      const res = await fetch(
        `/api/production/station-queue?stationId=${selectedStationId}`
      )
      if (!res.ok) throw new Error("خطا")
      const data = await res.json()
      setQueue(
        Array.isArray(data.items)
          ? data.items
          : Array.isArray(data)
            ? data
            : []
      )
      setUndoable(Array.isArray(data.undoable) ? data.undoable : [])
      setSummary(data.summary || null)
    } catch (e) {
      console.error(e)
      if (!silent) alert("خطا در بارگذاری کارتابل")
    } finally {
      if (!silent) setLoading(false)
    }
  }

  // ----- خروج -----
  const exitedItemIds = useMemo(() => {
    const set = new Set<string>()
    for (const slip of exitHistory) {
      for (const it of slip.items || []) {
        if (it.productionItemId) set.add(it.productionItemId)
      }
    }
    return set
  }, [exitHistory])

  const fetchExitReady = async (customer?: string) => {
    try {
      setExitLoading(true)
      const q = customer ? `?customer=${encodeURIComponent(customer)}` : ""
      const res = await fetch(`/api/production/exit-slips/ready${q}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا")
      setReadyItems(data.items || [])
    } catch (e: any) {
      console.error(e)
      alert(e.message || "خطا در بارگذاری اقلام خروج")
    } finally {
      setExitLoading(false)
    }
  }

  const fetchExitHistory = async () => {
    try {
      const res = await fetch("/api/production/exit-slips")
      const data = await res.json()
      if (res.ok) setExitHistory(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
    }
  }

  const pendingReadyItems = useMemo(
    () => readyItems.filter((i) => !exitedItemIds.has(i.productionItemId)),
    [readyItems, exitedItemIds]
  )

  const filteredCustomers = useMemo(() => {
    const q = norm(customerQuery)
    const source =
      exitFilter === "pending"
        ? Array.from(
            new Map(
              pendingReadyItems.map((i) => [
                i.customerName,
                { name: i.customerName, phone: i.customerPhone },
              ])
            ).values()
          )
        : Array.from(
            new Map(
              exitHistory.map((h) => [
                h.customerName,
                { name: h.customerName, phone: h.customerPhone },
              ])
            ).values()
          )
    if (!q) return source.slice(0, 25)
    return source.filter((c) => norm(c.name).includes(q)).slice(0, 25)
  }, [customerQuery, exitFilter, pendingReadyItems, exitHistory])

  const displayPendingItems = useMemo(() => {
    if (!lockedCustomer) return []
    return pendingReadyItems.filter((i) => i.customerName === lockedCustomer)
  }, [pendingReadyItems, lockedCustomer])

  const displayDoneSlips = useMemo(() => {
    if (!lockedCustomer) return exitFilter === "done" ? exitHistory : []
    return exitHistory.filter((h) => h.customerName === lockedCustomer)
  }, [exitHistory, lockedCustomer, exitFilter])

  /** همه اقلام خروج‌خورده همان مشتری (از همه برگه‌ها) */
  const doneItemsForCustomer = useMemo(() => {
    if (!lockedCustomer) return []
    const rows: {
      slipNumber: string
      exitDate: string
      productName: string
      orderNumber?: string | null
      quantity: number
      meterage: number | null
      barcode?: string | null
    }[] = []
    for (const h of exitHistory.filter((x) => x.customerName === lockedCustomer)) {
      for (const it of h.items || []) {
        rows.push({
          slipNumber: h.exitNumber,
          exitDate: h.exitDate,
          productName: it.productName,
          orderNumber: it.orderNumber,
          quantity: it.quantity,
          meterage: it.meterage,
          barcode: it.barcode,
        })
      }
    }
    return rows
  }, [exitHistory, lockedCustomer])

  const lockCustomer = async (name: string) => {
    setLockedCustomer(name)
    setCustomerQuery(name)
    setSelectedExitIds([])
    setCurrentSlip(null)
    setShowPrint(false)
    if (exitFilter === "pending") await fetchExitReady(name)
    await fetchExitHistory()
  }

  const unlockCustomer = async () => {
    setLockedCustomer(null)
    setCustomerQuery("")
    setSelectedExitIds([])
    setCurrentSlip(null)
    setShowPrint(false)
    await fetchExitReady()
  }

  const createSlip = async () => {
    if (!lockedCustomer || selectedExitIds.length === 0) return
    try {
      setSavingExit(true)
      const sample = displayPendingItems.find((i) =>
        selectedExitIds.includes(i.productionItemId)
      )
      const res = await fetch("/api/production/exit-slips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: lockedCustomer,
          customerId: sample?.customerId,
          customerPhone: sample?.customerPhone,
          productionItemIds: selectedExitIds,
          driverName,
          driverNationalId,
          driverPhone,
          vehicleName,
          plateNumber,
          notes: slipNotes,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا")
      setCurrentSlip(data.slip)
      setShowDriverModal(false)
      setShowPrint(true)
      setSelectedExitIds([])
      await fetchExitReady(lockedCustomer)
      await fetchExitHistory()
    } catch (e: any) {
      alert(e.message || "خطا")
    } finally {
      setSavingExit(false)
    }
  }

  const markPrinted = async () => {
    if (!currentSlip) return
    try {
      const res = await fetch(`/api/production/exit-slips/${currentSlip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "print" }),
      })
      const data = await res.json()
      if (res.ok && data.slip) setCurrentSlip(data.slip)
      window.print()
    } catch {
      window.print()
    }
  }

  const exportExcelSlip = () => {
    if (!currentSlip) return
    const header = [
      "ردیف",
      "ش سفارش",
      "نام کالا",
      "طول",
      "عرض",
      "تعداد",
      "متراژ",
      "خدمات",
      "توضیحات",
    ]
    const rows = currentSlip.items.map((it, idx) => [
      idx + 1,
      it.orderNumber || "",
      it.productName,
      it.length ?? "",
      it.width ?? "",
      it.quantity,
      it.meterage ?? "",
      it.servicesText || "",
      extractArmNote(it.servicesText, it.notes) || it.notes || "",
    ])
    const totalQty = currentSlip.items.reduce((s, i) => s + (i.quantity || 0), 0)
    const totalM = currentSlip.items.reduce(
      (s, i) => s + (Number(i.meterage) || 0),
      0
    )
    rows.push(["", "", "جمع", "", "", totalQty, totalM.toFixed(4), "", ""])
    const csv =
      "\uFEFF" +
      [header, ...rows]
        .map((r) =>
          r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")
        )
        .join("\n")
    const a = document.createElement("a")
    a.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" })
    )
    a.download = `exit-${currentSlip.exitNumber}.csv`
    a.click()
  }

  const productNames = useMemo(
    () =>
      Array.from(new Set(queue.map((q) => q.productionItem.productName))).sort(),
    [queue]
  )

  const filtered = useMemo(() => {
    let result = queue
    if (productFilter.trim()) {
      const p = productFilter.trim().toLowerCase()
      result = result.filter((q) =>
        q.productionItem.productName.toLowerCase().includes(p)
      )
    }
    if (search.trim()) {
      const s = search.trim().toLowerCase()
      result = result.filter(
        (q) =>
          q.productionItem.productionOrder.order?.orderNumber
            ?.toLowerCase()
            .includes(s) ||
          q.productionItem.productionOrder.order?.customer?.name
            ?.toLowerCase()
            .includes(s) ||
          q.productionItem.productName?.toLowerCase().includes(s) ||
          (q.productionItem.barcode || "").toLowerCase().includes(s)
      )
    }
    return result
  }, [queue, productFilter, search])

  /** گروه‌بندی بر اساس شماره سفارش: هر سفارش یک ردیف؛ با کلیک وارد اقلامش می‌شویم */
  const orderGroups = useMemo<OrderGroup[]>(() => {
    const map = new Map<
      string,
      {
        key: string
        orderNumber: string
        customerName: string
        priority: string
        orderDate: string | null
        deliveryDate: string | null
        products: Set<string>
        services: Set<string>
        itemCount: number
        totalQty: number
        totalMeterage: number
        doneItems: number
        rows: QueueItem[]
      }
    >()
    for (const row of filtered) {
      const pi = row.productionItem
      const orderNumber = pi.productionOrder.order?.orderNumber || "—"
      let g = map.get(orderNumber)
      if (!g) {
        g = {
          key: orderNumber,
          orderNumber,
          customerName: pi.productionOrder.order?.customer?.name || "—",
          priority: pi.productionOrder.priority || "عادی",
          orderDate: pi.orderDate ?? null,
          deliveryDate: pi.deliveryDate ?? null,
          products: new Set<string>(),
          services: new Set<string>(),
          itemCount: 0,
          totalQty: 0,
          totalMeterage: 0,
          doneItems: pi.productionOrder.stationDoneItems ?? 0,
          rows: [],
        }
        map.set(orderNumber, g)
      }
      g.rows.push(row)
      g.itemCount += 1
      g.totalQty += row.quantityIn ?? pi.quantity ?? 0
      g.totalMeterage += Number(pi.meterage) || 0
      g.products.add(pi.productName)
      for (const s of servicesLines(pi.servicesText)) g.services.add(s)
    }
    return Array.from(map.values()).map((g) => {
      const names = Array.from(g.products)
      return {
        key: g.key,
        orderNumber: g.orderNumber,
        customerName: g.customerName,
        priority: g.priority,
        orderDate: g.orderDate,
        deliveryDate: g.deliveryDate,
        productSummary:
          names.length > 1
            ? `${names[0]} (+${names.length - 1})`
            : names[0] || "—",
        servicesSummary: Array.from(g.services),
        itemCount: g.itemCount,
        totalQty: g.totalQty,
        totalMeterage: g.totalMeterage,
        doneItems: g.doneItems,
        totalItems: g.rows.length + g.doneItems,
        rows: g.rows,
      }
    })
  }, [filtered])

  const openGroup: OrderGroup | null = openOrderKey
    ? orderGroups.find((g) => g.key === openOrderKey) || null
    : null

  const sortedGroups = useMemo(() => {
    if (!orderSort) return orderGroups
    const ts = (d: string | null) => (d ? new Date(d).getTime() || 0 : 0)
    const val = (g: OrderGroup): string | number => {
      switch (orderSort.key) {
        case "orderNumber":
          return g.orderNumber
        case "customerName":
          return g.customerName
        case "productSummary":
          return g.productSummary
        case "priority":
          return g.priority
        case "itemCount":
          return g.itemCount
        case "totalQty":
          return g.totalQty
        case "totalMeterage":
          return g.totalMeterage
        case "orderDate":
          return ts(g.orderDate)
        case "deliveryDate":
          return ts(g.deliveryDate)
        case "services":
          return g.servicesSummary.join(" ")
        default:
          return ""
      }
    }
    return [...orderGroups].sort((a, b) =>
      compareValues(val(a), val(b), orderSort.dir)
    )
  }, [orderGroups, orderSort])

  const sortedRows = useMemo(() => {
    const rows = openGroup?.rows || []
    if (!itemSort) return rows
    const val = (r: QueueItem): string | number => {
      const p = r.productionItem
      switch (itemSort.key) {
        case "productName":
          return p.productName || ""
        case "barcode":
          return p.barcode || ""
        case "length":
          return Number(p.length) || 0
        case "width":
          return Number(p.width) || 0
        case "quantity":
          return r.quantityIn ?? p.quantity ?? 0
        case "quantityOut":
          return r.quantityOut ?? 0
        case "meterage":
          return Number(p.meterage) || 0
        case "services":
          return p.servicesText || ""
        case "notes":
          return p.notes || ""
        case "status":
          return r.status || ""
        default:
          return ""
      }
    }
    return [...rows].sort((a, b) => compareValues(val(a), val(b), itemSort.dir))
  }, [openGroup, itemSort])

  const toggleSortState = (
    setter: (s: SortState) => void,
    cur: SortState,
    key: string
  ) => {
    if (!cur || cur.key !== key) setter({ key, dir: "asc" })
    else if (cur.dir === "asc") setter({ key, dir: "desc" })
    else setter(null)
  }

  const sortMark = (cur: SortState, key: string) =>
    !cur || cur.key !== key ? " ↕" : cur.dir === "asc" ? " ↑" : " ↓"

  // th های sticky پس‌زمینه‌ی مات می‌خواهند تا ردیف‌ها زیرشان دیده نشوند
  const thS =
    "sticky top-0 z-10 bg-teal-100 border border-gray-400 p-2 shadow-[0_1px_0_0_rgba(20,184,166,0.5)]"
  const sortTh = (
    label: string,
    key: string,
    cur: SortState,
    setter: (s: SortState) => void
  ) => (
    <th
      className={`${thS} cursor-pointer select-none hover:bg-teal-200`}
      onClick={() => toggleSortState(setter, cur, key)}
      title="کلیک = مرتب‌سازی"
    >
      {label}
      {sortMark(cur, key)}
    </th>
  )

  const checkedRows = sortedRows.filter((r) => checkedIds.includes(r.id))
  const allChecked =
    sortedRows.length > 0 && sortedRows.every((r) => checkedIds.includes(r.id))
  const toggleChecked = (id: string) =>
    setCheckedIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const toggleAllChecked = () =>
    setCheckedIds(allChecked ? [] : sortedRows.map((r) => r.id))

  /** گزارش هدر کارتابل: جمع‌ها بر اساس همان چیزی که با فیلترها نمایش داده می‌شود */
  const totals = useMemo(() => {
    let qty = 0
    let meterage = 0
    for (const r of filtered) {
      qty += r.quantityIn ?? r.productionItem.quantity ?? 0
      meterage += Number(r.productionItem.meterage) || 0
    }
    const totalItems = orderGroups.reduce((s, g) => s + g.totalItems, 0)
    return {
      orders: orderGroups.length,
      items: filtered.length,
      totalItems,
      qty,
      meterage,
    }
  }, [filtered, orderGroups])

  const filterActive = productFilter.trim() !== "" || search.trim() !== ""

  // رد شده‌های قابل برگشت (با همان فیلترهای بالا)
  const filteredUndoable = useMemo(() => {
    const p = productFilter.trim().toLowerCase()
    const s = search.trim().toLowerCase()
    return undoable.filter((q) => {
      const it = q.productionItem
      if (p && !it.productName.toLowerCase().includes(p)) return false
      if (s) {
        const hit =
          it.productionOrder.order?.orderNumber?.toLowerCase().includes(s) ||
          it.productionOrder.order?.customer?.name?.toLowerCase().includes(s) ||
          it.productName?.toLowerCase().includes(s) ||
          (it.barcode || "").toLowerCase().includes(s)
        if (!hit) return false
      }
      return true
    })
  }, [undoable, productFilter, search])

  const exportStationExcel = () => {
    if (!filtered.length) {
      alert("ردیفی برای خروجی نیست")
      return
    }
    // فرمت برون‌سپاری خط‌کشی‌شده: ردیف | کالا | ابعاد | مشتری | توضیحات (فقط آرم)
    const title = `لیست ${selectedStationName}`
    const header = ["ردیف", "کالا", "ابعاد", "مشتری", "توضیحات"]
    const data = filtered.map((row, idx) => {
      const it = row.productionItem
      const qty = row.quantityIn ?? it.quantity ?? 0
      const len = it.length ?? ""
      const wid = it.width ?? ""
      const dim =
        len !== "" && wid !== "" ? `${len}*${wid}=${qty}` : String(qty)
      const arm = extractArmNote(it.servicesText, it.notes)
      return [
        idx + 1,
        it.productName,
        dim,
        it.productionOrder.order?.customer?.name || "",
        arm,
      ]
    })
    const sumQty = filtered.reduce(
      (s, r) => s + (r.quantityIn ?? r.productionItem.quantity ?? 0),
      0
    )
    data.push(["", `جمع کل ${sumQty} عدد`, "", "", ""])
    const csv =
      "\uFEFF" +
      [[title, "", "", "", ""], header, ...data]
        .map((r) =>
          r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")
        )
        .join("\n")
    const a = document.createElement("a")
    a.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" })
    )
    a.download = `kartabl-${selectedStationName}-${Date.now()}.csv`
    a.click()
  }

  const formatFaDate = (dateStr?: string | null) => {
    if (!dateStr) return "—"
    try {
      return new Date(dateStr).toLocaleDateString("fa-IR")
    } catch {
      return "—"
    }
  }

  const doScan = async (
    confirmed = false,
    quantityDone?: number | null,
    codeOverride?: string
  ) => {
    const code = cleanBarcode(codeOverride ?? inputRef.current?.value ?? barcode)
    if (!code) {
      setLastResult({ type: "err", text: "بارکد را وارد یا اسکن کنید" })
      return
    }
    if (!selectedStationId) {
      setLastResult({ type: "err", text: "ایستگاه را انتخاب کنید" })
      return
    }

    // اسکن جدید وسط پردازش قبلی: گم نمی‌شود، بعد از پایان قبلی اجرا می‌شود
    if (scanBusyRef.current) {
      if (!confirmed) pendingScanRef.current = code
      return
    }
    scanBusyRef.current = true

    setLastScanned(code)
    setBarcode(code)

    // اگر مودال تأیید تعداد باز شد و اسکن جدیدی در صف بود، بعد از پایان اجرا نشود
    let holdPending = false
    let timer: ReturnType<typeof setTimeout> | null = null

    try {
      setScanLoading(true)
      setLastResult(null)
      const body: Record<string, unknown> = {
        barcode: code,
        stationId: selectedStationId,
        operatorName: operatorName || undefined,
        confirmed,
      }
      if (quantityDone != null && quantityDone > 0) body.quantityDone = quantityDone

      // بدون محدودیت زمانی، اگر سرور جواب ندهد فرم برای همیشه «در حال ثبت» می‌ماند
      const controller = new AbortController()
      timer = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS)

      const res = await fetch("/api/production/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      const data = await res.json()

      if (data.needsConfirmation) {
        holdPending = true
        setConfirmData(data)
        setPartialQty(String(data.quantity || ""))
        return
      }
      if (!res.ok) {
        setLastResult({ type: "err", text: data.error || "خطا در اسکن" })
        setBarcode("")
        if (inputRef.current) inputRef.current.value = ""
        return
      }
      // رد انجام شد — پنجره‌ی اطلاع‌رسانی
      setDetailMode("done")
      setDetail(data)
      setLastResult({ type: "ok", text: data.message || "رد شد" })
      setBarcode("")
      if (inputRef.current) inputRef.current.value = ""
      setConfirmData(null)
      setPartialQty("")
      await fetchQueue(true)
    } catch (e: any) {
      console.error(e)
      setLastResult({
        type: "err",
        text:
          e?.name === "AbortError"
            ? "پاسخی از سرور نرسید؛ دوباره اسکن کنید"
            : "خطا در ارتباط با سرور",
      })
    } finally {
      if (timer) clearTimeout(timer)
      scanBusyRef.current = false
      setScanLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)

      const next = pendingScanRef.current
      pendingScanRef.current = null
      if (next && !holdPending && next !== code) {
        setTimeout(() => doScanRef.current?.(false, null, next), 80)
      }
    }
  }
  doScanRef.current = doScan

  const confirmAll = () => {
    if (!confirmData) return
    doScan(
      true,
      Number(confirmData.quantity) || undefined,
      String(confirmData.barcode || barcode || "")
    )
  }

  const confirmPartial = () => {
    if (!confirmData) return
    const max = Number(confirmData.quantity) || 0
    const n = parseInt(partialQty, 10)
    if (!n || n < 1 || n > max) {
      alert(`تعداد بین ۱ و ${max}`)
      return
    }
    doScan(true, n, String(confirmData.barcode || barcode || ""))
  }

  /**
   * «نمایش»: فقط جزئیات قلم را نشان می‌دهد و هیچ درخواستی به سرور نمی‌فرستد، پس هرگز چیزی رد نمی‌شود.
   * (نسخه‌ی قبلی action:"preview" می‌فرستاد که route اسکن آن را نمی‌شناسد و قطعه را واقعاً رد می‌کرد!)
   */
  const openPreviewFromRow = (row: QueueItem) => {
    const pi = row.productionItem
    setSelectedRowId(row.id)
    setDetailMode("preview")
    setDetail({
      barcode: pi.barcode || "",
      productName: pi.productName,
      orderNumber: pi.productionOrder.order?.orderNumber,
      customerName: pi.productionOrder.order?.customer?.name,
      stationName: selectedStationName,
      quantity: row.quantityIn ?? pi.quantity,
      length: pi.length,
      width: pi.width,
      meterage: pi.meterage,
      notes: pi.notes,
      servicesText: pi.servicesText,
      installationCode: pi.installationCode,
      mapImageUrl: pi.mapImageUrl,
      orderDate: pi.orderDate,
      deliveryDate: pi.deliveryDate,
      priority: pi.productionOrder.priority,
    })
  }

  /** رد واقعی از روی پنجره‌ی نمایش */
  const passFromPreview = async () => {
    if (!detail?.barcode) return
    const code = cleanBarcode(String(detail.barcode))
    setDetail(null)
    setDetailMode("done")
    await doScan(false, null, code)
  }

  /** دبل‌کلیک یا دکمه‌ی «رد» روی قلم داخل سفارش = رد ایستگاه (مثل اسکن) */
  const completeByRow = (row: QueueItem) => {
    const code = cleanBarcode(row.productionItem.barcode || "")
    if (!code) {
      alert("این ردیف بارکد ندارد")
      return
    }
    setSelectedRowId(row.id)
    doScan(false, null, code)
  }

  /** رد گروهی: همه‌ی قلم‌های انتخاب‌شده (با کل تعداد باقی‌مانده‌شان) پشت‌سرهم رد می‌شوند */
  const passChecked = async () => {
    if (batchBusy || scanBusyRef.current) return
    const list = checkedRows.filter((r) => cleanBarcode(r.productionItem.barcode || ""))
    if (list.length === 0) {
      alert("قلم انتخاب‌شده‌ی دارای بارکد وجود ندارد")
      return
    }
    if (
      !confirm(
        `${list.length} قلم در ایستگاه «${selectedStationName}» رد شود؟`
      )
    )
      return

    scanBusyRef.current = true
    setBatchBusy(true)
    setScanLoading(true)
    setLastResult(null)
    let ok = 0
    const failed: string[] = []
    for (const row of list) {
      const code = cleanBarcode(row.productionItem.barcode || "")
      const qty = row.quantityIn ?? row.productionItem.quantity ?? 1
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS)
        const res = await fetch("/api/production/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            barcode: code,
            stationId: selectedStationId,
            operatorName: operatorName || undefined,
            confirmed: true,
            quantityDone: qty > 0 ? qty : undefined,
          }),
          signal: controller.signal,
        })
        clearTimeout(timer)
        const data = await res.json().catch(() => ({}))
        if (res.ok && !data.needsConfirmation) ok++
        else
          failed.push(
            `${row.productionItem.productName}: ${data.error || "خطا"}`
          )
      } catch {
        failed.push(`${row.productionItem.productName}: خطا در ارتباط`)
      }
    }
    scanBusyRef.current = false
    setBatchBusy(false)
    setScanLoading(false)
    setCheckedIds([])
    await fetchQueue(true)
    setLastResult(
      failed.length > 0
        ? {
            type: "err",
            text: `${ok} قلم رد شد؛ ${failed.length} قلم رد نشد — ${failed
              .slice(0, 3)
              .join(" | ")}`,
          }
        : { type: "ok", text: `${ok} قلم با هم رد شد` }
    )
    const next = pendingScanRef.current
    pendingScanRef.current = null
    if (next) setTimeout(() => doScanRef.current?.(false, null, next), 80)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const undoStation = async (row: QueueItem) => {
    if (!row.productionItem.barcode) {
      alert("این ردیف بارکد ندارد")
      return
    }
    if (
      !confirm(
        `آیا رد ایستگاه «${selectedStationName}» برای «${row.productionItem.productName}» برگردانده شود؟`
      )
    )
      return
    try {
      setScanLoading(true)
      const res = await fetch("/api/production/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "undo",
          barcode: row.productionItem.barcode,
          stationId: selectedStationId,
          operatorName: operatorName || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || "خطا در برگشت")
        return
      }
      setLastResult({ type: "ok", text: data.message || "برگشت انجام شد" })
      await fetchQueue(true)
    } catch (e) {
      console.error(e)
      alert("خطا در ارتباط با سرور")
    } finally {
      setScanLoading(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      doScan(false, null, (e.currentTarget.value || "").trim())
    }
  }

  /**
   * اسکنر وقتی فوکوس داخل فیلد فیلتر/جستجو باشد، بارکد را داخل همان فیلد تایپ می‌کند.
   * اگر آخرین کاراکترها با سرعتِ اسکنر (نه دست) وارد شده بودند، Enter به‌عنوان اسکن حساب می‌شود
   * و فیلد خالی می‌شود. تایپ دستیِ بارکد برای جستجو هیچ‌وقت چیزی را رد نمی‌کند.
   */
  const filterKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    clear: () => void
  ) => {
    if (e.key === "Enter") {
      const code = cleanBarcode(e.currentTarget.value)
      if (fastKeysRef.current.count >= 3 && code.length >= 4) {
        e.preventDefault()
        clear()
        doScan(false, null, code)
      }
      return
    }
    if (e.key.length !== 1) return
    const now = Date.now()
    const f = fastKeysRef.current
    f.count = now - f.last < 50 ? f.count + 1 : 0
    f.last = now
  }

  const printTotals = useMemo(() => {
    const list = currentSlip?.items || []
    return {
      qty: list.reduce((s, i) => s + (i.quantity || 0), 0),
      meterage: list.reduce((s, i) => s + (Number(i.meterage) || 0), 0),
    }
  }, [currentSlip])

  const detailMapUrl: string | null = detail
    ? detail.mapImageUrl ||
      (Array.isArray(detail.mapImages) ? detail.mapImages[0] : null) ||
      null
    : null

  const closeDetail = () => {
    // در حالت نمایش فقط پنجره بسته می‌شود و چیزی رد نمی‌شود
    setDetail(null)
    setDetailMode("done")
    setBarcode("")
    if (inputRef.current) inputRef.current.value = ""
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  return (
    <div
      className={`${
        queueMode ? "h-screen overflow-hidden" : "min-h-screen"
      } p-4 print:bg-white print:p-0 ${
        mainTab === "exit" && isLoadingStation
          ? "bg-white"
          : "bg-cover bg-center bg-fixed"
      }`}
      style={
        mainTab === "exit" && isLoadingStation
          ? { fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif" }
          : {
              backgroundImage:
                "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')",
              fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif",
            }
      }
      dir="rtl"
    >
      <div
        className={`relative z-10 max-w-[1600px] mx-auto print:hidden ${
          queueMode ? "h-full flex flex-col" : ""
        }`}
      >
        {/* هدر کارتابل ایستگاه: عنوان + گزارش (جمع تعداد و متراژ) + خروجی اکسل */}
        <div className="mb-2 shrink-0 rounded-2xl bg-white/95 shadow-md p-3 border border-teal-300">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-blue-950">
                کارتابل {stationLocked ? selectedStationName : "ایستگاه"}
              </h1>
              <p className="text-sm text-blue-800 mt-1">
                ایستگاه:{" "}
                <span className="font-bold text-teal-700">
                  {selectedStationName}
                </span>
                {stationLocked ? " (قفل — بر اساس ورود شما)" : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/production/cutting"
                className="rounded-xl border border-teal-500/40 bg-white px-4 py-2.5 shadow-sm font-bold text-blue-900"
              >
                برنامه‌ریزی برش
              </Link>
              <Link
                href="/production/queue"
                className="rounded-xl border border-teal-500/40 bg-white px-4 py-2.5 shadow-sm font-bold text-blue-900"
              >
                روند کاری
              </Link>
              <Link
                href="/"
                onClick={(e) => {
                  // اگر سفارش/پنجره‌ای باز است، فقط یک مرحله برمی‌گردد
                  if (layerCountRef.current > 0) {
                    e.preventDefault()
                    closeTopRef.current()
                  }
                }}
                className="rounded-xl border border-teal-500/40 bg-white px-4 py-2.5 shadow-sm font-bold text-blue-900"
              >
                {layerOpen ? "بازگشت (یک مرحله)" : "بازگشت"}
              </Link>
            </div>
          </div>

          {(!isLoadingStation || mainTab === "queue") && (
            <div className="mt-2 border-t border-teal-200 pt-2">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-black text-blue-950">
                  گزارش کارتابل {selectedStationName} — {todayFa}
                </h2>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={exportStationExcel}
                    className="rounded-xl border border-teal-600 bg-white px-4 py-2 text-sm font-bold text-teal-800 hover:bg-teal-50"
                  >
                    خروجی اکسل
                  </button>
                  <button
                    type="button"
                    onClick={() => fetchQueue()}
                    className="rounded-xl bg-teal-500 hover:bg-teal-600 px-4 py-2 text-sm font-bold text-white"
                  >
                    بروزرسانی
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-xl bg-teal-50 border border-teal-200 p-2 text-center">
                  <p className="text-sm text-blue-700">تعداد سفارش</p>
                  <p className="text-xl font-bold text-teal-700">
                    {totals.orders}
                  </p>
                </div>
                <div className="rounded-xl bg-teal-50 border border-teal-200 p-2 text-center">
                  <p className="text-sm text-blue-700">تعداد قلم (باقی‌مانده)</p>
                  <p className="text-xl font-bold text-teal-700">
                    {totals.items}
                    {totals.totalItems > totals.items && (
                      <span className="mr-1 text-sm font-semibold text-blue-700">
                        از {totals.totalItems}
                      </span>
                    )}
                  </p>
                </div>
                <div className="rounded-xl bg-teal-50 border border-teal-200 p-2 text-center">
                  <p className="text-sm text-blue-700">جمع تعداد</p>
                  <p className="text-xl font-bold text-teal-700">
                    {totals.qty}
                  </p>
                </div>
                <div className="rounded-xl bg-teal-50 border border-teal-200 p-2 text-center">
                  <p className="text-sm text-blue-700">جمع متراژ</p>
                  <p className="text-xl font-bold text-teal-700">
                    {totals.meterage.toFixed(4)}
                  </p>
                </div>
              </div>
              {filterActive && summary && (
                <p className="mt-2 text-xs text-blue-700">
                  فیلتر فعال است — کل صف این ایستگاه (بدون فیلتر): {summary.count}{" "}
                  قطعه | {summary.totalQuantity} عدد |{" "}
                  {Number(summary.totalMeterage).toFixed(3)} متر
                </p>
              )}
            </div>
          )}
        </div>

        {isLoadingStation && (
          <div className="mb-2 shrink-0 flex gap-2">
            <button
              type="button"
              onClick={() => setMainTab("queue")}
              className={`rounded-xl px-5 py-2.5 font-bold border ${
                mainTab === "queue"
                  ? "bg-teal-600 text-white border-teal-700"
                  : "bg-white text-blue-900 border-teal-300"
              }`}
            >
              کارتابل بارگیری
            </button>
            <button
              type="button"
              onClick={() => setMainTab("exit")}
              className={`rounded-xl px-5 py-2.5 font-bold border ${
                mainTab === "exit"
                  ? "bg-teal-600 text-white border-teal-700"
                  : "bg-white text-blue-900 border-teal-300"
              }`}
            >
              برگه خروج
            </button>
          </div>
        )}

        {(!isLoadingStation || mainTab === "queue") && (
          <>
            <div className="mb-2 shrink-0 rounded-2xl bg-white/95 shadow-md p-3 border border-teal-300">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-3">
                  <label className="mb-1.5 block text-sm font-bold text-blue-900">
                    ایستگاه
                  </label>
                  {stationLocked ? (
                    <div className="w-full rounded-xl border border-teal-500/40 bg-teal-50 px-4 py-3 text-sm font-bold text-teal-900">
                      {selectedStationName}
                    </div>
                  ) : (
                    <select
                      value={selectedStationId}
                      onChange={(e) => {
                        setSelectedStationId(e.target.value)
                        setDetail(null)
                        setMainTab("queue")
                      }}
                      className="w-full rounded-xl border border-teal-500/30 bg-white px-4 py-3 text-sm font-semibold"
                    >
                      {stations.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="md:col-span-5">
                  <label className="mb-1.5 block text-sm font-bold text-blue-900">
                    اسکن بارکد
                  </label>
                  {/* readOnly به‌جای disabled: با disabled شدن فیلد، فوکوس از دست می‌رفت و کاراکترهای اسکنر گم می‌شد */}
                  <input
                    ref={inputRef}
                    type="text"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    onKeyDown={onKeyDown}
                    className="w-full rounded-xl border-2 border-teal-500 bg-white px-4 py-3 text-lg font-bold"
                    autoComplete="off"
                    readOnly={scanLoading}
                  />
                  {lastScanned && (
                    <p className="mt-1 text-xs text-blue-700">
                      آخرین بارکد دریافتی:{" "}
                      <span className="font-mono font-bold" dir="ltr">
                        {lastScanned}
                      </span>
                    </p>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-sm font-bold text-blue-900">
                    اپراتور
                  </label>
                  <input
                    value={operatorName}
                    onChange={(e) => setOperatorName(e.target.value)}
                    className="w-full rounded-xl border border-teal-500/30 bg-white px-4 py-3 text-sm font-semibold"
                  />
                </div>
                <div className="md:col-span-2">
                  <button
                    onClick={() =>
                      doScan(false, null, inputRef.current?.value || barcode)
                    }
                    disabled={scanLoading}
                    className="w-full rounded-xl bg-green-600 text-white px-4 py-3 font-bold text-lg disabled:opacity-50"
                  >
                    {scanLoading ? "..." : "ثبت"}
                  </button>
                </div>
              </div>
              {lastResult?.type === "err" && (
                <div className="mt-3 rounded-xl bg-red-100 border border-red-300 px-4 py-3 font-bold text-red-800 text-sm">
                  {lastResult.text}
                </div>
              )}
              {lastResult?.type === "ok" && (
                <div className="mt-3 rounded-xl bg-green-100 border border-green-300 px-4 py-3 font-bold text-green-800 text-sm">
                  {lastResult.text}
                </div>
              )}
            </div>

            <div className="mb-2 shrink-0 rounded-2xl bg-white/95 shadow-md p-3 border border-teal-300">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-4">
                  <input
                    list="pl"
                    value={productFilter}
                    onChange={(e) => {
                      if (!filtersFrozen) setProductFilter(e.target.value)
                    }}
                    onKeyDown={(e) => filterKeyDown(e, () => setProductFilter(""))}
                    disabled={filtersFrozen}
                    placeholder="فیلتر کالا"
                    className="w-full rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:bg-amber-50"
                  />
                  <datalist id="pl">
                    {productNames.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                </div>
                <div className="md:col-span-4">
                  <input
                    value={search}
                    onChange={(e) => {
                      if (!filtersFrozen) setSearch(e.target.value)
                    }}
                    onKeyDown={(e) => filterKeyDown(e, () => setSearch(""))}
                    disabled={filtersFrozen}
                    placeholder="مشتری / سفارش / بارکد"
                    className="w-full rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:bg-amber-50"
                  />
                </div>
                <div className="md:col-span-2">
                  <button
                    type="button"
                    onClick={() => setFiltersFrozen((v) => !v)}
                    className={`w-full rounded-xl px-3 py-2.5 text-sm font-bold border ${
                      filtersFrozen
                        ? "bg-amber-500 text-white border-amber-600"
                        : "bg-white text-blue-900 border-teal-300"
                    }`}
                  >
                    {filtersFrozen ? "فیلتر قفل" : "قفل فیلتر"}
                  </button>
                </div>
                <div className="md:col-span-2 text-center font-bold py-2 text-sm">
                  {orderGroups.length} سفارش / {filtered.length} قلم
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden rounded-2xl bg-white shadow-md p-4 border border-teal-300">
              {loading ? (
                <p className="text-center py-16 font-bold">بارگذاری...</p>
              ) : openOrderKey ? (
                /* ---------- داخل سفارش: لیست اقلام ---------- */
                openGroup ? (
                  <div className="h-full flex flex-col">
                    <div className="mb-2 shrink-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 p-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setOpenOrderKey(null)}
                          className="rounded-xl border border-teal-500 bg-white px-4 py-2 font-bold text-teal-800 hover:bg-teal-100"
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
                      <div className="flex flex-wrap gap-4 text-sm font-bold text-blue-900">
                        <span>اولویت: {openGroup.priority}</span>
                        <span>تاریخ سفارش: {formatFaDate(openGroup.orderDate)}</span>
                        <span>تاریخ تحویل: {formatFaDate(openGroup.deliveryDate)}</span>
                        <span>
                          {openGroup.itemCount} قلم باقی‌مانده
                          {openGroup.totalItems > openGroup.itemCount
                            ? ` از ${openGroup.totalItems}`
                            : ""}{" "}
                          | {openGroup.totalQty} عدد |{" "}
                          {openGroup.totalMeterage.toFixed(3)} متر
                        </span>
                      </div>
                    </div>
                    <div className="mb-2 shrink-0 flex flex-wrap items-center gap-3">
                      <p className="text-xs text-blue-700">
                        دبل‌کلیک روی قلم یا اسکن بارکد = رد ایستگاه | تیک چند قلم + «رد گروهی» = رد
                        همه‌ی انتخاب‌شده‌ها با هم | «نمایش» = جزئیات و نقشه بدون رد | Esc = یک مرحله
                        بازگشت
                      </p>
                      <button
                        type="button"
                        disabled={scanLoading || batchBusy || sortedRows.length === 0}
                        onClick={toggleAllChecked}
                        className="rounded-lg border border-teal-500 bg-white px-3 py-1.5 text-xs font-bold text-teal-800 hover:bg-teal-50 disabled:opacity-50"
                      >
                        {allChecked ? "لغو انتخاب همه" : "انتخاب همه"}
                      </button>
                      <button
                        type="button"
                        disabled={scanLoading || batchBusy || checkedRows.length === 0}
                        onClick={passChecked}
                        className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {batchBusy
                          ? "در حال رد..."
                          : `رد گروهی (${checkedRows.length} قلم)`}
                      </button>
                    </div>
                    <div className="flex-1 min-h-0 overflow-auto">
                    <table className="w-full border-collapse border border-gray-400 text-sm">
                      <thead>
                        <tr className="border border-gray-400 bg-teal-100">
                          <th className={thS}>
                            <input
                              type="checkbox"
                              checked={allChecked}
                              onChange={toggleAllChecked}
                              disabled={scanLoading || batchBusy}
                              className="h-4 w-4 cursor-pointer"
                              title="انتخاب همه"
                            />
                          </th>
                          <th className={thS}>ردیف</th>
                          {sortTh("کالا", "productName", itemSort, setItemSort)}
                          {sortTh("بارکد", "barcode", itemSort, setItemSort)}
                          {sortTh("طول", "length", itemSort, setItemSort)}
                          {sortTh("عرض", "width", itemSort, setItemSort)}
                          {sortTh("تعداد (باقی)", "quantity", itemSort, setItemSort)}
                          {sortTh("رد شده", "quantityOut", itemSort, setItemSort)}
                          {sortTh("متراژ", "meterage", itemSort, setItemSort)}
                          {sortTh("سختی کار", "services", itemSort, setItemSort)}
                          {sortTh("توضیحات", "notes", itemSort, setItemSort)}
                          {sortTh("وضعیت", "status", itemSort, setItemSort)}
                          <th className={thS}>عملیات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRows.map((row, index) => (
                          <tr
                            key={row.id}
                            className={`cursor-pointer border border-gray-400 ${
                              selectedRowId === row.id
                                ? "bg-yellow-100"
                                : checkedIds.includes(row.id)
                                  ? "bg-teal-50"
                                  : "bg-white hover:bg-orange-50"
                            }`}
                            title="دبل‌کلیک = رد ایستگاه"
                            onClick={() => setSelectedRowId(row.id)}
                            onDoubleClick={() => completeByRow(row)}
                          >
                            <td
                              className="border border-gray-400 p-2 text-center"
                              onClick={(e) => e.stopPropagation()}
                              onDoubleClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={checkedIds.includes(row.id)}
                                onChange={() => toggleChecked(row.id)}
                                disabled={scanLoading || batchBusy}
                                className="h-4 w-4 cursor-pointer"
                              />
                            </td>
                            <td className="border border-gray-400 p-2 text-center font-bold">
                              {index + 1}
                            </td>
                            <td className="border border-gray-400 p-2 font-bold">
                              {row.productionItem.productName}
                            </td>
                            <td className="border border-gray-400 p-2 text-center font-mono font-bold">
                              {row.productionItem.barcode || "—"}
                            </td>
                            <td className="border border-gray-400 p-2 text-center font-black">
                              {row.productionItem.length ?? "—"}
                            </td>
                            <td className="border border-gray-400 p-2 text-center font-black">
                              {row.productionItem.width ?? "—"}
                            </td>
                            <td className="border border-gray-400 p-2 text-center font-black">
                              {row.quantityIn ?? row.productionItem.quantity}
                            </td>
                            <td className="border border-gray-400 p-2 text-center">
                              {row.quantityOut ?? 0}
                            </td>
                            <td className="border border-gray-400 p-2 text-center">
                              {row.productionItem.meterage != null
                                ? Number(row.productionItem.meterage).toFixed(3)
                                : "—"}
                            </td>
                            <td className="border border-gray-400 p-2 font-bold">
                              {servicesLines(row.productionItem.servicesText).length >
                              0
                                ? servicesLines(row.productionItem.servicesText).map(
                                    (sv, i) => <div key={i}>{sv}</div>
                                  )
                                : "—"}
                            </td>
                            <td className="border border-gray-400 p-2 text-xs">
                              {row.productionItem.notes || "—"}
                            </td>
                            <td className="border border-gray-400 p-2 text-center">
                              <span className="whitespace-nowrap rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold">
                                {statusLabel(row.status)}
                              </span>
                            </td>
                            <td className="border border-gray-400 p-2 text-center">
                              <div className="flex flex-wrap justify-center gap-1">
                                {showRouteBtn && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setRouteItem(row)
                                    }}
                                    className="rounded-lg bg-purple-600 px-2 py-1 text-xs font-bold text-white hover:bg-purple-700"
                                    title="دیدن مسیر این قطعه در ایستگاه‌ها"
                                  >
                                    روند
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={scanLoading}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    openPreviewFromRow(row)
                                  }}
                                  className="rounded-lg bg-blue-600 px-2 py-1 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                  نمایش
                                </button>
                                <button
                                  type="button"
                                  disabled={scanLoading}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    completeByRow(row)
                                  }}
                                  className="rounded-lg bg-green-600 px-2 py-1 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50"
                                >
                                  رد
                                </button>
                                {row.canUndo && (row.quantityOut || 0) > 0 && (
                                  <button
                                    type="button"
                                    disabled={scanLoading}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      undoStation(row)
                                    }}
                                    className="rounded-lg bg-amber-500 px-2 py-1 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-50"
                                  >
                                    برگشت
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <p className="mb-4 text-lg font-bold text-teal-800">
                      همه‌ی اقلام سفارش {openOrderKey} در این ایستگاه رد شد (یا با فیلتر فعلی
                      نمایش داده نمی‌شود)
                    </p>
                    <button
                      type="button"
                      onClick={() => setOpenOrderKey(null)}
                      className="rounded-xl bg-teal-600 px-6 py-2.5 font-bold text-white hover:bg-teal-700"
                    >
                      → بازگشت به لیست سفارش‌ها
                    </button>
                  </div>
                )
              ) : orderGroups.length === 0 ? (
                <p className="text-center py-16 font-bold">صف خالی است</p>
              ) : (
                /* ---------- لیست سفارش‌ها (هر سفارش یک ردیف) ---------- */
                <div className="h-full flex flex-col">
                  <p className="mb-2 shrink-0 text-xs text-blue-700">
                    کلیک روی هر سفارش = ورود به اقلام همان سفارش، سپس دبل‌کلیک روی قلم یا اسکن بارکد برای رد
                  </p>
                  <div className="flex-1 min-h-0 overflow-auto">
                  <table className="w-full border-collapse border border-gray-400 text-sm">
                    <thead>
                      <tr className="border border-gray-400 bg-teal-100">
                        <th className={thS}>ردیف</th>
                        {sortTh("شماره سفارش", "orderNumber", orderSort, setOrderSort)}
                        {sortTh("نام مشتری", "customerName", orderSort, setOrderSort)}
                        {sortTh("نام کالا", "productSummary", orderSort, setOrderSort)}
                        {sortTh("اولویت", "priority", orderSort, setOrderSort)}
                        {sortTh("تعداد قلم", "itemCount", orderSort, setOrderSort)}
                        {sortTh("جمع تعداد", "totalQty", orderSort, setOrderSort)}
                        {sortTh("جمع متراژ", "totalMeterage", orderSort, setOrderSort)}
                        {sortTh("تاریخ سفارش", "orderDate", orderSort, setOrderSort)}
                        {sortTh("تاریخ تحویل", "deliveryDate", orderSort, setOrderSort)}
                        {sortTh("سختی کار", "services", orderSort, setOrderSort)}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedGroups.map((g, i) => (
                        <tr
                          key={g.key}
                          className="cursor-pointer border border-gray-400 bg-white hover:bg-yellow-100"
                          title="کلیک = ورود به سفارش"
                          onClick={() => {
                            setOpenOrderKey(g.key)
                            setSelectedRowId(null)
                          }}
                        >
                          <td className="border border-gray-400 p-2 text-center font-bold">
                            {i + 1}
                          </td>
                          <td className="border border-gray-400 p-2 text-center font-black text-teal-800">
                            {g.orderNumber}
                          </td>
                          <td className="border border-gray-400 p-2 font-bold">
                            {g.customerName}
                          </td>
                          <td className="border border-gray-400 p-2 font-bold">
                            {g.productSummary}
                          </td>
                          <td
                            className={`border border-gray-400 p-2 text-center ${
                              g.priority !== "عادی" ? "font-black text-red-700" : ""
                            }`}
                          >
                            {g.priority}
                          </td>
                          <td className="border border-gray-400 p-2 text-center font-bold">
                            {g.itemCount}
                            {g.totalItems > g.itemCount && (
                              <span className="mr-1 text-xs font-semibold text-blue-700">
                                از {g.totalItems}
                              </span>
                            )}
                          </td>
                          <td className="border border-gray-400 p-2 text-center font-black">
                            {g.totalQty}
                          </td>
                          <td className="border border-gray-400 p-2 text-center">
                            {g.totalMeterage.toFixed(3)}
                          </td>
                          <td className="border border-gray-400 p-2 text-center">
                            {formatFaDate(g.orderDate)}
                          </td>
                          <td className="border border-gray-400 p-2 text-center">
                            {formatFaDate(g.deliveryDate)}
                          </td>
                          <td className="border border-gray-400 p-2 text-xs font-bold">
                            {g.servicesSummary.length > 0
                              ? g.servicesSummary.slice(0, 3).map((sv, k) => (
                                  <div key={k}>{sv}</div>
                                ))
                              : "—"}
                            {g.servicesSummary.length > 3 && (
                              <div>… (+{g.servicesSummary.length - 3})</div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </div>

            {undoable.length > 0 && (
              <div className="mt-2 shrink-0 max-h-[35vh] overflow-auto rounded-2xl bg-white shadow-md p-4 border border-amber-300">
                <button
                  type="button"
                  onClick={() => setShowUndoList((v) => !v)}
                  className="w-full flex items-center justify-between gap-2 font-black text-blue-950"
                >
                  <span>
                    رد شده‌های اخیر این ایستگاه — قابل برگشت به کارتابل (
                    {filteredUndoable.length})
                  </span>
                  <span className="text-sm text-teal-700">
                    {showUndoList ? "بستن ▲" : "نمایش ▼"}
                  </span>
                </button>
                {showUndoList && (
                  <div className="mt-3 overflow-x-auto">
                    <p className="text-xs text-blue-700 mb-2">
                      فقط قطعه‌هایی نمایش داده می‌شوند که ایستگاه بعدی هنوز آن‌ها را رد نکرده است.
                    </p>
                    {filteredUndoable.length === 0 ? (
                      <p className="text-center py-6 font-bold">موردی نیست</p>
                    ) : (
                      <table className="w-full text-sm border-collapse border border-gray-400">
                        <thead>
                          <tr className="bg-amber-100">
                            <th className="p-2 border border-gray-400">ش سفارش</th>
                            <th className="p-2 border border-gray-400">مشتری</th>
                            <th className="p-2 border border-gray-400">کالا</th>
                            <th className="p-2 border border-gray-400">بارکد</th>
                            <th className="p-2 border border-gray-400">ابعاد</th>
                            <th className="p-2 border border-gray-400">تعداد</th>
                            <th className="p-2 border border-gray-400">زمان رد</th>
                            <th className="p-2 border border-gray-400">عملیات</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredUndoable.map((row) => (
                            <tr key={row.id} className="border border-gray-400 bg-white">
                              <td className="p-2 border border-gray-400 text-center font-bold text-teal-800">
                                {row.productionItem.productionOrder.order?.orderNumber || "—"}
                              </td>
                              <td className="p-2 border border-gray-400 font-bold">
                                {row.productionItem.productionOrder.order?.customer?.name || "—"}
                              </td>
                              <td className="p-2 border border-gray-400 font-bold">
                                {row.productionItem.productName}
                              </td>
                              <td className="p-2 border border-gray-400 text-center font-bold">
                                {row.productionItem.barcode || "—"}
                              </td>
                              <td className="p-2 border border-gray-400 text-center font-black">
                                {row.productionItem.length && row.productionItem.width
                                  ? `${row.productionItem.length}×${row.productionItem.width}`
                                  : "—"}
                              </td>
                              <td className="p-2 border border-gray-400 text-center font-black">
                                {row.quantityOut ?? row.productionItem.quantity}
                              </td>
                              <td className="p-2 border border-gray-400 text-center text-xs">
                                {row.completedAt
                                  ? new Date(row.completedAt).toLocaleString("fa-IR")
                                  : "—"}
                              </td>
                              <td className="p-2 border border-gray-400 text-center">
                                <button
                                  type="button"
                                  disabled={scanLoading}
                                  onClick={() => undoStation(row)}
                                  className="rounded-lg bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 text-xs font-bold disabled:opacity-50"
                                >
                                  برگشت به کارتابل
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* تب خروج */}
        {isLoadingStation && mainTab === "exit" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setExitFilter("pending")}
                className={`rounded-xl px-4 py-2 font-bold border ${
                  exitFilter === "pending"
                    ? "bg-orange-500 text-white"
                    : "bg-white border-orange-300"
                }`}
              >
                خروج‌نخورده
              </button>
              <button
                type="button"
                onClick={() => {
                  setExitFilter("done")
                  fetchExitHistory()
                }}
                className={`rounded-xl px-4 py-2 font-bold border ${
                  exitFilter === "done"
                    ? "bg-teal-600 text-white"
                    : "bg-white border-teal-300"
                }`}
              >
                خروج‌خورده (همه برگه‌ها)
              </button>
            </div>

            <div className="rounded-2xl border bg-white p-4 shadow">
              <label className="block text-sm font-bold mb-1">نام مشتری</label>
              <div className="flex flex-wrap gap-2">
                <input
                  value={customerQuery}
                  onChange={(e) => {
                    if (!lockedCustomer) setCustomerQuery(e.target.value)
                  }}
                  disabled={!!lockedCustomer}
                  className="flex-1 min-w-[200px] rounded-xl border px-4 py-2.5 font-bold disabled:bg-teal-50"
                  placeholder="جستجو..."
                />
                {lockedCustomer && (
                  <button
                    type="button"
                    onClick={unlockCustomer}
                    className="rounded-xl border border-orange-400 bg-orange-50 px-4 py-2 font-bold"
                  >
                    خروج از مشتری
                  </button>
                )}
              </div>
              {!lockedCustomer &&
                filteredCustomers.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => lockCustomer(c.name)}
                    className="block w-full text-right px-3 py-2 border-b font-bold hover:bg-teal-50"
                  >
                    {c.name}
                  </button>
                ))}
            </div>

            {exitFilter === "pending" && lockedCustomer && (
              <div className="rounded-2xl border bg-white p-4 shadow">
                <div className="flex flex-wrap justify-between gap-2 mb-3">
                  <h2 className="font-black">
                    خروج‌نخورده — {lockedCustomer} (
                    {displayPendingItems.length})
                  </h2>
                  <button
                    type="button"
                    disabled={!selectedExitIds.length}
                    onClick={() => setShowDriverModal(true)}
                    className="rounded-xl bg-green-600 text-white px-4 py-2 font-bold disabled:opacity-50"
                  >
                    صدور برگه ({selectedExitIds.length})
                  </button>
                </div>
                {exitLoading ? (
                  <p className="text-center py-8 font-bold">...</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-teal-600 text-white">
                      <tr>
                        <th className="p-2">✓</th>
                        <th className="p-2">سفارش</th>
                        <th className="p-2">کالا</th>
                        <th className="p-2">ابعاد</th>
                        <th className="p-2">تعداد</th>
                        <th className="p-2">متراژ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayPendingItems.map((it) => (
                        <tr key={it.productionItemId} className="border-b">
                          <td className="p-2 text-center">
                            <input
                              type="checkbox"
                              checked={selectedExitIds.includes(
                                it.productionItemId
                              )}
                              onChange={() =>
                                setSelectedExitIds((prev) =>
                                  prev.includes(it.productionItemId)
                                    ? prev.filter(
                                        (x) => x !== it.productionItemId
                                      )
                                    : [...prev, it.productionItemId]
                                )
                              }
                            />
                          </td>
                          <td className="p-2 text-center font-bold">
                            {it.orderNumber}
                          </td>
                          <td className="p-2 font-bold">{it.productName}</td>
                          <td className="p-2 text-center">
                            {it.length}×{it.width}
                          </td>
                          <td className="p-2 text-center">{it.quantity}</td>
                          <td className="p-2 text-center">
                            {it.meterage != null
                              ? Number(it.meterage).toFixed(3)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {exitFilter === "done" && lockedCustomer && (
              <div className="rounded-2xl border bg-white p-4 shadow space-y-4">
                <h2 className="font-black">
                  همه خروج‌خورده‌های {lockedCustomer} (
                  {doneItemsForCustomer.length} قلم)
                </h2>
                <table className="w-full text-sm">
                  <thead className="bg-teal-100">
                    <tr>
                      <th className="p-2">ش خروج</th>
                      <th className="p-2">تاریخ</th>
                      <th className="p-2">سفارش</th>
                      <th className="p-2">کالا</th>
                      <th className="p-2">تعداد</th>
                      <th className="p-2">متراژ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doneItemsForCustomer.map((r, i) => (
                      <tr key={i} className="border-b">
                        <td className="p-2 font-bold text-teal-800">
                          {r.slipNumber}
                        </td>
                        <td className="p-2 text-center">
                          {formatFaDate(r.exitDate)}
                        </td>
                        <td className="p-2 text-center">{r.orderNumber}</td>
                        <td className="p-2">{r.productName}</td>
                        <td className="p-2 text-center">{r.quantity}</td>
                        <td className="p-2 text-center">
                          {r.meterage != null
                            ? Number(r.meterage).toFixed(3)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <h3 className="font-bold mt-4">برگه‌ها</h3>
                {displayDoneSlips.map((h) => (
                  <div
                    key={h.id}
                    className="flex flex-wrap justify-between border-b py-2 text-sm"
                  >
                    <span className="font-bold">{h.exitNumber}</span>
                    <span>{formatFaDate(h.exitDate)}</span>
                    <span>{h.items?.length} قلم</span>
                    <span>چاپ: {h.printCount}</span>
                    <button
                      type="button"
                      className="text-teal-700 font-bold underline"
                      onClick={() => {
                        setCurrentSlip(h)
                        setShowPrint(true)
                      }}
                    >
                      چاپ
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {detail && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3 print:hidden">
          <div
            className="w-full max-w-6xl max-h-[96vh] flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl border border-teal-200"
            dir="rtl"
          >
            <div className="bg-teal-600 text-white px-5 py-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-black">
                {detailMode === "preview"
                  ? "نمایش قلم (رد نشده)"
                  : "جزئیات — رد ایستگاه"}
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold opacity-95">
                  {detail.stationName || selectedStationName || "—"}
                </span>
                <button
                  type="button"
                  onClick={closeDetail}
                  title="بستن (Esc)"
                  aria-label="بستن"
                  className="rounded-full bg-white/20 hover:bg-white/30 text-white w-9 h-9 flex items-center justify-center text-xl font-black leading-none"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div
                className={`grid gap-4 ${
                  detailMapUrl ? "lg:grid-cols-2" : "grid-cols-1"
                }`}
              >
                <div className="space-y-3">
                  <div className="text-center rounded-xl bg-orange-50 border border-orange-200 p-4">
                    <p className="text-3xl sm:text-4xl font-black text-blue-950 tracking-wide">
                      {detail.length ?? "—"} × {detail.width ?? "—"}
                    </p>
                    <p className="text-2xl sm:text-3xl font-black text-orange-600 mt-2">
                      تعداد: {detail.quantity}
                      {detail.remaining != null && Number(detail.remaining) > 0
                        ? ` (باقی: ${detail.remaining})`
                        : ""}
                    </p>
                  </div>

                  <div className="rounded-xl bg-teal-50 border border-teal-100 p-3">
                    <p className="text-xs text-blue-700 mb-1">نام کالا</p>
                    <p className="font-black text-blue-950 text-base">
                      {detail.productName || "—"}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                    <div className="rounded-xl bg-teal-50 border border-teal-100 p-3 col-span-2">
                      <p className="text-xs text-blue-700 mb-1">مشتری</p>
                      <p className="font-bold text-blue-950">
                        {detail.customerName || "—"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white border border-teal-100 p-3">
                      <p className="text-xs text-blue-700 mb-1">شماره سفارش</p>
                      <p className="font-bold">{detail.orderNumber || "—"}</p>
                    </div>
                    <div className="rounded-xl bg-white border border-teal-100 p-3">
                      <p className="text-xs text-blue-700 mb-1">بارکد</p>
                      <p className="font-bold font-mono" dir="ltr">
                        {detail.barcode || "—"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white border border-teal-100 p-3">
                      <p className="text-xs text-blue-700 mb-1">کد نصب</p>
                      <p className="font-bold">
                        {detail.installationCode || "—"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white border border-teal-100 p-3">
                      <p className="text-xs text-blue-700 mb-1">متراژ</p>
                      <p className="font-bold">
                        {detail.meterage != null
                          ? Number(detail.meterage).toFixed(4)
                          : "—"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white border border-teal-100 p-3">
                      <p className="text-xs text-blue-700 mb-1">اولویت</p>
                      <p className="font-bold">{detail.priority || "—"}</p>
                    </div>
                    <div className="rounded-xl bg-white border border-teal-100 p-3">
                      <p className="text-xs text-blue-700 mb-1">تاریخ سفارش</p>
                      <p className="font-bold">
                        {formatFaDate(detail.orderDate)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white border border-teal-100 p-3">
                      <p className="text-xs text-blue-700 mb-1">تاریخ تحویل</p>
                      <p className="font-bold">
                        {formatFaDate(detail.deliveryDate)}
                      </p>
                    </div>
                  </div>

                  {detail.servicesText ? (
                    <div className="rounded-xl border border-teal-200 bg-white p-3">
                      <p className="text-xs text-blue-700 mb-1 font-bold">
                        خدمات
                      </p>
                      <p className="font-black text-blue-950 whitespace-pre-line text-base">
                        {detail.servicesText}
                      </p>
                    </div>
                  ) : null}

                  {detail.notes ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <p className="text-xs text-amber-800 mb-1 font-bold">
                        توضیحات
                      </p>
                      <p className="font-semibold text-blue-950">
                        {detail.notes}
                      </p>
                    </div>
                  ) : null}

                  {detail.message ? (
                    <p className="text-center text-sm font-bold text-teal-700">
                      {detail.message}
                    </p>
                  ) : null}
                </div>

                {detailMapUrl && (
                  <div className="rounded-xl border border-teal-200 overflow-hidden flex flex-col">
                    <p className="text-xs text-blue-700 font-bold px-3 pt-2">
                      نقشه
                    </p>
                    <button
                      type="button"
                      className="w-full flex-1"
                      onClick={() => setMapPreviewUrl(detailMapUrl)}
                    >
                      <img
                        src={detailMapUrl}
                        alt="نقشه"
                        className="max-h-[62vh] w-full object-contain bg-gray-50"
                      />
                    </button>
                    <p className="text-[11px] text-center text-blue-600 py-1">
                      برای بزرگ‌نمایی کلیک کنید
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white border-t px-5 py-3 flex items-center justify-between gap-3">
              <span className="text-xs text-blue-600">
                {detailMode === "preview"
                  ? "× یا Esc = بستن بدون رد ایستگاه"
                  : "رد انجام شد — × یا Esc برای بستن | اسکن بعدی هم پنجره را می‌بندد"}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-xl border px-5 py-2.5 font-bold"
                  onClick={closeDetail}
                >
                  {detailMode === "preview" ? "بستن" : "ادامه"}
                </button>
                {detailMode === "preview" && (
                  <button
                    type="button"
                    className="rounded-xl bg-green-600 hover:bg-green-700 text-white px-8 py-2.5 font-bold disabled:opacity-50"
                    onClick={passFromPreview}
                    disabled={scanLoading}
                  >
                    رد کردن
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {mapPreviewUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 print:hidden"
          onClick={() => setMapPreviewUrl(null)}
        >
          <img
            src={mapPreviewUrl}
            alt="نقشه"
            className="max-h-[95vh] max-w-[95vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setMapPreviewUrl(null)}
            className="absolute top-5 left-5 rounded-full bg-white/20 text-white text-2xl w-12 h-12 flex items-center justify-center"
          >
            ✕
          </button>
        </div>
      )}

      {confirmData && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 print:hidden">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" dir="rtl">
            <h2 className="text-xl font-black text-blue-950 mb-3">تأیید تعداد</h2>
            <div className="rounded-xl bg-orange-50 border border-orange-200 p-4 text-center mb-3">
              <p className="text-3xl font-black">
                {confirmData.length ?? "—"} × {confirmData.width ?? "—"}
              </p>
              <p className="text-2xl font-black text-orange-700 mt-2">
                تعداد: {confirmData.quantity}
              </p>
            </div>
            <p className="font-bold text-base">{confirmData.productName}</p>
            <p className="text-sm text-blue-800 mb-2">
              سفارش {confirmData.orderNumber} — {confirmData.customerName}
            </p>
            {confirmData.mapImageUrl ? (
              <img
                src={confirmData.mapImageUrl}
                alt="نقشه"
                className="mt-2 max-h-40 mx-auto object-contain rounded-lg border"
              />
            ) : null}
            <label className="block text-sm font-bold mt-4 mb-1">
              چند عدد رد شود؟ (۱ تا {confirmData.quantity})
            </label>
            <input
              type="number"
              min={1}
              max={Number(confirmData.quantity) || 1}
              value={partialQty}
              onChange={(e) => setPartialQty(e.target.value)}
              className="w-full rounded-xl border border-teal-300 px-4 py-2.5 font-bold mb-3"
            />
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                className="border rounded-xl px-4 py-2.5 font-bold"
                onClick={() => {
                  setConfirmData(null)
                  setPartialQty("")
                  setBarcode("")
                  if (inputRef.current) inputRef.current.value = ""
                  setTimeout(() => inputRef.current?.focus(), 50)
                }}
              >
                انصراف
              </button>
              <button
                type="button"
                className="bg-blue-600 text-white rounded-xl px-4 py-2.5 font-bold"
                onClick={confirmPartial}
              >
                رد با همین تعداد
              </button>
              <button
                type="button"
                className="bg-green-600 text-white rounded-xl px-4 py-2.5 font-bold"
                onClick={confirmAll}
              >
                همه رد شوند
              </button>
            </div>
          </div>
        </div>
      )}

      {showDriverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 space-y-2" dir="rtl">
            <h2 className="font-black text-lg">راننده</h2>
            <input
              placeholder="نام"
              className="w-full border rounded-xl px-3 py-2 font-bold"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
            />
            <input
              placeholder="کد ملی"
              className="w-full border rounded-xl px-3 py-2 font-bold"
              value={driverNationalId}
              onChange={(e) => setDriverNationalId(e.target.value)}
            />
            <input
              placeholder="تلفن"
              className="w-full border rounded-xl px-3 py-2 font-bold"
              value={driverPhone}
              onChange={(e) => setDriverPhone(e.target.value)}
            />
            <input
              placeholder="ماشین"
              className="w-full border rounded-xl px-3 py-2 font-bold"
              value={vehicleName}
              onChange={(e) => setVehicleName(e.target.value)}
            />
            <input
              placeholder="پلاک"
              className="w-full border rounded-xl px-3 py-2 font-bold"
              value={plateNumber}
              onChange={(e) => setPlateNumber(e.target.value)}
            />
            <div className="flex gap-2 justify-end pt-2">
              <button
                className="border rounded-xl px-4 py-2 font-bold"
                onClick={() => setShowDriverModal(false)}
              >
                انصراف
              </button>
              <button
                className="bg-green-600 text-white rounded-xl px-4 py-2 font-bold"
                disabled={savingExit}
                onClick={createSlip}
              >
                ثبت
              </button>
            </div>
          </div>
        </div>
      )}

      {routeItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden"
          dir="rtl"
          onClick={() => setRouteItem(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-2xl bg-white p-5 shadow-xl"
            style={{ fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif" }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const pi = routeItem.productionItem
              const steps = pi.route || []
              const doneCount = steps.filter((s) => s.status === "تکمیل شده").length
              return (
                <>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-black text-blue-950">
                        روند کاری قطعه — {pi.productName}
                      </h3>
                      <p className="mt-1 text-sm font-bold text-blue-800">
                        سفارش {pi.productionOrder.order?.orderNumber || "—"} |{" "}
                        {pi.productionOrder.order?.customer?.name || "—"}
                        {pi.length && pi.width
                          ? ` | ${pi.length}×${pi.width}`
                          : ""}{" "}
                        | تعداد {pi.quantity}
                        {pi.barcode ? ` | بارکد ${pi.barcode}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRouteItem(null)}
                      className="rounded-lg border border-gray-300 px-3 py-1 text-lg font-bold hover:bg-gray-100"
                      title="بستن (Esc)"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="mb-3 rounded-xl border border-teal-200 bg-teal-50 p-2 text-sm font-bold text-teal-900">
                    {steps.length === 0
                      ? "مسیری برای این قطعه ثبت نشده است"
                      : `${doneCount} ایستگاه از ${steps.length} ایستگاه رد شده${
                          steps.length - doneCount > 0
                            ? ` — ${steps.length - doneCount} ایستگاه باقی مانده`
                            : " — همه‌ی ایستگاه‌ها رد شده‌اند"
                        }`}
                  </p>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    {steps.map((s, i) => {
                      const done = s.status === "تکمیل شده"
                      const active = s.status === "در حال انجام"
                      const mine = s.name === selectedStationName
                      return (
                        <div
                          key={s.id}
                          className={`rounded-xl border-2 p-3 text-center ${
                            done
                              ? "border-green-400 bg-green-50"
                              : active
                                ? "border-blue-400 bg-blue-50"
                                : "border-gray-300 bg-gray-50"
                          } ${mine ? "ring-2 ring-purple-500" : ""}`}
                        >
                          <p className="text-xs font-bold text-gray-500">
                            مرحله {i + 1}
                            {mine ? " — ایستگاه شما" : ""}
                          </p>
                          <p className="my-1 font-black text-blue-950">{s.name}</p>
                          <p
                            className={`text-sm font-bold ${
                              done
                                ? "text-green-700"
                                : active
                                  ? "text-blue-700"
                                  : "text-gray-600"
                            }`}
                          >
                            {done
                              ? "✓ رد شده"
                              : active
                                ? `در حال انجام (${s.quantityOut ?? 0} از ${
                                    (s.quantityOut ?? 0) + (s.quantityIn ?? 0)
                                  })`
                                : `در انتظار ${s.name}`}
                          </p>
                          {done && s.completedAt && (
                            <p className="mt-1 text-xs text-gray-600">
                              {new Date(s.completedAt).toLocaleString("fa-IR")}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <p className="mt-3 text-xs text-blue-700">
                    فقط برای مشاهده است و چیزی رد نمی‌کند | Esc = بستن
                  </p>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {showPrint && currentSlip && (
        <div className="fixed inset-0 z-40 overflow-auto bg-black/40 p-4 print:static print:bg-white print:p-0">
          <div className="mx-auto max-w-[210mm] bg-white shadow print:shadow-none">
            <div className="flex gap-2 p-3 print:hidden border-b">
              <button
                type="button"
                onClick={markPrinted}
                className="rounded-xl bg-teal-600 text-white px-4 py-2 font-bold"
              >
                چاپ
              </button>
              <button
                type="button"
                onClick={exportExcelSlip}
                className="rounded-xl border px-4 py-2 font-bold"
              >
                اکسل
              </button>
              <span className="px-2 py-2 text-sm font-bold">
                چاپ: {currentSlip.printCount}
              </span>
              <button
                type="button"
                onClick={() => setShowPrint(false)}
                className="mr-auto border rounded-xl px-4 py-2 font-bold"
              >
                بستن
              </button>
            </div>
            <div className="p-6" dir="rtl" id="exit-print-area">
              <div className="text-center mb-3">
                <h1 className="text-xl font-black">فرم خروج کالا</h1>
                <h2 className="font-bold">شیشه و آینه اخوان</h2>
              </div>
              <div className="flex flex-wrap gap-3 text-sm mb-3">
                <span>
                  مشتری: <strong>{currentSlip.customerName}</strong>
                </span>
                <span>
                  شماره: <strong>{currentSlip.exitNumber}</strong>
                </span>
                <span>
                  تاریخ: <strong>{formatFaDate(currentSlip.exitDate)}</strong>
                </span>
              </div>
              <table className="w-full border-collapse border border-black text-xs">
                <thead>
                  <tr>
                    <th className="border border-black p-1">ردیف</th>
                    <th className="border border-black p-1">ش سفارش</th>
                    <th className="border border-black p-1">کالا</th>
                    <th className="border border-black p-1">طول</th>
                    <th className="border border-black p-1">عرض</th>
                    <th className="border border-black p-1">تعداد</th>
                    <th className="border border-black p-1">متراژ</th>
                    <th className="border border-black p-1">خدمات</th>
                    <th className="border border-black p-1">توضیحات</th>
                  </tr>
                </thead>
                <tbody>
                  {currentSlip.items.map((it, idx) => (
                    <tr key={it.id}>
                      <td className="border border-black p-1 text-center">
                        {idx + 1}
                      </td>
                      <td className="border border-black p-1 text-center">
                        {it.orderNumber}
                      </td>
                      <td className="border border-black p-1">
                        {it.productName}
                      </td>
                      <td className="border border-black p-1 text-center">
                        {it.length}
                      </td>
                      <td className="border border-black p-1 text-center">
                        {it.width}
                      </td>
                      <td className="border border-black p-1 text-center">
                        {it.quantity}
                      </td>
                      <td className="border border-black p-1 text-center">
                        {it.meterage != null
                          ? Number(it.meterage).toFixed(4)
                          : ""}
                      </td>
                      <td className="border border-black p-1">
                        {it.servicesText || ""}
                      </td>
                      <td className="border border-black p-1">
                        {it.notes || ""}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td className="border border-black p-1" colSpan={5}>
                      جمع
                    </td>
                    <td className="border border-black p-1 text-center">
                      {printTotals.qty}
                    </td>
                    <td className="border border-black p-1 text-center">
                      {printTotals.meterage.toFixed(4)}
                    </td>
                    <td className="border border-black p-1" colSpan={2}></td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-4 text-sm leading-7">
                اجناس فوق سالم و شمارش‌شده تحویل اینجانب گردید و تا تسویه نهایی
                به‌صورت امانی نزد اینجانب می‌باشد.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <p>
                  راننده: <strong>{currentSlip.driverName || "—"}</strong>
                </p>
                <p>
                  کد ملی:{" "}
                  <strong>{currentSlip.driverNationalId || "—"}</strong>
                </p>
                <p>
                  تلفن: <strong>{currentSlip.driverPhone || "—"}</strong>
                </p>
                <p>
                  پلاک: <strong>{currentSlip.plateNumber || "—"}</strong>
                </p>
              </div>
              <div className="mt-10 grid grid-cols-2 gap-4 text-center text-sm">
                <div>
                  <p className="font-bold mb-8">مسئول بارگیری</p>
                  <p>امضا</p>
                </div>
                <div>
                  <p className="font-bold mb-8">تحویل‌گیرنده</p>
                  <p>امضا</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #exit-print-area,
          #exit-print-area * {
            visibility: visible;
          }
          #exit-print-area {
            position: absolute;
            inset: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  )
}
