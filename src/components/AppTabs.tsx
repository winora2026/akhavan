"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

type Tab = { href: string; title: string }

const TITLE_MAP: Record<string, string> = {
  "/": "داشبورد",
  "/order/new": "ثبت سفارش",
  "/order": "پیش‌فاکتورها",
  "/invoices": "فاکتورها",
  "/customers": "مشتریان",
  "/box-design": "طراحی باکس",
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
        : pathname)

    setTabs((prev) => {
      if (prev.some((t) => t.href === pathname)) return prev
      const next = [...prev, { href: pathname, title }]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [pathname])

  if (pathname === "/login" || tabs.length === 0) return null

  const closeTab = (href: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.href !== href)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      if (href === pathname) {
        const fallback = next[next.length - 1]?.href || "/"
        router.push(fallback)
      }
      return next
    })
  }

  return (
    <div
      className="sticky top-0 z-[40] border-b border-teal-500/25 bg-teal-900/25 backdrop-blur-xl px-2 py-1.5 flex gap-1 overflow-x-auto print:hidden"
      dir="rtl"
      role="tablist"
      aria-label="صفحات باز"
    >
      {tabs.map((tab) => {
        const active = tab.href === pathname
        return (
          <div
            key={tab.href}
            className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-sm font-bold whitespace-nowrap shadow-sm ${
              active
                ? "bg-teal-500 text-white border-teal-400"
                : "bg-white/40 text-blue-950 border-white/30 hover:bg-white/60"
            }`}
          >
            <Link
              href={tab.href}
              role="tab"
              aria-selected={active}
              className="focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-teal-300 rounded"
            >
              {tab.title}
            </Link>
            <button
              type="button"
              aria-label={`بستن ${tab.title}`}
              onClick={() => closeTab(tab.href)}
              className="leading-none px-1 rounded hover:bg-black/10 focus:outline-none focus:ring-2 focus:ring-teal-300"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}