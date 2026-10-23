"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import DatePicker, { DateObject } from "react-multi-date-picker"
import persian from "react-date-object/calendars/persian"
import persian_fa from "react-date-object/locales/persian_fa"

const STATUS_LABEL: Record<string, string> = {
  NEW: "جدید",
  CONTACTED: "تماس گرفته",
  QUALIFIED: "واجد شرایط",
  UNQUALIFIED: "رد صلاحیت",
  CONVERTED: "تبدیل‌شده",
  LOST: "از دست رفته",
}

const SOURCE_LABEL: Record<string, string> = {
  Phone: "تلفن",
  WhatsApp: "واتساپ",
  Instagram: "اینستاگرام",
  Website: "وب‌سایت",
  Referral: "معرفی",
  "Walk-in": "حضوری",
  Other: "سایر",
}

function formatFa(dt?: string | null) {
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

export default function LeadDetailPage() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()

  const [lead, setLead] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState("")
  const [status, setStatus] = useState("")
  const [nextAction, setNextAction] = useState("")
  const [nextPicker, setNextPicker] = useState<DateObject | null>(null)
  const [nextActionDateIso, setNextActionDateIso] = useState("")
  const [lostReasons, setLostReasons] = useState<
    { id: string; name: string }[]
  >([])
  const [lostReasonId, setLostReasonId] = useState("")

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/crm/leads/${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا")
      setLead(data)
      setStatus(data.status)
      setNextAction(data.nextAction || "")
      setLostReasonId(data.lostReasonId || "")
      if (data.nextActionDate) {
        const d = new Date(data.nextActionDate)
        setNextActionDateIso(d.toISOString())
        setNextPicker(
          new DateObject({ date: d, calendar: persian, locale: persian_fa })
        )
      } else {
        setNextActionDateIso("")
        setNextPicker(null)
      }
    } catch (e: any) {
      alert(e.message || "خطا")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) load()
    ;(async () => {
      try {
        const res = await fetch("/api/crm/lost-reasons")
        const data = await res.json()
        if (res.ok) setLostReasons(Array.isArray(data) ? data : [])
      } catch {}
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const saveStatus = async () => {
    if (status === "LOST" && !lostReasonId) {
      alert("برای وضعیت از دست رفته، دلیل را انتخاب کنید")
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/crm/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          lostReasonId: status === "LOST" ? lostReasonId : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا")
      await load()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  const saveNextAction = async () => {
    if (!nextAction.trim() || !nextActionDateIso) {
      alert("اقدام بعدی و موعد الزامی است")
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/crm/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nextAction: nextAction.trim(),
          nextActionDate: nextActionDateIso,
          createFollowUp: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا")
      await load()
      alert("اقدام بعدی ثبت شد")
    } catch (e: any) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  const addNote = async () => {
    if (!note.trim()) return
    setBusy(true)
    try {
      const res = await fetch(`/api/crm/leads/${id}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "NOTE",
          title: "یادداشت",
          description: note.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا")
      setNote("")
      await load()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  const markFollowDone = async (followId: string) => {
    setBusy(true)
    try {
      const res = await fetch("/api/crm/follow-ups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: followId,
          status: "DONE",
          result: "انجام شد",
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا")
      await load()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  const convert = async () => {
    if (!confirm("این سرنخ به مشتری فروش تبدیل شود؟")) return
    setBusy(true)
    try {
      const res = await fetch(`/api/crm/leads/${id}/convert`, {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا")
      await load()
      alert("تبدیل به مشتری انجام شد")
    } catch (e: any) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  const goToPreInvoice = () => {
    const name = lead?.customer?.name || lead?.name
    if (!name) {
      alert("ابتدا به مشتری تبدیل کنید یا نام را بررسی کنید")
      return
    }
    try {
      localStorage.setItem(
        "crmLeadTransfer",
        JSON.stringify({
          customerName: name,
          mobile: lead?.mobile || lead?.customer?.phone || "",
          leadId: lead?.id,
        })
      )
    } catch {}
    router.push("/order/new?fromCrm=1")
  }

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center font-bold"
        dir="rtl"
      >
        در حال بارگذاری...
      </div>
    )
  }
  if (!lead) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        سرنخ یافت نشد
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 md:p-6" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-black text-blue-950">{lead.name}</h1>
            <p className="text-sm text-gray-600 mt-1">
              {SOURCE_LABEL[lead.source] || lead.source}
              {lead.city ? ` · ${lead.city}` : ""}
              {lead.mobile ? ` · ${lead.mobile}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/crm/leads"
              className="rounded-xl border px-4 py-2 font-bold bg-white"
            >
              لیست سرنخ‌ها
            </Link>
            <Link
              href="/crm/follow-ups"
              className="rounded-xl border px-4 py-2 font-bold bg-white"
            >
              کارتابل
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-teal-200 bg-white/95 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <p>
            <span className="text-xs text-gray-500">وضعیت: </span>
            <strong>{STATUS_LABEL[lead.status] || lead.status}</strong>
          </p>
          <p>
            <span className="text-xs text-gray-500">اقدام بعدی: </span>
            <strong>{lead.nextAction || "—"}</strong>
            {lead.nextActionDate ? (
              <span className="text-xs text-gray-500">
                {" "}
                ({formatFa(lead.nextActionDate)})
              </span>
            ) : null}
          </p>
          <p>
            <span className="text-xs text-gray-500">مشتری: </span>
            <strong>{lead.customer?.name || "هنوز تبدیل نشده"}</strong>
          </p>
          <p>
            <span className="text-xs text-gray-500">کارشناس: </span>
            <strong>{lead.assignedTo?.displayName || "—"}</strong>
          </p>
          {lead.lostReason?.name && (
            <p className="sm:col-span-2 text-red-700">
              دلیل باخت: <strong>{lead.lostReason.name}</strong>
            </p>
          )}
          {lead.productInterest && (
            <p className="sm:col-span-2">
              <span className="text-xs text-gray-500">علاقه محصول: </span>
              {lead.productInterest}
            </p>
          )}
          {lead.description && (
            <p className="sm:col-span-2 text-sm text-gray-700">
              {lead.description}
            </p>
          )}
        </div>

        {/* وضعیت + دلیل باخت */}
        <div className="rounded-2xl border border-teal-200 bg-white/95 p-4 flex flex-wrap gap-2 items-end">
          <div>
            <label className="text-xs font-bold block mb-1">تغییر وضعیت</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-xl border border-teal-300 px-3 py-2 font-semibold"
            >
              {Object.entries(STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          {status === "LOST" && (
            <div>
              <label className="text-xs font-bold block mb-1">دلیل باخت</label>
              <select
                value={lostReasonId}
                onChange={(e) => setLostReasonId(e.target.value)}
                className="rounded-xl border border-red-300 px-3 py-2 font-semibold"
              >
                <option value="">انتخاب کنید</option>
                {lostReasons.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={saveStatus}
            className="rounded-xl bg-blue-900 text-white font-bold px-4 py-2 disabled:opacity-50"
          >
            ذخیره وضعیت
          </button>
          {lead.status !== "CONVERTED" && (
            <button
              type="button"
              disabled={busy}
              onClick={convert}
              className="rounded-xl bg-teal-600 text-white font-bold px-4 py-2 disabled:opacity-50"
            >
              تبدیل به مشتری
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={goToPreInvoice}
            className="rounded-xl bg-green-600 text-white font-bold px-4 py-2 disabled:opacity-50"
          >
            ثبت پیش‌فاکتور
          </button>
        </div>

        {/* اقدام بعدی جدید */}
        <div className="rounded-2xl border border-orange-200 bg-white/95 p-4">
          <h2 className="font-black text-blue-950 mb-3">تعیین اقدام بعدی</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold block mb-1">اقدام</label>
              <input
                className="w-full rounded-xl border border-teal-300 px-3 py-2 font-semibold"
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                placeholder="مثلاً تماس مجدد / ارسال قیمت"
              />
            </div>
            <div>
              <label className="text-xs font-bold block mb-1">موعد</label>
              <DatePicker
                value={nextPicker}
                onChange={(d: DateObject | DateObject[] | null) => {
                  const dateObj = Array.isArray(d) ? d[0] : d
                  setNextPicker(dateObj || null)
                  if (!dateObj) {
                    setNextActionDateIso("")
                    return
                  }
                  setNextActionDateIso(dateObj.toDate().toISOString())
                }}
                calendar={persian}
                locale={persian_fa}
                format="YYYY/MM/DD"
                inputClass="w-full rounded-xl border border-teal-300 px-3 py-2 font-semibold"
                containerClassName="w-full"
                calendarPosition="bottom-right"
              />
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={saveNextAction}
            className="mt-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold px-4 py-2 disabled:opacity-50"
          >
            ثبت اقدام + پیگیری در کارتابل
          </button>
        </div>

        <div className="rounded-2xl border border-teal-200 bg-white/95 p-4">
          <h2 className="font-black text-blue-950 mb-2">ثبت یادداشت / تماس</h2>
          <textarea
            className="w-full rounded-xl border border-teal-300 px-3 py-2 mb-2"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="خلاصه تماس یا توضیح..."
          />
          <button
            type="button"
            disabled={busy || !note.trim()}
            onClick={addNote}
            className="rounded-xl bg-teal-600 text-white font-bold px-4 py-2 disabled:opacity-50"
          >
            ذخیره فعالیت
          </button>
        </div>

        <div className="rounded-2xl border border-orange-200 bg-white/95 p-4">
          <h2 className="font-black text-blue-950 mb-3">پیگیری‌ها</h2>
          {!lead.followUps?.length ? (
            <p className="text-gray-500 text-sm">پیگیری ثبت نشده</p>
          ) : (
            <ul className="space-y-2">
              {lead.followUps.map((f: any) => (
                <li
                  key={f.id}
                  className="flex flex-wrap justify-between gap-2 items-center text-sm border-b border-gray-100 pb-2"
                >
                  <span>
                    {f.description || f.type}{" "}
                    <span className="text-xs text-gray-500">
                      ({f.status === "DONE" ? "انجام‌شده" : "باز"}) ·{" "}
                      {formatFa(f.dueDate)}
                    </span>
                  </span>
                  {f.status === "PENDING" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => markFollowDone(f.id)}
                      className="rounded-lg bg-green-600 text-white text-xs font-bold px-3 py-1.5 disabled:opacity-50"
                    >
                      انجام شد
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-teal-200 bg-white/95 p-4">
          <h2 className="font-black text-blue-950 mb-3">تاریخچه</h2>
          {!lead.activities?.length ? (
            <p className="text-gray-500 text-sm">فعالیتی ثبت نشده</p>
          ) : (
            <ul className="space-y-2">
              {lead.activities.map((a: any) => (
                <li
                  key={a.id}
                  className="rounded-xl bg-teal-50/80 border border-teal-100 p-3 text-sm"
                >
                  <div className="flex justify-between gap-2">
                    <strong>{a.title}</strong>
                    <span className="text-xs text-gray-500">
                      {formatFa(a.activityAt || a.createdAt)}
                    </span>
                  </div>
                  {a.description && (
                    <p className="text-gray-700 mt-1">{a.description}</p>
                  )}
                  {a.createdBy?.displayName && (
                    <p className="text-xs text-gray-500 mt-1">
                      {a.createdBy.displayName}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}