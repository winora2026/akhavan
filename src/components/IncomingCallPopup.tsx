"use client"

import { useEffect, useRef, useState } from "react"

type LiveCall = {
  id: string
  state: "NEW" | "RINGING" | "TALKING" | "ENDED"
  direction: string
  callerNumber: string
  callerNorm: string | null
  calleeNumber: string | null
  extension: string
  startedAt: string
  answeredAt: string | null
  endedAt: string | null
  disposition: string | null
  customer: { name: string; code: string | null; kind: string; dbId: string | null } | null
}

const POLL_MS = 2000

function playBeep(ctxRef: { current: AudioContext | null }) {
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctor) return
    if (!ctxRef.current) ctxRef.current = new Ctor()
    const ctx = ctxRef.current
    if (ctx.state === "suspended") ctx.resume().catch(() => {})
    const play = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + dur + 0.02)
    }
    play(880, 0, 0.16)
    play(1180, 0.22, 0.16)
  } catch {
    // مرورگر اجازه‌ی پخش صدا نداده است؛ نمایش کارت کافی است
  }
}

function stateLabel(state: LiveCall["state"]) {
  switch (state) {
    case "RINGING":
      return "تماس ورودی"
    case "TALKING":
      return "در حال مکالمه"
    case "ENDED":
      return "تماس پایان یافت"
    default:
      return "تماس"
  }
}

function stateColor(state: LiveCall["state"]) {
  if (state === "TALKING") return "bg-emerald-600"
  if (state === "ENDED") return "bg-slate-500"
  return "bg-rose-600"
}

function elapsed(startedAt: string, endedAt: string | null, tick: number) {
  void tick
  const start = new Date(startedAt).getTime()
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()
  const sec = Math.max(0, Math.floor((end - start) / 1000))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export default function IncomingCallPopup() {
  const [calls, setCalls] = useState<LiveCall[]>([])
  const [tick, setTick] = useState(0)
  const [extension, setExtension] = useState<string | null>(null)
  const dismissedRef = useRef<Set<string>>(new Set())
  const knownRef = useRef<Set<string>>(new Set())
  const initializedRef = useRef(false)
  const audioRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const poll = async () => {
      try {
        const res = await fetch("/api/telephony/live", { cache: "no-store" })
        if (res.status === 401) {
          if (!cancelled) setCalls([])
          return
        }
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        const list: LiveCall[] = Array.isArray(data.calls) ? data.calls : []
        setExtension(data.extension || null)

        const fresh = list.filter((c) => !knownRef.current.has(c.id))
        for (const c of list) knownRef.current.add(c.id)

        const shouldBeep =
          initializedRef.current &&
          fresh.some((c) => c.state === "RINGING" || c.state === "TALKING")
        if (shouldBeep) playBeep(audioRef)
        initializedRef.current = true

        setCalls(list.filter((c) => !dismissedRef.current.has(c.id)))
      } catch {
        // خطای شبکه؛ دور بعد دوباره تلاش می‌شود
      } finally {
        if (!cancelled) timer = setTimeout(poll, POLL_MS)
      }
    }

    poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (calls.length === 0) return
    const t = setInterval(() => setTick((v) => v + 1), 1000)
    return () => clearInterval(t)
  }, [calls.length])

  if (calls.length === 0) return null

  const dismiss = (id: string) => {
    dismissedRef.current.add(id)
    setCalls((prev) => prev.filter((c) => c.id !== id))
  }

  const openCustomer = (call: LiveCall, register: boolean) => {
    const phone = call.callerNorm || call.callerNumber
    const params = new URLSearchParams()
    if (phone) params.set("phone", phone)
    if (register || !call.customer) params.set("new", "1")
    if (call.customer) params.set("name", call.customer.name)
    window.open(`/customers?${params.toString()}`, "_blank", "noopener")
  }

  return (
    <div
      dir="rtl"
      className="fixed bottom-4 left-4 z-[60] flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-3"
      style={{ fontFamily: "Vazirmatn, Tahoma, sans-serif" }}
    >
      {calls.map((call) => {
        const isRinging = call.state === "RINGING"
        return (
          <div
            key={call.id}
            className={`overflow-hidden rounded-2xl bg-white shadow-2xl ring-2 ${
              isRinging ? "ring-rose-400" : call.state === "TALKING" ? "ring-emerald-400" : "ring-slate-300"
            }`}
          >
            <div className={`flex items-center justify-between px-4 py-2.5 text-white ${stateColor(call.state)}`}>
              <div className="flex items-center gap-2">
                {isRinging ? (
                  <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
                  </span>
                ) : (
                  <span className="h-3 w-3 rounded-full bg-white/80" />
                )}
                <span className="text-sm font-black">{stateLabel(call.state)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs opacity-90" dir="ltr">
                  {elapsed(call.startedAt, call.endedAt, tick)}
                </span>
                <button
                  onClick={() => dismiss(call.id)}
                  className="rounded-lg px-1.5 text-lg leading-none hover:bg-white/20"
                  aria-label="بستن"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-lg font-black text-slate-900">
                    {call.customer?.name || "شماره ناشناس"}
                  </p>
                  <p className="mt-0.5 font-mono text-sm font-bold text-slate-600" dir="ltr">
                    {call.callerNumber}
                  </p>
                </div>
                {call.customer?.code && (
                  <span className="shrink-0 rounded-lg bg-teal-50 px-2 py-1 text-xs font-bold text-teal-700">
                    کد {call.customer.code}
                  </span>
                )}
              </div>

              {!call.customer ? (
                <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs font-bold text-amber-800">
                  این شماره در CRM ثبت نشده است
                </p>
              ) : call.customer.kind === "lead" ? (
                <p className="mt-2 rounded-lg bg-violet-50 px-2 py-1.5 text-xs font-bold text-violet-800">
                  این شماره در سرنخ‌ها ثبت شده است
                </p>
              ) : null}

              <div className="mt-3 flex gap-2">
                {call.customer ? (
                  <button
                    onClick={() => openCustomer(call, false)}
                    className="flex-1 rounded-xl bg-teal-600 px-3 py-2 text-sm font-bold text-white hover:bg-teal-700"
                  >
                    پرونده مشتری
                  </button>
                ) : (
                  <button
                    onClick={() => openCustomer(call, true)}
                    className="flex-1 rounded-xl bg-amber-500 px-3 py-2 text-sm font-bold text-white hover:bg-amber-600"
                  >
                    ثبت مشتری جدید
                  </button>
                )}
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(call.callerNumber).catch(() => {})
                  }}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  کپی شماره
                </button>
              </div>

              <p className="mt-2 text-[11px] font-bold text-slate-400">
                داخلی پاسخ‌دهنده: <span dir="ltr">{call.extension || extension || "—"}</span>
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
