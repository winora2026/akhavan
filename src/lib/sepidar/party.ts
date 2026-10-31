import { prisma } from "@/lib/prisma"
import { sepidarPost, sepidarGet, extractList, getAll, isMockMode, pickId } from "./client"
import { cleanCode, nameTokens, nameKey, sharesNameToken, seedCodeByName } from "./customerCodes"
import customersSeedRaw from "@/app/customers/customers-seed.json"

function digits(s: string) {
  return (s || "")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\D/g, "")
}

const PARTY_ID_KEYS = ["partyId", "id", "ref", "partyRef", "partySerial", "PartyId", "Id"]

function partyDisplayName(p: any) {
  const first = p?.name ?? p?.Name ?? ""
  const last = p?.lastName ?? p?.LastName ?? ""
  return `${first} ${last}`
}

// کد مشتری اخوان برای تطبیق اولیه: اول کد عددی واقعی روی خود مشتری، وگرنه از لیست (seed) بر اساس نام
function akhavanCodeOf(c: { name: string; customerCode?: string | null }) {
  return cleanCode(c.customerCode) || seedCodeByName.get(nameKey(c.name)) || ""
}

// نام نمایشی مشتری seed، دقیقاً با همان قاعده‌ی صفحه‌ی ثبت سفارش (نسخه‌ی محلی؛ به customerCodes.ts وابسته نیست)
function seedCustomerName(c: any) {
  let name = ""
  if (c.customerType === "حقوقی") {
    name = (c.companyName || "").trim()
    if (!name) name = `${c.lastName || ""} ${c.firstName || ""}`.trim()
  } else {
    name = `${c.lastName || ""} ${c.firstName || ""}`.trim()
    if (!name) name = (c.companyName || "").trim()
  }
  if (!name) name = c.companyName || c.lastName || c.firstName || c.code || "بدون نام"
  return name
}

// ───────────── اطلاعات کامل مشتری (نام، نام خانوادگی، کد ملی، ...) ─────────────
// مشتری ثبت‌شده از صفحه‌ی «مدیریت مشتریان» این اطلاعات را در ستون profile (JSON) دارد.
// مشتری قدیمی که فقط از سفارش در دیتابیس ساخته شده، پروفایل ندارد و اطلاعاتش از فایل seed (با کد یا نام) خوانده می‌شود.
const seedEntryByCode = new Map<string, any>()
const seedEntryByName = new Map<string, any | null>() // نام مبهم (دو نفر هم‌نام) = null
for (const c of customersSeedRaw as unknown as any[]) {
  const code = cleanCode(c?.code)
  if (code && !seedEntryByCode.has(code)) seedEntryByCode.set(code, c)
  const key = nameKey(seedCustomerName(c))
  if (!key) continue
  seedEntryByName.set(key, seedEntryByName.has(key) ? null : c)
}

function parseProfile(raw: unknown): any {
  if (!raw) return null
  if (typeof raw === "object") return raw
  try {
    const p = JSON.parse(String(raw))
    return p && typeof p === "object" ? p : null
  } catch {
    return null
  }
}

// همان اعتبارسنجی صفحه‌ی مشتریان
function isValidNationalCode(code: string): boolean {
  if (!/^\d{10}$/.test(code)) return false
  if (/^(\d)\1{9}$/.test(code)) return false
  const check = parseInt(code[9])
  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(code[i]) * (10 - i)
  const r = sum % 11
  return (r < 2 && check === r) || (r >= 2 && check === 11 - r)
}
const isValidEconomicCode = (code: string) => /^\d{11}$|^\d{14}$/.test(code)
const isValidCompanyNationalId = (code: string) => /^\d{11}$/.test(code)
const isValidPostalCode = (code: string) => /^\d{10}$/.test(code)

type PartyInfo = {
  type: string
  firstName: string
  lastName: string
  companyName: string
  nationalCode: string
  companyNationalId: string
  economicCode: string
  postalCode: string
  phones: string[]
  address1: string
}

// اطلاعات مشتری: اول پروفایل ذخیره‌شده، وگرنه ردیف seed (با کد و بعد با نام یکتا)
function resolvePartyInfo(c: any): PartyInfo | null {
  let src: any = parseProfile(c.profile)
  if (!src?.customerType) {
    const byCode = seedEntryByCode.get(cleanCode(c.customerCode))
    const bySeedCode =
      byCode && sharesNameToken(String(c.name || ""), seedCustomerName(byCode)) ? byCode : null
    src = bySeedCode ?? seedEntryByName.get(nameKey(String(c.name || ""))) ?? null
  }
  if (!src) return null
  const s = (v: unknown) => String(v ?? "").trim()
  return {
    type: s(src.customerType) || "حقیقی",
    firstName: s(src.firstName),
    lastName: s(src.lastName),
    companyName: s(src.companyName),
    nationalCode: digits(s(src.nationalCode)),
    companyNationalId: digits(s(src.companyNationalId)),
    economicCode: digits(s(src.economicCode)),
    postalCode: digits(s(src.postalCode)),
    phones: Array.isArray(src.phones) ? src.phones.map(s) : [],
    address1: s(src.address1),
  }
}

