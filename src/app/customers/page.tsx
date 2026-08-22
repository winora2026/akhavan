"use client"

import { Suspense, useEffect, useState, useMemo, useRef } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import * as XLSX from "xlsx"
import customersSeedRaw from "./customers-seed.json"

type CustomerType = "حقیقی" | "حقوقی"
type CustomerGroup = "نقدی" | "همکار"

type Customer = {
  id: number
  row: number
  code: string
  customerType: CustomerType
  firstName: string
  lastName: string
  companyName: string
  group: CustomerGroup
  economicCode: string
  nationalCode: string
  companyNationalId: string
  phones: string[]
  socialLinks: string[]
  tags: string[]
  address1: string
  address2: string
  postalCode: string
  birthDate: string
  credit: number
  lastPurchaseAmount: number
  notes: string
  photoUrl?: string
  createdAt: string
  updatedAt: string
}

const PREDEFINED_TAGS = ["مشتری ویژه (VIP)", "عمده‌فروش", "بدحساب", "معرف مشتری جدید", "مشتری قدیمی"]

function isValidNationalCode(code: string): boolean {
  if (!/^\d{10}$/.test(code)) return false
  if (/^(\d)\1{9}$/.test(code)) return false
  const check = parseInt(code[9])
  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += parseInt(code[i]) * (10 - i)
  }
  const remainder = sum % 11
  return (remainder < 2 && check === remainder) || (remainder >= 2 && check === 11 - remainder)
}

function isValidEconomicCode(code: string): boolean {
  return /^\d{11}$|^\d{14}$/.test(code)
}

function isValidPostalCode(code: string): boolean {
  return /^\d{10}$/.test(code)
}

function isValidCompanyNationalId(code: string): boolean {
  return /^\d{11}$/.test(code)
}

const JALALI_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
]

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"]

function toPersianDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[parseInt(d)])
}

function isJalaliLeapYear(year: number): boolean {
  const remainders = [1, 5, 9, 13, 17, 22, 26, 30]
  return remainders.includes(((year % 33) + 33) % 33)
}

function daysInJalaliMonth(year: number, month: number): number {
  if (month <= 6) return 31
  if (month <= 11) return 30
  return isJalaliLeapYear(year) ? 30 : 29
}

function parseJalaliDate(value: string): { year: number; month: number; day: number } | null {
  const match = value.trim().match(/^(\d{3,4})[/-](\d{1,2})[/-](\d{1,2})$/)
  if (!match) return null
  return { year: parseInt(match[1]), month: parseInt(match[2]), day: parseInt(match[3]) }
}

