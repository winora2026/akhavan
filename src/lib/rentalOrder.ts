// ───────────── کمک‌توابع سفارش‌های اجرتی ─────────────
// سفارش اجرتی = شماره‌ی سفارش در سریال ۹۰۰xxx (همان سریالی که در api/orders/route.ts می‌سازیم)
export const RENTAL_ORDER_MIN = 900000
export const RENTAL_ORDER_MAX = 999999

export function isRentalOrderNumber(
  orderNumber: string | number | null | undefined
): boolean {
  const n = parseInt(String(orderNumber ?? ""), 10)
  return !isNaN(n) && n >= RENTAL_ORDER_MIN && n <= RENTAL_ORDER_MAX
}

// حذف فاصله و نیم‌فاصله و یکسان‌سازی ی/ک تا «اجرت برش» و «اجرت‌برش» یکی حساب شوند
const compact = (v: unknown) =>
  String(v ?? "")
    .replace(/[\u200c\u200f\u200e\s]/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")

const CUTTING_WAGE_KEY = "اجرتبرش"

// آیا این قلم «اجرت برش» دارد؟ (در توضیحات قلم یا عنوان یکی از خدماتش)
export function hasCuttingWage(salesItem: any): boolean {
  if (compact(salesItem?.notes).includes(CUTTING_WAGE_KEY)) return true

  let services: any = salesItem?.servicesData
  if (typeof services === "string") {
    try {
      services = JSON.parse(services)
    } catch {
      services = null
    }
  }
  if (Array.isArray(services)) {
    return services.some((s: any) =>
      compact(s?.title || s?.name).includes(CUTTING_WAGE_KEY)
    )
  }
  return false
}