// بدنه‌ی CreateParty + توضیح مواردی که معتبر نبودند و ارسال نشدند
function buildPartyPayloadWithNotes(customer: any) {
  const phoneType = Number(process.env.SEPIDAR_PHONE_TYPE || 1)
  const addressType = Number(process.env.SEPIDAR_ADDRESS_TYPE || 1)
  // مقدار «نوع» برای مشتری حقوقی در سپیدار؛ تا وقتی در .env تنظیم نشده، فیلد نوع فرستاده نمی‌شود
  const legalSubType = Number(process.env.SEPIDAR_LEGAL_SUBTYPE || 0)
  const notes: string[] = []
  const info = resolvePartyInfo(customer)
  const fullName = String(customer.name || "").trim()

  // تلفن‌ها: همه‌ی شماره‌های پروفایل + شماره‌ی ذخیره‌شده روی مشتری، بدون تکرار
  const seen = new Set<string>()
  const phones = [...(info?.phones ?? []), String(customer.phone || "")]
    .flatMap((p) => p.split(/[،,;\/\s]+/))
    .map(digits)
    .filter((p) => p.length >= 7 && !seen.has(p) && (seen.add(p), true))
    .map((p, i) => ({ type: phoneType, phone: p, isMain: i === 0 }))

  const addressText = String(customer.address || "").trim() || info?.address1 || ""
  const zip = info?.postalCode || ""
  if (zip && !isValidPostalCode(zip)) notes.push(`کد پستی «${zip}» نامعتبر بود و ارسال نشد`)
  const addresses = addressText
    ? [
        {
          type: addressType,
          address: addressText,
          isMain: true,
          ...(isValidPostalCode(zip) ? { zipCode: zip } : {}),
        },
      ]
    : []

  const legal = info?.type === "حقوقی"
  let name = fullName
  let lastName = ""
  if (info) {
    if (legal) {
      name = info.companyName || fullName
    } else if (info.firstName && info.lastName) {
      // نام و نام خانوادگی جدا (در سپیدار «عنوان تفصیلی» خودش از ترکیب این دو ساخته می‌شود)
      name = info.firstName
      lastName = info.lastName
    } else {
      // فقط یک جزء داریم؛ مثل قبل یک‌جا در نام می‌رود
      name = info.lastName || info.firstName || info.companyName || fullName
    }
  }

  // کد ملی (حقیقی) یا شناسه‌ی ملی (حقوقی)
  let identificationCode = ""
  if (info) {
    if (legal) {
      const v = info.companyNationalId || info.nationalCode
      if (v && isValidCompanyNationalId(v)) identificationCode = v
      else if (v) notes.push(`شناسه‌ی ملی «${v}» نامعتبر بود و ارسال نشد`)
    } else if (info.nationalCode) {
      if (isValidNationalCode(info.nationalCode)) identificationCode = info.nationalCode
      else notes.push(`کد ملی «${info.nationalCode}» نامعتبر بود و ارسال نشد`)
    }
  }

  let economicCode = ""
  if (info?.economicCode) {
    if (isValidEconomicCode(info.economicCode)) economicCode = info.economicCode
    else notes.push(`کد اقتصادی «${info.economicCode}» نامعتبر بود و ارسال نشد`)
  }

  if (legal && !legalSubType) {
    notes.push("نوع «حقوقی» ارسال نشد (SEPIDAR_LEGAL_SUBTYPE در .env تنظیم نشده)؛ در سپیدار حقیقی ثبت شد")
  }

  const payload = {
    name,
    ...(lastName ? { lastName } : {}),
    ...(legal && legalSubType ? { subType: legalSubType } : {}),
    isCustomer: true,
    ...(identificationCode ? { identificationCode } : {}),
    ...(economicCode ? { economicCode } : {}),
    ...(phones.length ? { phones } : {}),
    ...(addresses.length ? { addresses } : {}),
  }
  return { payload, notes }
}

export function buildCreatePartyPayload(customer: any) {
  return buildPartyPayloadWithNotes(customer).payload
}

// ───────────── لیست طرف‌حساب‌ها (کش پایدار + به‌روزرسانی افزایشی) ─────────────
// خواندن کل لیست (~۵٬۶۰۰ طرف‌حساب = بیش از ۱۱۰ درخواست پشت‌سرهم) دقیقه‌ها طول می‌کشد، پس:
//  - کش روی globalThis است؛ هر route نسخه‌ی جدا از ماژول می‌گیرد و با ذخیره‌ی فایل در حالت dev ماژول دوباره ساخته می‌شود
//  - فقط بار اول (یا بعد از ری‌استارت) کل لیست خوانده می‌شود؛ بعد از آن فقط طرف‌حساب‌های جدیدتر از بزرگ‌ترین شناسه (۱–۲ درخواست)
//  - خواندن کامل هر ۶ ساعت یک‌بار در پس‌زمینه انجام می‌شود و هیچ فاکتوری منتظرش نمی‌ماند
//  - وجود طرف‌حسابِ لینک‌شده‌ی هر مشتری با یک درخواست هدفمند سنجیده می‌شود (verifyExistingLink)
const PARTIES_PATH = "/api/sepidar/v1/Parties/GetAllParty"
const MAX_PAGES = 400 // × ۵۰ ردیف = حداکثر ۲۰٬۰۰۰ طرف‌حساب
const PARTIES_FRESH_MS = 2 * 60_000
const PARTIES_FULL_REFRESH_MS = 6 * 60 * 60_000

