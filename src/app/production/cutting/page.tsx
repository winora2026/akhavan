"use client"

import { useState, useEffect, useMemo, useRef, useLayoutEffect } from "react"
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
  | "meterage"
  | "customerName"
  | "orderNumber"
  | "priority"
  | "labelStatus"
  | "labelPrintCount"

// ───────────── اندازه لیبل: ۹ سانتی‌متر عرض × ۶ سانتی‌متر ارتفاع (افقی) ─────────────
const LABEL_W_MM = 90
const LABEL_H_MM = 60

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

// استخراج ضخامت‌ها از نام کالا: «10 میل»، «10میل»، «2.2 میل»، «لمینیت 6+6» (مجموع)
const extractThicknesses = (name: string): number[] => {
  const out: number[] = []
  for (const m of name.matchAll(/(\d+(?:\.\d+)?)\s*(?:میل|mm)/g)) {
    out.push(Number(m[1]))
  }
  for (const m of name.matchAll(/(\d+(?:\.\d+)?(?:\s*\+\s*\d+(?:\.\d+)?)+)/g)) {
    out.push(m[1].split("+").reduce((s, x) => s + Number(x), 0))
  }
  const lead = name.match(/^(\d+(?:\.\d+)?)(?![\d.])/)
  if (lead) out.push(Number(lead[1]))
  return out
}

const matchProductFilter = (productName: string, query: string) => {
  const name = normalizeText(productName || "")
  const q = normalizeText(query)
  if (!q) return true
  const thicknesses = extractThicknesses(name)

  return q.split(/\s+/).every((token) => {
    if (/^\d+(\.\d+)?$/.test(token)) {
      return thicknesses.includes(Number(token))
    }
    return name.includes(token)
  })
}

