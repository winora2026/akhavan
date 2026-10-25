import { prisma } from "@/lib/prisma"
import { sepidarPost, getAll, isMockMode, pickId } from "./client"

function norm(s: string) {
  return (s || "")
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function digits(s: string) {
  return (s || "")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\D/g, "")
}

const PARTY_ID_KEYS = ["partyId", "id", "ref", "partyRef", "partySerial", "PartyId", "Id"]

// عنوان‌های احترام که در مقایسه‌ی نام نادیده گرفته می‌شوند
const HONORIFICS = new Set(["آقای", "اقای", "خانم", "دکتر", "مهندس"])

// کلمات نام (بدون علائم نگارشی و عنوان‌ها)
function nameTokens(s: string): string[] {
  return norm(s)
    .replace(/[.,،؛:;()\-_/\\]/g, " ")
    .split(" ")
    .filter((t) => t && !HONORIFICS.has(t))
}

// کلید نام، مستقل از ترتیب کلمات:
// «آذریان غلام عباس» (نام‌خانوادگی اول) و «غلام عباس آذریان» (نام اول) یکی حساب می‌شوند
const nameKey = (s: string) => nameTokens(s).sort().join(" ")

function partyDisplayName(p: any) {
  const first = p?.name ?? p?.Name ?? ""
  const last = p?.lastName ?? p?.LastName ?? ""
  return `${first} ${last}`
}

export function buildCreatePartyPayload(customer: {
  name: string
  phone?: string | null
  address?: string | null
}) {
  const phoneType = Number(process.env.SEPIDAR_PHONE_TYPE || 1)
  const addressType = Number(process.env.SEPIDAR_ADDRESS_TYPE || 1)

  const phones = (customer.phone || "")
    .split(/[،,;\/\s]+/)
    .map(digits)
    .filter((p) => p.length >= 7)
    .map((p, i) => ({ type: phoneType, phone: p, isMain: i === 0 }))

  const addresses = customer.address?.trim()
    ? [{ type: addressType, address: customer.address.trim(), isMain: true }]
    : []

  return {
    name: customer.name.trim(),
    isCustomer: true,
    ...(phones.length ? { phones } : {}),
    ...(addresses.length ? { addresses } : {}),
  }
}

// ───────────── لیست طرف‌حساب‌ها (کش ۱۰ دقیقه‌ای) ─────────────
// هم مشتری‌ها و هم طرف‌حساب‌هایی که «مشتری» نیستند خوانده می‌شوند، چون کد/شناسه‌ی یکتا
// بین همه‌ی طرف‌حساب‌ها مشترک است و ممکن است تکراری از نوع دیگری باشد.
const MAX_PAGES = 400 // × ۵۰ ردیف = حداکثر ۲۰٬۰۰۰ طرف‌حساب

type PartyRow = any

let partyCache: { at: number; list: PartyRow[] } | null = null
let partyInflight: Promise<PartyRow[]> | null = null