function formatJalaliDate(year: number, month: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${year}/${pad(month)}/${pad(day)}`
}

function getDisplayName(c: {
  customerType: CustomerType
  firstName: string
  lastName: string
  companyName: string
}): string {
  if (c.customerType === "حقوقی") {
    return c.companyName.trim() || `${c.lastName} ${c.firstName}`.trim()
  }
  return `${c.lastName} ${c.firstName}`.trim() || c.companyName.trim()
}

const sampleCustomers: Customer[] = customersSeedRaw as Customer[]

const emptyForm: Omit<Customer, "id" | "row" | "createdAt" | "updatedAt"> = {
  code: "",
  customerType: "حقیقی",
  firstName: "",
  lastName: "",
  companyName: "",
  group: "همکار",
  economicCode: "",
  companyNationalId: "",
  nationalCode: "",
  phones: [""],
  socialLinks: [""],
  tags: [],
  address1: "",
  address2: "",
  postalCode: "",
  birthDate: "",
  credit: 0,
  lastPurchaseAmount: 0,
  notes: "",
  photoUrl: "",
}

type ColumnFilters = {
  code: string
  name: string
  nationalCode: string
  phone: string
  address: string
  tags: string
}

const emptyColumnFilters: ColumnFilters = {
  code: "",
  name: "",
  nationalCode: "",
  phone: "",
  address: "",
  tags: "",
}

// ==================== کامپوننت اصلی محتوا ====================
function CustomersContent() {
  const searchParams = useSearchParams()

  const [data, setData] = useState<Customer[]>(sampleCustomers)
  const [search, setSearch] = useState("")
  const [groupFilter, setGroupFilter] = useState<"all" | CustomerGroup>("all")
  const [colFilters, setColFilters] = useState<ColumnFilters>(emptyColumnFilters)

  const [showFormModal, setShowFormModal] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [tagInput, setTagInput] = useState("")
  const [showBirthdayCalendar, setShowBirthdayCalendar] = useState(false)
  const [calendarYear, setCalendarYear] = useState(1370)
  const [calendarMonth, setCalendarMonth] = useState(1)
  const excelInputRef = useRef<HTMLInputElement>(null)
  const [excelImporting, setExcelImporting] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [photoPreview, setPhotoPreview] = useState("")

  const [nationalCodeError, setNationalCodeError] = useState("")
  const [postalCodeError, setPostalCodeError] = useState("")
  const [economicCodeError, setEconomicCodeError] = useState("")
  const [companyNationalIdError, setCompanyNationalIdError] = useState("")

  const [showCreditModal, setShowCreditModal] = useState(false)
  const [creditTarget, setCreditTarget] = useState<Customer | null>(null)
  const [creditAmount, setCreditAmount] = useState("")

  const [showBirthdayModal, setShowBirthdayModal] = useState(false)
  const [birthdayTarget, setBirthdayTarget] = useState<Customer | null>(null)

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      openAddModal()
    }
  }, [searchParams])

  const filtered = useMemo(() => {
    return data.filter((item) => {
      const displayName = getDisplayName(item)
      const q = search.trim().toLowerCase()
      const matchSearch =
        !q ||
        displayName.toLowerCase().includes(q) ||
        item.code.includes(q) ||
        item.nationalCode.includes(q) ||
        item.companyNationalId.includes(q) ||
        item.phones.some((p) => p.includes(q)) ||
        item.socialLinks.some((s) => s.toLowerCase().includes(q)) ||
        item.tags.some((t) => t.toLowerCase().includes(q))

      const matchGroup = groupFilter === "all" || item.group === groupFilter

      const matchCol =
        item.code.includes(colFilters.code.trim()) &&
        displayName.toLowerCase().includes(colFilters.name.trim().toLowerCase()) &&
        (item.nationalCode + item.companyNationalId).includes(colFilters.nationalCode.trim()) &&
        item.phones.join(" ").includes(colFilters.phone.trim()) &&
        item.address1.toLowerCase().includes(colFilters.address.trim().toLowerCase()) &&
        item.tags.join(" ").toLowerCase().includes(colFilters.tags.trim().toLowerCase())

      return matchSearch && matchGroup && matchCol
    })
  }, [data, search, groupFilter, colFilters])

  const formatPrice = (n: number) => n.toLocaleString("en-US")

  const handleNationalCodeChange = (value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 10)
    setForm({ ...form, nationalCode: cleaned })
    if (cleaned.length === 0) setNationalCodeError("")
    else if (cleaned.length < 10) setNationalCodeError("کد ملی باید ۱۰ رقم باشد")
    else if (!isValidNationalCode(cleaned)) setNationalCodeError("کد ملی نامعتبر است")
    else setNationalCodeError("")
  }

  const handlePostalCodeChange = (value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 10)
    setForm({ ...form, postalCode: cleaned })
    if (cleaned.length === 0) setPostalCodeError("")
    else if (cleaned.length < 10) setPostalCodeError("کد پستی باید ۱۰ رقم باشد")
    else if (!isValidPostalCode(cleaned)) setPostalCodeError("کد پستی نامعتبر است")
    else setPostalCodeError("")
  }

  const handleEconomicCodeChange = (value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 14)
    setForm({ ...form, economicCode: cleaned })
    if (cleaned.length === 0) setEconomicCodeError("")
    else if (!isValidEconomicCode(cleaned)) setEconomicCodeError("کد اقتصادی باید ۱۱ یا ۱۴ رقم باشد")
    else setEconomicCodeError("")
  }

  const handleCompanyNationalIdChange = (value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 11)
    setForm({ ...form, companyNationalId: cleaned })
    if (cleaned.length === 0) setCompanyNationalIdError("")
    else if (!isValidCompanyNationalId(cleaned)) setCompanyNationalIdError("شناسه ملی باید ۱۱ رقم باشد")
    else setCompanyNationalIdError("")
  }

  const openBirthdayCalendar = () => {
    const parsed = parseJalaliDate(form.birthDate)
    setCalendarYear(parsed?.year || 1370)
    setCalendarMonth(parsed?.month || 1)
    setShowBirthdayCalendar(true)
  }

  const selectBirthdayDay = (day: number) => {
    setForm({ ...form, birthDate: formatJalaliDate(calendarYear, calendarMonth, day) })
    setShowBirthdayCalendar(false)
  }

  const goToPrevMonth = () => {
    if (calendarMonth === 1) {
      setCalendarMonth(12)
      setCalendarYear((y) => y - 1)
    } else {
      setCalendarMonth((m) => m - 1)
    }
  }

  const goToNextMonth = () => {
    if (calendarMonth === 12) {
      setCalendarMonth(1)
      setCalendarYear((y) => y + 1)
    } else {
      setCalendarMonth((m) => m + 1)
    }
  }

  const handleExcelImport = async (file: File) => {
    setExcelImporting(true)
    try {
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      const isLegacyUtf16Export = bytes[0] === 0xff && bytes[1] === 0xfe

      let rows: Record<string, any>[] = []

      if (isLegacyUtf16Export) {
        const text = new TextDecoder("utf-16le").decode(buffer.slice(2))
        const lines = text.split(/\r\n|\n/)
        for (const line of lines) {
          const cols = line.split("\t").map((c) => c.trim())
          const name = cols[0] || ""
          const code = cols[1] || ""
          if (/[آ-ی]/.test(name) && code) {
            rows.push({ "نام کامل": name.replace(/\*$/, "").trim(), "کد مشتری": code, "کد ملی": cols[2] || "" })
          }
        }
      } else {
        const workbook = XLSX.read(buffer, { type: "array" })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        rows = XLSX.utils.sheet_to_json(sheet, { defval: "" })
      }

      const pick = (row: Record<string, any>, keys: string[]) => {
        for (const k of keys) {
          const found = Object.keys(row).find((rk) => rk.trim() === k)
          if (found && String(row[found]).trim()) return String(row[found]).trim()
        }
        return ""
      }

      const COMPANY_HINTS = [
        "شرکت", "گروه", "مجتمع", "بازرگانی", "بازرگاني", "صنعتی", "صنعتي", "فروشگاه",
        "تولیدی", "توليدي", "کارخانه", "کارخانجات", "موسسه", "مؤسسه", "پخش",
        "تعاونی", "تعاوني", "استیل", "استيل", "صنایع", "صنايع",
      ]

      const now = "1405/05/22"
      const imported: Customer[] = rows
        .map((row, idx) => {
          let companyName = pick(row, ["نام شرکت", "شرکت"])
          let firstName = pick(row, ["نام"])
          let lastName = pick(row, ["نام خانوادگی", "نام‌خانوادگی"])
          const code = pick(row, ["کد مشتری", "کد"])
          const fullName = pick(row, ["نام کامل", "نام و نام خانوادگی"])

          if (fullName && !companyName && !firstName && !lastName) {
            const isCompany = COMPANY_HINTS.some((h) => fullName.includes(h))
            const tokens = fullName.split(/\s+/)
            if (isCompany || tokens.length === 1) {
              if (isCompany) companyName = fullName
              else lastName = fullName
            } else {
              lastName = tokens[0]
              firstName = tokens.slice(1).join(" ")
            }
          }

          if (!code && !companyName && !firstName && !lastName) return null

          const phonesRaw = pick(row, ["تلفن", "شماره تماس", "موبایل"])
          const customerType: CustomerType = companyName ? "حقوقی" : "حقیقی"

          const customer: Customer = {
            id: Date.now() + idx,
            row: data.length + idx + 1,
            code: code || `imp-${Date.now()}-${idx}`,
            customerType,
            firstName,
            lastName,
            companyName,
            group: (pick(row, ["گروه", "گروه مشتری"]) as CustomerGroup) || "همکار",
            economicCode: pick(row, ["کد اقتصادی"]),
            nationalCode: customerType === "حقیقی" ? pick(row, ["کد ملی"]) : "",
            companyNationalId: customerType === "حقوقی" ? pick(row, ["شناسه ملی", "کد ملی"]) : "",
            phones: phonesRaw ? phonesRaw.split(/[,،/]/).map((p) => p.trim()).filter(Boolean) : [],
            socialLinks: [],
            tags: [],
            address1: pick(row, ["آدرس", "آدرس اصلی"]),
            address2: pick(row, ["آدرس دوم"]),
            postalCode: pick(row, ["کد پستی"]),
            birthDate: pick(row, ["تاریخ تولد"]),
            credit: Number(pick(row, ["اعتبار"])) || 0,
            lastPurchaseAmount: 0,
            notes: pick(row, ["یادداشت"]),
            createdAt: now,
            updatedAt: now,
          }
          return customer
        })
        .filter((c): c is Customer => c !== null)

      if (imported.length === 0) {
        alert("هیچ ردیف قابل تشخیصی در فایل پیدا نشد. لطفاً ستون‌های فایل را با نمونه چک کنید.")
      } else {
        setData((prev) => [...prev, ...imported])
        alert(`${toPersianDigits(imported.length)} مشتری با موفقیت اضافه شد`)
      }
    } catch (err) {
      alert("خطا در خواندن فایل اکسل. لطفاً از فرمت .xlsx یا .xls استفاده کنید.")
    } finally {
      setExcelImporting(false)
      if (excelInputRef.current) excelInputRef.current.value = ""
    }
  }

  const openAddModal = () => {
    setEditingId(null)
    setForm({ ...emptyForm, phones: [""], socialLinks: [""], tags: [], photoUrl: "" })
    setTagInput("")
    setPhotoPreview("")
    setNationalCodeError("")
    setPostalCodeError("")
    setEconomicCodeError("")
    setCompanyNationalIdError("")
    setShowFormModal(true)
  }

  const openEditModal = (customer: Customer) => {
    setEditingId(customer.id)
    setForm({
      code: customer.code,
      customerType: customer.customerType,
      firstName: customer.firstName,
      lastName: customer.lastName,
      companyName: customer.companyName,
      group: customer.group,
      economicCode: customer.economicCode,
      companyNationalId: customer.companyNationalId,
      nationalCode: customer.nationalCode,
      phones: customer.phones.length ? [...customer.phones] : [""],
      socialLinks: customer.socialLinks.length ? [...customer.socialLinks] : [""],
      tags: [...customer.tags],
      address1: customer.address1,
      address2: customer.address2,
      postalCode: customer.postalCode,
      birthDate: customer.birthDate,
      credit: customer.credit,
      lastPurchaseAmount: customer.lastPurchaseAmount,
      notes: customer.notes,
      photoUrl: customer.photoUrl || "",
    })
    setTagInput("")
    setPhotoPreview(customer.photoUrl || "")
    setNationalCodeError("")
    setPostalCodeError("")
    setEconomicCodeError("")
    setCompanyNationalIdError("")
    setShowFormModal(true)
  }

  const addPhoneField = () => setForm((prev) => ({ ...prev, phones: [...prev.phones, ""] }))
  const updatePhone = (index: number, value: string) => {
    setForm((prev) => {
      const phones = [...prev.phones]
      phones[index] = value
      return { ...prev, phones }
    })
  }
  const removePhone = (index: number) => {
    setForm((prev) => {
      const phones = prev.phones.filter((_, i) => i !== index)
      return { ...prev, phones: phones.length ? phones : [""] }
    })
  }

  const addSocialField = () => setForm((prev) => ({ ...prev, socialLinks: [...prev.socialLinks, ""] }))
  const updateSocial = (index: number, value: string) => {
    setForm((prev) => {
      const socialLinks = [...prev.socialLinks]
      socialLinks[index] = value
      return { ...prev, socialLinks }
    })
  }
  const removeSocial = (index: number) => {
    setForm((prev) => {
      const socialLinks = prev.socialLinks.filter((_, i) => i !== index)
      return { ...prev, socialLinks: socialLinks.length ? socialLinks : [""] }
    })
  }

  const toggleTag = (tag: string) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter((t) => t !== tag) : [...prev.tags, tag],
    }))
  }
  const addCustomTag = () => {
    const value = tagInput.trim()
    if (!value) return
    setForm((prev) => (prev.tags.includes(value) ? prev : { ...prev, tags: [...prev.tags, value] }))
    setTagInput("")
  }
  const removeTag = (tag: string) => setForm((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }))

  const saveCustomer = () => {
    if (!form.code.trim()) {
      alert("کد مشتری الزامی است")
      return
    }
    if (form.customerType === "حقوقی" && !form.companyName.trim()) {
      alert("نام شرکت برای مشتری حقوقی الزامی است")
      return
    }
    if (form.customerType === "حقیقی" && (!form.firstName.trim() || !form.lastName.trim())) {
      alert("نام و نام خانوادگی الزامی است")
      return
    }
    if (form.nationalCode && !isValidNationalCode(form.nationalCode)) {
      alert("کد ملی نامعتبر است")
      return
    }
    if (form.postalCode && !isValidPostalCode(form.postalCode)) {
      alert("کد پستی نامعتبر است")
      return
    }
    if (form.economicCode && !isValidEconomicCode(form.economicCode)) {
      alert("کد اقتصادی نامعتبر است")
      return
    }
    if (form.customerType === "حقوقی" && form.companyNationalId && !isValidCompanyNationalId(form.companyNationalId)) {
      alert("شناسه ملی نامعتبر است")
      return
    }

    const now = "1405/05/22"

    if (editingId) {
      setData((prev) =>
        prev.map((c) =>
          c.id === editingId
            ? {
                ...c,
                ...form,
                phones: form.phones.filter((p) => p.trim()),
                socialLinks: form.socialLinks.filter((s) => s.trim()),
                updatedAt: now,
              }
            : c
        )
      )
    } else {
      const newCustomer: Customer = {
        id: Date.now(),
        row: data.length + 1,
        ...form,
        phones: form.phones.filter((p) => p.trim()),
        socialLinks: form.socialLinks.filter((s) => s.trim()),
        createdAt: now,
        updatedAt: now,
      }
      setData((prev) => [...prev, newCustomer])
    }

    setShowFormModal(false)
  }

  const deleteCustomer = (id: number) => {
    if (confirm("آیا از حذف این مشتری مطمئن هستید؟")) {
      setData((prev) => prev.filter((c) => c.id !== id))
    }
  }

  const openCreditModal = (customer: Customer) => {
    setCreditTarget(customer)
    setCreditAmount("")
    setShowCreditModal(true)
  }

  const applyCredit = () => {
    if (!creditTarget) return
    const amount = parseInt(creditAmount.replace(/,/g, "")) || 0
    if (amount <= 0) {
      alert("مبلغ معتبر وارد کنید")
      return
    }
    setData((prev) =>
      prev.map((c) =>
        c.id === creditTarget.id
          ? { ...c, credit: c.credit + amount, updatedAt: "1405/05/22" }
          : c
      )
    )
    setShowCreditModal(false)
  }

  const openBirthdayModal = (customer: Customer) => {
    setBirthdayTarget(customer)
    setShowBirthdayModal(true)
  }

  const applyBirthdayDiscount = () => {
    alert(`تخفیف تولد برای ${getDisplayName(birthdayTarget!)} اعمال شد`)
    setShowBirthdayModal(false)
  }

  return (
    <div
      className="min-h-screen p-4 bg-cover bg-center bg-fixed"
      style={{
        backgroundImage: "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')",
        fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif",
      }}
      dir="rtl"
    >
      <link href="https://cdn.jsdelivr.net/npm/vazirmatn@33.003/Vazirmatn-font-face.css" rel="stylesheet" />
      <div className="pointer-events-none fixed inset-0 bg-black/5" />

      <div className="relative z-10 max-w-[1920px] mx-auto">
        {/* هدر */}
        <div className="mb-4 flex items-center justify-between rounded-2xl bg-teal-500/10 backdrop-blur-2xl px-5 py-4 shadow-lg border border-teal-500/20">
          <div className="w-48" />
          <div className="text-center flex-1">
            <h1 className="text-3xl font-bold text-blue-950">مدیریت مشتریان</h1>
            <p className="text-lg font-bold text-blue-900 mt-1">نرم‌افزار اخوان | شیشه و آینه</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/order/new"
              className="rounded-xl bg-teal-500 hover:bg-teal-600 px-5 py-2.5 text-base font-bold text-white shadow transition"
            >
              + ثبت سفارش جدید
            </Link>
            <Link
              href="/order"
              className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-5 py-2.5 text-base font-bold text-blue-900 transition"
            >
              پیش‌فاکتورها
            </Link>
          </div>
        </div>

        {/* فیلتر */}
        <div className="mb-4 rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-4 shadow-lg border border-teal-500/20">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-4">
              <label className="mb-1 block text-sm font-bold text-blue-900">جستجوی کلی</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="نام، شرکت، کد مشتری، کد ملی، تگ، سایت..."
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-3 py-2.5 text-base font-medium text-blue-950 focus:border-teal-500 focus:outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-bold text-blue-900">گروه مشتری</label>
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value as any)}
                className="w-full rounded-xl border border-teal-500/30 bg-white/50 px-3 py-2.5 text-base font-medium text-blue-950 focus:border-teal-500 focus:outline-none"
              >
                <option value="all">همه گروه‌ها</option>
                <option value="نقدی">نقدی</option>
                <option value="همکار">همکار</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <div className="rounded-xl bg-teal-500/20 border border-teal-500/30 px-3 py-2.5 text-center">
                <span className="text-sm text-blue-700">تعداد: </span>
                <span className="text-xl font-bold text-teal-700">{filtered.length}</span>
              </div>
            </div>
            <div className="md:col-span-2">
              <input
                ref={excelInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleExcelImport(file)
                }}
              />
              <button
                onClick={() => excelInputRef.current?.click()}
                disabled={excelImporting}
                className="w-full rounded-xl border border-teal-500/40 bg-white/50 hover:bg-white/80 px-3 py-2.5 text-base font-bold text-blue-900 shadow transition disabled:opacity-50"
              >
                {excelImporting ? "در حال ورود..." : "ورود از اکسل"}
              </button>
            </div>
            <div className="md:col-span-2">
              <button
                onClick={openAddModal}
                className="w-full rounded-xl bg-teal-500 hover:bg-teal-600 px-3 py-2.5 text-base font-bold text-white shadow transition"
              >
                + مشتری جدید
              </button>
            </div>
          </div>
        </div>

        {/* جدول مشتریان */}
        <div className="rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-3 shadow-lg border border-teal-500/20 overflow-x-auto">
          <table className="w-full text-sm text-blue-900">
            <thead>
              <tr className="border-b border-teal-500/30 bg-teal-500/15 text-right">
                <th className="p-3 font-bold whitespace-nowrap">ردیف</th>
                <th className="p-3 font-bold whitespace-nowrap">کد</th>
                <th className="p-3 font-bold whitespace-nowrap">نام / شرکت</th>
                <th className="p-3 font-bold whitespace-nowrap">گروه</th>
                <th className="p-3 font-bold whitespace-nowrap">کد ملی / شناسه</th>
                <th className="p-3 font-bold whitespace-nowrap">تلفن</th>
                <th className="p-3 font-bold whitespace-nowrap">آدرس</th>
                <th className="p-3 font-bold whitespace-nowrap">تگ‌ها</th>
                <th className="p-3 font-bold whitespace-nowrap">اعتبار</th>
                <th className="p-3 font-bold whitespace-nowrap">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((customer, index) => (
                <tr key={customer.id} className="border-b border-teal-100 hover:bg-yellow-50/50 bg-white/40">
                  <td className="p-3 text-center font-bold">{index + 1}</td>
                  <td className="p-3 font-mono text-xs">{customer.code}</td>
                  <td className="p-3 font-bold">{getDisplayName(customer)}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-lg text-xs font-bold ${customer.group === "همکار" ? "bg-teal-100 text-teal-800" : "bg-amber-100 text-amber-800"}`}>
                      {customer.group}
                    </span>
                  </td>
                  <td className="p-3 text-xs">
                    {customer.customerType === "حقیقی" ? customer.nationalCode || "—" : customer.companyNationalId || "—"}
                  </td>
                  <td className="p-3 text-xs">{customer.phones[0] || "—"}</td>
                  <td className="p-3 text-xs max-w-[180px] truncate" title={customer.address1}>{customer.address1 || "—"}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {customer.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded font-bold">{tag}</span>
                      ))}
                      {customer.tags.length > 2 && <span className="text-xs text-gray-500">+{customer.tags.length - 2}</span>}
                    </div>
                  </td>
                  <td className="p-3 font-bold text-teal-700 text-xs">{formatPrice(customer.credit)}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEditModal(customer)}
                        className="rounded-lg bg-teal-500/20 hover:bg-teal-500/40 px-2 py-1 text-xs font-bold text-teal-800"
                      >
                        ویرایش
                      </button>
                      <button
                        onClick={() => openCreditModal(customer)}
                        className="rounded-lg bg-amber-500/20 hover:bg-amber-500/40 px-2 py-1 text-xs font-bold text-amber-800"
                      >
                        اعتبار
                      </button>
                      <button
                        onClick={() => deleteCustomer(customer.id)}
                        className="rounded-lg bg-red-500/15 hover:bg-red-500/30 px-2 py-1 text-xs font-bold text-red-700"
                      >
                        حذف
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="text-center py-12 text-blue-700 font-bold">
              هیچ مشتری‌ای پیدا نشد
            </div>
          )}
        </div>
      </div>

      {/* مودال فرم مشتری */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl my-8">
            <div className="sticky top-0 bg-teal-600 text-white px-5 py-4 rounded-t-2xl flex justify-between items-center">
              <h3 className="text-xl font-bold">{editingId ? "ویرایش مشتری" : "مشتری جدید"}</h3>
              <button onClick={() => setShowFormModal(false)} className="text-2xl leading-none">×</button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* نوع مشتری */}
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={form.customerType === "حقیقی"}
                    onChange={() => setForm({ ...form, customerType: "حقیقی" })}
                    className="accent-teal-600"
                  />
                  <span className="font-bold text-blue-900">حقیقی</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={form.customerType === "حقوقی"}
                    onChange={() => setForm({ ...form, customerType: "حقوقی" })}
                    className="accent-teal-600"
                  />
                  <span className="font-bold text-blue-900">حقوقی</span>
                </label>
              </div>

              {/* عکس */}
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl border border-teal-500/40 bg-teal-50 overflow-hidden flex items-center justify-center">
                  {photoPreview || form.photoUrl ? (
                    <img src={photoPreview || form.photoUrl} alt="عکس مشتری" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs text-blue-400">بدون عکس</span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const url = URL.createObjectURL(file)
                      setPhotoPreview(url)
                      setForm((prev) => ({ ...prev, photoUrl: url }))
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="rounded-xl bg-teal-500 hover:bg-teal-600 px-4 py-2 text-sm font-bold text-white transition"
                  >
                    انتخاب عکس
                  </button>
                  {(photoPreview || form.photoUrl) && (
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoPreview("")
                        setForm((prev) => ({ ...prev, photoUrl: "" }))
                        if (photoInputRef.current) photoInputRef.current.value = ""
                      }}
                      className="rounded-xl border border-red-300 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50 transition"
                    >
                      حذف عکس
                    </button>
                  )}
                </div>
              </div>

              {/* کد و نام */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-bold text-blue-900">کد مشتری *</label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    className="w-full rounded-xl border border-teal-500/40 px-3 py-2.5 text-base font-medium focus:border-teal-500 focus:outline-none"
                    placeholder="مثال: 12070"
                  />
                </div>

                {form.customerType === "حقیقی" ? (
                  <>
                    <div>
                      <label className="mb-1 block text-sm font-bold text-blue-900">نام *</label>
                      <input
                        type="text"
                        value={form.firstName}
                        onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                        className="w-full rounded-xl border border-teal-500/40 px-3 py-2.5 text-base font-medium focus:border-teal-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-bold text-blue-900">نام خانوادگی *</label>
                      <input
                        type="text"
                        value={form.lastName}
                        onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                        className="w-full rounded-xl border border-teal-500/40 px-3 py-2.5 text-base font-medium focus:border-teal-500 focus:outline-none"
                      />
                    </div>
                  </>
                ) : (
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-sm font-bold text-blue-900">نام شرکت *</label>
                    <input
                      type="text"
                      value={form.companyName}
                      onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                      className="w-full rounded-xl border border-teal-500/40 px-3 py-2.5 text-base font-medium focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* گروه و کد ملی */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-bold text-blue-900">گروه مشتری</label>
                  <select
                    value={form.group}
                    onChange={(e) => setForm({ ...form, group: e.target.value as CustomerGroup })}
                    className="w-full rounded-xl border border-teal-500/40 px-3 py-2.5 text-base font-medium focus:border-teal-500 focus:outline-none"
                  >
                    <option value="همکار">همکار</option>
                    <option value="نقدی">نقدی</option>
                  </select>
                </div>
                {form.customerType === "حقیقی" ? (
                  <div>
                    <label className="mb-1 block text-sm font-bold text-blue-900">کد ملی</label>
                    <input
                      type="text"
                      value={form.nationalCode}
                      onChange={(e) => handleNationalCodeChange(e.target.value)}
                      className={`w-full rounded-xl border px-3 py-2.5 text-base font-medium focus:outline-none ${
                        nationalCodeError ? "border-red-400" : "border-teal-500/40"
                      }`}
                      maxLength={10}
                    />
                    {nationalCodeError && <p className="mt-1 text-xs text-red-600">{nationalCodeError}</p>}
                  </div>
                ) : (
                  <div>
                    <label className="mb-1 block text-sm font-bold text-blue-900">شناسه ملی</label>
                    <input
                      type="text"
                      value={form.companyNationalId}
                      onChange={(e) => handleCompanyNationalIdChange(e.target.value)}
                      className={`w-full rounded-xl border px-3 py-2.5 text-base font-medium focus:outline-none ${
                        companyNationalIdError ? "border-red-400" : "border-teal-500/40"
                      }`}
                      maxLength={11}
                    />
                    {companyNationalIdError && <p className="mt-1 text-xs text-red-600">{companyNationalIdError}</p>}
                  </div>
                )}
              </div>

              {/* کد اقتصادی */}
              <div>
                <label className="mb-1 block text-sm font-bold text-blue-900">کد اقتصادی</label>
                <input
                  type="text"
                  value={form.economicCode}
                  onChange={(e) => handleEconomicCodeChange(e.target.value)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-base font-medium focus:outline-none ${
                    economicCodeError ? "border-red-400" : "border-teal-500/40"
                  }`}
                />
                {economicCodeError && <p className="mt-1 text-xs text-red-600">{economicCodeError}</p>}
              </div>

              {/* تلفن‌ها */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-bold text-blue-900">شماره تماس‌ها</label>
                  <button type="button" onClick={addPhoneField} className="text-sm font-bold text-teal-600">
                    + افزودن شماره
                  </button>
                </div>
                <div className="space-y-2">
                  {form.phones.map((phone, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="text"
                        value={phone}
                        onChange={(e) => updatePhone(idx, e.target.value)}
                        className="flex-1 rounded-xl border border-teal-500/40 px-3 py-2.5 text-base font-medium focus:border-teal-500 focus:outline-none"
                        placeholder="۰۹۱۲..."
                      />
                      {form.phones.length > 1 && (
                        <button type="button" onClick={() => removePhone(idx)} className="rounded-xl bg-red-50 text-red-600 px-3 text-sm font-bold">
                          حذف
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* شبکه‌های اجتماعی */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-bold text-blue-900">وبسایت / شبکه‌های اجتماعی</label>
                  <button type="button" onClick={addSocialField} className="text-sm font-bold text-teal-600">
                    + افزودن لینک
                  </button>
                </div>
                <div className="space-y-2">
                  {form.socialLinks.map((link, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="text"
                        value={link}
                        onChange={(e) => updateSocial(idx, e.target.value)}
                        className="flex-1 rounded-xl border border-teal-500/40 px-3 py-2.5 text-base font-medium focus:border-teal-500 focus:outline-none"
                        placeholder="instagram.com/..."
                      />
                      {form.socialLinks.length > 1 && (
                        <button type="button" onClick={() => removeSocial(idx)} className="rounded-xl bg-red-50 text-red-600 px-3 text-sm font-bold">
                          حذف
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* آدرس‌ها */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-bold text-blue-900">آدرس اصلی</label>
                  <textarea
                    value={form.address1}
                    onChange={(e) => setForm({ ...form, address1: e.target.value })}
                    rows={2}
                    className="w-full rounded-xl border border-teal-500/40 px-3 py-2.5 text-base font-medium focus:border-teal-500 focus:outline-none resize-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-bold text-blue-900">آدرس دوم</label>
                  <textarea
                    value={form.address2}
                    onChange={(e) => setForm({ ...form, address2: e.target.value })}
                    rows={2}
                    className="w-full rounded-xl border border-teal-500/40 px-3 py-2.5 text-base font-medium focus:border-teal-500 focus:outline-none resize-none"
                  />
                </div>
              </div>

              {/* کد پستی و تاریخ تولد */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-bold text-blue-900">کد پستی</label>
                  <input
                    type="text"
                    value={form.postalCode}
                    onChange={(e) => handlePostalCodeChange(e.target.value)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-base font-medium focus:outline-none ${
                      postalCodeError ? "border-red-400" : "border-teal-500/40"
                    }`}
                    maxLength={10}
                  />
                  {postalCodeError && <p className="mt-1 text-xs text-red-600">{postalCodeError}</p>}
                </div>
                <div className="relative">
                  <label className="mb-1 block text-sm font-bold text-blue-900">تاریخ تولد</label>
                  <button
                    type="button"
                    onClick={openBirthdayCalendar}
                    className="w-full rounded-xl border border-teal-500/40 px-3 py-2.5 text-base font-medium text-right bg-white hover:bg-teal-50/50 transition"
                  >
                    {form.birthDate ? toPersianDigits(form.birthDate) : <span className="text-gray-400">انتخاب تاریخ تولد</span>}
                  </button>

                  {showBirthdayCalendar && (
                    <div className="absolute z-20 mt-1 w-72 rounded-xl border border-teal-500/30 bg-white shadow-2xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <button type="button" onClick={goToNextMonth} className="rounded-lg px-2 py-1 text-sm font-bold text-teal-700 hover:bg-teal-50">›</button>
                        <div className="flex items-center gap-1 text-sm font-bold text-blue-950">
                          <span>{JALALI_MONTHS[calendarMonth - 1]}</span>
                          <input
                            type="number"
                            value={calendarYear}
                            onChange={(e) => setCalendarYear(Number(e.target.value) || calendarYear)}
                            className="w-16 rounded-lg border border-teal-500/30 px-1 py-0.5 text-center text-sm"
                          />
                        </div>
                        <button type="button" onClick={goToPrevMonth} className="rounded-lg px-2 py-1 text-sm font-bold text-teal-700 hover:bg-teal-50">‹</button>
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {Array.from({ length: daysInJalaliMonth(calendarYear, calendarMonth) }, (_, i) => i + 1).map((day) => {
                          const parsed = parseJalaliDate(form.birthDate)
                          const isSelected = parsed && parsed.year === calendarYear && parsed.month === calendarMonth && parsed.day === day
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => selectBirthdayDay(day)}
                              className={`rounded-lg py-1.5 text-xs font-bold transition ${
                                isSelected ? "bg-teal-500 text-white" : "text-blue-900 hover:bg-teal-100"
                              }`}
                            >
                              {toPersianDigits(day)}
                            </button>
                          )
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowBirthdayCalendar(false)}
                        className="mt-2 w-full rounded-lg border border-gray-200 py-1.5 text-xs font-bold text-blue-900 hover:bg-gray-50"
                      >
                        بستن
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* تگ‌ها */}
              <div>
                <label className="mb-1 block text-sm font-bold text-blue-900">خصوصیات مشتری</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {PREDEFINED_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-bold border transition ${
                        form.tags.includes(tag)
                          ? "bg-amber-500 text-white border-amber-500"
                          : "bg-white text-blue-900 border-teal-500/30 hover:bg-amber-50"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        addCustomTag()
                      }
                    }}
                    className="flex-1 rounded-xl border border-teal-500/40 px-3 py-2.5 text-base font-medium focus:border-teal-500 focus:outline-none"
                    placeholder="خصوصیت دلخواه + Enter"
                  />
                  <button type="button" onClick={addCustomTag} className="rounded-xl bg-teal-500 hover:bg-teal-600 px-4 text-sm font-bold text-white">
                    افزودن
                  </button>
                </div>
                {form.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {form.tags.map((tag) => (
                      <span key={tag} className="flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-1 text-sm font-bold text-amber-800">
                        {tag}
                        <button type="button" onClick={() => removeTag(tag)} className="text-amber-700 hover:text-amber-900">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* اعتبار و یادداشت */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-bold text-blue-900">اعتبار اولیه (ریال)</label>
                  <input
                    type="number"
                    value={form.credit}
                    onChange={(e) => setForm({ ...form, credit: Number(e.target.value) || 0 })}
                    className="w-full rounded-xl border border-teal-500/40 px-3 py-2.5 text-base font-medium focus:border-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-bold text-blue-900">یادداشت</label>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="w-full rounded-xl border border-teal-500/40 px-3 py-2.5 text-base font-medium focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-gray-50 px-5 py-3 rounded-b-2xl flex justify-end gap-2 border-t">
              <button
                onClick={() => setShowFormModal(false)}
                className="rounded-xl border border-gray-300 px-5 py-2.5 text-base font-bold text-blue-900 hover:bg-gray-100 transition"
              >
                انصراف
              </button>
              <button
                onClick={saveCustomer}
                className="rounded-xl bg-teal-500 hover:bg-teal-600 px-5 py-2.5 text-base font-bold text-white shadow transition"
              >
                ذخیره مشتری
              </button>
            </div>
          </div>
        </div>
      )}

      {/* مودال افزایش اعتبار */}
      {showCreditModal && creditTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-5">
            <h3 className="text-xl font-bold text-blue-950 mb-2">افزایش اعتبار</h3>
            <p className="text-base text-blue-800 mb-1">
              مشتری: <strong>{getDisplayName(creditTarget)}</strong>
            </p>
            <p className="text-sm text-gray-600 mb-4">
              اعتبار فعلی: <strong className="text-teal-700">{formatPrice(creditTarget.credit)} ریال</strong>
            </p>
            <label className="mb-1 block text-sm font-bold text-blue-900">مبلغ افزایش (ریال)</label>
            <input
              type="text"
              value={creditAmount}
              onChange={(e) =>
                setCreditAmount(
                  e.target.value.replace(/[^\d]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",")
                )
              }
              className="w-full rounded-xl border border-teal-500/40 px-3 py-2.5 text-lg font-bold focus:border-teal-500 focus:outline-none mb-5"
              placeholder="مثلاً ۵,۰۰۰,۰۰۰"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowCreditModal(false)}
                className="rounded-xl border border-gray-300 px-4 py-2.5 text-base font-bold text-blue-900 hover:bg-gray-100"
              >
                انصراف
              </button>
              <button
                onClick={applyCredit}
                className="rounded-xl bg-teal-500 hover:bg-teal-600 px-4 py-2.5 text-base font-bold text-white"
              >
                اعمال اعتبار
              </button>
            </div>
          </div>
        </div>
      )}

      {/* مودال تخفیف تولد */}
      {showBirthdayModal && birthdayTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-5">
            <h3 className="text-xl font-bold text-blue-950 mb-2">تخفیف تولد</h3>
            <p className="text-base text-blue-800 mb-1">
              مشتری: <strong>{getDisplayName(birthdayTarget)}</strong>
            </p>
            <p className="text-sm text-gray-600 mb-4">
              تاریخ تولد: <strong>{birthdayTarget.birthDate}</strong>
            </p>
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 mb-5 text-sm text-amber-900">
              این قابلیت در صفحه ثبت سفارش فعال می‌شود.
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowBirthdayModal(false)}
                className="rounded-xl border border-gray-300 px-4 py-2.5 text-base font-bold text-blue-900 hover:bg-gray-100"
              >
                بستن
              </button>
              <button
                onClick={applyBirthdayDiscount}
                className="rounded-xl bg-amber-500 hover:bg-amber-600 px-4 py-2.5 text-base font-bold text-white"
              >
                متوجه شدم
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== صفحه اصلی با Suspense ====================
export default function CustomersPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="text-xl font-bold text-blue-900 mb-2">در حال بارگذاری...</div>
            <div className="text-sm text-gray-500">لطفاً صبر کنید</div>
          </div>
        </div>
      }
    >
      <CustomersContent />
    </Suspense>
  )
}