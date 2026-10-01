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
  const [partialQty, setPartialQty] = useState<string>("")
  const [detail, setDetail] = useState<any | null>(null)
  const [mapPreviewUrl, setMapPreviewUrl] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

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

  // رفرش خودکار هر ۱ دقیقه
  useEffect(() => {
    if (!selectedStationId) return
    const t = setInterval(() => {
      fetchQueue(true)
    }, 60_000)
    return () => clearInterval(t)
  }, [selectedStationId])

  useEffect(() => {
    if (confirmData || detail || mapPreviewUrl) return
    const t = setTimeout(() => inputRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [selectedStationId, scanLoading, confirmData, detail, mapPreviewUrl])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (mapPreviewUrl) {
        setMapPreviewUrl(null)
        return
      }
      if (confirmData) {
        setConfirmData(null)
        setPartialQty("")
        setBarcode("")
        if (inputRef.current) inputRef.current.value = ""
        setTimeout(() => inputRef.current?.focus(), 50)
        return
      }
      if (detail) {
        setDetail(null)
        setTimeout(() => inputRef.current?.focus(), 50)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [confirmData, detail, mapPreviewUrl])

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
        const match = list.find(
          (s) =>
            s.name === userStation ||
            s.name.replace(/\u200c/g, "") ===
              userStation.replace(/\u200c/g, "")
        )
        if (match) {
          setSelectedStationId(match.id)
          setStationLocked(true)
          return
        }
      }

      setStationLocked(false)
      if (list.length > 0) {
        const cut = list.find((s) => s.name === "برش")
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

  const formatFaDate = (dateStr?: string | null) => {
    if (!dateStr) return "—"
    try {
      return new Date(dateStr).toLocaleDateString("fa-IR")
    } catch {
      return "—"
    }
  }

  const collectMapUrls = (data: any): string[] => {
    const urls: string[] = []
    if (data?.mapImageUrl) urls.push(String(data.mapImageUrl))
    try {
      let extra = data?.mapImages
      if (typeof extra === "string") extra = JSON.parse(extra)
      if (Array.isArray(extra)) {
        extra.forEach((x: any) => {
          const u = typeof x === "string" ? x : x?.url
          if (u && !urls.includes(u)) urls.push(String(u))
        })
      }
    } catch {}
    return urls
  }

  const doScan = async (
    confirmed = false,
    quantityDone?: number | null,
    codeOverride?: string
  ) => {
    // مهم برای بارکدخوان: خواندن مستقیم از DOM
    const code = (
      codeOverride ??
      inputRef.current?.value ??
      barcode
    )
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
      if (quantityDone != null && quantityDone > 0) {
        body.quantityDone = quantityDone
      }

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

      // مثل سفارش تکی: فقط صفحه جزئیات (بدون پیام موفقیت سبز)
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
      setTimeout(() => {
        if (!confirmData) inputRef.current?.focus()
      }, 50)
    }
  }

  const confirmAll = () => {
    if (!confirmData) return
    const code = String(
      confirmData.barcode || barcode || inputRef.current?.value || ""
    )
    doScan(true, Number(confirmData.quantity) || undefined, code)
  }

  const confirmPartial = () => {
    if (!confirmData) return
    const max = Number(confirmData.quantity) || 0
    const n = parseInt(partialQty, 10)
    if (!n || n < 1) {
      alert("تعداد معتبر وارد کنید")
      return
    }
    if (n > max) {
      alert(`حداکثر ${max} عدد می‌توانید رد کنید`)
      return
    }
    const code = String(
      confirmData.barcode || barcode || inputRef.current?.value || ""
    )
    doScan(true, n, code)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      const code = (e.currentTarget.value || "").trim().replace(/\r/g, "")
      doScan(false, null, code)
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
      <div className="pointer-events-none fixed inset-0 bg-black/5" />

      <div className="relative z-10 max-w-[1600px] mx-auto">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/20">
          <div>
            <h1 className="text-2xl font-bold text-blue-950">
              کارتابل {stationLocked ? selectedStationName : "ایستگاه"}
            </h1>
            <p className="text-sm text-blue-800 mt-1">
              ایستگاه:{" "}
              <span className="font-bold text-teal-700">
                {selectedStationName}
              </span>
              {stationLocked ? " (ثابت بر اساس ورود شما)" : ""}
              {" — "}
              اسکن بارکد = رد کار · رفرش خودکار هر ۱ دقیقه
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

        <div className="mb-4 rounded-2xl bg-teal-500/15 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/30">
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
                    setLastResult(null)
                  }}
                  className="w-full rounded-xl border border-teal-500/30 bg-white/70 px-4 py-3 text-sm font-semibold text-blue-950 focus:border-teal-500 focus:outline-none"
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
                onClick={() =>
                  doScan(false, null, inputRef.current?.value || barcode)
                }
                disabled={scanLoading || !(barcode.trim() || inputRef.current?.value)}
                className="w-full rounded-xl bg-green-600 hover:bg-green-700 px-4 py-3 text-white font-bold text-lg disabled:opacity-50 shadow"
              >
                {scanLoading ? "..." : "ثبت"}
              </button>
            </div>
          </div>

          {lastResult?.type === "err" && (
            <div className="mt-3 rounded-xl px-4 py-3 font-bold text-sm bg-red-100 text-red-800 border border-red-300">
              {lastResult.text}
            </div>
          )}
        </div>

        {summary && (
          <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-2xl bg-white/50 border border-teal-500/20 p-4 text-center">
              <p className="text-sm text-blue-700 mb-1">ایستگاه</p>
              <p className="text-lg font-bold text-teal-800">
                {summary.stationName}
              </p>
            </div>
            <div className="rounded-2xl bg-white/50 border border-teal-500/20 p-4 text-center">
              <p className="text-sm text-blue-700 mb-1">تعداد ردیف</p>
              <p className="text-2xl font-bold text-teal-700">{summary.count}</p>
            </div>
            <div className="rounded-2xl bg-white/50 border border-teal-500/20 p-4 text-center">
              <p className="text-sm text-blue-700 mb-1">جمع تعداد</p>
              <p className="text-2xl font-bold text-teal-700">
                {summary.totalQuantity}
              </p>
            </div>
            <div className="rounded-2xl bg-white/50 border border-teal-500/20 p-4 text-center">
              <p className="text-sm text-blue-700 mb-1">جمع متراژ</p>
              <p className="text-2xl font-bold text-teal-700">
                {Number(summary.totalMeterage).toFixed(4)}
              </p>
            </div>
          </div>
        )}

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
                onClick={() => fetchQueue()}
                className="w-full rounded-xl bg-teal-500 hover:bg-teal-600 px-4 py-2.5 text-white font-bold"
              >
                بروزرسانی
              </button>
            </div>
            <div className="md:col-span-2">
              <div className="rounded-xl bg-teal-500/20 border border-teal-500/30 px-4 py-2.5 text-center font-bold text-blue-900">
                نمایش: {filtered.length}
              </div>
            </div>
          </div>
        </div>

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
                  <th className="p-3 font-bold text-center">متراژ</th>
                  <th className="p-3 font-bold text-center">تاریخ سفارش</th>
                  <th className="p-3 font-bold text-center">تاریخ تحویل</th>
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
                    <td className="p-3 text-center whitespace-nowrap font-black">
                      {row.productionItem.length && row.productionItem.width
                        ? `${row.productionItem.length}×${row.productionItem.width}`
                        : "—"}
                    </td>
                    <td className="p-3 text-center font-black text-teal-800">
                      {row.quantityIn ?? row.productionItem.quantity}
                    </td>
                    <td className="p-3 text-center">
                      {row.productionItem.meterage != null
                        ? Number(row.productionItem.meterage).toFixed(3)
                        : "—"}
                    </td>
                    <td className="p-3 text-center">
                      {formatFaDate(row.productionItem.orderDate)}
                    </td>
                    <td className="p-3 text-center">
                      {formatFaDate(row.productionItem.deliveryDate)}
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

      {/* جزئیات بعد از اسکن — حس «صفحه بعدی» */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto border-2 border-teal-400"
            dir="rtl"
          >
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold text-blue-950">جزئیات قطعه</h2>
              <button
                onClick={() => {
                  setDetail(null)
                  setTimeout(() => inputRef.current?.focus(), 50)
                }}
                className="rounded-lg border border-gray-300 px-3 py-1 font-bold text-gray-700 hover:bg-gray-50"
              >
                بستن
              </button>
            </div>

            {/* ابعاد و تعداد درشت‌تر */}
            <div className="mb-4 rounded-xl bg-teal-50 border border-teal-200 p-4">
              <p className="text-2xl font-black text-teal-900 tracking-wide">
                ابعاد: {detail.length ?? "—"} × {detail.width ?? "—"}
              </p>
              <p className="text-2xl font-black text-orange-700 mt-2">
                تعداد رد شده: {detail.quantity}
                {detail.remaining != null && detail.remaining > 0
                  ? ` (باقی‌مانده: ${detail.remaining})`
                  : ""}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-900">
              <p>
                کالا: <strong>{detail.productName}</strong>
              </p>
              <p>
                سفارش: <strong>{detail.orderNumber || "—"}</strong>
              </p>
              <p>
                مشتری: <strong>{detail.customerName || "—"}</strong>
              </p>
              <p>
                ایستگاه: <strong>{detail.stationName || "—"}</strong>
              </p>
              <p>
                بارکد: <strong className="font-mono">{detail.barcode}</strong>
              </p>
              <p>
                متراژ:{" "}
                <strong>
                  {detail.meterage != null
                    ? Number(detail.meterage).toFixed(4)
                    : "—"}
                </strong>
              </p>
              <p>
                تاریخ سفارش:{" "}
                <strong>{formatFaDate(detail.orderDate)}</strong>
              </p>
              <p>
                تاریخ تحویل:{" "}
                <strong>{formatFaDate(detail.deliveryDate)}</strong>
              </p>
              <p>
                کد نصب: <strong>{detail.installationCode || "—"}</strong>
              </p>
              <p>
                اولویت: <strong>{detail.priority || "عادی"}</strong>
              </p>
              {detail.servicesText ? (
                <p className="md:col-span-2">
                  خدمات: <strong>{detail.servicesText}</strong>
                </p>
              ) : null}
              {detail.notes ? (
                <p className="md:col-span-2">
                  توضیحات: <strong>{detail.notes}</strong>
                </p>
              ) : null}
            </div>

            {(() => {
              const urls = collectMapUrls(detail)
              if (urls.length === 0) {
                return (
                  <p className="mt-4 text-sm text-gray-500">
                    برای این سفارش نقشه/فایلی ثبت نشده است.
                  </p>
                )
              }
              return (
                <div className="mt-4">
                  <p className="text-sm font-bold text-blue-900 mb-2">
                    نقشه سفارش
                  </p>
                  <div className="flex flex-col gap-3">
                    {urls.map((url) => {
                      const lower = url.toLowerCase()
                      const isPdf =
                        lower.endsWith(".pdf") || lower.includes(".pdf")
                      if (isPdf) {
                        return (
                          <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-xl border border-teal-300 bg-teal-50 px-4 py-3 text-teal-800 font-bold w-fit"
                          >
                            باز کردن PDF
                          </a>
                        )
                      }
                      return (
                        <button
                          key={url}
                          type="button"
                          onClick={() => setMapPreviewUrl(url)}
                          className="block w-full text-right"
                        >
                          <div className="w-full overflow-hidden rounded-xl border border-teal-200 bg-white flex items-center justify-center p-2">
                            <img
                              src={url}
                              alt="نقشه"
                              className="max-h-[420px] w-auto max-w-full object-contain"
                            />
                          </div>
                          <p className="mt-1 text-xs text-gray-500">
                            برای بزرگ‌نمایی کامل کلیک کنید
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => {
                  setDetail(null)
                  setTimeout(() => inputRef.current?.focus(), 50)
                }}
                className="rounded-xl bg-teal-500 hover:bg-teal-600 px-6 py-2.5 font-bold text-white"
              >
                ادامه اسکن بعدی
              </button>
            </div>
          </div>
        </div>
      )}

      {/* پاپ‌آپ تعداد */}
      {confirmData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            dir="rtl"
          >
            <h2 className="text-xl font-bold text-blue-950 mb-3">
              تأیید رد تعداد
            </h2>
            <div className="space-y-2 text-sm text-blue-900 mb-4">
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
                تعداد باقی‌مانده: {confirmData.quantity} عدد
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-bold text-blue-900 mb-1">
                چند عدد رد شود؟
              </label>
              <input
                type="number"
                min={1}
                max={Number(confirmData.quantity) || 1}
                value={partialQty}
                onChange={(e) => setPartialQty(e.target.value)}
                className="w-full rounded-xl border border-teal-400 px-4 py-2.5 text-lg font-bold text-blue-950 focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
              <p className="text-xs text-gray-500 mt-1">
                مثلاً اگر ۲ تا از ۵ تا انجام شده، عدد ۲ را بزنید
              </p>
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <button
                onClick={() => {
                  setConfirmData(null)
                  setPartialQty("")
                  setBarcode("")
                  if (inputRef.current) inputRef.current.value = ""
                  setTimeout(() => inputRef.current?.focus(), 50)
                }}
                className="rounded-xl border border-gray-300 px-4 py-2.5 font-bold text-gray-700 hover:bg-gray-50"
              >
                انصراف
              </button>
              <button
                onClick={confirmPartial}
                disabled={scanLoading}
                className="rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 font-bold text-white disabled:opacity-50"
              >
                {scanLoading ? "..." : "رد با همین تعداد"}
              </button>
              <button
                onClick={confirmAll}
                disabled={scanLoading}
                className="rounded-xl bg-green-600 hover:bg-green-700 px-4 py-2.5 font-bold text-white disabled:opacity-50"
              >
                {scanLoading ? "..." : "همه رد شوند"}
              </button>
            </div>
          </div>
        </div>
      )}

      {mapPreviewUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setMapPreviewUrl(null)}
        >
          <img
            src={mapPreviewUrl}
            alt="نقشه"
            className="max-h-[95vh] max-w-[95vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setMapPreviewUrl(null)}
            className="absolute top-5 left-5 rounded-full bg-white/20 text-white text-2xl w-12 h-12 flex items-center justify-center"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}