async function loadParties(): Promise<PartyRow[]> {
  if (partyCache && Date.now() - partyCache.at < 10 * 60_000) return partyCache.list
  if (!partyInflight) {
    partyInflight = (async () => {
      const customers = await getAll(
        "/api/sepidar/v1/Parties/GetAllParty",
        { IsCustomer: true },
        MAX_PAGES
      )
      let others: any[] = []
      try {
        others = await getAll(
          "/api/sepidar/v1/Parties/GetAllParty",
          { IsCustomer: false },
          MAX_PAGES
        )
      } catch (e) {
        // اگر سپیدار این فیلتر را نپذیرفت، فقط لیست مشتری‌ها کافی است
        console.error("Sepidar: خواندن طرف‌حساب‌های غیرمشتری ممکن نشد", e)
      }

      // سپیدار فیلتر IsCustomer=false را گاهی نادیده می‌گیرد و همه‌ی طرف‌حساب‌ها را برمی‌گرداند.
      // بدون حذف تکراری‌ها هر مشتری دو بار در لیست می‌آمد و تطبیق نرم به‌خاطر «دو کاندید» رد می‌شد.
      // پس بر اساس شناسه یکتا می‌کنیم و نوع (مشتری/غیرمشتری) را از خود فیلد isCustomer می‌خوانیم.
      const byId = new Map<string, PartyRow>()
      const add = (p: any, fallbackSrc: "customer" | "other") => {
        const flag = p?.isCustomer ?? p?.IsCustomer
        const src = typeof flag === "boolean" ? (flag ? "customer" : "other") : fallbackSrc
        const id = pickId(p, PARTY_ID_KEYS)
        const key = id != null ? String(id) : `row-${byId.size}`
        const row = { ...p, __src: src }
        const prev = byId.get(key)
        if (!prev || (prev.__src !== "customer" && src === "customer")) byId.set(key, row)
      }
      customers.forEach((p) => add(p, "customer"))
      others.forEach((p) => add(p, "other"))

      const list = Array.from(byId.values())
      partyCache = { at: Date.now(), list }
      return list
    })().finally(() => {
      partyInflight = null
    })
  }
  return partyInflight
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

async function linkToCustomer(customerId: string, party: PartyRow) {
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
  return {
    partyRef: Number(id),
    created: false,
    linked: true,
    // اگر طرف‌حساب پیداشده «مشتری» نباشد، ثبت فاکتور فروش برای او ممکن است خطا بدهد
    warning: party.__src === "other" ? "طرف‌حساب پیداشده در سپیدار از نوع مشتری نیست" : undefined,
  }
}

// اتصال دستی مشتری به یک طرف‌حساب سپیدار (وقتی تطبیق خودکار ممکن نیست)
export async function linkCustomerToSepidarParty(customerId: string, partyRef: number) {
  await prisma.customer.update({
    where: { id: customerId },
    data: { sepidarPartyRef: Number(partyRef) } as any,
  })
  return { partyRef: Number(partyRef) }
}

type EnsureResult = {
  partyRef: number
  created: boolean
  linked: boolean
  mock?: boolean
  warning?: string
}

async function doEnsure(customerId: string): Promise<EnsureResult> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } })
  if (!customer) throw new Error("مشتری یافت نشد")

  const c: any = customer
  if (c.sepidarPartyRef) {
    return { partyRef: Number(c.sepidarPartyRef), created: false, linked: false }
  }

  if (isMockMode()) {
    return { partyRef: 1, created: false, linked: false, mock: true }
  }

  // ۱) اگر در سپیدار هست، فقط لینک می‌کنیم (بدون ساخت تکراری)
  const found = await findExistingParty(c.name, c.phone)
  if (found.match) return linkToCustomer(customerId, found.match)

  // ۲) در غیر این صورت می‌سازیم
  const payload = buildCreatePartyPayload(c)
  let result: any
  try {
    result = await sepidarPost("/api/sepidar/v1/Parties/CreateParty", payload)
  } catch (e: any) {
    if (!isDuplicateError(e)) throw e

    // سپیدار می‌گوید این طرف‌حساب (کد/شناسه‌ی یکتا) از قبل هست ولی با نام پیدایش نکردیم:
    // لیست را تازه می‌خوانیم و این بار با تطبیق نرم‌تر دنبالش می‌گردیم
    partyCache = null
    const retry = await findExistingParty(c.name, c.phone, { fuzzy: true })
    if (retry.match) return linkToCustomer(customerId, retry.match)

    const sample = retry.candidates
      .slice(0, 5)
      .map((p) => `${partyDisplayName(p).trim()} (شناسه: ${pickId(p, PARTY_ID_KEYS) ?? "؟"})`)
      .join("، ")
    throw new Error(
      `سپیدار این مشتری را تکراری می‌داند ولی طرف‌حسابِ مطابق پیدا نشد (نام: «${c.name}»). ` +
        (sample
          ? `نزدیک‌ترین‌ها: ${sample}. شناسه‌ی درست را با linkCustomerToSepidarParty دستی وصل کنید.`
          : "در سپیدار با نام، کد و کد ملی جستجو کنید و شناسه را دستی وصل کنید.") +
        ` | پیام اصلی: ${e?.message}`
    )
  }
  partyCache = null

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
  return { partyRef: Number(id), created: true, linked: false }
}

// برای هر مشتری فقط یک عملیات هم‌زمان: ارسال هم‌زمان چند پیش‌فاکتور یک مشتری
// دیگر دو بار CreateParty نمی‌زند.
const inflightByCustomer = new Map<string, Promise<EnsureResult>>()

/**
 * مشتری اخوان را در سپیدار تضمین می‌کند:
 * 1) اگر قبلاً لینک شده همان را برمی‌گرداند
 * 2) اگر طرف‌حسابی با همین نام (با هر ترتیب کلمات، هم مشتری و هم غیرمشتری) هست، به آن لینک می‌کند
 * 3) در غیر این صورت با CreateParty می‌سازد؛ اگر سپیدار «تکراری» گفت، دوباره جستجو و لینک می‌کند
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