"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"

const INSTALLER_NAME = "آقای هادی زنگنه"
const INSTALLER_PHONE = "09127372431"

const REGION_OPTIONS = [
  "غرب تهران",
  "شرق تهران",
  "شمال تهران",
  "جنوب تهران",
  "مرکز تهران",
  "کرج / حومه",
  "سایر",
]

function guessRegionFromAddress(address?: string | null): string {
  if (!address) return ""
  const a = address.replace(/ي/g, "ی").replace(/ك/g, "ک")
  if (/کرج|فردیس|نظرآباد|هشتگرد/i.test(a)) return "کرج / حومه"
  if (/ستارخان|صادقیه|پونک|جنت.?آباد|آریاشهر|گیشا|کوی نصر|سعادت.?آباد|شهرک غرب|آزادگان|آزادی|اکباتان|تهرانسر|چیتگر|وردآورد|مرزداران|کاشانی|فردوس|شهرزیبا|شهران|شهرک هما|باغ فیض|بلوار فردوس/i.test(a))
    return "غرب تهران"
  if (/تهرانپارس|نارمک|رسالت|پیروزی|حکیمیه|لویزان|هنگام|دماوند/i.test(a)) return "شرق تهران"
  if (/نیاوران|فرمانیه|الهیه|تجریش|ولنجک|زعفرانیه|کاشانک|قیطریه|دزاشیب|دربند|پاسداران|اقدسیه|سوهانک|کردستان|حکیم|ونک|گاندی|میرداماد|آرژانتین|شریعتی/i.test(a))
    return "شمال تهران"
  if (/راه‌آهن|نازی.?آباد|خانی.?آباد|جوادیه|شاپور|مولوی|شوش|بازار/i.test(a))
    return "جنوب تهران"
  if (/انقلاب|کریم‌خان|ولی.?عصر|مرکز|فردوسی|حسن.?آباد/i.test(a)) return "مرکز تهران"
  return ""
}

/** منطقه‌ی مؤثر: مقدار ثبت‌شده، وگرنه حدس از آدرس */
function regionOf(row: { region?: string | null; address?: string | null }) {
  return row.region || guessRegionFromAddress(row.address) || ""
}

type Checklist = {
  yaraq: boolean
  lifting: boolean
  fare: boolean
  glue: boolean
  fitting: boolean
  removeOld: boolean
  other: boolean
  otherText: string
}

type Job = {
  id: string
  orderId: string
  orderNumber: string
  customerName: string
  customerPhone?: string | null
  address?: string | null
  region?: string | null
  installationDate?: string | null
  appointmentDate?: string | null
  appointmentTimeFrom?: string | null
  appointmentTimeTo?: string | null
  appointmentFixed?: boolean | null
  status: string
  problemReason?: string | null
  problemNotes?: string | null
  checklist?: string | null
  resultNotes?: string | null
  resultMedia?: string | null
  voiceNotes?: string | null
  installerName?: string | null
  installerPhone?: string | null
  salesRep?: string | null
  assignedTo?: string | null
  isReadyForInstall?: boolean | null
  readyAt?: string | null
  notes?: string | null
  createdAt: string
}

type SortKey =
  | "orderNumber"
  | "customerName"
  | "installationDate"
  | "isReadyForInstall"
  | "status"
  | "salesRep"
  | "region"

const PROBLEM_REASONS = [
  "کسری قطعه / یراق",
  "شکستگی شیشه یا آینه",
  "نبود مشتری در محل",
  "نقص زیرسازی / آماده‌نبودن محل",
  "ابعاد مغایر",
  "سایر",
]

const emptyChecklist = (): Checklist => ({
  yaraq: false,
  lifting: false,
  fare: false,
  glue: false,
  fitting: false,
  removeOld: false,
  other: false,
  otherText: "",
})

function parseChecklist(raw?: string | null): Checklist {
  if (!raw) return emptyChecklist()
  try {
    const v = JSON.parse(raw)
    return { ...emptyChecklist(), ...v }
  } catch {
    return emptyChecklist()
  }
}

