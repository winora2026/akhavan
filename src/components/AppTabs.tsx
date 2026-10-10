"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

type Tab = { href: string; title: string; minimized?: boolean }

const TITLE_MAP: Record<string, string> = {
  "/": "داشبورد",
  "/order/new": "ثبت سفارش",
  "/order": "پیش‌فاکتورها",
  "/invoices": "فاکتورها",
  "/customers": "مشتریان",
  "/box-design": "طراحی باکس",
  "/crm/leads": "سرنخ‌ها",
  "/production/cutting": "برنامه‌ریزی برش",
  "/production/station-queue": "کارتابل",
  "/production/queue": "روند کاری",
  "/production/dashboard": "داشبورد تولید",
  "/production/stations": "ایستگاه‌ها",
  "/login": "ورود",
}

const STORAGE_KEY = "akhavan_open_tabs"

export default function AppTabs() {
  const pathname = usePathname()
  const router = useRouter()
  const [tabs, setTabs] = useState<Tab[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setTabs(JSON.parse(raw))
    } catch {}
  }, [])

  useEffect(() => {
    if (!pathname || pathname === "/login") return
    const title =
      TITLE_MAP[pathname] ||
      (pathname.startsWith("/production/orders/")
        ? "جزئیات تولید"
        : pathname.startsWith("/crm/")
          ? "CRM"
          : pathname)

    setTabs((prev) => {
      const exists = prev.find((t) => t.href === pathname)
      let next: Tab[]
      if (exists) {
        // باز شدن دوباره = از حالت مینیمایز خارج شود
        next = prev.map((t) =>
          t.href === pathname ? { ...t, title, minimized: false } : t
        )
      } else {
        next = [...prev, { href: pathname, title, minimized: false }]
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }, [pathname])

  if (pathname === "/login" || tabs.length === 0) return null

  const persist = (next: Tab[]) => {
    setTabs(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {}
  }

  const closeTab = (href: string) => {
    const next = tabs.filter((t) => t.href !== href)
    persist(next)
    if (href === pathname) {
      const fallback = next[next.length - 1]?.href || "/"
      setTimeout(() => router.push(fallback), 0)
    }
  }

  /** مینیمایز: تب می‌ماند، به داشبورد می‌رویم — بدون بستن تب و بدون مینیمایز کروم */
  const minimizeTab = (href: string) => {
    const next = tabs.map((t) =>
      t.href === href ? { ...t, minimized: true } : t
    )
    persist(next)
    if (href === pathname) {
      setTimeout(() => router.push("/"), 0)
    }
  }

  const openTab = (href: string, wasMinimized: boolean) => {
    if (wasMinimized) {
      const next = tabs.map((t) =>
        t.href === href ? { ...t, minimized: false } : t
      )
      persist(next)
    }
    router.push(href)
  }

  return (
    <div
      className="sticky top-0 z-[40] bg-white/90 backdrop-blur border-b border-teal-200 px-2 py-1.5 flex gap-1 overflow-x-auto print:hidden"
      dir="rtl"
      role="tablist"
      aria-label="صفحات باز"
    >
      {tabs.map((tab) => {
        const isMin = !!tab.minimized
        const active = tab.href === pathname && !isMin
        return (
          <div
            key={tab.href}
            className={`flex items-center gap-0.5 rounded-lg border px-1.5 py-1 text-sm font-bold whitespace-nowrap ${
              active
                ? "bg-teal-500 text-white border-teal-600"
                : isMin
                  ? "bg-gray-100 text-gray-500 border-gray-300 opacity-80"
                  : "bg-white text-blue-900 border-teal-200 hover:bg-teal-50"
            }`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => openTab(tab.href, isMin)}
              className="px-1.5 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-teal-400 rounded max-w-[140px] truncate"
              title={isMin ? "بازگردانی از مینیمایز" : tab.title}
            >
              {isMin ? `─ ${tab.title}` : tab.title}
            </button>

            {tab.href !== "/" && (
              <button
                type="button"
                aria-label={`مینیمایز ${tab.title}`}
                title="مینیمایز (بدون بستن تب)"
                onClick={() => minimizeTab(tab.href)}
                className="leading-none px-1 rounded hover:bg-black/10 focus:outline-none focus:ring-2 focus:ring-teal-400 text-xs"
              >
                ─
              </button>
            )}

            <button
              type="button"
              aria-label={`بستن ${tab.title}`}
              title="بستن"
              onClick={() => closeTab(tab.href)}
              className="leading-none px-1 rounded hover:bg-black/10 focus:outline-none focus:ring-2 focus:ring-teal-400"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}