"use client"

import { useEffect, useMemo, useState, useRef, KeyboardEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import customersSeedRaw from "../customers/customers-seed.json"
// ⚠️ مسیر بالا را با توجه به محل واقعی فایل تنظیم کنید

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
  face: FaceKey | "shelf" | "door"
  lengthCm: number
  widthCm: number
  qty: number
  edgeNote: string
  areaM2: number
  thickness?: number
  boxIndex?: number
}

interface BoxConfig {
  id: string
  label: string
  boxType: BoxType
  thickness: number
  glassName: string
  dimensions: Dimensions
  faces: Record<FaceKey, boolean>
  shelfCount: number
  shelfWidthCm: number | null
  useCustomShelfOffset: boolean
  shelfOffsetFromTop: number
  hasSlidingDoors: boolean
  doorThickness: number
  qty: number
}

const faceLabels: Record<FaceKey, string> = {
  top: "سقف",
  bottom: "کف",
  left: "دیواره چپ",
  right: "دیواره راست",
  back: "شیشه پشت",
  front: "شیشه جلو",
}

const glassOptions = [
  "شیشه سفید",
  "شیشه دودی",
  "شیشه برنز",
  "شیشه ساتینا",
  "آینه ساده سوپر کلیر",
  "آینه دودی",
  "آینه برنز",
]

const customersList = (customersSeedRaw as any[]).map((c: any) => {
  let name = ""
  if (c.customerType === "حقوقی") {
    name = (c.companyName || "").trim()
    if (!name) name = `${c.lastName || ""} ${c.firstName || ""}`.trim()
  } else {
    name = `${c.lastName || ""} ${c.firstName || ""}`.trim()
    if (!name) name = (c.companyName || "").trim()
  }
  if (!name) name = c.companyName || c.lastName || c.firstName || c.code || "بدون نام"
  return { id: c.id, code: c.code || "", name, group: c.group || "همکار" }
})

function round1(n: number) {
  return Math.round(n * 10) / 10
}
function round3(n: number) {
  return Math.round(n * 1000) / 1000
}

