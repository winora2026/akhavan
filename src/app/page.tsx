"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"

const FISCAL_KEY = "akhavan_fiscal_year"

const BG_CANDIDATES = [
  "/background.png",
  "https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png",
]

type SubItem = {
  title: string
  href: string
  icon: string
  indent?: boolean
}

type SalesRootItem = {
  key: string
  title: string
  icon: string
  href?: string
  children?: SubItem[]
}

export default function HomePage() {
  const [showSalesMenu, setShowSalesMenu] = useState(false)
  const [salesFlyout, setSalesFlyout] = useState<string | null>(null)
  const [showExecutionMenu, setShowExecutionMenu] = useState(false)
  const [showProductionMenu, setShowProductionMenu] = useState(false)
  const [showFinanceMenu, setShowFinanceMenu] = useState(false)
  const [showReportsMenu, setShowReportsMenu] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [fiscalYear, setFiscalYear] = useState("1405")
  const [editingFiscal, setEditingFiscal] = useState(false)
  const [currentUser, setCurrentUser] = useState<{
    displayName: string
    role: string
  } | null>(null)
  const [bgUrl, setBgUrl] = useState<string>(BG_CANDIDATES[0])

  const salesRef = useRef<HTMLDivElement>(null)
  const executionRef = useRef<HTMLDivElement>(null)
  const productionRef = useRef<HTMLDivElement>(null)
  const financeRef = useRef<HTMLDivElement>(null)
  const reportsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem(FISCAL_KEY)
    if (saved) setFiscalYear(saved)
  }, [])

  useEffect(() => {
    let cancelled = false
    let i = 0
    const tryNext = () => {
      if (cancelled || i >= BG_CANDIDATES.length) return
      const url = BG_CANDIDATES[i++]
      const img = new Image()
      img.onload = () => {
        if (!cancelled) setBgUrl(url)
      }
      img.onerror = () => tryNext()
      img.src = url
    }
    tryNext()
    return () => {
      cancelled = true
    }
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
      if (e.key !== "Escape") return
      e.preventDefault()
      handleLogout()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (salesRef.current && !salesRef.current.contains(e.target as Node)) {
        setShowSalesMenu(false)
        setSalesFlyout(null)
      }
      if (
        executionRef.current &&
        !executionRef.current.contains(e.target as Node)
      ) {
        setShowExecutionMenu(false)
      }
      if (
        productionRef.current &&
        !productionRef.current.contains(e.target as Node)
      ) {
        setShowProductionMenu(false)
      }
      if (financeRef.current && !financeRef.current.contains(e.target as Node)) {
        setShowFinanceMenu(false)
      }
      if (reportsRef.current && !reportsRef.current.contains(e.target as Node)) {
        setShowReportsMenu(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const isProductionOnly = currentUser?.role === "production"
  const canOpenSales = !isProductionOnly
  const canOpenExecution = !isProductionOnly
  const canOpenFinance = !isProductionOnly
  const canOpenReports = !isProductionOnly

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
      title: "اجرا",
      href: "#",
      icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
      isExecution: true,
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
      lockedForProduction: true,
    },
    {
      title: "مالی",
      href: "#",
      icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
      isFinance: true,
      lockedForProduction: true,
    },
    {
      title: "گزارش‌ها",
      href: "#",
      icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
      isReports: true,
      lockedForProduction: true,
    },
    {
      title: "تنظیمات",
      href: "#",
      icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
      lockedForProduction: true,
    },
  ]

  const salesRoot: SalesRootItem[] = [
    {
      key: "orders",
      title: "سفارشات",
      icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
      children: [
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
          title: "پیش‌فاکتورهای لغوشده",
          href: "/order/cancelled",
          indent: true,
          icon: "M6 18L18 6M6 6l12 12",
        },
        {
          title: "لیست فاکتورها",
          href: "/invoices",
          icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
        },
      ],
    },
    {
      key: "crm",
      title: "CRM",
      icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
      children: [
        {
          title: "سرنخ‌ها",
          href: "/crm/leads",
          icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
        },
        {
          title: "مدیریت مکالمه",
          href: "/crm/calls/dashboard",
          icon: "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z",
        },
        {
          title: "گزارش پیامک‌ها",
          href: "/sms-report",
          icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",
        },
      ],
    },
    {
      key: "customers",
      title: "مشتریان",
      href: "/customers",
      icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
    },
  ]

  const executionItems: SubItem[] = [
    {
      title: "اندازه‌گیری",
      href: "/execution/measurement",
      icon: "M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4",
    },
    {
      title: "نصب",
      href: "/execution/install",
      icon: "M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z",
    },
  ]

  const productionItems: SubItem[] = [
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

  const financeItems: SubItem[] = [
    {
      title: "واریزی‌های مشتریان",
      href: "/finance/deposits",
      icon: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z",
    },
    {
      title: "کانورت فاکتورها",
      href: "/finance/convert",
      icon: "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4",
    },
    {
      title: "مغایرت‌گیری سپیدار",
      href: "/finance/reconcile",
      icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    },
  ]

  const reportsItems: SubItem[] = [
    {
      title: "گزارش تولید",
      href: "/reports?tab=production",
      icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    },
    {
      title: "گزارش فروش",
      href: "/reports?tab=sales",
      icon: "M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z",
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
      case "designer":
        return "طراح"
      default:
        return role
    }
  }

  const closeAllMenus = () => {
    setShowSalesMenu(false)
    setSalesFlyout(null)
    setShowExecutionMenu(false)
    setShowProductionMenu(false)
    setShowFinanceMenu(false)
    setShowReportsMenu(false)
  }

  const renderSubMenu = (
    open: boolean,
    items: SubItem[],
    onClose: () => void
  ) =>
    open ? (
      <div
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 min-w-[240px]"
        role="menu"
        onMouseLeave={onClose}
      >
        <div className="rounded-2xl bg-white/95 backdrop-blur-xl border border-teal-500/30 shadow-2xl p-2">
          <div className="flex flex-col gap-1">
            {items.map((sub) => (
              <Link
                key={sub.href + sub.title}
                href={sub.href}
                role="menuitem"
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-teal-50 focus:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-500 transition group ${
                  sub.indent ? "mr-4 border-r-2 border-teal-200" : ""
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-teal-500/15 flex items-center justify-center border border-teal-500/20 shrink-0">
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
                <span className="text-base font-bold text-gray-800 group-hover:text-teal-800">
                  {sub.title}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    ) : null

  const renderSalesCascadingMenu = (open: boolean, onClose: () => void) =>
    open ? (
      <div
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50"
        role="menu"
        onMouseLeave={() => {
          setSalesFlyout(null)
          onClose()
        }}
      >
        <div className="flex items-end gap-1">
          <div className="rounded-2xl bg-white/95 backdrop-blur-xl border border-teal-500/30 shadow-2xl p-2 min-w-[200px]">
            {salesRoot.map((item) => {
              const hasChildren = !!item.children?.length
              const active = salesFlyout === item.key

              if (!hasChildren && item.href) {
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={() => {
                      setSalesFlyout(null)
                      onClose()
                    }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-teal-50 transition"
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
                          d={item.icon}
                        />
                      </svg>
                    </div>
                    <span className="text-base font-bold text-gray-800">
                      {item.title}
                    </span>
                  </Link>
                )
              }

              return (
                <button
                  key={item.key}
                  type="button"
                  onMouseEnter={() => setSalesFlyout(item.key)}
                  onClick={() =>
                    setSalesFlyout((k) => (k === item.key ? null : item.key))
                  }
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl transition font-bold text-base ${
                    active
                      ? "bg-teal-600 text-white"
                      : "text-gray-800 hover:bg-teal-50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>{item.title}</span>
                  </span>
                  <span className="text-lg leading-none opacity-80">‹</span>
                </button>
              )
            })}
          </div>

          {salesFlyout &&
            salesRoot.find((x) => x.key === salesFlyout)?.children && (
              <div className="rounded-2xl bg-white/95 backdrop-blur-xl border border-teal-500/30 shadow-2xl p-2 min-w-[250px]">
                <div className="px-2 py-1 mb-1 text-xs font-black text-teal-700">
                  {salesRoot.find((x) => x.key === salesFlyout)?.title}
                </div>
                {salesRoot
                  .find((x) => x.key === salesFlyout)!
                  .children!.map((sub) => (
                    <Link
                      key={sub.href + sub.title}
                      href={sub.href}
                      onClick={() => {
                        setSalesFlyout(null)
                        onClose()
                      }}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-teal-50 transition group ${
                        sub.indent ? "mr-3 border-r-2 border-teal-300" : ""
                      }`}
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
            )}
        </div>
      </div>
    ) : null

  const menuBtnClass =
    "w-full flex flex-col items-center gap-2.5 p-3.5 rounded-xl hover:bg-white/30 focus:bg-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500 transition"

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{
        backgroundColor: "#d8efe9",
        backgroundImage: `url('${bgUrl}')`,
        backgroundSize: "cover",
        backgroundPosition: "center 18%",
        backgroundRepeat: "no-repeat",
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

      <div className="pointer-events-none fixed inset-0 bg-black/5" />

      <div className="relative z-10 min-h-screen flex flex-col">
        <header className="pt-4 px-4 sm:px-8 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            {currentUser ? (
              <div className="rounded-2xl bg-white/80 border border-teal-500/30 px-5 py-2.5 shadow">
                <p className="text-2xl sm:text-3xl font-black text-blue-950 leading-tight">
                  {currentUser.displayName}
                </p>
                <p className="text-base font-bold text-teal-700">
                  {roleLabel(currentUser.role)}
                </p>
              </div>
            ) : (
              <div className="text-base text-gray-600 font-bold">
                در حال دریافت کاربر...
              </div>
            )}

            <div className="rounded-2xl bg-white/80 border border-teal-500/30 px-5 py-2.5 shadow">
              <p className="text-sm font-bold text-blue-800 mb-0.5">سال مالی</p>
              {editingFiscal ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    defaultValue={fiscalYear}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        saveFiscalYear((e.target as HTMLInputElement).value)
                      }
                      if (e.key === "Escape") {
                        e.stopPropagation()
                        setEditingFiscal(false)
                      }
                    }}
                    className="w-28 rounded-lg border border-teal-500 px-2 py-1 text-xl font-black text-blue-950 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.activeElement as HTMLInputElement
                      saveFiscalYear(el?.value || fiscalYear)
                    }}
                    className="text-base font-bold text-teal-700"
                  >
                    ذخیره
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingFiscal(true)}
                  className="text-2xl font-black text-blue-950 hover:text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 rounded"
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
              className="sm:hidden rounded-xl bg-white/60 border border-teal-500/30 px-3 py-2 text-base font-bold text-blue-900 focus:ring-2 focus:ring-teal-500"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((v) => !v)}
            >
              منو
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="text-lg font-bold text-gray-700 hover:text-teal-700 transition px-3 py-1.5 rounded-lg hover:bg-white/40 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              خروج
            </button>
          </div>
        </header>

        <div className="flex-1 min-h-[48vh] sm:min-h-[52vh]" />

        <div className="pb-8 px-4 sm:px-6" id="main-menu">
          <div className="max-w-6xl mx-auto">
            <div
              className={`bg-white/45 backdrop-blur-xl border border-white/50 rounded-2xl shadow-2xl px-3 sm:px-4 py-5 ${
                mobileOpen ? "block" : "hidden sm:block"
              }`}
            >
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-8 gap-2">
                {menuItems.map((item) => {
                  const blockedForProduction =
                    isProductionOnly &&
                    (item.isSales ||
                      (item as any).isExecution ||
                      (item as any).isFinance ||
                      (item as any).isReports ||
                      (item as any).lockedForProduction)

                  const iconSvg = (
                    <div className="w-14 h-14 rounded-xl bg-teal-500/15 flex items-center justify-center border border-teal-500/20">
                      <svg
                        className="w-8 h-8 text-teal-700"
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
                  )

                  const titleSpan = (
                    <span className="text-base sm:text-lg font-bold text-gray-800 text-center">
                      {item.title}
                    </span>
                  )

                  if (item.isSales) {
                    return (
                      <div
                        key={item.title}
                        ref={salesRef}
                        className="relative"
                        onMouseEnter={() => {
                          if (!canOpenSales) return
                          closeAllMenus()
                          setShowSalesMenu(true)
                        }}
                      >
                        <button
                          type="button"
                          aria-haspopup={canOpenSales ? "menu" : undefined}
                          aria-expanded={canOpenSales ? showSalesMenu : false}
                          onClick={() => {
                            if (!canOpenSales) return
                            const next = !showSalesMenu
                            closeAllMenus()
                            setShowSalesMenu(next)
                          }}
                          className={menuBtnClass}
                        >
                          {iconSvg}
                          {titleSpan}
                        </button>
                        {canOpenSales &&
                          renderSalesCascadingMenu(showSalesMenu, () => {
                            setShowSalesMenu(false)
                            setSalesFlyout(null)
                          })}
                      </div>
                    )
                  }

                  if ((item as any).isExecution) {
                    if (blockedForProduction) {
                      return (
                        <button
                          key={item.title}
                          type="button"
                          className={menuBtnClass}
                        >
                          {iconSvg}
                          {titleSpan}
                        </button>
                      )
                    }
                    return (
                      <div
                        key={item.title}
                        ref={executionRef}
                        className="relative"
                        onMouseEnter={() => {
                          if (!canOpenExecution) return
                          closeAllMenus()
                          setShowExecutionMenu(true)
                        }}
                      >
                        <button
                          type="button"
                          aria-haspopup="menu"
                          aria-expanded={showExecutionMenu}
                          onClick={() => {
                            if (!canOpenExecution) return
                            const next = !showExecutionMenu
                            closeAllMenus()
                            setShowExecutionMenu(next)
                          }}
                          className={menuBtnClass}
                        >
                          {iconSvg}
                          {titleSpan}
                        </button>
                        {canOpenExecution &&
                          renderSubMenu(
                            showExecutionMenu,
                            executionItems,
                            () => setShowExecutionMenu(false)
                          )}
                      </div>
                    )
                  }

                  if (item.isProduction) {
                    return (
                      <div
                        key={item.title}
                        ref={productionRef}
                        className="relative"
                        onMouseEnter={() => {
                          closeAllMenus()
                          setShowProductionMenu(true)
                        }}
                      >
                        <button
                          type="button"
                          aria-haspopup="menu"
                          aria-expanded={showProductionMenu}
                          onClick={() => {
                            const next = !showProductionMenu
                            closeAllMenus()
                            setShowProductionMenu(next)
                          }}
                          className={menuBtnClass}
                        >
                          {iconSvg}
                          {titleSpan}
                        </button>
                        {renderSubMenu(
                          showProductionMenu,
                          productionItems,
                          () => setShowProductionMenu(false)
                        )}
                      </div>
                    )
                  }

                  if ((item as any).isFinance) {
                    if (blockedForProduction) {
                      return (
                        <button
                          key={item.title}
                          type="button"
                          className={menuBtnClass}
                        >
                          {iconSvg}
                          {titleSpan}
                        </button>
                      )
                    }
                    return (
                      <div
                        key={item.title}
                        ref={financeRef}
                        className="relative"
                        onMouseEnter={() => {
                          if (!canOpenFinance) return
                          closeAllMenus()
                          setShowFinanceMenu(true)
                        }}
                      >
                        <button
                          type="button"
                          aria-haspopup="menu"
                          aria-expanded={showFinanceMenu}
                          onClick={() => {
                            if (!canOpenFinance) return
                            const next = !showFinanceMenu
                            closeAllMenus()
                            setShowFinanceMenu(next)
                          }}
                          className={menuBtnClass}
                        >
                          {iconSvg}
                          {titleSpan}
                        </button>
                        {canOpenFinance &&
                          renderSubMenu(showFinanceMenu, financeItems, () =>
                            setShowFinanceMenu(false)
                          )}
                      </div>
                    )
                  }

                  if ((item as any).isReports) {
                    if (blockedForProduction) {
                      return (
                        <button
                          key={item.title}
                          type="button"
                          className={menuBtnClass}
                        >
                          {iconSvg}
                          {titleSpan}
                        </button>
                      )
                    }
                    return (
                      <div
                        key={item.title}
                        ref={reportsRef}
                        className="relative"
                        onMouseEnter={() => {
                          if (!canOpenReports) return
                          closeAllMenus()
                          setShowReportsMenu(true)
                        }}
                      >
                        <button
                          type="button"
                          aria-haspopup="menu"
                          aria-expanded={showReportsMenu}
                          onClick={() => {
                            if (!canOpenReports) return
                            const next = !showReportsMenu
                            closeAllMenus()
                            setShowReportsMenu(next)
                          }}
                          className={menuBtnClass}
                        >
                          {iconSvg}
                          {titleSpan}
                        </button>
                        {canOpenReports &&
                          renderSubMenu(showReportsMenu, reportsItems, () =>
                            setShowReportsMenu(false)
                          )}
                      </div>
                    )
                  }

                  if (blockedForProduction) {
                    return (
                      <button
                        key={item.title}
                        type="button"
                        className={menuBtnClass}
                      >
                        {iconSvg}
                        {titleSpan}
                      </button>
                    )
                  }

                  return (
                    <Link
                      key={item.title}
                      href={item.href}
                      className={menuBtnClass}
                    >
                      {iconSvg}
                      {titleSpan}
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-center items-center gap-6 sm:gap-8 flex-wrap text-base sm:text-lg font-bold text-gray-700">
            <a
              href="https://www.akhavanglass.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 hover:text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 rounded px-1 transition"
            >
              <span>www.akhavanglass.com</span>
            </a>
            <a
              href="tel:02191005103"
              className="flex items-center gap-2 hover:text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 rounded px-1 transition"
            >
              <span>02191005103</span>
            </a>
            <a
              href="tel:09129582600"
              className="flex items-center gap-2 hover:text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 rounded px-1 transition"
            >
              <span>09129582600</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}