import { prisma } from "@/lib/prisma"
import { getAll, sepidarGet, extractList } from "./client"
import productsSeedRaw from "@/app/products/products-seed.json"
import servicesSeedRaw from "@/app/services/services-seed.json"

// ═══════════════════════════════════════════════════════════════
//  بخش ۱: نگاشت کالا به آیتم سپیدار
// ═══════════════════════════════════════════════════════════════

const ITEMS_PATH = "/api/sepidar/v1/Inventory/GetAllItems"
// getAll خودش سقف ۵۰۰۰ ردیف دارد (محدودیت سپیدار روی Page)؛ عدد زیر فقط بالاترین مقدار مجاز است
const ITEMS_MAX_PAGES = 100
const ITEMS_CAP = 5000
const CACHE_MS = 30 * 60_000

// شناسه‌ی حساب معین «حساب‌های دریافتنی» (کد ۱۱۱۲۰۱) در سپیدار؛ همه‌ی فاکتورهای فروش روی همین حساب می‌روند.
// با SEPIDAR_SL_REF در .env قابل تغییر است.
const RECEIVABLE_SL_REF = 420

function latinDigits(s: string) {
  return (s || "")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
}

// نرمال‌سازی نام: ي/ك عربی، نیم‌فاصله، ارقام فارسی/عربی، فاصله‌های اضافه
export function normName(s: string) {
  return latinDigits(s || "")
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

// کلید مقایسه: بدون فاصله و علائم (ولی نقطه‌ی اعشار حفظ می‌شود تا «2.2 میل» با «22 میل» یکی نشود)
// «4 میل برنز» و «4میل برنز» و «۴ ميل برنز» همگی یک کلید می‌شوند
export const nameKey = (s: string) => normName(s).replace(/[\s,،؛:;()\-_/\\]/g, "")

const itemIdOf = (it: any): number | null => {
  const v = it?.ItemID ?? it?.ItemId ?? it?.itemID ?? it?.itemId ?? it?.Id ?? it?.id
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}
const codeOf = (it: any) => latinDigits(String(it?.Code ?? it?.code ?? "")).trim()
const titleOf = (it: any) => String(it?.Title ?? it?.title ?? it?.Name ?? it?.name ?? "")

// ───────────── نام → کد (از فایل‌های seed کالا و خدمات) ─────────────
// ردیف سفارش کد کالا را ذخیره نمی‌کند؛ ولی نام‌ها از همین فایل‌ها آمده‌اند و کد کالا
// در نرم‌افزار و سپیدار یکی است. اگر یک نام با دو کد مختلف باشد (مبهم)، مقدار null می‌شود.
function buildCodeByName(list: any[]) {
  const m = new Map<string, string | null>()
  for (const x of list) {
    const k = nameKey(String(x?.name ?? ""))
    const c = latinDigits(String(x?.code ?? "")).trim()
    if (!k || !c) continue
    if (!m.has(k)) m.set(k, c)
    else if (m.get(k) !== c) m.set(k, null)
  }
  return m
}
const productCodeByName = buildCodeByName(productsSeedRaw as unknown as any[])
const serviceCodeByName = buildCodeByName(servicesSeedRaw as unknown as any[])

// ───────────── فهرست آیتم‌های سپیدار (کش ۳۰ دقیقه‌ای) ─────────────
type ItemIndex = {
  at: number
  list: any[]
  byCode: Map<string, any>
  byKey: Map<string, any[]>
}

let itemIndex: ItemIndex | null = null
let itemIndexInflight: Promise<ItemIndex> | null = null

async function loadItemIndex(force = false): Promise<ItemIndex> {
  if (!force && itemIndex && Date.now() - itemIndex.at < CACHE_MS) return itemIndex
  if (!itemIndexInflight) {
    itemIndexInflight = (async () => {
      const list = await getAll(ITEMS_PATH, {}, ITEMS_MAX_PAGES)
      const byCode = new Map<string, any>()
      const byKey = new Map<string, any[]>()
      for (const it of list) {
        const c = codeOf(it)
        if (c && !byCode.has(c)) byCode.set(c, it)
        const k = nameKey(titleOf(it))
        if (!k) continue
        const arr = byKey.get(k)
        if (arr) arr.push(it)
        else byKey.set(k, [it])
      }
      itemIndex = { at: Date.now(), list, byCode, byKey }
      return itemIndex
    })().finally(() => {
      itemIndexInflight = null
    })
  }
  return itemIndexInflight
}

// اگر کالا در ۵۰۰۰ ردیف اول نبود، یک بار با فیلتر Code می‌پرسیم.
// حتی اگر سپیدار فیلتر را نادیده بگیرد، فقط وقتی قبول می‌کنیم که Code دقیقاً برابر باشد.
async function lookupByCode(code: string) {
  try {
    const data = await sepidarGet(ITEMS_PATH, { Code: code, Page: 1, ItemCount: 50 })
    return extractList(data).find((it) => codeOf(it) === code) ?? null
  } catch {
    return null
  }
}

function suggest(list: any[], name: string) {
  const mine = new Set(normName(name).split(" ").filter(Boolean))
  if (!mine.size) return []
  return list
    .map((it) => {
      const theirs = normName(titleOf(it)).split(" ").filter(Boolean)
      const shared = theirs.filter((t) => mine.has(t)).length
      return { it, score: shared / Math.max(mine.size, theirs.length || 1) }
    })
    .filter((x) => x.score > 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => `${titleOf(x.it)} (کد ${codeOf(x.it)}، شناسه ${itemIdOf(x.it) ?? "؟"})`)
}

export type ResolvedItem = {
  itemRef: number
  stockRef: number | null
  via: "map" | "code" | "name" | "code-lookup"
}

/**
 * نگاشت کالا/خدمت نرم‌افزار → آیتم سپیدار.
 * ترتیب: ۱) ردیف ذخیره‌شده در SepidarItemMap  ۲) کد کالا  ۳) نام نرمال‌شده  ۴) جستجوی مستقیم با کد
 * هر چه پیدا شود در SepidarItemMap ذخیره می‌شود تا دفعه‌ی بعد مستقیم از دیتابیس خوانده شود.
 */
export async function createItemResolver() {
  const maps = (await prisma.sepidarItemMap.findMany()) as any[]
  const mapByKey = new Map<string, any>()
  for (const m of maps) {
    if (Number(m.itemRef) > 0) mapByKey.set(nameKey(m.productName), m)
  }

  async function persist(name: string, itemRef: number) {
    const row = { productName: name, itemRef, stockRef: null as number | null }
    try {
      const created = await prisma.sepidarItemMap.create({
        data: { productName: name, itemRef } as any,
      })
      mapByKey.set(nameKey(name), created)
    } catch (e) {
      // مثلاً ردیف هم‌زمان توسط درخواست دیگری ساخته شده؛ برای همین فاکتور همان مقدار را استفاده می‌کنیم
      console.error("SepidarItemMap: ذخیره‌ی نگاشت خودکار ممکن نشد", e)
      mapByKey.set(nameKey(name), row)
    }
  }

  return async function resolve(
    productName: string,
    productCode?: string | null
  ): Promise<ResolvedItem> {
    const key = nameKey(productName)

    // ۱) نگاشت ذخیره‌شده
    const saved = mapByKey.get(key)
    if (saved) {
      return { itemRef: Number(saved.itemRef), stockRef: saved.stockRef ?? null, via: "map" }
    }

    const index = await loadItemIndex()
    const code = latinDigits(String(productCode || "")).trim()

    // ۲) با کد کالا (کد کالا در نرم‌افزار و سپیدار یکی است)
    if (code) {
      const hit = index.byCode.get(code)
      const id = hit ? itemIdOf(hit) : null
      if (id) {
        await persist(productName, id)
        return { itemRef: id, stockRef: null, via: "code" }
      }
    }

    // ۳) با نام نرمال‌شده، فقط اگر دقیقاً یک آیتم با همین نام باشد
    const byName = index.byKey.get(key)
    if (byName && byName.length === 1) {
      const id = itemIdOf(byName[0])
      if (id) {
        await persist(productName, id)
        return { itemRef: id, stockRef: null, via: "name" }
      }
    }
    if (byName && byName.length > 1) {
      throw new Error(
        `برای «${productName}» چند آیتم هم‌نام در سپیدار هست (${byName
          .map((it) => `کد ${codeOf(it)}`)
          .join("، ")}). کد کالا روی سفارش ثبت نشده تا بشود بینشان انتخاب کرد؛ نگاشت را دستی در SepidarItemMap وارد کنید.`
      )
    }

    // ۴) جستجوی مستقیم با کد (برای کالاهای بعد از ۵۰۰۰ ردیف اول)
    if (code) {
      const hit = await lookupByCode(code)
      const id = hit ? itemIdOf(hit) : null
      if (id) {
        await persist(productName, id)
        return { itemRef: id, stockRef: null, via: "code-lookup" }
      }
    }

    const near = suggest(index.list, productName)
    throw new Error(
      `کالای «${productName}»${code ? ` (کد ${code})` : ""} در سپیدار پیدا نشد.` +
        (near.length ? ` نزدیک‌ترین‌ها: ${near.join("، ")}.` : "") +
        (index.list.length >= ITEMS_CAP
          ? " توجه: فهرست سپیدار به سقف ۵۰۰۰ ردیف رسیده و ممکن است ناقص خوانده شده باشد."
          : "")
    )
  }
}

/**
 * پر کردن یک‌جای SepidarItemMap از روی همه‌ی آیتم‌های سپیدار (کالا و خدمت).
 * apply=false فقط پیش‌نمایش می‌دهد و چیزی نمی‌نویسد.
 */
export async function syncItemMap(apply: boolean) {
  const index = await loadItemIndex(true)
  const existing = (await prisma.sepidarItemMap.findMany()) as any[]
  const existingByKey = new Map<string, any>()
  for (const m of existing) existingByKey.set(nameKey(m.productName), m)

  const toCreate: { productName: string; itemRef: number }[] = []
  const ambiguous: string[] = []
  const mismatched: { productName: string; saved: number; sepidar: number }[] = []
  let noId = 0

  for (const [key, arr] of index.byKey) {
    const have = existingByKey.get(key)
    if (arr.length > 1) {
      ambiguous.push(titleOf(arr[0]).trim())
      continue
    }
    const id = itemIdOf(arr[0])
    if (!id) {
      noId++
      continue
    }
    if (have) {
      // نگاشت موجود را دست نمی‌زنیم؛ فقط اگر با سپیدار فرق داشت گزارش می‌دهیم
      if (Number(have.itemRef) !== id) {
        mismatched.push({ productName: have.productName, saved: Number(have.itemRef), sepidar: id })
      }
      continue
    }
    toCreate.push({ productName: titleOf(arr[0]).trim(), itemRef: id })
  }

  let created = 0
  if (apply) {
    for (let i = 0; i < toCreate.length; i += 500) {
      const chunk = toCreate.slice(i, i + 500)
      await prisma.sepidarItemMap.createMany({ data: chunk as any })
      created += chunk.length
    }
  }

  return {
    applied: apply,
    sepidarItems: index.list.length,
    possiblyTruncated: index.list.length >= ITEMS_CAP,
    alreadyMapped: existing.length,
    toCreate: toCreate.length,
    created,
    ambiguousCount: ambiguous.length,
    ambiguousSample: ambiguous.slice(0, 30),
    mismatchedCount: mismatched.length,
    mismatchedSample: mismatched.slice(0, 30),
    withoutId: noId,
  }
}

// ═══════════════════════════════════════════════════════════════
//  بخش ۲: ساخت بدنه‌ی فاکتور سپیدار
// ═══════════════════════════════════════════════════════════════

type InvoiceItem = {
  itemRef: number
  quantity: number
  secondaryQuantity: number | null
  fee: number
  price: number
  discount: number
  tax: number
  duty: number
  tracingTitle: string
  stockRef: number | null
  description: string
}

const parsePrice = (v: unknown) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0

function parseServices(raw: unknown): any[] {
  if (!raw) return []
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// تاریخ فاکتور به وقت تهران و بدون ساعت (مثل فاکتورهای سیستم قبلی: yyyy-MM-ddT00:00:00).
// با toISOString ساعت به UTC تبدیل می‌شد و فاکتورهای بین ۰۰:۰۰ تا ۰۳:۳۰ بامداد یک روز عقب می‌افتادند.
function tehranDateOnly(d: Date) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
  return `${day}T00:00:00`
}

export async function buildCreateInvoicePayload(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      items: { orderBy: { sortOrder: "asc" } },
    },
  })

  if (!order) throw new Error("سفارش یافت نشد")
  if (order.status !== "فاکتور") {
    throw new Error("فقط فاکتور قطعی قابل ارسال به سپیدار است")
  }

  const settings =
    (await prisma.sepidarSettings.findUnique({ where: { id: "default" } })) ||
    (await prisma.sepidarSettings.create({
      data: { id: "default", mockMode: true },
    }))

  const isReal = process.env.SEPIDAR_MOCK === "false"

  if (!settings.saleTypeRef) {
    // در حالت mock مقدار پیش‌فرض می‌گذاریم
    if (isReal) {
      throw new Error(
        "saleTypeRef در تنظیمات سپیدار خالی است. بعد از توکن از GetAllSaleTypes پر کنید."
      )
    }
  }

  // حالت واقعی: نگاشت خودکار با نگاشت ذخیره‌شده، کد کالا و نام
  const resolveItem = isReal ? await createItemResolver() : null

  // حالت آزمایشی: فقط جدول نگاشت (بدون تماس با سپیدار)
  const mockMaps = isReal ? [] : await prisma.sepidarItemMap.findMany()
  const mockMapByKey = new Map(mockMaps.map((m) => [nameKey(m.productName), m]))

  const partyRef = order.customer.sepidarPartyRef
  if (!partyRef && isReal) {
    throw new Error(
      `طرف‌حساب سپیدار برای مشتری «${order.customer.name}» تعریف نشده (sepidarPartyRef)`
    )
  }

  const invoiceDate = order.invoicedAt || order.orderDate

  // شماره‌ی فاکتور در سپیدار = شماره‌ی سفارش نرم‌افزار
  // (اجرتی: سریال ۹۰۰xxx، خریداری: سریال چهار رقمی)
  const orderNumberDigits = parseInt(latinDigits(String(order.orderNumber)).replace(/\D/g, ""), 10)
  const invoiceNumber = Number.isFinite(orderNumberDigits) && orderNumberDigits > 0 ? orderNumberDigits : null

  // پیدا کردن آیتم سپیدار برای یک کالا یا خدمت
  let rowNo = 0
  const resolveRef = async (name: string, code: string | null) => {
    rowNo++
    if (resolveItem) {
      const r = await resolveItem(name, code)
      return { itemRef: r.itemRef, stockRef: r.stockRef }
    }
    const map = mockMapByKey.get(nameKey(name)) as any
    return { itemRef: Number(map?.itemRef) || rowNo, stockRef: (map?.stockRef ?? null) as number | null }
  }

  const items: InvoiceItem[] = []

  for (const it of order.items) {
    // ── ردیف کالا: مقدار = متراژ، فی = قیمت هر واحد، مبلغ = فی × مقدار ──
    const productCode =
      (it as any).productCode ??
      (it as any).code ??
      (it as any).itemCode ??
      productCodeByName.get(nameKey(it.productName)) ??
      null

    const base = await resolveRef(it.productName, productCode)

    const fee = Number(it.unitPrice) || 0
    const meterage = Number(it.meterage) || 0
    const qty = meterage > 0 ? meterage : Number(it.quantity) || 1

    items.push({
      itemRef: base.itemRef,
      quantity: qty,
      secondaryQuantity: null,
      fee,
      price: Math.round(fee * qty),
      discount: 0,
      tax: 0,
      duty: 0,
      tracingTitle: order.orderNumber,
      stockRef: base.stockRef ?? settings.defaultStockRef ?? 1,
      description: [
        it.productName,
        it.length && it.width ? `${it.length}*${it.width}` : null,
        it.meterage ? `م² ${it.meterage}` : null,
        it.notes,
      ]
        .filter(Boolean)
        .join(" | "),
    })

    // ── هر خدمت این کالا: یک ردیف جدا (بدون انبار) ──
    for (const s of parseServices((it as any).servicesData)) {
      const title = String(s?.title || "").trim()
      if (!title) continue

      const cnt = parseFloat(s.count) || 1
      const unitQty =
        s.unit === "عددی" && !String(s.unitQuantity ?? "").trim()
          ? 1
          : parseFloat(s.unitQuantity) || 0
      const amount = cnt * unitQty
      const sFee = parsePrice(s.unitPrice)
      const sPrice = Math.round(parsePrice(s.totalPrice) || amount * sFee)

      if (amount <= 0 && sPrice <= 0) continue

      const svc = await resolveRef(title, serviceCodeByName.get(nameKey(title)) ?? null)

      items.push({
        itemRef: svc.itemRef,
        quantity: amount > 0 ? amount : 1,
        secondaryQuantity: null,
        fee: amount > 0 ? sFee : sPrice,
        price: sPrice,
        discount: 0,
        tax: 0,
        duty: 0,
        tracingTitle: order.orderNumber,
        stockRef: null,
        description: [`${title} ${it.productName}`, s.note].filter(Boolean).join(" | "),
      })
    }
  }

  // تخفیف کل سفارش را روی اولین قلم پخش می‌کنیم (ساده؛ بعداً می‌توان دقیق‌تر کرد)
  if (order.discountAmount > 0 && items.length > 0) {
    items[0].discount = Number(order.discountAmount) || 0
  }

  const payload = {
    customerPartyRef: partyRef || 1,
    customerRealName: null as string | null,
    customerRealNameEn: null as string | null,
    saleTypeRef: settings.saleTypeRef || 1,
    number: invoiceNumber,
    date: tehranDateOnly(invoiceDate),
    currencyRef: settings.currencyRef || 1,
    // حساب معین: همیشه «حساب‌های دریافتنی» (شناسه‌ی ۴۲۰ در سپیدار این شرکت)
    slRef: Number(process.env.SEPIDAR_SL_REF) || RECEIVABLE_SL_REF,
    deliveryLocationRef: settings.deliveryLocationRef || 1,
    state: settings.state || 1,
    settlementType: settings.settlementType || 1,
    rate: settings.rate || 1,
    description: `فاکتور اخوان ${order.orderNumber}${order.notes ? " | " + order.notes : ""}`,
    items,
    extraData: {
      stringColumn1: order.orderNumber,
      stringColumn2: order.customer.name,
      note: order.notes || "",
    },
  }

  return { order, payload, settings }
}