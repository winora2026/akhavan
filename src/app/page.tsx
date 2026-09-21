"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"

const FISCAL_KEY = "akhavan_fiscal_year"

export default function HomePage() {
  const [showSalesMenu, setShowSalesMenu] = useState(false)
  const [showProductionMenu, setShowProductionMenu] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [fiscalYear, setFiscalYear] = useState("1405")
  const [editingFiscal, setEditingFiscal] = useState(false)
  const [currentUser, setCurrentUser] = useState<{
    displayName: string
    role: string
  } | null>(null)

  const salesRef = useRef<HTMLDivElement>(null)
  const productionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem(FISCAL_KEY)
    if (saved) setFiscalYear(saved)
  }, [])

  const saveFiscalYear = (value: string) => {
    const v = value.trim() || "1405"
    setFiscalYear(v)
    localStorage.setItem(FISCAL_KEY, v)
    setEditingFiscal(false)
  }

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } catch (e) {
      console.error(e)
    } finally {
      window.location.href = "/login"
    }
  }

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch("/api/auth/me")
        if (!res.ok) return
        const data = await res.json()
        if (data.user) {
          setCurrentUser({
            displayName: data.user.displayName,
            role: data.user.role,
          })
        }
      } catch (e) {
        console.error(e)
      }
    })()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowSalesMenu(false)
        setShowProductionMenu(false)
        setMobileOpen(false)
        setEditingFiscal(false)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (salesRef.current && !salesRef.current.contains(e.target as Node)) {
        setShowSalesMenu(false)
      }
      if (
        productionRef.current &&
        !productionRef.current.contains(e.target as Node)
      ) {
        setShowProductionMenu(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const menuItems = [
    {
      title: "داشبورد",
      href: "/",
      icon: "M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z",
    },
    {
      title: "فروش",
      href: "#",
      icon: "M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z",
      isSales: true,
    },
    {
      title: "تولید",
      href: "#",
      icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
      isProduction: true,
    },
    {
      title: "انبار",
      href: "#",
      icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
    },
    {
      title: "مالی",
      href: "#",
      icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    },
    {
      title: "گزارش‌ها",
      href: "#",
      icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    },
    {
      title: "تنظیمات",
      href: "#",
      icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
    },
  ]

  const salesItems = [
    {
      title: "مشتریان",
      href: "/customers",
      icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
    },
    {
      title: "ثبت سفارش",
      href: "/order/new",
      icon: "M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    },
    {
      title: "طراحی باکس",
      href: "/box-design",
      icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
    },
    {
      title: "لیست پیش‌فاکتورها",
      href: "/order",
      icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    },
    {
      title: "لیست فاکتورها",
      href: "/invoices",
      icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
    },
  ]

  const productionItems = [
    {
      title: "مدیریت ایستگاه‌ها",
      href: "/production/stations",
      icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
    },
    {
      title: "مشاهده روند کاری",
      href: "/production/queue",
      icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
    },
    {
      title: "کارتابل ایستگاه",
      href: "/production/station-queue",
      icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
    },
    {
      title: "داشبورد تولید",
      href: "/production/dashboard",
      icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    },
    {
      title: "برنامه‌ریزی برش",
      href: "/production/cutting",
      icon: "M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z",
    },
  ]

  const roleLabel = (role: string) => {
    switch (role) {
      case "sales":
        return "فروش"
      case "finance":
        return "مالی"
      case "production":
        return "تولید"
      case "admin":
        return "مدیریت"
      default:
        return role
    }
  }

  const renderSubMenu = (
    open: boolean,
    items: { title: string; href: string; icon: string }[],
    onClose: () => void
  ) =>
    open ? (
      <div
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 min-w-[220px]"
        role="menu"
      >
        <div className="rounded-2xl bg-white/95 backdrop-blur-xl border border-teal-500/30 shadow-2xl p-2">
          <div className="flex flex-col gap-1">
            {items.map((sub) => (
              <Link
                key={sub.title}
                href={sub.href}
                role="menuitem"
                onClick={onClose}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-teal-50 focus:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-500 transition group"
              >
                <div className="w-9 h-9 rounded-lg bg-teal-500/15 flex items-center justify-center border border-teal-500/20 shrink-0">
                  <svg
                    className="w-5 h-5 text-teal-700"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.2}
                      d={sub.icon}
                    />
                  </svg>
                </div>
                <span className="text-sm font-bold text-gray-800 group-hover:text-teal-800">
                  {sub.title}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    ) : null

  return (
    <div
      className="min-h-screen relative overflow-hidden bg-cover bg-center bg-no-repeat"
      style={{
        backgroundImage:
          "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')",
        backgroundSize: "cover",
        backgroundPosition: "center center",
        fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif",
      }}
      dir="rtl"
    >
      <a
        href="#main-menu"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:right-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:font-bold focus:text-teal-800"
      >
        رفتن به منوی اصلی
      </a>

      <div className="pointer-events-none fixed inset-0 bg-black/10" />

      <div className="relative z-10 min-h-screen flex flex-col">
        <header className="pt-4 px-4 sm:px-8 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            {currentUser ? (
              <div className="rounded-2xl bg-white/50 border border-teal-500/30 px-4 py-2 shadow">
                <p className="text-xl sm:text-2xl font-black text-blue-950 leading-tight">
                  {currentUser.displayName}
                </p>
                <p className="text-sm font-bold text-teal-700">
                  {roleLabel(currentUser.role)}
                </p>
              </div>
            ) : (
              <div className="text-sm text-gray-600 font-bold">در حال دریافت کاربر...</div>
            )}

            <div className="rounded-2xl bg-white/50 border border-teal-500/30 px-4 py-2 shadow">
              <p className="text-xs font-bold text-blue-800 mb-0.5">سال مالی</p>
              {editingFiscal ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    defaultValue={fiscalYear}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        saveFiscalYear((e.target as HTMLInputElement).value)
                      }
                      if (e.key === "Escape") setEditingFiscal(false)
                    }}
                    className="w-24 rounded-lg border border-teal-500 px-2 py-1 text-lg font-black text-blue-950 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.activeElement as HTMLInputElement
                      saveFiscalYear(el?.value || fiscalYear)
                    }}
                    className="text-sm font-bold text-teal-700"
                  >
                    ذخیره
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingFiscal(true)}
                  className="text-xl font-black text-blue-950 hover:text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 rounded"
                  title="برای تغییر کلیک کنید"
                >
                  {fiscalYear}
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="sm:hidden rounded-xl bg-white/60 border border-teal-500/30 px-3 py-2 font-bold text-blue-900 focus:ring-2 focus:ring-teal-500"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((v) => !v)}
            >
              منو
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="text-base font-bold text-gray-700 hover:text-teal-700 transition px-3 py-1.5 rounded-lg hover:bg-white/40 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              خروج
            </button>
          </div>
        </header>

        <div className="flex-1" />

        <div className="pb-10 px-4 sm:px-6" id="main-menu">
          <div className="max-w-4xl mx-auto">
            <div
              className={`bg-white/20 backdrop-blur-xl border border-white/30 rounded-2xl shadow-2xl px-3 sm:px-4 py-5 ${
                mobileOpen ? "block" : "hidden sm:block"
              }`}
            >
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
                {menuItems.map((item) =>
                  item.isSales ? (
                    <div key={item.title} ref={salesRef} className="relative">
                      <button
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={showSalesMenu}
                        onClick={() => {
                          setShowProductionMenu(false)
                          setShowSalesMenu((prev) => !prev)
                        }}
                        className="w-full flex flex-col items-center gap-2.5 p-3 rounded-xl hover:bg-white/30 focus:bg-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500 transition group"
                      >
                        <div className="w-12 h-12 rounded-xl bg-teal-500/15 flex items-center justify-center border border-teal-500/20">
                          <svg
                            className="w-7 h-7 text-teal-700"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2.2}
                              d={item.icon}
                            />
                          </svg>
                        </div>
                        <span className="text-sm sm:text-base font-bold text-gray-800 text-center">
                          {item.title}
                        </span>
                      </button>
                      {renderSubMenu(showSalesMenu, salesItems, () =>
                        setShowSalesMenu(false)
                      )}
                    </div>
                  ) : item.isProduction ? (
                    <div key={item.title} ref={productionRef} className="relative">
                      <button
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={showProductionMenu}
                        onClick={() => {
                          setShowSalesMenu(false)
                          setShowProductionMenu((prev) => !prev)
                        }}
                        className="w-full flex flex-col items-center gap-2.5 p-3 rounded-xl hover:bg-white/30 focus:bg-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500 transition group"
                      >
                        <div className="w-12 h-12 rounded-xl bg-teal-500/15 flex items-center justify-center border border-teal-500/20">
                          <svg
                            className="w-7 h-7 text-teal-700"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2.2}
                              d={item.icon}
                            />
                          </svg>
                        </div>
                        <span className="text-sm sm:text-base font-bold text-gray-800 text-center">
                          {item.title}
                        </span>
                      </button>
                      {renderSubMenu(showProductionMenu, productionItems, () =>
                        setShowProductionMenu(false)
                      )}
                    </div>
                  ) : (
                    <Link
                      key={item.title}
                      href={item.href}
                      className="flex flex-col items-center gap-2.5 p-3 rounded-xl hover:bg-white/30 focus:bg-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500 transition"
                    >
                      <div className="w-12 h-12 rounded-xl bg-teal-500/15 flex items-center justify-center border border-teal-500/20">
                        <svg
                          className="w-7 h-7 text-teal-700"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.2}
                            d={item.icon}
                          />
                        </svg>
                      </div>
                      <span className="text-sm sm:text-base font-bold text-gray-800 text-center">
                        {item.title}
                      </span>
                    </Link>
                  )
                )}
              </div>
            </div>
          </div>

          <div className="mt-7 flex justify-center items-center gap-6 sm:gap-8 flex-wrap text-sm sm:text-base font-bold text-gray-700">
            <a
              href="https://www.akhavanglass.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 rounded px-1"
            >
              www.akhavanglass.com
            </a>
            <a
              href="tel:02191005103"
              className="hover:text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 rounded px-1"
            >
              02191005103
            </a>
            <a
              href="tel:09129582600"
              className="hover:text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 rounded px-1"
            >
              09129582600
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}