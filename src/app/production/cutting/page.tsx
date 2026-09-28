"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import Link from "next/link"

type CuttingItem = {
  itemStationId: string
  itemStationStatus: string
  productionItemId: string
  productName: string
  barcode?: string | null
  length: number | null
  width: number | null
  quantity: number
  meterage: number | null
  labelStatus: string
  labelPrintCount: number
  labelReprintAllowed: boolean
  productionNumber?: string
  productionOrderId: string
  priority: string
  orderNumber?: string
  customerName?: string
  orderDate?: string | null
  deliveryDate?: string | null
  notes?: string | null
  servicesText?: string
  pieceNumber?: string | number | null
  installationCode?: string | null
}

type SortKey =
  | "barcode"
  | "productName"
  | "length"
  | "width"
  | "quantity"
  | "customerName"
  | "orderNumber"
  | "priority"
  | "labelStatus"
  | "labelPrintCount"

const normalizeText = (value: string) => {
  if (!value) return ""
  return value
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .toLowerCase()
    .trim()
}

const matchProductFilter = (productName: string, query: string) => {
  const name = normalizeText(productName || "")
  const q = normalizeText(query)
  if (!q) return true
  if (/^\d+(\.\d+)?$/.test(q)) {
    const patterns = [
      q + " میل",
      q + "ميل",
      q + "mm",
      q + " mm",
      " " + q + " ",
      q + "میل",
    ]
    if (patterns.some((p) => name.includes(p))) return true
    if (name.includes(q) && (name.includes("میل") || name.includes("mm"))) {
      return true
    }
    return false
  }
  return name.includes(q)
}