type PartyRow = any

type PartyStore = {
  list: PartyRow[] | null
  at: number // آخرین به‌روزرسانی (کامل یا افزایشی)
  fullAt: number // آخرین خواندن کامل
  maxId: number
  incrementalBroken: boolean // سپیدار AfterPartyId را نادیده گرفته؛ فقط خواندن کامل کار می‌کند
  full: Promise<PartyRow[]> | null
  inc: Promise<void> | null
}

const store: PartyStore = ((globalThis as any).__sepidarPartyStore ??= {
  list: null,
  at: 0,
  fullAt: 0,
  maxId: 0,
  incrementalBroken: false,
  full: null,
  inc: null,
} as PartyStore)

const partyNumId = (p: any) => {
  const n = Number(pickId(p, PARTY_ID_KEYS))
  return Number.isFinite(n) ? n : 0
}

// سپیدار فیلتر IsCustomer=false را گاهی نادیده می‌گیرد و همه‌ی طرف‌حساب‌ها را برمی‌گرداند.
// پس بر اساس شناسه یکتا می‌کنیم و نوع (مشتری/غیرمشتری) را از خود فیلد isCustomer می‌خوانیم.
function mergeRows(base: PartyRow[], customers: any[], others: any[]): PartyRow[] {
  const byId = new Map<string, PartyRow>()
  for (const p of base) byId.set(String(pickId(p, PARTY_ID_KEYS)), p)
  const add = (p: any, fallbackSrc: "customer" | "other") => {
    const flag = p?.isCustomer ?? p?.IsCustomer
    const src = typeof flag === "boolean" ? (flag ? "customer" : "other") : fallbackSrc
    const id = pickId(p, PARTY_ID_KEYS)
    const key = id != null ? String(id) : `row-${byId.size}`
    const row = { ...p, __src: src }
    const prev = byId.get(key)
    if (!prev || (prev.__src !== "customer" && src === "customer") || base.length) byId.set(key, row)
  }
  customers.forEach((p) => add(p, "customer"))
  others.forEach((p) => add(p, "other"))
  return Array.from(byId.values())
}

function setList(list: PartyRow[], full: boolean) {
  store.list = list
  store.at = Date.now()
  if (full) store.fullAt = store.at
  store.maxId = list.reduce((m, p) => Math.max(m, partyNumId(p)), 0)
}

async function readAllParties(): Promise<PartyRow[]> {
  const customers = await getAll(PARTIES_PATH, { IsCustomer: true }, MAX_PAGES)
  let others: any[] = []
  try {
    others = await getAll(PARTIES_PATH, { IsCustomer: false }, MAX_PAGES)
  } catch (e) {
    // اگر سپیدار این فیلتر را نپذیرفت، فقط لیست مشتری‌ها کافی است
    console.error("Sepidar: خواندن طرف‌حساب‌های غیرمشتری ممکن نشد", e)
  }
  return mergeRows([], customers, others)
}

function fullLoad(): Promise<PartyRow[]> {
  if (!store.full) {
    store.full = readAllParties()
      .then((list) => {
        setList(list, true)
        return list
      })
      .finally(() => {
        store.full = null
      })
  }
  return store.full
}

// فقط طرف‌حساب‌های جدیدتر از بزرگ‌ترین شناسه‌ی کش
function incrementalLoad(): Promise<void> {
  if (!store.inc) {
    store.inc = (async () => {
      const after = store.maxId
      const customers = await getAll(PARTIES_PATH, { IsCustomer: true, AfterPartyId: after }, 10)
      let others: any[] = []
      try {
        others = await getAll(PARTIES_PATH, { IsCustomer: false, AfterPartyId: after }, 10)
      } catch (e) {
        console.error("Sepidar: خواندن افزایشیِ طرف‌حساب‌های غیرمشتری ممکن نشد", e)
      }
      // اگر ردیفی با شناسه‌ی کوچک‌تر برگشت، سپیدار AfterPartyId را نادیده گرفته: افزایشی کار نمی‌کند
      const ignored = [...customers, ...others].some((p) => partyNumId(p) <= after)
      if (ignored) {
        store.incrementalBroken = true
        console.warn("Sepidar: AfterPartyId پشتیبانی نشد؛ به‌روزرسانی افزایشی غیرفعال شد و فقط خواندن کامل پس‌زمینه انجام می‌شود")
      }
      const fresh = (list: any[]) => list.filter((p) => partyNumId(p) > after)
      setList(mergeRows(store.list ?? [], fresh(customers), fresh(others)), false)
    })().finally(() => {
      store.inc = null
    })
  }
  return store.inc
}

