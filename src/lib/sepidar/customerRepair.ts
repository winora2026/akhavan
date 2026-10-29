import { prisma } from "@/lib/prisma"
import { getAll, pickId } from "./client"
import customersSeedRaw from "@/app/customers/customers-seed.json"

function norm(s: string) {
  return (s || "")
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function toLatinDigits(s: string) {
  return (s || "")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
}

// کد واقعی مشتری (فقط رقم، ۴ تا ۹ رقم)؛ کدهای موقت مثل «C-1730000000000» را رد می‌کند
function cleanCode(v: unknown) {
  const s = toLatinDigits(String(v ?? "")).trim()
  return /^\d{4,9}$/.test(s) ? s : ""
}

const PARTY_ID_KEYS = ["partyId", "id", "ref", "partyRef", "partySerial", "PartyId", "Id"]
const HONORIFICS = new Set(["آقای", "اقای", "خانم", "دکتر", "مهندس"])

function nameTokens(s: string): string[] {
  return norm(s)
    .replace(/[.,،؛:;()\-_/\\]/g, " ")
    .split(" ")
    .filter((t) => t && !HONORIFICS.has(t))
}

const nameKey = (s: string) => nameTokens(s).sort().join(" ")

function partyDisplayName(p: any) {
  return `${p?.name ?? p?.Name ?? ""} ${p?.lastName ?? p?.LastName ?? ""}`.trim()
}

// دو نام حداقل یک کلمه‌ی مشترک دارند، یا فقط در فاصله‌گذاری فرق دارند
// («داورملارجبی» و «داور ملارجبی»). برای اطمینان از اینکه تطبیق با کد، شخص دیگری را برنمی‌دارد.
function sharesNameToken(a: string, b: string) {
  const na = nameTokens(a).filter((t) => t.length >= 2)
  const nb = nameTokens(b).filter((t) => t.length >= 2)
  const setB = new Set(nb)
  if (na.some((t) => setB.has(t))) return true

  const joinA = na.join("")
  const joinB = nb.join("")
  const sortA = [...na].sort().join("")
  const sortB = [...nb].sort().join("")
  return joinA.length >= 4 && (joinA === joinB || sortA === sortB)
}

// نام مشتری با همان قاعده‌ی صفحه‌ی ثبت سفارش (تا با Customer.name یکی باشد)
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

// اگر یک نام با دو کد مختلف باشد (مبهم)، مقدار null می‌شود
const seedCodeByName = (() => {
  const m = new Map<string, string | null>()
  for (const c of customersSeedRaw as unknown as any[]) {
    const key = nameKey(seedCustomerName(c))
    const code = cleanCode(c?.code)
    if (!key || !code) continue
    if (!m.has(key)) m.set(key, code)
    else if (m.get(key) !== code) m.set(key, null)
  }
  return m
})()

async function loadParties() {
  const rows = await getAll("/api/sepidar/v1/Parties/GetAllParty", { IsCustomer: true }, 400)
  const byId = new Map<string, any>()
  for (const p of rows) {
    const id = pickId(p, PARTY_ID_KEYS)
    if (id == null) continue
    if (!byId.has(String(id))) byId.set(String(id), p)
  }
  return Array.from(byId.values())
}

const isCustomerParty = (p: any) => (p?.isCustomer ?? p?.IsCustomer) === true

/**
 * اصلاح لینک مشتری‌هایی که به طرف‌حساب اشتباه وصل شده‌اند.
 * مرجع حقیقت: کد مشتری در فایل seed (همان کدی که در صفحه‌ی ثبت سفارش دیده می‌شود)؛
 * باید با dlCode همان طرف‌حساب در سپیدار برابر باشد.
 * apply=false فقط گزارش می‌دهد.
 * فاکتورهایی که قبلاً با لینک اشتباه رفته‌اند در سپیدار همان‌طور می‌مانند و باید جداگانه اصلاح شوند.
 */
export async function relinkCustomersByCode(apply: boolean) {
  const parties = await loadParties()
  const byId = new Map<string, any>()
  const byDl = new Map<string, any[]>()
  for (const p of parties) {
    const id = String(pickId(p, PARTY_ID_KEYS))
    byId.set(id, p)
    const dl = cleanCode(p?.dlCode ?? p?.DlCode)
    if (!dl) continue
    const arr = byDl.get(dl)
    if (arr) arr.push(p)
    else byDl.set(dl, [p])
  }

  const customers = await prisma.customer.findMany({
    where: { sepidarPartyRef: { not: null } },
    select: { id: true, name: true, customerCode: true, sepidarPartyRef: true },
  })

  const fix: any[] = []
  const review: any[] = []
  const ambiguous: string[] = []
  let fine = 0
  let notInSeed = 0

  for (const c of customers as any[]) {
    const key = nameKey(c.name)
    if (!seedCodeByName.has(key)) {
      notInSeed++ // در seed نیست؛ مرجعی برای مقایسه نداریم
      continue
    }
    const code = seedCodeByName.get(key)
    if (code === null || code === undefined) {
      ambiguous.push(c.name) // در seed با چند کد مختلف آمده
      continue
    }

    const current = byId.get(String(c.sepidarPartyRef))
    const currentCode = cleanCode(current?.dlCode ?? current?.DlCode)
    if (currentCode === code) {
      fine++
      continue
    }

    const all = byDl.get(code) ?? []
    const customersOnly = all.filter(isCustomerParty)
    const hits = customersOnly.length ? customersOnly : all
    const currentInfo = {
      partyId: c.sepidarPartyRef,
      exists: Boolean(current), // false یعنی این طرف‌حساب در سپیدار پیدا نشد (احتمالاً حذف شده)
      code: currentCode || null,
      name: current ? partyDisplayName(current) : null,
    }

    if (hits.length === 0) {
      review.push({ name: c.name, akhavanCode: code, current: currentInfo, reason: "طرف‌حسابی با این کد در سپیدار پیدا نشد" })
      continue
    }
    if (hits.length > 1) {
      review.push({ name: c.name, akhavanCode: code, current: currentInfo, reason: "چند طرف‌حساب با این کد در سپیدار هست" })
      continue
    }
    const target = hits[0]
    if (!sharesNameToken(c.name, partyDisplayName(target))) {
      review.push({
        name: c.name,
        akhavanCode: code,
        current: currentInfo,
        target: { partyId: pickId(target, PARTY_ID_KEYS), name: partyDisplayName(target) },
        reason: "نام مشتری و نام طرف‌حسابِ هم‌کد هیچ شباهتی ندارند؛ دستی بررسی شود",
      })
      continue
    }

    const sentOrders = await prisma.order.count({
      where: { customerId: c.id, sepidarSyncStatus: "SUCCESS" },
    })
    fix.push({
      customerId: c.id,
      name: c.name,
      akhavanCode: code,
      from: currentInfo,
      to: { partyId: Number(pickId(target, PARTY_ID_KEYS)), name: partyDisplayName(target) },
      sentOrders, // این فاکتورها در سپیدار روی طرف‌حساب قبلی مانده‌اند
    })
  }

  if (apply) {
    for (const f of fix) {
      try {
        await prisma.customer.update({
          where: { id: f.customerId },
          data: { sepidarPartyRef: f.to.partyId, customerCode: f.akhavanCode } as any,
        })
      } catch (e) {
        // اگر کد روی مشتری دیگری ثبت شده باشد (customerCode یکتاست)، فقط لینک را اصلاح می‌کنیم
        console.error("Sepidar: ثبت کد مشتری ممکن نشد؛ فقط لینک اصلاح شد", e)
        await prisma.customer.update({
          where: { id: f.customerId },
          data: { sepidarPartyRef: f.to.partyId } as any,
        })
      }
    }
  }

  return {
    applied: apply,
    linkedCustomers: customers.length,
    fineCount: fine,
    notInSeedCount: notInSeed,
    fixCount: fix.length,
    fix: fix.slice(0, 200),
    reviewCount: review.length,
    review: review.slice(0, 200),
    ambiguousCount: ambiguous.length,
    ambiguous: ambiguous.slice(0, 100),
  }
}