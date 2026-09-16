"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import customersSeedRaw from "../customers/customers-seed.json"
// ⚠️ مسیر بالا را با توجه به محل واقعی این فایل نسبت به app/customers/customers-seed.json تنظیم کنید

type BoxType = "diamond" | "miter"
type FaceKey = "top" | "bottom" | "left" | "right" | "back" | "front"

interface Dimensions {
  length: number
  width: number
  height: number
}

type Part = {
  id: string
  name: string
  face: FaceKey | "shelf"
  lengthCm: number
  widthCm: number
  qty: number
  edgeNote: string
  areaM2: number
}

const faceLabels: Record<FaceKey, string> = {
  top: "سقف",
  bottom: "کف",
  left: "دیواره چپ",
  right: "دیواره راست",
  back: "شیشه پشت",
  front: "شیشه جلو",
}

// لیست مشتریان — دقیقاً همان منطق فایل ثبت سفارش، برای اتصال به همان فایل مشتریان
const customersList = (customersSeedRaw as any[]).map((c: any) => {
  let name = ""

  if (c.customerType === "حقوقی") {
    name = (c.companyName || "").trim()
    if (!name) name = `${c.lastName || ""} ${c.firstName || ""}`.trim()
  } else {
    name = `${c.lastName || ""} ${c.firstName || ""}`.trim()
    if (!name) name = (c.companyName || "").trim()
  }

  if (!name) {
    name = c.companyName || c.lastName || c.firstName || c.code || "بدون نام"
  }

  return {
    id: c.id,
    code: c.code || "",
    name: name,
    group: c.group || "همکار",
  }
})

function round1(n: number) {
  return Math.round(n * 10) / 10
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000
}

function edgeDesc(
  face: FaceKey | "shelf",
  faces: Record<FaceKey, boolean>,
  mode: "diamond" | "miter"
): string {
  if (mode === "diamond") return "دیاموند"

  let miterLen = 0
  let miterWid = 0
  let diaLen = 0
  let diaWid = 0

  const joint = (cond: boolean, isLen: boolean) => {
    if (cond) {
      if (isLen) miterLen++
      else miterWid++
    } else {
      if (isLen) diaLen++
      else diaWid++
    }
  }

  if (face === "top" || face === "bottom" || face === "shelf") {
    joint(!!faces.back, true)
    joint(!!faces.front, true)
    joint(!!faces.left, false)
    joint(!!faces.right, false)
  } else if (face === "back" || face === "front") {
    joint(!!faces.top, true)
    joint(!!faces.bottom, true)
    joint(!!faces.left, false)
    joint(!!faces.right, false)
  } else {
    joint(!!faces.top, true)
    joint(!!faces.bottom, true)
    joint(!!faces.back, false)
    joint(!!faces.front, false)
  }

  const parts: string[] = []
  const push = (n: number, kind: string, label: string) => {
    if (n <= 0) return
    if (n === 1) parts.push(`یک ${kind} ${label}`)
    else if (n === 2) parts.push(`دو ${kind} ${label}`)
    else parts.push(`${n} ${kind} ${label}`)
  }

  push(miterLen, "طول", "فارسی‌بر")
  push(miterWid, "عرض", "فارسی‌بر")
  push(diaLen, "طول", "دیاموند")
  push(diaWid, "عرض", "دیاموند")

  return parts.length ? parts.join(" + ") : "دیاموند"
}

