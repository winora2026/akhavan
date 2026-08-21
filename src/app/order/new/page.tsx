"use client"

import { useRouter } from "next/navigation"
import { useState, useMemo, useRef, useEffect, Fragment } from "react"
import DatePicker from "react-multi-date-picker"
import persian from "react-date-object/calendars/persian"
import persian_fa from "react-date-object/locales/persian_fa"
import customersSeedRaw from "../../customers/customers-seed.json"

type ServiceItem = {
  id: number
  title: string
  unit: string
  count: string
  unitQuantity: string
  unitPrice: string
  totalPrice: string
  lengthCount?: string
  widthCount?: string
}

type OrderItem = {
  id: number
  productName: string
  installCode: string
  unit: string
  length: string
  width: string
  quantity: string
  meterage: string
  perimeter: string
  unitPrice: string
  totalPrice: string
  description: string
  services: ServiceItem[]
  flagged?: boolean // «استپ»: علامت‌گذاری دستی برای اقلامی که ممکن است ابعادشان بعداً تغییر کند
}

type MapImage = {
  id: number
  name: string
  url: string
  type: "image" | "pdf"
}

const productList = [
  "شیشه سفید ۶ میل", "شیشه سفید ۸ میل", "شیشه سفید ۱۰ میل",
  "شیشه برنز ۶ میل", "شیشه دودی ۶ میل",
  "آینه سوپرکلیر ۶ میل", "آینه برنز 5 میل", "آینه دودی 5 میل",
  "لاکوبل مشکی ۶ میل", "لاکوبل سفید ۶ میل",
]

const serviceCategories: Record<string, string[]> = {
  "تراش‌ها": ["تراش ۰.۷", "تراش ۱", "تراش ۱.۵", "تراش ۲", "تراش ۲.۵", "دو طول تراش ۱.۵", "یک طول + دو عرض تراش ۱.۵"],
  "اینگروینگ": ["اینگروینگ ۱", "اینگروینگ ۲"],
  "ماشین‌کاری": ["CNC", "UV", "سندبلاست", "دیاموند", "MDF"],
  "اجرت‌ها": ["کرایه ","اجرت اندازه‌گیری", "چسب", "اجرت برش", "اجرت نصب", "هزینه بسته‌بندی"],
  "قاب و یراق": ["قاب چوبی", "قاب فلزی", "لول معمولی", "فیتینگ"],
}

const serviceUnits = ["مترمربع", "مترطول", "عددی", "درصد", "محیط", "ابعاد دایره", "چند طول چند عرض"]
const discountOptions = [3, 5, 7, 10, 12, 15]

const descriptionsList = [
  "رو میزی",
  "گوشه ها ۱*۱",
  "تیزی خیلی کم گرفته شود",
  "گوشه ها ۱.۵*۱.۵",
  "طبق فایل شبکه",
  "تیزی گرفته",
  "گوشه ها طبق الگو",
  "بیضی",
  "گوشه ها ۰.۵*۰.۵",
  "طبق الگو",
  "گرد",
  "گوشه ها ۲.۵*۲.۵ شود",
  "گوشه ها تیز",
  "دالبری",
  "قواره",
  "گوشه ها ۶*۶",
  "تراش ۱.۵",
  "گوشه ها فارسی بری",
  "گوشه ها الگویی",
  "گوشه ها طبق الگو زده شود",
  "گوشه ها الگویی با هماهنگی",
  "لوزی",
  "آبشاری، تراش دار ۱.۵",
  "گوشه ها ۳*۳",
  "گوشه متری",
  "دوسر گرد",
  "۱۲ضلعی",
  "الماسی",
  "کچی دارد",
  "مدل بری",
  "الگویی",
  "فارسی بری دارد",
  "خیلی دقیق باشد همه ی ابعاد",
  "گوش ها ۲.۵*۲.۵",
  "شش ضلعی تراش ۱.۵",
  "منسی بیرنگ",
  "۸ضلعی",
  "کاپریس تراش ۱",
  "لاکوبل سفید ۱۱۰",
  "یک گوشه ۲*۲ زده شود",
]

