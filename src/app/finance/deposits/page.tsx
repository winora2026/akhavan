"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import DatePicker, { DateObject } from "react-multi-date-picker"
import persian from "react-date-object/calendars/persian"
import persian_fa from "react-date-object/locales/persian_fa"
// ⚠ مسیر را مطابق محل این فایل تنظیم کنید (همان فایل لیست مشتریان که صفحه‌ی ثبت سفارش و فاکتورها هم می‌خوانند)
import customersSeedRaw from "../../customers/customers-seed.json"

type BankAccount = {
  id: string
  name: string
  bankName?: string | null
  ownerName?: string | null
  cardNumber?: string | null
  accountNumber?: string | null
  iban?: string | null
}

type Deposit = {
  id: string
  customerName: string
  customerCode?: string | null
  customerId?: string | null
  amount: number
  depositDate: string
  receiptImageUrl?: string | null
  notes?: string | null
  status: string
  createdByName?: string | null
  confirmedByName?: string | null
  confirmedAt?: string | null
  bankAccount: BankAccount
  bankAccountId?: string
  customer?: { customerCode?: string | null } | null
}

type Customer = {
  id: string
  name: string
  customerCode?: string | null
  // منبع مشتری: "seed" = فقط در فایل لیست قدیمی مشتریان است (شناسه‌ی دیتابیس ندارد)
  source?: "seed" | "db"
  normalizedName?: string
  normalizedCode?: string
}

