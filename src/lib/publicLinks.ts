// ───────────── لینک‌های عمومی پیامک (بدون نیاز به ورود) ─────────────
// هر لینک = شناسه + امضای HMAC؛ بدون امضای درست، صفحه‌ی عمومی محتوا را نشان نمی‌دهد.
// آدرس پایه از .env خوانده می‌شود: SMS_LINK_BASE_URL (مثلاً https://crm.example.com)
// اگر تنظیم نشده باشد، لینکی داخل پیامک گذاشته نمی‌شود (به‌جای لینکِ غیرقابل‌دسترس برای مشتری).

import crypto from "crypto"

const SECRET =
  process.env.SMS_LINK_SECRET ||
  process.env.AUTH_SECRET ||
  "akhavan-secret-change-me-in-production-32chars"

export type PublicLinkKind = "i" | "x" // i = پیش‌فاکتور سفارش، x = برگه‌ی خروج/اقلام آماده

function signature(kind: PublicLinkKind, id: string) {
  return crypto
    .createHmac("sha256", SECRET)
    .update(`${kind}:${id}`)
    .digest("base64url")
    .slice(0, 32)
}

export function isValidPublicToken(
  kind: PublicLinkKind,
  id: string,
  token: string | null | undefined
) {
  if (!id || !token) return false
  const expected = signature(kind, id)
  const a = Buffer.from(String(token))
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/** توکن عمومی یک لینک (برای رندر داخلی سرور، مثلاً ساخت PDF از صفحه‌ی عمومی) */
export function publicToken(kind: PublicLinkKind, id: string) {
  return signature(kind, id)
}

export function publicBaseUrl(): string | null {
  const raw = (process.env.SMS_LINK_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || "").trim()
  if (!raw) return null
  return raw.replace(/\/+$/, "")
}

/** لینک مشاهده‌ی پیش‌فاکتور یک سفارش؛ null یعنی آدرس پایه تنظیم نشده */
export function orderPublicLink(orderId: string): string | null {
  const base = publicBaseUrl()
  if (!base) return null
  return `${base}/p/i/${encodeURIComponent(orderId)}?t=${signature("i", orderId)}`
}

/** لینک برگه‌ی خروج (اقلام آماده‌ی تحویل) یک سفارش تولید؛ null یعنی آدرس پایه تنظیم نشده */
export function exitPublicLink(productionOrderId: string): string | null {
  const base = publicBaseUrl()
  if (!base) return null
  return `${base}/p/x/${encodeURIComponent(productionOrderId)}?t=${signature("x", productionOrderId)}`
}
