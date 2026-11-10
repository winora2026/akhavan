"use client"

import { useState } from "react"
import Link from "next/link"

const BG =
  "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')"

export default function OutboundCallsPage() {
  const [phone, setPhone] = useState("")
  const [goal, setGoal] = useState("")

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-fixed p-4 md:p-6"
      dir="rtl"
      style={{
        fontFamily: "Vazirmatn, Tahoma, sans-serif",
        backgroundImage: BG,
      }}
    >
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between mb-5 flex-wrap gap-2">
          <h1 className="text-2xl font-black text-blue-950 bg-white/80 rounded-xl px-4 py-2">
            تماس خروجی
          </h1>
          <Link
            href="/crm/calls"
            className="rounded-xl bg-white/90 border border-teal-200 px-4 py-2 font-bold"
          >
            تاریخچه
          </Link>
        </div>

        <div className="rounded-2xl bg-amber-50/95 border border-amber-200 p-4 mb-4 text-sm font-bold text-amber-900">
          فعلاً صف خروجی شبیه‌سازی است. پس از API زی‌تک و تنظیم caller_id، تماس
          واقعی از اینجا ثبت می‌شود.
        </div>

        <div className="rounded-2xl bg-white/90 backdrop-blur border border-teal-200 shadow-lg p-5 space-y-4">
          <div>
            <label className="block text-sm font-bold text-blue-900 mb-1">
              شماره
            </label>
            <input
              className="w-full rounded-xl border border-teal-300 px-4 py-2.5 font-semibold"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09xxxxxxxxx"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-blue-900 mb-1">
              هدف تماس
            </label>
            <input
              className="w-full rounded-xl border border-teal-300 px-4 py-2.5 font-semibold"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="مثلاً پیگیری پیش‌فاکتور"
            />
          </div>
          <button
            type="button"
            onClick={() =>
              alert(
                "ثبت در صف پس از اتصال API زی‌تک فعال می‌شود.\n" +
                  phone +
                  " — " +
                  goal
              )
            }
            className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold px-5 py-3"
          >
            + تماس جدید (آماده API)
          </button>
        </div>

        <div className="rounded-2xl bg-white/90 border border-teal-200 mt-4 p-8 text-center text-blue-800 font-bold">
          هنوز تماس خروجی گرفته نشده
        </div>
      </div>
    </div>
  )
}