function buildParts(
  boxType: BoxType,
  thicknessMm: number,
  dim: Dimensions,
  faces: Record<FaceKey, boolean>,
  shelfCount: number
): { parts: Part[]; uvM: number } {
  const L = dim.length
  const W = dim.width
  const H = dim.height
  const t = thicknessMm / 10
  const miter = 0.2 // 2mm

  const parts: Part[] = []
  const mode = boxType === "diamond" ? "diamond" : "miter"

  const add = (
    face: FaceKey | "shelf",
    name: string,
    a: number,
    b: number,
    qty: number
  ) => {
    if (a <= 0 || b <= 0 || qty <= 0) return
    const lengthCm = round1(Math.max(a, b))
    const widthCm = round1(Math.min(a, b))
    parts.push({
      id: `${face}-${parts.length}`,
      name,
      face,
      lengthCm,
      widthCm,
      qty,
      edgeNote: edgeDesc(face, faces, mode),
      areaM2: round3(((a * b) / 10000) * qty),
    })
  }

  if (boxType === "diamond") {
    if (faces.top) add("top", "سقف", L, W, 1)
    if (faces.bottom) add("bottom", "کف", L, W, 1)
    if (faces.back) add("back", "شیشه پشت", L, H - t, 1)
    if (faces.front) add("front", "شیشه جلو", L, H - t, 1)
    if (faces.left) add("left", "دیواره چپ", W - t, H - t, 1)
    if (faces.right) add("right", "دیواره راست", W - t, H - t, 1)
    for (let i = 0; i < shelfCount; i++) {
      add("shelf", `طبقه ${i + 1}`, L - t, W - t, 1)
    }
  } else {
    // فارسی‌بر: فقط از طول سقف و پشت/جلو ۲ میل کم می‌شود؛ عرض ثابت
    if (faces.top) add("top", "سقف", L - miter, W, 1)
    if (faces.bottom) add("bottom", "کف", L, W, 1)
    if (faces.back) add("back", "شیشه پشت", L - miter, H, 1)
    if (faces.front) add("front", "شیشه جلو", L - miter, H, 1)
    if (faces.left) add("left", "دیواره چپ", W, H, 1)
    if (faces.right) add("right", "دیواره راست", W, H, 1)
    for (let i = 0; i < shelfCount; i++) {
      add("shelf", `طبقه ${i + 1}`, L - miter, W, 1)
    }
  }

  let uvCm = 0
  if (faces.top) {
    if (faces.back) uvCm += L
    if (faces.front) uvCm += L
    if (faces.left) uvCm += W
    if (faces.right) uvCm += W
  }
  if (faces.bottom) {
    if (faces.back) uvCm += L
    if (faces.front) uvCm += L
    if (faces.left) uvCm += W
    if (faces.right) uvCm += W
  }
  if (faces.back) {
    if (faces.left) uvCm += H
    if (faces.right) uvCm += H
  }
  if (faces.front) {
    if (faces.left) uvCm += H
    if (faces.right) uvCm += H
  }
  if (shelfCount > 0) {
    let shelfPerim = 0
    if (faces.back) shelfPerim += L
    if (faces.front) shelfPerim += L
    if (faces.left) shelfPerim += W
    if (faces.right) shelfPerim += W
    uvCm += shelfPerim * shelfCount
  }

  return { parts, uvM: round3(uvCm / 100) }
}

function BoxSchematic({
  faces,
  length,
  width,
  height,
}: {
  faces: Record<FaceKey, boolean>
  length: number
  width: number
  height: number
}) {
  const x0 = 70
  const y0 = 150
  const lx = 140
  const wy = 55
  const hz = 70

  const A = { x: x0, y: y0 }
  const B = { x: x0 + lx, y: y0 }
  const C = { x: x0 + lx + wy, y: y0 - wy * 0.6 }
  const D = { x: x0 + wy, y: y0 - wy * 0.6 }
  const At = { x: A.x, y: A.y - hz }
  const Bt = { x: B.x, y: B.y - hz }
  const Ct = { x: C.x, y: C.y - hz }
  const Dt = { x: D.x, y: D.y - hz }

  const poly = (pts: { x: number; y: number }[], fill: string) => (
    <polygon
      points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
      fill={fill}
      stroke="#111"
      strokeWidth="1.6"
    />
  )

  return (
    <svg viewBox="0 0 340 220" className="w-full h-auto max-w-md mx-auto">
      {faces.bottom && poly([A, B, C, D], "#9ca3af")}
      {faces.back && poly([D, C, Ct, Dt], "#6b7280")}
      {faces.left && poly([A, D, Dt, At], "#7b8494")}
      {faces.right && poly([B, C, Ct, Bt], "#c5cad3")}
      {faces.front && poly([A, B, Bt, At], "#aeb4bf")}
      {faces.top && poly([At, Bt, Ct, Dt], "#d1d5db")}

      {!faces.top &&
        !faces.bottom &&
        !faces.left &&
        !faces.right &&
        !faces.back &&
        !faces.front && (
          <text x="170" y="110" textAnchor="middle" fontSize="14" fill="#666">
            وجهی انتخاب نشده
          </text>
        )}

      <line x1={A.x} y1={A.y + 18} x2={B.x} y2={B.y + 18} stroke="#111" strokeWidth="1" />
      <text x={(A.x + B.x) / 2} y={A.y + 34} textAnchor="middle" fontSize="13" fontWeight="700">
        {length || "—"}
      </text>

      <line x1={B.x + 12} y1={B.y} x2={C.x + 12} y2={C.y} stroke="#111" strokeWidth="1" />
      <text x={C.x + 28} y={(B.y + C.y) / 2} fontSize="13" fontWeight="700">
        {width || "—"}
      </text>

      <line x1={A.x - 16} y1={A.y} x2={At.x - 16} y2={At.y} stroke="#111" strokeWidth="1" />
      <text x={A.x - 28} y={(A.y + At.y) / 2} fontSize="13" fontWeight="700">
        {height || "—"}
      </text>
    </svg>
  )
}

