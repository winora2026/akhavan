"use client"

// دکمه‌ی چاپ صفحه‌های عمومی (پیش‌فاکتور / برگه‌ی خروج) — فقط در مرورگر
export default function PrintButton({ label = "چاپ / ذخیره PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-xl bg-teal-600 hover:bg-teal-700 px-5 py-2.5 text-sm font-bold text-white shadow"
    >
      {label}
    </button>
  )
}
