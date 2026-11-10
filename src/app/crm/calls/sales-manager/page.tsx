"use client"

import { useMemo, useState } from "react"
import Link from "next/link"

type Tab = "standards" | "team" | "review"

const RANGE_OPTIONS = [
  { value: 7, label: "۷ روز اخیر" },
  { value: 14, label: "۱۴ روز اخیر" },
  { value: 30, label: "۳۰ روز اخیر" },
]

export default function SalesManagerPage() {
  const [tab, setTab] = useState<Tab>("standards")
  const [autoEval, setAutoEval] = useState(true)
  const [rangeDays, setRangeDays] = useState(30)
  const [callType, setCallType] = useState("همه")
  const [expert, setExpert] = useState("کل تیم")
  const [onlyNeedsReview, setOnlyNeedsReview] = useState(true)

  // فعلاً داده واقعی ارزیابی نداریم؛ ساختار UI کامل است
  const kpis = useMemo(
    () => ({
      evaluated: 0,
      needsReview: 0,
      ambiguous: 0,
      pending: 0,
    }),
    []
  )

  const TabBtn = ({
    id,
    label,
  }: {
    id: Tab
    label: string
  }) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`rounded-xl px-4 py-2 font-bold border transition ${
        tab === id
          ? "bg-violet-600 text-white border-violet-700 shadow"
          : "bg-white/90 text-blue-900 border-teal-200 hover:bg-teal-50"
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="max-w-6xl mx-auto space-y-4" dir="rtl">
      <div>
        <h1 className="text-2xl font-black text-blue-950 bg-white/85 rounded-xl px-4 py-2 inline-block">
          مدیر فروش هوش مصنوعی
        </h1>
        <p className="text-sm text-blue-800 font-bold mt-1 bg-white/70 inline-block rounded-lg px-3 py-1">
          عملکرد تیم فروش را با معیارهای خودتان ارزیابی کنید.
        </p>
      </div>

      {/* ارزیابی خودکار */}
      <div className="rounded-2xl bg-white/90 border border-teal-200 shadow p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-black text-blue-950">ارزیابی خودکار تماس‌ها</p>
          <p className="text-sm text-blue-700 font-semibold mt-0.5">
            تماس‌های جدید با استانداردهای منتشرشده شما سنجیده می‌شوند.
          </p>
          <p className="text-xs text-blue-600 mt-1">
            گام بعد: اولین استاندارد را منتشر کنید تا ارزیابی آغاز شود.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAutoEval((v) => !v)}
          className={`rounded-full px-6 py-2.5 font-black text-white shadow ${
            autoEval ? "bg-teal-600 hover:bg-teal-700" : "bg-gray-400"
          }`}
        >
          {autoEval ? "روشن" : "خاموش"}
        </button>
      </div>

      {/* تب‌ها */}
      <div className="flex flex-wrap gap-2">
        <TabBtn id="standards" label="استانداردها" />
        <TabBtn id="team" label="کارنامه تیم" />
        <TabBtn id="review" label="بررسی تماس‌ها" />
      </div>

      {/* ========== استانداردها ========== */}
      {tab === "standards" && (
        <div className="rounded-2xl bg-white/90 border border-teal-200 shadow-lg p-6 space-y-4">
          <h2 className="font-black text-blue-950 text-lg">
            استانداردهای ارزیابی
          </h2>
          <p className="font-bold text-blue-900 text-base">
            از نظر شما، یک تماس خوب چطور پیش می‌رود؟
          </p>
          <p className="text-sm text-blue-700 leading-7 font-semibold">
            مثلاً کارشناس نیاز مشتری را بپرسد و قدم بعدی را مشخص کند. از نمونه
            فروش شروع کنید و انتظارهای تیم خود را بنویسید.
          </p>

          <div className="grid md:grid-cols-3 gap-3">
            {[
              {
                n: "۱",
                t: "نوع تماس و روش گفت‌وگو",
                d: "ورودی / خروجی، منشی یا کارشناس، لحن و ساختار مکالمه",
              },
              {
                n: "۲",
                t: "رفتارهای مورد انتظار",
                d: "پرسیدن نیاز، اعلام موجودی/قیمت، ثبت پیگیری، پیشنهاد قدم بعد",
              },
              {
                n: "۳",
                t: "بررسی و انتشار استاندارد",
                d: "وزن شاخص‌ها، آستانه قبول، و فعال‌سازی روی تماس‌های جدید",
              },
            ].map((c) => (
              <div
                key={c.n}
                className="rounded-xl border border-teal-100 bg-teal-50/50 p-4"
              >
                <p className="text-violet-700 font-black text-sm mb-1">
                  {c.n}. {c.t}
                </p>
                <p className="text-xs text-blue-800 font-semibold leading-5">
                  {c.d}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-dashed border-teal-300 bg-white p-4">
            <p className="text-sm font-bold text-blue-900 mb-2">
              نمونه استاندارد پیشنهادی اخوان (شیشه و آینه)
            </p>
            <ul className="text-sm text-blue-800 font-semibold space-y-1 list-disc list-inside">
              <li>سلام و معرفی کوتاه شرکت</li>
              <li>تشخیص نوع کار: آینه / شیشه / باکس / نصب</li>
              <li>ثبت ابعاد یا زمان بازدید در صورت نیاز</li>
              <li>ارجاع به ثبت پیش‌فاکتور یا پیگیری کارشناس فروش</li>
              <li>خداحافظی با اعلام کانال پیگیری (تلفن / واتساپ)</li>
            </ul>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold px-5 py-2.5 shadow"
              onClick={() =>
                alert(
                  "ثبت و انتشار استاندارد بعد از اتصال کامل ایجنت زی‌تک فعال می‌شود. فعلاً رابط و نمونه معیارها آماده‌اند."
                )
              }
            >
              ساخت اولین استاندارد با نمونه فروش
            </button>
            <button
              type="button"
              className="rounded-xl border border-teal-300 bg-white font-bold text-blue-900 px-5 py-2.5"
              onClick={() =>
                alert("ویرایش استانداردها پس از اولین انتشار فعال می‌شود.")
              }
            >
              مدیریت استانداردها
            </button>
          </div>
        </div>
      )}

      {/* ========== کارنامه تیم ========== */}
      {tab === "team" && (
        <div className="space-y-4">
          {/* فیلترها */}
          <div className="rounded-2xl bg-white/90 border border-teal-200 shadow p-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-bold text-blue-700 mb-1">
                بازه زمانی
              </label>
              <select
                className="rounded-xl border border-teal-300 px-3 py-2 font-bold text-sm"
                value={rangeDays}
                onChange={(e) => setRangeDays(Number(e.target.value))}
              >
                {RANGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-blue-700 mb-1">
                نوع تماس
              </label>
              <select
                className="rounded-xl border border-teal-300 px-3 py-2 font-bold text-sm"
                value={callType}
                onChange={(e) => setCallType(e.target.value)}
              >
                <option>همه انواع تماس</option>
                <option>ورودی</option>
                <option>خروجی</option>
                <option>منشی هوشمند</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-blue-700 mb-1">
                کارشناس
              </label>
              <select
                className="rounded-xl border border-teal-300 px-3 py-2 font-bold text-sm"
                value={expert}
                onChange={(e) => setExpert(e.target.value)}
              >
                <option>کل تیم</option>
                <option>خانم حسینی</option>
                <option>خانم قنبرنژاد</option>
                <option>مائده عباس‌زاده</option>
              </select>
            </div>
            <button
              type="button"
              className="rounded-xl border border-teal-300 px-4 py-2 font-bold text-sm text-blue-900 hover:bg-teal-50"
              onClick={() =>
                alert("خروجی اکسل پس از وجود داده ارزیابی فعال می‌شود.")
              }
            >
              خروجی اکسل با همین فیلتر
            </button>
            <button
              type="button"
              className="rounded-xl bg-teal-600 text-white px-4 py-2 font-bold text-sm hover:bg-teal-700"
            >
              تازه‌سازی
            </button>
          </div>

          {/* KPI */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ["تماس ارزیابی‌شده", kpis.evaluated],
              ["نیازمند بررسی", kpis.needsReview],
              ["نوع تماس مبهم", kpis.ambiguous],
              ["در انتظار ارزیابی", kpis.pending],
            ].map(([t, v]) => (
              <div
                key={String(t)}
                className="rounded-2xl bg-white/90 border border-teal-200 p-4 text-center shadow-sm"
              >
                <p className="text-xs font-bold text-blue-700 mb-1">{t}</p>
                <p className="text-2xl font-black text-teal-700">{v}</p>
              </div>
            ))}
          </div>

          {/* جدول کارنامه */}
          <div className="rounded-2xl bg-white/90 border border-teal-200 shadow overflow-auto">
            <div className="p-4 border-b border-teal-100 flex flex-wrap justify-between gap-2">
              <h3 className="font-black text-blue-950">کارنامه تیم و کارشناسان</h3>
              <button
                type="button"
                className="rounded-lg border border-teal-200 px-3 py-1.5 text-xs font-bold text-blue-900"
                onClick={() => setTab("standards")}
              >
                تعریف اولین استاندارد
              </button>
            </div>
            <table className="min-w-full text-sm">
              <thead className="bg-teal-50 text-blue-900">
                <tr>
                  <th className="p-3 text-right">استاندارد / نسخه</th>
                  <th className="p-3 text-right">کارشناس</th>
                  <th className="p-3 text-center">تعداد تماس</th>
                  <th className="p-3 text-center">امتیاز</th>
                  <th className="p-3 text-center">پوشش</th>
                  <th className="p-3 text-center">نمونه</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td
                    colSpan={6}
                    className="p-10 text-center text-blue-700 font-bold"
                  >
                    هنوز تماس قابل استفاده در کارنامهٔ این بازه وجود ندارد.
                    <p className="text-xs font-semibold text-blue-600 mt-2">
                      بعد از انتشار استاندارد و ارزیابی خودکار، ردیف‌ها اینجا
                      پر می‌شوند.
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* قوت‌ها و ضعف‌ها */}
          <div className="rounded-2xl bg-white/90 border border-teal-200 shadow p-5">
            <h3 className="font-black text-blue-950 mb-1">
              قوت‌ها و ضعف‌های پرتکرار
            </h3>
            <p className="text-xs text-blue-600 font-semibold mb-3">
              ضعف: امتیاز ۰ یا ۱ · قوت: ۳ یا ۴ — فقط شاخص‌های قابل ارزیابی تماس
              واجد شرایط.
            </p>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 min-h-[80px]">
                <p className="text-sm font-black text-emerald-800 mb-1">قوت‌ها</p>
                <p className="text-sm text-emerald-900 font-semibold">
                  هنوز داده‌ای ثبت نشده
                </p>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 min-h-[80px]">
                <p className="text-sm font-black text-amber-800 mb-1">ضعف‌ها</p>
                <p className="text-sm text-amber-900 font-semibold">
                  هنوز داده‌ای ثبت نشده
                </p>
              </div>
            </div>
          </div>

          {/* روند امتیاز */}
          <div className="rounded-2xl bg-white/90 border border-teal-200 shadow p-5">
            <h3 className="font-black text-blue-950 mb-2">روند امتیاز در طول زمان</h3>
            <div className="h-28 flex items-center justify-center text-sm font-bold text-blue-600 border border-dashed border-teal-200 rounded-xl">
              پس از چند روز ارزیابی، نمودار روند اینجا نمایش داده می‌شود
            </div>
          </div>

          {/* نتیجه منتخب */}
          <div className="rounded-2xl bg-white/90 border border-teal-200 shadow p-5">
            <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
              <h3 className="font-black text-blue-950">نتیجه منتخب تماس‌ها</h3>
              <div className="flex items-center gap-2 text-sm font-bold text-blue-800">
                <button
                  type="button"
                  className="rounded-lg border px-3 py-1 opacity-50"
                  disabled
                >
                  قبلی
                </button>
                <span>صفحه ۱ · ۰ تماس</span>
                <button
                  type="button"
                  className="rounded-lg border px-3 py-1 opacity-50"
                  disabled
                >
                  بعدی
                </button>
              </div>
            </div>
            <p className="text-center text-blue-700 font-bold py-6">
              تماسی برای نمایش نیست
            </p>
          </div>
        </div>
      )}

      {/* ========== بررسی تماس‌ها ========== */}
      {tab === "review" && (
        <div className="rounded-2xl bg-white/90 border border-teal-200 shadow-lg p-6 space-y-4">
          <div>
            <h3 className="font-black text-blue-950 text-lg mb-1">
              بررسی تماس‌ها
            </h3>
            <p className="text-sm text-blue-800 font-semibold leading-6">
              تماس را باز کنید، دلیل و شاهد را ببینید و در صورت نیاز امتیاز را
              اصلاح کنید.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm font-bold text-blue-900">
            <input
              type="checkbox"
              checked={onlyNeedsReview}
              onChange={(e) => setOnlyNeedsReview(e.target.checked)}
              className="w-4 h-4"
            />
            فقط تماس‌های نیازمند بررسی
          </label>

          <div className="rounded-xl border border-dashed border-teal-300 p-10 text-center">
            <p className="font-bold text-blue-900">
              {onlyNeedsReview
                ? "تماس نیازمند بررسی ندارید."
                : "برای دیدن نتایج و آزمایش‌ها، ارزیابی خودکار را روشن و استاندارد را منتشر کنید."}
            </p>
            <Link
              href="/crm/calls"
              className="inline-block mt-4 text-teal-700 font-bold text-sm hover:underline"
            >
              رفتن به تاریخچه تماس‌ها ←
            </Link>
          </div>

          <p className="text-xs text-blue-600 font-semibold">
            ابزار پیشرفتهٔ سنجش دقت با برچسب مدیر — پس از اتصال ایجنت فعال
            می‌شود.
          </p>
        </div>
      )}
    </div>
  )
}