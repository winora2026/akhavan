"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import DatePicker, { DateObject } from "react-multi-date-picker"
import persian from "react-date-object/calendars/persian"
import persian_fa from "react-date-object/locales/persian_fa"

const INSTALLER_NAME = "آقای هادی زنگنه"
const INSTALLER_PHONE = "09127372431"

type Measurement = {
  id: string
  measurementNumber: string
  introducerName?: string | null
  sources?: string | null
  customerName: string
  phones: string
  address?: string | null
  addressMedia?: string | null
  region?: string | null
  workTypes?: string | null
  workTypeOther?: string | null
  requestDate: string
  measurementDate?: string | null
  appointmentDate?: string | null
  appointmentTimeFrom?: string | null
  appointmentTimeTo?: string | null
  appointmentFixed?: boolean | null
  smsSentAt?: string | null
  installerName?: string | null
  installerPhone?: string | null
  status: string
  salesRep?: string | null
  assignedTo?: string | null
  resultNotes?: string | null
  resultMedia?: string | null
  voiceNotes?: string | null
  orderNumber?: string | null
  notes?: string | null
  createdAt: string
}

type SortKey =
  | "measurementNumber"
  | "customerName"
  | "introducerName"
  | "region"
  | "address"
  | "measurementDate"
  | "appointmentDate"
  | "requestDate"
  | "salesRep"
  | "status"

const SOURCE_OPTIONS = [
  "مشتری حضوری",
  "تلفن",
  "واتساپ",
  "اینستاگرام",
  "سایت",
  "معرف",
  "سایر",
]

const WORK_OPTIONS = [
  "آینه دکوراتیو",
  "پارتیشن",
  "سکوریت",
  "حمام شیشه‌ای",
  "نرده شیشه‌ای",
  "باکس",
  "الگویی",
  "سایر",
]

const REGION_OPTIONS = [
  "غرب تهران",
  "شرق تهران",
  "شمال تهران",
  "جنوب تهران",
  "مرکز تهران",
  "کرج / حومه",
  "سایر",
]

const HOUR_OPTIONS = Array.from({ length: 13 }, (_, i) => {
  const h = i + 8 // 08 تا 20
  return `${String(h).padStart(2, "0")}:00`
})

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