const formatWithCommas = (value: string) => {
  const raw = value.replace(/[^\d]/g, "")
  if (!raw) return ""
  return raw.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

const parsePrice = (value: string) => parseFloat(value.replace(/,/g, "")) || 0

const inputClass = "w-full rounded-xl border border-teal-500/30 bg-white/40 px-3 py-2.5 text-base font-semibold text-blue-950 focus:border-teal-500 focus:outline-none hover:bg-yellow-100 transition-colors duration-150"
const labelClass = "mb-1 block text-sm font-bold text-blue-900"
const selectClass = inputClass
// کادر/ستونی که با کشیدن گوشه، عرضش به‌صورت دستی قابل تغییر است
const resizableBoxClass = "resize-x overflow-auto"

const customersList = (customersSeedRaw as any[]).map((c: any) => {
  let name = ""

  if (c.customerType === "حقوقی") {
    name = (c.companyName || "").trim()
    if (!name) name = `${c.lastName || ""} ${c.firstName || ""}`.trim()
  } else {
    name = `${c.lastName || ""} ${c.firstName || ""}`.trim()
    if (!name) name = (c.companyName || "").trim()
  }

  if (!name) {
    name = c.companyName || c.lastName || c.firstName || c.code || "بدون نام"
  }

  return {
    id: c.id,
    code: c.code || "",
    name: name,
    group: c.group || "همکار",
  }
})

export default function NewOrderPage() {
  const router = useRouter()

  const [orderDate, setOrderDate] = useState<any>(null)
  const [deliveryDate, setDeliveryDate] = useState<any>(null)
  const [customerName, setCustomerName] = useState("")
  // TODO: پس از افزودن سیستم لاگین کارشناسان، این مقدار باید به‌صورت خودکار از کاربر واردشده پر شود
  const [salesRep, setSalesRep] = useState("")
  const [customerSearch, setCustomerSearch] = useState("")
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [productionLine, setProductionLine] = useState("دکوراتیو")
  const [customerGroup, setCustomerGroup] = useState("همکار")
  const [priority, setPriority] = useState("عادی")
  const [customerOrderNumber, setCustomerOrderNumber] = useState("—")
  const [orderNumber, setOrderNumber] = useState("—")
  const [hasInstallation, setHasInstallation] = useState(false)
  const [showInstallModal, setShowInstallModal] = useState(false)
  const [installDate, setInstallDate] = useState<any>(null)
  const [installAddress, setInstallAddress] = useState("")
  const [installPhone, setInstallPhone] = useState("")
  const [installNotes, setInstallNotes] = useState("")
  const [manualTotalQuantity, setManualTotalQuantity] = useState("")
  const [manualTotalMeterage, setManualTotalMeterage] = useState("")
  const [quantityLocked, setQuantityLocked] = useState(false)
  const [meterageLocked, setMeterageLocked] = useState(false)

  // فرم افزودن/ویرایش قلم — ترتیب: نام کالا، قیمت واحد، واحد، طول، عرض، تعداد، کد نصب، (قیمت کل نمایشی)
  const [newProduct, setNewProduct] = useState("")
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const [newInstallCode, setNewInstallCode] = useState("")
  const [newUnit, setNewUnit] = useState("مترمربع")
  const [newLength, setNewLength] = useState("")
  const [newWidth, setNewWidth] = useState("")
  const [newQuantity, setNewQuantity] = useState("1")
  const [newUnitPrice, setNewUnitPrice] = useState("")
  const [editingItemId, setEditingItemId] = useState<number | null>(null)

  const [items, setItems] = useState<OrderItem[]>([])
  const [mapImages, setMapImages] = useState<MapImage[]>([])
  const [previewFile, setPreviewFile] = useState<{ url: string; type: "image" | "pdf" } | null>(null)
  const [showServices, setShowServices] = useState(false)
  const [currentItemId, setCurrentItemId] = useState<number | null>(null)
  const [tempServices, setTempServices] = useState<ServiceItem[]>([])
  const [svcTitle, setSvcTitle] = useState("")
  const [svcUnit, setSvcUnit] = useState("مترطول")
  const [svcCount, setSvcCount] = useState("1")
  const [svcUnitQuantity, setSvcUnitQuantity] = useState("")
  const [svcUnitPrice, setSvcUnitPrice] = useState("")
  const [svcLengthCount, setSvcLengthCount] = useState("1")
  const [svcWidthCount, setSvcWidthCount] = useState("1")
  const [serviceSearch, setServiceSearch] = useState("")
  const [editingServiceId, setEditingServiceId] = useState<number | null>(null)
  const [showInvoice, setShowInvoice] = useState(false)
  const [invoiceMode, setInvoiceMode] = useState<"detailed" | "summary">("detailed")
  const [isOfficialInvoice, setIsOfficialInvoice] = useState(false)
  const [hasDiscount, setHasDiscount] = useState(false)
  const [discountPercent, setDiscountPercent] = useState(5)
  const [discountMode, setDiscountMode] = useState<"percent" | "manual">("percent")
  const [manualDiscountAmount, setManualDiscountAmount] = useState("")
  const [showManualDiscountModal, setShowManualDiscountModal] = useState(false)
  const [showDiscountMenu, setShowDiscountMenu] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; itemId: number } | null>(null)
  const [svcDiameter, setSvcDiameter] = useState("")

  // پاپ‌آپ توضیحات هر قلم
  const [showDescriptionModal, setShowDescriptionModal] = useState(false)
  const [currentDescItemId, setCurrentDescItemId] = useState<number | null>(null)
  const [modalDescription, setModalDescription] = useState("")
  const [modalDescriptionSearch, setModalDescriptionSearch] = useState("")
  const [showModalDescDropdown, setShowModalDescDropdown] = useState(false)

  // رفرنس‌های بخش «اطلاعات سفارش» برای جابجایی با اینتر
  const customerSearchRef = useRef<HTMLInputElement>(null)
  const productionLineRef = useRef<HTMLSelectElement>(null)
  const customerGroupRef = useRef<HTMLSelectElement>(null)
  const priorityRef = useRef<HTMLSelectElement>(null)
  // کادرهای دور تاریخ‌ها (برای گرفتن اینتر از اینپوت داخلی DatePicker) و چک‌باکس نصب
  const orderDateWrapRef = useRef<HTMLDivElement>(null)
  const deliveryDateWrapRef = useRef<HTMLDivElement>(null)
  const hasInstallationRef = useRef<HTMLInputElement>(null)

  // عرض ستون فرم (سمت راست) به‌صورت درصد؛ با کشیدن دستگیره بین دو ستون تغییر می‌کند
  const [formPanelWidth, setFormPanelWidth] = useState(58)
  const mainPanelsRef = useRef<HTMLDivElement>(null)
  const isResizingPanelsRef = useRef(false)
  // فقط در دسکتاپ (lg به بالا) دو ستون کنار هم قرار می‌گیرند و عرض درصدی معنا دارد
  const [isLgScreen, setIsLgScreen] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)")
    const update = () => setIsLgScreen(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  // رفرنس‌های فرم افزودن/ویرایش قلم — با ترتیب جدید
  const productRef = useRef<HTMLInputElement>(null)
  const unitPriceRef = useRef<HTMLInputElement>(null)
  const unitRef = useRef<HTMLSelectElement>(null)
  const lengthRef = useRef<HTMLInputElement>(null)
  const widthRef = useRef<HTMLInputElement>(null)
  const quantityRef = useRef<HTMLInputElement>(null)
  const installCodeRef = useRef<HTMLInputElement>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const invoiceRef = useRef<HTMLDivElement>(null)

  // رفرنس‌های مودال خدمات — برای جابجایی با اینتر
  const svcTitleRef = useRef<HTMLSelectElement>(null)
  const svcUnitRef = useRef<HTMLSelectElement>(null)
  const svcCountRef = useRef<HTMLInputElement>(null)
  const svcUnitQuantityRef = useRef<HTMLInputElement>(null)
  const svcDiameterRef = useRef<HTMLInputElement>(null)
  const svcLengthCountRef = useRef<HTMLInputElement>(null)
  const svcWidthCountRef = useRef<HTMLInputElement>(null)
  const svcUnitPriceRef = useRef<HTMLInputElement>(null)

  const calculatedTotalQuantity = useMemo(() => items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0), [items])
  const calculatedTotalMeterage = useMemo(() => items.reduce((sum, item) => sum + (parseFloat(item.meterage) || 0), 0).toFixed(4), [items])
  const calculatedTotalPerimeter = useMemo(() => items.reduce((sum, item) => sum + (parseFloat(item.perimeter) || 0), 0).toFixed(2), [items])
  const grandTotal = useMemo(() => items.reduce((sum, item) => sum + parsePrice(item.totalPrice), 0), [items])

  const discountAmount = hasDiscount
    ? discountMode === "manual"
      ? parsePrice(manualDiscountAmount)
      : Math.round((grandTotal * discountPercent) / 100)
    : 0
  const discountDisplayPercent = grandTotal > 0 ? ((discountAmount / grandTotal) * 100).toFixed(1) : "0"
  const totalAfterDiscount = grandTotal - discountAmount
  const vatAmount = isOfficialInvoice ? Math.round(totalAfterDiscount * 0.1) : 0
  const finalTotal = totalAfterDiscount + vatAmount

  const quantityMismatch = manualTotalQuantity !== "" && Number(manualTotalQuantity) !== calculatedTotalQuantity
  const meterageMismatch = manualTotalMeterage !== "" && Number(manualTotalMeterage) !== Number(calculatedTotalMeterage)

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase()
    if (!q) return customersList.slice(0, 8)
    return customersList.filter((c) => c.name.toLowerCase().includes(q) || c.code.includes(q)).slice(0, 12)
  }, [customerSearch])

  const filteredProducts = useMemo(() => {
    const q = newProduct.trim().toLowerCase()
    if (!q) return productList
    return productList.filter((p) => p.toLowerCase().includes(q))
  }, [newProduct])

  const filteredModalDescriptions = useMemo(() => {
    const q = modalDescriptionSearch.trim().toLowerCase()
    if (!q) return descriptionsList.slice(0, 8)
    return descriptionsList.filter((d) => d.toLowerCase().includes(q)).slice(0, 12)
  }, [modalDescriptionSearch])

  const calculatedUnitQuantity = useMemo(() => {
    const item = items.find((i) => i.id === currentItemId)
    if (!item && svcUnit !== "ابعاد دایره") return ""

    const l = parseFloat(item?.length || "0") || 0
    const w = parseFloat(item?.width || "0") || 0
    const q = parseFloat(item?.quantity || "1") || 1

   if (svcUnit === "مترمربع") {
  // مقدار متراژ همان قلم را استفاده می‌کنیم
  return item?.meterage || ((l * w) / 10000 * q).toFixed(4)
}

    if (svcUnit === "محیط") {
      return ((2 * (l + w)) / 100 * q).toFixed(2)
    }

    if (svcUnit === "چند طول چند عرض") {
      const lCount = parseFloat(svcLengthCount) || 0
      const wCount = parseFloat(svcWidthCount) || 0
      return (lCount * (l / 100) + wCount * (w / 100)).toFixed(3)
    }

    if (svcUnit === "ابعاد دایره") {
      const diameter = parseFloat(svcDiameter) || 0
      return ((3.14 * diameter) / 100).toFixed(3)
    }

    return ""
  }, [svcUnit, svcLengthCount, svcWidthCount, svcDiameter, currentItemId, items])

  const serviceTotalPreview = useMemo(() => {
    const count = parseFloat(svcCount) || 0
    const unitQty = parseFloat(
      svcUnit === "مترمربع" || svcUnit === "محیط" || svcUnit === "چند طول چند عرض" || svcUnit === "ابعاد دایره"
        ? calculatedUnitQuantity
        : svcUnitQuantity
    ) || 0
    const price = parsePrice(svcUnitPrice)
    return (count * unitQty * price).toLocaleString("en-US")
  }, [svcCount, svcUnitQuantity, svcUnitPrice, svcUnit, calculatedUnitQuantity])

  // پیش‌نمایش زنده‌ی قیمت کل در فرم افزودن/ویرایش قلم
  const newItemPreviewTotal = useMemo(() => {
    const calc = calculate(newLength, newWidth, newQuantity || "1", newUnit)
    const meterage = parseFloat(calc.meterage) || 0
    const price = parsePrice(newUnitPrice)
    return price && meterage ? (price * meterage).toLocaleString("en-US") : ""
  }, [newLength, newWidth, newQuantity, newUnit, newUnitPrice])

  useEffect(() => {
    if (!quantityLocked) setManualTotalQuantity(String(calculatedTotalQuantity || ""))
  }, [calculatedTotalQuantity, quantityLocked])

  useEffect(() => {
    if (!meterageLocked) setManualTotalMeterage(calculatedTotalMeterage === "0.0000" ? "" : calculatedTotalMeterage)
  }, [calculatedTotalMeterage, meterageLocked])

  useEffect(() => {
    const handleClick = () => {
      setContextMenu(null)
      setShowCustomerDropdown(false)
      setShowProductDropdown(false)
      setShowModalDescDropdown(false)
      setShowDiscountMenu(false)
    }
    window.addEventListener("click", handleClick)
    return () => window.removeEventListener("click", handleClick)
  }, [])

  const isOrderInfoComplete =
    customerName.trim() !== "" &&
    productionLine !== "" &&
    customerGroup !== "" &&
    priority !== "" &&
    orderDate !== null &&
    deliveryDate !== null

  const formatPrice = (value: string | number) => {
    const num = typeof value === "string" ? parsePrice(value) : value
    if (isNaN(num) || num === 0) return ""
    return num.toLocaleString("en-US")
  }

  function calculate(length: string, width: string, quantity: string, unit: string) {
    const l = parseFloat(length) || 0
    const w = parseFloat(width) || 0
    const q = parseFloat(quantity) || 1
    let meterage = 0
    let perimeter = 0
    if (unit === "مترمربع") {
      meterage = ((l * w) / 10000) * q
      perimeter = ((2 * (l + w)) / 100) * q
    } else if (unit === "مترطول") {
      meterage = (l / 100) * q
      perimeter = (l / 100) * q
    } else {
      meterage = q
    }
    return { meterage: meterage ? meterage.toFixed(4) : "", perimeter: perimeter ? perimeter.toFixed(2) : "" }
  }

  // به‌صورت عمومی روی یک رفرنس فوکوس می‌کند؛ اگر رفرنس یک اینپوت/سلکت باشد مستقیم فوکوس می‌شود
  // و اگر یک کادر دربردارنده باشد (مثلاً دور DatePicker) اینپوت داخلی‌اش پیدا و فوکوس می‌شود
  const focusRef = (ref: React.RefObject<any>) => {
    const el = ref.current
    if (!el) return
    const tag = el.tagName
    if (typeof el.focus === "function" && (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "BUTTON")) {
      el.focus()
      return
    }
    if (el.querySelector) {
      const inner = el.querySelector("input, select, textarea, button")
      inner?.focus()
    }
  }

  const handleEnter = (e: React.KeyboardEvent, nextRef: React.RefObject<any>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      focusRef(nextRef)
    }
  }

  // دستگیره‌ی بین دو ستون اصلی: با کشیدن به چپ/راست عرض دو ستون تغییر می‌کند
  const startPanelsResize = (e: React.MouseEvent) => {
    e.preventDefault()
    isResizingPanelsRef.current = true
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingPanelsRef.current || !mainPanelsRef.current) return
      const rect = mainPanelsRef.current.getBoundingClientRect()
      // چون کادر راست (اطلاعات سفارش) اول در DOM است و صفحه RTL است،
      // فاصله از لبه‌ی راست کانتینر معیار درصد عرض آن است
      const percentFromRight = ((rect.right - e.clientX) / rect.width) * 100
      const clamped = Math.min(75, Math.max(30, percentFromRight))
      setFormPanelWidth(clamped)
    }
    const handleMouseUp = () => {
      if (!isResizingPanelsRef.current) return
      isResizingPanelsRef.current = false
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [])

  // در مودال خدمات، بسته به واحد انتخابی، فیلد بعدی برای اینتر متفاوت است
  const svcCountNextRef = () => {
    if (svcUnit === "ابعاد دایره") return svcDiameterRef
    if (svcUnit === "چند طول چند عرض") return svcLengthCountRef
    if (svcUnit === "مترمربع" || svcUnit === "محیط") return svcUnitPriceRef
    return svcUnitQuantityRef
  }

  const selectCustomer = (c: { name: string; group: string; code: string }) => {
    setCustomerName(c.name)
    setCustomerSearch(c.name)
    setCustomerGroup(c.group as any)
    setShowCustomerDropdown(false)
  }

  // شروع ویرایش یک قلم موجود (کلیک روی ردیف جدول، مشابه رفتار ویرایش خدمات)
  const startEditItem = (item: OrderItem) => {
    setEditingItemId(item.id)
    setNewProduct(item.productName)
    setNewInstallCode(item.installCode)
    setNewUnit(item.unit)
    setNewLength(item.length)
    setNewWidth(item.width)
    setNewQuantity(item.quantity)
    setNewUnitPrice(item.unitPrice)
    productRef.current?.focus()
  }

  const cancelEditItem = () => {
    setEditingItemId(null)
    setNewProduct("")
    setNewInstallCode("")
    setNewLength("")
    setNewWidth("")
    setNewQuantity("1")
    setNewUnitPrice("")
  }

  // اسکیپ = انصراف، بدون نیاز به موس؛ به‌ترتیب اولویت: منوها/دراپ‌داون‌های باز، سپس مودال‌ها،
  // سپس ویرایش خدمت درون مودال خدمات، سپس خود مودال خدمات، و در نهایت ویرایش قلم در جدول اصلی
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return

      if (showManualDiscountModal) {
        setShowManualDiscountModal(false)
        return
      }
      if (showDiscountMenu) {
        setShowDiscountMenu(false)
        return
      }
      if (showCustomerDropdown) {
        setShowCustomerDropdown(false)
        return
      }
      if (showProductDropdown) {
        setShowProductDropdown(false)
        return
      }
      if (showModalDescDropdown) {
        setShowModalDescDropdown(false)
        return
      }
      if (contextMenu) {
        setContextMenu(null)
        return
      }
      if (showDescriptionModal) {
        setShowDescriptionModal(false)
        return
      }
      if (showInstallModal) {
        setShowInstallModal(false)
        if (!installDate) setHasInstallation(false)
        return
      }
      if (showInvoice) {
        setShowInvoice(false)
        return
      }
      if (showServices) {
        if (editingServiceId) {
          setEditingServiceId(null)
          setSvcTitle("")
          setSvcCount("1")
          setSvcUnitQuantity("")
          setSvcUnitPrice("")
          setSvcLengthCount("1")
          setSvcWidthCount("1")
        } else {
          setShowServices(false)
        }
        return
      }
      if (editingItemId) {
        cancelEditItem()
        return
      }
    }
    window.addEventListener("keydown", handleEscape)
    return () => window.removeEventListener("keydown", handleEscape)
  }, [
    showManualDiscountModal,
    showDiscountMenu,
    showCustomerDropdown,
    showProductDropdown,
    showModalDescDropdown,
    contextMenu,
    showDescriptionModal,
    showInstallModal,
    installDate,
    showInvoice,
    showServices,
    editingServiceId,
    editingItemId,
  ])

  const saveItem = () => {
    if (!newProduct) {
      alert("نام کالا را انتخاب کنید")
      return
    }
    const qty = parseFloat(newQuantity) || 1
    const price = parsePrice(newUnitPrice)

    if (editingItemId) {
      // ویرایش قلم موجود
      const calc = calculate(newLength, newWidth, String(qty), newUnit)
      const meterage = parseFloat(calc.meterage) || 0
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== editingItemId) return item
          const servicesTotal = item.services.reduce((sum, s) => sum + parsePrice(s.totalPrice), 0)
          const basePrice = price * meterage
          return {
            ...item,
            productName: newProduct,
            installCode: newInstallCode,
            unit: newUnit,
            length: newLength,
            width: newWidth,
            quantity: String(qty),
            meterage: calc.meterage,
            perimeter: calc.perimeter,
            unitPrice: newUnitPrice,
            totalPrice: (basePrice + servicesTotal).toLocaleString("en-US"),
          }
        })
      )
      setEditingItemId(null)
    } else if (qty > 5) {
      const calc = calculate(newLength, newWidth, String(qty), newUnit)
      const meterage = parseFloat(calc.meterage) || 0
      setItems([...items, {
        id: Date.now(),
        productName: newProduct,
        installCode: newInstallCode,
        unit: newUnit,
        length: newLength,
        width: newWidth,
        quantity: String(qty),
        meterage: calc.meterage,
        perimeter: calc.perimeter,
        unitPrice: newUnitPrice,
        totalPrice: price ? (price * meterage).toLocaleString("en-US") : "",
        description: "",
        services: [],
        flagged: false,
      }])
    } else {
      const newItems: OrderItem[] = []
      for (let i = 0; i < qty; i++) {
        const calc = calculate(newLength, newWidth, "1", newUnit)
        const meterage = parseFloat(calc.meterage) || 0
        newItems.push({
          id: Date.now() + i,
          productName: newProduct,
          installCode: newInstallCode,
          unit: newUnit,
          length: newLength,
          width: newWidth,
          quantity: "1",
          meterage: calc.meterage,
          perimeter: calc.perimeter,
          unitPrice: newUnitPrice,
          totalPrice: price ? (price * meterage).toLocaleString("en-US") : "",
          description: "",
          services: [],
          flagged: false,
        })
      }
      setItems([...items, ...newItems])
    }

   // نام کالا و قیمت واحد ثابت می‌مانند تا بتوان چند قلم از همان کالا ثبت کرد