async function loadParties(): Promise<PartyRow[]> {
  // بار اول (یا بعد از ری‌استارت): تنها حالتی که منتظر خواندن کامل می‌مانیم
  if (!store.list) return fullLoad()

  // خواندن کامل دوره‌ای در پس‌زمینه؛ فاکتور منتظرش نمی‌ماند
  const fullEvery = store.incrementalBroken ? 10 * 60_000 : PARTIES_FULL_REFRESH_MS
  if (Date.now() - store.fullAt > fullEvery) {
    fullLoad().catch((e) => console.error("Sepidar: خواندن کامل پس‌زمینه‌ی طرف‌حساب‌ها ممکن نشد", e))
  }

  if (!store.incrementalBroken && Date.now() - store.at > PARTIES_FRESH_MS) {
    try {
      await incrementalLoad()
    } catch (e) {
      console.error("Sepidar: به‌روزرسانی افزایشی طرف‌حساب‌ها ممکن نشد؛ لیست قبلی استفاده می‌شود", e)
    }
  }
  return store.list!
}

// بعد از ساخت طرف‌حساب: دفعه‌ی بعد فقط ردیف‌های جدید خوانده می‌شود، نه کل لیست
function markPartiesStale() {
  store.at = 0
}
// فقط برای حالتی که واقعاً لیست کامل و تازه لازم است (مثلاً خطای «تکراری»)
function dropPartyCache() {
  store.list = null
  store.at = 0
}
// برای گرم کردن کش هنگام بالا آمدن سرور (instrumentation.ts)
export async function warmParties() {
  await loadParties()
}

// یک طرف‌حساب را با شناسه از سپیدار می‌خواند: ردیف | null (نبود) | undefined (نتوانستیم بفهمیم)
async function fetchPartyById(id: number | string): Promise<PartyRow | null | undefined> {
  let answered = false
  for (const filter of [{ IsCustomer: true }, {}]) {
    try {
      const page = await sepidarGet(PARTIES_PATH, {
        ...filter,
        AfterPartyId: Number(id) - 1,
        Page: 1,
        ItemCount: 5,
      })
      answered = true
      const hit = extractList(page).find((p) => String(pickId(p, PARTY_ID_KEYS)) === String(id))
      if (hit) {
        const flag = hit?.isCustomer ?? hit?.IsCustomer
        return { ...hit, __src: typeof flag === "boolean" ? (flag ? "customer" : "other") : "customer" }
      }
    } catch {
      // فیلتر بعدی
    }
  }
  return answered ? null : undefined
}

// «نبودنِ» جواب هدفمند فقط وقتی معتبر است که همین روش یک طرف‌حساب موجود را درست پیدا کند (یک‌بار در هر اجرا سنجیده می‌شود)
async function targetedLookupTrusted(): Promise<boolean> {
  const g = globalThis as any
  if (typeof g.__sepidarTargetedTrusted === "boolean") return g.__sepidarTargetedTrusted
  const sample = (store.list ?? []).find((p) => partyNumId(p) > 0 && p.__src === "customer")
  if (!sample) return false
  const row = await fetchPartyById(partyNumId(sample))
  g.__sepidarTargetedTrusted = Boolean(row)
  return g.__sepidarTargetedTrusted
}

function removeParty(id: number | string) {
  if (!store.list) return
  store.list = store.list.filter((p) => String(pickId(p, PARTY_ID_KEYS)) !== String(id))
}

function upsertParty(row: PartyRow) {
  if (!store.list) return
  const id = String(pickId(row, PARTY_ID_KEYS))
  const i = store.list.findIndex((p) => String(pickId(p, PARTY_ID_KEYS)) === id)
  if (i >= 0) store.list[i] = row
  else store.list.push(row)
  store.maxId = Math.max(store.maxId, partyNumId(row))
}

function pickBest(matches: PartyRow[], phone?: string | null): PartyRow {
  // اول مشتری‌ها، بعد تطبیق تلفن
  const customers = matches.filter((p) => p.__src === "customer")
  const pool = customers.length ? customers : matches
  if (pool.length > 1 && phone) {
    const d = digits(phone)
    if (d.length >= 7) {
      const byPhone = pool.find((p) =>
        digits(JSON.stringify(p?.phones ?? p?.Phones ?? "")).includes(d.slice(-7))
      )
      if (byPhone) return byPhone
    }
  }
  return pool[0]
}

// طرف‌حسابی که کد سپیدارش (dlCode) برابر کد داده‌شده است
async function findPartyByCode(code: string): Promise<PartyRow | null> {
  const parties = await loadParties()
  const hits = parties.filter((p) => cleanCode(p?.dlCode ?? p?.DlCode) === code)
  if (!hits.length) return null
  return hits.find((p) => p.__src === "customer") ?? hits[0]
}

