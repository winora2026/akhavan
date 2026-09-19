"use client"

import { useState, useEffect, useMemo } from "react"
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

const normalizeText = (value: string) => {
  if (!value) return ""
  return value
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .trim()
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
  const [wasteReason, setWasteReason] = useState("")
  const [wasteDepartment, setWasteDepartment] = useState<"تولید" | "اداری">("تولید")
  const [wastePerson, setWastePerson] = useState("")

  useEffect(() => {
    fetchData()
  }, [])

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
            width: 2,
            height: 48,
            displayValue: false,
            margin: 0,
            background: "#F0E000",
            lineColor: "#000000",
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

  const filtered = useMemo(() => {
    let list = items
    const qProduct = normalizeText(productName)
    const qSearch = normalizeText(search)

    if (qProduct) {
      list = list.filter((i) =>
        normalizeText(i.productName || "").includes(qProduct)
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
          normalizeText(i.productName || "").includes(qSearch)
      )
    }
    return list
  }, [items, productName, labelStatus, priority, search])

  const reportRows = useMemo(
    () => filtered.filter((i) => selectedIds.includes(i.productionItemId)),
    [filtered, selectedIds]
  )

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
            width: 1.2,
            height: 28,
            displayValue: false,
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
      if (productName) params.set("productName", productName)
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
    setWasteReason("")
    setWasteDepartment("تولید")
    setWastePerson("")
    setShowReprintModal(true)
  }

  const submitReprint = async () => {
    if (!wasteReason.trim()) {
      alert("علت ضایعات را وارد کنید")
      return
    }
    if (!wastePerson.trim()) {
      alert("شخص مسبب را وارد کنید")
      return
    }
    try {
      setActionLoading(true)
      const res = await fetch("/api/production/cutting/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productionItemIds: selectedIds,
          action: "allow-reprint",
          reason: wasteReason.trim(),
          department: wasteDepartment,
          responsiblePerson: wastePerson.trim(),
        }),
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

  return (
    <div
      className="min-h-screen p-4 bg-cover bg-center bg-fixed"
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
            size: A4 landscape;
            margin: 8mm;
          }
        }
      `}</style>

      <div className="pointer-events-none fixed inset-0 bg-black/5 print:hidden" />

      <div className="relative z-10 max-w-[1600px] mx-auto print:hidden">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/20">
          <div>
            <h1 className="text-2xl font-bold text-blue-950">برنامه‌ریزی برش</h1>
            <p className="text-sm text-blue-800 mt-1">
              سرچ بر اساس نام کالا، چاپ برگه برنامه‌ریزی و لیبل هر قطعه
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
                نام کالا
              </label>
              <input
                list="product-list"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") fetchData()
                }}
                placeholder="مثلاً آینه ۴ میل..."
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-sm font-semibold text-blue-950 focus:border-teal-500 focus:outline-none"
              />
              <datalist id="product-list">
                {productNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
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
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-sm font-semibold text-blue-950 focus:border-teal-500 focus:outline-none"
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
                  <th className="p-3 font-bold text-center">بارکد</th>
                  <th className="p-3 font-bold">نام کالا</th>
                  <th className="p-3 font-bold text-center">طول</th>
                  <th className="p-3 font-bold text-center">عرض</th>
                  <th className="p-3 font-bold text-center">تعداد</th>
                  <th className="p-3 font-bold">مشتری</th>
                  <th className="p-3 font-bold text-center">ش سفارش</th>
                  <th className="p-3 font-bold text-center">اولویت</th>
                  <th className="p-3 font-bold text-center">وضعیت برچسب</th>
                  <th className="p-3 font-bold text-center">تعداد چاپ</th>
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
                    <td className="p-3 text-center">{item.length ?? "—"}</td>
                    <td className="p-3 text-center">{item.width ?? "—"}</td>
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
              اجازه چاپ مجدد / ثبت ضایعات
            </h2>
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
                className="rounded-xl bg-orange-500 hover:bg-orange-600 px-5 py-2.5 font-bold text-white disabled:opacity-50"
              >
                {actionLoading ? "در حال ثبت..." : "تأیید و اجازه چاپ مجدد"}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 print:grid-cols-2 print:gap-2">
              {labels.map((label, idx) => (
                <div
                  key={`${label.productionItemId}-${idx}`}
                  className="relative overflow-hidden text-black"
                  style={{
                    backgroundColor: "#F0E000",
                    width: 360,
                    minHeight: 230,
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid #c4a000",
                  }}
                  dir="rtl"
                >
                  <div className="flex justify-between items-start gap-2">
                    <img
                      src="https://i.postimg.cc/PrV3wWPS/Whats-App-Image-2026-09-04-at-10-25-58-PM.jpg"
                      alt="Akhavan"
                      style={{
                        height: 48,
                        width: "auto",
                        mixBlendMode: "multiply",
                      }}
                    />
                    <div className="text-[11px] leading-5 text-right font-bold">
                      <p>تاریخ سفارش: {formatFaDate(label.orderDate)}</p>
                      <p>تاریخ تحویل: {formatFaDate(label.deliveryDate)}</p>
                      <p>
                        شماره سفارش:{" "}
                        <span className="text-sm font-black">
                          {label.orderNumber || "—"}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div
                    style={{
                      borderTop: "1.5px solid rgba(0,0,0,0.3)",
                      margin: "8px 0",
                    }}
                  />

                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1">
                      <p className="font-bold text-[15px]">{label.productName}</p>
                      <p className="font-black text-2xl mt-1 tracking-wide">
                        {label.length ?? "—"}*{label.width ?? "—"}=1
                      </p>
                      {label.notes ? (
                        <p className="text-[12px] font-semibold mt-1">
                          {label.notes}
                        </p>
                      ) : null}
                    </div>
                    <div className="max-w-[42%] text-left">
                      <p className="font-bold text-sm leading-5">
                        {label.customerName}
                      </p>
                      {label.servicesText ? (
                        <p className="text-[11px] font-semibold mt-1 leading-4">
                          {label.servicesText}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div
                    className="mt-3"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      width: "100%",
                      minHeight: 60,
                    }}
                  >
                    <svg
                      id={`barcode-${label.productionItemId}-${idx}`}
                      width="200"
                      height="48"
                      style={{ display: "block" }}
                    />
                    <p className="font-bold text-sm mt-1 tracking-wider">
                      {label.barcode}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showReportPreview && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-auto print:static print:bg-white print:p-0">
          <div className="bg-white rounded-2xl p-6 w-full max-w-6xl my-4 print:shadow-none print:rounded-none print:my-0 print:max-w-none print:p-2">
            <div className="flex justify-between items-center mb-4 print:hidden">
              <h2 className="text-xl font-bold text-blue-950">
                برگه برنامه‌ریزی برش
              </h2>
              <div className="flex gap-2">
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
              <div className="text-center mb-3">
                <h3 className="text-lg font-bold">گزارش مدیریت تولید</h3>
                <div className="flex justify-between text-sm mt-2 px-1">
                  <span>
                    نام کالا: <strong>{reportTitleProduct}</strong>
                  </span>
                  <span>{todayFa}</span>
                </div>
              </div>

              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr>
                    {[
  "بارکد",
  "ردیف",
  "کد نصب",
  "سفارش",
  "تاریخ سفارش",
  "تاریخ تحویل",
  "نام مشتری",
  "عرض",
  "طول",
  "تعداد",
  "متراژ",
  "خدمات",
].map((h) => (
                      <th
                        key={h}
                        className="border border-black p-1 font-bold bg-gray-100"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((row, idx) => (
                    <tr key={row.productionItemId}>
                      <td className="border border-black p-1 text-center">
                        <svg
                          id={`report-barcode-${row.productionItemId}`}
                          className="mx-auto"
                          style={{ maxWidth: 90, height: 28 }}
                        />
                        <div className="text-[9px] font-mono mt-0.5">
                          {row.barcode || "—"}
                        </div>
                      </td>
                      <td className="border border-black p-1 text-center">
                        {idx + 1}
                      </td>
                      <td className="border border-black p-1 text-center">
  {row.installationCode || "—"}
</td>
                      <td className="border border-black p-1 text-center">
                        {row.orderNumber || "—"}
                      </td>
                      <td className="border border-black p-1 text-center">
                        {formatFaDate(row.orderDate)}
                      </td>
                      <td className="border border-black p-1 text-center">
                        <div>{row.priority || "عادی"}</div>
                        <div className="text-[10px]">
                          {formatFaDate(row.deliveryDate)}
                        </div>
                      </td>
                      <td className="border border-black p-1">
                        {row.customerName || "—"}
                      </td>
                      <td className="border border-black p-1 text-center">
                        {row.width ?? "—"}
                      </td>
                      <td className="border border-black p-1 text-center">
                        {row.length ?? "—"}
                      </td>
                      <td className="border border-black p-1 text-center">
                        {row.quantity}
                      </td>
                      <td className="border border-black p-1 text-center">
                        {row.meterage != null
                          ? Number(row.meterage).toFixed(2)
                          : "—"}
                      </td>
                      <td className="border border-black p-1 text-[10px]">
                        {row.servicesText || row.notes || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}