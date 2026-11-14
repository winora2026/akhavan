"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { originateCall } from "@/lib/telephony/client"

type CallDetail = {
  id: string
  uniqueId: string
  direction: "INBOUND" | "OUTBOUND" | "INTERNAL"
  callerNumber: string
  callerNorm: string | null
  calleeNumber: string | null
  agentExtension: string | null
  disposition: string | null
  startedAt: string
  answeredAt: string | null
  endedAt: string | null
  durationSec: number
  billSec: number
  recordingFile: string | null
  recordingAvailable: boolean
  recordingUrl: string
  rawCdr: string | null
  customer: { id: string; name: string; customerCode: string | null; phone: string | null } | null
  user: { id: string; displayName: string; extension: string | null } | null
}

const DIRECTION_LABEL: Record<string, string> = {
  INBOUND: "ورودی",
  OUTBOUND: "خروجی",
  INTERNAL: "داخلی",
}

function faDateTime(iso?: string | null) {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  try {
    return d.toLocaleString("fa-IR-u-nu-latn", {
      timeZone: "Asia/Tehran",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
  } catch {
    return d.toISOString()
  }
}

function faDuration(sec: number) {
  const s = Math.max(0, Number(sec) || 0)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m} دقیقه و ${r} ثانیه`
}

function faSize(sec: number) {
  const kb = Math.max(0, Number(sec) || 0)
  return kb ? `${kb.toLocaleString("fa-IR")} ثانیه` : "—"
}

export default function PbxCallDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const [call, setCall] = useState<CallDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [calling, setCalling] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/telephony/calls/${id}`, { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || "خطا در دریافت تماس")
        if (!cancelled) setCall(data)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "خطا در دریافت تماس")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const callBack = async () => {
    if (!call) return
    const phone =
      call.direction === "OUTBOUND" ? call.calleeNumber || "" : call.callerNumber
    if (!phone) {
      alert("شماره‌ای برای تماس وجود ندارد")
      return
    }
    setCalling(true)
    try {
      const result = await originateCall(phone)
      alert(`ابتدا داخلی ${result.extension} شما زنگ می‌خورد؛ پس از پاسخ به ${result.phone} وصل می‌شوید.`)
    } catch (e: any) {
      alert(e?.message || "خطا در برقراری تماس")
    } finally {
      setCalling(false)
    }
  }

  if (loading) {
    return <p className="p-12 text-center font-bold text-slate-500">در حال بارگذاری...</p>
  }

  if (error || !call) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-white p-8 text-center">
        <p className="font-bold text-red-600">{error || "تماس یافت نشد"}</p>
        <Link href="/crm/calls/pbx" className="mt-4 inline-block rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white">
          بازگشت به لیست
        </Link>
      </div>
    )
  }

  const phone =
    call.direction === "OUTBOUND" ? call.calleeNumber || call.callerNumber : call.callerNumber
  const customerPhone =
    call.direction === "OUTBOUND" ? call.calleeNumber || "" : call.callerNorm || call.callerNumber

  return (
    <div dir="rtl" className="mx-auto max-w-4xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/crm/calls/pbx" className="text-sm font-bold text-teal-700 hover:underline">
            ← تاریخچه تماس‌های تلفنی
          </Link>
          <h1 className="mt-1 text-2xl font-black text-slate-900">جزئیات تماس</h1>
          <p className="mt-1 font-mono text-sm font-bold text-slate-500" dir="ltr">
            {call.uniqueId}
          </p>
        </div>
        <div className="flex gap-2">
          {call.customer && (
            <Link
              href={`/customers?phone=${encodeURIComponent(customerPhone)}`}
              className="rounded-xl border border-teal-200 bg-white px-4 py-2 text-sm font-bold text-teal-800 hover:bg-teal-50"
            >
              پرونده مشتری
            </Link>
          )}
          <button
            onClick={callBack}
            disabled={calling}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {calling ? "در حال تماس..." : "تماس مجدد"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-teal-100 bg-white/95 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <p className="text-xs font-bold text-slate-500">شماره تماس</p>
            <p className="mt-1 font-mono text-2xl font-black text-slate-900" dir="ltr">
              {phone}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-lg bg-violet-100 px-3 py-1.5 text-xs font-bold text-violet-800">
              {DIRECTION_LABEL[call.direction] || call.direction}
            </span>
            <span
              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                String(call.disposition || "").toUpperCase() === "ANSWERED"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {call.disposition || "—"}
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Info label="شروع تماس" value={faDateTime(call.startedAt)} />
          <Info label="زمان پاسخ" value={faDateTime(call.answeredAt)} />
          <Info label="پایان تماس" value={faDateTime(call.endedAt)} />
          <Info label="مدت مکالمه" value={faDuration(call.billSec)} />
          <Info label="مدت کل" value={faSize(call.durationSec)} />
          <Info
            label="داخلی / اپراتور"
            value={`${call.agentExtension || "—"}${call.user?.displayName ? ` · ${call.user.displayName}` : ""}`}
          />
          <Info
            label="مشتری"
            value={
              call.customer
                ? `${call.customer.name}${call.customer.customerCode ? ` (کد ${call.customer.customerCode})` : ""}`
                : "در CRM ثبت نشده"
            }
          />
          <Info label="شماره مقصد" value={call.calleeNumber || "—"} ltr />
          <Info label="فایل ضبط" value={call.recordingFile || "—"} ltr />
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-teal-100 bg-white/95 p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-black text-slate-900">ضبط مکالمه</h2>
        {call.recordingAvailable ? (
          <div className="space-y-3">
            <audio controls preload="none" src={call.recordingUrl} className="w-full" />
            <a
              href={call.recordingUrl}
              download={call.recordingFile || `call-${call.id}.wav`}
              className="inline-block rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-bold text-teal-800 hover:bg-teal-100"
            >
              دانلود فایل ضبط
            </a>
          </div>
        ) : (
          <p className="rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-500">
            فایل ضبط این تماس موجود نیست. (یا در مرکز تلفن ضبط نشده یا هنوز همگام‌سازی نشده است)
          </p>
        )}
      </div>

      {call.rawCdr && (
        <details className="mt-4 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-bold text-slate-700">داده خام CDR</summary>
          <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100" dir="ltr">
            {call.rawCdr}
          </pre>
        </details>
      )}
    </div>
  )
}

function Info({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] font-bold text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-slate-800" dir={ltr ? "ltr" : undefined}>
        {value}
      </p>
    </div>
  )
}