async function findExistingParty(
  name: string,
  phone?: string | null,
  opts: { fuzzy?: boolean } = {}
): Promise<{ match: PartyRow | null; candidates: PartyRow[] }> {
  const parties = await loadParties()
  const key = nameKey(name)
  if (!key) return { match: null, candidates: [] }

  const exact = parties.filter((p) => nameKey(partyDisplayName(p)) === key)
  if (exact.length) return { match: pickBest(exact, phone), candidates: exact }

  if (!opts.fuzzy) return { match: null, candidates: [] }

  // تطبیق نرم (فقط وقتی سپیدار صراحتاً «تکراری» گفته): همه‌ی کلمات یکی از دو نام در دیگری باشد
  const mine = nameTokens(name)
  if (mine.length < 2) return { match: null, candidates: [] }
  const candidates = parties.filter((p) => {
    const theirs = nameTokens(partyDisplayName(p))
    if (theirs.length < 2) return false
    return theirs.every((t) => mine.includes(t)) || mine.every((t) => theirs.includes(t))
  })
  return { match: candidates.length === 1 ? candidates[0] : null, candidates }
}

function isDuplicateError(e: any) {
  const m = String(e?.message || e || "")
  return /VALIDATION_ERROR/.test(m) && /تکراری|duplicate/i.test(m)
}

// طرف‌حسابِ تازه‌ساخته‌شده را برای خواندن کدش پیدا می‌کند.
// اول خواندن هدفمند (IsCustomer لازم است؛ AfterPartyId ممکن است پشتیبانی نشود)،
// اگر پیدا نشد لیست کامل تازه خوانده می‌شود.
async function readCreatedParty(id: number | string): Promise<PartyRow | null> {
  try {
    const page = await sepidarGet("/api/sepidar/v1/Parties/GetAllParty", {
      IsCustomer: true,
      AfterPartyId: Number(id) - 1,
      Page: 1,
      ItemCount: 5,
    })
    const hit = extractList(page).find((p) => String(pickId(p, PARTY_ID_KEYS)) === String(id))
    if (hit) return hit
  } catch (e) {
    console.error("Sepidar: خواندن هدفمند طرف‌حساب تازه‌ساخته‌شده ممکن نشد؛ لیست کامل خوانده می‌شود", e)
  }
  markPartiesStale()
  const list = await loadParties()
  return list.find((p) => String(pickId(p, PARTY_ID_KEYS)) === String(id)) ?? null
}

// کد سپیدار را روی مشتری اخوان می‌نویسد.
// force=false (پیش‌فرض): فقط اگر کد فعلی موقت/خالی باشد؛ کد عددی واقعی بازنویسی نمی‌شود.
// force=true: کد سپیدار مرجع است و همیشه نوشته می‌شود (مشتری تازه‌ساخته یا وصل‌شده با نام).
async function syncCodeFromSepidar(
  customerId: string,
  party: PartyRow,
  opts: { force?: boolean } = {}
): Promise<string | null> {
  const sepCode = cleanCode(party?.dlCode ?? party?.DlCode)
  if (!sepCode) return null
  try {
    const cur = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { customerCode: true },
    })
    const curCode = cleanCode(cur?.customerCode)
    if (curCode === sepCode) return sepCode
    if (!opts.force && curCode) return sepCode
    await prisma.customer.update({
      where: { id: customerId },
      data: { customerCode: sepCode } as any,
    })
  } catch (e) {
    // مثلاً کد روی مشتری دیگری ثبت شده (customerCode یکتاست)
    console.error("Sepidar: ذخیره‌ی کد سپیدار روی مشتری ممکن نشد", e)
  }
  return sepCode
}

type LinkOpts = {
  forceCode?: string // کد مرجع (از لیست مشتریان) که باید روی مشتری اخوان بنشیند
  trustSepidarCode?: boolean // وصل با نام؛ کد سپیدار مرجع است و روی مشتری اخوان نوشته می‌شود
}

async function linkToCustomer(customerId: string, party: PartyRow, opts: LinkOpts = {}) {
  const id = pickId(party, PARTY_ID_KEYS)
  if (!id) {
    throw new Error(
      `طرف‌حساب در سپیدار پیدا شد ولی شناسه‌اش مشخص نیست. کلیدها: ${Object.keys(party).join(", ")}`
    )
  }
  await prisma.customer.update({
    where: { id: customerId },
    data: { sepidarPartyRef: Number(id) } as any,
  })

  let sepidarCode: string | null
  if (opts.forceCode) {
    try {
      await prisma.customer.update({
        where: { id: customerId },
        data: { customerCode: opts.forceCode } as any,
      })
    } catch (e) {
      // کد روی مشتری دیگری ثبت شده باشد (customerCode یکتاست)؛ لینک اصلاح شده و کد دست‌نخورده می‌ماند
      console.error("Sepidar: ثبت کد مرجع روی مشتری ممکن نشد", e)
    }
    sepidarCode = opts.forceCode
  } else {
    sepidarCode = await syncCodeFromSepidar(customerId, party, { force: opts.trustSepidarCode === true })
  }

  return {
    partyRef: Number(id),
    created: false,
    linked: true,
    sepidarCode,
    // اگر طرف‌حساب پیداشده «مشتری» نباشد، ثبت فاکتور فروش برای او ممکن است خطا بدهد
    warning: party.__src === "other" ? "طرف‌حساب پیداشده در سپیدار از نوع مشتری نیست" : undefined,
  }
}

