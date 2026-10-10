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
    installationCode?: string | null
    mapImageUrl?: string | null
    orderDate?: string | null
    deliveryDate?: string | null
    productionOrder: {
      id: string
      productionNumber?: string
      priority: string
      order: {
        orderNumber?: string
        customer: { name: string }
      }
    }
  }
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

/** تطبیق نام ایستگاه یوزر با لیست (برای قفل کشویی) */
function stationMatches(userStation: string, stationName: string) {
  const a = norm(userStation)
  const b = norm(stationName)
  if (!a || !b) return false
  if (a === b) return true
  // مثلاً «انبار نیمه ساخته» با «انبار کالای نیمه‌ساخته»
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
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [operatorName, setOperatorName] = useState("")
  const [productFilter, setProductFilter] = useState("")
  const [search, setSearch] = useState("")

  const [barcode, setBarcode] = useState("")
  const [scanLoading, setScanLoading] = useState(false)
  const [lastResult, setLastResult] = useState<{
    type: "ok" | "err"
    text: string
  } | null>(null)

  const [confirmData, setConfirmData] = useState<any | null>(null)
  const [partialQty, setPartialQty] = useState("")
  const [detail, setDetail] = useState<any | null>(null)
  const [mapPreviewUrl, setMapPreviewUrl] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

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
    if (selectedStationId) fetchQueue()
    else {
      setQueue([])
      setSummary(null)
    }
  }, [selectedStationId])

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (showPrint) {
        setShowPrint(false)
        return
      }
      if (showDriverModal) {
        setShowDriverModal(false)
        return
      }
      if (mapPreviewUrl) {
        setMapPreviewUrl(null)
        return
      }
      if (confirmData) {
        setConfirmData(null)
        setPartialQty("")
        setBarcode("")
        if (inputRef.current) inputRef.current.value = ""
        return
      }
      if (detail) setDetail(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [confirmData, detail, mapPreviewUrl, showDriverModal, showPrint])

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
    const code = (codeOverride ?? inputRef.current?.value ?? barcode)
      .trim()
      .replace(/\r/g, "")
    if (!code) {
      setLastResult({ type: "err", text: "بارکد را وارد یا اسکن کنید" })
      return
    }
    if (!selectedStationId) {
      setLastResult({ type: "err", text: "ایستگاه را انتخاب کنید" })
      return
    }
    setBarcode(code)
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

      const res = await fetch("/api/production/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (data.needsConfirmation) {
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
      setDetail(data)
      setBarcode("")
      if (inputRef.current) inputRef.current.value = ""
      setConfirmData(null)
      setPartialQty("")
      await fetchQueue(true)
    } catch (e) {
      console.error(e)
      setLastResult({ type: "err", text: "خطا در ارتباط با سرور" })
    } finally {
      setScanLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

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


  const completeByRow = (row: QueueItem) => {
    const code = (row.productionItem.barcode || "").trim()
    if (!code) {
      alert("این ردیف بارکد ندارد")
      return
    }
    doScan(false, null, code)
  }

  const undoStation = async (row: QueueItem) => {
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

  const printTotals = useMemo(() => {
    const list = currentSlip?.items || []
    return {
      qty: list.reduce((s, i) => s + (i.quantity || 0), 0),
      meterage: list.reduce((s, i) => s + (Number(i.meterage) || 0), 0),
    }
  }, [currentSlip])

  return (
    <div
      className={`min-h-screen p-4 print:bg-white print:p-0 ${
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
      <div className="relative z-10 max-w-[1600px] mx-auto print:hidden">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/95 shadow-md p-5 border border-teal-300">
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
              className="rounded-xl border border-teal-500/40 bg-white px-4 py-2.5 shadow-sm font-bold text-blue-900"
            >
              بازگشت
            </Link>
          </div>
        </div>

        {isLoadingStation && (
          <div className="mb-4 flex gap-2">
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
            <div className="mb-4 rounded-2xl bg-white/95 shadow-md p-5 border border-teal-300">
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
                  <input
                    ref={inputRef}
                    type="text"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    onKeyDown={onKeyDown}
                    className="w-full rounded-xl border-2 border-teal-500 bg-white px-4 py-3 text-lg font-bold"
                    autoComplete="off"
                    disabled={scanLoading}
                  />
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
            </div>

            {summary && (
              <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-2xl bg-white/50 border p-4 text-center">
                  <p className="text-sm text-blue-700">ایستگاه</p>
                  <p className="text-lg font-bold text-teal-800">
                    {summary.stationName}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/50 border p-4 text-center">
                  <p className="text-sm text-blue-700">ردیف</p>
                  <p className="text-2xl font-bold text-teal-700">
                    {summary.count}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/50 border p-4 text-center">
                  <p className="text-sm text-blue-700">جمع تعداد</p>
                  <p className="text-2xl font-bold text-teal-700">
                    {summary.totalQuantity}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/50 border p-4 text-center">
                  <p className="text-sm text-blue-700">جمع متراژ</p>
                  <p className="text-2xl font-bold text-teal-700">
                    {Number(summary.totalMeterage).toFixed(4)}
                  </p>
                </div>
              </div>
            )}

            <div className="mb-4 rounded-2xl bg-white/95 shadow-md p-4 border border-teal-300">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-3">
                  <input
                    list="pl"
                    value={productFilter}
                    onChange={(e) => setProductFilter(e.target.value)}
                    placeholder="فیلتر کالا"
                    className="w-full rounded-xl border px-4 py-2.5 text-sm font-semibold"
                  />
                  <datalist id="pl">
                    {productNames.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                </div>
                <div className="md:col-span-3">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="مشتری / سفارش / بارکد"
                    className="w-full rounded-xl border px-4 py-2.5 text-sm font-semibold"
                  />
                </div>
                <div className="md:col-span-2">
                  <button
                    onClick={() => fetchQueue()}
                    className="w-full rounded-xl bg-teal-500 text-white px-4 py-2.5 font-bold"
                  >
                    بروزرسانی
                  </button>
                </div>
                <div className="md:col-span-2">
                  <button
                    type="button"
                    onClick={exportStationExcel}
                    className="w-full rounded-xl border border-teal-600 bg-white px-4 py-2.5 font-bold text-teal-800"
                  >
                    خروجی اکسل
                  </button>
                </div>
                <div className="md:col-span-2 text-center font-bold py-2">
                  نمایش: {filtered.length}
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white shadow-md p-4 border border-teal-300 overflow-x-auto">
              {loading ? (
                <p className="text-center py-16 font-bold">بارگذاری...</p>
              ) : filtered.length === 0 ? (
                <p className="text-center py-16 font-bold">صف خالی است</p>
              ) : (
                <table className="w-full text-sm border-collapse border border-gray-400">
                  <thead>
                    <tr className="bg-teal-100 border border-gray-400">
                      <th className="p-2 border border-gray-400">ردیف</th>
                      <th className="p-2 border border-gray-400">ش سفارش</th>
                      <th className="p-2 border border-gray-400">مشتری</th>
                      <th className="p-2 border border-gray-400">کالا</th>
                      <th className="p-2 border border-gray-400">بارکد</th>
                      <th className="p-2 border border-gray-400">ابعاد</th>
                      <th className="p-2 border border-gray-400">تعداد</th>
                      <th className="p-2 border border-gray-400">متراژ</th>
                      <th className="p-2 border border-gray-400">وضعیت</th>
                      <th className="p-2 border border-gray-400">عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row, index) => (
                      <tr
                        key={row.id}
                        className="border border-gray-400 bg-white hover:bg-teal-50 cursor-pointer"
                        title="دبل‌کلیک = رد ایستگاه"
                        onDoubleClick={() => completeByRow(row)}
                      >
                        <td className="p-2 border border-gray-400 text-center font-bold">
                          {index + 1}
                        </td>
                        <td className="p-2 border border-gray-400 text-center font-bold text-teal-800">
                          {row.productionItem.productionOrder.order
                            ?.orderNumber || "—"}
                        </td>
                        <td className="p-2 border border-gray-400 font-bold">
                          {row.productionItem.productionOrder.order?.customer
                            ?.name || "—"}
                        </td>
                        <td className="p-2 border border-gray-400 font-bold">
                          {row.productionItem.productName}
                        </td>
                        <td className="p-2 border border-gray-400 text-center font-bold">
                          {row.productionItem.barcode || "—"}
                        </td>
                        <td className="p-2 border border-gray-400 text-center font-black">
                          {row.productionItem.length &&
                          row.productionItem.width
                            ? `${row.productionItem.length}×${row.productionItem.width}`
                            : "—"}
                        </td>
                        <td className="p-2 border border-gray-400 text-center font-black">
                          {row.quantityIn ?? row.productionItem.quantity}
                        </td>
                        <td className="p-2 border border-gray-400 text-center">
                          {row.productionItem.meterage != null
                            ? Number(row.productionItem.meterage).toFixed(3)
                            : "—"}
                        </td>
                        <td className="p-2 border border-gray-400 text-center">
                          <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold">
                            {row.status}
                          </span>
                        </td>
                        <td className="p-2 border border-gray-400 text-center">
                          <div className="flex flex-wrap gap-1 justify-center">
                            <button
                              type="button"
                              disabled={scanLoading}
                              onClick={(e) => {
                                e.stopPropagation()
                                completeByRow(row)
                              }}
                              className="rounded-lg bg-green-600 hover:bg-green-700 text-white px-2 py-1 text-xs font-bold disabled:opacity-50"
                            >
                              رد
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 print:hidden">
          <div
            className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl border border-teal-200"
            dir="rtl"
          >
            <div className="sticky top-0 z-10 bg-teal-600 text-white px-5 py-3 flex items-center justify-between">
              <h2 className="text-lg font-black">جزئیات — رد ایستگاه</h2>
              <span className="text-sm font-bold opacity-95">
                {detail.stationName || selectedStationName || "—"}
              </span>
            </div>

            <div className="p-5 space-y-4">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-teal-50 border border-teal-100 p-3 sm:col-span-2">
                  <p className="text-xs text-blue-700 mb-1">نام کالا</p>
                  <p className="font-black text-blue-950 text-base">
                    {detail.productName || "—"}
                  </p>
                </div>
                <div className="rounded-xl bg-teal-50 border border-teal-100 p-3">
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
                  <p className="font-bold">{formatFaDate(detail.orderDate)}</p>
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
                  <p className="text-xs text-blue-700 mb-1 font-bold">خدمات</p>
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
                  <p className="font-semibold text-blue-950">{detail.notes}</p>
                </div>
              ) : null}

              {(detail.mapImageUrl ||
                (Array.isArray(detail.mapImages) &&
                  detail.mapImages.length > 0)) && (
                <div className="rounded-xl border border-teal-200 overflow-hidden">
                  <p className="text-xs text-blue-700 font-bold px-3 pt-2">
                    نقشه
                  </p>
                  <button
                    type="button"
                    className="w-full"
                    onClick={() => {
                      const url =
                        detail.mapImageUrl ||
                        (Array.isArray(detail.mapImages)
                          ? detail.mapImages[0]
                          : null)
                      if (url) setMapPreviewUrl(url)
                    }}
                  >
                    <img
                      src={
                        detail.mapImageUrl ||
                        (Array.isArray(detail.mapImages)
                          ? detail.mapImages[0]
                          : "")
                      }
                      alt="نقشه"
                      className="max-h-52 w-full object-contain bg-gray-50"
                    />
                  </button>
                  <p className="text-[11px] text-center text-blue-600 py-1">
                    برای بزرگ‌نمایی کلیک کنید
                  </p>
                </div>
              )}

              {detail.message ? (
                <p className="text-center text-sm font-bold text-teal-700">
                  {detail.message}
                </p>
              ) : null}
            </div>

            <div className="sticky bottom-0 bg-white border-t px-5 py-4 flex justify-end">
              <button
                type="button"
                className="rounded-xl bg-teal-500 hover:bg-teal-600 text-white px-8 py-2.5 font-bold"
                onClick={() => {
                  setDetail(null)
                  setBarcode("")
                  if (inputRef.current) inputRef.current.value = ""
                  setTimeout(() => inputRef.current?.focus(), 50)
                }}
              >
                ادامه
              </button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden">
          <div className="w-full max-w-md rounded-2xl bg-white p-6" dir="rtl">
            <h2 className="font-bold text-lg mb-2">تأیید تعداد</h2>
            <p className="font-black text-orange-700 mb-2">
              باقی: {confirmData.quantity}
            </p>
            <input
              type="number"
              value={partialQty}
              onChange={(e) => setPartialQty(e.target.value)}
              className="w-full rounded-xl border px-4 py-2 font-bold mb-3"
            />
            <div className="flex gap-2 justify-end">
              <button
                className="border rounded-xl px-3 py-2 font-bold"
                onClick={() => setConfirmData(null)}
              >
                انصراف
              </button>
              <button
                className="bg-blue-600 text-white rounded-xl px-3 py-2 font-bold"
                onClick={confirmPartial}
              >
                رد جزئی
              </button>
              <button
                className="bg-green-600 text-white rounded-xl px-3 py-2 font-bold"
                onClick={confirmAll}
              >
                همه
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