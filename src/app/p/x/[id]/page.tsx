import type { Metadata } from "next"
import { prisma } from "@/lib/prisma"
import { isValidPublicToken } from "@/lib/publicLinks"
import { buildServicesText } from "@/lib/production/servicesText"
import PrintButton from "../../PrintButton"

// ───────────── صفحه‌ی عمومی برگه‌ی خروج (لینک داخل پیامک «آماده تحویل») ─────────────
// بدون ورود باز می‌شود، فقط با امضای معتبرِ همان سفارش تولید؛ لیست اقلام سفارش با وضعیت
// «آماده تحویل / در حال آماده‌سازی / خارج‌شده» را نشان می‌دهد تا مشتری بداند چه کالاهایی
// آماده‌ی تحویل است. ظاهر مطابق برگه‌ی خروجِ صفحه‌ی بارگیری است.

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata: Metadata = {
  title: "برگه خروج | شیشه و آینه اخوان",
  robots: { index: false, follow: false },
}

const HEADER_IMG = "https://i.ibb.co/nqFvCvnR/DBBFE0-A3-2036-4200-B276-0-B652-BA49849.png"

const norm = (s: string) =>
  (s || "")
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ")
    .trim()

const isReadyWarehouse = (name: string) => {
  const n = norm(name)
  return n.includes("آماده تحویل") || n === norm("انبار محصول دو")
}

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