// اتصال دستی مشتری به یک طرف‌حساب سپیدار
export async function linkCustomerToSepidarParty(customerId: string, partyRef: number) {
  await prisma.customer.update({
    where: { id: customerId },
    data: { sepidarPartyRef: Number(partyRef) } as any,
  })
  return { partyRef: Number(partyRef) }
}

// پاک کردن لینک مشتری به سپیدار تا دفعه‌ی بعد دوباره از اول تطبیق داده شود.
// کد مشتری به کد لیست برمی‌گردد (یا خالی می‌شود اگر در لیست نیست)، چون کد دیتابیس در تطبیق بر لیست مقدم است
// و اگر قبلاً با کد اشتباه سپیدار بازنویسی شده باشد، همان اشتباه تکرار می‌شد.
export async function resetCustomerSepidarLink(customerId: string) {
  const cur = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { name: true, customerCode: true, sepidarPartyRef: true },
  })
  if (!cur) throw new Error("مشتری یافت نشد")

  const seedCode = seedCodeByName.get(nameKey(cur.name)) || null
  markPartiesStale()

  let restoredCode: string | null = seedCode
  try {
    await prisma.customer.update({
      where: { id: customerId },
      data: { sepidarPartyRef: null, customerCode: seedCode } as any,
    })
  } catch (e) {
    // کد ممکن است روی مشتری دیگری ثبت شده باشد (customerCode یکتاست)؛ فقط لینک را پاک می‌کنیم
    console.error("Sepidar: بازگرداندن کد از لیست ممکن نشد؛ کد خالی می‌شود", e)
    restoredCode = null
    await prisma.customer.update({
      where: { id: customerId },
      data: { sepidarPartyRef: null, customerCode: null } as any,
    })
  }

  return {
    name: cur.name,
    before: { partyRef: cur.sepidarPartyRef ?? null, code: cur.customerCode ?? null },
    after: { partyRef: null, code: restoredCode },
  }
}

type EnsureResult = {
  partyRef: number
  created: boolean
  linked: boolean
  mock?: boolean
  warning?: string
  sepidarCode?: string | null
}

/**
 * قبل از هر ارسال: لینک موجود مشتری را می‌سنجد.
 *  - طرف‌حساب فعلی در سپیدار نیست (حذف شده) → لینک پاک می‌شود و مشتری از اول تطبیق می‌خورد (برمی‌گرداند null)
 *  - مشتری در لیست مشتریان نیست یا نامش در لیست با چند کد آمده → مرجعی نداریم، همان لینک
 *  - کد طرف‌حساب فعلی برابر کد لیست → همان لینک
 *  - طرف‌حسابی با کد لیست هست و نامش به مشتری می‌خورد → لینک خودکار اصلاح می‌شود
 *  - کد لیست در سپیدار نیست یا مال شخص دیگری است ولی لینک فعلی نام درستی دارد → کد لیست کهنه فرض می‌شود، همان لینک
 *  - در غیر این صورت لینک مشکوک است → ارسال متوقف می‌شود (فاکتور به طرف‌حساب اشتباه نمی‌رود)
 */
async function verifyExistingLink(customerId: string, c: any): Promise<EnsureResult | null> {
  const current: EnsureResult = {
    partyRef: Number(c.sepidarPartyRef),
    created: false,
    linked: false,
  }
  if (isMockMode()) return current

  const parties = await loadParties()
  let cur = parties.find((p) => String(pickId(p, PARTY_ID_KEYS)) === String(c.sepidarPartyRef))

  // لیست کش ممکن است ساعت‌ها قدیمی باشد (حذف/ویرایش در سپیدار را نمی‌بیند)؛ پس همین یک طرف‌حساب را تازه می‌خوانیم
  const fresh = await fetchPartyById(c.sepidarPartyRef)
  if (fresh) {
    cur = fresh
    upsertParty(fresh)
  } else if (fresh === null && (await targetedLookupTrusted())) {
    cur = undefined // با روشی که اثبات شده کار می‌کند، طرف‌حساب نیست = حذف شده
    removeParty(c.sepidarPartyRef) // وگرنه تطبیق بعدی با کد/نام دوباره به همین طرف‌حسابِ حذف‌شده وصل می‌شود
  }

  // طرف‌حساب فعلی دیگر در سپیدار نیست؛ (فقط وقتی لیست سپیدار به‌طور معقول خوانده شده)
  if (!cur && parties.length > 100) {
    console.warn(
      `Sepidar: طرف‌حساب ${c.sepidarPartyRef} مشتری «${c.name}» در سپیدار پیدا نشد؛ لینک پاک شد و دوباره تطبیق داده می‌شود`
    )
    await prisma.customer.update({
      where: { id: customerId },
      data: { sepidarPartyRef: null } as any,
    })
    c.sepidarPartyRef = null
    return null
  }

  const expected = seedCodeByName.get(nameKey(c.name)) // undefined: در لیست نیست؛ null: چند کد
  if (!expected) return current

  const curCode = cleanCode(cur?.dlCode ?? cur?.DlCode)
  if (curCode === expected) return current

  const target = await findPartyByCode(expected)
  if (target && sharesNameToken(c.name, partyDisplayName(target))) {
    const res = await linkToCustomer(customerId, target, { forceCode: expected })
    console.warn(
      `Sepidar: لینک مشتری «${c.name}» از طرف‌حساب ${c.sepidarPartyRef} (کد ${curCode || "؟"}) به ${res.partyRef} (کد ${expected}) اصلاح شد`
    )
    return {
      ...res,
      warning: `لینک مشتری اصلاح شد (قبلاً طرف‌حساب ${c.sepidarPartyRef} با کد ${curCode || "؟"})`,
    }
  }

  const curNameOk = cur ? sharesNameToken(c.name, partyDisplayName(cur)) : false
  if (curNameOk) {
    console.warn(
      `Sepidar: کد «${c.name}» در لیست (${expected}) در سپیدار نیست یا به شخص دیگری تعلق دارد؛ لینک فعلی (کد ${curCode || "؟"}) که نامش می‌خواند حفظ شد`
    )
    return current
  }

  throw new Error(
    `لینک مشتری «${c.name}» مشکوک است: کد او در لیست مشتریان ${expected} است ولی طرف‌حساب فعلی ` +
      `(شناسه ${c.sepidarPartyRef}، کد ${curCode || "نامشخص"}` +
      `${cur ? `، نام «${partyDisplayName(cur).trim()}»` : ""}) نامش به او نمی‌خورد` +
      `${
        target
          ? ` و طرف‌حسابِ هم‌کد «${partyDisplayName(target).trim()}» هم شبیه نیست. `
          : ` و طرف‌حسابی با کد ${expected} در سپیدار نیست. `
      }` +
      `برای احتیاط ارسال متوقف شد تا فاکتور به طرف‌حساب اشتباه نرود؛ لینک را با مسیر customers/link دستی اصلاح کنید.`
  )
}

