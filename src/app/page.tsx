"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"

export default function HomePage() {
  const [showSalesMenu, setShowSalesMenu] = useState(false)
  const salesRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (salesRef.current && !salesRef.current.contains(e.target as Node)) {
        setShowSalesMenu(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

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
      <link
        href="https://cdn.jsdelivr.net/npm/vazirmatn@33.003/Vazirmatn-font-face.css"
        rel="stylesheet"
      />

      <div className="pointer-events-none fixed inset-0 bg-black/10" />

      <div className="relative z-10 min-h-screen flex flex-col">
        <header className="pt-6 px-8 flex items-center justify-end">
          <button className="text-base font-bold text-gray-700 hover:text-teal-700 transition px-3 py-1.5 rounded-lg hover:bg-white/40">
            خروج
          </button>
        </header>

        <div className="flex-1" />

        <div className="pb-10 px-6">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white/20 backdrop-blur-xl border border-white/30 rounded-2xl shadow-2xl px-4 py-5">
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {menuItems.map((item) =>
                  item.isSales ? (
                    <div
                      key={item.title}
                      ref={salesRef}
                      className="relative"
                      onMouseEnter={() => setShowSalesMenu(true)}
                      onMouseLeave={() => setShowSalesMenu(false)}
                    >
                      <button
                        onClick={() => setShowSalesMenu((prev) => !prev)}
                        className="w-full flex flex-col items-center gap-2.5 p-3 rounded-xl hover:bg-white/30 transition cursor-pointer group"
                      >
                        <div className="w-12 h-12 rounded-xl bg-teal-500/15 backdrop-blur-sm flex items-center justify-center group-hover:bg-teal-500/25 transition shadow-sm border border-teal-500/20">
                          <svg
                            className="w-7 h-7 text-teal-700 group-hover:text-teal-500 transition-colors duration-200"
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
                        <span className="text-base font-bold text-gray-800 group-hover:text-teal-800 text-center leading-tight transition-colors">
                          {item.title}
                        </span>
                      </button>

                      {/* زیرمنوی فروش - عمودی */}
                      {showSalesMenu && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 min-w-[200px]">
                          <div className="rounded-2xl bg-white/95 backdrop-blur-xl border border-teal-500/30 shadow-2xl p-2">
                            <div className="flex flex-col gap-1">
                              {salesItems.map((sub) => (
                                <Link
                                  key={sub.title}
                                  href={sub.href}
                                  onClick={() => setShowSalesMenu(false)}
                                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-teal-50 transition group"
                                >
                                  <div className="w-9 h-9 rounded-lg bg-teal-500/15 flex items-center justify-center group-hover:bg-teal-500/25 transition border border-teal-500/20 shrink-0">
                                    <svg
                                      className="w-5 h-5 text-teal-700 group-hover:text-teal-500 transition-colors"
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
                                  <span className="text-sm font-bold text-gray-800 group-hover:text-teal-800 whitespace-nowrap">
                                    {sub.title}
                                  </span>
                                </Link>
                              ))}
                            </div>
                          </div>
                          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-3 h-3 bg-white/95 border-r border-b border-teal-500/30 rotate-45" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <Link key={item.title} href={item.href}>
                      <div className="flex flex-col items-center gap-2.5 p-3 rounded-xl hover:bg-white/30 transition cursor-pointer group">
                        <div className="w-12 h-12 rounded-xl bg-teal-500/15 backdrop-blur-sm flex items-center justify-center group-hover:bg-teal-500/25 transition shadow-sm border border-teal-500/20">
                          <svg
                            className="w-7 h-7 text-teal-700 group-hover:text-teal-500 transition-colors duration-200"
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
                        <span className="text-base font-bold text-gray-800 group-hover:text-teal-800 text-center leading-tight transition-colors">
                          {item.title}
                        </span>
                      </div>
                    </Link>
                  )
                )}
              </div>
            </div>
          </div>

          <div className="mt-7 flex justify-center items-center gap-8 flex-wrap text-base font-bold text-gray-700">
            <a
              href="https://www.akhavanglass.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 hover:text-teal-700 transition"
            >
              <span>www.akhavanglass.com</span>
              <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                />
              </svg>
            </a>

            <a
              href="tel:02191005103"
              className="flex items-center gap-2 hover:text-teal-700 transition"
            >
              <span>02191005103</span>
              <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                />
              </svg>
            </a>

            <a
              href="tel:09129582600"
              className="flex items-center gap-2 hover:text-teal-700 transition"
            >
              <span>09129582600</span>
              <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}