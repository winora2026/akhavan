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

const normalizeText = (value: string) => {
  if (!value) return ""
  return value
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰۱۲۳۴۵۶۷۸۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .toLowerCase()
    .trim()
}

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
    name,
    group: c.group || "همکار",
    normalizedName: normalizeText(name),
    normalizedCode: normalizeText(c.code || ""),
  }
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

  if (face === "top" || face === "bottom") {
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

  if (miterLen > 0 || miterWid > 0) {
    const miterParts: string[] = []
    if (miterLen === 1) miterParts.push("یک طول")
    else if (miterLen === 2) miterParts.push("دو طول")
    else if (miterLen > 2) miterParts.push(`${miterLen} طول`)

    if (miterWid === 1) miterParts.push("یک عرض")
    else if (miterWid === 2) miterParts.push("دو عرض")
    else if (miterWid > 2) miterParts.push(`${miterWid} عرض`)

    if (miterParts.length) {
      parts.push(miterParts.join(" + ") + " لول ۴۵ درجه")
    }
  }

  if (diaLen > 0 || diaWid > 0) {
    const diaParts: string[] = []
    if (diaLen === 1) diaParts.push("یک طول")
    else if (diaLen === 2) diaParts.push("دو طول")
    else if (diaLen > 2) diaParts.push(`${diaLen} طول`)

    if (diaWid === 1) diaParts.push("یک عرض")
    else if (diaWid === 2) diaParts.push("دو عرض")
    else if (diaWid > 2) diaParts.push(`${diaWid} عرض`)

    if (diaParts.length) {
      parts.push(diaParts.join(" + ") + " دیاموند")
    }
  }

  return parts.length ? parts.join(" + ") : "دیاموند"
}

