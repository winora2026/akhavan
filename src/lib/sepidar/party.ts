import { prisma } from "@/lib/prisma"
import { sepidarPost, sepidarGet, extractList, getAll, isMockMode, pickId } from "./client"
import { cleanCode, nameTokens, nameKey, sharesNameToken, seedCodeByName } from "./customerCodes"

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
  partyCache = null
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
  partyCache = null

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
  const cur = parties.find((p) => String(pickId(p, PARTY_ID_KEYS)) === String(c.sepidarPartyRef))

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

  return { partyRef: Number(id), created: true, linked: false, sepidarCode }
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