const splitServices = (text?: string | null): string[] => {
  if (!text) return []
  return text
    .split(/\s*[+_،,|/]\s*|\s+و\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export default function CuttingPlanningPage() {
  const [items, setItems] = useState<CuttingItem[]>([])
  const [productNames, setProductNames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [actionLoading, setActionLoading] = useState(false)

  const [productName, setProductName] = useState("")
  const [showProductDrop, setShowProductDrop] = useState(false)
  const productBoxRef = useRef<HTMLDivElement>(null)

  const [labelStatus, setLabelStatus] = useState("همه")
  const [priority, setPriority] = useState("همه")
  const [search, setSearch] = useState("")

  const [labels, setLabels] = useState<any[]>([])
  const [showLabelPreview, setShowLabelPreview] = useState(false)
  const [showReportPreview, setShowReportPreview] = useState(false)

  const [showReprintModal, setShowReprintModal] = useState(false)
  const [reprintMode, setReprintMode] = useState<"simple" | "waste">("simple")
  const [wasteReason, setWasteReason] = useState("")
  const [wasteDepartment, setWasteDepartment] = useState<"تولید" | "اداری">(
    "تولید"
  )
  const [wastePerson, setWastePerson] = useState("")

  const [sortKey, setSortKey] = useState<SortKey>("orderNumber")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!productBoxRef.current?.contains(e.target as Node)) {
        setShowProductDrop(false)
      }
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (showReprintModal) {
        setShowReprintModal(false)
        return
      }
      if (showLabelPreview) {
        setShowLabelPreview(false)
        return
      }
      if (showReportPreview) {
        setShowReportPreview(false)
        return
      }
      setShowProductDrop(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [showReprintModal, showLabelPreview, showReportPreview])

  const loadJsBarcode = (onReady: () => void) => {
    // @ts-ignore
    if (window.JsBarcode) {
      onReady()
      return
    }
    const scriptId = "jsbarcode-script"
    const existing = document.getElementById(scriptId)
    if (existing) {
      existing.addEventListener("load", onReady)
      setTimeout(onReady, 200)
      return
    }
    const script = document.createElement("script")
    script.id = scriptId
    script.src =
      "https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"
    script.onload = onReady
    document.body.appendChild(script)
  }

  useEffect(() => {
    if (!showLabelPreview || labels.length === 0) return
    let cancelled = false

    const draw = () => {
      if (cancelled) return
      // @ts-ignore
      const JsBarcode = window.JsBarcode
      if (!JsBarcode) return
      labels.forEach((label, idx) => {
        if (!label.barcode) return
        const el = document.getElementById(
          `barcode-${label.productionItemId}-${idx}`
        )
        if (!el) return
        try {
          el.innerHTML = ""
          JsBarcode(el, String(label.barcode), {
            format: "CODE128",
            width: 1.3,
            height: 28,
            displayValue: true,
            fontSize: 11,
            textMargin: 1,
            margin: 0,
            background: "#F0E000",
            lineColor: "#000000",
            fontOptions: "bold",
          })
        } catch (e) {
          console.error("barcode error", e)
        }
      })
    }

    loadJsBarcode(() => {
      setTimeout(draw, 50)
      setTimeout(draw, 250)
    })

    return () => {
      cancelled = true
    }
  }, [showLabelPreview, labels])

  const productSuggestions = useMemo(() => {
    const all = [...productNames].sort((a, b) => a.localeCompare(b, "fa"))
    if (!productName.trim()) return all.slice(0, 40)
    return all
      .filter((n) => matchProductFilter(n, productName))
      .slice(0, 40)
  }, [productNames, productName])

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
    let list = [...items]
    const qSearch = normalizeText(search)

    if (productName.trim()) {
      list = list.filter((i) =>
        matchProductFilter(i.productName || "", productName)
      )
    }
    if (labelStatus !== "همه") {
      list = list.filter((i) => i.labelStatus === labelStatus)
    }
    if (priority !== "همه") {
      list = list.filter((i) => (i.priority || "عادی") === priority)
    }
    if (qSearch) {
      list = list.filter(
        (i) =>
          normalizeText(i.customerName || "").includes(qSearch) ||
          normalizeText(i.orderNumber || "").includes(qSearch) ||
          normalizeText(i.barcode || "").includes(qSearch) ||
          matchProductFilter(i.productName || "", search)
      )
    }

    const dir = sortDir === "asc" ? 1 : -1
    list.sort((a, b) => {
      const num = (v: number | null | undefined) =>
        v == null || Number.isNaN(Number(v)) ? 0 : Number(v)
      switch (sortKey) {
        case "barcode":
          return (
            dir *
            String(a.barcode || "").localeCompare(String(b.barcode || ""), "fa", {
              numeric: true,
            })
          )
        case "productName":
          return (
            dir *
            (a.productName || "").localeCompare(b.productName || "", "fa")
          )
        case "length":
          return dir * (num(a.length) - num(b.length))
        case "width":
          return dir * (num(a.width) - num(b.width))
        case "quantity":
          return dir * (num(a.quantity) - num(b.quantity))
        case "customerName":
          return (
            dir *
            (a.customerName || "").localeCompare(b.customerName || "", "fa")
          )
        case "orderNumber":
          return (
            dir *
            String(a.orderNumber || "").localeCompare(
              String(b.orderNumber || ""),
              "fa",
              { numeric: true }
            )
          )
        case "priority":
          return dir * (a.priority || "").localeCompare(b.priority || "", "fa")
        case "labelStatus":
          return (
            dir *
            (a.labelStatus || "").localeCompare(b.labelStatus || "", "fa")
          )
        case "labelPrintCount":
          return dir * (num(a.labelPrintCount) - num(b.labelPrintCount))
        default:
          return 0
      }
    })

    return list
  }, [items, productName, labelStatus, priority, search, sortKey, sortDir])

  const reportRows = useMemo(
    () => filtered.filter((i) => selectedIds.includes(i.productionItemId)),
    [filtered, selectedIds]
  )

  const reportTotals = useMemo(() => {
    let totalQty = 0
    let totalMeterage = 0
    for (const r of reportRows) {
      totalQty += Number(r.quantity) || 0
      totalMeterage += Number(r.meterage) || 0
    }
    return { totalQty, totalMeterage }
  }, [reportRows])

  const reportTitleProduct =
    productName.trim() || (reportRows[0]?.productName ?? "همه کالاها")

  const todayFa = new Date().toLocaleDateString("fa-IR")

  useEffect(() => {
    if (!showReportPreview || reportRows.length === 0) return
    let cancelled = false

    const draw = () => {
      if (cancelled) return
      // @ts-ignore
      const JsBarcode = window.JsBarcode
      if (!JsBarcode) return
      reportRows.forEach((row) => {
        if (!row.barcode) return
        const el = document.getElementById(
          `report-barcode-${row.productionItemId}`
        )
        if (!el) return
        try {
          el.innerHTML = ""
          JsBarcode(el, String(row.barcode), {
            format: "CODE128",
            width: 1.0,
            height: 20,
            displayValue: true,
            fontSize: 8,
            textMargin: 1,
            margin: 0,
          })
        } catch {}
      })
    }

    loadJsBarcode(() => {
      setTimeout(draw, 80)
      setTimeout(draw, 250)
    })

    return () => {
      cancelled = true
    }
  }, [showReportPreview, reportRows])

  const fetchData = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (labelStatus) params.set("labelStatus", labelStatus)
      if (priority) params.set("priority", priority)
      if (search) params.set("search", search)

      const res = await fetch(`/api/production/cutting?${params.toString()}`)
      if (!res.ok) throw new Error("خطا در دریافت")
      const data = await res.json()
      setItems(data.items || [])
      setProductNames(data.productNames || [])
      setSelectedIds([])
    } catch (error) {
      console.error(error)
      alert("خطا در بارگذاری لیست برش")
    } finally {
      setLoading(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) setSelectedIds([])
    else setSelectedIds(filtered.map((i) => i.productionItemId))
  }

  const printLabels = async () => {
    if (selectedIds.length === 0) {
      alert("حداقل یک مورد را انتخاب کنید")
      return
    }
    try {
      setActionLoading(true)
      const res = await fetch("/api/production/cutting/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productionItemIds: selectedIds,
          action: "print",
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || "خطا در چاپ")
        return
      }
      setLabels(data.labels || [])
      setShowLabelPreview(true)
      await fetchData()
    } catch (error) {
      console.error(error)
      alert("خطا در ارتباط با سرور")
    } finally {
      setActionLoading(false)
    }
  }

  const openReprintModal = () => {
    if (selectedIds.length === 0) {
      alert("حداقل یک مورد را انتخاب کنید")
      return
    }
    setReprintMode("simple")
    setWasteReason("")
    setWasteDepartment("تولید")
    setWastePerson("")
    setShowReprintModal(true)
  }

  const submitReprint = async () => {
    if (reprintMode === "waste") {
      if (!wasteReason.trim()) {
        alert("علت ضایعات را وارد کنید")
        return
      }
      if (!wastePerson.trim()) {
        alert("شخص مسبب را وارد کنید")
        return
      }
    }
    try {
      setActionLoading(true)
      const body: Record<string, unknown> = {
        productionItemIds: selectedIds,
        action: "allow-reprint",
      }
      if (reprintMode === "waste") {
        body.reason = wasteReason.trim()
        body.department = wasteDepartment
        body.responsiblePerson = wastePerson.trim()
      } else {
        body.reason = "چاپ مجدد بدون ضایعات (پارگی لیبل / نیاز اداری)"
        body.department = "اداری"
        body.responsiblePerson = "—"
        body.simpleReprint = true
      }
      const res = await fetch("/api/production/cutting/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || "خطا")
        return
      }
      alert(data.message || "اجازه چاپ مجدد ثبت شد")
      setShowReprintModal(false)
      await fetchData()
    } catch (error) {
      console.error(error)
      alert("خطا در ارتباط با سرور")
    } finally {
      setActionLoading(false)
    }
  }

  const handlePrintBrowser = () => window.print()

  const exportReportExcel = () => {
    if (reportRows.length === 0) {
      alert("ردیفی برای خروجی نیست")
      return
    }
    const headers = [
      "ردیف",
      "بارکد",
      "کد نصب",
      "سفارش",
      "تاریخ سفارش",
      "تاریخ تحویل",
      "اولویت",
      "نام مشتری",
      "تعداد",
      "نام کالا",
      "عرض",
      "طول",
      "متراژ",
      "خدمات",
      "توضیحات",
    ]
    const lines = reportRows.map((row, idx) =>
      [
        idx + 1,
        row.barcode || "",
        row.installationCode || "",
        row.orderNumber || "",
        formatFaDate(row.orderDate),
        formatFaDate(row.deliveryDate),
        row.priority || "عادی",
        row.customerName || "",
        row.quantity,
        row.productName || "",
        row.width ?? "",
        row.length ?? "",
        row.meterage != null ? Number(row.meterage).toFixed(4) : "",
        (row.servicesText || "").replace(/,/g, "،"),
        (row.notes || "").replace(/,/g, "،"),
      ].join(",")
    )
    lines.push(
      [
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "جمع",
        reportTotals.totalQty,
        "",
        "",
        "",
        reportTotals.totalMeterage.toFixed(4),
        "",
        "",
      ].join(",")
    )
    const csv = "\uFEFF" + [headers.join(","), ...lines].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `لیست-برش-CNC-${reportTitleProduct.replace(/\s+/g, "-")}-${todayFa.replace(/\//g, "-")}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getLabelStatusColor = (status: string) => {
    switch (status) {
      case "چاپ‌نشده":
        return "bg-yellow-100 text-yellow-800"
      case "چاپ‌شده":
        return "bg-green-100 text-green-800"
      case "مجاز چاپ مجدد":
        return "bg-orange-100 text-orange-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const formatFaDate = (dateStr?: string | null) => {
    if (!dateStr) return "—"
    try {
      return new Date(dateStr).toLocaleDateString("fa-IR")
    } catch {
      return "—"
    }
  }

  const thClass =
    "p-3 font-bold text-center cursor-pointer select-none hover:bg-teal-500/25 transition whitespace-nowrap"

  return (
    <div
      className="min-h-screen p-4 bg-cover bg-center bg-fixed print:bg-none print:p-0"
      style={{
        backgroundImage:
          "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')",
        fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif",
      }}
      dir="rtl"
    >
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 6mm;
          }
          html,
          body {
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body * {
            visibility: hidden !important;
          }
          .print-area,
          .print-area *,
          .print-label-area,
          .print-label-area * {
            visibility: visible !important;
          }
          .print-area,
          .print-label-area {
            position: fixed !important;
            inset: 0 !important;
            width: 100% !important;
            height: auto !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 4mm !important;
            background: #fff !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            overflow: visible !important;
            z-index: 99999 !important;
          }
          .print-area table {
            width: 100% !important;
            table-layout: fixed !important;
            font-size: 9px !important;
            border-collapse: collapse !important;
          }
          .print-area th,
          .print-area td {
            padding: 2px 2px !important;
            word-wrap: break-word !important;
            overflow-wrap: anywhere !important;
          }
          .print-area th:first-child,
          .print-area td:first-child {
            width: 26px !important;
            max-width: 26px !important;
          }
          .print-area svg {
            max-width: 78px !important;
            height: auto !important;
          }
          .print-hidden {
            display: none !important;
            visibility: hidden !important;
          }
        }
      `}</style>

      <div className="pointer-events-none fixed inset-0 bg-black/5 print:hidden" />

      <div className="relative z-10 max-w-[1600px] mx-auto print:hidden">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/20">
          <div>
            <h1 className="text-2xl font-bold text-blue-950">برنامه‌ریزی برش</h1>
            <p className="text-sm text-blue-800 mt-1">
              سرچ با ضخامت (مثلاً ۴)، چاپ برگه و لیبل
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
              href="/production/queue"
              className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-4 py-2.5 text-blue-900 font-bold"
            >
              مشاهده روند کاری
            </Link>
            <Link
              href="/"
              className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-4 py-2.5 text-blue-900 font-bold"
            >
              بازگشت
            </Link>
          </div>
        </div>

        <div className="mb-4 rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-4 shadow-lg border border-teal-500/20">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-3 relative" ref={productBoxRef}>
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                نام کالا / ضخامت
              </label>
              <input
                value={productName}
                onChange={(e) => {
                  setProductName(e.target.value)
                  setShowProductDrop(true)
                }}
                onFocus={() => setShowProductDrop(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setShowProductDrop(false)
                    fetchData()
                  }
                }}
                placeholder="مثلاً ۴ یا آینه ۴ میل..."
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-sm font-semibold text-blue-950 focus:border-teal-500 focus:outline-none"
                autoComplete="off"
              />
              {showProductDrop && productSuggestions.length > 0 && (
                <div className="absolute z-30 mt-1 w-full max-h-56 overflow-auto rounded-xl border border-teal-300 bg-white shadow-xl">
                  {productSuggestions.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className="block w-full text-right px-3 py-2 text-sm font-bold text-blue-950 hover:bg-teal-50 border-b border-teal-50 last:border-0"
                      onClick={() => {
                        setProductName(name)
                        setShowProductDrop(false)
                      }}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-blue-700 mt-1">
                با زدن عدد ضخامت یا انتخاب از لیست، نام کامل کالا می‌آید
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                وضعیت برچسب
              </label>
              <select
                value={labelStatus}
                onChange={(e) => setLabelStatus(e.target.value)}
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-sm font-semibold text-blue-950 focus:border-teal-500 focus:outline-none"
              >
                <option value="همه">همه</option>
                <option value="چاپ‌نشده">چاپ‌نشده</option>
                <option value="چاپ‌شده">چاپ‌شده</option>
                <option value="مجاز چاپ مجدد">مجاز چاپ مجدد</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                اولویت
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-sm font-semibold focus:border-teal-500 focus:outline-none"
              >
                <option value="همه">همه</option>
                <option value="عادی">عادی</option>
                <option value="فوری">فوری</option>
                <option value="خیلی فوری">خیلی فوری</option>
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                جستجو
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") fetchData()
                }}
                placeholder="مشتری / ش سفارش / بارکد..."
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-sm font-semibold text-blue-950 focus:border-teal-500 focus:outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <button
                onClick={fetchData}
                className="w-full rounded-xl bg-teal-500 hover:bg-teal-600 px-4 py-2.5 text-white font-bold"
              >
                جستجو / بروزرسانی
              </button>
            </div>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={printLabels}
            disabled={actionLoading || selectedIds.length === 0}
            className="rounded-xl bg-teal-500 hover:bg-teal-600 px-5 py-2.5 text-white font-bold disabled:opacity-50"
          >
            چاپ لیبل انتخاب‌شده‌ها ({selectedIds.length})
          </button>
          <button
            onClick={() => {
              if (selectedIds.length === 0) {
                alert("حداقل یک مورد را انتخاب کنید")
                return
              }
              setShowReportPreview(true)
            }}
            disabled={selectedIds.length === 0}
            className="rounded-xl bg-blue-600 hover:bg-blue-700 px-5 py-2.5 text-white font-bold disabled:opacity-50"
          >
            چاپ برگه برنامه‌ریزی
          </button>
          <button
            onClick={openReprintModal}
            disabled={actionLoading || selectedIds.length === 0}
            className="rounded-xl bg-orange-500 hover:bg-orange-600 px-5 py-2.5 text-white font-bold disabled:opacity-50"
          >
            اجازه چاپ مجدد
          </button>
          <div className="rounded-xl bg-teal-500/20 border border-teal-500/30 px-4 py-2.5 text-blue-900 font-bold">
            تعداد: {filtered.length}
          </div>
        </div>

        <div className="rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-4 shadow-lg border border-teal-500/20 overflow-x-auto">
          {loading ? (
            <p className="text-center text-blue-700 py-16 text-xl font-bold">
              در حال بارگذاری...
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-blue-700 py-16 text-xl font-bold">
              قطعه‌ای برای برش یافت نشد
            </p>
          ) : (
            <table className="w-full text-sm text-blue-900 border-collapse">
              <thead>
                <tr className="border-b border-teal-500/30 bg-teal-500/15 text-right">
                  <th className="p-3 font-bold text-center">
                    <input
                      type="checkbox"
                      checked={
                        selectedIds.length === filtered.length &&
                        filtered.length > 0
                      }
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="p-3 font-bold text-center">ردیف</th>
                  <th className={thClass} onClick={() => toggleSort("barcode")}>
                    بارکد{sortIndicator("barcode")}
                  </th>
                  <th
                    className={thClass + " text-right"}
                    onClick={() => toggleSort("productName")}
                  >
                    نام کالا{sortIndicator("productName")}
                  </th>
                  <th className={thClass} onClick={() => toggleSort("width")}>
                    عرض{sortIndicator("width")}
                  </th>
                  <th className={thClass} onClick={() => toggleSort("length")}>
                    طول{sortIndicator("length")}
                  </th>
                  <th className={thClass} onClick={() => toggleSort("quantity")}>
                    تعداد{sortIndicator("quantity")}
                  </th>
                  <th
                    className={thClass + " text-right"}
                    onClick={() => toggleSort("customerName")}
                  >
                    مشتری{sortIndicator("customerName")}
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("orderNumber")}
                  >
                    ش سفارش{sortIndicator("orderNumber")}
                  </th>
                  <th className={thClass} onClick={() => toggleSort("priority")}>
                    اولویت{sortIndicator("priority")}
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("labelStatus")}
                  >
                    وضعیت برچسب{sortIndicator("labelStatus")}
                  </th>
                  <th
                    className={thClass}
                    onClick={() => toggleSort("labelPrintCount")}
                  >
                    تعداد چاپ{sortIndicator("labelPrintCount")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, index) => (
                  <tr
                    key={item.productionItemId}
                    className="border-b border-teal-500/10 hover:bg-teal-400/20 bg-white/30 transition"
                  >
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.productionItemId)}
                        onChange={() => toggleSelect(item.productionItemId)}
                      />
                    </td>
                    <td className="p-3 text-center font-bold">{index + 1}</td>
                    <td className="p-3 text-center font-bold text-teal-800">
                      {item.barcode || "—"}
                    </td>
                    <td className="p-3 font-bold">{item.productName}</td>
                    <td className="p-3 text-center">{item.width ?? "—"}</td>
                    <td className="p-3 text-center">{item.length ?? "—"}</td>
                    <td className="p-3 text-center font-semibold">
                      {item.quantity}
                    </td>
                    <td className="p-3 font-bold">{item.customerName || "—"}</td>
                    <td className="p-3 text-center font-bold text-teal-800">
                      {item.orderNumber || "—"}
                    </td>
                    <td className="p-3 text-center">{item.priority || "عادی"}</td>
                    <td className="p-3 text-center">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${getLabelStatusColor(
                          item.labelStatus
                        )}`}
                      >
                        {item.labelStatus}
                      </span>
                    </td>
                    <td className="p-3 text-center">{item.labelPrintCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showReprintModal && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <h2 className="text-xl font-bold text-blue-950 mb-4">
              اجازه چاپ مجدد
            </h2>
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setReprintMode("simple")}
                className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-bold border ${
                  reprintMode === "simple"
                    ? "bg-teal-500 text-white border-teal-600"
                    : "bg-white text-blue-900 border-teal-200"
                }`}
              >
                چاپ مجدد ساده
              </button>
              <button
                type="button"
                onClick={() => setReprintMode("waste")}
                className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-bold border ${
                  reprintMode === "waste"
                    ? "bg-orange-500 text-white border-orange-600"
                    : "bg-white text-blue-900 border-teal-200"
                }`}
              >
                با ثبت ضایعات
              </button>
            </div>
            {reprintMode === "waste" ? (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-bold text-blue-900">
                    علت ضایعات
                  </label>
                  <textarea
                    value={wasteReason}
                    onChange={(e) => setWasteReason(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-teal-500/30 px-4 py-2.5 text-sm font-semibold focus:border-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-bold text-blue-900">
                    بخش مسبب
                  </label>
                  <select
                    value={wasteDepartment}
                    onChange={(e) =>
                      setWasteDepartment(e.target.value as "تولید" | "اداری")
                    }
                    className="w-full rounded-xl border border-teal-500/30 px-4 py-2.5 text-sm font-semibold focus:border-teal-500 focus:outline-none"
                  >
                    <option value="تولید">تولید</option>
                    <option value="اداری">اداری</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-bold text-blue-900">
                    شخص مسبب
                  </label>
                  <input
                    type="text"
                    value={wastePerson}
                    onChange={(e) => setWastePerson(e.target.value)}
                    className="w-full rounded-xl border border-teal-500/30 px-4 py-2.5 text-sm font-semibold focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-blue-800 bg-teal-50 border border-teal-100 rounded-xl p-3 font-semibold">
                فقط اجازه چاپ مجدد ثبت می‌شود (پارگی لیبل و …).
              </p>
            )}
            <div className="mt-6 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowReprintModal(false)}
                className="rounded-xl border border-gray-300 px-5 py-2.5 font-bold text-gray-700"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={submitReprint}
                disabled={actionLoading}
                className={`rounded-xl px-5 py-2.5 font-bold text-white disabled:opacity-50 ${
                  reprintMode === "waste"
                    ? "bg-orange-500 hover:bg-orange-600"
                    : "bg-teal-500 hover:bg-teal-600"
                }`}
              >
                {actionLoading ? "..." : "تأیید"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showLabelPreview && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-auto print:static print:bg-white print:p-0">
          <div className="bg-white rounded-2xl p-6 w-full max-w-5xl my-4 print:shadow-none print:rounded-none print:my-0 print:max-w-none print:p-0 print-label-area">
            <div className="flex justify-between items-center mb-4 print:hidden">
              <h2 className="text-xl font-bold text-blue-950">
                پیش‌نمایش لیبل‌ها ({labels.length} قطعه) — ۹×۶ سانتی‌متر
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={handlePrintBrowser}
                  className="rounded-xl bg-teal-500 hover:bg-teal-600 px-5 py-2.5 text-white font-bold"
                >
                  چاپ
                </button>
                <button
                  onClick={() => setShowLabelPreview(false)}
                  className="rounded-xl border border-gray-300 px-5 py-2.5 font-bold text-gray-700"
                >
                  بستن
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 print:gap-0 justify-center print:justify-start">
              {labels.map((label, idx) => {
                const services = splitServices(label.servicesText)
                return (
                  <div
                    key={`${label.productionItemId}-${idx}`}
                    className="relative overflow-hidden text-black print:break-inside-avoid"
                    style={{
                      backgroundColor: "#F0E000",
                      width: "9cm",
                      height: "6cm",
                      padding: "4mm",
                      boxSizing: "border-box",
                      borderRadius: 4,
                      border: "1px solid #c4a000",
                      display: "flex",
                      flexDirection: "column",
                    }}
                    dir="rtl"
                  >
                    <div className="flex justify-between items-start gap-1">
                      <img
                        src="https://i.postimg.cc/PrV3wWPS/Whats-App-Image-2026-09-04-at-10-25-58-PM.jpg"
                        alt="Akhavan"
                        style={{
                          height: 32,
                          width: "auto",
                          mixBlendMode: "multiply",
                        }}
                      />
                      <div
                        className="text-right font-bold"
                        style={{ fontSize: 9, lineHeight: 1.35 }}
                      >
                        <p>سفارش: {formatFaDate(label.orderDate)}</p>
                        <p>تحویل: {formatFaDate(label.deliveryDate)}</p>
                        <p>
                          ش:{" "}
                          <span style={{ fontSize: 11, fontWeight: 900 }}>
                            {label.orderNumber || "—"}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div
                      style={{
                        borderTop: "1px solid rgba(0,0,0,0.35)",
                        margin: "3px 0 4px",
                      }}
                    />

                    <div
                      className="flex justify-between items-start gap-2 flex-1"
                      style={{ minHeight: 0 }}
                    >
                      <div style={{ width: "40%", textAlign: "right" }}>
                        <p
                          className="font-black"
                          style={{ fontSize: 12, lineHeight: 1.25 }}
                        >
                          {label.customerName || "—"}
                        </p>
                        {services.length > 0 && (
                          <ul className="mt-1 space-y-0.5 list-none p-0 m-0">
                            {services.map((s, i) => (
                              <li
                                key={i}
                                style={{
                                  fontSize: 12,
                                  fontWeight: 900,
                                  lineHeight: 1.2,
                                }}
                              >
                                {s}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div
                        style={{
                          width: "58%",
                          textAlign: "left",
                          direction: "ltr",
                        }}
                      >
                        <p
                          style={{
                            fontWeight: 700,
                            fontSize: 12,
                            lineHeight: 1.25,
                            textAlign: "left",
                            direction: "rtl",
                            unicodeBidi: "plaintext",
                          }}
                        >
                          {label.productName}
                        </p>
                        <p
                          style={{
                            fontWeight: 900,
                            fontSize: 16,
                            marginTop: 2,
                            textAlign: "left",
                            direction: "ltr",
                          }}
                        >
                          {label.length ?? "—"}*{label.width ?? "—"}=
                          {label.quantity ?? 1}
                        </p>
                        {label.notes ? (
                          <p
                            style={{
                              fontSize: 9,
                              fontWeight: 600,
                              marginTop: 2,
                              direction: "rtl",
                              textAlign: "left",
                              unicodeBidi: "plaintext",
                            }}
                          >
                            {label.notes}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div
                      style={{
                        direction: "ltr",
                        display: "flex",
                        justifyContent: "flex-start",
                        marginTop: 2,
                      }}
                    >
                      <svg
                        id={`barcode-${label.productionItemId}-${idx}`}
                        style={{ display: "block", maxWidth: "100%" }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {showReportPreview && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-auto print:static print:bg-white print:p-0">
          <div className="bg-white rounded-2xl p-4 w-full max-w-5xl my-4 print:shadow-none print:rounded-none print:my-0 print:max-w-none print:p-2 print:w-full print-area">
            <div className="flex justify-between items-center mb-3 print:hidden">
              <h2 className="text-xl font-bold text-blue-950">
                برگه برنامه‌ریزی برش
              </h2>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={exportReportExcel}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-white font-bold"
                >
                  خروجی Excel
                </button>
                <button
                  onClick={handlePrintBrowser}
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 px-5 py-2.5 text-white font-bold"
                >
                  چاپ برگه
                </button>
                <button
                  onClick={() => setShowReportPreview(false)}
                  className="rounded-xl border border-gray-300 px-5 py-2.5 font-bold text-gray-700"
                >
                  بستن
                </button>
              </div>
            </div>

            <div className="text-black bg-white" dir="rtl">
              <div className="text-center mb-2">
                <h3 className="text-xl font-black tracking-wide print:text-lg">
                  لیست برش CNC
                </h3>
                <div className="flex justify-between text-sm mt-2 px-1 font-bold print:text-xs">
                  <span>
                    نام کالا: <strong>{reportTitleProduct}</strong>
                  </span>
                  <span>{todayFa}</span>
                </div>
              </div>

              <table
                className="w-full border-collapse text-[12px] font-bold print:text-[9px]"
                style={{ tableLayout: "fixed" }}
              >
                <colgroup>
                  <col style={{ width: "28px" }} />
                  <col style={{ width: "88px" }} />
                  <col style={{ width: "48px" }} />
                  <col style={{ width: "48px" }} />
                  <col style={{ width: "68px" }} />
                  <col style={{ width: "68px" }} />
                  <col />
                  <col style={{ width: "40px" }} />
                  <col style={{ width: "40px" }} />
                  <col style={{ width: "40px" }} />
                  <col style={{ width: "48px" }} />
                  <col style={{ width: "70px" }} />
                </colgroup>
                <thead>
                  <tr>
                    {[
                      "ردیف",
                      "بارکد",
                      "کد نصب",
                      "سفارش",
                      "تاریخ سفارش",
                      "تاریخ تحویل",
                      "نام مشتری",
                      "تعداد",
                      "عرض",
                      "طول",
                      "متراژ",
                      "خدمات",
                    ].map((h) => (
                      <th
                        key={h}
                        className="border border-black p-1 font-black bg-gray-100 text-[11px] print:text-[9px]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((row, idx) => (
                    <tr key={row.productionItemId}>
                      <td className="border border-black p-1 text-center font-black">
                        {idx + 1}
                      </td>
                      <td className="border border-black p-0.5 text-center overflow-hidden">
                        <svg
                          id={`report-barcode-${row.productionItemId}`}
                          style={{
                            display: "block",
                            margin: "0 auto",
                            maxWidth: "82px",
                          }}
                        />
                      </td>
                      <td className="border border-black p-1 text-center font-bold">
                        {row.installationCode || "—"}
                      </td>
                      <td className="border border-black p-1 text-center font-black">
                        {row.orderNumber || "—"}
                      </td>
                      <td className="border border-black p-1 text-center font-bold">
                        {formatFaDate(row.orderDate)}
                      </td>
                      <td className="border border-black p-1 text-center font-bold">
                        <div>{row.priority || "عادی"}</div>
                        <div className="text-[10px] print:text-[8px]">
                          {formatFaDate(row.deliveryDate)}
                        </div>
                      </td>
                      <td className="border border-black p-1 font-black">
                        {row.customerName || "—"}
                      </td>
                      <td className="border border-black p-1 text-center font-black">
                        {row.quantity}
                      </td>
                      <td className="border border-black p-1 text-center font-black">
                        {row.width ?? "—"}
                      </td>
                      <td className="border border-black p-1 text-center font-black">
                        {row.length ?? "—"}
                      </td>
                      <td className="border border-black p-1 text-center font-bold">
                        {row.meterage != null
                          ? Number(row.meterage).toFixed(2)
                          : "—"}
                      </td>
                      <td className="border border-black p-1 text-[10px] font-bold print:text-[8px]">
                        {row.servicesText || row.notes || "—"}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50">
                    <td
                      colSpan={7}
                      className="border border-black p-1 text-left font-black"
                    >
                      جمع کل
                    </td>
                    <td className="border border-black p-1 text-center font-black">
                      {reportTotals.totalQty}
                    </td>
                    <td className="border border-black p-1" colSpan={2} />
                    <td className="border border-black p-1 text-center font-black">
                      {reportTotals.totalMeterage.toFixed(2)}
                    </td>
                    <td className="border border-black p-1" />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}