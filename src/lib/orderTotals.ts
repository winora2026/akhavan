// ───────────── محاسبه‌ی مبالغ سفارش (تنها منبع حقیقت) ─────────────
// همان فرمولی که در صفحه‌ی «ثبت سفارش / پیش‌فاکتور» نمایش داده می‌شود:
//   جمع کالا و خدمات = مجموع totalPrice اقلام (که خدمات هم داخلشان حساب شده)
//   تخفیف            = اگر درصدی باشد: round(جمع × درصد / ۱۰۰)، وگرنه همان discountAmount
//   اضافات           = مبلغ دستی که بعد از تخفیف اضافه می‌شود (extraAmount)
//   ارزش افزوده      = فقط برای فاکتور رسمی: round((جمع − تخفیف + اضافات) × ۰.۱)
//   مبلغ نهایی       = جمع − تخفیف + اضافات + ارزش افزوده
// هر جایی که مبلغ سفارش لازم است (لیست فاکتورها، تبدیل به فاکتور، ارسال به سپیدار، گزارش‌ها)
// باید از همین تابع استفاده کند تا اعداد با پیش‌فاکتور یکی باشد.

export const VAT_RATE = 0.1

type TotalsInput = {
  items?: { totalPrice?: number | string | null }[] | null
  discountAmount?: number | string | null
  discountPercent?: number | string | null
  extraAmount?: number | string | null
  isOfficialInvoice?: boolean | null
}

export type OrderTotals = {
  subtotal: number // جمع کالا و خدمات
  discount: number // تخفیف
  afterDiscount: number // بعد از تخفیف
  extra: number // اضافات
  vat: number // ارزش افزوده (۰ اگر فاکتور رسمی نباشد)
  finalTotal: number // مبلغ قابل پرداخت
}

export function computeOrderTotals(order: TotalsInput): OrderTotals {
  const subtotal = (order.items || []).reduce(
    (sum, it) => sum + (Number(it.totalPrice) || 0),
    0
  )

  const percent =
    order.discountPercent != null && order.discountPercent !== ""
      ? Number(order.discountPercent)
      : null

  const rawDiscount =
    percent != null && !isNaN(percent)
      ? Math.round((subtotal * percent) / 100)
      : Number(order.discountAmount) || 0

  const discount = Math.min(Math.max(rawDiscount, 0), subtotal)
  const afterDiscount = subtotal - discount
  const extra = Math.max(Number(order.extraAmount) || 0, 0)
  const base = afterDiscount + extra
  const vat = order.isOfficialInvoice ? Math.round(base * VAT_RATE) : 0

  return { subtotal, discount, afterDiscount, extra, vat, finalTotal: base + vat }
}

// سفارش را با فیلدهای مبلغ (subtotalAmount / totalAfterDiscount / extraAmountValue / vatAmount / finalTotal) برمی‌گرداند
export function withTotals<T extends TotalsInput>(order: T) {
  const t = computeOrderTotals(order)
  return {
    ...order,
    subtotalAmount: t.subtotal,
    totalAfterDiscount: t.afterDiscount,
    extraAmountValue: t.extra,
    vatAmount: t.vat,
    finalTotal: t.finalTotal,
  }
}