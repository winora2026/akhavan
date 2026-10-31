import { prisma } from "@/lib/prisma"
import { computeOrderTotals } from "@/lib/orderTotals"
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

// شناسه‌ی حساب معین «حساب‌های دریافتنی» (کد ۱۱۱۲۰۱) در سپیدار؛ پیش‌فرض همه‌ی فاکتورهای فروش روی همین حساب می‌روند.
// با SEPIDAR_SL_REF در .env قابل تغییر است و حسابدار هم می‌تواند هنگام ارسال حساب دیگری انتخاب کند.
export const RECEIVABLE_SL_REF = 420

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
// برای سفارش‌های قدیمی که کد کالا روی ردیفشان ذخیره نشده. اگر یک نام با دو کد مختلف باشد
// (مبهم)، مقدار null می‌شود و نگاشت با نام انجام می‌شود.
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

// کش روی globalThis: هر route نسخه‌ی جدا از ماژول می‌گیرد و در حالت dev با هر ذخیره‌ی فایل دوباره ساخته می‌شود.
// خواندن کل آیتم‌ها (تا ۱۰۰ درخواست پشت‌سرهم) فقط بار اول منتظر می‌ماند؛ بعد از آن فهرست قدیمی فوراً داده می‌شود
// و تازه‌سازی در پس‌زمینه انجام می‌شود.
const itemStore: { index: ItemIndex | null; inflight: Promise<ItemIndex> | null } =
  ((globalThis as any).__sepidarItemStore ??= { index: null, inflight: null })

function reloadItems(): Promise<ItemIndex> {
  if (!itemStore.inflight) {
    itemStore.inflight = (async () => {
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
      const index: ItemIndex = { at: Date.now(), list, byCode, byKey }
      itemStore.index = index
      return index
    })().finally(() => {
      itemStore.inflight = null
    })
  }
  return itemStore.inflight
}

async function loadItemIndex(force = false): Promise<ItemIndex> {
  if (force || !itemStore.index) return reloadItems()
  if (Date.now() - itemStore.index.at > CACHE_MS) {
    reloadItems().catch((e) => console.error("Sepidar: تازه‌سازی پس‌زمینه‌ی آیتم‌ها ممکن نشد", e))
  }
  return itemStore.index
}

