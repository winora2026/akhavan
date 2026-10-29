// ───────────── ارسال پیامک از طریق API پنل پیامکی ─────────────
// تنظیمات از فایل .env خوانده می‌شود و هرگز به مرورگر نمی‌رسد:
//   SMS_PROVIDER = kavenegar | smsir | mock   (خالی = mock؛ یعنی پیامک واقعی نمی‌رود)
//   SMS_API_KEY  = کلید API پنل
//   SMS_SENDER   = شماره‌ی خط ارسال‌کننده

import customersSeedRaw from "@/app/customers/customers-seed.json"

export type SmsResult =
  | { ok: true; mock?: boolean; providerId?: string }
  | { ok: false; error: string }

const toLatinDigits = (s: string) =>
  s
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))

// انواع نوشتن موبایل (۰۹۱۲…، ۹۱۲…، ۹۸۹۱۲…، ۰۰۹۸۹۱۲…) را به فرم ۰۹xxxxxxxxx تبدیل می‌کند؛ نامعتبر = null
export function normalizeIranMobile(raw: string | null | undefined): string | null {
  let n = toLatinDigits(String(raw || "")).replace(/\D/g, "")
  if (n.startsWith("0098")) n = n.slice(4)
  else if (n.startsWith("98")) n = n.slice(2)
  else if (n.startsWith("0")) n = n.slice(1)
  return /^9\d{9}$/.test(n) ? `0${n}` : null
}

// ── پیدا کردن شماره‌ی مشتری: دیتابیس، profile و فایل مشتریان قدیمی ──
const norm = (v: any) =>
  toLatinDigits(String(v ?? ""))
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200c\u200f\u200e]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()

// فیلدهایی که ممکن است شماره داشته باشند (phones در فایل مشتریان قدیمی آرایه است)
const PHONE_KEYS = [
  "mobile",
  "mobiles",
  "mobilePhone",
  "cellphone",
  "cellPhone",
  "phone",
  "phones",
  "phoneNumber",
  "tel",
]

const PHONE_LIKE = /^[\d\s\-+()۰-۹٠-٩]{7,20}$/

// هر مقدار (رشته، عدد، آرایه یا آبجکتِ تو در تو) را می‌گردد و هرچه شبیه شماره باشد جمع می‌کند
function collectPhones(v: any, out: string[], depth = 0) {
  if (v == null || depth > 4) return
  if (typeof v === "string" || typeof v === "number") {
    const s = String(v).trim()
    if (PHONE_LIKE.test(s)) out.push(s)
    return
  }
  if (Array.isArray(v)) {
    v.forEach((x) => collectPhones(x, out, depth + 1))
    return
  }
  if (typeof v === "object") {
    Object.values(v).forEach((x) => collectPhones(x, out, depth + 1))
  }
}

function phonesFrom(obj: any): string[] {
  if (!obj || typeof obj !== "object") return []
  const out: string[] = []
  PHONE_KEYS.forEach((k) => collectPhones(obj[k], out))
  return out
}

export function findSeed(customer: any): any {
  const code = String(customer?.customerCode || "").trim()
  const name = norm(customer?.name)
  return (customersSeedRaw as any[]).find(
    (c) =>
      (code && String(c.code || "").trim() === code) ||
      (name &&
        [
          c.companyName,
          `${c.lastName || ""} ${c.firstName || ""}`,
          `${c.firstName || ""} ${c.lastName || ""}`,
        ].some((n) => norm(n) === name))
  )
}

function seedPhones(customer: any): string[] {
  const hit = findSeed(customer)
  return hit ? phonesFrom(hit) : []
}

// فقط برای عیب‌یابی موقت (بعد از رفع مشکل می‌شود حذفش کرد). رقم‌ها با # پنهان می‌شوند.
export function seedDebug(customer: any): string {
  const hit = findSeed(customer)
  if (!hit) return "seed: پیدا نشد"
  const fields = Object.keys(hit).filter((k) => hit[k]).join(", ")
  const shape = JSON.stringify(hit.phones ?? null).replace(/[0-9۰-۹٠-٩]/g, "#")
  return `seed: پیدا شد | فیلدها: ${fields}\nساختار phones: ${shape}`
}

export function pickCustomerPhone(customer: any): string {
  let profile: any = null
  try {
    profile = customer?.profile ? JSON.parse(customer.profile) : null
  } catch {}

  const candidates = [...phonesFrom(customer), ...phonesFrom(profile), ...seedPhones(customer)]
  // اولین شماره‌ای که موبایل معتبر باشد؛ وگرنه اولین شماره (تا پیام خطای دقیق نشان داده شود)
  return candidates.find((p) => normalizeIranMobile(p)) || candidates[0] || ""
}

// متن پیامک ثبت سفارش
export function buildOrderSms(customerName: string, orderNumber: string) {
  return `مشتری گرامی ${customerName}، سفارش شماره ${orderNumber} شما با موفقیت در شرکت شیشه و آینه اخوان ثبت شد. از اعتماد شما سپاسگزاریم.`
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 15000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

export async function sendSms(mobile: string, text: string): Promise<SmsResult> {
  const provider = (process.env.SMS_PROVIDER || "mock").toLowerCase()
  const key = process.env.SMS_API_KEY || ""
  const sender = process.env.SMS_SENDER || ""

  if (provider === "mock") {
    console.log(`[SMS mock] ${mobile}: ${text}`)
    return { ok: true, mock: true }
  }
  if (!key) return { ok: false, error: "SMS_API_KEY در تنظیمات سرور وارد نشده" }

  try {
    // ── کاوه‌نگار ──
    if (provider === "kavenegar") {
      const body = new URLSearchParams({ receptor: mobile, message: text })
      if (sender) body.set("sender", sender)
      const res = await fetchWithTimeout(`https://api.kavenegar.com/v1/${key}/sms/send.json`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      })
      const data: any = await res.json().catch(() => null)
      if (res.ok && data?.return?.status === 200) {
        return { ok: true, providerId: String(data?.entries?.[0]?.messageid ?? "") }
      }
      return { ok: false, error: data?.return?.message || `خطای پنل (HTTP ${res.status})` }
    }

    // ── sms.ir ──
    if (provider === "smsir") {
      if (!sender) return { ok: false, error: "SMS_SENDER (شماره خط) وارد نشده" }
      const res = await fetchWithTimeout("https://api.sms.ir/v1/send/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "X-API-KEY": key },
        body: JSON.stringify({ lineNumber: Number(sender), messageText: text, mobiles: [mobile.slice(1)] }),
      })
      const data: any = await res.json().catch(() => null)
      if (res.ok && data?.status === 1) return { ok: true, providerId: String(data?.data?.packId ?? "") }
      return { ok: false, error: data?.message || `خطای پنل (HTTP ${res.status})` }
    }

    return { ok: false, error: `SMS_PROVIDER نامعتبر است: ${provider}` }
  } catch (e: any) {
    return {
      ok: false,
      error: e?.name === "AbortError" ? "پاسخی از پنل پیامکی نرسید (timeout)" : e?.message || "خطای ارتباط با پنل پیامکی",
    }
  }
}