const splitServices = (text?: string | null): string[] => {
  if (!text) return []
  return text
    .split(/\s*[+_،,|/]\s*|\s+و\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

const formatFaDate = (dateStr?: string | null) => {
  if (!dateStr) return "—"
  try {
    return new Date(dateStr).toLocaleDateString("fa-IR")
  } catch {
    return "—"
  }
}

// تاریخ لیبل: ارقام لاتین و صفر پر مثل نمونه → 1405/07/04
const formatLabelDate = (dateStr?: string | null) => {
  if (!dateStr) return "—"
  try {
    return new Date(dateStr).toLocaleDateString("fa-IR-u-nu-latn", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
  } catch {
    return "—"
  }
}

// متن لیبل: ارقام لاتین (مثل نمونه) و ی/ک فارسی
const labelText = (v: unknown) =>
  String(v ?? "")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .trim()

// اندازه فونت ابعاد بر اساس طول متن تا از عرض لیبل بیرون نزند
const dimsFontPt = (text: string) =>
  text.length <= 9 ? 20 : text.length <= 11 ? 17 : text.length <= 13 ? 14.5 : 12

// چند سطر متن که هرکدام دقیقاً در یک سطر می‌مانند؛ فونت (مشترک بین سطرها) تا جایی کم می‌شود که همه جا شوند
function FitLines({
  lines,
  maxPt,
  minPt = 7,
  className,
}: {
  lines: string[]
  maxPt: number
  minPt?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const key = lines.join("|")

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let size = maxPt
    el.style.fontSize = `${size}pt`
    const fits = () =>
      Array.from(el.children).every(
        (c) => (c as HTMLElement).scrollWidth <= (c as HTMLElement).clientWidth + 0.5
      )
    while (!fits() && size > minPt) {
      size -= 0.5
      el.style.fontSize = `${size}pt`
    }
  }, [key, maxPt, minPt])

  return (
    <div ref={ref} className={className} style={{ fontSize: `${maxPt}pt` }}>
      {lines.map((ln, i) => (
        <div
          key={i}
          style={{ whiteSpace: "nowrap", overflow: "hidden", lineHeight: 1.4 }}
        >
          {ln}
        </div>
      ))}
    </div>
  )
}

export default function CuttingPlanningPage() {
  const [items, setItems] = useState<CuttingItem[]>([])
  const [productNames, setProductNames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [actionLoading, setActionLoading] = useState(false)

  const [productName, setProductName] = useState("")
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

  // بارکد لیبل‌ها
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
            width: 1.5,
            height: 26,
            displayValue: true,
            fontSize: 12,
            textMargin: 2,
            margin: 0,
            background: "transparent",
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
    const qProduct = productName
    const qSearch = normalizeText(search)

    if (qProduct.trim()) {
      list = list.filter((i) =>
        matchProductFilter(i.productName || "", qProduct)
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
        case "meterage":
          return dir * (num(a.meterage) - num(b.meterage))
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

  const totalQuantity = useMemo(
    () => reportRows.reduce((s, r) => s + (Number(r.quantity) || 0), 0),
    [reportRows]
  )
  const totalMeterage = useMemo(
    () => reportRows.reduce((s, r) => s + (Number(r.meterage) || 0), 0),
    [reportRows]
  )

  const reportTitleProduct =
    productName.trim() || (reportRows[0]?.productName ?? "همه کالاها")

  const todayFa = new Date().toLocaleDateString("fa-IR")

  // بارکد برگه برنامه‌ریزی
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
            width: 1.2,
            height: 26,
            displayValue: true,
            fontSize: 10,
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

  // همه فیلترها سمت کلاینت انجام می‌شود؛ سرور همیشه لیست کامل را برمی‌گرداند
  const fetchData = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/production/cutting", { cache: "no-store" })
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
      "متراژ",
      "تعداد",
      "نام کالا",
      "عرض",
      "طول",
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
        row.meterage != null ? Number(row.meterage).toFixed(4) : "",
        row.quantity,
        row.productName || "",
        row.width ?? "",
        row.length ?? "",
        (row.servicesText || "").replace(/,/g, "،"),
        (row.notes || "").replace(/,/g, "،"),
      ].join(",")
    )
    const totalLine = [
      "جمع کل",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      totalMeterage.toFixed(4),
      totalQuantity,
      "",
      "",
      "",
      "",
      "",
    ].join(",")
    const csv = "\uFEFF" + [headers.join(","), ...lines, totalLine].join("\n")
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

  const thClass =
    "p-3 font-bold text-center cursor-pointer select-none hover:bg-teal-500/25 transition whitespace-nowrap"
  const thNarrowClass =
    "px-1.5 py-3 text-xs font-bold text-center cursor-pointer select-none hover:bg-teal-500/25 transition whitespace-nowrap"

  const pageCss = `
    @media print {
      @page {
        size: ${
          showLabelPreview ? `${LABEL_W_MM}mm ${LABEL_H_MM}mm` : "A4 portrait"
        };
        margin: ${showLabelPreview ? "0" : "6mm"};
      }
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      html, body, .print-root { background: none !important; }
      ${
        showLabelPreview
          ? `
      html, body { margin: 0 !important; padding: 0 !important; background: none !important; }
      .print-root { background: none !important; padding: 0 !important; min-height: 0 !important; }
      .label-sheet {
        background: transparent !important;
        border: none !important;
        height: ${LABEL_H_MM - 0.6}mm !important;
        margin: 0 !important;
        break-after: page;
        page-break-after: always;
        break-inside: avoid;
      }
      .label-sheet:last-child { break-after: auto; page-break-after: auto; }
      `
          : ""
      }
    }

    .label-sheet {
      box-sizing: border-box;
      width: ${LABEL_W_MM}mm;
      height: ${LABEL_H_MM}mm;
      padding: 2.5mm 4mm;
      background: #F0E000;
      border: 1px solid #c4a000;
      color: #000;
      font-family: Tahoma, "Segoe UI", Arial, sans-serif;
      font-weight: 700;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    /* بالا: تاریخ‌ها گوشه چپ، سمت راست خالی برای لوگوی چاپ‌شده روی لیبل خام */
    .label-top {
      direction: ltr;
      display: flex;
      justify-content: flex-start;
      height: 13mm;
      flex: none;
    }
    .label-dates {
      display: grid;
      grid-template-columns: auto auto;
      column-gap: 2mm;
      align-content: start;
      width: max-content;
      direction: rtl;
      font-size: 8.5pt;
      line-height: 1.4;
      font-weight: 700;
    }
    .label-dates .lbl { text-align: right; }
    .label-dates .val {
      direction: ltr;
      unicode-bidi: isolate;
      text-align: left;
      font-weight: 900;
    }
    .label-line { flex: none; border-top: 1px dashed #000; margin: 0 0 2mm; }
    .label-main {
      direction: ltr;
      display: flex;
      justify-content: space-between;
      gap: 3mm;
      flex: 1;
      min-height: 0;
    }
    .label-left {
      width: 46%;
      display: flex;
      flex-direction: column;
      min-height: 0;
      text-align: left;
    }
    .label-right { width: 50%; direction: rtl; text-align: right; }
    .label-product {
      font-size: 12pt;
      line-height: 1.3;
      font-weight: 700;
      direction: rtl;
      text-align: left;
      unicode-bidi: plaintext;
    }
    .label-dims {
      font-weight: 900;
      line-height: 1.15;
      margin-top: 1mm;
      direction: ltr;
      unicode-bidi: isolate;
      white-space: nowrap;
    }
    .label-notes {
      font-size: 10pt;
      line-height: 1.3;
      margin-top: 1mm;
      font-weight: 700;
      direction: rtl;
      text-align: left;
      unicode-bidi: plaintext;
    }
    .label-barcode { margin-top: auto; direction: ltr; line-height: 0; }
    .label-barcode svg { display: block; max-width: 100%; }
    .label-right { min-width: 0; }
    .label-customer {
      font-weight: 900;
      line-height: 1.3;
      margin-bottom: 1.5mm;
    }
    .label-service {
      font-weight: 900;
      line-height: 1.4;
      white-space: nowrap;
    }
  `

  return (
    <div
      className="print-root min-h-screen p-4 bg-cover bg-center bg-fixed"
      style={{
        backgroundImage:
          "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')",
        fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif",
      }}
      dir="rtl"
    >
      <style jsx global>{pageCss}</style>

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
            <div className="md:col-span-3">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                نام کالا / ضخامت
              </label>
              <input
                list="product-list"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="مثلاً ۱۰ یا آینه ۴ میل..."
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-sm font-semibold text-blue-950 focus:border-teal-500 focus:outline-none"
              />
              <datalist id="product-list">
                {productNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              <p className="text-[11px] text-blue-700 mt-1">
                با زدن فقط عدد ضخامت (مثل ۱۰) همه شیشه و آینه‌های همان ضخامت می‌آید
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
                placeholder="مشتری / ش سفارش / بارکد..."
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-sm font-semibold text-blue-950 focus:border-teal-500 focus:outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <button
                onClick={fetchData}
                className="w-full rounded-xl bg-teal-500 hover:bg-teal-600 px-4 py-2.5 text-white font-bold"
              >
                بروزرسانی
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
                  <th
                    className={thNarrowClass}
                    onClick={() => toggleSort("barcode")}
                  >
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
                  <th className={thClass} onClick={() => toggleSort("meterage")}>
                    متراژ{sortIndicator("meterage")}
                  </th>
                  <th className="p-3 font-bold text-center w-[30%] min-w-[260px]">
                    خدمات
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
                    <td className="px-1.5 py-3 text-center font-bold text-teal-800 text-xs whitespace-nowrap">
                      {item.barcode || "—"}
                    </td>
                    <td className="p-3 font-bold">{item.productName}</td>
                    <td className="p-3 text-center">{item.width ?? "—"}</td>
                    <td className="p-3 text-center">{item.length ?? "—"}</td>
                    <td className="p-3 text-center font-semibold">
                      {item.quantity}
                    </td>
                    <td className="p-3 font-bold">{item.customerName || "—"}</td>
                    <td className="p-3 text-center font-semibold">
                      {item.meterage != null
                        ? Number(item.meterage).toFixed(2)
                        : "—"}
                    </td>
                    <td className="p-3 font-bold text-sm leading-6 min-w-[260px]">
                      {splitServices(item.servicesText).length > 0
                        ? splitServices(item.servicesText).map((sv, i) => (
                            <div key={i}>{sv}</div>
                          ))
                        : "—"}
                    </td>
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
                <span className="block text-[11px] font-semibold opacity-90 mt-0.5">
                  پارگی لیبل — بدون علت
                </span>
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
                <span className="block text-[11px] font-semibold opacity-90 mt-0.5">
                  علت + بخش + شخص
                </span>
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
                    placeholder="علت را بنویسید..."
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
                    placeholder="نام شخص"
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-blue-800 bg-teal-50 border border-teal-100 rounded-xl p-3 font-semibold">
                فقط اجازه چاپ مجدد ثبت می‌شود؛ نیازی به علت ضایعات نیست (مثلاً
                پارگی لیبل یا چاپ ناخوانا).
              </p>
            )}

            <div className="mt-6 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowReprintModal(false)}
                className="rounded-xl border border-gray-300 px-5 py-2.5 font-bold text-gray-700 hover:bg-gray-50"
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
                {actionLoading
                  ? "در حال ثبت..."
                  : reprintMode === "waste"
                    ? "تأیید ضایعات و چاپ مجدد"
                    : "تأیید چاپ مجدد ساده"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showLabelPreview && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-auto print:static print:bg-white print:p-0">
          <div className="bg-white rounded-2xl p-6 w-full max-w-5xl my-4 print:shadow-none print:rounded-none print:my-0 print:max-w-none print:p-0">
            <div className="flex justify-between items-center mb-4 print:hidden">
              <h2 className="text-xl font-bold text-blue-950">
                پیش‌نمایش لیبل‌ها ({labels.length} قطعه)
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

            <div className="flex flex-wrap gap-4 print:block">
              {labels.map((label, idx) => {
                const services = splitServices(labelText(label.servicesText))
                const customerStr = labelText(label.customerName) || "—"
                const dimsText = `${label.length ?? "—"} * ${label.width ?? "—"}=${label.quantity ?? 1}`
                return (
                  <div
                    key={`${label.productionItemId}-${idx}`}
                    className="label-sheet"
                    dir="rtl"
                  >
                    {/* بالا چپ: تاریخ‌ها و شماره سفارش */}
                    <div className="label-top">
                      <div className="label-dates">
                        <span className="lbl">تاریخ سفارش:</span>
                        <span className="val">{formatLabelDate(label.orderDate)}</span>
                        <span className="lbl">تاریخ تحویل:</span>
                        <span className="val">{formatLabelDate(label.deliveryDate)}</span>
                        <span className="lbl">شماره سفارش:</span>
                        <span className="val">{labelText(label.orderNumber) || "—"}</span>
                      </div>
                    </div>

                    <div className="label-line" />

                    <div className="label-main">
                      {/* چپ: کالا، ابعاد، توضیحات و بارکد پایین چپ */}
                      <div className="label-left">
                        <FitLines
                          className="label-product"
                          lines={[labelText(label.productName)]}
                          maxPt={12}
                          minPt={7}
                        />
                        <div
                          className="label-dims"
                          style={{ fontSize: `${dimsFontPt(dimsText)}pt` }}
                        >
                          {dimsText}
                        </div>
                        {label.notes ? (
                          <FitLines
                            className="label-notes"
                            lines={[labelText(label.notes)]}
                            maxPt={10}
                            minPt={7}
                          />
                        ) : null}
                        <div className="label-barcode">
                          <svg id={`barcode-${label.productionItemId}-${idx}`} />
                        </div>
                      </div>

                      {/* راست: مشتری و خدمات زیر هم */}
                      <div className="label-right">
                        <FitLines
                          className="label-customer"
                          lines={[customerStr]}
                          maxPt={14}
                          minPt={8}
                        />
                        {services.length > 0 && (
                          <FitLines
                            className="label-service"
                            lines={services}
                            maxPt={14}
                            minPt={8}
                          />
                        )}
                      </div>
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
          <div className="bg-white rounded-2xl p-4 w-full max-w-5xl my-4 print:shadow-none print:rounded-none print:my-0 print:max-w-none print:p-1">
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

            <div className="text-black" dir="rtl">
              <div className="text-center mb-2">
                <h3 className="text-xl font-black tracking-wide">
                  لیست برش CNC
                </h3>
                <div className="flex justify-between text-sm mt-2 px-1 font-bold">
                  <span>
                    نام کالا: <strong>{reportTitleProduct}</strong>
                  </span>
                  <span>{todayFa}</span>
                </div>
              </div>

              <table className="w-full border-collapse text-[12px] font-bold">
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
                      "متراژ",
                      "تعداد",
                      "عرض",
                      "طول",
                      "خدمات",
                    ].map((h) => (
                      <th
                        key={h}
                        className="border border-black p-1.5 font-black bg-gray-100 text-[12px]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((row, idx) => (
                    <tr key={row.productionItemId}>
                      <td className="border border-black p-1.5 text-center font-black">
                        {idx + 1}
                      </td>
                      <td className="border border-black p-1 text-center">
                        <svg
                          id={`report-barcode-${row.productionItemId}`}
                          className="mx-auto"
                          style={{ display: "block", margin: "0 auto" }}
                        />
                      </td>
                      <td className="border border-black p-1.5 text-center font-bold">
                        {row.installationCode || "—"}
                      </td>
                      <td className="border border-black p-1.5 text-center font-black">
                        {row.orderNumber || "—"}
                      </td>
                      <td className="border border-black p-1.5 text-center font-bold">
                        {formatFaDate(row.orderDate)}
                      </td>
                      <td className="border border-black p-1.5 text-center font-bold">
                        <div>{row.priority || "عادی"}</div>
                        <div className="text-[11px]">
                          {formatFaDate(row.deliveryDate)}
                        </div>
                      </td>
                      <td className="border border-black p-1.5 font-black">
                        {row.customerName || "—"}
                      </td>
                      <td className="border border-black p-1.5 text-center font-bold">
                        {row.meterage != null
                          ? Number(row.meterage).toFixed(2)
                          : "—"}
                      </td>
                      <td className="border border-black p-1.5 text-center font-black">
                        {row.quantity}
                      </td>
                      <td className="border border-black p-1.5 text-center font-black">
                        {row.width ?? "—"}
                      </td>
                      <td className="border border-black p-1.5 text-center font-black">
                        {row.length ?? "—"}
                      </td>
                      <td className="border border-black p-1.5 text-[11px] font-bold">
                        {row.servicesText || row.notes || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100">
                    <td
                      colSpan={7}
                      className="border border-black p-1.5 text-center font-black"
                    >
                      جمع کل
                    </td>
                    <td className="border border-black p-1.5 text-center font-black">
                      {totalMeterage.toFixed(2)}
                    </td>
                    <td className="border border-black p-1.5 text-center font-black">
                      {totalQuantity}
                    </td>
                    <td colSpan={2} className="border border-black p-1.5" />
                    <td className="border border-black p-1.5" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