// برای گرم کردن کش هنگام بالا آمدن سرور (instrumentation.ts)
export async function warmItems() {
  await loadItemIndex()
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
 * ترتیب:
 *  ۱) کد کالا (دقیق‌ترین راه؛ کد کالا در نرم‌افزار و سپیدار یکی است و حتی برای نام‌های تکراری جواب می‌دهد)
 *  ۲) ردیف ذخیره‌شده در SepidarItemMap با نام (از جمله نگاشت دستی)
 *  ۳) نام نرمال‌شده، فقط اگر دقیقاً یک آیتم با همین نام در سپیدار باشد
 * نگاشت خودکار فقط برای نام‌های یکتا در SepidarItemMap ذخیره می‌شود؛ برای نام‌های تکراری ذخیره نمی‌شود
 * تا نگاشت یک کد، کالاهای هم‌نامِ دیگر را خراب نکند.
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
    const code = latinDigits(String(productCode || "")).trim()
    const saved = mapByKey.get(key)

    // ۱) با کد کالا
    if (code) {
      const index = await loadItemIndex()
      let hit: any = index.byCode.get(code) ?? null
      let via: ResolvedItem["via"] = "code"
      if (!hit) {
        hit = await lookupByCode(code)
        via = "code-lookup"
      }
      const id = hit ? itemIdOf(hit) : null
      if (id) {
        const sameName = index.byKey.get(key)
        if (!saved && (!sameName || sameName.length <= 1)) {
          await persist(productName, id)
        }
        const savedStock = saved && Number(saved.itemRef) === id ? saved.stockRef ?? null : null
        return { itemRef: id, stockRef: savedStock, via }
      }
      // کد در سپیدار پیدا نشد (کد قدیمی/اشتباه)؛ با نام ادامه می‌دهیم
    }

    // ۲) نگاشت ذخیره‌شده با نام
    if (saved) {
      return { itemRef: Number(saved.itemRef), stockRef: saved.stockRef ?? null, via: "map" }
    }

    const index = await loadItemIndex()

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
          .join("، ")}). کد کالا روی این سفارش ثبت نشده؛ در ویرایش سفارش کالا را دوباره از لیست انتخاب و ذخیره کنید، یا نگاشت را دستی در SepidarItemMap وارد کنید.`
      )
    }

    // شاید کالا تازه در سپیدار ساخته شده و در فهرست کش نیست: یک‌بار فهرست را تازه می‌خوانیم
    if (Date.now() - index.at > 2 * 60_000) {
      const fresh = await loadItemIndex(true)
      const again = fresh.byKey.get(key)
      if (again && again.length === 1) {
        const id = itemIdOf(again[0])
        if (id) {
          await persist(productName, id)
          return { itemRef: id, stockRef: null, via: "name" }
        }
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
  description: string | null
}

const parsePrice = (v: unknown) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0

// حذف خطای جمع اعداد اعشاری (۳۴.۳۱۹۹۹۹۹ → ۳۴.۳۲)؛ متراژها در نرم‌افزار تا ۵ رقم اعشار ذخیره می‌شوند
const round5 = (n: number) => Math.round(n * 100000) / 100000

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

// گروه‌بندی مثل حالت «کلی» پیش‌فاکتور: همه‌ی سایزهای یک کالا یک ردیف، هر خدمتِ آن کالا هم یک ردیف
type ServiceGroup = {
  title: string
  unit: string
  fee: number
  note: string
  amount: number // جمع (تعداد × تعداد واحد)
  total: number // جمع مبلغ خدمت
}

type ProductGroup = {
  name: string
  code: string | null
  unit: string
  fee: number
  quantity: number // جمع متراژ
  descriptions: string[]
  services: Map<string, ServiceGroup>
}

/**
 * ساخت بدنه‌ی فاکتور سپیدار.
 * opts.slRef: شناسه‌ی حساب معین انتخاب‌شده توسط حسابدار؛ اگر داده نشود، پیش‌فرض «حساب‌های دریافتنی» است.
 * ردیف‌هایی (کالا یا خدمت) که قیمتشان صفر است به سپیدار فرستاده نمی‌شوند (سپیدار برایشان خطا می‌دهد)
 * و نامشان در skippedZeroPrice برگردانده می‌شود.
 */
export async function buildCreateInvoicePayload(
  orderId: string,
  opts: { slRef?: number | string | null } = {}
) {
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

  // مبالغ سفارش با همان فرمولی که لیست فاکتورها و پیش‌فاکتور استفاده می‌کنند
  const totals = computeOrderTotals(order as any)
  if (totals.extra > 0) {
    throw new Error(
      "این سفارش «اضافات» دارد و فیلدی برای اضافات در فاکتور سپیدار پشتیبانی نمی‌شود؛ ارسال متوقف شد تا مبلغ سپیدار با نرم‌افزار مغایرت پیدا نکند."
    )
  }

  // حالت واقعی: نگاشت خودکار با کد کالا، نگاشت ذخیره‌شده و نام
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

  // حساب معین: پیش‌فرض «حساب‌های دریافتنی»؛ اگر حسابدار هنگام ارسال حساب دیگری انتخاب کرده باشد همان
  const requestedSl = Number(opts.slRef)
  const slRef =
    Number.isInteger(requestedSl) && requestedSl > 0
      ? requestedSl
      : Number(process.env.SEPIDAR_SL_REF) || RECEIVABLE_SL_REF

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

  // ── مرحله ۱: گروه‌بندی اقلام (نام + کد + واحد + قیمت واحد) و خدماتشان ──
  const groups: ProductGroup[] = []
  const groupMap = new Map<string, ProductGroup>()

  for (const it of order.items) {
    // کد کالای ذخیره‌شده روی ردیف سفارش اولویت دارد؛ برای سفارش‌های قدیمی از seed (بر اساس نام) خوانده می‌شود
    const productCode =
      (it as any).productCode ||
      (it as any).code ||
      (it as any).itemCode ||
      productCodeByName.get(nameKey(it.productName)) ||
      null

    const fee = Number(it.unitPrice) || 0
    const unit = String(it.unit || "")
    const key = [nameKey(it.productName), productCode || "", unit, fee].join("|")

    let g = groupMap.get(key)
    if (!g) {
      g = {
        name: it.productName,
        code: productCode,
        unit,
        fee,
        quantity: 0,
        descriptions: [],
        services: new Map<string, ServiceGroup>(),
      }
      groupMap.set(key, g)
      groups.push(g)
    }

    const meterage = Number(it.meterage) || 0
    g.quantity += meterage > 0 ? meterage : Number(it.quantity) || 1

    // فقط توضیحاتی که خود کاربر روی قلم نوشته (یکتا)
    const desc = String(it.notes || "").trim()
    if (desc && !g.descriptions.includes(desc)) g.descriptions.push(desc)

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
      const sTotal = parsePrice(s.totalPrice) || amount * sFee
      const note = String(s.note || "").trim()

      const sKey = [nameKey(title), String(s.unit || ""), sFee, note].join("|")
      const existing = g.services.get(sKey)
      if (existing) {
        existing.amount += amount
        existing.total += sTotal
      } else {
        g.services.set(sKey, {
          title,
          unit: String(s.unit || ""),
          fee: sFee,
          note,
          amount,
          total: sTotal,
        })
      }
    }
  }

  // ── مرحله ۲: ساخت ردیف‌ها؛ برای هر کالا اول ردیف خودش، بعد ردیف خدماتش ──
  // ردیف‌های قیمت صفر (کالا یا خدمت) ساخته نمی‌شوند و حتی نگاشت آیتم سپیدارشان هم بررسی نمی‌شود.
  const items: InvoiceItem[] = []
  const skippedZeroPrice: string[] = []

  for (const g of groups) {
    const qty = round5(g.quantity)
    const basePrice = Math.round(g.fee * qty)

    if (basePrice > 0) {
      const base = await resolveRef(g.name, g.code)

      items.push({
        itemRef: base.itemRef,
        quantity: qty,
        secondaryQuantity: null,
        fee: g.fee,
        price: basePrice,
        discount: 0,
        tax: 0,
        duty: 0,
        tracingTitle: order.orderNumber,
        stockRef: base.stockRef ?? settings.defaultStockRef ?? 1,
        description: g.descriptions.join("، ") || null,
      })
    } else {
      skippedZeroPrice.push(g.name)
    }

    for (const sg of g.services.values()) {
      const amount = round5(sg.amount)
      const price = Math.round(sg.total)
      if (price <= 0) {
        if (amount > 0) skippedZeroPrice.push(`${sg.title} ${g.name}`)
        continue
      }

      const svc = await resolveRef(sg.title, serviceCodeByName.get(nameKey(sg.title)) ?? null)

      items.push({
        itemRef: svc.itemRef,
        quantity: amount > 0 ? amount : 1,
        secondaryQuantity: null,
        fee: amount > 0 ? sg.fee : price,
        price,
        discount: 0,
        tax: 0,
        duty: 0,
        tracingTitle: order.orderNumber,
        stockRef: null,
        description: [`${sg.title} ${g.name}`, sg.note].filter(Boolean).join(" | "),
      })
    }
  }

  if (items.length === 0) {
    throw new Error(
      "همه‌ی ردیف‌های این فاکتور قیمت صفر دارند؛ چیزی برای ارسال به سپیدار باقی نمانده است."
    )
  }

  // تخفیف و ارزش افزوده‌ی کل فاکتور روی ردیف اول (مثل فاکتورهای رسمی سیستم قبلی در سپیدار)
  items[0].discount = totals.discount
  items[0].tax = totals.vat

  const payload = {
    customerPartyRef: partyRef || 1,
    customerRealName: null as string | null,
    customerRealNameEn: null as string | null,
    saleTypeRef: settings.saleTypeRef || 1,
    number: invoiceNumber,
    date: tehranDateOnly(invoiceDate),
    currencyRef: settings.currencyRef || 1,
    // حساب معین: پیش‌فرض «حساب‌های دریافتنی» (شناسه‌ی ۴۲۰)؛ با انتخاب حسابدار قابل تغییر است
    slRef,
    deliveryLocationRef: settings.deliveryLocationRef || 1,
    state: settings.state || 1,
    settlementType: settings.settlementType || 1,
    rate: settings.rate || 1,
    // فقط توضیحات خود سفارش؛ عبارت «فاکتور اخوان شماره ...» دیگر اضافه نمی‌شود
    description: String(order.notes || "").trim() || null,
    items,
    extraData: {
      stringColumn1: order.orderNumber,
      stringColumn2: order.customer.name,
      note: order.notes || "",
    },
  }

  return { order, payload, settings, skippedZeroPrice }
}