export default function BoxDesignPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [customerName, setCustomerName] = useState("")
  const [customerSearch, setCustomerSearch] = useState("")
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [boxType, setBoxType] = useState<BoxType>("diamond")
  const [thickness, setThickness] = useState(10)
  const [glassName, setGlassName] = useState("شیشه سفید")
  const [qty, setQty] = useState(1)
  const [dimensions, setDimensions] = useState<Dimensions>({
    length: 0,
    width: 0,
    height: 0,
  })
  const [faces, setFaces] = useState<Record<FaceKey, boolean>>({
    top: true,
    bottom: false,
    left: true,
    right: true,
    back: true,
    front: false,
  })
  const [shelfCount, setShelfCount] = useState(0)

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase()
    if (!q) return customersList.slice(0, 8)
    return customersList
      .filter((c) => c.name.toLowerCase().includes(q) || c.code.includes(q))
      .slice(0, 12)
  }, [customerSearch])

  const selectCustomer = (c: { name: string }) => {
    setCustomerName(c.name)
    setCustomerSearch(c.name)
    setShowCustomerDropdown(false)
  }

  const nextStep = () => setStep((s) => Math.min(s + 1, 4))
  const prevStep = () => setStep((s) => Math.max(s - 1, 1))

  const result = useMemo(() => {
    if (!dimensions.length || !dimensions.width || !dimensions.height) {
      return { parts: [] as Part[], uvM: 0, totalArea: 0 }
    }
    const built = buildParts(boxType, thickness, dimensions, faces, shelfCount)
    const totalArea = round3(
      built.parts.reduce((s, p) => s + p.areaM2, 0) * qty
    )
    return { ...built, totalArea }
  }, [boxType, thickness, dimensions, faces, shelfCount, qty])

  const canNext =
    step === 1
      ? customerName.trim().length > 0
      : step === 2
        ? dimensions.length > 0 && dimensions.width > 0 && dimensions.height > 0
        : true

  const sendToPreInvoice = () => {
    if (!customerName.trim()) {
      alert("لطفاً نام مشتری را وارد کنید")
      return
    }
    if (result.parts.length === 0) {
      alert("هیچ قطعه‌ای محاسبه نشده است")
      return
    }
    const transferItems = result.parts.map((p) => ({
      productName: `${glassName} ${thickness} میل - ${p.name}`,
      installCode: "",
      unit: "مترمربع",
      length: String(p.lengthCm),
      width: String(p.widthCm),
      quantity: String(p.qty * qty),
      meterage: (p.areaM2 * qty).toFixed(4),
      perimeter: "",
      description: p.edgeNote,
    }))
    localStorage.setItem(
      "boxDesignTransfer",
      JSON.stringify({ customerName, items: transferItems })
    )
    router.push("/order/new?fromBoxDesign=1")
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
      <link
        href="https://cdn.jsdelivr.net/npm/vazirmatn@33.003/Vazirmatn-font-face.css"
        rel="stylesheet"
      />
      <div className="pointer-events-none fixed inset-0 bg-black/5" />

      <div className="relative z-10 max-w-5xl mx-auto">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/20">
          <div>
            <h1 className="text-2xl font-bold text-blue-950">طراحی باکس</h1>
            <p className="text-sm text-blue-800 mt-1">
              محاسبه قطعات برش دیاموند / فارسی‌بر + متراژ UV
            </p>
          </div>
          <Link
            href="/"
            className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-4 py-2.5 text-blue-900 font-bold"
          >
            بازگشت
          </Link>
        </div>

        <div className="mb-4 flex items-center justify-between rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-4 border border-teal-500/20">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center flex-1">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                  step >= s ? "bg-teal-600 text-white" : "bg-white/50 text-gray-500"
                }`}
              >
                {s}
              </div>
              {s < 4 && (
                <div
                  className={`flex-1 h-1 mx-2 ${
                    step > s ? "bg-teal-600" : "bg-white/40"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-6 shadow-lg border border-teal-500/20">
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-blue-950">اطلاعات کلی</h2>
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <label className="block text-sm font-bold mb-1 text-blue-900">
                  نام مشتری
                </label>
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value)
                    setCustomerName(e.target.value)
                    setShowCustomerDropdown(true)
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
                  className="w-full rounded-xl border border-teal-500/30 bg-white/70 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500 font-semibold"
                  placeholder="جستجوی مشتری..."
                  autoComplete="off"
                />
                {showCustomerDropdown && filteredCustomers.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-teal-200 bg-white shadow-2xl">
                    {filteredCustomers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => selectCustomer(c)}
                        className="w-full text-right px-3 py-2 text-sm font-bold text-blue-900 hover:bg-yellow-100 border-b border-teal-50"
                      >
                        <span className="text-teal-700 font-mono text-xs ml-2">{c.code}</span>
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-xs text-blue-700 mt-1">
                  {customersList.length ? `${customersList.length} مشتری در سیستم` : ""}
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold mb-2 text-blue-900">
                  نوع اتصال / لبه
                </label>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold">
                    <input
                      type="radio"
                      checked={boxType === "diamond"}
                      onChange={() => setBoxType("diamond")}
                    />
                    دیاموند
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-semibold">
                    <input
                      type="radio"
                      checked={boxType === "miter"}
                      onChange={() => setBoxType("miter")}
                    />
                    فارسی‌بر (۴۵ درجه)
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-1 text-blue-900">
                    ضخامت (میل)
                  </label>
                  <select
                    value={thickness}
                    onChange={(e) => setThickness(Number(e.target.value))}
                    className="w-full rounded-xl border border-teal-500/30 bg-white/70 px-3 py-2.5"
                  >
                    {[6, 8, 10, 12, 15, 19].map((t) => (
                      <option key={t} value={t}>
                        {t} میل
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1 text-blue-900">
                    نوع شیشه
                  </label>
                  <input
                    type="text"
                    value={glassName}
                    onChange={(e) => setGlassName(e.target.value)}
                    className="w-full rounded-xl border border-teal-500/30 bg-white/70 px-3 py-2.5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1 text-blue-900">
                    تعداد
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={qty}
                    onChange={(e) => setQty(Number(e.target.value) || 1)}
                    className="w-full rounded-xl border border-teal-500/30 bg-white/70 px-3 py-2.5"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-blue-950">
                ابعاد تمام‌شده (سانتی‌متر)
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(
                  [
                    ["length", "طول"],
                    ["width", "عرض"],
                    ["height", "ارتفاع"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label className="block text-sm font-bold mb-1 text-blue-900">
                      {label}
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={dimensions[key] || ""}
                      onChange={(e) =>
                        setDimensions({
                          ...dimensions,
                          [key]: Number(e.target.value),
                        })
                      }
                      className="w-full rounded-xl border border-teal-500/30 bg-white/70 px-3 py-2.5"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-blue-950">وجه‌های باکس</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {(Object.keys(faces) as FaceKey[]).map((key) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 p-3 rounded-xl border border-teal-500/30 bg-white/50 cursor-pointer hover:bg-white/80"
                  >
                    <input
                      type="checkbox"
                      checked={faces[key]}
                      onChange={(e) =>
                        setFaces({ ...faces, [key]: e.target.checked })
                      }
                    />
                    <span className="font-semibold">{faceLabels[key]}</span>
                  </label>
                ))}
              </div>
              <div>
                <label className="block text-sm font-bold mb-1 text-blue-900">
                  تعداد طبقه
                </label>
                <input
                  type="number"
                  min={0}
                  max={8}
                  value={shelfCount}
                  onChange={(e) => setShelfCount(Number(e.target.value) || 0)}
                  className="w-32 rounded-xl border border-teal-500/30 bg-white/70 px-3 py-2.5"
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-blue-950">نتیجه طراحی</h2>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-xl border border-teal-500/30 bg-white/70 p-4 min-h-[240px] flex items-center justify-center">
                  <BoxSchematic
                    faces={faces}
                    length={dimensions.length}
                    width={dimensions.width}
                    height={dimensions.height}
                  />
                </div>

                <div className="rounded-xl border border-teal-500/30 bg-white/70 p-4 text-sm space-y-1 text-right">
                  <p className="font-black text-base text-blue-950">
                    {customerName || "—"}
                  </p>
                  <p className="font-bold">
                    {boxType === "diamond" ? "دیاموند" : "فارسی‌بر"}
                  </p>
                  <p>{qty} عدد</p>
                  <p>
                    {glassName} {thickness} میل
                  </p>
                  <p className="mt-3 font-bold">
                    ابعاد تمام‌شده: {dimensions.length} × {dimensions.width} ×{" "}
                    {dimensions.height} cm
                  </p>
                  <p className="text-teal-800 font-black mt-2">
                    UV = {result.uvM} m
                  </p>
                  <p className="font-bold">متراژ شیشه: {result.totalArea} m²</p>
                </div>
              </div>

              <div className="rounded-xl overflow-hidden border border-teal-500/30">
                <div className="bg-teal-600 text-white px-4 py-2 font-bold">
                  لیست قطعات برش
                </div>
                <table className="w-full text-sm bg-white/80">
                  <thead>
                    <tr className="bg-gray-100 text-right">
                      <th className="p-2">#</th>
                      <th className="p-2">نام قطعه</th>
                      <th className="p-2 text-center">ابعاد (cm)</th>
                      <th className="p-2 text-center">تعداد</th>
                      <th className="p-2">توضیح لبه</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.parts.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-gray-500">
                          قطعه‌ای محاسبه نشد
                        </td>
                      </tr>
                    ) : (
                      result.parts.map((p, i) => (
                        <tr key={p.id} className="border-t">
                          <td className="p-2">{i + 1}</td>
                          <td className="p-2 font-bold">{p.name}</td>
                          <td className="p-2 text-center font-black">
                            {p.lengthCm} * {p.widthCm}
                          </td>
                          <td className="p-2 text-center">{p.qty * qty}</td>
                          <td className="p-2 text-xs font-semibold">{p.edgeNote}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm font-semibold space-y-1">
                <p className="font-black mb-2">خلاصه برای برش / لیبل:</p>
                {result.parts.map((p) => (
                  <p key={p.id}>
                    {p.lengthCm}*{p.widthCm}={p.qty * qty} {p.edgeNote}
                    {` — ${p.name}`}
                  </p>
                ))}
                <p className="mt-2 text-teal-800">uv={result.uvM}m</p>
              </div>
            </div>
          )}

          <div className="flex justify-between mt-8 pt-6 border-t border-teal-500/20">
            <button
              onClick={prevStep}
              disabled={step === 1}
              className="px-5 py-2.5 rounded-xl border border-gray-300 bg-white/70 font-bold disabled:opacity-40"
            >
              قبلی
            </button>
            {step < 4 ? (
              <button
                onClick={nextStep}
                disabled={!canNext}
                className="px-5 py-2.5 rounded-xl bg-teal-600 text-white font-bold hover:bg-teal-700 disabled:opacity-40"
              >
                بعدی
              </button>
            ) : (
              <button
                className="px-5 py-2.5 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700"
                onClick={sendToPreInvoice}
              >
                ارسال به پیش‌فاکتور
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