function parseJsonArray(raw?: string | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

function formatFa(dt?: string | null) {
  if (!dt) return "—"
  try {
    return new Date(dt).toLocaleDateString("fa-IR")
  } catch {
    return "—"
  }
}

export default function InstallationPage() {
  const [tab, setTab] = useState<"PENDING" | "DONE">("PENDING")
  const [items, setItems] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [regionFilter, setRegionFilter] = useState("همه")
  const [sortKey, setSortKey] = useState<SortKey>("installationDate")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [currentUser, setCurrentUser] = useState("")

  const [detail, setDetail] = useState<Job | null>(null)
  const [checklist, setChecklist] = useState<Checklist>(emptyChecklist())
  const [resultNotes, setResultNotes] = useState("")
  const [resultFiles, setResultFiles] = useState<{ url: string; name: string }[]>([])
  const [voiceFiles, setVoiceFiles] = useState<{ url: string; name: string }[]>([])
  const [problemReason, setProblemReason] = useState("")
  const [problemNotes, setProblemNotes] = useState("")
  const [actionLoading, setActionLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recChunksRef = useRef<Blob[]>([])

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch("/api/auth/me")
        if (res.ok) {
          const data = await res.json()
          if (data.user?.displayName) setCurrentUser(data.user.displayName)
        }
      } catch {}
    })()
  }, [])

  const fetchList = async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/installations?status=${tab}&q=${encodeURIComponent(search)}`
      )
      const data = await res.json()
      setItems(data.items || [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const filtered = useMemo(() => {
    if (regionFilter === "همه") return items
    if (regionFilter === "نامشخص") return items.filter((r) => !regionOf(r))
    return items.filter((r) => regionOf(r) === regionFilter)
  }, [items, regionFilter])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      if (sortKey === "isReadyForInstall") {
        const av = a.isReadyForInstall ? 1 : 0
        const bv = b.isReadyForInstall ? 1 : 0
        return sortDir === "asc" ? av - bv : bv - av
      }
      if (sortKey === "installationDate") {
        const av = a.installationDate ? new Date(a.installationDate).getTime() : 0
        const bv = b.installationDate ? new Date(b.installationDate).getTime() : 0
        return sortDir === "asc" ? av - bv : bv - av
      }
      const av = sortKey === "region" ? regionOf(a) : String((a as any)[sortKey] ?? "")
      const bv = sortKey === "region" ? regionOf(b) : String((b as any)[sortKey] ?? "")
      if (av < bv) return sortDir === "asc" ? -1 : 1
      if (av > bv) return sortDir === "asc" ? 1 : -1
      return 0
    })
    return arr
  }, [filtered, sortKey, sortDir])

  const regionCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of items) {
      const k = regionOf(r) || "نامشخص"
      m.set(k, (m.get(k) || 0) + 1)
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }, [items])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const sortMark = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : ""

  const uploadFile = async (file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch("/api/upload", { method: "POST", body: fd })
    if (!res.ok) throw new Error("آپلود ناموفق")
    return res.json() as Promise<{ url: string; name: string }>
  }

  const openDetail = (row: Job) => {
    setDetail(row)
    setChecklist(parseChecklist(row.checklist))
    setResultNotes(row.resultNotes || "")
    setResultFiles(
      parseJsonArray(row.resultMedia).map((url) => ({
        url,
        name: url.split("/").pop() || "file",
      }))
    )
    setVoiceFiles(
      parseJsonArray(row.voiceNotes).map((url) => ({
        url,
        name: url.split("/").pop() || "voice",
      }))
    )
    setProblemReason(row.problemReason || "")
    setProblemNotes(row.problemNotes || "")
  }

  const toggleRecording = async () => {
    if (recording) {
      mediaRecorderRef.current?.stop()
      setRecording(false)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      recChunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) recChunksRef.current.push(e.data)
      }
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(recChunksRef.current, {
          type: rec.mimeType || "audio/webm",
        })
        if (!blob.size) return
        const ext = (rec.mimeType || "").includes("mp4") ? "m4a" : "webm"
        const file = new File([blob], `voice-${Date.now()}.${ext}`, {
          type: blob.type,
        })
        try {
          const up = await uploadFile(file)
          setVoiceFiles((prev) => [...prev, up])
        } catch {
          alert("خطا در آپلود ویس")
        }
      }
      rec.start()
      mediaRecorderRef.current = rec
      setRecording(true)
    } catch {
      alert("دسترسی میکروفون ممکن نشد. از انتخاب فایل استفاده کنید.")
    }
  }

  const patchJob = async (body: Record<string, unknown>) => {
    if (!detail) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/installations/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا")
      setDetail(null)
      fetchList()
    } catch (e: any) {
      alert(e.message || "خطا")
    } finally {
      setActionLoading(false)
    }
  }

  const saveDraft = () =>
    patchJob({
      checklist,
      resultNotes,
      resultMedia: resultFiles.map((f) => f.url),
      voiceNotes: voiceFiles.map((f) => f.url),
      problemReason: problemReason || null,
      problemNotes: problemNotes || null,
      assignedTo: currentUser || INSTALLER_NAME,
      installerName: INSTALLER_NAME,
      installerPhone: INSTALLER_PHONE,
      status: detail?.status === "PROBLEM" ? "PROBLEM" : "PENDING",
    })

  const markProblem = () => {
    if (!problemReason && !problemNotes.trim()) {
      return alert("علت یا توضیح مشکل را وارد کنید")
    }
    return patchJob({
      checklist,
      resultNotes,
      resultMedia: resultFiles.map((f) => f.url),
      voiceNotes: voiceFiles.map((f) => f.url),
      problemReason,
      problemNotes,
      status: "PROBLEM",
      assignedTo: currentUser || INSTALLER_NAME,
      installerName: INSTALLER_NAME,
      installerPhone: INSTALLER_PHONE,
    })
  }

  const markDone = () =>
    patchJob({
      checklist,
      resultNotes,
      resultMedia: resultFiles.map((f) => f.url),
      voiceNotes: voiceFiles.map((f) => f.url),
      problemReason: null,
      problemNotes: null,
      status: "DONE",
      assignedTo: currentUser || INSTALLER_NAME,
      installerName: INSTALLER_NAME,
      installerPhone: INSTALLER_PHONE,
    })

  const statusBadge = (row: Job) => {
    if (row.status === "DONE")
      return (
        <span className="rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-xs font-bold">
          انجام‌شده
        </span>
      )
    if (row.status === "PROBLEM")
      return (
        <span className="rounded-full bg-red-100 text-red-800 px-2 py-0.5 text-xs font-bold">
          مشکل‌دار
        </span>
      )
    return (
      <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-bold">
        انجام‌نشده
      </span>
    )
  }

  return (
    <div
      className="min-h-screen p-4 md:p-6 bg-cover bg-center bg-fixed"
      dir="rtl"
      style={{
        fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif",
        backgroundImage:
          "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')",
      }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-xl border border-teal-300 bg-white/80 px-4 py-2 font-bold text-blue-900"
            >
              بازگشت
            </Link>
            <h1 className="text-xl md:text-2xl font-black text-blue-950">نصب</h1>
          </div>
          <div className="text-xs md:text-sm font-bold text-blue-900 bg-white/80 rounded-xl px-3 py-2 border border-teal-200">
            نصاب: {INSTALLER_NAME}{" "}
            <a
              href={`tel:${INSTALLER_PHONE}`}
              className="text-teal-700 underline dir-ltr"
            >
              {INSTALLER_PHONE}
            </a>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab("PENDING")}
            className={`rounded-xl px-4 py-2 font-bold border ${
              tab === "PENDING"
                ? "bg-teal-600 text-white border-teal-700"
                : "bg-white/80 text-blue-900 border-teal-200"
            }`}
          >
            انجام‌نشده
          </button>
          <button
            onClick={() => setTab("DONE")}
            className={`rounded-xl px-4 py-2 font-bold border ${
              tab === "DONE"
                ? "bg-teal-600 text-white border-teal-700"
                : "bg-white/80 text-blue-900 border-teal-200"
            }`}
          >
            انجام‌شده
          </button>
        </div>

        <div className="rounded-2xl bg-white/85 backdrop-blur border border-teal-200 p-4 mb-4 shadow flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-bold text-blue-900 mb-1">
              جستجو
            </label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="نام، تلفن، شماره سفارش، آدرس..."
              className="w-full rounded-xl border border-teal-300 px-3 py-2 font-semibold"
            />
          </div>
          <div className="min-w-[160px]">
            <label className="block text-xs font-bold text-blue-900 mb-1">
              منطقه
            </label>
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="w-full rounded-xl border border-teal-300 px-3 py-2 font-semibold"
            >
              <option value="همه">همه مناطق</option>
              {REGION_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              <option value="نامشخص">نامشخص</option>
            </select>
          </div>
          <button
            onClick={fetchList}
            className="rounded-xl bg-blue-900 text-white font-bold px-5 py-2"
          >
            اعمال
          </button>
        </div>

        {/* خلاصه تعداد به تفکیک منطقه */}
        {regionCounts.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {regionCounts.map(([name, count]) => (
              <button
                key={name}
                type="button"
                onClick={() => setRegionFilter(name)}
                className={`rounded-full border px-3 py-1 text-xs font-bold ${
                  regionFilter === name
                    ? "bg-teal-600 text-white border-teal-700"
                    : "bg-white/90 text-blue-900 border-teal-300"
                }`}
              >
                {name}: {count}
              </button>
            ))}
          </div>
        )}

        <div className="rounded-2xl bg-white/90 border border-teal-200 shadow overflow-x-auto">
          {loading ? (
            <p className="p-6 text-center font-bold text-blue-800">
              در حال بارگذاری...
            </p>
          ) : sorted.length === 0 ? (
            <p className="p-6 text-center font-bold text-gray-600">موردی نیست</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-teal-700 text-white">
                  <th className="p-2 border border-teal-800">ردیف</th>
                  <th
                    className="p-2 border border-teal-800 cursor-pointer"
                    onClick={() => toggleSort("orderNumber")}
                  >
                    سفارش{sortMark("orderNumber")}
                  </th>
                  <th
                    className="p-2 border border-teal-800 cursor-pointer"
                    onClick={() => toggleSort("customerName")}
                  >
                    مشتری{sortMark("customerName")}
                  </th>
                  <th className="p-2 border border-teal-800">تلفن</th>
                  <th className="p-2 border border-teal-800">آدرس نصب</th>
                  <th
                    className="p-2 border border-teal-800 cursor-pointer"
                    onClick={() => toggleSort("region")}
                  >
                    منطقه{sortMark("region")}
                  </th>
                  <th
                    className="p-2 border border-teal-800 cursor-pointer"
                    onClick={() => toggleSort("installationDate")}
                  >
                    تاریخ نصب{sortMark("installationDate")}
                  </th>
                  <th
                    className="p-2 border border-teal-800 cursor-pointer"
                    onClick={() => toggleSort("isReadyForInstall")}
                  >
                    آماده‌تحویل{sortMark("isReadyForInstall")}
                  </th>
                  <th
                    className="p-2 border border-teal-800 cursor-pointer"
                    onClick={() => toggleSort("salesRep")}
                  >
                    کارشناس{sortMark("salesRep")}
                  </th>
                  <th
                    className="p-2 border border-teal-800 cursor-pointer"
                    onClick={() => toggleSort("status")}
                  >
                    وضعیت{sortMark("status")}
                  </th>
                  <th className="p-2 border border-teal-800">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, idx) => {
                  const ready = !!row.isReadyForInstall
                  const problem = row.status === "PROBLEM"
                  const done = row.status === "DONE"
                  const rowClass = done
                    ? "bg-green-50/80"
                    : problem
                      ? "bg-red-50/70"
                      : ready
                        ? "bg-emerald-100/70"
                        : "odd:bg-white even:bg-teal-50/40"
                  return (
                    <tr key={row.id} className={`${rowClass} hover:bg-teal-100/50`}>
                      <td className="p-2 border border-teal-100 text-center font-bold">
                        {idx + 1}
                      </td>
                      <td className="p-2 border border-teal-100 text-center font-black text-teal-800">
                        {row.orderNumber}
                      </td>
                      <td className="p-2 border border-teal-100 font-bold">
                        {row.customerName}
                      </td>
                      <td className="p-2 border border-teal-100 text-center">
                        {row.customerPhone ? (
                          <a
                            href={`tel:${row.customerPhone.replace(/[^\d+]/g, "")}`}
                            className="text-teal-800 font-bold underline dir-ltr"
                          >
                            {row.customerPhone}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-2 border border-teal-100 text-xs max-w-[220px] break-words">
                        {row.address || "—"}
                      </td>
                      <td className="p-2 border border-teal-100 text-center text-xs font-bold text-blue-900">
                        {regionOf(row) || "—"}
                      </td>
                      <td className="p-2 border border-teal-100 text-center font-semibold">
                        {formatFa(row.installationDate)}
                      </td>
                      <td className="p-2 border border-teal-100 text-center">
                        {ready ? (
                          <span className="rounded-full bg-green-600 text-white text-xs font-bold px-2 py-0.5">
                            آماده
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500">در تولید</span>
                        )}
                      </td>
                      <td className="p-2 border border-teal-100 text-center">
                        {row.salesRep || "—"}
                      </td>
                      <td className="p-2 border border-teal-100 text-center">
                        {statusBadge(row)}
                      </td>
                      <td className="p-2 border border-teal-100 text-center">
                        <button
                          onClick={() => openDetail(row)}
                          className="rounded-lg bg-blue-900 text-white text-xs font-bold px-2.5 py-1.5"
                        >
                          {row.status === "DONE" ? "مشاهده" : "نصاب / نتیجه"}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <p className="mt-2 text-xs text-blue-900/80 font-semibold">
          ردیف سبز = کالا آماده تحویل/نصب است. نارنجی/قرمز کم‌رنگ = مشکل در محل.
          نصاب: {INSTALLER_NAME}.
        </p>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[92vh] overflow-y-auto p-5 shadow-2xl">
            <h2 className="text-lg font-black text-blue-950 mb-1">
              سفارش {detail.orderNumber} — {detail.customerName}
            </h2>
            <p className="text-sm text-gray-600 mb-1">
              آدرس: {detail.address || "—"} | منطقه: {regionOf(detail) || "—"}
            </p>
            <p className="text-sm text-gray-600 mb-1">
              تلفن:{" "}
              {detail.customerPhone ? (
                <a
                  className="text-teal-800 font-bold underline dir-ltr"
                  href={`tel:${detail.customerPhone}`}
                >
                  {detail.customerPhone}
                </a>
              ) : (
                "—"
              )}
            </p>
            <p className="text-xs text-blue-800 mb-3">
              تاریخ نصب: {formatFa(detail.installationDate)} | کارشناس:{" "}
              {detail.salesRep || "—"} |{" "}
              {detail.isReadyForInstall ? (
                <span className="text-green-700 font-bold">آماده‌تحویل</span>
              ) : (
                <span className="text-amber-700">هنوز در تولید</span>
              )}
            </p>

            {/* چک‌لیست */}
            <div className="mb-4 rounded-xl border border-teal-300 bg-teal-50/40 p-3">
              <p className="text-sm font-black text-blue-950 mb-2">
                چک‌لیست قبل از مراجعه
              </p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {(
                  [
                    ["yaraq", "یراق"],
                    ["lifting", "بالابری"],
                    ["fare", "کرایه"],
                    ["glue", "چسب"],
                    ["fitting", "فیتینگ"],
                    ["removeOld", "باز کردن / کندن آینه یا شیشه"],
                    ["other", "سایر"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={(checklist as any)[key]}
                      disabled={detail.status === "DONE"}
                      onChange={(e) =>
                        setChecklist((c) => ({ ...c, [key]: e.target.checked }))
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              {checklist.other && (
                <input
                  className="mt-2 w-full rounded-xl border px-3 py-2 text-sm"
                  placeholder="توضیح سایر..."
                  value={checklist.otherText}
                  disabled={detail.status === "DONE"}
                  onChange={(e) =>
                    setChecklist((c) => ({ ...c, otherText: e.target.value }))
                  }
                />
              )}
            </div>

            {/* مشکل */}
            {detail.status !== "DONE" && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50/40 p-3">
                <p className="text-sm font-black text-red-900 mb-2">
                  ثبت مشکل (اختیاری)
                </p>
                <select
                  className="w-full rounded-xl border px-3 py-2 text-sm mb-2"
                  value={problemReason}
                  onChange={(e) => setProblemReason(e.target.value)}
                >
                  <option value="">— انتخاب علت —</option>
                  {PROBLEM_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <textarea
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  rows={2}
                  placeholder="توضیح مشکل..."
                  value={problemNotes}
                  onChange={(e) => setProblemNotes(e.target.value)}
                />
              </div>
            )}

            <label className="text-xs font-bold">نتیجه / توضیحات نصب</label>
            <textarea
              className="w-full rounded-xl border px-3 py-2 mb-2"
              rows={3}
              value={resultNotes}
              disabled={detail.status === "DONE"}
              onChange={(e) => setResultNotes(e.target.value)}
            />

            {detail.status !== "DONE" && (
              <input
                type="file"
                accept="image/*,video/*"
                className="text-sm mb-2"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  try {
                    const up = await uploadFile(f)
                    setResultFiles((prev) => [...prev, up])
                  } catch {
                    alert("خطا در آپلود")
                  }
                }}
              />
            )}
            {resultFiles.length > 0 && (
              <ul className="text-xs text-teal-800 mb-3">
                {resultFiles.map((f) => (
                  <li key={f.url}>
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      {f.name}
                    </a>
                  </li>
                ))}
              </ul>
            )}

            <div className="mb-3 rounded-xl border border-teal-200 bg-teal-50/40 p-3">
              <p className="text-xs font-bold text-blue-900 mb-2">ویس نصاب</p>
              {detail.status !== "DONE" && (
                <div className="flex flex-wrap gap-2 mb-2">
                  <button
                    type="button"
                    onClick={toggleRecording}
                    className={`rounded-xl px-4 py-2 text-sm font-bold text-white ${
                      recording ? "bg-red-600" : "bg-teal-600"
                    }`}
                  >
                    {recording ? "توقف و ذخیره" : "ضبط ویس"}
                  </button>
                  <label className="cursor-pointer rounded-xl border bg-white px-3 py-2 text-xs font-bold">
                    انتخاب فایل
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        try {
                          const up = await uploadFile(f)
                          setVoiceFiles((prev) => [...prev, up])
                        } catch {
                          alert("خطا در آپلود")
                        }
                      }}
                    />
                  </label>
                </div>
              )}
              {voiceFiles.map((f, i) => (
                <div key={f.url} className="flex items-center gap-2 mb-1">
                  <audio controls src={f.url} className="h-9 flex-1" />
                  <span className="text-xs">ویس {i + 1}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <button
                className="rounded-xl border px-4 py-2 font-bold"
                onClick={() => setDetail(null)}
              >
                بستن
              </button>
              {detail.status !== "DONE" && (
                <>
                  <button
                    disabled={actionLoading}
                    className="rounded-xl bg-blue-800 text-white font-bold px-4 py-2"
                    onClick={saveDraft}
                  >
                    ذخیره پیش‌نویس
                  </button>
                  <button
                    disabled={actionLoading}
                    className="rounded-xl bg-red-600 text-white font-bold px-4 py-2"
                    onClick={markProblem}
                  >
                    ثبت مشکل
                  </button>
                  <button
                    disabled={actionLoading}
                    className="rounded-xl bg-green-600 text-white font-bold px-4 py-2"
                    onClick={markDone}
                  >
                    اتمام نصب
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}