function formatFaDateTime(dt?: string | null) {
  if (!dt) return "—"
  try {
    return new Date(dt).toLocaleString("fa-IR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return "—"
  }
}

function defaultMeasurementDate(): DateObject {
  const d = new Date()
  d.setDate(d.getDate() + 2)
  return new DateObject({ date: d, calendar: persian, locale: persian_fa })
}

function guessRegionFromAddress(address?: string | null): string {
  if (!address) return ""
  const a = address.replace(/ي/g, "ی").replace(/ك/g, "ک")
  if (/کرج|فردیس|نظرآباد|هشتگرد/i.test(a)) return "کرج / حومه"
  if (/ستارخان|صادقیه|پونک|جنت.?آباد|آریاشهر|سعادت.?آباد|شهرک غرب|آزادگان|آزادی|اکباتان|تهرانسر|چیتگر|وردآورد|مرزداران|کاشانی|فردوس|شهرزیبا|شهران|شهرک هما|باغ فیض|بلوار فردوس/i.test(a))
    return "غرب تهران"
  if (/تهرانپارس|نارمک|رسالت|پیروزی|حکیمیه|لویزان|هنگام|دماوند/i.test(a)) return "شرق تهران"
  if (/نیاوران|فرمانیه|الهیه|تجریش|ولنجک|زعفرانیه|کاشانک|قیطریه|دزاشیب|دربند|پاسداران|اقدسیه|سوهانک|کردستان|حکیم|ونک|گاندی|میرداماد|آرژانتین|شریعتی/i.test(a))
    return "شمال تهران"
  if (/راه‌آهن|نازی.?آباد|خانی.?آباد|جوادیه|شاپور|مولوی|شوش|بازار/i.test(a))
    return "جنوب تهران"
  if (/انقلاب|کریم‌خان|ولی.?عصر|مرکز|فردوسی|حسن.?آباد/i.test(a)) return "مرکز تهران"
  return ""
}

function buildSmsText(row: {
  customerName: string
  appointmentDate?: string | null
  appointmentTimeFrom?: string | null
  appointmentTimeTo?: string | null
}) {
  const dateFa = formatFa(row.appointmentDate)
  const from = row.appointmentTimeFrom || "—"
  const to = row.appointmentTimeTo || "—"
  return (
    `مشتری گرامی ${row.customerName}،\n` +
    `${INSTALLER_NAME}، نصاب شرکت شیشه و آینه اخوان، در تاریخ ${dateFa} بین ساعت ${from} تا ${to} برای اندازه‌گیری در محل شما حضور می‌یابد.\n` +
    `هماهنگی مجدد: ${INSTALLER_PHONE}`
  )
}

/** منطقه‌ی مؤثر: مقدار ثبت‌شده، وگرنه حدس از آدرس (برای رکوردهای قدیمی) */
function regionOf(row: { region?: string | null; address?: string | null }) {
  return row.region || guessRegionFromAddress(row.address) || ""
}

/** شروع بازه قرار = تاریخ + ساعت from */
function appointmentStartMs(row: Measurement): number | null {
  if (!row.appointmentDate || !row.appointmentTimeFrom) return null
  const d = new Date(row.appointmentDate)
  const [hh, mm] = row.appointmentTimeFrom.split(":").map(Number)
  if (Number.isNaN(hh)) return null
  d.setHours(hh, mm || 0, 0, 0)
  return d.getTime()
}

export default function MeasurementPage() {
  const [tab, setTab] = useState<"PENDING" | "DONE">("PENDING")
  const [items, setItems] = useState<Measurement[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [regionFilter, setRegionFilter] = useState("همه")
  const [sortKey, setSortKey] = useState<SortKey>("region")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Measurement | null>(null)
  const [saving, setSaving] = useState(false)
  const [currentUser, setCurrentUser] = useState("")

  // فرم ثبت (فروش)
  const [introducerName, setIntroducerName] = useState("")
  const [sources, setSources] = useState<string[]>([])
  const [customerName, setCustomerName] = useState("")
  const [phones, setPhones] = useState<string[]>([""])
  const [address, setAddress] = useState("")
  const [region, setRegion] = useState("")
  const [addressFiles, setAddressFiles] = useState<{ url: string; name: string }[]>([])
  const [workTypes, setWorkTypes] = useState<string[]>([])
  const [workTypeOther, setWorkTypeOther] = useState("")
  const [requestDate, setRequestDate] = useState<any>(
    new DateObject({ calendar: persian, locale: persian_fa })
  )
  const [measurementDate, setMeasurementDate] = useState<any>(defaultMeasurementDate())
  const [notes, setNotes] = useState("")

  // پنل نصاب
  const [detail, setDetail] = useState<Measurement | null>(null)
  const [resultNotes, setResultNotes] = useState("")
  const [resultFiles, setResultFiles] = useState<{ url: string; name: string; type?: string }[]>([])
  const [voiceFiles, setVoiceFiles] = useState<{ url: string; name: string }[]>([])
  const [recording, setRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recChunksRef = useRef<Blob[]>([])
  const [actionLoading, setActionLoading] = useState(false)

  // هماهنگی وقت
  const [apptDate, setApptDate] = useState<any>(null)
  const [apptFrom, setApptFrom] = useState("10:00")
  const [apptTo, setApptTo] = useState("11:00")
  const [reminders, setReminders] = useState<
    { id: string; title: string; body: string }[]
  >([])
  const remindedRef = useRef<Set<string>>(new Set())

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
    // اجازه نوتیفیکیشن مرورگر (برای یادآوری ۳۰ دقیقه قبل)
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission().catch(() => {})
      }
    }
  }, [])

  const fetchList = async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/measurements?status=${tab}&q=${encodeURIComponent(search)}`
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

  // یادآوری حدود ۳۰ دقیقه قبل از قرار
  useEffect(() => {
    const tick = () => {
      const now = Date.now()
      const next: { id: string; title: string; body: string }[] = []
      for (const row of items) {
        if (row.status === "DONE" || !row.appointmentFixed) continue
        const start = appointmentStartMs(row)
        if (start == null) continue
        const diff = start - now
        // پنجره ۱۵ تا ۳۵ دقیقه قبل (هر بار رفرش لیست هم چک می‌شود)
        if (diff > 15 * 60 * 1000 && diff <= 35 * 60 * 1000) {
          const key = `${row.id}-${row.appointmentDate}-${row.appointmentTimeFrom}`
          if (remindedRef.current.has(key)) continue
          remindedRef.current.add(key)
          const title = `یادآوری اندازه‌گیری`
          const body = `${row.customerName} — ${formatFa(row.appointmentDate)} ساعت ${row.appointmentTimeFrom} تا ${row.appointmentTimeTo}\n${row.address || ""}`
          next.push({ id: row.id, title, body })
          if (typeof window !== "undefined" && "Notification" in window) {
            if (Notification.permission === "granted") {
              try {
                new Notification(title, { body, dir: "rtl" })
              } catch {}
            }
          }
        }
      }
      if (next.length) setReminders((prev) => [...next, ...prev].slice(0, 5))
    }
    tick()
    const t = setInterval(tick, 60 * 1000)
    return () => clearInterval(t)
  }, [items])

  const filtered = useMemo(() => {
    if (regionFilter === "همه") return items
    if (regionFilter === "نامشخص") return items.filter((r) => !regionOf(r))
    return items.filter((r) => regionOf(r) === regionFilter)
  }, [items, regionFilter])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      if (sortKey === "measurementNumber") {
        const diff =
          Number(a.measurementNumber || 0) - Number(b.measurementNumber || 0)
        return sortDir === "asc" ? diff : -diff
      }
      const av =
        sortKey === "region"
          ? regionOf(a)
          : String((a as any)[sortKey] ?? "")
      const bv =
        sortKey === "region"
          ? regionOf(b)
          : String((b as any)[sortKey] ?? "")
      if (av < bv) return sortDir === "asc" ? -1 : 1
      if (av > bv) return sortDir === "asc" ? 1 : -1
      // سورت ثانویه روی آدرس برای کارهای هم‌منطقه
      return String(a.address || "").localeCompare(String(b.address || ""), "fa")
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

  const toggleIn = (list: string[], value: string, set: (v: string[]) => void) => {
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value])
  }

  const uploadFile = async (file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch("/api/upload", { method: "POST", body: fd })
    if (!res.ok) throw new Error("آپلود ناموفق")
    return res.json() as Promise<{ url: string; name: string; type?: string }>
  }

  const resetForm = () => {
    setIntroducerName("")
    setSources([])
    setCustomerName("")
    setPhones([""])
    setAddress("")
    setRegion("")
    setAddressFiles([])
    setWorkTypes([])
    setWorkTypeOther("")
    setRequestDate(new DateObject({ calendar: persian, locale: persian_fa }))
    setMeasurementDate(defaultMeasurementDate())
    setNotes("")
  }

  const openNew = () => {
    setEditing(null)
    resetForm()
    setShowForm(true)
  }

  const openEdit = (row: Measurement) => {
    setEditing(row)
    setIntroducerName(row.introducerName || "")
    setSources(parseJsonArray(row.sources))
    setCustomerName(row.customerName || "")
    const ph = parseJsonArray(row.phones)
    setPhones(ph.length ? ph : [""])
    setAddress(row.address || "")
    setRegion(row.region || guessRegionFromAddress(row.address) || "")
    setAddressFiles(
      parseJsonArray(row.addressMedia).map((url) => ({
        url,
        name: url.split("/").pop() || "file",
      }))
    )
    setWorkTypes(parseJsonArray(row.workTypes))
    setWorkTypeOther(row.workTypeOther || "")
    setRequestDate(
      row.requestDate
        ? new DateObject({
            date: new Date(row.requestDate),
            calendar: persian,
            locale: persian_fa,
          })
        : new DateObject({ calendar: persian, locale: persian_fa })
    )
    setMeasurementDate(
      row.measurementDate
        ? new DateObject({
            date: new Date(row.measurementDate),
            calendar: persian,
            locale: persian_fa,
          })
        : defaultMeasurementDate()
    )
    setNotes(row.notes || "")
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditing(null)
  }

  const deleteRow = async (row: Measurement) => {
    if (
      !confirm(
        `درخواست شماره ${row.measurementNumber} (${row.customerName}) حذف شود؟`
      )
    )
      return
    try {
      const res = await fetch(`/api/measurements/${row.id}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "خطا در حذف")
      fetchList()
    } catch (e: any) {
      alert(e.message || "خطا در حذف")
    }
  }

  const submitForm = async () => {
    if (!customerName.trim()) return alert("نام مشتری الزامی است")
    const cleanPhones = phones.map((p) => p.trim()).filter(Boolean)
    if (!cleanPhones.length) return alert("حداقل یک شماره تلفن لازم است")

    const resolvedRegion =
      region || guessRegionFromAddress(address) || null

    setSaving(true)
    try {
      const res = await fetch(
        editing ? `/api/measurements/${editing.id}` : "/api/measurements",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            introducerName,
            sources,
            customerName,
            phones: cleanPhones,
            address,
            region: resolvedRegion,
            addressMedia: addressFiles.map((f) => f.url),
            workTypes,
            workTypeOther,
            requestDate:
              requestDate?.toDate?.()?.toISOString?.() || new Date().toISOString(),
            measurementDate:
              measurementDate?.toDate?.()?.toISOString?.() ||
              new Date(Date.now() + 2 * 86400000).toISOString(),
            notes,
            installerName: INSTALLER_NAME,
            installerPhone: INSTALLER_PHONE,
            ...(editing ? {} : { salesRep: currentUser }),
          }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا")
      const editedNumber = editing?.measurementNumber
      setShowForm(false)
      setEditing(null)
      resetForm()
      if (!editing) setTab("PENDING")
      fetchList()
      alert(
        editedNumber
          ? `ویرایش شد: ${editedNumber}`
          : `ثبت شد: ${data.item?.measurementNumber || ""}`
      )
    } catch (e: any) {
      alert(e.message || "خطا در ثبت")
    } finally {
      setSaving(false)
    }
  }

  const openDetail = (row: Measurement) => {
    setDetail(row)
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
    setApptDate(
      row.appointmentDate
        ? new DateObject({
            date: new Date(row.appointmentDate),
            calendar: persian,
            locale: persian_fa,
          })
        : row.measurementDate
          ? new DateObject({
              date: new Date(row.measurementDate),
              calendar: persian,
              locale: persian_fa,
            })
          : defaultMeasurementDate()
    )
    setApptFrom(row.appointmentTimeFrom || "10:00")
    setApptTo(row.appointmentTimeTo || "11:00")
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
      alert(
        "دسترسی به میکروفون ممکن نشد. از دکمه‌ی «انتخاب فایل ویس» استفاده کنید."
      )
    }
  }

  const sendAppointmentSms = async (row: Measurement, payload: {
    appointmentDate: string
    appointmentTimeFrom: string
    appointmentTimeTo: string
  }) => {
    const phoneList = parseJsonArray(row.phones)
    if (!phoneList.length) return { ok: false, error: "شماره مشتری ثبت نشده" }
    const text = buildSmsText({
      customerName: row.customerName,
      ...payload,
    })
    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: phoneList,
          text,
          measurementId: row.id,
          kind: "measurement_appointment",
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // اگر پنل پیامک هنوز وصل نیست، فقط هشدار می‌دهیم
        return {
          ok: false,
          error: data.error || "ارسال پیامک انجام نشد (پنل پیامک را بررسی کنید)",
        }
      }
      if (data.mock) {
        return {
          ok: false,
          error: "پنل پیامک در حالت آزمایشی است — پیامک واقعی ارسال نشد",
        }
      }
      return { ok: true }
    } catch {
      return { ok: false, error: "ارتباط با سرویس پیامک برقرار نشد" }
    }
  }

  /** فیکس یا موکول کردن وقت + پیامک */
  const saveAppointment = async (reschedule: boolean) => {
    if (!detail) return
    if (!apptDate) return alert("تاریخ را انتخاب کنید")
    if (!apptFrom || !apptTo) return alert("بازه ساعت را مشخص کنید")
    if (apptFrom >= apptTo) return alert("ساعت پایان باید بعد از شروع باشد")

    const iso =
      apptDate?.toDate?.()?.toISOString?.() ||
      new Date().toISOString()

    setActionLoading(true)
    try {
      const body = {
        appointmentDate: iso,
        appointmentTimeFrom: apptFrom,
        appointmentTimeTo: apptTo,
        appointmentFixed: true,
        measurementDate: iso,
        installerName: INSTALLER_NAME,
        installerPhone: INSTALLER_PHONE,
        assignedTo: currentUser || INSTALLER_NAME,
        status: "PENDING",
        ...(reschedule
          ? { notes: `${detail.notes || ""}\n[موکول] به ${formatFa(iso)} ${apptFrom}-${apptTo}`.trim() }
          : {}),
      }
      const res = await fetch(`/api/measurements/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا در ذخیره وقت")

      const sms = await sendAppointmentSms(detail, {
        appointmentDate: iso,
        appointmentTimeFrom: apptFrom,
        appointmentTimeTo: apptTo,
      })

      alert(
        sms.ok
          ? reschedule
            ? "وقت جدید ثبت و پیامک برای مشتری ارسال شد."
            : "وقت فیکس شد و پیامک برای مشتری ارسال شد."
          : `وقت ذخیره شد. پیامک: ${sms.error || "ارسال نشد"}`
      )
      setDetail(null)
      fetchList()
    } catch (e: any) {
      alert(e.message || "خطا")
    } finally {
      setActionLoading(false)
    }
  }

  const saveInstaller = async (markDone: boolean) => {
    if (!detail) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/measurements/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resultNotes,
          resultMedia: resultFiles.map((f) => f.url),
          voiceNotes: voiceFiles.map((f) => f.url),
          status: markDone ? "DONE" : detail.status,
          assignedTo: currentUser || INSTALLER_NAME,
          installerName: INSTALLER_NAME,
          installerPhone: INSTALLER_PHONE,
        }),
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

  const PhoneLinks = ({ raw }: { raw?: string | null }) => {
    const list = parseJsonArray(raw)
    if (!list.length) return <span>—</span>
    return (
      <span className="inline-flex flex-col gap-0.5 items-center">
        {list.map((p) => (
          <a
            key={p}
            href={`tel:${p.replace(/[^\d+]/g, "")}`}
            className="text-teal-800 font-bold underline dir-ltr"
            onClick={(e) => e.stopPropagation()}
          >
            {p}
          </a>
        ))}
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
        {/* یادآوری پاپ‌آپ */}
        {reminders.length > 0 && (
          <div className="fixed top-4 left-4 right-4 z-[60] flex flex-col gap-2 md:left-auto md:w-96">
            {reminders.map((r) => (
              <div
                key={r.id + r.title}
                className="rounded-2xl border border-amber-400 bg-amber-50 shadow-xl p-4"
              >
                <p className="font-black text-amber-900">{r.title}</p>
                <p className="text-sm text-amber-900 whitespace-pre-line mt-1">
                  {r.body}
                </p>
                <p className="text-xs text-amber-800 mt-1">
                  نصاب: {INSTALLER_NAME} —{" "}
                  <a className="underline" href={`tel:${INSTALLER_PHONE}`}>
                    {INSTALLER_PHONE}
                  </a>
                </p>
                <button
                  className="mt-2 text-xs font-bold text-amber-900 underline"
                  onClick={() =>
                    setReminders((prev) => prev.filter((x) => x.id !== r.id))
                  }
                >
                  بستن
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-xl border border-teal-300 bg-white/80 px-4 py-2 font-bold text-blue-900"
            >
              بازگشت
            </Link>
            <h1 className="text-xl md:text-2xl font-black text-blue-950">
              اندازه‌گیری
            </h1>
          </div>
          <div className="text-xs md:text-sm font-bold text-blue-900 bg-white/80 rounded-xl px-3 py-2 border border-teal-200">
            نصاب: {INSTALLER_NAME}{" "}
            <a href={`tel:${INSTALLER_PHONE}`} className="text-teal-700 underline dir-ltr">
              {INSTALLER_PHONE}
            </a>
          </div>
          <button
            onClick={openNew}
            className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold px-5 py-2.5 shadow"
          >
            + ثبت درخواست (فروش)
          </button>
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

        {/* فیلتر */}
        <div className="rounded-2xl bg-white/85 backdrop-blur border border-teal-200 p-4 mb-4 shadow flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-bold text-blue-900 mb-1">
              جستجو
            </label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="نام، تلفن، معرف، شماره، آدرس..."
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
                className="rounded-full bg-white/90 border border-teal-300 px-3 py-1 text-xs font-bold text-blue-900"
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
                    onClick={() => toggleSort("measurementNumber")}
                  >
                    شماره{sortMark("measurementNumber")}
                  </th>
                  <th
                    className="p-2 border border-teal-800 cursor-pointer"
                    onClick={() => toggleSort("customerName")}
                  >
                    مشتری{sortMark("customerName")}
                  </th>
                  <th
                    className="p-2 border border-teal-800 cursor-pointer"
                    onClick={() => toggleSort("introducerName")}
                  >
                    معرف{sortMark("introducerName")}
                  </th>
                  <th className="p-2 border border-teal-800">تلفن</th>
                  <th
                    className="p-2 border border-teal-800 cursor-pointer"
                    onClick={() => toggleSort("region")}
                  >
                    منطقه{sortMark("region")}
                  </th>
                  <th
                    className="p-2 border border-teal-800 cursor-pointer"
                    onClick={() => toggleSort("address")}
                  >
                    آدرس{sortMark("address")}
                  </th>
                  <th className="p-2 border border-teal-800">نوع کار</th>
                  <th
                    className="p-2 border border-teal-800 cursor-pointer"
                    onClick={() => toggleSort("requestDate")}
                  >
                    ثبت{sortMark("requestDate")}
                  </th>
                  <th
                    className="p-2 border border-teal-800 cursor-pointer"
                    onClick={() => toggleSort("appointmentDate")}
                  >
                    وقت هماهنگی{sortMark("appointmentDate")}
                  </th>
                  <th
                    className="p-2 border border-teal-800 cursor-pointer"
                    onClick={() => toggleSort("salesRep")}
                  >
                    کارشناس{sortMark("salesRep")}
                  </th>
                  <th className="p-2 border border-teal-800">وضعیت</th>
                  <th className="p-2 border border-teal-800">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, idx) => {
                  const wt = [
                    ...parseJsonArray(row.workTypes),
                    row.workTypeOther || "",
                  ]
                    .filter(Boolean)
                    .join("، ")
                  const apptLabel = row.appointmentFixed
                    ? `${formatFa(row.appointmentDate)} ${row.appointmentTimeFrom || ""}–${row.appointmentTimeTo || ""}`
                    : formatFa(row.measurementDate)
                  return (
                    <tr
                      key={row.id}
                      className="odd:bg-white even:bg-teal-50/40 hover:bg-teal-100/50"
                    >
                      <td className="p-2 border border-teal-100 text-center font-bold">
                        {idx + 1}
                      </td>
                      <td className="p-2 border border-teal-100 text-center font-black text-teal-800">
                        {row.measurementNumber}
                      </td>
                      <td className="p-2 border border-teal-100 font-bold">
                        {row.customerName}
                      </td>
                      <td className="p-2 border border-teal-100 text-center text-xs">
                        {row.introducerName || "—"}
                      </td>
                      <td className="p-2 border border-teal-100 text-center">
                        <PhoneLinks raw={row.phones} />
                      </td>
                      <td className="p-2 border border-teal-100 text-center text-xs font-bold">
                        {regionOf(row) || "—"}
                      </td>
                      <td className="p-2 border border-teal-100 text-xs max-w-[220px] break-words">
                        {row.address || "—"}
                      </td>
                      <td className="p-2 border border-teal-100 text-xs">
                        {wt || "—"}
                      </td>
                      <td className="p-2 border border-teal-100 text-center">
                        {formatFa(row.requestDate)}
                      </td>
                      <td className="p-2 border border-teal-100 text-center font-semibold text-xs">
                        {apptLabel}
                        {row.appointmentFixed ? (
                          <span className="block text-[10px] text-green-700">
                            فیکس‌شده
                          </span>
                        ) : null}
                      </td>
                      <td className="p-2 border border-teal-100 text-center">
                        {row.salesRep || "—"}
                      </td>
                      <td className="p-2 border border-teal-100 text-center">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            row.status === "DONE"
                              ? "bg-green-100 text-green-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {row.status === "DONE" ? "انجام‌شده" : "انجام‌نشده"}
                        </span>
                      </td>
                      <td className="p-2 border border-teal-100 text-center whitespace-nowrap">
                        <div className="flex flex-wrap gap-1 justify-center">
                          <button
                            onClick={() => openDetail(row)}
                            className="rounded-lg bg-blue-900 text-white text-xs font-bold px-2.5 py-1.5"
                          >
                            {row.status === "PENDING"
                              ? "نصاب / وقت"
                              : "مشاهده"}
                          </button>
                          <button
                            onClick={() => openEdit(row)}
                            className="rounded-lg border border-blue-800 text-blue-900 text-xs font-bold px-2.5 py-1.5 hover:bg-blue-50"
                          >
                            ویرایش
                          </button>
                          <button
                            onClick={() => deleteRow(row)}
                            className="rounded-lg bg-red-600 text-white text-xs font-bold px-2.5 py-1.5 hover:bg-red-700"
                          >
                            حذف
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <p className="mt-2 text-xs text-blue-900/80 font-semibold">
          ثبت درخواست توسط کارشناس فروش است. تعیین وقت، پیامک مشتری و تکمیل
          نتیجه توسط نصاب ({INSTALLER_NAME}) انجام می‌شود. برای تماس مستقیم روی
          شماره تلفن بزنید.
        </p>
      </div>

      {/* مودال ثبت فروش */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-5 shadow-2xl">
            <h2 className="text-lg font-black text-blue-950 mb-4">
              {editing
                ? `ویرایش درخواست اندازه‌گیری (${editing.measurementNumber})`
                : "ثبت درخواست اندازه‌گیری"}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold">نام معرف</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={introducerName}
                  onChange={(e) => setIntroducerName(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-bold mb-1 block">ورودی از کجا؟</label>
                <div className="flex flex-wrap gap-2">
                  {SOURCE_OPTIONS.map((s) => (
                    <label
                      key={s}
                      className="flex items-center gap-1 text-sm border rounded-lg px-2 py-1"
                    >
                      <input
                        type="checkbox"
                        checked={sources.includes(s)}
                        onChange={() => toggleIn(sources, s, setSources)}
                      />
                      {s}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold">نام و نام خانوادگی *</label>
                <input
                  className="w-full rounded-xl border px-3 py-2 font-bold"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-bold mb-1 block">شماره تلفن *</label>
                {phones.map((p, i) => (
                  <div key={i} className="flex gap-2 mb-1">
                    <input
                      className="flex-1 rounded-xl border px-3 py-2"
                      dir="ltr"
                      value={p}
                      onChange={(e) => {
                        const next = [...phones]
                        next[i] = e.target.value
                        setPhones(next)
                      }}
                    />
                    {phones.length > 1 && (
                      <button
                        type="button"
                        className="text-red-600 font-bold px-2"
                        onClick={() =>
                          setPhones(phones.filter((_, j) => j !== i))
                        }
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="text-teal-700 text-sm font-bold"
                  onClick={() => setPhones([...phones, ""])}
                >
                  + تلفن دیگر
                </button>
              </div>

              <div>
                <label className="text-xs font-bold">آدرس *</label>
                <textarea
                  className="w-full rounded-xl border px-3 py-2"
                  rows={2}
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value)
                    if (!region) {
                      const g = guessRegionFromAddress(e.target.value)
                      if (g) setRegion(g)
                    }
                  }}
                />
                <label className="text-xs font-bold mt-2 block">منطقه</label>
                <select
                  className="w-full rounded-xl border px-3 py-2"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                >
                  <option value="">— انتخاب منطقه —</option>
                  {REGION_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="mt-1 text-sm"
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    try {
                      const up = await uploadFile(f)
                      setAddressFiles((prev) => [...prev, up])
                    } catch {
                      alert("خطا در آپلود")
                    }
                  }}
                />
                {addressFiles.length > 0 && (
                  <ul className="text-xs mt-1 text-teal-800">
                    {addressFiles.map((f) => (
                      <li key={f.url}>📎 {f.name}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <label className="text-xs font-bold mb-1 block">نوع کار</label>
                <div className="flex flex-wrap gap-2">
                  {WORK_OPTIONS.map((w) => (
                    <label
                      key={w}
                      className="flex items-center gap-1 text-sm border rounded-lg px-2 py-1"
                    >
                      <input
                        type="checkbox"
                        checked={workTypes.includes(w)}
                        onChange={() => toggleIn(workTypes, w, setWorkTypes)}
                      />
                      {w}
                    </label>
                  ))}
                </div>
                {workTypes.includes("سایر") && (
                  <input
                    className="w-full rounded-xl border px-3 py-2 mt-1"
                    placeholder="توضیح نوع کار"
                    value={workTypeOther}
                    onChange={(e) => setWorkTypeOther(e.target.value)}
                  />
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold block mb-1">تاریخ ثبت</label>
                  <DatePicker
                    value={requestDate}
                    onChange={setRequestDate}
                    calendar={persian}
                    locale={persian_fa}
                    calendarPosition="bottom-right"
                    inputClass="w-full rounded-xl border px-3 py-2"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1">
                    تاریخ پیشنهادی اندازه‌گیری
                  </label>
                  <DatePicker
                    value={measurementDate}
                    onChange={setMeasurementDate}
                    calendar={persian}
                    locale={persian_fa}
                    calendarPosition="bottom-right"
                    inputClass="w-full rounded-xl border px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold">توضیحات</label>
                <textarea
                  className="w-full rounded-xl border px-3 py-2"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                className="rounded-xl border px-4 py-2 font-bold"
                onClick={closeForm}
              >
                انصراف
              </button>
              <button
                disabled={saving}
                className="rounded-xl bg-teal-600 text-white font-bold px-5 py-2 disabled:opacity-50"
                onClick={submitForm}
              >
                {saving ? "..." : editing ? "ذخیره تغییرات" : "ثبت درخواست"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* مودال نصاب */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[92vh] overflow-y-auto p-5 shadow-2xl">
            <h2 className="text-lg font-black text-blue-950 mb-1">
              {detail.measurementNumber} — {detail.customerName}
            </h2>
            <p className="text-sm text-gray-600 mb-1">
              معرف: {detail.introducerName || "—"} | منطقه:{" "}
              {regionOf(detail) || "—"}
            </p>
            <p className="text-sm text-gray-600 mb-1">
              آدرس: {detail.address || "—"}
            </p>
            <p className="text-sm text-gray-600 mb-3">
              تلفن:{" "}
              {parseJsonArray(detail.phones).map((p, i) => (
                <span key={p}>
                  {i > 0 ? " / " : ""}
                  <a className="text-teal-800 font-bold underline dir-ltr" href={`tel:${p}`}>
                    {p}
                  </a>
                </span>
              ))}
            </p>
            <p className="text-xs text-blue-800 mb-3">
              کارشناس: {detail.salesRep || "—"} | نصاب: {INSTALLER_NAME}{" "}
              <a className="underline dir-ltr" href={`tel:${INSTALLER_PHONE}`}>
                {INSTALLER_PHONE}
              </a>
            </p>

            {/* هماهنگی وقت */}
            {detail.status !== "DONE" && (
              <div className="mb-4 rounded-xl border border-teal-300 bg-teal-50/50 p-3">
                <p className="text-sm font-black text-blue-950 mb-2">
                  هماهنگی وقت اندازه‌گیری
                </p>
                {detail.appointmentFixed && (
                  <p className="text-xs text-green-800 font-bold mb-2">
                    وقت فعلی: {formatFa(detail.appointmentDate)} ساعت{" "}
                    {detail.appointmentTimeFrom} تا {detail.appointmentTimeTo}
                    {detail.smsSentAt
                      ? ` — پیامک: ${formatFaDateTime(detail.smsSentAt)}`
                      : ""}
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                  <div>
                    <label className="text-xs font-bold block mb-1">تاریخ</label>
                    <DatePicker
                      value={apptDate}
                      onChange={setApptDate}
                      calendar={persian}
                      locale={persian_fa}
                      calendarPosition="bottom-right"
                      inputClass="w-full rounded-xl border px-2 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold block mb-1">از ساعت</label>
                    <select
                      className="w-full rounded-xl border px-2 py-2 text-sm"
                      value={apptFrom}
                      onChange={(e) => setApptFrom(e.target.value)}
                    >
                      {HOUR_OPTIONS.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold block mb-1">تا ساعت</label>
                    <select
                      className="w-full rounded-xl border px-2 py-2 text-sm"
                      value={apptTo}
                      onChange={(e) => setApptTo(e.target.value)}
                    >
                      {HOUR_OPTIONS.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => saveAppointment(false)}
                    className="rounded-xl bg-teal-600 text-white text-xs font-bold px-3 py-2 disabled:opacity-50"
                  >
                    فیکس وقت + پیامک به مشتری
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => saveAppointment(true)}
                    className="rounded-xl bg-amber-500 text-white text-xs font-bold px-3 py-2 disabled:opacity-50"
                  >
                    موکول به تاریخ جدید + پیامک
                  </button>
                </div>
              </div>
            )}

            <label className="text-xs font-bold">توضیحات نصاب / نتیجه</label>
            <textarea
              className="w-full rounded-xl border px-3 py-2 mb-2"
              rows={3}
              value={resultNotes}
              onChange={(e) => setResultNotes(e.target.value)}
              disabled={detail.status === "DONE"}
            />

            {detail.status !== "DONE" && (
              <input
                type="file"
                accept="image/*,video/*,audio/*"
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
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={toggleRecording}
                    className={`rounded-xl px-4 py-2 text-sm font-bold text-white ${
                      recording
                        ? "bg-red-600 hover:bg-red-700"
                        : "bg-teal-600 hover:bg-teal-700"
                    }`}
                  >
                    {recording ? "توقف و ذخیره ویس" : "ضبط ویس"}
                  </button>
                  {recording && (
                    <span className="flex items-center gap-1 text-xs font-bold text-red-700">
                      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />
                      در حال ضبط...
                    </span>
                  )}
                  <label className="cursor-pointer rounded-xl border border-teal-300 bg-white px-3 py-2 text-xs font-bold text-teal-800 hover:bg-teal-50">
                    انتخاب فایل ویس
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
                          alert("خطا در آپلود ویس")
                        }
                        e.target.value = ""
                      }}
                    />
                  </label>
                </div>
              )}
              {voiceFiles.length === 0 ? (
                <p className="text-xs text-gray-500">ویسی ثبت نشده است</p>
              ) : (
                <ul className="space-y-1">
                  {voiceFiles.map((f, i) => (
                    <li key={f.url} className="flex items-center gap-2">
                      <audio controls src={f.url} className="h-9 flex-1" />
                      <span className="text-xs text-teal-800">ویس {i + 1}</span>
                      {detail.status !== "DONE" && (
                        <button
                          type="button"
                          className="px-1 font-bold text-red-600"
                          onClick={() =>
                            setVoiceFiles((prev) =>
                              prev.filter((x) => x.url !== f.url)
                            )
                          }
                        >
                          ×
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
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
                    onClick={() => saveInstaller(false)}
                  >
                    ذخیره پیش‌نویس
                  </button>
                  <button
                    disabled={actionLoading}
                    className="rounded-xl bg-green-600 text-white font-bold px-4 py-2"
                    onClick={() => saveInstaller(true)}
                  >
                    اتمام و انتقال به انجام‌شده
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