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
    productionOrder: {
      id: string
      productionNumber: string
      priority: string
      order: {
        orderNumber: string
        customer: { name: string }
      }
    }
  }
}

export default function StationQueuePage() {
  const [stations, setStations] = useState<Station[]>([])
  const [selectedStationId, setSelectedStationId] = useState("")
  const [queue, setQueue] = useState<QueueItem[]>([])
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
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchStations()
  }, [])

  useEffect(() => {
    if (selectedStationId) fetchQueue()
    else setQueue([])
  }, [selectedStationId])

  useEffect(() => {
    inputRef.current?.focus()
  }, [selectedStationId, scanLoading, confirmData])

  const fetchStations = async () => {
    try {
      const res = await fetch("/api/production/stations")
      if (!res.ok) return
      const data = await res.json()
      const list = Array.isArray(data) ? data : []
      setStations(list.sort((a: Station, b: Station) => a.sortOrder - b.sortOrder))
      if (list.length > 0) {
        const cut = list.find((s: Station) => s.name === "برش")
        setSelectedStationId(cut?.id || list[0].id)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const fetchQueue = async () => {
    try {
      setLoading(true)
      const res = await fetch(
        `/api/production/station-queue?stationId=${selectedStationId}`
      )
      if (!res.ok) throw new Error("خطا")
      const data = await res.json()
      setQueue(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
      alert("خطا در بارگذاری کارتابل")
    } finally {
      setLoading(false)
    }
  }

  const productNames = useMemo(() => {
    return Array.from(
      new Set(queue.map((q) => q.productionItem.productName))
    ).sort()
  }, [queue])

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

  const doScan = async (confirmed = false) => {
    const code = barcode.trim()
    if (!code) {
      setLastResult({ type: "err", text: "بارکد را وارد یا اسکن کنید" })
      return
    }
    if (!selectedStationId) {
      setLastResult({ type: "err", text: "ایستگاه را انتخاب کنید" })
      return
    }

    try {
      setScanLoading(true)
      const res = await fetch("/api/production/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barcode: code,
          stationId: selectedStationId,
          operatorName: operatorName || undefined,
          confirmed,
        }),
      })
      const data = await res.json()

      if (data.needsConfirmation) {
        setConfirmData(data)
        return
      }

      if (!res.ok) {
        setLastResult({ type: "err", text: data.error || "خطا در اسکن" })
        setBarcode("")
        return
      }

      setLastResult({
        type: "ok",
        text: data.message || "با موفقیت رد شد",
      })
      setBarcode("")
      setConfirmData(null)
      await fetchQueue()
    } catch (e) {
      console.error(e)
      setLastResult({ type: "err", text: "خطا در ارتباط با سرور" })
    } finally {
      setScanLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      doScan(false)
    }
  }

  const selectedStationName =
    stations.find((s) => s.id === selectedStationId)?.name || "—"

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
      <link
        href="https://cdn.jsdelivr.net/npm/vazirmatn@33.003/Vazirmatn-font-face.css"
        rel="stylesheet"
      />
      <div className="pointer-events-none fixed inset-0 bg-black/5" />

      <div className="relative z-10 max-w-6xl mx-auto">
        {/* هدر */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/20">
          <div>
            <h1 className="text-2xl font-bold text-blue-950">کارتابل ایستگاه</h1>
            <p className="text-sm text-blue-800 mt-1">
              ایستگاه:{" "}
              <span className="font-bold text-teal-700">{selectedStationName}</span>
              {" — "}
              اسکن بارکد = رد کار
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/production/cutting"
              className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-4 py-2.5 text-blue-900 font-bold"
            >
              برنامه‌ریزی برش
            </Link>
            <Link
              href="/production/queue"
              className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-4 py-2.5 text-blue-900 font-bold"
            >
              صف تولید
            </Link>
            <Link
              href="/"
              className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-4 py-2.5 text-blue-900 font-bold"
            >
              بازگشت
            </Link>
          </div>
        </div>

        {/* باکس اسکن */}
        <div className="mb-4 rounded-2xl bg-teal-500/15 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/30">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-3">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                ایستگاه
              </label>
              <select
                value={selectedStationId}
                onChange={(e) => setSelectedStationId(e.target.value)}
                className="w-full rounded-xl border border-teal-500/30 bg-white/70 px-4 py-3 text-sm font-semibold text-blue-950 focus:border-teal-500 focus:outline-none"
              >
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-5">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                اسکن / ورود بارکد
              </label>
              <input
                ref={inputRef}
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="بارکد را اسکن کنید یا دستی تایپ کنید..."
                className="w-full rounded-xl border-2 border-teal-500 bg-white px-4 py-3 text-lg font-bold text-blue-950 focus:outline-none focus:ring-2 focus:ring-teal-400"
                autoComplete="off"
                disabled={scanLoading}
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                اپراتور
              </label>
              <input
                type="text"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                placeholder="اختیاری"
                className="w-full rounded-xl border border-teal-500/30 bg-white/70 px-4 py-3 text-sm font-semibold text-blue-950 focus:border-teal-500 focus:outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <button
                onClick={() => doScan(false)}
                disabled={scanLoading || !barcode.trim()}
                className="w-full rounded-xl bg-green-600 hover:bg-green-700 px-4 py-3 text-white font-bold text-lg disabled:opacity-50 shadow"
              >
                {scanLoading ? "..." : "ثبت"}
              </button>
            </div>
          </div>

          {lastResult && (
            <div
              className={`mt-3 rounded-xl px-4 py-3 font-bold text-sm ${
                lastResult.type === "ok"
                  ? "bg-green-100 text-green-800 border border-green-300"
                  : "bg-red-100 text-red-800 border border-red-300"
              }`}
            >
              {lastResult.text}
            </div>
          )}
        </div>

        {/* فیلتر لیست */}
        <div className="mb-4 rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-4 shadow-lg border border-teal-500/20">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-4">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                نام کالا
              </label>
              <input
                list="product-list"
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                placeholder="فیلتر کالا..."
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-sm font-semibold text-blue-950 focus:border-teal-500 focus:outline-none"
              />
              <datalist id="product-list">
                {productNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <div className="md:col-span-4">
              <label className="mb-1.5 block text-sm font-bold text-blue-900">
                جستجو
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="مشتری / ش سفارش / بارکد"
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-4 py-2.5 text-sm font-semibold text-blue-950 focus:border-teal-500 focus:outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <button
                onClick={fetchQueue}
                className="w-full rounded-xl bg-teal-500 hover:bg-teal-600 px-4 py-2.5 text-white font-bold"
              >
                بروزرسانی
              </button>
            </div>
            <div className="md:col-span-2">
              <div className="rounded-xl bg-teal-500/20 border border-teal-500/30 px-4 py-2.5 text-center font-bold text-blue-900">
                تعداد: {filtered.length}
              </div>
            </div>
          </div>
        </div>

        {/* جدول فقط نمایشی */}
        <div className="rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-4 shadow-lg border border-teal-500/20 overflow-x-auto">
          {loading ? (
            <p className="text-center text-blue-700 py-16 text-xl font-bold">
              در حال بارگذاری...
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-blue-700 py-16 text-xl font-bold">
              کاری در صف این ایستگاه نیست
            </p>
          ) : (
            <table className="w-full text-sm text-blue-900 border-collapse">
              <thead>
                <tr className="border-b border-teal-500/30 bg-teal-500/15 text-right">
                  <th className="p-3 font-bold text-center">ردیف</th>
                  <th className="p-3 font-bold text-center">ش سفارش</th>
                  <th className="p-3 font-bold">مشتری</th>
                  <th className="p-3 font-bold">کالا</th>
                  <th className="p-3 font-bold text-center">بارکد</th>
                  <th className="p-3 font-bold text-center">ابعاد</th>
                  <th className="p-3 font-bold text-center">تعداد</th>
                  <th className="p-3 font-bold text-center">اولویت</th>
                  <th className="p-3 font-bold text-center">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, index) => (
                  <tr
                    key={row.id}
                    className="border-b border-teal-500/10 hover:bg-teal-400/20 bg-white/30 transition"
                  >
                    <td className="p-3 text-center font-bold">{index + 1}</td>
                    <td className="p-3 text-center font-bold text-teal-800">
                      {row.productionItem.productionOrder.order?.orderNumber ||
                        "—"}
                    </td>
                    <td className="p-3 font-bold">
                      {row.productionItem.productionOrder.order?.customer
                        ?.name || "—"}
                    </td>
                    <td className="p-3 font-bold">
                      {row.productionItem.productName}
                    </td>
                    <td className="p-3 text-center font-bold text-teal-800">
                      {row.productionItem.barcode || "—"}
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      {row.productionItem.length && row.productionItem.width
                        ? `${row.productionItem.length}×${row.productionItem.width}`
                        : "—"}
                    </td>
                    <td className="p-3 text-center font-semibold">
                      {row.quantityIn ?? row.productionItem.quantity}
                    </td>
                    <td className="p-3 text-center">
                      {row.productionItem.productionOrder.priority || "عادی"}
                    </td>
                    <td className="p-3 text-center">
                      <span className="rounded-full px-3 py-1 text-xs font-bold bg-yellow-100 text-yellow-800">
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* پاپ‌آپ تأیید تعداد بالای ۵ */}
      {confirmData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            dir="rtl"
          >
            <h2 className="text-xl font-bold text-blue-950 mb-3">
              تأیید رد تعداد بالا
            </h2>
            <div className="space-y-2 text-sm text-blue-900 mb-5">
              <p>
                کالا: <strong>{confirmData.productName}</strong>
              </p>
              <p>
                سفارش: <strong>{confirmData.orderNumber}</strong>
              </p>
              <p>
                مشتری: <strong>{confirmData.customerName}</strong>
              </p>
              <p>
                ایستگاه: <strong>{confirmData.stationName}</strong>
              </p>
              <p className="text-lg font-black text-orange-700 mt-3">
                تعداد: {confirmData.quantity} عدد
              </p>
              <p className="text-gray-600">
                آیا همه این تعداد در ایستگاه «{confirmData.stationName}» رد
                شوند؟
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setConfirmData(null)
                  setBarcode("")
                  setTimeout(() => inputRef.current?.focus(), 50)
                }}
                className="rounded-xl border border-gray-300 px-5 py-2.5 font-bold text-gray-700 hover:bg-gray-50"
              >
                انصراف
              </button>
              <button
                onClick={() => doScan(true)}
                disabled={scanLoading}
                className="rounded-xl bg-green-600 hover:bg-green-700 px-5 py-2.5 font-bold text-white disabled:opacity-50"
              >
                {scanLoading ? "..." : "بله، همه رد شوند"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}