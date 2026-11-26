import type { Metadata } from "next"
import { Fragment } from "react"
import { prisma } from "@/lib/prisma"
import { computeOrderTotals } from "@/lib/orderTotals"
import { isValidPublicToken } from "@/lib/publicLinks"
import { getSession } from "@/lib/auth"
import PrintButton from "../../PrintButton"

// ───────────── صفحه‌ی عمومی پیش‌فاکتور (لینک داخل پیامک ثبت سفارش) ─────────────
// بدون ورود باز می‌شود، فقط با امضای معتبرِ همان سفارش؛ برای مشتری فقط اطلاعات پیش‌فاکتور
// نمایش داده می‌شود. ظاهر مطابق پیش‌نمایش پیش‌فاکتور در صفحه‌ی سفارش است.

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata: Metadata = {
  title: "پیش‌فاکتور | شیشه و آینه اخوان",
  robots: { index: false, follow: false },
}

const HEADER_IMG = "https://i.ibb.co/nqFvCvnR/DBBFE0-A3-2036-4200-B276-0-B652-BA49849.png"

const faDate = (d?: Date | null) => {
  if (!d) return "—"
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      timeZone: "Asia/Tehran",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d)
  } catch {
    return "—"
  }
}

const money = (n: any) => (Number(n) || 0).toLocaleString("en-US")