// حروف عربی (ي، ك، ة) → فارسی، ارقام فارسی/عربی → لاتین، حذف نیم‌فاصله و کاراکترهای جهت‌ساز
// (بدون این، جستجوی «علی» یا «۱۲۳» روی داده‌هایی که با حروف/ارقام عربی ثبت شده‌اند جواب نمی‌دهد)
const normalizeText = (value: string | null | undefined) => {
  if (!value) return ""
  return String(value)
    .replace(/[\u200c\u200f\u200e]/g, " ")
    .replace(/ي/g, "ی")
    .replace(/ى/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim()
}

// ===== کد مشتری (همان منطق صفحه‌ی فاکتورها / پیش‌فاکتورها) =====
// کدهای مشتریان قدیمی (از فایل لیست مشتریان): نام نرمال‌شده → کد
const seedCodeByName = (() => {
  const map = new Map<string, string>()
  ;(customersSeedRaw as any[]).forEach((c: any) => {
    const code = String(c.code || "").trim()
    if (!code) return
    const names = [
      c.companyName,
      `${c.lastName || ""} ${c.firstName || ""}`,
      `${c.firstName || ""} ${c.lastName || ""}`,
    ]
    names.forEach((n) => {
      const key = normalizeText(String(n || ""))
      if (key && !map.has(key)) map.set(key, code)
    })
  })
  return map
})()

// اگر در دیتابیس کد واقعی ثبت شده همان؛ وگرنه (خالی یا کد خودکارِ C-عدد) از لیست قدیمی به‌اسم پیدا می‌شود
function resolveCustomerCode(name: string | null | undefined, dbCode?: string | null): string {
  const c = String(dbCode || "").trim()
  if (c && !/^C-\d{8,}$/.test(c)) return c
  return seedCodeByName.get(normalizeText(name)) || ""
}

// لیست مشتریانِ فایل seed (برای جستجوی مشتری در فرم ثبت واریزی)
const seedCustomers: Customer[] = (customersSeedRaw as any[]).map((c: any) => {
  let name = ""
  if (c.customerType === "حقوقی") {
    name = (c.companyName || "").trim()
    if (!name) name = `${c.lastName || ""} ${c.firstName || ""}`.trim()
  } else {
    name = `${c.lastName || ""} ${c.firstName || ""}`.trim()
    if (!name) name = (c.companyName || "").trim()
  }
  if (!name) name = c.companyName || c.lastName || c.firstName || c.code || "بدون نام"
  const code = String(c.code || "").trim()
  return {
    id: `seed-${c.id ?? code ?? name}`,
    name,
    customerCode: code || null,
    source: "seed" as const,
    normalizedName: normalizeText(name),
    normalizedCode: normalizeText(code),
  }
})

/** نمایش مبلغ به ریال با جداکننده هزارگان */
function formatRial(n: number) {
  if (n == null || isNaN(n)) return "—"
  return Math.round(n).toLocaleString("fa-IR")
}

function formatFaDate(iso?: string | null) {
  if (!iso) return "—"
  try {
    return new DateObject({
      date: new Date(iso),
      calendar: persian,
      locale: persian_fa,
    }).format("YYYY/MM/DD")
  } catch {
    return "—"
  }
}

function formatCard(c?: string | null) {
  if (!c) return "—"
  const d = c.replace(/\D/g, "")
  return d.replace(/(\d{4})(?=\d)/g, "$1-")
}

// حساب‌های بانکی (از روی عکس کارت‌ها). دکمه‌ی «افزودن حساب‌ها» فقط حساب‌هایی را اضافه می‌کند که
// شماره کارت / شبا / شماره حسابشان هنوز در لیست نیست. قبل از افزودن، ارقام را یک بار بررسی کنید.
const SUGGESTED_ACCOUNTS: Omit<BankAccount, "id">[] = [
  { name: "ملت هادی درودیان", bankName: "بانک ملت", ownerName: "هادی درودیان", cardNumber: "6104337809586488", accountNumber: "4049978094", iban: "IR370120010000004049978094" },
  { name: "پارسیان مجتبی خاجی", bankName: "بانک پارسیان", ownerName: "مجتبی خاجی", cardNumber: "6221061231052947", accountNumber: null, iban: "IR190540125720100882337601" },
  { name: "پست بانک مجتبی خاجی", bankName: "پست بانک", ownerName: "مجتبی خاجی", cardNumber: "6277601352377491", accountNumber: null, iban: "IR620210000001000219153011" },
  { name: "پست بانک مرضیه درودی", bankName: "پست بانک", ownerName: "مرضیه درودی", cardNumber: "6277601353233701", accountNumber: "1000219674842", iban: "IR690210000001000219674842" },
  { name: "صادرات مرضیه درودی", bankName: "بانک صادرات", ownerName: "مرضیه درودی", cardNumber: "6037697566101875", accountNumber: null, iban: "IR330190000000117869193005" },
  { name: "صادرات مجتبی خاجی", bankName: "بانک صادرات", ownerName: "مجتبی خاجی", cardNumber: "6037697567784894", accountNumber: "0114282409005", iban: "IR580190000000114282409005" },
  { name: "پارسیان صنایع شیشه اخوان", bankName: "بانک پارسیان", ownerName: "صنایع شیشه اخوان", cardNumber: null, accountNumber: "02100001936007", iban: "IR020540104202100001936007" },
]

const digitsOnly = (v?: string | null) => String(v || "").replace(/\D/g, "")

// فیلترها در sessionStorage ذخیره می‌شوند تا با رفتن به صفحه‌ی دیگر و برگشتن، از اول نشود
const FILTERS_KEY = "customerDepositsFilters"

// تاریخ امروز (هر بار تازه محاسبه می‌شود؛ تا بعد از نیمه‌شب هم تاریخ کهنه نماند)
const makeToday = () => new DateObject({ calendar: persian, locale: persian_fa })

const DAY_MS = 24 * 60 * 60 * 1000
const startOfLocalDay = (d: Date) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
const endOfLocalDay = (d: Date) => {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}
const isTodayDate = (d: any) => {
  if (!d?.toDate) return false
  const a = d.toDate()
  const b = new Date()
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export default function CustomerDepositsPage() {
  const [rows, setRows] = useState<Deposit[]>([])
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [dbCustomers, setDbCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [me, setMe] = useState<{ displayName: string; role: string } | null>(null)

  const today = useMemo(() => makeToday(), [])
  const [fromDate, setFromDate] = useState<any>(today)
  const [toDate, setToDate] = useState<any>(today)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("همه")
  const [filtersReady, setFiltersReady] = useState(false)
  // "today": فقط امروز و با تغییر روز خودکار روی روز جدید می‌رود | "range": بازه‌ی انتخابی کاربر (می‌ماند)
  const [dayMode, setDayMode] = useState<"today" | "range">("today")
  // آخرین مقدارِ فیلترها برای تایمر به‌روزرسانی خودکار (تا تایمر مقادیر کهنه نخواند)
  const latestRef = useRef<{ fromDate: any; toDate: any; statusFilter: string; dayMode: "today" | "range" }>({
    fromDate: today,
    toDate: today,
    statusFilter: "همه",
    dayMode: "today",
  })
  latestRef.current = { fromDate, toDate, statusFilter, dayMode }
  const dayKeyRef = useRef(new Date().toDateString())

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [customerSearch, setCustomerSearch] = useState("")
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [showCustDrop, setShowCustDrop] = useState(false)
  const [custActive, setCustActive] = useState(0)
  const [amount, setAmount] = useState("")
  const [bankAccountId, setBankAccountId] = useState("")
  const [depositDate, setDepositDate] = useState<any>(today)
  const [notes, setNotes] = useState("")
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const canConfirm = me?.role === "finance" || me?.role === "admin"

  const selectedAccount = accounts.find((a) => a.id === bankAccountId) || null

  // همه‌ی مشتریان: اول مشتریان دیتابیس، بعد مشتریان فایل قدیمی که در دیتابیس نیستند (بدون تکرار)
  const allCustomers = useMemo(() => {
    const seenNames = new Set<string>()
    const seenCodes = new Set<string>()
    const out: Customer[] = []
    for (const c of dbCustomers) {
      const code = resolveCustomerCode(c.name, c.customerCode)
      const nName = normalizeText(c.name)
      const nCode = normalizeText(code)
      if (nName) seenNames.add(nName)
      if (nCode) seenCodes.add(nCode)
      out.push({ ...c, customerCode: code || null, normalizedName: nName, normalizedCode: nCode })
    }
    for (const c of seedCustomers) {
      if (c.normalizedName && seenNames.has(c.normalizedName)) continue
      if (c.normalizedCode && seenCodes.has(c.normalizedCode)) continue
      out.push(c)
    }
    return out
  }, [dbCustomers])

  // جستجوی مشتری مثل ثبت سفارش: همه‌ی کلمه‌های تایپ‌شده باید در نام یا کد باشند (ترتیب مهم نیست)
  const filteredCustomers = useMemo(() => {
    const q = normalizeText(customerSearch)
    if (!q) return allCustomers.slice(0, 10)
    const tokens = q.split(" ").filter(Boolean)
    return allCustomers
      .filter((c) =>
        tokens.every(
          (t) => (c.normalizedName || "").includes(t) || (c.normalizedCode || "").includes(t)
        )
      )
      .slice(0, 100)
  }, [customerSearch, allCustomers])

  // ذخیره‌ی خودکار فیلترها
  useEffect(() => {
    if (!filtersReady) return
    try {
      sessionStorage.setItem(
        FILTERS_KEY,
        JSON.stringify({
          dayStamp: new Date().toDateString(),
          dayMode,
          search,
          statusFilter,
          fromDate: fromDate?.toDate ? fromDate.toDate().toISOString() : null,
          toDate: toDate?.toDate ? toDate.toDate().toISOString() : null,
        })
      )
    } catch {}
  }, [filtersReady, dayMode, search, statusFilter, fromDate, toDate])

  // بستن لیست مشتری با کلیک بیرون
  useEffect(() => {
    const close = () => setShowCustDrop(false)
    window.addEventListener("click", close)
    return () => window.removeEventListener("click", close)
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const r = await fetch("/api/auth/me")
        if (r.ok) {
          const d = await r.json()
          if (d.user)
            setMe({ displayName: d.user.displayName, role: d.user.role })
        }
      } catch {}
    })()
    fetch("/api/finance/bank-accounts")
      .then((r) => r.json())
      .then((d) => setAccounts(Array.isArray(d) ? d : []))
      .catch(() => {})

    // مشتریان دیتابیس: از هر دو منبعی که در سیستم هست (هرکدام که جواب داد)، با هم ادغام می‌شوند
    ;(async () => {
      const collected: Customer[] = []
      const push = (id: any, name: any, code: any) => {
        const n = String(name || "").trim()
        if (!id || !n) return
        collected.push({ id: String(id), name: n, customerCode: code ? String(code) : null, source: "db" })
      }
      try {
        const res = await fetch("/api/customers")
        if (res.ok) {
          const d = await res.json()
          if (Array.isArray(d)) d.forEach((c: any) => push(c.id, c.name, c.customerCode))
        }
      } catch {}
      try {
        const res = await fetch("/api/customer-profiles")
        if (res.ok) {
          const d = await res.json()
          if (Array.isArray(d)) d.forEach((c: any) => push(c.id, c.name, c.customerCode))
        }
      } catch {}
      if (collected.length === 0) {
        // آخرین راه: مشتریانی که روی سفارش‌ها هستند
        try {
          const res = await fetch("/api/orders")
          const orders = await res.json()
          if (Array.isArray(orders)) {
            for (const o of orders) push(o.customer?.id, o.customer?.name, o.customer?.customerCode)
          }
        } catch {}
      }
      // حذف تکراری‌ها (بر اساس شناسه)
      const byId = new Map<string, Customer>()
      collected.forEach((c) => {
        if (!byId.has(c.id)) byId.set(c.id, c)
      })
      setDbCustomers(Array.from(byId.values()))
    })()
  }, [])

  // بارگذاری واریزی‌ها: بازه‌ی تاریخ از ابتدای روز «از» تا انتهای روز «تا»؛ جستجوی متنی سمت مرورگر انجام می‌شود.
  // silent=true (به‌روزرسانی خودکار): بدون نمایش «در حال بارگذاری» و بدون خالی‌شدن لیست در صورت خطا
  const loadWith = async (f: any, t: any, st: string, silent = false) => {
    if (!silent) setLoading(true)
    try {
      // بازه‌ی دقیقِ روزِ محلی (ایران): از ابتدای روز «از» تا انتهای روز «تا»
      const localFrom = f?.toDate ? startOfLocalDay(f.toDate()) : null
      const localTo = t?.toDate ? endOfLocalDay(t.toDate()) : null
      // سرور (که مرز روز را احتمالاً با ساعت UTC حساب می‌کند) یک روز عقب و جلوتر را هم بفرستد تا هیچ واریزی جا نیفتد؛
      // فیلتر دقیقِ روز بعد از دریافت، همین‌جا در مرورگر انجام می‌شود (تا واریزی‌های روز قبل/بعد قاطی نشوند)
      const params = new URLSearchParams()
      if (localFrom) params.set("from", new Date(localFrom.getTime() - DAY_MS).toISOString())
      if (localTo) params.set("to", new Date(localTo.getTime() + DAY_MS).toISOString())
      if (st !== "همه") params.set("status", st)
      const res = await fetch(`/api/finance/deposits?${params}`)
      const data = await res.json()
      if (silent && !res.ok) return
      const list: Deposit[] = Array.isArray(data) ? data : []
      setRows(
        list.filter((r) => {
          const d = new Date(r.depositDate)
          if (!isNaN(d.getTime())) {
            if (localFrom && d < localFrom) return false
            if (localTo && d > localTo) return false
          }
          if (st !== "همه" && r.status !== st) return false
          return true
        })
      )
    } catch {
      if (!silent) setRows([])
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const load = () => loadWith(fromDate, toDate, statusFilter)

  // با باز شدن صفحه: فیلترهای قبلی (اگر هست) برگردانده می‌شوند.
  // حالت «امروز» همیشه با تاریخِ همین لحظه باز می‌شود؛ بازه‌ی انتخابیِ کاربر فقط در همان روز نگه داشته می‌شود
  // (تا فردا با بازه‌ی دیروز باز نشود).
  useEffect(() => {
    let f: any = makeToday()
    let t: any = makeToday()
    let st = "همه"
    let q = ""
    let mode: "today" | "range" = "today"
    try {
      const raw = sessionStorage.getItem(FILTERS_KEY)
      if (raw) {
        const s = JSON.parse(raw)
        if (typeof s.search === "string") q = s.search
        if (typeof s.statusFilter === "string") st = s.statusFilter
        if (
          s.dayMode === "range" &&
          s.dayStamp === new Date().toDateString() &&
          "fromDate" in s &&
          "toDate" in s
        ) {
          const toDO = (iso: string) =>
            new DateObject({ date: new Date(iso), calendar: persian, locale: persian_fa })
          f = s.fromDate ? toDO(s.fromDate) : null
          t = s.toDate ? toDO(s.toDate) : null
          mode = "range"
        }
      }
    } catch {}
    setSearch(q)
    setStatusFilter(st)
    setFromDate(f)
    setToDate(t)
    setDayMode(mode)
    setFiltersReady(true)
    loadWith(f, t, st)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // به‌روزرسانی خودکار: هر ۶۰ ثانیه (و وقتی دوباره به تب برمی‌گردید) لیست بدون رفرش و بدون چشمک‌زدن
  // دوباره خوانده می‌شود. در حالت «امروز»، با رد شدن از نیمه‌شب تاریخ‌ها خودکار روی روز جدید می‌روند؛
  // در حالت «بازه‌ی انتخابی» همان بازه می‌ماند.
  useEffect(() => {
    const tick = () => {
      if (document.hidden) return
      const cur = latestRef.current
      let f = cur.fromDate
      let t = cur.toDate
      const nowKey = new Date().toDateString()
      if (cur.dayMode === "today" && nowKey !== dayKeyRef.current) {
        f = makeToday()
        t = makeToday()
        setFromDate(f)
        setToDate(t)
      }
      dayKeyRef.current = nowKey
      loadWith(f, t, cur.statusFilter, true)
    }
    const timer = setInterval(tick, 60_000)
    document.addEventListener("visibilitychange", tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", tick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // بازگشت به «فقط امروز»
  const showToday = () => {
    const f = makeToday()
    const t = makeToday()
    setFromDate(f)
    setToDate(t)
    setDayMode("today")
    loadWith(f, t, statusFilter)
  }

  const showAllDates = () => {
    setFromDate(null)
    setToDate(null)
    setDayMode("range")
    loadWith(null, null, statusFilter)
  }

  // جستجوی صفحه (سمت مرورگر): نام و کد مشتری با یکسان‌سازی حروف/ارقام، همه‌ی کلمه‌ها (ترتیب مهم نیست)
  const visibleRows = useMemo(() => {
    const tokens = normalizeText(search).split(" ").filter(Boolean)
    if (!tokens.length) return rows
    return rows.filter((r) => {
      const code = resolveCustomerCode(r.customerName, r.customerCode || r.customer?.customerCode)
      const haystack = normalizeText(
        [r.customerName, code, r.createdByName, r.bankAccount?.name, r.notes].filter(Boolean).join(" ")
      )
      return tokens.every((t) => haystack.includes(t))
    })
  }, [rows, search])

  const totalAmount = visibleRows.reduce((s, r) => s + (r.amount || 0), 0)
  const pendingCount = visibleRows.filter((r) => r.status === "PENDING").length

  const resetForm = () => {
    setEditingId(null)
    setAmount("")
    setNotes("")
    setReceiptUrl(null)
    setSelectedCustomer(null)
    setCustomerSearch("")
    setBankAccountId("")
    setDepositDate(makeToday())
  }

  const openCreate = () => {
    resetForm()
    setShowForm(true)
  }

  const openEdit = (r: Deposit) => {
    setEditingId(r.id)
    setSelectedCustomer(
      r.customerId
        ? {
            id: r.customerId,
            name: r.customerName,
            customerCode:
              resolveCustomerCode(r.customerName, r.customerCode || r.customer?.customerCode) || null,
            source: "db",
          }
        : null
    )
    setCustomerSearch(r.customerName)
    setAmount(String(Math.round(r.amount)))
    setBankAccountId(r.bankAccountId || r.bankAccount?.id || "")
    setDepositDate(
      new DateObject({
        date: new Date(r.depositDate),
        calendar: persian,
        locale: persian_fa,
      })
    )
    setNotes(r.notes || "")
    setReceiptUrl(r.receiptImageUrl || null)
    setShowForm(true)
  }

  const pickCustomer = (c: Customer) => {
    setSelectedCustomer(c)
    setCustomerSearch(c.name)
    setShowCustDrop(false)
    setCustActive(0)
  }

  const uploadReceipt = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/upload", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا در آپلود")
      setReceiptUrl(data.url)
    } catch (e: any) {
      alert(e.message || "خطا در آپلود فیش")
    } finally {
      setUploading(false)
    }
  }

  const submit = async () => {
    if (!selectedCustomer && !customerSearch.trim()) {
      alert("نام مشتری را انتخاب یا وارد کنید")
      return
    }
    if (!bankAccountId) {
      alert("حساب بانکی را انتخاب کنید")
      return
    }
    const amt = Number(String(amount).replace(/,/g, "").replace(/٬/g, ""))
    if (!amt || amt <= 0) {
      alert("مبلغ معتبر وارد کنید (ریال)")
      return
    }
    setSaving(true)
    try {
      const finalName = selectedCustomer?.name || customerSearch.trim()
      const payload = {
        // مشتریِ فقط-در-فایل-قدیمی شناسه‌ی دیتابیس ندارد؛ با نام و کد ثبت می‌شود
        customerId: selectedCustomer && selectedCustomer.source !== "seed" ? selectedCustomer.id : null,
        customerName: finalName,
        customerCode: resolveCustomerCode(finalName, selectedCustomer?.customerCode) || null,
        amount: amt,
        bankAccountId,
        depositDate:
          depositDate?.toDate?.()?.toISOString?.() || new Date().toISOString(),
        receiptImageUrl: receiptUrl,
        notes: notes || null,
      }

      let res: Response
      if (editingId) {
        res = await fetch("/api/finance/deposits", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingId, action: "update", ...payload }),
        })
      } else {
        res = await fetch("/api/finance/deposits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا در ذخیره")
      setShowForm(false)
      resetForm()
      await load()
    } catch (e: any) {
      alert(e.message || "خطا")
    } finally {
      setSaving(false)
    }
  }

  const confirmRow = async (id: string) => {
    if (!confirm("تأیید ثبت این واریزی؟")) return
    try {
      const res = await fetch("/api/finance/deposits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "confirm" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا")
      await load()
    } catch (e: any) {
      alert(e.message || "خطا")
    }
  }

  const deleteRow = async (id: string) => {
    if (!confirm("این واریزی حذف شود؟")) return
    try {
      const res = await fetch(`/api/finance/deposits?id=${id}`, {
        method: "DELETE",
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا در حذف")
      await load()
    } catch (e: any) {
      alert(e.message || "خطا")
    }
  }

  const refreshAccounts = async () => {
    try {
      const r = await fetch("/api/finance/bank-accounts")
      const d = await r.json()
      setAccounts(Array.isArray(d) ? d : [])
    } catch {}
  }

  // حساب‌های پیشنهادی که هنوز در لیست نیستند (تطبیق با شماره کارت / شبا / شماره حساب)
  const missingAccounts = useMemo(() => {
    const keys = new Set<string>()
    for (const a of accounts) {
      for (const v of [a.cardNumber, a.iban, a.accountNumber]) {
        const d = digitsOnly(v)
        if (d.length >= 8) keys.add(d)
      }
    }
    return SUGGESTED_ACCOUNTS.filter((s) => {
      const ds = [s.cardNumber, s.iban, s.accountNumber].map(digitsOnly).filter((d) => d.length >= 8)
      return !ds.some((d) => keys.has(d))
    })
  }, [accounts])

  const addSuggestedAccounts = async () => {
    if (missingAccounts.length === 0) return
    if (!confirm(`${missingAccounts.length} حساب بانکی جدید اضافه شود؟`)) return
    const failed: string[] = []
    for (const a of missingAccounts) {
      try {
        const res = await fetch("/api/finance/bank-accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(a),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          failed.push(`${a.name}: ${d.error || res.status}`)
        }
      } catch {
        failed.push(`${a.name}: خطا در ارتباط`)
      }
    }
    await refreshAccounts()
    if (failed.length) alert("بعضی حساب‌ها اضافه نشدند:\n" + failed.join("\n"))
  }

  // خروجی اکسل (CSV با کدگذاری UTF-8 که مستقیم در اکسل باز می‌شود) از همان ردیف‌هایی که روی صفحه دیده می‌شود
  const exportExcel = () => {
    if (!visibleRows.length) {
      alert("ردیفی برای خروجی نیست")
      return
    }
    const header = [
      "ردیف",
      "تاریخ",
      "کد مشتری",
      "نام مشتری",
      "مبلغ (ریال)",
      "حساب",
      "شماره کارت",
      "ثبت‌کننده",
      "وضعیت",
      "تأییدکننده",
      "توضیحات",
    ]
    const data = visibleRows.map((r, i) => [
      i + 1,
      formatFaDate(r.depositDate),
      resolveCustomerCode(r.customerName, r.customerCode || r.customer?.customerCode),
      r.customerName,
      Math.round(r.amount || 0),
      r.bankAccount?.name || "",
      digitsOnly(r.bankAccount?.cardNumber),
      r.createdByName || "",
      r.status === "PENDING" ? "در انتظار تأیید" : "تأیید شده",
      r.confirmedByName || "",
      r.notes || "",
    ])
    data.push(["", "", "", "جمع", Math.round(totalAmount), "", "", "", "", "", ""])
    const csv =
      "\uFEFF" +
      [header, ...data]
        .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
        .join("\r\n")
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }))
    a.download = `deposits-${formatFaDate(new Date().toISOString()).replace(/\//g, "-")}.csv`
    a.click()
  }

  return (
    <div
      className="min-h-screen p-4 md:p-6 bg-slate-50 bg-cover bg-center bg-fixed"
      dir="rtl"
      style={{
        backgroundImage:
          "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')",
        fontFamily: "Vazirmatn, Tahoma, sans-serif",
      }}
    >
      <div className="max-w-[1400px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 rounded-2xl bg-white/80 backdrop-blur px-5 py-3 border border-teal-200 shadow-sm">
          <div>
            <h1 className="text-3xl font-black text-blue-950">
              واریزی‌های مشتریان
            </h1>
            <p className="text-base text-blue-800 mt-1">
              مبالغ به <b>ریال</b> | امروز پیش‌فرض فیلتر است
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/"
              className="rounded-xl border bg-white px-5 py-2.5 text-base font-bold text-blue-900"
            >
              داشبورد
            </Link>
            {canConfirm && missingAccounts.length > 0 && (
              <button
                onClick={addSuggestedAccounts}
                title="افزودن حساب‌های بانکی که هنوز در لیست نیستند"
                className="rounded-xl border border-blue-900 bg-white text-blue-900 text-base font-bold px-5 py-2.5 hover:bg-blue-50"
              >
                افزودن حساب‌ها ({missingAccounts.length})
              </button>
            )}
            <button
              onClick={exportExcel}
              className="rounded-xl border border-green-700 bg-white text-green-800 text-base font-bold px-5 py-2.5 hover:bg-green-50"
            >
              خروجی اکسل
            </button>
            <button
              onClick={openCreate}
              className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-base font-bold px-5 py-2.5"
            >
              + ثبت واریزی
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-teal-200 bg-white/85 backdrop-blur p-3 mb-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="mb-1 block text-sm font-bold">جستجو</label>
            <input
              className="w-full h-[42px] rounded-xl border px-3 text-base"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="نام / کد مشتری"
              title="فقط بین واریزی‌های بازه‌ی تاریخ انتخاب‌شده جستجو می‌شود"
            />
          </div>
          <div className="w-[150px]">
            <label className="mb-1 block text-sm font-bold">از تاریخ</label>
            <DatePicker
              value={fromDate}
              onChange={(v) => {
                setFromDate(v)
                setDayMode(isTodayDate(v) && isTodayDate(toDate) ? "today" : "range")
              }}
              calendar={persian}
              locale={persian_fa}
              calendarPosition="bottom-right"
              containerClassName="w-full"
              inputClass="w-full h-[42px] rounded-xl border px-3 text-base"
            />
          </div>
          <div className="w-[150px]">
            <label className="mb-1 block text-sm font-bold">تا تاریخ</label>
            <DatePicker
              value={toDate}
              onChange={(v) => {
                setToDate(v)
                setDayMode(isTodayDate(fromDate) && isTodayDate(v) ? "today" : "range")
              }}
              calendar={persian}
              locale={persian_fa}
              calendarPosition="bottom-right"
              containerClassName="w-full"
              inputClass="w-full h-[42px] rounded-xl border px-3 text-base"
            />
          </div>
          <div className="w-[170px]">
            <label className="mb-1 block text-sm font-bold">وضعیت</label>
            <select
              className="w-full h-[42px] rounded-xl border px-3 text-base bg-white"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="همه">همه</option>
              <option value="PENDING">در انتظار تأیید</option>
              <option value="CONFIRMED">تأیید شده</option>
            </select>
          </div>
          <button
            onClick={load}
            className="h-[42px] rounded-xl bg-blue-900 text-white text-base font-bold px-5 whitespace-nowrap"
          >
            اعمال فیلتر
          </button>
          <button
            onClick={showToday}
            title="فقط واریزی‌های امروز (با تغییر روز خودکار به روز جدید می‌رود)"
            className={`h-[42px] rounded-xl border text-base font-bold px-5 whitespace-nowrap ${
              dayMode === "today"
                ? "bg-teal-600 border-teal-600 text-white"
                : "bg-white border-blue-900 text-blue-900 hover:bg-blue-50"
            }`}
          >
            امروز
          </button>
          <button
            onClick={showAllDates}
            title="جستجو در واریزی‌های همه‌ی تاریخ‌ها"
            className="h-[42px] rounded-xl border border-blue-900 bg-white text-blue-900 text-base font-bold px-5 whitespace-nowrap hover:bg-blue-50"
          >
            همه تاریخ‌ها
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl bg-teal-50/90 border p-4 text-center">
            <p className="text-sm font-bold">تعداد</p>
            <p className="text-2xl font-black">{visibleRows.length}</p>
          </div>
          <div className="rounded-xl bg-amber-50/90 border p-4 text-center">
            <p className="text-sm font-bold">در انتظار تأیید</p>
            <p className="text-2xl font-black text-amber-700">{pendingCount}</p>
          </div>
          <div className="rounded-xl bg-green-50/90 border p-4 text-center">
            <p className="text-sm font-bold">جمع مبلغ (ریال)</p>
            <p className="text-2xl font-black text-green-700" dir="ltr">
              {formatRial(totalAmount)}
            </p>
          </div>
        </div>

        {/* جدول: خودش اسکرول دارد (max-h) تا سرستون‌ها بالای آن فریز بمانند */}
        <div className="rounded-2xl border overflow-auto max-h-[65vh] bg-white/90 backdrop-blur shadow-sm">
          {loading ? (
            <p className="p-8 text-center text-lg">در حال بارگذاری...</p>
          ) : (
            <table className="min-w-full text-base">
              <thead className="bg-teal-700 text-white sticky top-0 z-10">
                <tr>
                  <th className="p-3 text-center">#</th>
                  <th className="p-3">تاریخ</th>
                  <th className="p-3">کد مشتری</th>
                  <th className="p-3">نام مشتری</th>
                  <th className="p-3">مبلغ (ریال)</th>
                  <th className="p-3">حساب</th>
                  <th className="p-3">ثبت‌کننده</th>
                  <th className="p-3">فیش</th>
                  <th className="p-3">وضعیت</th>
                  <th className="p-3">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r, idx) => {
                  const pending = r.status === "PENDING"
                  const code =
                    resolveCustomerCode(
                      r.customerName,
                      r.customerCode || r.customer?.customerCode
                    ) || "—"
                  return (
                    <tr
                      key={r.id}
                      className={
                        pending
                          ? "bg-amber-50 border-b border-amber-100"
                          : "bg-green-50 border-b border-green-100"
                      }
                    >
                      <td className="p-3 text-center font-bold">{idx + 1}</td>
                      <td className="p-3 text-center whitespace-nowrap">
                        {formatFaDate(r.depositDate)}
                      </td>
                      <td className="p-3 text-center text-sm" dir="ltr">
                        {code}
                      </td>
                      <td className="p-3 font-bold">{r.customerName}</td>
                      <td
                        className="p-3 text-center font-black text-lg whitespace-nowrap"
                        dir="ltr"
                      >
                        {formatRial(r.amount)}
                      </td>
                      <td className="p-3 text-sm">
                        <div className="font-bold">{r.bankAccount?.name}</div>
                        {r.bankAccount?.cardNumber && (
                          <div dir="ltr" className="text-xs mt-0.5">
                            {formatCard(r.bankAccount.cardNumber)}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {r.createdByName || "—"}
                      </td>
                      <td className="p-3 text-center">
                        {r.receiptImageUrl ? (
                          <a
                            href={r.receiptImageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-teal-700 font-bold underline"
                          >
                            مشاهده
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {pending ? (
                          <span className="rounded-full bg-amber-500 text-white px-3 py-1 text-sm font-bold">
                            در انتظار
                          </span>
                        ) : (
                          <span className="rounded-full bg-green-600 text-white px-3 py-1 text-sm font-bold">
                            ✓ تأیید شد
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex flex-wrap gap-1 justify-center">
                          {pending && canConfirm && (
                            <button
                              onClick={() => confirmRow(r.id)}
                              className="rounded-lg bg-green-600 text-white px-2.5 py-1 font-bold text-sm"
                            >
                              تأیید
                            </button>
                          )}
                          <button
                            onClick={() => openEdit(r)}
                            className="rounded-lg bg-blue-600 text-white px-2.5 py-1 font-bold text-sm"
                          >
                            ویرایش
                          </button>
                          <button
                            onClick={() => deleteRow(r.id)}
                            className="rounded-lg bg-red-600 text-white px-2.5 py-1 font-bold text-sm"
                          >
                            حذف
                          </button>
                          {!pending && r.confirmedByName && (
                            <span className="text-xs text-gray-600 w-full">
                              {r.confirmedByName}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-gray-500 text-lg">
                      موردی نیست
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[92vh] overflow-y-auto text-base">
            <h2 className="text-xl font-black mb-4">
              {editingId ? "ویرایش واریزی" : "ثبت واریزی جدید"}
            </h2>

            <div className="space-y-3">
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <label className="text-sm font-bold">مشتری</label>
                <input
                  className="w-full rounded-xl border px-3 py-2.5"
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value)
                    setSelectedCustomer(null)
                    setCustActive(0)
                    setShowCustDrop(true)
                  }}
                  onFocus={() => setShowCustDrop(true)}
                  onKeyDown={(e) => {
                    const listOpen =
                      showCustDrop && !selectedCustomer && customerSearch.trim() !== "" && filteredCustomers.length > 0
                    if (e.key === "ArrowDown" && listOpen) {
                      e.preventDefault()
                      setCustActive((i) => Math.min(i + 1, filteredCustomers.length - 1))
                    } else if (e.key === "ArrowUp" && listOpen) {
                      e.preventDefault()
                      setCustActive((i) => Math.max(i - 1, 0))
                    } else if (e.key === "Enter" && listOpen) {
                      e.preventDefault()
                      pickCustomer(filteredCustomers[Math.min(custActive, filteredCustomers.length - 1)])
                    } else if (e.key === "Escape" && showCustDrop) {
                      setShowCustDrop(false)
                    }
                  }}
                  placeholder="جستجوی نام یا کد مشتری... (کلمه‌ها به هر ترتیبی)"
                  autoComplete="off"
                />
                {showCustDrop && customerSearch.trim() && !selectedCustomer && (
                  <div className="absolute z-10 left-0 right-0 bg-white border rounded-xl mt-1 max-h-72 overflow-auto shadow-lg">
                    {filteredCustomers.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-gray-500">
                        موردی یافت نشد — با همین نام ثبت می‌شود
                      </p>
                    ) : (
                      filteredCustomers.map((c, idx) => (
                        <button
                          key={c.id}
                          type="button"
                          ref={(el) => {
                            if (el && idx === custActive) el.scrollIntoView({ block: "nearest" })
                          }}
                          className={`w-full text-right px-3 py-2.5 hover:bg-teal-50 border-b last:border-0 ${
                            idx === custActive ? "bg-teal-50" : ""
                          }`}
                          onClick={() => pickCustomer(c)}
                        >
                          {c.customerCode ? (
                            <bdi className="text-xs text-teal-700 font-mono ml-2">{c.customerCode}</bdi>
                          ) : null}
                          <span className="font-bold">
                            <bdi>{c.name}</bdi>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
                {selectedCustomer?.customerCode && (
                  <p className="text-sm text-teal-700 mt-1" dir="ltr">
                    کد: {selectedCustomer.customerCode}
                  </p>
                )}
              </div>

              <div>
                <label className="text-sm font-bold">مبلغ (ریال)</label>
                <input
                  className="w-full rounded-xl border px-3 py-2.5 text-lg font-bold"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="numeric"
                  dir="ltr"
                  placeholder="مثال: 200000000"
                />
                {amount && (
                  <p className="text-sm text-gray-600 mt-1" dir="ltr">
                    {formatRial(
                      Number(String(amount).replace(/,/g, "").replace(/٬/g, "")) ||
                        0
                    )}{" "}
                    ریال
                  </p>
                )}
              </div>

              <div>
                <label className="text-sm font-bold">تاریخ واریز</label>
                <DatePicker
                  value={depositDate}
                  onChange={setDepositDate}
                  calendar={persian}
                  locale={persian_fa}
                  inputClass="w-full rounded-xl border px-3 py-2.5"
                />
              </div>

              <div>
                <label className="text-sm font-bold">حساب مقصد</label>
                <select
                  className="w-full rounded-xl border px-3 py-2.5"
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                >
                  <option value="">انتخاب حساب...</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                {selectedAccount && (
                  <div className="mt-2 text-sm bg-slate-50 border rounded-xl p-3 space-y-1">
                    {selectedAccount.cardNumber && (
                      <p>
                        کارت:{" "}
                        <b dir="ltr">{formatCard(selectedAccount.cardNumber)}</b>
                      </p>
                    )}
                    {selectedAccount.accountNumber && (
                      <p>
                        حساب: <b dir="ltr">{selectedAccount.accountNumber}</b>
                      </p>
                    )}
                    {selectedAccount.iban && (
                      <p>
                        شبا: <b dir="ltr">{selectedAccount.iban}</b>
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-bold">فیش واریزی</label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) uploadReceipt(f)
                  }}
                />
                {uploading && <p className="text-sm">در حال آپلود...</p>}
                {receiptUrl && (
                  <a
                    href={receiptUrl}
                    target="_blank"
                    className="text-teal-700 text-sm font-bold block mt-1"
                    rel="noreferrer"
                  >
                    فایل آپلود شد — مشاهده
                  </a>
                )}
              </div>

              <div>
                <label className="text-sm font-bold">توضیحات</label>
                <textarea
                  className="w-full rounded-xl border px-3 py-2.5"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <p className="text-sm text-gray-600">
                ثبت‌کننده: <b>{me?.displayName || "—"}</b>
              </p>
            </div>

            <div className="flex gap-2 justify-end mt-5">
              <button
                className="rounded-xl border px-5 py-2.5 font-bold"
                onClick={() => {
                  setShowForm(false)
                  resetForm()
                }}
              >
                انصراف
              </button>
              <button
                className="rounded-xl bg-teal-600 text-white px-5 py-2.5 font-bold disabled:opacity-50"
                disabled={saving}
                onClick={submit}
              >
                {saving ? "..." : editingId ? "ذخیره تغییرات" : "ثبت واریزی"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
