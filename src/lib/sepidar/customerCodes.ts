import customersSeedRaw from "@/app/customers/customers-seed.json"

export function norm(s: string) {
  return (s || "")
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

export function toLatinDigits(s: string) {
  return (s || "")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
}

// کد واقعی مشتری (فقط رقم، ۴ تا ۹ رقم)؛ کدهای موقت مثل «C-1730000000000» را رد می‌کند
export function cleanCode(v: unknown) {
  const s = toLatinDigits(String(v ?? "")).trim()
  return /^\d{4,9}$/.test(s) ? s : ""
}

const HONORIFICS = new Set(["آقای", "اقای", "خانم", "دکتر", "مهندس"])

// کلمات نام (بدون علائم نگارشی و عنوان‌ها)
export function nameTokens(s: string): string[] {
  return norm(s)
    .replace(/[.,،؛:;()\-_/\\*]/g, " ")
    .split(" ")
    .filter((t) => t && !HONORIFICS.has(t))
}

// کلید نام، مستقل از ترتیب کلمات
export const nameKey = (s: string) => nameTokens(s).sort().join(" ")

// دو نام حداقل یک کلمه‌ی مشترک دارند، یا فقط در فاصله‌گذاری فرق دارند
// («داورملارجبی» و «داور ملارجبی»). برای اطمینان از اینکه تطبیق با کد، شخص دیگری را برنمی‌دارد.
export function sharesNameToken(a: string, b: string) {
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
export function seedCustomerName(c: any) {
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

export type SeedEntry = { name: string; code: string; group: string }

// همه‌ی مشتری‌های لیست که کد واقعی دارند
export const seedEntries: SeedEntry[] = (customersSeedRaw as unknown as any[])
  .map((c) => ({
    name: seedCustomerName(c),
    code: cleanCode(c?.code),
    group: String(c?.group || ""),
  }))
  .filter((e) => e.code)

// نام → کد. اگر یک نام با دو کد مختلف باشد (مبهم)، مقدار null می‌شود.
export const seedCodeByName = (() => {
  const m = new Map<string, string | null>()
  for (const e of seedEntries) {
    const key = nameKey(e.name)
    if (!key) continue
    if (!m.has(key)) m.set(key, e.code)
    else if (m.get(key) !== e.code) m.set(key, null)
  }
  return m
})()