const persianOnes = ["", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه"]
const persianTens = ["", "ده", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود"]
const persianTeens = ["ده", "یازده", "دوازده", "سیزده", "چهارده", "پانزده", "شانزده", "هفده", "هجده", "نوزده"]
const persianHundreds = ["", "صد", "دویست", "سیصد", "چهارصد", "پانصد", "ششصد", "هفتصد", "هشتصد", "نهصد"]
const persianScale = ["", "هزار", "میلیون", "میلیارد", "بیلیون", "تریلیون"]

const threeDigitToWords = (num: number): string => {
  const parts: string[] = []
  const h = Math.floor(num / 100)
  const rem = num % 100
  if (h) parts.push(persianHundreds[h])
  if (rem >= 10 && rem < 20) {
    parts.push(persianTeens[rem - 10])
  } else {
    const t = Math.floor(rem / 10)
    const o = rem % 10
    if (t) parts.push(persianTens[t])
    if (o) parts.push(persianOnes[o])
  }
  return parts.join(" و ")
}

const numberToPersianWords = (input: number): string => {
  let num = Math.round(Math.abs(input || 0))
  if (num === 0) return "صفر"
  const groups: number[] = []
  while (num > 0) {
    groups.push(num % 1000)
    num = Math.floor(num / 1000)
  }
  const words: string[] = []
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue
    const groupWords = threeDigitToWords(groups[i])
    words.push(i > 0 ? `${groupWords} ${persianScale[i]}` : groupWords)
  }
  return words.join(" و ")
}

type ServiceRow = {
  title?: string
  unit?: string
  count?: string | number
  unitQuantity?: string | number
  unitPrice?: string | number
  totalPrice?: string | number
  note?: string
}

function parseServices(raw?: string | null): ServiceRow[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function InvalidLink() {
  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center bg-gray-100 p-6"
      style={{ fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif" }}
    >
      <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-lg border border-gray-200">
        <h1 className="text-xl font-black text-gray-800">لینک معتبر نیست</h1>
        <p className="mt-3 text-sm leading-7 text-gray-600">
          این لینک ناقص یا نامعتبر است. لطفاً از پیامک دریافتی دوباره باز کنید یا با شرکت
          شیشه و آینه اخوان تماس بگیرید.
        </p>
      </div>
    </div>
  )
}

export default async function PublicInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ t?: string }>
}) {
  const { id } = await params
  const { t } = await searchParams

  if (!isValidPublicToken("i", id, t)) return <InvalidLink />

  const session = await getSession()

  const order = await prisma.order.findUnique({
    where: { id },
    include: { customer: true, items: { orderBy: { sortOrder: "asc" } } },
  })
  if (!order) return <InvalidLink />

  const totals = computeOrderTotals(order)
  const items = order.items as any[]
  const customer = order.customer as any

  const totalMeterage = items.reduce((s, it) => s + (Number(it.meterage) || 0), 0)
  const totalPerimeter = items.reduce((s, it) => s + (Number(it.perimeter) || 0), 0)

  const hasDiscount = totals.discount > 0
  const discountPercentLabel =
    order.discountPercent != null
      ? `${Number(order.discountPercent)}٪`
      : totals.subtotal > 0
        ? `${Math.round((totals.discount / totals.subtotal) * 100)}٪`
        : ""

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gray-200 py-6 print:bg-white print:p-0"
      style={{ fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif" }}
    >
      <style>{`
        @media print {
          @page { size: A4; margin: 6mm; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .sheet { box-shadow: none !important; margin: 0 !important; border-radius: 0 !important; }
        }
      `}</style>

      <div className="mx-auto w-full max-w-[210mm] px-3">
        <div className="no-print mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-gray-700">
            این پیش‌فاکتور فقط برای مشاهده‌ی شماست.
          </p>
          <div className="flex items-center gap-2">
            {session && (
              <a
                href={`/api/print/pdf?orderId=${encodeURIComponent(id)}`}
                className="rounded-xl border border-teal-600 bg-white px-5 py-2.5 text-sm font-bold text-teal-700 shadow hover:bg-teal-50"
              >
                دانلود PDF
              </a>
            )}
            <PrintButton />
          </div>
        </div>

        <div className="sheet overflow-hidden rounded-lg bg-white shadow-xl">
          <img src={HEADER_IMG} alt="" className="block w-full" />

          <div className="px-8 py-6 text-black print:px-4 print:py-2">
            <div className="mb-4 text-center">
              <h2 className="text-2xl font-bold tracking-wide text-teal-800">پیش فاکتور</h2>
            </div>

            <div className="mb-6 flex justify-between rounded-xl border border-teal-100 bg-teal-50 p-4 text-sm leading-7 print:mb-3">
              <div>
                {customer?.customerCode && (
                  <p>
                    <strong>کد مشتری:</strong> <bdi>{customer.customerCode}</bdi>
                  </p>
                )}
                <p>
                  <strong>نام مشتری:</strong> {customer?.name || "—"}
                </p>
                {customer?.phone && (
                  <p>
                    <strong>شماره تماس:</strong> <bdi dir="ltr">{customer.phone}</bdi>
                  </p>
                )}
              </div>
              <div className="text-left">
                <p>
                  <strong>شماره سفارش:</strong> {order.orderNumber}
                </p>
                <p>
                  <strong>تاریخ سفارش:</strong> {faDate(order.orderDate)}
                </p>
                <p>
                  <strong>کارشناس فروش:</strong> {order.salesRep || "—"}
                </p>
              </div>
            </div>

            <table className="mb-5 w-full border-collapse text-sm">
              <thead>
                <tr className="bg-teal-700 text-white">
                  <th className="border border-teal-600 p-2.5 text-center font-bold">ردیف</th>
                  <th className="border border-teal-600 p-2.5 text-center font-bold">نام کالا</th>
                  <th className="border border-teal-600 p-2.5 text-center font-bold">طول</th>
                  <th className="border border-teal-600 p-2.5 text-center font-bold">عرض</th>
                  <th className="border border-teal-600 p-2.5 text-center font-bold">تعداد</th>
                  <th className="border border-teal-600 p-2.5 text-center font-bold">متراژ</th>
                  <th className="border border-teal-600 p-2.5 text-center font-bold">قیمت واحد</th>
                  <th className="border border-teal-600 p-2.5 text-center font-bold">قیمت کل</th>
                  <th className="border border-teal-600 p-2.5 text-center font-bold">توضیحات</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => {
                  const productOnly =
                    (Number(item.meterage) || 0) * (Number(item.unitPrice) || 0)
                  const services = parseServices(item.servicesData)
                  const servicesTotal = services.reduce(
                    (s, sv) => s + (Number(sv.totalPrice) || 0),
                    0
                  )
                  const itemGrand = productOnly + servicesTotal
                  return (
                    <Fragment key={item.id}>
                      <tr>
                        <td className="border border-gray-300 p-2 text-center font-bold">{i + 1}</td>
                        <td className="border border-gray-300 p-2 font-semibold">
                          {item.productCode && (
                            <bdi className="ml-1.5 font-mono text-xs text-teal-700">
                              {item.productCode}
                            </bdi>
                          )}
                          <bdi>{item.productName}</bdi>
                        </td>
                        <td className="border border-gray-300 p-2 text-center">{item.length ?? "—"}</td>
                        <td className="border border-gray-300 p-2 text-center">{item.width ?? "—"}</td>
                        <td className="border border-gray-300 p-2 text-center">{item.quantity}</td>
                        <td className="border border-gray-300 p-2 text-center">
                          {Number(item.meterage || 0).toFixed(2)}
                        </td>
                        <td className="border border-gray-300 p-2 text-center">{money(item.unitPrice)}</td>
                        <td className="border border-gray-300 p-2 text-left font-bold text-teal-800">
                          {money(productOnly)}
                        </td>
                        <td className="border border-gray-300 p-2 text-xs text-gray-700">
                          {item.notes || "—"}
                        </td>
                      </tr>
                      {services.map((s, si) => (
                        <tr key={`${item.id}-s${si}`} className="bg-amber-50/70">
                          <td className="border border-gray-300 p-2"></td>
                          <td className="border border-gray-300 p-2 text-sm font-medium text-amber-900">
                            {s.title || "خدمت"}
                          </td>
                          <td className="border border-gray-300 p-2 text-center text-sm" colSpan={2}>
                            {s.unit || "—"}
                          </td>
                          <td className="border border-gray-300 p-2 text-center text-sm">{s.count ?? ""}</td>
                          <td className="border border-gray-300 p-2 text-center text-sm">
                            {s.unitQuantity ?? ""}
                          </td>
                          <td className="border border-gray-300 p-2 text-center text-sm">
                            {money(s.unitPrice)}
                          </td>
                          <td className="border border-gray-300 p-2 text-left font-bold text-teal-700">
                            {money(s.totalPrice)}
                          </td>
                          <td className="border border-gray-300 p-2 text-xs text-gray-700">{s.note || ""}</td>
                        </tr>
                      ))}
                      <tr key={`${item.id}-sum`} className="bg-teal-100/80">
                        <td colSpan={7} className="border border-gray-300 p-2 text-left font-bold text-teal-900">
                          جمع این ردیف (کالا + خدمات)
                        </td>
                        <td className="border border-gray-300 p-2 text-left text-base font-bold text-teal-900">
                          {money(itemGrand)}
                        </td>
                        <td className="border border-gray-300 p-2"></td>
                      </tr>
                    </Fragment>
                  )
                })}

                <tr className="bg-gray-100">
                  <td colSpan={7} className="border border-gray-300 p-2.5 text-left font-bold">
                    جمع کل کالا و خدمات
                  </td>
                  <td className="border border-gray-300 p-2.5 text-left font-bold text-teal-800">
                    {money(totals.subtotal)}
                  </td>
                  <td className="border border-gray-300 p-2.5"></td>
                </tr>

                {hasDiscount && (
                  <tr className="bg-rose-50">
                    <td colSpan={7} className="border border-gray-300 p-2.5 text-left font-bold text-rose-700">
                      تخفیف{discountPercentLabel ? ` (${discountPercentLabel})` : ""}
                    </td>
                    <td className="border border-gray-300 p-2.5 text-left font-bold text-rose-700">
                      -{money(totals.discount)}
                    </td>
                    <td className="border border-gray-300 p-2.5"></td>
                  </tr>
                )}

                {totals.extra > 0 && (
                  <tr className="bg-sky-50">
                    <td colSpan={7} className="border border-gray-300 p-2.5 text-left font-bold text-sky-700">
                      اضافات
                    </td>
                    <td className="border border-gray-300 p-2.5 text-left font-bold text-sky-700">
                      +{money(totals.extra)}
                    </td>
                    <td className="border border-gray-300 p-2.5"></td>
                  </tr>
                )}

                {order.isOfficialInvoice && (
                  <tr className="bg-amber-50">
                    <td colSpan={7} className="border border-gray-300 p-2.5 text-left font-bold text-amber-700">
                      ارزش افزوده (۱۰٪)
                    </td>
                    <td className="border border-gray-300 p-2.5 text-left font-bold text-amber-700">
                      {money(totals.vat)}
                    </td>
                    <td className="border border-gray-300 p-2.5"></td>
                  </tr>
                )}

                <tr className="bg-teal-700 text-white">
                  <td colSpan={7} className="border border-teal-600 p-3 text-left text-base font-bold">
                    <div className="flex items-center justify-between gap-4">
                      <span className="shrink-0">مبلغ قابل پرداخت</span>
                      <span className="text-xs font-semibold">
                        {numberToPersianWords(totals.finalTotal)} ریال
                      </span>
                    </div>
                  </td>
                  <td className="border border-teal-600 p-3 text-left text-lg font-bold">
                    {money(totals.finalTotal)} ریال
                  </td>
                  <td className="border border-teal-600 p-3"></td>
                </tr>
              </tbody>
            </table>

            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-gray-600 print:mt-2">
              <p>
                تعداد کل اقلام: <strong>{items.length}</strong>
              </p>
              <p>
                متراژ کل: <strong>{totalMeterage.toFixed(2)}</strong>
              </p>
              <p>
                محیط کل: <strong>{totalPerimeter.toFixed(2)}</strong>
              </p>
            </div>

            <div className="mt-8 break-inside-avoid border-t border-gray-200 pt-4 text-sm text-gray-700 print:mt-4">
              <p className="mb-2 font-bold text-teal-800">اطلاعات واریز:</p>
              {order.isOfficialInvoice ? (
                <div className="rounded-lg border border-teal-100 bg-teal-50/50 p-3 leading-6">
                  <p>شماره کارت: 02100001936007</p>
                  <p>به نام: صنایع اخوان شیشه خواجوی</p>
                  <p>شماره شبا: IR02540104202100001936007</p>
                  <p className="mt-1 text-xs text-gray-500">بانک پارسیان</p>
                </div>
              ) : (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 leading-6">
                  <p>شماره کارت: 6221061231052947</p>
                  <p>به نام: مجتبی خاجی</p>
                  <p>شماره شبا / حساب: ۱۹۰۵۴۰۱۲۵۷۲۰۱۰۰۸۸۲۳۳۷۶۰۱</p>
                  <p className="mt-1 text-xs text-gray-500">بانک پارسیان</p>
                </div>
              )}
            </div>
          </div>

          <img src={HEADER_IMG} alt="" className="block w-full" />
        </div>
      </div>
    </div>
  )
}