function resolveSalesItem(order: any, item: any) {
  const list: any[] = Array.isArray(order?.items) ? order.items : []
  if (item.orderItemId) {
    const byId = list.find((si) => si.id === item.orderItemId)
    if (byId) return byId
  }
  const name = (item.productName || "").trim()
  if (!name) return null
  const matches = list.filter((si) => (si.productName || "").trim() === name)
  if (matches.length === 1) return matches[0]
  return matches[0] || null
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

export default async function PublicExitPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ t?: string }>
}) {
  const { id } = await params
  const { t } = await searchParams

  if (!isValidPublicToken("x", id, t)) return <InvalidLink />

  const po = await prisma.productionOrder.findUnique({
    where: { id },
    include: {
      order: { include: { customer: true, items: true } },
      items: {
        include: { stations: { include: { station: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  })
  if (!po || !po.order) return <InvalidLink />

  const order = po.order as any
  const customer = order.customer as any

  const itemIds = po.items.map((it) => it.id)
  const exited = itemIds.length
    ? await prisma.exitSlipItem.findMany({
        where: {
          productionItemId: { in: itemIds },
          exitSlip: { status: { not: "ابطال" } },
        },
        select: { productionItemId: true },
      })
    : []
  const exitedIds = new Set(exited.map((e) => e.productionItemId))

  const rows = po.items.map((it) => {
    const salesItem = resolveSalesItem(order, it)
    const readyStation = it.stations.find((s) => isReadyWarehouse(s.station?.name || ""))
    const isExited = exitedIds.has(it.id)
    const isReady = readyStation?.status === "تکمیل شده"
    return {
      id: it.id,
      productName: it.productName,
      length: it.length,
      width: it.width,
      quantity: it.quantity,
      meterage: it.meterage,
      installationCode: salesItem?.installationCode || null,
      servicesText: buildServicesText(salesItem?.servicesData || null) || null,
      notes: it.notes || salesItem?.notes || null,
      status: isExited ? "خارج شده" : isReady ? "آماده تحویل" : "در حال آماده‌سازی",
    }
  })

  const readyRows = rows.filter((r) => r.status === "آماده تحویل")
  const readyQty = readyRows.reduce((s, r) => s + (r.quantity || 0), 0)
  const readyMeterage = readyRows.reduce((s, r) => s + (Number(r.meterage) || 0), 0)
  const allQty = rows.reduce((s, r) => s + (r.quantity || 0), 0)
  const allMeterage = rows.reduce((s, r) => s + (Number(r.meterage) || 0), 0)

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gray-200 py-6 print:bg-white print:p-0"
      style={{ fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif" }}
    >
      <style>{`
        @media print {
          @page { size: A4; margin: 8mm; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .sheet { box-shadow: none !important; margin: 0 !important; border-radius: 0 !important; }
        }
      `}</style>

      <div className="mx-auto w-full max-w-[210mm] px-3">
        <div className="no-print mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-gray-700">
            این برگه پیش‌نمایش است؛ برگه‌ی رسمی خروج هنگام تحویل صادر می‌شود.
          </p>
          <PrintButton />
        </div>

        <div className="sheet overflow-hidden rounded-lg bg-white shadow-xl">
          <img src={HEADER_IMG} alt="" className="block w-full" />

          <div className="px-8 py-6 text-black print:px-4 print:py-2">
            <div className="mb-4 text-center">
              <h1 className="text-xl font-black">فرم خروج کالا</h1>
              <h2 className="text-lg font-bold">شیشه و آینه اخوان</h2>
              <p className="mt-1 text-sm font-bold text-teal-800">
                لیست اقلام آماده‌ی تحویل
              </p>
            </div>

            <div className="mb-3 flex flex-wrap justify-between gap-2 text-sm">
              <span>
                نام مشتری: <strong>{customer?.name || "—"}</strong>
              </span>
              <span>
                شماره سفارش: <strong>{order.orderNumber}</strong>
              </span>
              <span>
                تاریخ: <strong>{faDate(new Date())}</strong>
              </span>
              {(customer?.phone || order.installationPhone) && (
                <span>
                  تلفن:{" "}
                  <strong dir="ltr">{customer?.phone || order.installationPhone}</strong>
                </span>
              )}
            </div>

            {readyRows.length === 0 && (
              <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-800">
                هنوز هیچ قلمی به وضعیت «آماده تحویل» نرسیده است؛ وضعیت اقلام در جدول زیر
                مشخص شده است.
              </p>
            )}

            <table className="w-full border-collapse border border-black text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-black p-1">ردیف</th>
                  <th className="border border-black p-1">ش سفارش</th>
                  <th className="border border-black p-1">نام کالا</th>
                  <th className="border border-black p-1">طول</th>
                  <th className="border border-black p-1">عرض</th>
                  <th className="border border-black p-1">تعداد</th>
                  <th className="border border-black p-1">متراژ</th>
                  <th className="border border-black p-1">کد نصب</th>
                  <th className="border border-black p-1">خدمات</th>
                  <th className="border border-black p-1">توضیحات</th>
                  <th className="border border-black p-1">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((it, idx) => (
                  <tr key={it.id} className={it.status === "آماده تحویل" ? "bg-green-50" : undefined}>
                    <td className="border border-black p-1 text-center">{idx + 1}</td>
                    <td className="border border-black p-1 text-center">{order.orderNumber}</td>
                    <td className="border border-black p-1">{it.productName}</td>
                    <td className="border border-black p-1 text-center">{it.length ?? "—"}</td>
                    <td className="border border-black p-1 text-center">{it.width ?? "—"}</td>
                    <td className="border border-black p-1 text-center">{it.quantity}</td>
                    <td className="border border-black p-1 text-center">
                      {it.meterage != null ? Number(it.meterage).toFixed(4) : "—"}
                    </td>
                    <td className="border border-black p-1 text-center">{it.installationCode || ""}</td>
                    <td className="border border-black p-1 whitespace-pre-line">{it.servicesText || ""}</td>
                    <td className="border border-black p-1">{it.notes || ""}</td>
                    <td
                      className={`border border-black p-1 text-center font-bold ${
                        it.status === "آماده تحویل"
                          ? "text-green-700"
                          : it.status === "خارج شده"
                            ? "text-gray-500"
                            : "text-amber-700"
                      }`}
                    >
                      {it.status}
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold">
                  <td className="border border-black p-1" colSpan={5}>
                    جمع اقلام آماده‌ی تحویل
                  </td>
                  <td className="border border-black p-1 text-center">{readyQty}</td>
                  <td className="border border-black p-1 text-center">{readyMeterage.toFixed(4)}</td>
                  <td className="border border-black p-1" colSpan={4}></td>
                </tr>
                <tr className="bg-gray-50 font-bold">
                  <td className="border border-black p-1" colSpan={5}>
                    جمع کل سفارش
                  </td>
                  <td className="border border-black p-1 text-center">{allQty}</td>
                  <td className="border border-black p-1 text-center">{allMeterage.toFixed(4)}</td>
                  <td className="border border-black p-1" colSpan={4}></td>
                </tr>
              </tbody>
            </table>

            <p className="mt-4 text-sm leading-7">
              اجناس فوق سالم و شمارش‌شده تحویل اینجانب گردید و تا تسویه نهایی به‌صورت امانی
              نزد اینجانب می‌باشد.
            </p>

            <div className="mt-10 grid grid-cols-3 gap-4 text-center text-sm">
              <div>
                <p className="mb-8 font-bold">مسئول بارگیری</p>
                <p>امضا: ............</p>
              </div>
              <div>
                <p className="mb-8 font-bold">تحویل‌گیرنده</p>
                <p>امضا: ............</p>
              </div>
              <div>
                <p className="mb-8 font-bold">شماره ماشین</p>
                <p>............</p>
              </div>
            </div>
          </div>

          <img src={HEADER_IMG} alt="" className="block w-full" />
        </div>
      </div>
    </div>
  )
}
