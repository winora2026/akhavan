"use client"

import Link from "next/link"

const BG =
  "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')"

export default function LiveCallsPage() {
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
        <div className="flex justify-between mb-5">
          <h1 className="text-2xl font-black text-blue-950 bg-white/80 rounded-xl px-4 py-2">
            تماس‌های زنده
          </h1>
          <Link
            href="/crm/calls"
            className="rounded-xl bg-white/90 border border-teal-200 px-4 py-2 font-bold"
          >
            تاریخچه
          </Link>
        </div>
        <div className="rounded-2xl bg-white/90 backdrop-blur border border-teal-200 shadow-lg p-12 text-center">
          <p className="text-lg font-bold text-blue-900 mb-2">
            در حال حاضر تماس فعالی وجود ندارد
          </p>
          <p className="text-sm text-blue-700">
            پس از اتصال API زی‌تک، مکالمه‌های در جریان اینجا نمایش داده
            می‌شوند.
          </p>
        </div>
      </div>
    </div>
  )
}