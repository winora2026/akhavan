"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const BG =
  "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')"

const NAV = [
  { href: "/crm/calls/dashboard", title: "نمای کلی" },
  { href: "/crm/calls/live", title: "تماس‌های زنده" },
  { href: "/crm/calls", title: "تاریخچه تماس‌ها" },
  { href: "/crm/calls/operators", title: "مکالمه اپراتورها" },
  { href: "/crm/calls/sales-manager", title: "مدیر فروش هوش مصنوعی" },
  { href: "/crm/calls/customers", title: "مشتریان تماس" },
  { href: "/crm/calls/outbound", title: "تماس خروجی" },
]

export default function CallsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === "/crm/calls") {
      return pathname === "/crm/calls" || pathname.startsWith("/crm/calls/") &&
        !NAV.some(
          (n) =>
            n.href !== "/crm/calls" &&
            (pathname === n.href || pathname.startsWith(n.href + "/"))
        )
    }
    return pathname === href || pathname.startsWith(href + "/")
  }

  // جزئیات تماس: سایدبار بماند
  const hideSidebar = false

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-fixed"
      dir="rtl"
      style={{
        fontFamily: "Vazirmatn, Tahoma, sans-serif",
        backgroundImage: BG,
      }}
    >
      <div className="flex min-h-screen">
        {/* ستون سمت راست در RTL = ظاهر چپ صفحه مثل دمو */}
        {!hideSidebar && (
          <aside className="w-64 shrink-0 border-l border-teal-200/60 bg-white/90 backdrop-blur-xl shadow-lg print:hidden">
            <div className="p-4 border-b border-teal-100">
              <p className="text-xs font-bold text-teal-700">ویس · CRM اخوان</p>
              <h2 className="text-lg font-black text-blue-950">مدیریت مکالمه</h2>
            </div>
            <nav className="p-3 space-y-1">
              {NAV.map((item) => {
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                      active
                        ? "bg-teal-600 text-white shadow"
                        : "text-blue-900 hover:bg-teal-50"
                    }`}
                  >
                    {item.title}
                  </Link>
                )
              })}
            </nav>
            <div className="p-3 mt-4 border-t border-teal-100">
              <Link
                href="/"
                className="block rounded-xl px-3 py-2 text-sm font-bold text-blue-800 hover:bg-teal-50"
              >
                ← بازگشت به صفحه اصلی
              </Link>
              <Link
                href="/crm/leads"
                className="block rounded-xl px-3 py-2 text-sm font-bold text-blue-800 hover:bg-teal-50"
              >
                سرنخ‌ها
              </Link>
            </div>
          </aside>
        )}

        <main className="flex-1 min-w-0 p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}