setNewInstallCode("")
setNewLength("")
setNewWidth("")
setNewQuantity("1")
lengthRef.current?.focus()
  }

  const removeItem = (id: number) => setItems(items.filter((item) => item.id !== id))

  const toggleItemFlag = (id: number) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, flagged: !item.flagged } : item)))
  }

  const handleMapUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach((file) => {
      const url = URL.createObjectURL(file)
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
      setMapImages((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random(),
          name: file.name,
          url,
          type: isPdf ? "pdf" : "image",
        },
      ])
    })
    e.target.value = ""
  }

  const removeMapImage = (id: number) => {
    setMapImages((prev) => {
      const img = prev.find((i) => i.id === id)
      if (img) URL.revokeObjectURL(img.url)
      return prev.filter((i) => i.id !== id)
    })
  }

  const openServices = (id: number) => {
    const item = items.find((i) => i.id === id)
    setCurrentItemId(id)
    setTempServices(item?.services || [])
    setSvcTitle("")
    setSvcUnit("محیط")
    setSvcCount("1")
    setSvcUnitQuantity("")
    setSvcUnitPrice("")
    setSvcLengthCount("1")
    setSvcWidthCount("1")
    setServiceSearch("")
    setEditingServiceId(null)
    setShowServices(true)
    setSvcDiameter("")
  }

  const addOrUpdateService = () => {
    if (!svcTitle) {
      alert("خدمت را انتخاب کنید")
      return
    }
    const count = parseFloat(svcCount) || 1
    const unitQty = parseFloat(
      svcUnit === "مترمربع" || svcUnit === "محیط" || svcUnit === "چند طول چند عرض" || svcUnit === "ابعاد دایره"
        ? calculatedUnitQuantity
        : svcUnitQuantity
    ) || 0
    const price = parsePrice(svcUnitPrice)
    const total = count * unitQty * price
    const serviceData: ServiceItem = {
      id: editingServiceId || Date.now(),
      title: svcTitle,
      unit: svcUnit,
      count: svcCount,
      unitQuantity:
  svcUnit === "مترمربع" ||
  svcUnit === "محیط" ||
  svcUnit === "چند طول چند عرض" ||
  svcUnit === "ابعاد دایره"
    ? (svcUnitQuantity || calculatedUnitQuantity)
    : svcUnitQuantity,
      unitPrice: svcUnitPrice,
      totalPrice: total ? total.toLocaleString("en-US") : "0",
      lengthCount: svcLengthCount,
      widthCount: svcWidthCount,
    }
    if (editingServiceId) {
      setTempServices(tempServices.map((s) => (s.id === editingServiceId ? serviceData : s)))
    } else {
      setTempServices([...tempServices, serviceData])
    }
    setEditingServiceId(null)
    setSvcTitle("")
    setSvcCount("1")
    setSvcUnitQuantity("")
    setSvcUnitPrice("")
    setSvcLengthCount("1")
    setSvcWidthCount("1")
    svcTitleRef.current?.focus()
  }

  const removeService = (id: number) => setTempServices(tempServices.filter((s) => s.id !== id))

  const saveServices = () => {
    if (!currentItemId) return
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== currentItemId) return item
        const basePrice = parsePrice(item.unitPrice) * (parseFloat(item.meterage) || 0)
        const servicesTotal = tempServices.reduce((sum, s) => sum + parsePrice(s.totalPrice), 0)
        return { ...item, services: tempServices, totalPrice: (basePrice + servicesTotal).toLocaleString("en-US") }
      })
    )
    setShowServices(false)
  }

 const copyServicesToOthers = (sourceId: number) => {
  const source = items.find((i) => i.id === sourceId)
  if (!source || source.services.length === 0) {
    alert("این قلم خدمتی ندارد")
    setContextMenu(null)
    return
  }
  if (!confirm(`سختی کار این قلم به ${items.length - 1} قلم دیگر کپی شود؟`)) {
    setContextMenu(null)
    return
  }

  // محاسبه تعداد واحد خدمت بر اساس ابعاد قلم هدف
  const calcServiceUnitQty = (
    item: OrderItem,
    unit: string,
    lengthCount: string = "1",
    widthCount: string = "1",
    diameter: string = "0"
  ) => {
    const l = parseFloat(item.length) || 0
    const w = parseFloat(item.width) || 0
    const q = parseFloat(item.quantity) || 1

   if (unit === "مترمربع") {
  return item.meterage || ((l * w) / 10000 * q).toFixed(4)
}
    if (unit === "محیط") {
      return ((2 * (l + w)) / 100 * q).toFixed(2)
    }
    if (unit === "چند طول چند عرض") {
      const lCount = parseFloat(lengthCount) || 0
      const wCount = parseFloat(widthCount) || 0
      return (lCount * (l / 100) + wCount * (w / 100)).toFixed(3)
    }
    if (unit === "ابعاد دایره") {
      const d = parseFloat(diameter) || 0
      return ((3.14 * d) / 100).toFixed(3)
    }
    // برای واحدهای دیگر (عددی، مترطول، درصد و ...) مقدار قبلی را نگه می‌داریم
    return null
  }

  setItems((prev) =>
    prev.map((item) => {
      if (item.id === sourceId) return item

      const copiedServices = source.services.map((s) => {
        const newUnitQty =
          calcServiceUnitQty(item, s.unit, s.lengthCount, s.widthCount) ?? s.unitQuantity

        const count = parseFloat(s.count) || 1
        const unitQty = parseFloat(newUnitQty) || 0
        const price = parsePrice(s.unitPrice)
        const total = count * unitQty * price

        return {
          ...s,
          id: Date.now() + Math.random(),
          unitQuantity: newUnitQty,
          totalPrice: total ? total.toLocaleString("en-US") : "0",
        }
      })

      const basePrice = parsePrice(item.unitPrice) * (parseFloat(item.meterage) || 0)
      const servicesTotal = copiedServices.reduce((sum, s) => sum + parsePrice(s.totalPrice), 0)

      return {
        ...item,
        services: copiedServices,
        totalPrice: (basePrice + servicesTotal).toLocaleString("en-US"),
      }
    })
  )

  setContextMenu(null)
  alert("سختی کار با موفقیت کپی و بر اساس ابعاد جدید محاسبه شد")
}

  // پاپ‌آپ توضیحات
  const openDescriptionModal = (id: number) => {
    const item = items.find((i) => i.id === id)
    setCurrentDescItemId(id)
    setModalDescription(item?.description || "")
    setModalDescriptionSearch(item?.description || "")
    setShowModalDescDropdown(false)
    setShowDescriptionModal(true)
  }

  const saveDescription = () => {
    if (!currentDescItemId) return
    setItems((prev) =>
      prev.map((item) => (item.id === currentDescItemId ? { ...item, description: modalDescription } : item))
    )
    setShowDescriptionModal(false)
  }

  const handleSave = async () => {
    if (!isOrderInfoComplete) {
      alert("لطفاً ابتدا تمام فیلدهای اطلاعات سفارش را تکمیل کنید")
      return
    }
    if (items.length === 0) {
      alert("حداقل یک قلم به سفارش اضافه کنید")
      return
    }
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
          customerGroup,
          productionLine,
          priority,
          orderDate: orderDate?.format ? orderDate.format("YYYY/MM/DD") : null,
          deliveryDate: deliveryDate?.format ? deliveryDate.format("YYYY/MM/DD") : null,
          hasInstallation,
          installDate: installDate?.format ? installDate.format("YYYY/MM/DD") : null,
          installAddress,
          installPhone,
          installNotes,
          totalQuantity: manualTotalQuantity || calculatedTotalQuantity,
          totalMeterage: manualTotalMeterage || calculatedTotalMeterage,
          items,
          notes: "",
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        alert(result.error || "خطا در ذخیره سفارش")
        return
      }
      if (result.assignedOrderNumber) setOrderNumber(String(result.assignedOrderNumber))
      if (result.assignedCustomerOrderNumber) setCustomerOrderNumber(String(result.assignedCustomerOrderNumber))
      alert(`سفارش با شماره ${result.assignedOrderNumber || ""} با موفقیت ذخیره شد`)
      router.push("/order")
    } catch (error) {
      console.error(error)
      alert("خطا در ارتباط با سرور")
    }
  }

  const allFilteredServices = useMemo(() => {
    if (!serviceSearch.trim()) return Object.values(serviceCategories).flat()
    const search = serviceSearch.trim().toLowerCase()
    return Object.values(serviceCategories).flat().filter((s) => s.toLowerCase().includes(search))
  }, [serviceSearch])

  const currentItem = items.find((i) => i.id === currentItemId)
  const currentDescItem = items.find((i) => i.id === currentDescItemId)

  // محتوای پیش‌فاکتور به‌صورت یک تابع جدا تعریف شده تا بتوان
  // هم داخل مودالِ روی صفحه و هم در بلوکِ مخصوص چاپ (خارج از هر گونه
  // کانتینر با overflow-hidden یا position:fixed) از آن استفاده کرد.
  const renderInvoiceContent = () => (
    <div
      id="invoice-print-area"
      ref={invoiceRef}
      className="p-6 relative overflow-hidden print:overflow-visible print:p-4"
      dir="rtl"
      style={{
        fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif",
        backgroundImage: "url('https://i.postimg.cc/W4BMwGSr/IMG-7794-png.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center top",
        backgroundRepeat: "no-repeat",
        minHeight: "1100px",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      } as React.CSSProperties}
    >
      <div className="relative z-10">

        {/* عنوان پیش‌فاکتور، کمی پایین‌تر از لوگوی سربرگ */}
        <div className="text-center mt-24 mb-4">
          <h2 className="text-2xl font-bold text-teal-800 tracking-wide">پیش فاکتور</h2>
        </div>

        {/* اطلاعات مشتری و سفارش */}
        <div className="flex justify-between text-sm mb-6 leading-7 bg-teal-50/50 rounded-xl p-4 border border-teal-100">
          <div>
            <p><strong>نام مشتری:</strong> {customerName || "—"}</p>
            <p className="mt-1"><strong>کارشناس فروش:</strong> {salesRep || "—"}</p>
            <p className="mt-1"><strong>شماره سفارش مشتری:</strong> {customerOrderNumber || "—"}</p>
          </div>
          <div className="text-left">
            <p><strong>شماره سفارش:</strong> {orderNumber}</p>
            <p><strong>تاریخ سفارش:</strong> {orderDate?.format ? orderDate.format("YYYY/MM/DD") : "—"}</p>
            <p><strong>تاریخ تحویل:</strong> {deliveryDate?.format ? deliveryDate.format("YYYY/MM/DD") : "—"}</p>
          </div>
        </div>

        {/* جدول جزئی */}
        {invoiceMode === "detailed" ? (
          <table className="w-full border-collapse text-sm mb-5">
            <thead>
              <tr className="bg-teal-700 text-white">
                <th className="border border-teal-600 p-2.5 text-right font-bold">ردیف</th>
                <th className="border border-teal-600 p-2.5 text-right font-bold">نام کالا</th>
                <th className="border border-teal-600 p-2.5 text-center font-bold">طول</th>
                <th className="border border-teal-600 p-2.5 text-center font-bold">عرض</th>
                <th className="border border-teal-600 p-2.5 text-center font-bold">تعداد</th>
                <th className="border border-teal-600 p-2.5 text-center font-bold">متراژ</th>
                <th className="border border-teal-600 p-2.5 text-center font-bold">قیمت فی</th>
                <th className="border border-teal-600 p-2.5 text-center font-bold">قیمت کل</th>
                <th className="border border-teal-600 p-2.5 text-right font-bold">توضیحات</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <Fragment key={item.id}>
                  {/* سطر کالا - فقط قیمت خود کالا */}
                  <tr className="hover:bg-teal-50/40">
                    <td className="border border-gray-300 p-2 text-center font-bold">{i + 1}</td>
                    <td className="border border-gray-300 p-2 font-semibold">{item.productName}</td>
                    <td className="border border-gray-300 p-2 text-center">{item.length}</td>
                    <td className="border border-gray-300 p-2 text-center">{item.width}</td>
                    <td className="border border-gray-300 p-2 text-center">{item.quantity}</td>
                    <td className="border border-gray-300 p-2 text-center">{item.meterage}</td>
                    <td className="border border-gray-300 p-2 text-center">{formatPrice(item.unitPrice)}</td>
                    <td className="border border-gray-300 p-2 text-left font-bold text-teal-800">
                      {formatPrice(item.totalPrice)} {/* فقط قیمت کالا */}
                    </td>
                    <td className="border border-gray-300 p-2 text-xs text-gray-700">{item.description || "—"}</td>
                  </tr>

                  {/* سطر خدمات - جمع جداگانه */}
                  {item.services.length > 0 && (
                    <tr>
                      <td colSpan={9} className="border border-gray-300 bg-amber-50/70 p-0">
                        <div className="px-3 py-2">
                          <p className="text-xs font-bold text-amber-800 mb-1.5">خدمات / سختی کار:</p>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs border-collapse">
                              <thead>
                                <tr className="text-gray-600 bg-amber-100/60">
                                  <th className="text-right font-semibold py-1.5 pr-2">خدمت</th>
                                  <th className="text-center font-semibold py-1.5">واحد</th>
                                  <th className="text-center font-semibold py-1.5">تعداد</th>
                                  <th className="text-center font-semibold py-1.5">تعداد واحد</th>
                                  <th className="text-center font-semibold py-1.5">قیمت واحد</th>
                                  <th className="text-left font-semibold py-1.5 pl-2">قیمت کل</th>
                                </tr>
                              </thead>
                              <tbody>
                                {item.services.map((s) => (
                                  <tr key={s.id} className="border-t border-amber-200/60">
                                    <td className="pr-2 py-1.5 font-medium">{s.title}</td>
                                    <td className="text-center py-1.5">{s.unit}</td>
                                    <td className="text-center py-1.5">{s.count}</td>
                                    <td className="text-center py-1.5">{s.unitQuantity}</td>
                                    <td className="text-center py-1.5">{formatPrice(s.unitPrice)}</td>
                                    <td className="text-left py-1.5 pl-2 font-bold text-teal-700">
                                      {formatPrice(s.totalPrice)} ریال
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        ) : (
          /* حالت خلاصه */
          <table className="w-full border-collapse text-sm mb-5">
            <thead>
              <tr className="bg-teal-700 text-white">
                <th className="border border-teal-600 p-2.5 text-right font-bold">ردیف</th>
                <th className="border border-teal-600 p-2.5 text-right font-bold">نام کالا</th>
                <th className="border border-teal-600 p-2.5 text-center font-bold">تعداد</th>
                <th className="border border-teal-600 p-2.5 text-center font-bold">متراژ</th>
                <th className="border border-teal-600 p-2.5 text-right font-bold">خدمات</th>
                <th className="border border-teal-600 p-2.5 text-left font-bold">قیمت کل</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id} className="hover:bg-teal-50/40">
                  <td className="border border-gray-300 p-2 text-center font-bold">{i + 1}</td>
                  <td className="border border-gray-300 p-2 font-semibold">{item.productName}</td>
                  <td className="border border-gray-300 p-2 text-center">{item.quantity}</td>
                  <td className="border border-gray-300 p-2 text-center">{item.meterage}</td>
                  <td className="border border-gray-300 p-2 text-xs text-gray-700">
                    {item.services.length > 0
                      ? item.services.map((s) => `${s.title} (${formatPrice(s.totalPrice)})`).join("، ")
                      : "—"}
                  </td>
                  <td className="border border-gray-300 p-2 text-left font-bold text-teal-800">
                    {formatPrice(item.totalPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* جمع‌ها */}
        <div className="flex justify-between items-end mt-6 pt-4 border-t-2 border-teal-200">
          <div className="text-sm text-gray-600 space-y-1">
            <p>تعداد کل اقلام: <strong>{items.length}</strong></p>
            <p>متراژ کل: <strong>{calculatedTotalMeterage}</strong></p>
            <p>محیط کل: <strong>{calculatedTotalPerimeter}</strong></p>

            {hasDiscount && (
              <p className="text-rose-700 font-medium">
                تخفیف ({discountMode === "percent" ? `${discountPercent}٪` : `${discountDisplayPercent}٪`}): -{discountAmount.toLocaleString("en-US")} ریال
              </p>
            )}

            {isOfficialInvoice && (
              <p className="text-amber-700 font-medium">
                ارزش افزوده (۱۰٪): {vatAmount.toLocaleString("en-US")} ریال
              </p>
            )}
          </div>

          <div className="text-left bg-teal-50 border border-teal-200 rounded-xl px-6 py-3">
            <p className="text-sm text-gray-600 mb-1">مبلغ قابل پرداخت</p>
            <p className="text-2xl font-bold text-teal-800">
              {finalTotal.toLocaleString("en-US")} <span className="text-base">ریال</span>
            </p>
          </div>
        </div>

        {/* اطلاعات حساب (واریز) */}
        <div className="mt-8 pt-4 border-t border-gray-200 text-sm text-gray-700">
          <p className="font-bold mb-2 text-teal-800">اطلاعات واریز:</p>
          {isOfficialInvoice ? (
            <div className="bg-teal-50/50 rounded-lg p-3 border border-teal-100 leading-6">
              <p>شماره کارت: ۰۲۰۱ ۰۰۰۱ ۹۳۶۰ ۰۷</p>
              <p>به نام: صنایع اخوان شیشه خواجوی</p>
              <p>شماره شبا: IR02540104202100001936007</p>
              <p className="text-xs text-gray-500 mt-1">بانک پارسیان</p>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 leading-6">
              <p>شماره کارت: 6221061231052947</p>
              <p>به نام: مجتبی خاجی</p>
              <p>شماره شبا / حساب: ۱۹۰۵۴۰۱۲۵۷۲۰۱۰۰۸۸۲۳۳۷۶۰۱</p>
              <p className="text-xs text-gray-500 mt-1">بانک پارسیان</p>
            </div>
          )}
        </div>

      </div>
    </div>
  )

  return (
    <>
      <div
        className="min-h-screen p-3 relative overflow-hidden bg-cover bg-center bg-no-repeat bg-fixed print:hidden"
        style={{
          backgroundImage: "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')",
          fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif",
        }}
        dir="rtl"
      >
        <link href="https://cdn.jsdelivr.net/npm/vazirmatn@33.003/Vazirmatn-font-face.css" rel="stylesheet" />
        <div className="pointer-events-none fixed inset-0 bg-black/5" />

        <div className="relative z-10 w-full max-w-[1920px] mx-auto pb-28">
          {/* هدر */}
          <div className="mb-3 flex items-center justify-between rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-4 shadow-lg border border-teal-500/20">
            <div className="flex-1 text-center">
              <h1 className="text-3xl font-bold text-blue-950">ثبت سفارش جدید</h1>
              <p className="text-lg font-bold text-blue-900 mt-1">نرم‌افزار اخوان | شیشه و آینه</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={!isOrderInfoComplete || items.length === 0}
                className={`rounded-xl px-8 py-3.5 text-xl font-bold text-white shadow-md transition ${
                  isOrderInfoComplete && items.length > 0 ? "bg-teal-500 hover:bg-teal-600" : "bg-gray-400 cursor-not-allowed"
                }`}
              >
                ذخیره
              </button>
              <button
                onClick={() => router.push("/order")}
                className="rounded-xl border border-teal-500/30 bg-white/30 px-7 py-3.5 text-xl font-bold text-blue-900 hover:bg-white/50 transition"
              >
                انصراف
              </button>
            </div>
          </div>

          <div ref={mainPanelsRef} className="flex flex-col lg:flex-row items-stretch gap-3 lg:gap-0">
            <div
              className="w-full space-y-3 min-w-0"
              style={isLgScreen ? { flex: `0 0 ${formPanelWidth}%`, maxWidth: `${formPanelWidth}%` } : undefined}
            >
              {/* اطلاعات سفارش */}
  <div className="rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/20">
    <h2 className="mb-4 text-xl font-bold text-blue-950">اطلاعات سفارش</h2>

    {/* ردیف ۱: نام مشتری + شماره سفارش + شماره سفارش مشتری */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <label className={labelClass}>نام مشتری</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              ref={customerSearchRef}
              type="text"
              value={customerSearch}
              onChange={(e) => {
                setCustomerSearch(e.target.value)
                setCustomerName(e.target.value)
                setShowCustomerDropdown(true)
              }}
              onFocus={() => setShowCustomerDropdown(true)}
              onKeyDown={(e) => handleEnter(e, productionLineRef)}
              placeholder="جستجوی مشتری..."
              className={inputClass}
            />
            {showCustomerDropdown && filteredCustomers.length > 0 && (
              <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-teal-200 bg-white shadow-2xl">
                {filteredCustomers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectCustomer(c)}
                    className="w-full text-right px-4 py-2.5 text-sm font-bold text-blue-900 hover:bg-yellow-100 border-b border-teal-50"
                  >
                    <span className="text-teal-700 font-mono text-xs ml-2">{c.code}</span>
                    {c.name}
                    <span className="text-xs text-gray-500 mr-2">({c.group})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => router.push("/customers?new=1")}
            className="rounded-xl bg-teal-500 hover:bg-teal-600 px-3 text-sm font-bold text-white whitespace-nowrap"
          >
            + جدید
          </button>
        </div>
      </div>

      <div>
        <label className={labelClass}>شماره سفارش</label>
        <input
          type="text"
          value={orderNumber}
          readOnly
          className="w-full rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5 text-base font-bold text-teal-800"
        />
      </div>

      <div>
        <label className={labelClass}>شماره سفارش مشتری</label>
        <input
          type="text"
          value={customerOrderNumber}
          readOnly
          className="w-full rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5 text-base font-bold text-teal-800"
        />
      </div>
    </div>

    {/* ردیف ۲: گروه مشتری + خط تولید + اولویت */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
      <div>
        <label className={labelClass}>گروه مشتری</label>
        <select
          ref={customerGroupRef}
          value={customerGroup}
          onChange={(e) => setCustomerGroup(e.target.value)}
          onKeyDown={(e) => handleEnter(e, priorityRef)}
          className={selectClass}
        >
          <option value="همکار">همکار</option>
          <option value="نقدی">نقدی</option>
        </select>
      </div>
      <div>
        <label className={labelClass}>خط تولید</label>
        <select
          ref={productionLineRef}
          value={productionLine}
          onChange={(e) => setProductionLine(e.target.value)}
          onKeyDown={(e) => handleEnter(e, customerGroupRef)}
          className={selectClass}
        >
          <option value="دکوراتیو">دکوراتیو</option>
          <option value="اجرتی">اجرتی</option>
          <option value="UPVC">UPVC</option>
          <option value="آلومینیومی">آلومینیومی</option>
          <option value="لمینت">لمینت</option>
          <option value="سکوریت">سکوریت</option>
          <option value="دوجداره">دوجداره</option>
        </select>
      </div>
      <div>
        <label className={labelClass}>اولویت</label>
        <select
          ref={priorityRef}
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          onKeyDown={(e) => handleEnter(e, orderDateWrapRef)}
          className={selectClass}
        >
          <option value="عادی">عادی</option>
          <option value="فوری">فوری</option>
        </select>
      </div>
    </div>

    {/* ردیف ۳: تاریخ سفارش + تاریخ تحویل + نصب */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
      <div ref={orderDateWrapRef} onKeyDown={(e) => handleEnter(e, deliveryDateWrapRef)}>
        <label className={labelClass}>تاریخ سفارش</label>
        <DatePicker
          value={orderDate}
          onChange={setOrderDate}
          calendar={persian}
          locale={persian_fa}
          calendarPosition="bottom-right"
          inputClass={inputClass}
          portal
          zIndex={1000}
          placeholder="انتخاب تاریخ"
        />
      </div>
      <div ref={deliveryDateWrapRef} onKeyDown={(e) => handleEnter(e, hasInstallationRef)}>
        <label className={labelClass}>تاریخ تحویل</label>
        <DatePicker
          value={deliveryDate}
          onChange={setDeliveryDate}
          calendar={persian}
          locale={persian_fa}
          calendarPosition="bottom-right"
          inputClass={inputClass}
          portal
          zIndex={1000}
          placeholder="انتخاب تاریخ"
        />
      </div>
      <div className="flex items-end gap-3 pb-1">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            ref={hasInstallationRef}
            type="checkbox"
            checked={hasInstallation}
            onChange={(e) => {
              setHasInstallation(e.target.checked)
              if (e.target.checked) setShowInstallModal(true)
            }}
            onKeyDown={(e) => handleEnter(e, productRef)}
            className="w-5 h-5 accent-teal-600"
          />
          <span className="text-base font-bold text-blue-900">نصب</span>
        </label>
        {hasInstallation && (
          <button
            type="button"
            onClick={() => setShowInstallModal(true)}
            className="text-sm font-bold text-teal-700 hover:underline"
          >
            ویرایش نصب
          </button>
        )}
      </div>
    </div>

    {/* ردیف ۴: تعداد کل + متراژ کل + جمع اقلام */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div>
        <label className={labelClass}>تعداد کل</label>
        <input
          type="text"
          value={manualTotalQuantity}
          onChange={(e) => {
            setManualTotalQuantity(e.target.value)
            setQuantityLocked(true)
          }}
          className={`${inputClass} ${quantityMismatch ? "border-red-400 bg-red-50" : ""}`}
        />
        <p className={`text-xs mt-1 ${quantityMismatch ? "text-red-600 font-bold" : "text-blue-600"}`}>
          محاسبه: {calculatedTotalQuantity}
          {quantityMismatch && " ⚠ مغایرت"}
        </p>
      </div>
      <div>
        <label className={labelClass}>متراژ کل</label>
        <input
          type="text"
          value={manualTotalMeterage}
          onChange={(e) => {
            setManualTotalMeterage(e.target.value)
            setMeterageLocked(true)
          }}
          className={`${inputClass} ${meterageMismatch ? "border-red-400 bg-red-50" : ""}`}
        />
        <p className={`text-xs mt-1 ${meterageMismatch ? "text-red-600 font-bold" : "text-blue-600"}`}>
          محاسبه: {calculatedTotalMeterage}
          {meterageMismatch && " ⚠ مغایرت"}
        </p>
      </div>
      <div className="rounded-xl bg-teal-500/20 border border-teal-500/30 px-4 py-3 flex flex-col justify-center">
        <span className="text-sm text-blue-700">جمع اقلام</span>
        <span className="text-2xl font-bold text-teal-700">{items.length} قلم</span>
      </div>
    </div>
  </div>

              {/* افزودن / ویرایش قلم */}
              <div className="rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/20">
                <h2 className="mb-3 text-xl font-bold text-blue-950">
                  {editingItemId ? "ویرایش قلم" : "افزودن قلم جدید"}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-2 items-end">
                  <div className="lg:col-span-2 relative" onClick={(e) => e.stopPropagation()}>
                    <label className={labelClass}>نام کالا</label>
                    <input
                      ref={productRef}
                      type="text"
                      value={newProduct}
                      onChange={(e) => {
                        setNewProduct(e.target.value)
                        setNewUnitPrice("")
                        setShowProductDropdown(true)
                      }}
                      onFocus={() => setShowProductDropdown(true)}
                      onKeyDown={(e) => handleEnter(e, unitPriceRef)}
                      placeholder="جستجوی کالا..."
                      className={inputClass}
                      autoComplete="off"
                    />
                    {showProductDropdown && filteredProducts.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-teal-200 bg-white shadow-2xl">
                        {filteredProducts.map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => {
                              setNewProduct(p)
                              setNewUnitPrice("")
                              setShowProductDropdown(false)
                            }}
                            className="w-full text-right px-4 py-2.5 text-sm font-bold text-blue-900 hover:bg-yellow-100 border-b border-teal-50"
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className={labelClass}>قیمت واحد</label>
                    <input
                      ref={unitPriceRef}
                      type="text"
                      value={newUnitPrice}
                      onChange={(e) => setNewUnitPrice(formatWithCommas(e.target.value))}
                      onKeyDown={(e) => handleEnter(e, unitRef)}
                      className={inputClass}
                     placeholder=""
    autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>واحد</label>
                    <select ref={unitRef} value={newUnit} onChange={(e) => setNewUnit(e.target.value)} onKeyDown={(e) => handleEnter(e, lengthRef)} className={selectClass}>
                      <option value="مترمربع">مترمربع</option>
                      <option value="مترطول">مترطول</option>
                      <option value="عددی">عددی</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>طول (cm)</label>
                    <input ref={lengthRef} type="number" value={newLength} onChange={(e) => setNewLength(e.target.value)} onKeyDown={(e) => handleEnter(e, widthRef)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>عرض (cm)</label>
                    <input ref={widthRef} type="number" value={newWidth} onChange={(e) => setNewWidth(e.target.value)} onKeyDown={(e) => handleEnter(e, quantityRef)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>تعداد</label>
                    <input ref={quantityRef} type="number" value={newQuantity} onChange={(e) => setNewQuantity(e.target.value)} onKeyDown={(e) => handleEnter(e, installCodeRef)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>کد نصب</label>
                    <input
                      ref={installCodeRef}
                      type="text"
                      value={newInstallCode}
                      onChange={(e) => setNewInstallCode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          saveItem()
                        }
                      }}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>قیمت کل</label>
                    <input
                      type="text"
                      value={newItemPreviewTotal}
                      readOnly
                      tabIndex={-1}
                      className="w-full rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5 text-base font-bold text-teal-800"
                    />
                  </div>
                </div>

                <div className="mt-3 flex justify-end gap-2">
                  {editingItemId && (
                    <button onClick={cancelEditItem} className="rounded-xl border border-gray-300 px-6 py-2.5 text-base font-bold text-blue-900 hover:bg-gray-100 transition">
                      انصراف از ویرایش
                    </button>
                  )}
                  <button
                    onClick={saveItem}
                    className={`rounded-xl px-8 py-2.5 text-base font-bold text-white shadow transition ${
                      editingItemId ? "bg-amber-500 hover:bg-amber-600" : "bg-teal-500 hover:bg-teal-600"
                    }`}
                  >
                    {editingItemId ? "✓ اعمال تغییرات" : "+ افزودن"}
                  </button>
                </div>
              </div>

              {/* جدول اقلام */}
              {items.length > 0 && (
                <div className="rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-3 shadow-lg border border-teal-500/20 overflow-x-auto">
                  <p className="text-xs text-blue-700 mb-2">برای ویرایش روی هر ردیف کلیک کنید. عرض هر ستون از گوشه‌ی آن قابل تغییر دستی است.</p>
                  <table className="w-full text-sm text-blue-900 border-collapse">
                    <thead>
                      <tr className="border-b border-teal-500/30 bg-teal-600 text-white text-right">
                        <th className="p-0 font-bold border border-teal-500 whitespace-nowrap">
                          <div className={`${resizableBoxClass} px-2.5 py-2.5`} style={{ minWidth: "3rem", maxWidth: "10rem" }}>ردیف</div>
                        </th>
                        <th className="p-0 font-bold border border-teal-500 whitespace-nowrap">
                          <div className={`${resizableBoxClass} px-2.5 py-2.5`} style={{ minWidth: "8rem", maxWidth: "20rem" }}>نام کالا</div>
                        </th>
                        <th className="p-0 font-bold border border-teal-500 whitespace-nowrap">
                          <div className={`${resizableBoxClass} px-2.5 py-2.5`} style={{ minWidth: "5rem", maxWidth: "16rem" }}>کد نصب</div>
                        </th>
                        <th className="p-0 font-bold border border-teal-500 whitespace-nowrap">
                          <div className={`${resizableBoxClass} px-2.5 py-2.5`} style={{ minWidth: "3.5rem", maxWidth: "10rem" }}>طول</div>
                        </th>
                        <th className="p-0 font-bold border border-teal-500 whitespace-nowrap">
                          <div className={`${resizableBoxClass} px-2.5 py-2.5`} style={{ minWidth: "3.5rem", maxWidth: "10rem" }}>عرض</div>
                        </th>
                        <th className="p-0 font-bold border border-teal-500 whitespace-nowrap">
                          <div className={`${resizableBoxClass} px-2.5 py-2.5`} style={{ minWidth: "3.5rem", maxWidth: "10rem" }}>تعداد</div>
                        </th>
                        <th className="p-0 font-bold border border-teal-500 whitespace-nowrap">
                          <div className={`${resizableBoxClass} px-2.5 py-2.5`} style={{ minWidth: "5rem", maxWidth: "12rem" }}>متراژ</div>
                        </th>
                        <th className="p-0 font-bold border border-teal-500 whitespace-nowrap">
                          <div className={`${resizableBoxClass} px-2.5 py-2.5`} style={{ minWidth: "4rem", maxWidth: "12rem" }}>محیط</div>
                        </th>
                        <th className="p-0 font-bold border border-teal-500 whitespace-nowrap">
                          <div className={`${resizableBoxClass} px-2.5 py-2.5`} style={{ minWidth: "6rem", maxWidth: "14rem" }}>قیمت واحد</div>
                        </th>
                        <th className="p-0 font-bold border border-teal-500 whitespace-nowrap">
                          <div className={`${resizableBoxClass} px-2.5 py-2.5`} style={{ minWidth: "6rem", maxWidth: "14rem" }}>قیمت کل</div>
                        </th>
                        <th className="p-0 font-bold border border-teal-500 whitespace-nowrap">
                          <div className={`${resizableBoxClass} px-2.5 py-2.5`} style={{ minWidth: "12rem", maxWidth: "26rem" }}>خدمات</div>
                        </th>
                        <th className="p-0 font-bold border border-teal-500 whitespace-nowrap">
                          <div className={`${resizableBoxClass} px-2.5 py-2.5`} style={{ minWidth: "6rem", maxWidth: "20rem" }}>توضیحات</div>
                        </th>
                        <th className="p-0 font-bold border border-teal-500 whitespace-nowrap">
                          <div className={`${resizableBoxClass} px-2.5 py-2.5`} style={{ minWidth: "7rem", maxWidth: "14rem" }}>عملیات</div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, index) => (
                        <tr
                          key={item.id}
                          onClick={() => startEditItem(item)}
                          className={`border-b border-teal-500/10 hover:bg-yellow-50 cursor-pointer transition-colors ${
                            item.flagged ? "bg-orange-100" : "bg-white/40"
                          } ${editingItemId === item.id ? "ring-2 ring-inset ring-amber-400" : ""}`}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            setContextMenu({ x: e.clientX, y: e.clientY, itemId: item.id })
                          }}
                        >
                          <td className="p-2.5 text-center border border-teal-100">{index + 1}</td>
                          <td className="p-2.5 font-bold border border-teal-100 truncate" title={item.productName}>{item.productName}</td>
                          <td className="p-2.5 text-center border border-teal-100 truncate" title={item.installCode}>{item.installCode || "—"}</td>
                          <td className="p-2.5 text-center border border-teal-100">{item.length}</td>
                          <td className="p-2.5 text-center border border-teal-100">{item.width}</td>
                          <td className="p-2.5 text-center font-bold border border-teal-100">{item.quantity}</td>
                          <td className="p-2.5 text-center border border-teal-100">{item.meterage}</td>
                          <td className="p-2.5 text-center border border-teal-100">{item.perimeter || "—"}</td>
                          <td className="p-2.5 text-left border border-teal-100">{formatPrice(item.unitPrice)}</td>
                          <td className="p-2.5 font-bold text-teal-700 text-left border border-teal-100">{item.totalPrice}</td>
                          <td className="p-2.5 border border-teal-100 text-center">
                            <button
                              onClick={(e) => { e.stopPropagation(); openServices(item.id) }}
                              className={`rounded-lg px-2 py-1.5 text-xs font-bold w-full leading-5 whitespace-normal break-words ${
                                item.services.length > 0 ? "bg-amber-500/25 text-amber-900" : "bg-amber-500/15 hover:bg-amber-500/30 text-amber-800"
                              }`}
                              title={item.services.length > 0 ? item.services.map((s) => s.title).join("، ") : "افزودن خدمات"}
                            >
                              {item.services.length > 0 ? item.services.map((s) => s.title).join("، ") : "افزودن"}
                            </button>
                          </td>
                          <td className="p-2.5 border border-teal-100 text-center">
                            <button
                              onClick={(e) => { e.stopPropagation(); openDescriptionModal(item.id) }}
                              className={`rounded-lg px-2 py-1.5 text-xs font-bold w-full leading-5 whitespace-normal break-words text-right ${
                                item.description ? "bg-teal-500/25 text-teal-900" : "bg-teal-500/15 hover:bg-teal-500/30 text-teal-800"
                              }`}
                              title={item.description || "افزودن توضیحات"}
                            >
                              {item.description || "افزودن"}
                            </button>
                          </td>
                          <td className="p-2.5 border border-teal-100">
                            <div className="flex gap-1 justify-center">
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleItemFlag(item.id) }}
                                title="علامت‌گذاری برای بررسی/تغییر بعدی ابعاد"
                                className={`rounded-lg px-2 py-1 text-xs font-bold ${
                                  item.flagged ? "bg-orange-500 text-white" : "bg-orange-500/15 hover:bg-orange-500/30 text-orange-800"
                                }`}
                              >
                                استپ
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); removeItem(item.id) }}
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
                </div>
              )}
            </div>

            {/* دستگیره‌ی تغییر عرض بین دو ستون */}
            <div
              onMouseDown={startPanelsResize}
              title="برای تغییر عرض بکشید"
              className="hidden lg:flex w-4 shrink-0 cursor-col-resize items-center justify-center group select-none"
            >
              <div className="w-1.5 h-20 rounded-full bg-teal-500/30 group-hover:bg-teal-500/60 transition-colors" />
            </div>

            {/* بخش آپلود نقشه */}
            <div className="w-full lg:flex-1 min-w-0">
              <div className="rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-4 shadow-lg border border-teal-500/20 h-full flex flex-col">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <h2 className="text-xl font-bold text-blue-950">تصویر نقشه</h2>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-xl bg-teal-500 hover:bg-teal-600 px-4 py-2 text-sm font-bold text-white whitespace-nowrap"
                    >
                      + افزودن تصویر
                    </button>
                    <button
                      type="button"
                      onClick={() => pdfInputRef.current?.click()}
                      className="rounded-xl bg-red-500 hover:bg-red-600 px-4 py-2 text-sm font-bold text-white whitespace-nowrap"
                    >
                      + افزودن PDF
                    </button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleMapUpload}
                    className="hidden"
                  />
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    multiple
                    onChange={handleMapUpload}
                    className="hidden"
                  />
                </div>

                <div
                  className={`relative rounded-xl bg-white/50 border border-teal-500/20 p-3 ${resizableBoxClass} min-w-[280px] max-w-full overflow-y-auto flex-1`}
                  style={{ width: "100%", minHeight: "260px" }}
                >
                  {mapImages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center py-16">
                      <p className="text-blue-950 font-bold text-lg mb-1">آپلود تصویر نقشه اتوکد</p>
                      <p className="text-sm text-gray-500">چند تصویر می‌توانید اضافه کنید</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {mapImages.map((img) => (
                        <div key={img.id} className="border rounded-lg overflow-hidden bg-white">
                          {img.type === "pdf" ? (
                            <iframe
                              src={img.url}
                              title={img.name}
                              className="w-full h-[420px] cursor-pointer"
                              onClick={() => setPreviewFile({ url: img.url, type: "pdf" })}
                            />
                          ) : (
                            <img
                              src={img.url}
                              alt={img.name}
                              className="w-full h-auto object-contain cursor-pointer"
                              onClick={() => setPreviewFile({ url: img.url, type: "image" })}
                            />
                          )}
                          <div className="flex items-center justify-between px-3 py-2 bg-teal-50/60 border-t border-teal-100 gap-2">
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => removeMapImage(img.id)}
                                className="rounded-lg bg-red-500/15 hover:bg-red-500/30 px-3 py-1 text-xs font-bold text-red-700"
                              >
                                حذف
                              </button>
                              {img.type === "pdf" && (
                                <button
                                  onClick={() => setPreviewFile({ url: img.url, type: "pdf" })}
                                  className="rounded-lg bg-teal-500/15 hover:bg-teal-500/30 px-3 py-1 text-xs font-bold text-teal-800"
                                >
                                  تمام‌صفحه
                                </button>
                              )}
                            </div>
                            <span className="text-xs font-bold text-teal-800 truncate max-w-[50%]">{img.name}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">می‌توانید گوشه پایین-چپ کادر را بگیرید و عرض را تغییر دهید</p>
              </div>
            </div>

            {/* راست‌کلیک */}
            {contextMenu && (
              <div className="fixed z-[300] min-w-[220px] rounded-xl bg-white shadow-2xl border border-teal-200 py-2" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
                <button onClick={() => copyServicesToOthers(contextMenu.itemId)} className="w-full text-right px-4 py-3 text-base font-bold text-blue-900 hover:bg-yellow-100">
                  کپی سختی کار به قطعات دیگر
                </button>
                <button onClick={() => setContextMenu(null)} className="w-full text-right px-4 py-2 text-sm text-gray-500 hover:bg-gray-50">بستن</button>
              </div>
            )}

            {/* نوار پایین */}
            {items.length > 0 && (
              <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-teal-500/30 shadow-lg">
                <div className="max-w-[1920px] mx-auto px-5 py-3 flex flex-wrap items-center justify-between gap-y-2">
                  <div className="text-sm md:text-base font-bold text-blue-900 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span>تعداد کل: <span className="text-teal-700">{calculatedTotalQuantity}</span></span>
                    <span className="text-gray-300">|</span>
                    <span>متراژ کل: <span className="text-teal-700">{calculatedTotalMeterage}</span></span>
                    <span className="text-gray-300">|</span>
                    <span>محیط کل: <span className="text-teal-700">{calculatedTotalPerimeter}</span></span>
                    <span className="text-gray-300">|</span>
                    <span>مبلغ کل: <span className="text-teal-700 text-lg">{grandTotal.toLocaleString("en-US")}</span> ریال</span>
                  </div>
                  <button onClick={() => setShowInvoice(true)} className="rounded-xl bg-teal-600 hover:bg-teal-700 px-6 py-2.5 text-base font-bold text-white">
                    نمایش پیش‌فاکتور
                  </button>
                </div>
              </div>
            )}

            {/* پیش‌نمایش تصویر */}
            {previewFile && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90" onClick={() => setPreviewFile(null)}>
                {previewFile.type === "pdf" ? (
                  <iframe
                    src={previewFile.url}
                    title="پیش‌نمایش PDF"
                    className="w-[95vw] h-[95vh] bg-white rounded-lg"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <img src={previewFile.url} alt="پیش‌نمایش" className="max-h-[95vh] max-w-[95vw] object-contain" onClick={(e) => e.stopPropagation()} />
                )}
                <button onClick={() => setPreviewFile(null)} className="absolute top-5 left-5 rounded-full bg-white/20 text-white text-2xl w-12 h-12 flex items-center justify-center">✕</button>
              </div>
            )}

            {/* مودال نصب */}
            {showInstallModal && (
              <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl p-6">
                  <h3 className="text-xl font-bold text-blue-950 mb-4">اطلاعات نصب</h3>
                  <div className="space-y-4">
                    <div>
                      <label className={labelClass}>تاریخ نصب</label>
                      <DatePicker value={installDate} onChange={setInstallDate} calendar={persian} locale={persian_fa} inputClass={inputClass} portal zIndex={1100} placeholder="انتخاب تاریخ" />
                    </div>
                    <div>
                      <label className={labelClass}>آدرس محل نصب</label>
                      <textarea value={installAddress} onChange={(e) => setInstallAddress(e.target.value)} rows={2} className={inputClass + " resize-none"} />
                    </div>
                    <div>
                      <label className={labelClass}>شماره تماس مسئول در محل</label>
                      <input type="text" value={installPhone} onChange={(e) => setInstallPhone(e.target.value)} className={inputClass} placeholder="۰۹۱۲..." />
                    </div>
                    <div>
                      <label className={labelClass}>توضیحات نصب</label>
                      <textarea value={installNotes} onChange={(e) => setInstallNotes(e.target.value)} rows={2} className={inputClass + " resize-none"} placeholder="طبقه، داربست، ساعت مناسب..." />
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 mt-6">
                    <button onClick={() => { setShowInstallModal(false); if (!installDate) setHasInstallation(false) }} className="rounded-xl border border-gray-300 px-5 py-2.5 text-base font-bold text-blue-900">انصراف</button>
                    <button onClick={() => setShowInstallModal(false)} className="rounded-xl bg-teal-500 hover:bg-teal-600 px-5 py-2.5 text-base font-bold text-white">تأیید</button>
                  </div>
                </div>
              </div>
            )}

            {/* پاپ‌آپ تخفیف دستی (وارد کردن مبلغ تخفیف) */}
            {showManualDiscountModal && (
              <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.stopPropagation()}>
                <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6">
                  <h3 className="text-xl font-bold text-blue-950 mb-4">مبلغ تخفیف</h3>
                  <div>
                    <label className={labelClass}>مبلغ تخفیف (ریال)</label>
                    <input
                      type="text"
                      autoFocus
                      value={manualDiscountAmount}
                      onChange={(e) => setManualDiscountAmount(formatWithCommas(e.target.value))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          setShowManualDiscountModal(false)
                        }
                      }}
                      className={inputClass}
                      placeholder="مثلاً 500,000"
                    />
                    <p className="text-xs mt-1 text-blue-600">
                      معادل تقریبی: {discountDisplayPercent}٪ از مبلغ کل
                    </p>
                  </div>
                  <div className="flex justify-end gap-3 mt-6">
                    <button
                      onClick={() => {
                        setShowManualDiscountModal(false)
                        if (!manualDiscountAmount) setHasDiscount(false)
                      }}
                      className="rounded-xl border border-gray-300 px-5 py-2.5 text-base font-bold text-blue-900"
                    >
                      انصراف
                    </button>
                    <button
                      onClick={() => setShowManualDiscountModal(false)}
                      className="rounded-xl bg-teal-500 hover:bg-teal-600 px-5 py-2.5 text-base font-bold text-white"
                    >
                      تأیید
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* پاپ‌آپ توضیحات قلم */}
            {showDescriptionModal && (
              <div className="fixed inset-0 z-[155] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl p-6">
                  <h3 className="text-xl font-bold text-blue-950 mb-4">توضیحات قلم</h3>

                  {currentDescItem && (
                    <div className="mb-4 rounded-xl bg-teal-50 border border-teal-200 px-4 py-3 text-sm">
                      <span className="font-bold text-blue-900">قلم: </span>
                      {currentDescItem.productName}
                      <span className="mx-2 text-teal-600">|</span>
                      طول: <strong>{currentDescItem.length}</strong> × عرض: <strong>{currentDescItem.width}</strong>
                    </div>
                  )}

                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <label className={labelClass}>توضیحات</label>
                    <input
                      type="text"
                      value={modalDescriptionSearch}
                      onChange={(e) => {
                        setModalDescriptionSearch(e.target.value)
                        setModalDescription(e.target.value)
                        setShowModalDescDropdown(true)
                      }}
                      onFocus={() => setShowModalDescDropdown(true)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          saveDescription()
                        }
                      }}
                      placeholder="جستجو یا وارد کردن توضیحات..."
                      className={inputClass}
                      autoFocus
                    />
                    {showModalDescDropdown && filteredModalDescriptions.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-teal-200 bg-white shadow-2xl">
                        {filteredModalDescriptions.map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => {
                              setModalDescription(d)
                              setModalDescriptionSearch(d)
                              setShowModalDescDropdown(false)
                            }}
                            className="w-full text-right px-4 py-2.5 text-sm font-bold text-blue-900 hover:bg-yellow-100 border-b border-teal-50"
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-3 mt-6">
                    <button onClick={() => setShowDescriptionModal(false)} className="rounded-xl border border-gray-300 px-5 py-2.5 text-base font-bold text-blue-900">انصراف</button>
                    <button onClick={saveDescription} className="rounded-xl bg-teal-500 hover:bg-teal-600 px-5 py-2.5 text-base font-bold text-white">تأیید</button>
                  </div>
                </div>
              </div>
            )}

            {/* مودال خدمات کامل */}
            {showServices && (
              <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
                  <h3 className="mb-4 text-2xl font-bold text-blue-950">خدمات (سختی کار)</h3>

                  {currentItem && (
                    <div className="mb-4 rounded-xl bg-teal-50 border border-teal-200 px-4 py-3 text-base">
                      <span className="font-bold text-blue-900">قلم: </span>
                      {currentItem.productName}
                      <span className="mx-2 text-teal-600">|</span>
                      طول: <strong>{currentItem.length}</strong> × عرض: <strong>{currentItem.width}</strong>
                      <span className="mx-2 text-teal-600">|</span>
                      متراژ: {currentItem.meterage}
                    </div>
                  )}

                  <div className="mb-4">
                    <input
                      type="text"
                      value={serviceSearch}
                      onChange={(e) => setServiceSearch(e.target.value)}
                      onKeyDown={(e) => handleEnter(e, svcTitleRef)}
                      placeholder="جستجوی خدمت..."
                      className="w-full rounded-xl border border-teal-500/40 px-4 py-3.5 text-lg font-semibold text-blue-950 focus:border-teal-500 focus:outline-none hover:bg-yellow-100 transition-colors"
                    />
                  </div>

                  {serviceSearch.trim() !== "" && (
                    <div className="mb-4 max-h-52 overflow-y-auto rounded-xl border border-teal-200 bg-teal-50 p-3">
                      <div className="flex flex-col gap-1.5">
                        {allFilteredServices.length > 0 ? (
                          allFilteredServices.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => {
                                setSvcTitle(s)
                                setServiceSearch("")
                              }}
                              className="w-full text-right rounded-lg bg-white border border-teal-300 px-3 py-2.5 text-base font-bold text-blue-900 hover:bg-yellow-100 transition"
                            >
                              {s}
                            </button>
                          ))
                        ) : (
                          <span className="text-blue-600 text-base">موردی پیدا نشد</span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="mb-5 rounded-xl bg-teal-50 p-5 border border-teal-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className={labelClass}>عنوان خدمت</label>
                        <select
                          ref={svcTitleRef}
                          value={svcTitle}
                          onChange={(e) => setSvcTitle(e.target.value)}
                          onKeyDown={(e) => handleEnter(e, svcUnitRef)}
                          className={selectClass}
                        >
                          <option value="">انتخاب خدمت...</option>
                          {Object.entries(serviceCategories).map(([cat, list]) => (
                            <optgroup key={cat} label={cat}>
                              {list.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>واحد</label>
                        <select
                          ref={svcUnitRef}
                          value={svcUnit}
                         onChange={(e) => {
    const newUnit = e.target.value
    setSvcUnit(newUnit)
    if (newUnit === "محیط" || newUnit === "مترمربع" || newUnit === "چند طول چند عرض" || newUnit === "ابعاد دایره") {
      // مقدار محاسبه شده را در فیلد دستی هم می‌ریزیم تا قابل ویرایش باشد
      setTimeout(() => setSvcUnitQuantity(calculatedUnitQuantity), 0)
    } else {
      setSvcUnitQuantity("")
    }
  }}
                          onKeyDown={(e) => handleEnter(e, svcCountRef)}
                          className={selectClass}
                        >
                          {serviceUnits.map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className={labelClass}>تعداد</label>
                        <input
                          ref={svcCountRef}
                          type="number"
                          value={svcCount}
                          onChange={(e) => setSvcCount(e.target.value)}
                          onKeyDown={(e) => handleEnter(e, svcCountNextRef())}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>تعداد واحد</label>
                        {svcUnit === "مترمربع" || svcUnit === "چند طول چند عرض" ? (
    <input
      type="text"
      value={calculatedUnitQuantity}
      readOnly
      tabIndex={-1}
      className="w-full rounded-xl border border-teal-200 bg-teal-100 px-3 py-3 text-base font-bold text-blue-800"
    />
  ) : (
    <input
      ref={svcUnitQuantityRef}
      type="number"
      value={svcUnit === "محیط" && !svcUnitQuantity ? calculatedUnitQuantity : svcUnitQuantity}
      onChange={(e) => setSvcUnitQuantity(e.target.value)}
      onKeyDown={(e) => handleEnter(e, svcUnitPriceRef)}
      className={inputClass}
    />
  )}
                        {svcUnit === "ابعاد دایره" && (
                          <div className="mb-4 rounded-xl bg-white border border-teal-200 p-4">
                            <label className="mb-1 block text-sm font-bold text-blue-900">قطر دایره (سانتی‌متر)</label>
                            <input
                              ref={svcDiameterRef}
                              type="number"
                              value={svcDiameter}
                              onChange={(e) => setSvcDiameter(e.target.value)}
                              onKeyDown={(e) => handleEnter(e, svcUnitPriceRef)}
                              className={inputClass}
                              placeholder="مثلاً ۱۲۰"
                            />
                            <p className="text-sm text-blue-700 mt-2">
                              محیط دایره = ۳.۱۴ × قطر = <strong>{calculatedUnitQuantity} متر</strong>
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {svcUnit === "چند طول چند عرض" && currentItem && (
                      <div className="mb-4 rounded-xl bg-white border border-teal-200 p-4">
                        <p className="text-base font-bold text-blue-900 mb-3">
                          ابعاد قلم: طول <span className="text-teal-700">{currentItem.length}</span> × عرض{" "}
                          <span className="text-teal-700">{currentItem.width}</span>
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="mb-1 block text-sm font-bold text-blue-900">تعداد طول</label>
                            <input
                              ref={svcLengthCountRef}
                              type="number"
                              value={svcLengthCount}
                              onChange={(e) => setSvcLengthCount(e.target.value)}
                              onKeyDown={(e) => handleEnter(e, svcWidthCountRef)}
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-sm font-bold text-blue-900">تعداد عرض</label>
                            <input
                              ref={svcWidthCountRef}
                              type="number"
                              value={svcWidthCount}
                              onChange={(e) => setSvcWidthCount(e.target.value)}
                              onKeyDown={(e) => handleEnter(e, svcUnitPriceRef)}
                              className={inputClass}
                            />
                          </div>
                        </div>
                        <p className="text-sm text-blue-700 mt-2">
                          محاسبه: ({svcLengthCount} × {(parseFloat(currentItem.length) / 100).toFixed(2)}) + (
                          {svcWidthCount} × {(parseFloat(currentItem.width) / 100).toFixed(2)}) ={" "}
                          <strong>{calculatedUnitQuantity} متر</strong>
                        </p>
                      </div>
                    )}

                    <div className="mb-4">
                      <label className={labelClass}>قیمت واحد</label>
                      <input
                        ref={svcUnitPriceRef}
                        type="text"
                        value={svcUnitPrice}
                        onChange={(e) => setSvcUnitPrice(formatWithCommas(e.target.value))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            addOrUpdateService()
                          }
                        }}
                        className={inputClass}
                        placeholder=""
                      />
                    </div>

                    <div className="flex items-center justify-between bg-white rounded-lg p-3.5 border border-teal-200 mb-3">
                      <span className="text-base font-bold text-blue-900">قیمت کل این خدمت:</span>
                      <span className="text-xl font-bold text-teal-700">{serviceTotalPreview} ریال</span>
                    </div>

                    <p className="text-sm text-blue-600 mb-3">فرمول: تعداد × تعداد واحد × قیمت واحد</p>

                    <button
                      onClick={addOrUpdateService}
                      className={`w-full rounded-xl py-3.5 text-lg font-bold text-white transition ${
                        editingServiceId ? "bg-amber-500 hover:bg-amber-600" : "bg-teal-500 hover:bg-teal-600"
                      }`}
                    >
                      {editingServiceId ? "✓ اعمال تغییرات" : "+ افزودن خدمت"}
                    </button>

                    {editingServiceId && (
                      <button
                        onClick={() => {
                          setEditingServiceId(null)
                          setSvcTitle("")
                          setSvcCount("1")
                          setSvcUnitQuantity("")
                          setSvcUnitPrice("")
                          setSvcLengthCount("1")
                          setSvcWidthCount("1")
                        }}
                        className="w-full mt-2 rounded-xl border border-gray-300 py-2.5 text-base font-bold text-blue-900 hover:bg-gray-100 transition"
                      >
                        انصراف از ویرایش
                      </button>
                    )}
                  </div>

                  {tempServices.length > 0 ? (
                    <div className="mb-5">
                      <h4 className="text-lg font-bold text-blue-900 mb-3">
                        خدمات اضافه شده: (برای ویرایش روی ردیف کلیک کنید)
                      </h4>
                      <table className="w-full text-base">
                        <thead>
                          <tr className="bg-teal-100 text-right">
                            <th className="p-3 font-bold">عنوان</th>
                            <th className="p-3 font-bold">واحد</th>
                            <th className="p-3 font-bold">تعداد</th>
                            <th className="p-3 font-bold">تعداد واحد</th>
                            <th className="p-3 font-bold">قیمت واحد</th>
                            <th className="p-3 font-bold">قیمت کل</th>
                            <th className="p-3 font-bold">حذف</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tempServices.map((s) => (
                            <tr
                              key={s.id}
                              onClick={() => {
                                setEditingServiceId(s.id)
                                setSvcTitle(s.title)
                                setSvcUnit(s.unit)
                                setSvcCount(s.count || "1")
                                setSvcUnitQuantity(s.unitQuantity || "")
                                setSvcUnitPrice(s.unitPrice)
                                setSvcLengthCount(s.lengthCount || "1")
                                setSvcWidthCount(s.widthCount || "1")
                              }}
                              className={`border-b border-teal-100 cursor-pointer transition-colors ${
                                editingServiceId === s.id ? "bg-amber-100" : "hover:bg-yellow-50"
                              }`}
                            >
                              <td className="p-3 font-semibold">{s.title}</td>
                              <td className="p-3">{s.unit}</td>
                              <td className="p-3">{s.count}</td>
                            <td className="p-3">
    {["مترمربع", "محیط", "چند طول چند عرض", "ابعاد دایره", "مترطول", "عددی"].includes(s.unit)
      ? s.unitQuantity
      : "—"}
  </td>
  <td className="p-3">{formatPrice(s.unitPrice)}</td>
  <td className="p-3 font-bold text-teal-700">{s.totalPrice}</td>
                              <td className="p-3">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    removeService(s.id)
                                  }}
                                  className="text-red-600 font-bold hover:underline"
                                >
                                  حذف
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-center text-blue-500 py-6 text-lg font-semibold">هنوز خدمتی اضافه نشده</p>
                  )}

                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => setShowServices(false)}
                      className="rounded-xl border border-gray-300 px-7 py-3.5 text-lg font-bold text-blue-900 hover:bg-gray-100 transition"
                    >
                      انصراف
                    </button>
                    <button
                      onClick={saveServices}
                      className="rounded-xl bg-teal-500 px-7 py-3.5 text-lg font-bold text-white hover:bg-teal-600 transition"
                    >
                      تأیید و اعمال
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* مودال پیش‌فاکتور (نسخه‌ی روی صفحه - در چاپ کلاً مخفی می‌شود) */}
            {showInvoice && (
              <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/60 p-4 print:hidden">
                <div className="w-full max-w-5xl max-h-[94vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">

                  {/* هدر کنترل‌ها */}
                  <div className="sticky top-0 z-10 flex items-center justify-between bg-teal-700 text-white px-5 py-3 rounded-t-2xl flex-wrap gap-y-2">
                    <div className="flex gap-3 items-center">
                      <h3 className="text-lg font-bold">پیش فاکتور</h3>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setInvoiceMode("detailed")}
                          className={`rounded-lg px-3 py-1 text-sm font-bold ${invoiceMode === "detailed" ? "bg-white text-teal-800" : "bg-white/20"}`}
                        >
                          جزئی
                        </button>
                        <button
                          onClick={() => setInvoiceMode("summary")}
                          className={`rounded-lg px-3 py-1 text-sm font-bold ${invoiceMode === "summary" ? "bg-white text-teal-800" : "bg-white/20"}`}
                        >
                          کلی
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2 items-center flex-wrap">
                      {/* تخفیف: می‌تواند درصدی (پاپ‌آپ انتخاب درصد ۳ تا ۱۵) یا دستی (پاپ‌آپ وارد کردن مبلغ) باشد */}
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={hasDiscount}
                            onChange={(e) => {
                              setHasDiscount(e.target.checked)
                              if (e.target.checked) {
                                if (discountMode === "manual") {
                                  setShowManualDiscountModal(true)
                                } else {
                                  setShowDiscountMenu(true)
                                }
                              } else {
                                setShowDiscountMenu(false)
                                setShowManualDiscountModal(false)
                              }
                            }}
                            className="accent-white"
                          />
                          تخفیف {hasDiscount && (discountMode === "percent" ? `(${discountPercent}٪)` : `(${discountDisplayPercent}٪)`)}
                        </label>
                        {showDiscountMenu && (
                          <div className="absolute top-8 left-0 z-50 bg-white rounded-xl shadow-2xl border border-teal-200 p-2 w-52">
                            <div className="flex gap-1 mb-2">
                              <button
                                type="button"
                                onClick={() => setDiscountMode("percent")}
                                className={`flex-1 rounded-lg px-2 py-1 text-xs font-bold ${
                                  discountMode === "percent" ? "bg-teal-600 text-white" : "bg-teal-50 text-teal-800 hover:bg-teal-100"
                                }`}
                              >
                                درصدی
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDiscountMode("manual")
                                  setShowDiscountMenu(false)
                                  setShowManualDiscountModal(true)
                                }}
                                className={`flex-1 rounded-lg px-2 py-1 text-xs font-bold ${
                                  discountMode === "manual" ? "bg-teal-600 text-white" : "bg-teal-50 text-teal-800 hover:bg-teal-100"
                                }`}
                              >
                                مبلغ دستی
                              </button>
                            </div>
                            <div className="grid grid-cols-3 gap-1">
                              {discountOptions.map((p) => (
                                <button
                                  key={p}
                                  type="button"
                                  onClick={() => {
                                    setDiscountMode("percent")
                                    setDiscountPercent(p)
                                    setShowDiscountMenu(false)
                                  }}
                                  className={`rounded-lg px-2 py-1.5 text-sm font-bold ${
                                    discountMode === "percent" && discountPercent === p ? "bg-teal-600 text-white" : "bg-teal-50 text-teal-800 hover:bg-teal-100"
                                  }`}
                                >
                                  {p}٪
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isOfficialInvoice}
                          onChange={(e) => setIsOfficialInvoice(e.target.checked)}
                          className="accent-white"
                        />
                        فاکتور رسمی (+۱۰٪)
                      </label>
                      <button onClick={() => window.print()} className="rounded-lg bg-white/20 px-3 py-1.5 text-sm font-bold">
                        چاپ
                      </button>
                      <button onClick={() => setShowInvoice(false)} className="rounded-lg bg-white/20 px-3 py-1.5 text-sm font-bold">
                        بستن
                      </button>
                    </div>
                  </div>

                  {renderInvoiceContent()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/*
        نسخه‌ی مخصوص چاپ پیش‌فاکتور.
        این بلوک خارج از دیو اصلی صفحه (که overflow-hidden و بک‌گراند fixed دارد) قرار گرفته
        تا هنگام چاپ هیچ کانتینر overflow-hidden یا position:fixed محتوای چندصفحه‌ای را نبرد.
        روی صفحه دیده نمی‌شود (hidden) و فقط هنگام چاپ نمایش داده می‌شود (print:block).
      */}
      {showInvoice && (
        <div className="hidden print:block bg-white">
          {renderInvoiceContent()}
        </div>
      )}

      <style jsx global>{`
        @media print {
          @page {
            margin: 0;
          }
          html, body {
            background: white !important;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #invoice-print-area {
            min-height: 0 !important;
          }
          table {
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </>
  )
}