async function doEnsure(customerId: string): Promise<EnsureResult> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } })
  if (!customer) throw new Error("مشتری یافت نشد")

  const c: any = customer
  if (c.sepidarPartyRef) {
    const verified = await verifyExistingLink(customerId, c)
    if (verified) return verified
    // لینک پاک شده (طرف‌حساب حذف‌شده)؛ ادامه به‌عنوان مشتری بدون لینک
  }

  if (isMockMode()) {
    return { partyRef: 1, created: false, linked: false, mock: true }
  }

  // ۰) اول با کد مشتری (همان کد سیستم قبلی/سپیدار): دقیق‌ترین راه و مانع ساخت مشتری تکراری
  const akhavanCode = akhavanCodeOf(c)
  if (akhavanCode) {
    const byCode = await findPartyByCode(akhavanCode)
    if (byCode) {
      if (sharesNameToken(c.name, partyDisplayName(byCode))) {
        return linkToCustomer(customerId, byCode)
      }
      // کد در سپیدار مال شخص دیگری است (کد لیست کهنه): اگر با نام دقیقاً پیدا شد همان، وگرنه توقف
      const byName = await findExistingParty(c.name, c.phone)
      if (byName.match) return linkToCustomer(customerId, byName.match, { trustSepidarCode: true })
      throw new Error(
        `کد ${akhavanCode} در سپیدار برای «${partyDisplayName(byCode).trim()}» ` +
          `(شناسه: ${pickId(byCode, PARTY_ID_KEYS) ?? "؟"}) ثبت شده که با نام «${c.name}» هیچ شباهتی ندارد؛ ` +
          `برای احتیاط خودکار وصل نشد. اگر یک نفرند، با مسیر customers/link دستی وصل کنید.`
      )
    }
  }

  // ۱) اگر در سپیدار با همین نام هست، فقط لینک می‌کنیم (بدون ساخت تکراری)
  const found = await findExistingParty(c.name, c.phone)
  if (found.match) return linkToCustomer(customerId, found.match, { trustSepidarCode: true })

  // ۲) در غیر این صورت می‌سازیم
  const built = buildPartyPayloadWithNotes(c)
  const payload = built.payload
  let result: any
  try {
    result = await sepidarPost("/api/sepidar/v1/Parties/CreateParty", payload)
  } catch (e: any) {
    if (!isDuplicateError(e)) throw e

    // سپیدار می‌گوید این طرف‌حساب (کد/شناسه‌ی یکتا) از قبل هست ولی با نام پیدایش نکردیم:
    // لیست را تازه می‌خوانیم و این بار با تطبیق نرم‌تر دنبالش می‌گردیم
    dropPartyCache()
    const retry = await findExistingParty(c.name, c.phone, { fuzzy: true })
    if (retry.match) return linkToCustomer(customerId, retry.match, { trustSepidarCode: true })

    const sample = retry.candidates
      .slice(0, 5)
      .map((p) => `${partyDisplayName(p).trim()} (شناسه: ${pickId(p, PARTY_ID_KEYS) ?? "؟"})`)
      .join("، ")
    throw new Error(
      `سپیدار این مشتری را تکراری می‌داند ولی طرف‌حسابِ مطابق پیدا نشد (نام: «${c.name}»). ` +
        (sample
          ? `نزدیک‌ترین‌ها: ${sample}. شناسه‌ی درست را با customers/link دستی وصل کنید.`
          : "در سپیدار با نام، کد و کد ملی جستجو کنید و شناسه را دستی وصل کنید.") +
        ` | پیام اصلی: ${e?.message}`
    )
  }
  markPartiesStale()

  let id = pickId(result, PARTY_ID_KEYS)
  if (!id) {
    // خروجی CreateParty در مستندات نیامده؛ در صورت نبود شناسه، با نام دوباره جستجو می‌کنیم
    const again = await findExistingParty(c.name, c.phone)
    id = again.match ? pickId(again.match, PARTY_ID_KEYS) : null
  }
  if (!id) {
    throw new Error(
      `مشتری در سپیدار ساخته شد ولی شناسه‌اش پیدا نشد. پاسخ: ${JSON.stringify(result)}`
    )
  }

  await prisma.customer.update({
    where: { id: customerId },
    data: { sepidarPartyRef: Number(id) } as any,
  })

  // کد سپیدار مرجع است: روی مشتری اخوان هم می‌نویسیم تا دو سیستم یک کد داشته باشند
  let sepidarCode: string | null = null
  try {
    // ۱) اگر خود CreateParty کد را برگردانده باشد، همان
    let createdParty: any =
      [result, result?.data, result?.result].find(
        (o) => o && typeof o === "object" && cleanCode(o.dlCode ?? o.DlCode)
      ) ?? null

    // ۲) وگرنه همان طرف‌حساب را از سپیدار می‌خوانیم
    if (!createdParty) createdParty = await readCreatedParty(id)

    if (createdParty) {
      sepidarCode = await syncCodeFromSepidar(customerId, createdParty, { force: true })
    } else {
      console.error(`Sepidar: طرف‌حساب ${id} بعد از ساخت پیدا نشد؛ کد روی مشتری نوشته نشد`)
    }
  } catch (e) {
    console.error("Sepidar: خواندن کد مشتری تازه‌ساخته‌شده ممکن نشد", e)
  }

  return {
    partyRef: Number(id),
    created: true,
    linked: false,
    sepidarCode,
    warning: built.notes.length ? built.notes.join("؛ ") : undefined,
  }
}