function buildPartsForOne(cfg: BoxConfig, boxIndex: number): { parts: Part[]; uvM: number } {
  const { boxType, thickness, dimensions: dim, faces, shelfCount, shelfWidthCm, hasSlidingDoors, doorThickness } = cfg
  const L = dim.length
  const W = dim.width
  const H = dim.height
  const t = thickness / 10
  const miter = 0.2
  const shelfRecess = hasSlidingDoors ? 3 : 0

  const parts: Part[] = []
  const mode = boxType === "diamond" ? "diamond" : "miter"

  const add = (
    face: FaceKey | "shelf" | "door",
    name: string,
    a: number,
    b: number,
    qty: number,
    thick?: number
  ) => {
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
    const shelfW = (shelfWidthCm ?? W - backT - frontT) - shelfRecess
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
function getGlassColors(glassName: string) {
  if (glassName.includes("دودی")) {
    return {
      fill: "rgba(100,116,139,0.18)",
      fillSide: "rgba(71,85,105,0.22)",
      stroke: "#1e293b",
      rim: "#64748b",
    }
  }
  if (glassName.includes("برنز")) {
    return {
      fill: "rgba(217,119,6,0.14)",
      fillSide: "rgba(180,83,9,0.18)",
      stroke: "#78350f",
      rim: "#d97706",
    }
  }
  if (glassName.includes("آینه")) {
    return {
      fill: "rgba(56,189,248,0.16)",
      fillSide: "rgba(3,105,161,0.2)",
      stroke: "#0c4a6e",
      rim: "#0284c7",
    }
  }
  return {
    fill: "rgba(34,211,238,0.12)",
    fillSide: "rgba(14,116,144,0.16)",
    stroke: "#134e4a",
    rim: "#0d9488",
  }
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
  glassName,
  zoom = 1,
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
  glassName: string
  zoom?: number
}) {
  const col = getGlassColors(glassName)
  const isMiter = boxType === "miter"

  const L = Math.max(length, 1)
  const W = Math.max(width, 1)
  const H = Math.max(height, 1)
  const maxDim = Math.max(L, W * 0.72, H)
  const scale = 195 / maxDim
  const lx = L * scale
  const depth = W * scale * 0.48
  const hz = H * scale

  // 10mm glass is deliberately visible as a real edge strip in the illustration.
  const edge = Math.max(5, Math.min(10, scale * 0.72))
  const x0 = 118
  const y0 = 275

  type P = { x: number; y: number }
  const A: P = { x: x0, y: y0 }
  const B: P = { x: x0 + lx, y: y0 }
  const C: P = { x: x0 + lx + depth, y: y0 - depth }
  const D: P = { x: x0 + depth, y: y0 - depth }
  const At: P = { x: A.x, y: A.y - hz }
  const Bt: P = { x: B.x, y: B.y - hz }
  const Ct: P = { x: C.x, y: C.y - hz }
  const Dt: P = { x: D.x, y: D.y - hz }

  const svgId = `box-${boxType}-${glassName}-${L}-${W}-${H}-${label || "box"}`.replace(/[^a-zA-Z0-9_-]/g, "-")
  const pstr = (pts: P[]) => pts.map((p) => `${p.x},${p.y}`).join(" ")
  const add = (p: P, dx: number, dy: number): P => ({ x: p.x + dx, y: p.y + dy })

  // A strip is the visible 10mm glass edge. It is not just a stroke.
  const edgeStrip = (a: P, b: P, nx: number, ny: number, key: string, opacity = 0.95) => {
    const a2 = add(a, nx, ny)
    const b2 = add(b, nx, ny)
    return (
      <g key={key} opacity={opacity}>
        <polygon points={pstr([a, b, b2, a2])} fill={col.rim} />
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={col.stroke} strokeWidth={1.15} />
        <line x1={a2.x} y1={a2.y} x2={b2.x} y2={b2.y} stroke="#ffffff" strokeWidth={0.8} opacity={0.65} />
      </g>
    )
  }

  // Miter cap: a real-looking diagonal cut face at a glass/glass corner.
  // The cap is a small quadrilateral, not a decorative diagonal line.
  const miterCap = (p: P, ux: number, uy: number, vx: number, vy: number, key: string) => {
    const u = { x: ux * edge, y: uy * edge }
    const v = { x: vx * edge, y: vy * edge }
    const q1 = add(p, u.x, u.y)
    const q2 = add(p, v.x, v.y)
    const q3 = add(p, u.x + v.x, u.y + v.y)
    return (
      <g key={key}>
        <polygon points={pstr([p, q1, q3, q2])} fill={col.rim} opacity={0.96} />
        <line x1={q1.x} y1={q1.y} x2={q2.x} y2={q2.y} stroke="#ffffff" strokeWidth={1.05} opacity={0.75} />
      </g>
    )
  }

  // Diamond/90° corner: one edge visibly overlaps the other.
  const diamondJoint = (p: P, a: P, b: P, key: string) => (
    <g key={key}>
      <line x1={a.x} y1={a.y} x2={p.x} y2={p.y} stroke={col.stroke} strokeWidth={1.7} opacity={0.95} />
      <line x1={b.x} y1={b.y} x2={p.x} y2={p.y} stroke={col.rim} strokeWidth={2.6} opacity={0.92} />
    </g>
  )

  const panel = (pts: P[], fill: string, opacity: number, key: string) => (
    <polygon key={key} points={pstr(pts)} fill={fill} stroke={col.stroke} strokeWidth={1.05} opacity={opacity} />
  )

  const drawPanels = () => (
    <>
      {faces.back && panel([D, C, Ct, Dt], col.fillSide, 0.40, "back")}
      {faces.bottom && panel([A, B, C, D], col.fillSide, 0.32, "bottom")}
      {faces.left && panel([A, D, Dt, At], col.fillSide, 0.48, "left")}
      {faces.right && panel([B, C, Ct, Bt], `url(#glass-side-${svgId})`, 0.50, "right")}
      {faces.front && panel([A, B, Bt, At], `url(#glass-front-${svgId})`, 0.56, "front")}
      {faces.top && panel([At, Bt, Ct, Dt], `url(#glass-top-${svgId})`, 0.60, "top")}
    </>
  )

  // All four edges around the FRONT OPENING remain visible even when front=false.
  // This is the important correction for the user's "four front lines have no depth" issue.
  const frontRim = (
    <g>
      {(faces.left || faces.front) && edgeStrip(A, At, -edge * 0.78, edge * 0.78, "front-left-rim")}
      {(faces.right || faces.front) && edgeStrip(B, Bt, edge * 0.78, edge * 0.78, "front-right-rim")}
      {(faces.top || faces.front) && edgeStrip(At, Bt, 0, -edge, "front-top-rim")}
      {(faces.bottom || faces.front) && edgeStrip(A, B, 0, edge, "front-bottom-rim")}
    </g>
  )

  const sideRims = (
    <g>
      {faces.right && edgeStrip(B, C, 0, -edge * 0.68, "right-bottom-rim")}
      {faces.right && edgeStrip(C, Ct, -edge * 0.72, -edge * 0.72, "right-back-rim")}
      {faces.right && edgeStrip(Bt, Ct, edge * 0.45, edge * 0.45, "right-top-rim")}
      {faces.left && edgeStrip(A, D, 0, edge * 0.68, "left-bottom-rim")}
      {faces.left && edgeStrip(D, Dt, edge * 0.72, -edge * 0.72, "left-back-rim")}
      {faces.left && edgeStrip(At, Dt, -edge * 0.45, -edge * 0.45, "left-top-rim")}
      {faces.back && edgeStrip(D, C, 0, edge * 0.62, "back-bottom-rim")}
      {faces.back && edgeStrip(Dt, Ct, 0, -edge * 0.55, "back-top-rim")}
    </g>
  )

  const joints = isMiter ? (
    <g>
      {/* Visible 45° cut faces at every exposed corner. */}
      {(faces.left || faces.front) && miterCap(A, 1, -1, -1, 1, "miter-A")}
      {(faces.right || faces.front) && miterCap(B, -1, -1, 1, 1, "miter-B")}
      {(faces.left || faces.top) && miterCap(At, 1, 1, -1, -1, "miter-At")}
      {(faces.right || faces.top) && miterCap(Bt, -1, 1, 1, -1, "miter-Bt")}
      {(faces.back || faces.right) && miterCap(C, -1, 1, 1, -1, "miter-C")}
      {(faces.back || faces.left) && miterCap(D, 1, 1, -1, -1, "miter-D")}
      {(faces.back || faces.top) && miterCap(Ct, -1, -1, 1, 1, "miter-Ct")}
      {(faces.back || faces.top) && miterCap(Dt, 1, -1, -1, 1, "miter-Dt")}
    </g>
  ) : (
    <g>
      {(faces.left || faces.front) && diamondJoint(A, add(A, 0, -edge), add(A, -edge, 0), "diamond-A")}
      {(faces.right || faces.front) && diamondJoint(B, add(B, 0, -edge), add(B, edge, 0), "diamond-B")}
      {(faces.left || faces.top) && diamondJoint(At, add(At, 0, edge), add(At, -edge, 0), "diamond-At")}
      {(faces.right || faces.top) && diamondJoint(Bt, add(Bt, 0, edge), add(Bt, edge, 0), "diamond-Bt")}
      {(faces.back || faces.right) && diamondJoint(C, add(C, 0, edge), add(C, edge, 0), "diamond-C")}
      {(faces.back || faces.left) && diamondJoint(D, add(D, 0, edge), add(D, -edge, 0), "diamond-D")}
    </g>
  )

  const shelfYs: number[] = []
  if (shelfCount > 0 && hz > 40) {
    const usable = Math.max(hz - 30, 1)
    const step = usable / (shelfCount + 1)
    for (let i = 1; i <= shelfCount; i++) shelfYs.push(At.y + 15 + step * i)
  }

  const shelfPolygon = (y: number) => [
    { x: A.x + edge, y },
    { x: B.x - edge, y },
    { x: C.x - edge, y: y - depth * 0.9 },
    { x: D.x + edge, y: y - depth * 0.9 },
  ]

  return (
    <div className="w-full flex flex-col items-center">
      <svg
        viewBox="0 0 500 390"
        width={500 * zoom}
        height={390 * zoom}
        className="max-w-full"
        role="img"
        aria-label={`${isMiter ? "باکس شیشه‌ای با اتصال مایتر ۴۵ درجه" : "باکس شیشه‌ای با اتصال دیاموند / گونیا"} ${L}×${W}×${H}`}
      >
        <defs>
          <linearGradient id={`glass-front-${svgId}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.44)" />
            <stop offset="55%" stopColor={col.fill} />
            <stop offset="100%" stopColor={col.fillSide} />
          </linearGradient>
          <linearGradient id={`glass-side-${svgId}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={col.fillSide} />
            <stop offset="100%" stopColor={col.fill} />
          </linearGradient>
          <linearGradient id={`glass-top-${svgId}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.48)" />
            <stop offset="100%" stopColor={col.fill} />
          </linearGradient>
          <filter id={`glass-shadow-${svgId}`} x="-20%" y="-20%" width="140%" height="160%">
            <feDropShadow dx="0" dy="7" stdDeviation="6" floodOpacity="0.13" />
          </filter>
        </defs>

        <ellipse cx={(A.x + C.x) / 2} cy={y0 + 17} rx={Math.max(lx * 0.43, 58)} ry={13} fill="#000" opacity={0.08} />

        <g filter={`url(#glass-shadow-${svgId})`}>
          {drawPanels()}
          {sideRims}
          {frontRim}
          {joints}

          {faces.front && (
            <>
              <line x1={A.x + lx * 0.15} y1={A.y - hz * 0.1} x2={A.x + lx * 0.39} y2={A.y - hz * 0.88} stroke="#fff" strokeWidth={2.2} opacity={0.20} />
              <line x1={A.x + lx * 0.56} y1={A.y - hz * 0.2} x2={A.x + lx * 0.66} y2={A.y - hz * 0.62} stroke="#fff" strokeWidth={1.2} opacity={0.12} />
            </>
          )}

          {shelfYs.map((y, i) => (
            <g key={`shelf-${i}`}>
              <polygon points={pstr(shelfPolygon(y))} fill={col.fill} stroke={col.rim} strokeWidth={1.2} opacity={0.78} />
              <line x1={A.x + edge} y1={y} x2={B.x - edge} y2={y} stroke={col.stroke} strokeWidth={1} opacity={0.75} />
            </g>
          ))}

          {hasSlidingDoors && faces.front && (
            <line x1={(A.x + B.x) / 2} y1={A.y} x2={(A.x + B.x) / 2} y2={At.y} stroke={col.rim} strokeWidth={2} strokeDasharray="5 4" opacity={0.9} />
          )}
        </g>

        <g transform="translate(18,18)">
          <rect x="0" y="0" rx="9" width={isMiter ? 190 : 175} height="31" fill={isMiter ? "rgba(245,158,11,0.10)" : "rgba(13,148,136,0.10)"} stroke={isMiter ? "#d97706" : col.rim} strokeWidth="1" />
          <text x={isMiter ? 95 : 87.5} y="21" textAnchor="middle" fontSize="13" fontWeight="800" fill={isMiter ? "#b45309" : col.stroke} style={{ fontFamily: "Vazirmatn, Tahoma, sans-serif" }}>
            {isMiter ? "اتصال ۴۵° واقعی — دو لبه برش خورده" : "اتصال دیاموند / گونیا — اتصال ۹۰°"}
          </text>
        </g>

        <g stroke={col.rim} strokeWidth={1.05} fill={col.stroke}>
          <line x1={A.x} y1={y0 + 28} x2={B.x} y2={y0 + 28} />
          <line x1={A.x} y1={y0 + 22} x2={A.x} y2={y0 + 34} />
          <line x1={B.x} y1={y0 + 22} x2={B.x} y2={y0 + 34} />
          <text x={(A.x + B.x) / 2} y={y0 + 51} textAnchor="middle" fontSize="13" fontWeight="700" style={{ fontFamily: "Vazirmatn, Tahoma, sans-serif" }}>{length}</text>
          <line x1={A.x - 19} y1={A.y} x2={A.x - 19} y2={At.y} />
          <text x={A.x - 33} y={(A.y + At.y) / 2 + 4} textAnchor="middle" fontSize="13" fontWeight="700" style={{ fontFamily: "Vazirmatn, Tahoma, sans-serif" }}>{height}</text>
          <line x1={B.x + 13} y1={B.y - 3} x2={C.x + 13} y2={C.y - 3} />
          <text x={(B.x + C.x) / 2 + 24} y={(B.y + C.y) / 2} fontSize="13" fontWeight="700" style={{ fontFamily: "Vazirmatn, Tahoma, sans-serif" }}>{width}</text>
        </g>
      </svg>

      <p className="mt-1 text-sm font-black text-teal-800">
        {isMiter
          ? "اتصال ۴۵ درجه: هر دو لبه در گوشه با برش مایتر به هم می‌رسند"
          : "اتصال دیاموند / گونیا: اتصال عمود ۹۰ درجه با لبه‌ی قابل مشاهده"}
        {label ? ` — ${label}` : ""}
      </p>
    </div>
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
  const [zoom, setZoom] = useState(1)

  const step1Refs = useRef<(HTMLInputElement | HTMLSelectElement | null)[]>([])
  const step2Refs = useRef<(HTMLInputElement | null)[]>([])

  const filteredCustomers = useMemo(() => {
    const q = normalizeText(customerSearch)
    if (!q) return customersList.slice(0, 12)
    return customersList
      .filter((c) => {
        return (
          c.normalizedName.includes(q) ||
          c.normalizedCode.includes(q) ||
          c.normalizedName.split(/\s+/).some((part) => part.startsWith(q))
        )
      })
      .slice(0, 15)
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

  const handleStep1Key = (e: KeyboardEvent, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault()
      const next = step1Refs.current[index + 1]
      if (next) next.focus()
      else if (customerName.trim()) nextStep()
    }
  }

  const handleStep2Key = (e: KeyboardEvent, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault()
      const next = step2Refs.current[index + 1]
      if (next) next.focus()
      else nextStep()
    }
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        if (step > 1) prevStep()
        else router.push("/")
      }
    }
    window.addEventListener("keydown", onKeyDown as any)
    return () => window.removeEventListener("keydown", onKeyDown as any)
  }, [step])

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

  const isSingleBox = isUniform || boxes.length === 1

  // نکته‌ی مهم: قبلاً این تابع خودِ کادر data-schematic (یک div) را سریالایز می‌کرد،
  // نه خودِ svg داخلش — چون ریشه‌ی سند برای image/svg+xml باید یک تگ <svg> معتبر باشد،
  // آن حالت همیشه بارگذاری تصویر را با خطا (img.onerror) مواجه می‌کرد و هیچ عکسی هیچ‌وقت
  // به پیش‌فاکتور/نقشه منتقل نمی‌شد. اصلاح شد: مستقیم svg داخل هر data-schematic گرفته می‌شود.
  const captureAllSchematics = async (): Promise<{ png: string | null; svg: string | null }> => {
    try {
      const svgs = document.querySelectorAll("[data-schematic] svg")
      if (svgs.length === 0) return { png: null, svg: null }

      const serializer = new XMLSerializer()
      let svgStr = ""

      if (svgs.length === 1) {
        svgStr = serializer.serializeToString(svgs[0])
      } else {
        const width = 480 * svgs.length
        let combined = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="300" viewBox="0 0 ${width} 300">`
        svgs.forEach((s, i) => {
          const content = serializer
            .serializeToString(s)
            .replace(/<svg[^>]*>/, "")
            .replace("</svg>", "")
          combined += `<g transform="translate(${i * 480},0)">${content}</g>`
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
      const perimeter = round1((p.lengthCm + p.widthCm) * 2)

      return {
        productName: `${cfg.glassName} ${cfg.thickness} میل - ${p.name}`,
        installCode: "",
        unit: "مترمربع",
        length: String(p.lengthCm),
        width: String(p.widthCm),
        quantity: String(p.qty),
        meterage: p.areaM2.toFixed(4),
        perimeter: String(perimeter),
        description: "",
        services: p.edgeNote || "",
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

  const focusClass =
    "focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:bg-yellow-50 transition"

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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/20">
          <div>
            <h1 className="text-2xl font-bold text-blue-950">طراحی باکس</h1>
            <p className="text-sm text-blue-800 mt-1">
              دیاموند / لول ۴۵ درجه + طبقات سه‌بعدی + درب ریلی + چند باکس
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
                <div className={`flex-1 h-1 mx-2 ${step > s ? "bg-teal-600" : "bg-white/40"}`} />
              )}
            </div>
          ))}
        </div>

        <div className="rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-6 shadow-lg border border-teal-500/20">
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-blue-950">اطلاعات کلی</h2>

              <div className="relative">
                <label className="block text-sm font-bold mb-1 text-blue-900">نام مشتری</label>
                <input
                  ref={(el) => {
                    step1Refs.current[0] = el
                  }}
                  type="text"
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value)
                    setCustomerName(e.target.value)
                    setShowCustomerDropdown(true)
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
                  onKeyDown={(e) => handleStep1Key(e, 0)}
                  className={`w-full rounded-xl border border-teal-500/30 bg-white/70 px-3 py-2.5 font-semibold ${focusClass}`}
                  placeholder="جستجوی مشتری (نام یا کد)..."
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
              </div>

              {isUniform && (
                <div>
                  <label className="block text-sm font-bold mb-1 text-blue-900">
                    تعداد باکس (یکسان)
                  </label>
                  <input
                    ref={(el) => {
                      step1Refs.current[1] = el
                    }}
                    type="number"
                    min={1}
                    value={boxes[0].qty}
                    onChange={(e) => updateBox(0, { qty: Number(e.target.value) || 1 })}
                    onKeyDown={(e) => handleStep1Key(e, 1)}
                    className={`w-32 rounded-xl border border-teal-500/30 bg-white/70 px-3 py-2.5 font-bold ${focusClass}`}
                  />
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
                        setBoxes([{ ...boxes[0], label: "باکس ۱" }])
                      }
                    }}
                  />
                  باکس‌ها متفاوت هستند
                </label>
              </div>

              {!isUniform && (
                <div className="space-y-3">
                  {boxes.map((b, idx) => (
                    <div
                      key={b.id}
                      className="flex items-center gap-3 bg-white/50 p-3 rounded-xl border border-teal-100"
                    >
                      <span className="font-bold text-teal-800 w-24">{b.label}</span>
                      <span className="text-sm">تعداد: {b.qty}</span>
                      <button
                        type="button"
                        onClick={() => removeBox(idx)}
                        disabled={boxes.length <= 1}
                        className="text-red-600 text-sm font-bold disabled:opacity-30"
                      >
                        حذف
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addBox}
                    className="px-4 py-2 rounded-xl bg-teal-100 text-teal-800 font-bold text-sm"
                  >
                    + افزودن باکس جدید
                  </button>
                </div>
              )}
            </div>
          )}

          {(step === 2 || step === 3) && (
            <div className="space-y-8">
              {boxes.map((cfg, boxIdx) => (
                <div key={cfg.id} className="border border-teal-200 rounded-2xl p-5 bg-white/40">
                  <h3 className="font-black text-teal-800 mb-4">
                    {isUniform ? "تنظیمات باکس" : cfg.label}
                    {isUniform && cfg.qty > 1 && (
                      <span className="text-sm font-normal text-gray-600 mr-2">
                        (تعداد: {cfg.qty})
                      </span>
                    )}
                  </h3>

                  {step === 2 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {(
                        [
                          ["length", "طول"],
                          ["width", "عرض"],
                          ["height", "ارتفاع"],
                        ] as const
                      ).map(([key, label], idx) => (
                        <div key={key}>
                          <label className="block text-sm font-bold mb-1 text-blue-900">
                            {label}
                          </label>
                          <input
                            ref={(el) => {
                              step2Refs.current[idx] = el
                            }}
                            type="number"
                            min={0}
                            step="0.1"
                            value={cfg.dimensions[key] || ""}
                            onChange={(e) =>
                              updateBox(boxIdx, {
                                dimensions: {
                                  ...cfg.dimensions,
                                  [key]: Number(e.target.value),
                                },
                              })
                            }
                            onKeyDown={(e) => handleStep2Key(e, idx)}
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
                          <label
                            key={key}
                            className="flex items-center gap-2 p-2 rounded-xl border border-teal-500/30 bg-white/50 cursor-pointer"
                          >
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
                            onChange={(e) =>
                              updateBox(boxIdx, { boxType: e.target.value as BoxType })
                            }
                            className={`w-full rounded-xl border border-teal-500/30 bg-white/70 px-3 py-2 ${focusClass}`}
                          >
                            <option value="diamond">دیاموند</option>
                            <option value="miter">لول ۴۵ درجه</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-bold mb-1">ضخامت (میل)</label>
                          <select
                            value={cfg.thickness}
                            onChange={(e) =>
                              updateBox(boxIdx, { thickness: Number(e.target.value) })
                            }
                            className={`w-full rounded-xl border border-teal-500/30 bg-white/70 px-3 py-2 ${focusClass}`}
                          >
                            {[6, 8, 10, 12, 15, 19].map((t) => (
                              <option key={t} value={t}>
                                {t} میل
                              </option>
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
                              <option key={g} value={g}>
                                {g}
                              </option>
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
                            onChange={(e) =>
                              updateBox(boxIdx, { shelfCount: Number(e.target.value) || 0 })
                            }
                            className={`w-32 rounded-xl border border-teal-500/30 bg-white/70 px-3 py-2 ${focusClass}`}
                          />
                        </div>
                        <div>
                          <label className="flex items-center gap-2 font-bold cursor-pointer mt-6">
                            <input
                              type="checkbox"
                              checked={cfg.hasSlidingDoors}
                              onChange={(e) =>
                                updateBox(boxIdx, { hasSlidingDoors: e.target.checked })
                              }
                            />
                            درب ریلی
                          </label>
                        </div>
                      </div>

                      {cfg.shelfCount > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-teal-50/50 p-3 rounded-xl">
                          <div>
                            <label className="block text-sm font-bold mb-1">
                              عرض طبقه (خالی = کامل)
                            </label>
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
                                onChange={(e) =>
                                  updateBox(boxIdx, { useCustomShelfOffset: e.target.checked })
                                }
                              />
                              فاصله دلخواه از بالا
                            </label>
                            {cfg.useCustomShelfOffset && (
                              <input
                                type="number"
                                step="0.1"
                                value={cfg.shelfOffsetFromTop}
                                onChange={(e) =>
                                  updateBox(boxIdx, {
                                    shelfOffsetFromTop: Number(e.target.value) || 0,
                                  })
                                }
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
                            onChange={(e) =>
                              updateBox(boxIdx, { qty: Number(e.target.value) || 1 })
                            }
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

          {step === 4 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-blue-950">نتیجه طراحی</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setZoom((z) => Math.max(0.7, z - 0.1))}
                    className="px-3 py-1 rounded-lg bg-white/70 border font-bold"
                  >
                    −
                  </button>
                  <span className="text-sm font-bold">{Math.round(zoom * 100)}%</span>
                  <button
                    onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))}
                    className="px-3 py-1 rounded-lg bg-white/70 border font-bold"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* اگر تک باکس باشد کل عرض را می‌گیرد، اگر چند تا باشد دو ستونه */}
              <div
                className={
                  isSingleBox
                    ? "grid grid-cols-1 gap-4"
                    : "grid grid-cols-1 md:grid-cols-2 gap-4"
                }
              >
                {allResults.map((res, idx) => (
                  <div
                    key={boxes[idx].id}
                    className="rounded-xl border border-teal-500/30 bg-white/80 p-4 flex flex-col"
                  >
                    <div data-schematic className="flex-1 flex items-center justify-center min-h-[300px]">
                      <BoxSchematic
                        faces={res.cfg.faces}
                        length={res.cfg.dimensions.length}
                        width={res.cfg.dimensions.width}
                        height={res.cfg.dimensions.height}
                        shelfCount={res.cfg.shelfCount}
                        shelfOffsetFromTop={
                          res.cfg.useCustomShelfOffset ? res.cfg.shelfOffsetFromTop : null
                        }
                        hasSlidingDoors={res.cfg.hasSlidingDoors}
                        boxType={res.cfg.boxType}
                        glassName={res.cfg.glassName}
                        zoom={zoom}
                        label={
                          isUniform
                            ? res.cfg.qty > 1
                              ? `${res.cfg.qty} عدد یکسان`
                              : undefined
                            : res.cfg.label
                        }
                      />
                    </div>

                    {/* نوشته‌ها فقط در پایین */}
                    <div className="text-sm mt-3 text-right space-y-1 border-t border-teal-100 pt-3">
                      <p className="font-bold text-base">
                        {res.cfg.glassName} {res.cfg.thickness} میل
                      </p>
                      <p>
                        {res.cfg.dimensions.length} × {res.cfg.dimensions.width} ×{" "}
                        {res.cfg.dimensions.height} cm
                      </p>
                      <p className="text-teal-800 font-black">
                        UV = {res.uvM} m | متراژ = {res.totalArea} m²
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl overflow-hidden border border-teal-500/30">
                <div className="bg-teal-600 text-white px-4 py-2 font-bold">
                  لیست قطعات برش (مجموع)
                </div>
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
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-gray-500">
                          قطعه‌ای محاسبه نشد
                        </td>
                      </tr>
                    ) : (
                      totalParts.map((p, i) => (
                        <tr key={p.id} className="border-t">
                          <td className="p-2">{i + 1}</td>
                          <td className="p-2 font-bold">{p.name}</td>
                          <td className="p-2 text-center font-black">
                            {p.lengthCm} × {p.widthCm}
                          </td>
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
            <button
              onClick={prevStep}
              disabled={step === 1}
              className="px-5 py-2.5 rounded-xl border border-gray-300 bg-white/70 font-bold disabled:opacity-40"
            >
              قبلی
            </button>
            <div className="flex gap-3">
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
                  onClick={sendToPreInvoice}
                  className="px-5 py-2.5 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700"
                >
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