function edgeDesc(
  face: FaceKey | "shelf" | "door",
  faces: Record<FaceKey, boolean>,
  mode: "diamond" | "miter"
): string {
  if (face === "shelf" || face === "door") return "دیاموند"
  if (mode === "diamond") return "دیاموند"

  let miterLen = 0, miterWid = 0, diaLen = 0, diaWid = 0
  const joint = (cond: boolean, isLen: boolean) => {
    if (cond) (isLen ? miterLen++ : miterWid++)
    else (isLen ? diaLen++ : diaWid++)
  }

  if (face === "top" || face === "bottom") {
    joint(!!faces.back, true); joint(!!faces.front, true)
    joint(!!faces.left, false); joint(!!faces.right, false)
  } else if (face === "back" || face === "front") {
    joint(!!faces.top, true); joint(!!faces.bottom, true)
    joint(!!faces.left, false); joint(!!faces.right, false)
  } else {
    joint(!!faces.top, true); joint(!!faces.bottom, true)
    joint(!!faces.back, false); joint(!!faces.front, false)
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

function buildPartsForOne(cfg: BoxConfig, boxIndex: number): { parts: Part[]; uvM: number } {
  const { boxType, thickness, dimensions: dim, faces, shelfCount, shelfWidthCm, hasSlidingDoors, doorThickness } = cfg
  const L = dim.length, W = dim.width, H = dim.height
  const t = thickness / 10
  const miter = 0.2
  const shelfRecess = hasSlidingDoors ? 3 : 0

  const parts: Part[] = []
  const mode = boxType === "diamond" ? "diamond" : "miter"

  const add = (face: FaceKey | "shelf" | "door", name: string, a: number, b: number, qty: number, thick?: number) => {
    if (a <= 0 || b <= 0 || qty <= 0) return
    const lengthCm = round1(Math.max(a, b))
    const widthCm = round1(Math.min(a, b))
    parts.push({
      id: `${boxIndex}-${face}-${parts.length}`,
      name: boxIndex > 0 ? `باکس ${boxIndex + 1} - ${name}` : name,
      face,
      lengthCm,
      widthCm,
      qty,
      edgeNote: edgeDesc(face, faces, mode),
      areaM2: round3(((a * b) / 10000) * qty),
      thickness: thick,
      boxIndex,
    })
  }

  const topT = faces.top ? t : 0
  const bottomT = faces.bottom ? t : 0
  const leftT = faces.left ? t : 0
  const rightT = faces.right ? t : 0
  const backT = faces.back ? t : 0
  const frontT = faces.front ? t : 0

  if (boxType === "diamond") {
    if (faces.top) add("top", "سقف", L, W, 1)
    if (faces.bottom) add("bottom", "کف", L, W, 1)
    const sideH = H - topT - bottomT
    if (faces.back) add("back", "شیشه پشت", L, sideH, 1)
    if (faces.front) add("front", "شیشه جلو", L, sideH, 1)
    const sideW = W - backT - frontT
    if (faces.left) add("left", "دیواره چپ", sideW, sideH, 1)
    if (faces.right) add("right", "دیواره راست", sideW, sideH, 1)

    const shelfL = L - leftT - rightT
    const shelfW = (shelfWidthCm ?? (W - backT - frontT)) - shelfRecess
    for (let i = 0; i < shelfCount; i++) {
      add("shelf", `طبقه ${i + 1}`, shelfL, Math.max(shelfW, 1), 1)
    }
  } else {
    if (faces.top) add("top", "سقف", L - miter, W, 1)
    if (faces.bottom) add("bottom", "کف", L, W, 1)
    if (faces.back) add("back", "شیشه پشت", L - miter, H, 1)
    if (faces.front) add("front", "شیشه جلو", L - miter, H, 1)
    if (faces.left) add("left", "دیواره چپ", W, H, 1)
    if (faces.right) add("right", "دیواره راست", W, H, 1)

    const shelfL = L - miter - leftT - rightT
    const shelfW = (shelfWidthCm ?? W) - shelfRecess
    for (let i = 0; i < shelfCount; i++) {
      add("shelf", `طبقه ${i + 1}`, shelfL, Math.max(shelfW, 1), 1)
    }
  }

  if (hasSlidingDoors) {
    const doorH = H - topT - bottomT
    const doorW = L / 2 + 1
    add("door", "درب ریلی چپ", doorW, doorH, 1, doorThickness)
    add("door", "درب ریلی راست", doorW, doorH, 1, doorThickness)
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
  shelfCount,
  shelfOffsetFromTop,
  hasSlidingDoors,
  boxType,
  label,
}: {
  faces: Record<FaceKey, boolean>
  length: number
  width: number
  height: number
  shelfCount: number
  shelfOffsetFromTop: number | null
  hasSlidingDoors: boolean
  boxType: BoxType
  label?: string
}) {
  const x0 = 55
  const y0 = 160
  const lx = 145
  const wy = 52
  const hz = 95

  const A = { x: x0, y: y0 }
  const B = { x: x0 + lx, y: y0 }
  const C = { x: x0 + lx + wy, y: y0 - wy * 0.55 }
  const D = { x: x0 + wy, y: y0 - wy * 0.55 }
  const At = { x: A.x, y: A.y - hz }
  const Bt = { x: B.x, y: B.y - hz }
  const Ct = { x: C.x, y: C.y - hz }
  const Dt = { x: D.x, y: D.y - hz }

  const poly = (pts: { x: number; y: number }[], fill: string, opacity = 1) => (
    <polygon
      points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
      fill={fill}
      stroke="#111"
      strokeWidth="1.4"
      opacity={opacity}
    />
  )

  // موقعیت Y طبقات
  const shelvesY: number[] = []
  if (shelfCount > 0 && height > 0) {
    const topMargin = 10
    const bottomMargin = 10
    const usable = hz - topMargin - bottomMargin

    if (shelfOffsetFromTop != null && shelfOffsetFromTop > 0) {
      const firstRatio = Math.min(shelfOffsetFromTop / height, 0.75)
      const firstY = At.y + topMargin + firstRatio * usable
      const remaining = usable - (firstY - At.y - topMargin)
      const step = remaining / Math.max(shelfCount, 1)
      for (let i = 0; i < shelfCount; i++) {
        shelvesY.push(firstY + step * i)
      }
    } else {
      const step = usable / (shelfCount + 1)
      for (let i = 1; i <= shelfCount; i++) {
        shelvesY.push(At.y + topMargin + step * i)
      }
    }
  }

  // رسم طبقه سه‌بعدی
  const drawShelf = (y: number, key: number) => {
    const thickness = 5 // ضخامت بصری طبقه
    const inset = 4

    // سطح رویی طبقه
    const topFace = [
      { x: A.x + inset, y: y },
      { x: B.x - inset, y: y },
      { x: C.x - inset - 4, y: y - wy * 0.32 },
      { x: D.x + inset, y: y - wy * 0.32 },
    ]

    // سطح جلویی (ضخامت)
    const frontFace = [
      { x: A.x + inset, y: y },
      { x: B.x - inset, y: y },
      { x: B.x - inset, y: y + thickness },
      { x: A.x + inset, y: y + thickness },
    ]

    // سطح کناری راست
    const sideFace = [
      { x: B.x - inset, y: y },
      { x: C.x - inset - 4, y: y - wy * 0.32 },
      { x: C.x - inset - 4, y: y - wy * 0.32 + thickness },
      { x: B.x - inset, y: y + thickness },
    ]

    return (
      <g key={key}>
        {poly(topFace, "#94a3b8", 0.95)}
        {poly(frontFace, "#64748b", 0.9)}
        {poly(sideFace, "#7c8a9a", 0.85)}
      </g>
    )
  }

  return (
    <svg viewBox="0 0 340 240" className="w-full h-auto" style={{ maxWidth: 360 }}>
      {label && (
        <text x="170" y="18" textAnchor="middle" fontSize="13" fontWeight="800" fill="#0f766e">
          {label}
        </text>
      )}

      {faces.bottom && poly([A, B, C, D], "#9ca3af")}
      {faces.back && poly([D, C, Ct, Dt], "#6b7280")}
      {faces.left && poly([A, D, Dt, At], "#7b8494")}
      {faces.right && poly([B, C, Ct, Bt], "#c5cad3")}
      {faces.front && poly([A, B, Bt, At], "#aeb4bf", 0.8)}
      {faces.top && poly([At, Bt, Ct, Dt], "#d1d5db")}

      {/* طبقات سه‌بعدی */}
      {shelvesY.map((y, i) => drawShelf(y, i))}

      {hasSlidingDoors && (
        <>
          <rect x={A.x + 8} y={At.y + 10} width={lx * 0.4} height={hz - 20} fill="#94a3b8" stroke="#1e293b" strokeWidth="1.3" opacity="0.6" />
          <rect x={A.x + lx * 0.5} y={At.y + 10} width={lx * 0.4} height={hz - 20} fill="#94a3b8" stroke="#1e293b" strokeWidth="1.3" opacity="0.6" />
        </>
      )}

      {/* ابعاد */}
      <line x1={A.x} y1={A.y + 16} x2={B.x} y2={B.y + 16} stroke="#111" strokeWidth="1" />
      <text x={(A.x + B.x) / 2} y={A.y + 30} textAnchor="middle" fontSize="12" fontWeight="700">
        {length || "—"}
      </text>
      <line x1={B.x + 10} y1={B.y} x2={C.x + 10} y2={C.y} stroke="#111" strokeWidth="1" />
      <text x={C.x + 24} y={(B.y + C.y) / 2 + 4} fontSize="12" fontWeight="700">
        {width || "—"}
      </text>
      <line x1={A.x - 14} y1={A.y} x2={At.x - 14} y2={At.y} stroke="#111" strokeWidth="1" />
      <text x={A.x - 26} y={(A.y + At.y) / 2} fontSize="12" fontWeight="700">
        {height || "—"}
      </text>

      <text x="170" y="228" textAnchor="middle" fontSize="12" fontWeight="700" fill="#0f766e">
        {boxType === "diamond" ? "اتصال: دیاموند" : "اتصال: فارسی‌بر ۴۵°"}
      </text>
    </svg>
  )
}

function createDefaultBox(label = "باکس ۱"): BoxConfig {
  return {
    id: Math.random().toString(36).slice(2),
    label,
    boxType: "diamond",
    thickness: 10,
    glassName: "شیشه سفید",
    dimensions: { length: 0, width: 0, height: 0 },
    faces: { top: true, bottom: true, left: true, right: true, back: true, front: false },
    shelfCount: 0,
    shelfWidthCm: null,
    useCustomShelfOffset: false,
    shelfOffsetFromTop: 10,
    hasSlidingDoors: false,
    doorThickness: 6,
    qty: 1,
  }
}

export default function BoxDesignPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [customerName, setCustomerName] = useState("")
  const [customerSearch, setCustomerSearch] = useState("")
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)

  const [isUniform, setIsUniform] = useState(true)
  const [boxes, setBoxes] = useState<BoxConfig[]>([createDefaultBox("باکس ۱")])

  const inputRefs = useRef<(HTMLInputElement | HTMLSelectElement | null)[]>([])

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

  const updateBox = (index: number, patch: Partial<BoxConfig>) => {
    setBoxes((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], ...patch }
      return next
    })
  }

  const addBox = () => {
    setBoxes((prev) => [...prev, createDefaultBox(`باکس ${prev.length + 1}`)])
  }

  const removeBox = (index: number) => {
    if (boxes.length <= 1) return
    setBoxes((prev) => prev.filter((_, i) => i !== index))
  }

  const nextStep = () => setStep((s) => Math.min(s + 1, 4))
  const prevStep = () => setStep((s) => Math.max(s - 1, 1))

  const handleKeyDown = (e: KeyboardEvent, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault()
      const next = inputRefs.current[index + 1]
      if (next) next.focus()
      else if (canNext) nextStep()
    }
  }

  const allResults = useMemo(() => {
    return boxes.map((cfg, idx) => {
      if (!cfg.dimensions.length || !cfg.dimensions.width || !cfg.dimensions.height) {
        return { parts: [] as Part[], uvM: 0, totalArea: 0, cfg }
      }
      const built = buildPartsForOne(cfg, isUniform ? 0 : idx)
      const totalArea = round3(built.parts.reduce((s, p) => s + p.areaM2, 0) * cfg.qty)
      return { ...built, totalArea, cfg }
    })
  }, [boxes, isUniform])

  const totalParts = allResults.flatMap((r) =>
    r.parts.map((p) => ({
      ...p,
      qty: p.qty * (r.cfg.qty || 1),
    }))
  )
  const totalUV = allResults.reduce((s, r) => s + r.uvM * (r.cfg.qty || 1), 0)
  const totalArea = allResults.reduce((s, r) => s + r.totalArea, 0)

  const canNext =
    step === 1
      ? customerName.trim().length > 0
      : step === 2
        ? boxes.every((b) => b.dimensions.length > 0 && b.dimensions.width > 0 && b.dimensions.height > 0)
        : true

  const captureAllSchematics = async (): Promise<{ png: string | null; svg: string | null }> => {
    try {
      const svgs = document.querySelectorAll("[data-schematic]")
      if (svgs.length === 0) return { png: null, svg: null }

      const serializer = new XMLSerializer()
      let svgStr = ""

      if (svgs.length === 1) {
        svgStr = serializer.serializeToString(svgs[0])
      } else {
        const width = 360 * svgs.length
        let combined = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="250" viewBox="0 0 ${width} 250">`
        svgs.forEach((s, i) => {
          const content = serializer.serializeToString(s).replace(/<svg[^>]*>/, "").replace("</svg>", "")
          combined += `<g transform="translate(${i * 360},0)">${content}</g>`
        })
        combined += "</svg>"
        svgStr = combined
      }

      const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" })
      const url = URL.createObjectURL(svgBlob)

      return new Promise((resolve) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement("canvas")
          canvas.width = img.width * 2
          canvas.height = img.height * 2
          const ctx = canvas.getContext("2d")
          if (ctx) {
            ctx.fillStyle = "#ffffff"
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
            const png = canvas.toDataURL("image/png", 1.0)
            resolve({
              png,
              svg: "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgStr))),
            })
          } else {
            resolve({ png: null, svg: null })
          }
          URL.revokeObjectURL(url)
        }
        img.onerror = () => {
          URL.revokeObjectURL(url)
          resolve({ png: null, svg: null })
        }
        img.src = url
      })
    } catch {
      return { png: null, svg: null }
    }
  }

  const sendToPreInvoice = async () => {
    if (!customerName.trim()) {
      alert("لطفاً نام مشتری را وارد کنید")
      return
    }
    if (totalParts.length === 0) {
      alert("هیچ قطعه‌ای محاسبه نشده است")
      return
    }

    const { png, svg } = await captureAllSchematics()

    const finalItems = totalParts.map((p) => {
      const cfg = boxes[p.boxIndex ?? 0]
      return {
        productName: `${cfg.glassName} ${cfg.thickness} میل - ${p.name}`,
        installCode: "",
        unit: "مترمربع",
        length: String(p.lengthCm),
        width: String(p.widthCm),
        quantity: String(p.qty),
        meterage: (p.areaM2).toFixed(4),
        perimeter: "",
        description: p.edgeNote,
      }
    })

    localStorage.setItem(
      "boxDesignTransfer",
      JSON.stringify({
        customerName,
        items: finalItems,
        schematicImage: png,
        schematicSvg: svg,
        isUniform,
        boxes: boxes.map((b) => ({
          label: b.label,
          boxType: b.boxType,
          glassName: b.glassName,
          thickness: b.thickness,
          dimensions: b.dimensions,
          qty: b.qty,
        })),
        totalUV: round3(totalUV),
        totalArea: round3(totalArea),
      })
    )

    router.push("/order/new?fromBoxDesign=1")
  }

  const focusClass = "focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:bg-yellow-50 transition"

  return (
    <div
      className="min-h-screen p-4 bg-cover bg-center bg-fixed"
      style={{
        backgroundImage: "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')",
        fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif",
      }}
      dir="rtl"
    >
      <link href="https://cdn.jsdelivr.net/npm/vazirmatn@33.003/Vazirmatn-font-face.css" rel="stylesheet" />
      <div className="pointer-events-none fixed inset-0 bg-black/5" />

      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/20">
          <div>
            <h1 className="text-2xl font-bold text-blue-950">طراحی باکس</h1>
            <p className="text-sm text-blue-800 mt-1">دیاموند / فارسی‌بر + طبقات سه‌بعدی + درب ریلی + چند باکس</p>
          </div>
          <Link href="/" className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-4 py-2.5 text-blue-900 font-bold">
            بازگشت
          </Link>
        </div>

        <div className="mb-4 flex items-center justify-between rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-4 border border-teal-500/20">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center flex-1">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${step >= s ? "bg-teal-600 text-white" : "bg-white/50 text-gray-500"}`}>
                {s}
              </div>
              {s < 4 && <div className={`flex-1 h-1 mx-2 ${step > s ? "bg-teal-600" : "bg-white/40"}`} />}
            </div>
          ))}
        </div>

        <div className="rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-6 shadow-lg border border-teal-500/20">
          {/* مرحله ۱ */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-blue-950">اطلاعات کلی</h2>

              <div className="relative">
                <label className="block text-sm font-bold mb-1 text-blue-900">نام مشتری</label>
                <input
                  ref={(el) => { inputRefs.current[0] = el }}
                  type="text"
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value)
                    setCustomerName(e.target.value)
                    setShowCustomerDropdown(true)
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
                  onKeyDown={(e) => handleKeyDown(e, 0)}
                  className={`w-full rounded-xl border border-teal-500/30 bg-white/70 px-3 py-2.5 font-semibold ${focusClass}`}
                  placeholder="جستجوی مشتری..."
                  autoComplete="off"
                />
                {showCustomerDropdown && filteredCustomers.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-teal-200 bg-white shadow-2xl">
                    {filteredCustomers.map((c) => (
                      <button key={c.id} type="button" onClick={() => selectCustomer(c)} className="w-full text-right px-3 py-2 text-sm font-bold text-blue-900 hover:bg-yellow-100 border-b border-teal-50">
                        <span className="text-teal-700 font-mono text-xs ml-2">{c.code}</span>
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* تعداد در حالت یکسان */}
              {isUniform && (
                <div>
                  <label className="block text-sm font-bold mb-1 text-blue-900">تعداد باکس (یکسان)</label>
                  <input
                    type="number"
                    min={1}
                    value={boxes[0].qty}
                    onChange={(e) => updateBox(0, { qty: Number(e.target.value) || 1 })}
                    className={`w-32 rounded-xl border border-teal-500/30 bg-white/70 px-3 py-2.5 font-bold ${focusClass}`}
                  />
                  <p className="text-xs text-gray-600 mt-1">اگر چند باکس کاملاً یکسان می‌خواهید، اینجا تعداد را وارد کنید.</p>
                </div>
              )}

              <div className="bg-white/60 rounded-xl p-4 border border-teal-200">
                <label className="flex items-center gap-3 cursor-pointer font-bold text-blue-900">
                  <input
                    type="checkbox"
                    checked={!isUniform}
                    onChange={(e) => {
                      const different = e.target.checked
                      setIsUniform(!different)
                      if (!different) {
                        setBoxes([ { ...boxes[0], label: "باکس ۱" } ])
                      }
                    }}
                  />
                  باکس‌ها متفاوت هستند (ابعاد / شیشه / ضخامت جداگانه)
                </label>
                <p className="text-xs text-gray-600 mt-1">
                  اگر تیک نزنید → همه باکس‌ها یکسان هستند و فقط تعداد بالا را تنظیم کنید.
                </p>
              </div>

              {!isUniform && (
                <div className="space-y-3">
                  {boxes.map((b, idx) => (
                    <div key={b.id} className="flex items-center gap-3 bg-white/50 p-3 rounded-xl border border-teal-100">
                      <span className="font-bold text-teal-800 w-24">{b.label}</span>
                      <span className="text-sm">تعداد: {b.qty}</span>
                      <button type="button" onClick={() => removeBox(idx)} disabled={boxes.length <= 1} className="text-red-600 text-sm font-bold disabled:opacity-30">
                        حذف
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={addBox} className="px-4 py-2 rounded-xl bg-teal-100 text-teal-800 font-bold text-sm">
                    + افزودن باکس جدید
                  </button>
                </div>
              )}
            </div>
          )}

          {/* مرحله ۲ و ۳ */}
          {(step === 2 || step === 3) && (
            <div className="space-y-8">
              {boxes.map((cfg, boxIdx) => (
                <div key={cfg.id} className="border border-teal-200 rounded-2xl p-5 bg-white/40">
                  <h3 className="font-black text-teal-800 mb-4">
                    {isUniform ? "تنظیمات باکس" : cfg.label}
                    {isUniform && cfg.qty > 1 && (
                      <span className="text-sm font-normal text-gray-600 mr-2">(تعداد: {cfg.qty})</span>
                    )}
                  </h3>

                  {step === 2 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {([
                        ["length", "طول"],
                        ["width", "عرض"],
                        ["height", "ارتفاع"],
                      ] as const).map(([key, label]) => (
                        <div key={key}>
                          <label className="block text-sm font-bold mb-1 text-blue-900">{label}</label>
                          <input
                            type="number"
                            min={0}
                            step="0.1"
                            value={cfg.dimensions[key] || ""}
                            onChange={(e) =>
                              updateBox(boxIdx, {
                                dimensions: { ...cfg.dimensions, [key]: Number(e.target.value) },
                              })
                            }
                            className={`w-full rounded-xl border border-teal-500/30 bg-white/70 px-3 py-2.5 ${focusClass}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {step === 3 && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {(Object.keys(cfg.faces) as FaceKey[]).map((key) => (
                          <label key={key} className="flex items-center gap-2 p-2 rounded-xl border border-teal-500/30 bg-white/50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={cfg.faces[key]}
                              onChange={(e) =>
                                updateBox(boxIdx, {
                                  faces: { ...cfg.faces, [key]: e.target.checked },
                                })
                              }
                            />
                            <span className="font-semibold text-sm">{faceLabels[key]}</span>
                          </label>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-bold mb-1">نوع اتصال</label>
                          <select
                            value={cfg.boxType}
                            onChange={(e) => updateBox(boxIdx, { boxType: e.target.value as BoxType })}
                            className={`w-full rounded-xl border border-teal-500/30 bg-white/70 px-3 py-2 ${focusClass}`}
                          >
                            <option value="diamond">دیاموند</option>
                            <option value="miter">فارسی‌بر</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-bold mb-1">ضخامت (میل)</label>
                          <select
                            value={cfg.thickness}
                            onChange={(e) => updateBox(boxIdx, { thickness: Number(e.target.value) })}
                            className={`w-full rounded-xl border border-teal-500/30 bg-white/70 px-3 py-2 ${focusClass}`}
                          >
                            {[6, 8, 10, 12, 15, 19].map((t) => (
                              <option key={t} value={t}>{t} میل</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-bold mb-1">نوع شیشه</label>
                          <select
                            value={cfg.glassName}
                            onChange={(e) => updateBox(boxIdx, { glassName: e.target.value })}
                            className={`w-full rounded-xl border border-teal-500/30 bg-white/70 px-3 py-2 ${focusClass}`}
                          >
                            {glassOptions.map((g) => (
                              <option key={g} value={g}>{g}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-bold mb-1">تعداد طبقه</label>
                          <input
                            type="number"
                            min={0}
                            max={8}
                            value={cfg.shelfCount}
                            onChange={(e) => updateBox(boxIdx, { shelfCount: Number(e.target.value) || 0 })}
                            className={`w-32 rounded-xl border border-teal-500/30 bg-white/70 px-3 py-2 ${focusClass}`}
                          />
                        </div>
                        <div>
                          <label className="flex items-center gap-2 font-bold cursor-pointer mt-6">
                            <input
                              type="checkbox"
                              checked={cfg.hasSlidingDoors}
                              onChange={(e) => updateBox(boxIdx, { hasSlidingDoors: e.target.checked })}
                            />
                            درب ریلی
                          </label>
                        </div>
                      </div>

                      {cfg.shelfCount > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-teal-50/50 p-3 rounded-xl">
                          <div>
                            <label className="block text-sm font-bold mb-1">عرض طبقه (خالی = کامل)</label>
                            <input
                              type="number"
                              step="0.1"
                              value={cfg.shelfWidthCm ?? ""}
                              onChange={(e) =>
                                updateBox(boxIdx, {
                                  shelfWidthCm: e.target.value ? Number(e.target.value) : null,
                                })
                              }
                              className={`w-full rounded-xl border border-teal-500/30 bg-white/70 px-3 py-2 ${focusClass}`}
                            />
                          </div>
                          <div>
                            <label className="flex items-center gap-2 font-bold cursor-pointer">
                              <input
                                type="checkbox"
                                checked={cfg.useCustomShelfOffset}
                                onChange={(e) => updateBox(boxIdx, { useCustomShelfOffset: e.target.checked })}
                              />
                              فاصله دلخواه از بالا
                            </label>
                            {cfg.useCustomShelfOffset && (
                              <input
                                type="number"
                                step="0.1"
                                value={cfg.shelfOffsetFromTop}
                                onChange={(e) => updateBox(boxIdx, { shelfOffsetFromTop: Number(e.target.value) || 0 })}
                                className={`mt-2 w-32 rounded-xl border border-teal-500/30 bg-white/70 px-3 py-2 ${focusClass}`}
                                placeholder="cm از سقف"
                              />
                            )}
                          </div>
                        </div>
                      )}

                      {!isUniform && (
                        <div>
                          <label className="block text-sm font-bold mb-1">تعداد این باکس</label>
                          <input
                            type="number"
                            min={1}
                            value={cfg.qty}
                            onChange={(e) => updateBox(boxIdx, { qty: Number(e.target.value) || 1 })}
                            className={`w-24 rounded-xl border border-teal-500/30 bg-white/70 px-3 py-2 ${focusClass}`}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* مرحله ۴ */}
          {step === 4 && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-blue-950">نتیجه طراحی</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {allResults.map((res, idx) => (
                  <div key={boxes[idx].id} className="rounded-xl border border-teal-500/30 bg-white/70 p-3">
                    <div data-schematic>
                      <BoxSchematic
                        faces={res.cfg.faces}
                        length={res.cfg.dimensions.length}
                        width={res.cfg.dimensions.width}
                        height={res.cfg.dimensions.height}
                        shelfCount={res.cfg.shelfCount}
                        shelfOffsetFromTop={res.cfg.useCustomShelfOffset ? res.cfg.shelfOffsetFromTop : null}
                        hasSlidingDoors={res.cfg.hasSlidingDoors}
                        boxType={res.cfg.boxType}
                        label={isUniform ? (res.cfg.qty > 1 ? `${res.cfg.qty} عدد یکسان` : undefined) : res.cfg.label}
                      />
                    </div>
                    <div className="text-sm mt-2 text-right space-y-0.5">
                      <p className="font-bold">{res.cfg.glassName} {res.cfg.thickness} میل</p>
                      <p>{res.cfg.dimensions.length} × {res.cfg.dimensions.width} × {res.cfg.dimensions.height} cm</p>
                      <p className="text-teal-800 font-black">UV = {res.uvM} m | متراژ = {res.totalArea} m²</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl overflow-hidden border border-teal-500/30">
                <div className="bg-teal-600 text-white px-4 py-2 font-bold">لیست قطعات برش (مجموع)</div>
                <table className="w-full text-sm bg-white/80">
                  <thead>
                    <tr className="bg-gray-100 text-right">
                      <th className="p-2">#</th>
                      <th className="p-2">نام قطعه</th>
                      <th className="p-2 text-center">ابعاد</th>
                      <th className="p-2 text-center">تعداد</th>
                      <th className="p-2">توضیح لبه</th>
                    </tr>
                  </thead>
                  <tbody>
                    {totalParts.length === 0 ? (
                      <tr><td colSpan={5} className="p-4 text-center text-gray-500">قطعه‌ای محاسبه نشد</td></tr>
                    ) : (
                      totalParts.map((p, i) => (
                        <tr key={p.id} className="border-t">
                          <td className="p-2">{i + 1}</td>
                          <td className="p-2 font-bold">{p.name}</td>
                          <td className="p-2 text-center font-black">{p.lengthCm} × {p.widthCm}</td>
                          <td className="p-2 text-center">{p.qty}</td>
                          <td className="p-2 text-xs font-semibold">{p.edgeNote}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm font-semibold">
                <p className="font-black mb-2">خلاصه کل:</p>
                <p>UV کل = {round3(totalUV)} m</p>
                <p>متراژ کل = {round3(totalArea)} m²</p>
              </div>
            </div>
          )}

          <div className="flex justify-between mt-8 pt-6 border-t border-teal-500/20">
            <button onClick={prevStep} disabled={step === 1} className="px-5 py-2.5 rounded-xl border border-gray-300 bg-white/70 font-bold disabled:opacity-40">
              قبلی
            </button>
            <div className="flex gap-3">
              {step < 4 && (
                <button onClick={nextStep} className="px-5 py-2.5 rounded-xl border border-teal-500/50 bg-white/60 font-bold text-teal-800">
                  Skip
                </button>
              )}
              {step < 4 ? (
                <button onClick={nextStep} disabled={!canNext} className="px-5 py-2.5 rounded-xl bg-teal-600 text-white font-bold hover:bg-teal-700 disabled:opacity-40">
                  بعدی
                </button>
              ) : (
                <button onClick={sendToPreInvoice} className="px-5 py-2.5 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700">
                  ارسال به پیش‌فاکتور
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}