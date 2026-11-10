"use client"

export default function OperatorsCallsPage() {
  return (
    <div className="max-w-5xl mx-auto" dir="rtl">
      <h1 className="text-2xl font-black text-blue-950 bg-white/85 rounded-xl px-4 py-2 inline-block mb-4">
        مکالمه اپراتورها
      </h1>

      <div className="rounded-2xl bg-amber-50/95 border border-amber-300 p-4 mb-4 text-sm font-bold text-amber-900">
        این قابلیت در دمو زی‌تک هم با پیام «operator_calls.enabled در config فعال
        نیست» خاموش است. بعد از API واقعی و فعال‌سازی سمت زی‌تک، لیست اینجا پر
        می‌شود.
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {[
          "کل مکالمه‌ها",
          "خلاصه‌شده",
          "در صف",
          "از دست رفته",
          "ناموفق",
          "نیازمند پیگیری",
        ].map((t) => (
          <div
            key={t}
            className="rounded-2xl bg-white/90 border border-teal-200 p-4 text-center shadow"
          >
            <p className="text-xs font-bold text-blue-700 mb-1">{t}</p>
            <p className="text-2xl font-black text-teal-700">0</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-white/90 border border-teal-200 shadow-lg p-12 text-center">
        <p className="font-bold text-blue-900 text-lg">
          در ۷ روز اخیر مکالمه‌ای نبوده
        </p>
        <p className="text-sm text-blue-700 mt-2">
          جستجو، سینک با نواتل و خروجی اکسل پس از اتصال فعال می‌شود.
        </p>
      </div>
    </div>
  )
}