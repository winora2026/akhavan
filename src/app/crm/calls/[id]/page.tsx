"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { DateObject } from "react-multi-date-picker"
import persian from "react-date-object/calendars/persian"
import persian_fa from "react-date-object/locales/persian_fa"

const BG =
  "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')"

function faDate(iso?: string | null) {
  if (!iso) return "—"
  try {
    return new DateObject({
      date: new Date(iso),
      calendar: persian,
      locale: persian_fa,
    }).format("YYYY/MM/DD HH:mm")
  } catch {
    return "—"
  }
}

function duration(sec: number) {
  if (!sec) return "۰ ثانیه"
  if (sec < 60) return `${sec} ثانیه`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s ? `${m} دقیقه و ${s} ثانیه` : `${m} دقیقه`
}

export default function CallDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    ;(async () => {
      try {
        const res = await fetch(`/api/crm/calls/${id}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "خطا")
        setData(json)
      } catch (e: any) {
        alert(e.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-fixed p-4 md:p-6"
      dir="rtl"
      style={{
        fontFamily: "Vazirmatn, Tahoma, sans-serif",
        backgroundImage: BG,
      }}
    >
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-wrap gap-2 mb-4">
          <Link
            href="/crm/calls"
            className="rounded-xl bg-white/90 border border-teal-200 px-4 py-2 font-bold text-blue-900"
          >
            ← تاریخچه تماس‌ها
          </Link>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-white/90 backdrop-blur p-10 text-center font-bold text-blue-900">
            در حال بارگذاری...
          </div>
        ) : !data ? (
          <div className="rounded-2xl bg-white/90 p-10 text-center font-bold">
            تماس یافت نشد
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl bg-teal-500/10 backdrop-blur-2xl border border-teal-500/20 shadow-lg p-5">
              <h1 className="text-2xl font-black text-blue-950 mb-1">
                جزئیات تماس
              </h1>
              <p className="text-blue-800 font-bold text-lg" dir="ltr">
                {data.phone}
              </p>
            </div>

            <div className="rounded-2xl bg-white/90 backdrop-blur border border-teal-200 shadow-lg p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-blue-700 mb-1">زمان شروع</p>
                <p className="font-bold text-blue-950">
                  {faDate(data.startedAt)}
                </p>
              </div>
              <div>
                <p className="text-xs text-blue-700 mb-1">مدت</p>
                <p className="font-bold text-blue-950">
                  {duration(data.durationSec || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-blue-700 mb-1">وضعیت</p>
                <p className="font-bold text-blue-950">{data.status}</p>
              </div>
              <div>
                <p className="text-xs text-blue-700 mb-1">دلیل پایان</p>
                <p className="font-bold text-blue-950">
                  {data.endReason || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-blue-700 mb-1">نوبت‌ها</p>
                <p className="font-bold text-blue-950">{data.turns ?? 0}</p>
              </div>
              <div>
                <p className="text-xs text-blue-700 mb-1">هزینه</p>
                <p className="font-bold text-blue-950" dir="ltr">
                  ${Number(data.cost || 0).toFixed(4)}
                </p>
              </div>
              <div>
                <p className="text-xs text-blue-700 mb-1">پاسخ‌دهنده</p>
                <p className="font-bold text-blue-950">
                  {data.answerer || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-blue-700 mb-1">هدف</p>
                <p className="font-bold text-blue-950">{data.goal || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-blue-700 mb-1">مشتری / لید</p>
                <p className="font-bold text-blue-950">
                  {data.customer?.name || data.lead?.name || "—"}
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-white/90 backdrop-blur border border-teal-200 shadow-lg p-5">
              <h2 className="font-black text-blue-950 mb-2">خلاصه مکالمه</h2>
              <p className="text-blue-900 leading-7">
                {data.summary || "خلاصه‌ای ثبت نشده است."}
              </p>
            </div>

            {data.transcript && (
              <div className="rounded-2xl bg-white/90 backdrop-blur border border-teal-200 shadow-lg p-5">
                <h2 className="font-black text-blue-950 mb-2">متن گفتگو</h2>
                <pre className="text-sm text-blue-900 whitespace-pre-wrap font-[Vazirmatn]">
                  {data.transcript}
                </pre>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/crm/leads?phone=${encodeURIComponent(data.phone)}`}
                className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold px-5 py-2.5"
              >
                ایجاد / مشاهده لید
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}