"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"

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

export default function ExitSlipPage() {
  const [customerQuery, setCustomerQuery] = useState("")
  const [lockedCustomer, setLockedCustomer] = useState<string | null>(null)
  const [readyItems, setReadyItems] = useState<ReadyItem[]>([])
  const [customers, setCustomers] = useState<
    { name: string; phone?: string | null; id?: string | null }[]
  >([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [showDriverModal, setShowDriverModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [currentSlip, setCurrentSlip] = useState<ExitSlip | null>(null)
  const [showPrint, setShowPrint] = useState(false)
  const [history, setHistory] = useState<ExitSlip[]>([])

  // مشخصات راننده
  const [driverName, setDriverName] = useState("")
  const [driverNationalId, setDriverNationalId] = useState("")
  const [driverPhone, setDriverPhone] = useState("")
  const [vehicleName, setVehicleName] = useState("")
  const [plateNumber, setPlateNumber] = useState("")
  const [slipNotes, setSlipNotes] = useState("")

  // حالت اسکن بارگیری
  const [scanCode, setScanCode] = useState("")
  const [scanMsg, setScanMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const scanRef = useRef<HTMLInputElement>(null)

  const fetchReady = async (customer?: string) => {
    try {
      setLoading(true)
      const q = customer ? `?customer=${encodeURIComponent(customer)}` : ""
      const res = await fetch(`/api/production/exit-slips/ready${q}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا")
      setReadyItems(data.items || [])
      if (!customer) setCustomers(data.customers || [])
    } catch (e: any) {
      console.error(e)
      alert(e.message || "خطا در بارگذاری")
    } finally {
      setLoading(false)
    }
  }

  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/production/exit-slips")
      const data = await res.json()
      if (res.ok) setHistory(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    fetchReady()
    fetchHistory()
  }, [])

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase()
    if (!q) return customers.slice(0, 15)
    return customers
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 15)
  }, [customers, customerQuery])

  const displayItems = useMemo(() => {
    if (!lockedCustomer) return []
    return readyItems.filter((i) => i.customerName === lockedCustomer)
  }, [readyItems, lockedCustomer])

  const lockCustomer = async (name: string) => {
    setLockedCustomer(name)
    setCustomerQuery(name)
    setSelected([])
    setCurrentSlip(null)
    setShowPrint(false)
    await fetchReady(name)
  }

  const unlockCustomer = async () => {
    setLockedCustomer(null)
    setCustomerQuery("")
    setSelected([])
    setCurrentSlip(null)
    setShowPrint(false)
    await fetchReady()
  }

  const toggleAll = () => {
    if (selected.length === displayItems.length) setSelected([])
    else setSelected(displayItems.map((i) => i.productionItemId))
  }

  const toggleOne = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const openDriverModal = () => {
    if (selected.length === 0) {
      alert("حداقل یک قلم انتخاب کنید")
      return
    }
    setShowDriverModal(true)
  }

  const createSlip = async () => {
    if (!lockedCustomer) return
    try {
      setSaving(true)
      const sample = displayItems.find((i) => selected.includes(i.productionItemId))
      const res = await fetch("/api/production/exit-slips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: lockedCustomer,
          customerId: sample?.customerId,
          customerPhone: sample?.customerPhone,
          productionItemIds: selected,
          driverName,
          driverNationalId,
          driverPhone,
          vehicleName,
          plateNumber,
          notes: slipNotes,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا در ثبت")
      setCurrentSlip(data.slip)
      setShowDriverModal(false)
      setShowPrint(true)
      setSelected([])
      await fetchReady(lockedCustomer)
      await fetchHistory()
    } catch (e: any) {
      alert(e.message || "خطا")
    } finally {
      setSaving(false)
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

  const exportExcel = () => {
    if (!currentSlip) return
    const header = [
      "ردیف",
      "ش سفارش",
      "نام کالا",
      "طول",
      "عرض",
      "تعداد",
      "متراژ",
      "کد نصب",
      "خدمات",
      "توضیحات",
      "بارکد",
    ]
    const rows = currentSlip.items.map((it, idx) => [
      idx + 1,
      it.orderNumber || "",
      it.productName,
      it.length ?? "",
      it.width ?? "",
      it.quantity,
      it.meterage ?? "",
      it.installationCode || "",
      it.servicesText || "",
      it.notes || "",
      it.barcode || "",
    ])
    const totalQty = currentSlip.items.reduce((s, i) => s + (i.quantity || 0), 0)
    const totalM = currentSlip.items.reduce(
      (s, i) => s + (Number(i.meterage) || 0),
      0
    )
    rows.push(["", "", "جمع", "", "", totalQty, totalM.toFixed(4), "", "", "", ""])

    const lines = [header, ...rows]
      .map((r) =>
        r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n")
    const bom = "\uFEFF"
    const blob = new Blob([bom + lines], {
      type: "text/csv;charset=utf-8;",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `exit-${currentSlip.exitNumber}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const doLoadScan = async () => {
    const code = (scanRef.current?.value || scanCode).trim()
    if (!code) return
    try {
      const res = await fetch("/api/production/exit-slips/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode: code }),
      })
      const data = await res.json()
      if (!res.ok) {
        setScanMsg({ type: "err", text: data.error || "خطا" })
      } else {
        setScanMsg({ type: "ok", text: data.message || "بارگیری شد" })
        if (lockedCustomer) await fetchReady(lockedCustomer)
        else await fetchReady()
      }
    } catch {
      setScanMsg({ type: "err", text: "خطا در ارتباط" })
    } finally {
      setScanCode("")
      if (scanRef.current) scanRef.current.value = ""
      setTimeout(() => scanRef.current?.focus(), 50)
    }
  }

  const formatFa = (iso?: string | null) => {
    if (!iso) return "—"
    try {
      return new Date(iso).toLocaleDateString("fa-IR")
    } catch {
      return "—"
    }
  }

  const totals = useMemo(() => {
    const list = currentSlip?.items || []
    return {
      qty: list.reduce((s, i) => s + (i.quantity || 0), 0),
      meterage: list.reduce((s, i) => s + (Number(i.meterage) || 0), 0),
    }
  }, [currentSlip])

  return (
    <div
      className="min-h-screen p-4 bg-cover bg-center bg-fixed print:bg-white print:p-0"
      style={{
        backgroundImage:
          "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')",
        fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif",
      }}
      dir="rtl"
    >
      <div className="pointer-events-none fixed inset-0 bg-white/50 print:hidden" />

      <div className="relative z-10 max-w-6xl mx-auto print:hidden">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-teal-500/15 backdrop-blur p-5 border border-teal-500/30">
          <div>
            <h1 className="text-2xl font-black text-blue-950">
              برگه خروج / بارگیری
            </h1>
            <p className="text-sm text-blue-800 mt-1">
              سرچ مشتری → انتخاب اقلام آماده → راننده → چاپ برگه خروج
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/production/station-queue"
              className="rounded-xl border border-teal-400 bg-white/60 px-4 py-2 font-bold text-blue-900"
            >
              کارتابل
            </Link>
            <Link
              href="/"
              className="rounded-xl bg-teal-600 text-white px-4 py-2 font-bold"
            >
              بازگشت
            </Link>
          </div>
        </div>

        {/* سرچ مشتری + فریز */}
        <div className="mb-4 rounded-2xl bg-white/90 border border-teal-200 p-4 shadow">
          <label className="block text-sm font-bold text-blue-900 mb-1">
            نام مشتری
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              value={customerQuery}
              onChange={(e) => {
                if (lockedCustomer) return
                setCustomerQuery(e.target.value)
              }}
              placeholder="جستجوی مشتری..."
              disabled={!!lockedCustomer}
              className="flex-1 min-w-[200px] rounded-xl border border-teal-400 px-4 py-2.5 font-bold disabled:bg-teal-50"
            />
            {lockedCustomer ? (
              <button
                type="button"
                onClick={unlockCustomer}
                className="rounded-xl border border-orange-400 bg-orange-50 px-4 py-2.5 font-bold text-orange-800"
              >
                خروج از مشتری ({lockedCustomer})
              </button>
            ) : null}
          </div>
          {!lockedCustomer && filteredCustomers.length > 0 && (
            <div className="mt-2 rounded-xl border border-teal-100 bg-white max-h-48 overflow-y-auto">
              {filteredCustomers.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => lockCustomer(c.name)}
                  className="w-full text-right px-4 py-2 hover:bg-teal-50 font-bold text-blue-900 border-b border-teal-50"
                >
                  {c.name}
                  {c.phone ? (
                    <span className="text-xs text-gray-500 mr-2">{c.phone}</span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
          {lockedCustomer && (
            <p className="mt-2 text-sm font-bold text-teal-800">
              قفل روی مشتری: {lockedCustomer} — تا خروج دستی، فقط اقلام همین
              مشتری نمایش داده می‌شود
            </p>
          )}
        </div>

        {/* اقلام آماده */}
        {lockedCustomer && (
          <div className="mb-4 rounded-2xl bg-white/90 border border-teal-200 p-4 shadow">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="font-black text-blue-950">
                اقلام آماده خروج ({displayItems.length})
              </h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={toggleAll}
                  className="rounded-xl border px-3 py-2 text-sm font-bold"
                >
                  {selected.length === displayItems.length
                    ? "لغو انتخاب همه"
                    : "انتخاب همه"}
                </button>
                <button
                  type="button"
                  onClick={openDriverModal}
                  disabled={selected.length === 0}
                  className="rounded-xl bg-green-600 text-white px-4 py-2 font-bold disabled:opacity-50"
                >
                  صدور برگه خروج ({selected.length})
                </button>
              </div>
            </div>

            {loading ? (
              <p className="text-center py-8 font-bold text-blue-800">
                در حال بارگذاری...
              </p>
            ) : displayItems.length === 0 ? (
              <p className="text-center py-8 font-bold text-blue-800">
                قلم آماده‌ای برای این مشتری نیست
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-teal-600 text-white">
                    <tr>
                      <th className="p-2">انتخاب</th>
                      <th className="p-2">ش سفارش</th>
                      <th className="p-2">کالا</th>
                      <th className="p-2">ابعاد</th>
                      <th className="p-2">تعداد</th>
                      <th className="p-2">متراژ</th>
                      <th className="p-2">خدمات</th>
                      <th className="p-2">بارکد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayItems.map((it) => (
                      <tr
                        key={it.productionItemId}
                        className="border-b border-teal-100 hover:bg-teal-50"
                      >
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={selected.includes(it.productionItemId)}
                            onChange={() => toggleOne(it.productionItemId)}
                          />
                        </td>
                        <td className="p-2 text-center font-bold">
                          {it.orderNumber}
                        </td>
                        <td className="p-2 font-bold">{it.productName}</td>
                        <td className="p-2 text-center">
                          {it.length ?? "—"}×{it.width ?? "—"}
                        </td>
                        <td className="p-2 text-center">{it.quantity}</td>
                        <td className="p-2 text-center">
                          {it.meterage != null
                            ? Number(it.meterage).toFixed(3)
                            : "—"}
                        </td>
                        <td className="p-2 text-xs">{it.servicesText || "—"}</td>
                        <td className="p-2 text-center font-mono text-xs">
                          {it.barcode || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* اسکن بارگیری اپراتور */}
        <div className="mb-4 rounded-2xl bg-white/90 border border-teal-200 p-4 shadow">
          <h2 className="font-black text-blue-950 mb-2">
            اسکن بارگیری (اپراتور)
          </h2>
          <div className="flex gap-2">
            <input
              ref={scanRef}
              value={scanCode}
              onChange={(e) => setScanCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  doLoadScan()
                }
              }}
              placeholder="بارکد را اسکن کنید..."
              className="flex-1 rounded-xl border-2 border-teal-500 px-4 py-3 font-bold"
            />
            <button
              type="button"
              onClick={doLoadScan}
              className="rounded-xl bg-teal-600 text-white px-5 py-3 font-bold"
            >
              ثبت بارگیری
            </button>
          </div>
          {scanMsg && (
            <p
              className={`mt-2 text-sm font-bold ${
                scanMsg.type === "ok" ? "text-green-700" : "text-red-700"
              }`}
            >
              {scanMsg.text}
            </p>
          )}
        </div>

        {/* تاریخچه کوتاه */}
        <div className="mb-8 rounded-2xl bg-white/90 border border-teal-200 p-4 shadow">
          <h2 className="font-black text-blue-950 mb-2">آخرین برگه‌های خروج</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-teal-100">
                <tr>
                  <th className="p-2">شماره</th>
                  <th className="p-2">مشتری</th>
                  <th className="p-2">تاریخ</th>
                  <th className="p-2">اقلام</th>
                  <th className="p-2">چاپ</th>
                  <th className="p-2">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 20).map((h) => (
                  <tr key={h.id} className="border-b">
                    <td className="p-2 font-bold text-teal-800">
                      {h.exitNumber}
                    </td>
                    <td className="p-2">{h.customerName}</td>
                    <td className="p-2 text-center">{formatFa(h.exitDate)}</td>
                    <td className="p-2 text-center">{h.items?.length || 0}</td>
                    <td className="p-2 text-center">{h.printCount}</td>
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        className="text-teal-700 font-bold underline"
                        onClick={() => {
                          setCurrentSlip(h)
                          setShowPrint(true)
                        }}
                      >
                        مشاهده / چاپ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* پاپ‌آپ راننده */}
      {showDriverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" dir="rtl">
            <h2 className="text-lg font-black text-blue-950 mb-4">
              مشخصات راننده / تحویل‌گیرنده
            </h2>
            <div className="space-y-3">
              <input
                placeholder="نام و نام خانوادگی"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 font-bold"
              />
              <input
                placeholder="کد ملی"
                value={driverNationalId}
                onChange={(e) => setDriverNationalId(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 font-bold"
              />
              <input
                placeholder="شماره تلفن"
                value={driverPhone}
                onChange={(e) => setDriverPhone(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 font-bold"
              />
              <input
                placeholder="نام ماشین"
                value={vehicleName}
                onChange={(e) => setVehicleName(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 font-bold"
              />
              <input
                placeholder="شماره پلاک"
                value={plateNumber}
                onChange={(e) => setPlateNumber(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 font-bold"
              />
              <textarea
                placeholder="توضیحات (اختیاری)"
                value={slipNotes}
                onChange={(e) => setSlipNotes(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 font-bold"
                rows={2}
              />
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowDriverModal(false)}
                className="rounded-xl border px-4 py-2 font-bold"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={createSlip}
                disabled={saving}
                className="rounded-xl bg-green-600 text-white px-4 py-2 font-bold disabled:opacity-50"
              >
                {saving ? "..." : "ثبت و نمایش برگه"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* پیش‌نمایش چاپ */}
      {showPrint && currentSlip && (
        <div className="fixed inset-0 z-40 overflow-auto bg-black/40 p-4 print:static print:bg-white print:p-0 print:inset-auto">
          <div className="mx-auto max-w-[210mm] bg-white shadow-xl print:shadow-none">
            <div className="flex gap-2 p-3 print:hidden border-b">
              <button
                type="button"
                onClick={markPrinted}
                className="rounded-xl bg-teal-600 text-white px-4 py-2 font-bold"
              >
                چاپ (ثبت شمارش)
              </button>
              <button
                type="button"
                onClick={exportExcel}
                className="rounded-xl border border-teal-500 px-4 py-2 font-bold text-teal-800"
              >
                خروجی اکسل
              </button>
              <span className="px-3 py-2 text-sm font-bold text-blue-800">
                تعداد چاپ: {currentSlip.printCount}
              </span>
              <button
                type="button"
                onClick={() => setShowPrint(false)}
                className="mr-auto rounded-xl border px-4 py-2 font-bold"
              >
                بستن
              </button>
            </div>

            {/* محتوای برگه خروج */}
            <div className="p-6 text-black" dir="rtl" id="exit-print-area">
              <div className="text-center mb-4">
                <h1 className="text-xl font-black">فرم خروج کالا</h1>
                <h2 className="text-lg font-bold">شیشه و آینه اخوان</h2>
              </div>
              <div className="flex flex-wrap justify-between text-sm mb-3 gap-2">
                <span>
                  نام مشتری: <strong>{currentSlip.customerName}</strong>
                </span>
                <span>
                  شماره خروجی: <strong>{currentSlip.exitNumber}</strong>
                </span>
                <span>
                  تاریخ: <strong>{formatFa(currentSlip.exitDate)}</strong>
                </span>
                {currentSlip.customerPhone && (
                  <span>
                    تلفن: <strong>{currentSlip.customerPhone}</strong>
                  </span>
                )}
              </div>

              <table className="w-full border-collapse border border-black text-xs">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-black p-1">ردیف</th>
                    <th className="border border-black p-1">ش سفارش</th>
                    <th className="border border-black p-1">نام کالا</th>
                    <th className="border border-black p-1">طول</th>
                    <th className="border border-black p-1">عرض</th>
                    <th className="border border-black p-1">تعداد</th>
                    <th className="border border-black p-1">متراژ</th>
                    <th className="border border-black p-1">کد نصب</th>
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
                        {it.orderNumber || "—"}
                      </td>
                      <td className="border border-black p-1">
                        {it.productName}
                      </td>
                      <td className="border border-black p-1 text-center">
                        {it.length ?? "—"}
                      </td>
                      <td className="border border-black p-1 text-center">
                        {it.width ?? "—"}
                      </td>
                      <td className="border border-black p-1 text-center">
                        {it.quantity}
                      </td>
                      <td className="border border-black p-1 text-center">
                        {it.meterage != null
                          ? Number(it.meterage).toFixed(4)
                          : "—"}
                      </td>
                      <td className="border border-black p-1 text-center">
                        {it.installationCode || ""}
                      </td>
                      <td className="border border-black p-1">
                        {it.servicesText || ""}
                      </td>
                      <td className="border border-black p-1">
                        {it.notes || ""}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-bold bg-gray-50">
                    <td className="border border-black p-1" colSpan={5}>
                      جمع
                    </td>
                    <td className="border border-black p-1 text-center">
                      {totals.qty}
                    </td>
                    <td className="border border-black p-1 text-center">
                      {totals.meterage.toFixed(4)}
                    </td>
                    <td className="border border-black p-1" colSpan={3}></td>
                  </tr>
                </tbody>
              </table>

              <p className="mt-4 text-sm leading-7">
                اجناس فوق سالم و شمارش‌شده تحویل اینجانب گردید و تا تسویه نهایی
                به‌صورت امانی نزد اینجانب می‌باشد.
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <p>
                  راننده / تحویل‌گیرنده:{" "}
                  <strong>{currentSlip.driverName || "—"}</strong>
                </p>
                <p>
                  کد ملی:{" "}
                  <strong>{currentSlip.driverNationalId || "—"}</strong>
                </p>
                <p>
                  تلفن: <strong>{currentSlip.driverPhone || "—"}</strong>
                </p>
                <p>
                  ماشین: <strong>{currentSlip.vehicleName || "—"}</strong>
                </p>
                <p>
                  پلاک: <strong>{currentSlip.plateNumber || "—"}</strong>
                </p>
              </div>

              <div className="mt-10 grid grid-cols-3 gap-4 text-sm text-center">
                <div>
                  <p className="font-bold mb-8">مسئول بارگیری</p>
                  <p>امضا: ............</p>
                </div>
                <div>
                  <p className="font-bold mb-8">تحویل‌گیرنده</p>
                  <p>امضا: ............</p>
                </div>
                <div>
                  <p className="font-bold mb-8">شماره ماشین</p>
                  <p>{currentSlip.plateNumber || "............"}</p>
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