// برای هر مشتری فقط یک عملیات هم‌زمان: ارسال هم‌زمان چند پیش‌فاکتور یک مشتری
// دیگر دو بار CreateParty نمی‌زند.
const inflightByCustomer = new Map<string, Promise<EnsureResult>>()

/**
 * مشتری اخوان را در سپیدار تضمین می‌کند:
 * 1) اگر قبلاً لینک شده، لینک سنجیده می‌شود (اصلاح خودکار، حفظ، پاک‌کردن لینک حذف‌شده یا توقف ارسال)
 * 2) اگر طرف‌حسابی با همان کد (از لیست یا دیتابیس) هست، به آن لینک می‌کند
 * 3) اگر طرف‌حسابی با همین نام (با هر ترتیب کلمات) هست، به آن لینک می‌کند و کد سپیدار را روی مشتری می‌نویسد
 * 4) در غیر این صورت با CreateParty می‌سازد؛ اگر سپیدار «تکراری» گفت، دوباره جستجو و لینک می‌کند
 */
export function ensureSepidarParty(customerId: string): Promise<EnsureResult> {
  const running = inflightByCustomer.get(customerId)
  if (running) return running
  const p = doEnsure(customerId).finally(() => {
    inflightByCustomer.delete(customerId)
  })
  inflightByCustomer.set(customerId, p)
  return p
}

// گزارش: مشتری‌های وصل‌شده‌ای که کد اخوان (لیست) با کد سپیدارشان فرق دارد
export async function auditCustomerCodes() {
  const parties = await loadParties()
  const byId = new Map<string, PartyRow>()
  for (const p of parties) {
    const id = pickId(p, PARTY_ID_KEYS)
    if (id != null) byId.set(String(id), p)
  }

  const customers = await prisma.customer.findMany({
    where: { sepidarPartyRef: { not: null } },
    select: { name: true, customerCode: true, sepidarPartyRef: true },
  })

  const rows = customers.map((c: any) => {
    const p = byId.get(String(c.sepidarPartyRef))
    const akhavanCode = seedCodeByName.get(nameKey(c.name)) || cleanCode(c.customerCode)
    const sepidarCode = cleanCode(p?.dlCode ?? p?.DlCode)
    return {
      name: c.name,
      akhavanCode: akhavanCode || null,
      sepidarCode: sepidarCode || null,
      sepidarName: p ? partyDisplayName(p).trim() : null,
      partyId: c.sepidarPartyRef,
      differs: Boolean(akhavanCode && sepidarCode && akhavanCode !== sepidarCode),
    }
  })

  const differing = rows.filter((r) => r.differs)
  return {
    linkedCustomers: rows.length,
    differingCount: differing.length,
    differing: differing.slice(0, 100),
  }
}