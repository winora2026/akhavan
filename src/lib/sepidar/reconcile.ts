import { prisma } from "@/lib/prisma"
import { computeOrderTotals } from "@/lib/orderTotals"
import { getAll } from "./client"

const INVOICES_PATH = "/api/sepidar/v1/Sales/GetAllInvoices"

function toLatinDigits(s: string) {
  return (s || "")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
}

// شماره‌ی فاکتور در سپیدار = شماره‌ی سفارش اخوان
function invoiceNumberOf(orderNumber: string) {
  const n = parseInt(toLatinDigits(String(orderNumber)).replace(/\D/g, ""), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function tehranDay(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

const numOf = (inv: any) => Number(inv?.Number ?? inv?.number)
const partyOf = (inv: any) => Number(inv?.CustomerPartyRef ?? inv?.customerPartyRef)
const idOf = (inv: any) => inv?.InvoiceId ?? inv?.invoiceId ?? inv?.Id ?? inv?.id ?? null
const netOf = (inv: any) => Number(inv?.NetPrice ?? inv?.netPrice)

/**
 * تطبیق وضعیت ارسال سفارش‌های اخوان با فاکتورهای واقعی سپیدار (بر اساس شماره‌ی فاکتور).
 * apply=false فقط گزارش می‌دهد و چیزی را تغییر نمی‌دهد.
 * فقط سفارش‌های «فاکتور» که تاریخشان داخل بازه‌ی days روز اخیر است بررسی می‌شوند.
 */
export async function reconcileSepidarInvoices(opts: {
  apply: boolean
  days?: number
  force?: boolean
}) {
  const days = Math.min(Math.max(Math.floor(opts.days ?? 45), 1), 400)
  const now = new Date()
  const startDate = new Date(now.getTime() - days * 86_400_000)
  const endDate = new Date(now.getTime() + 2 * 86_400_000)
  const StartDate = `${tehranDay(startDate)}T00:00:00`
  const EndDate = `${tehranDay(endDate)}T23:59:59`

  const orders = await prisma.order.findMany({
    where: {
      status: "فاکتور",
      OR: [
        { invoicedAt: { gte: startDate } },
        { invoicedAt: null, orderDate: { gte: startDate } },
      ],
    },
    include: { customer: true, items: true },
  })

  const sentCount = orders.filter((o: any) => o.sepidarSyncStatus === "SUCCESS").length

  // فاکتورهای سپیدار در همین بازه
  const sepidarRows = await getAll(INVOICES_PATH, { StartDate, EndDate }, 200)

  // اگر هیچ فاکتوری خوانده نشد، احتمالاً اتصال یا دسترسی مشکل دارد؛ هیچ‌چیز را تغییر نمی‌دهیم
  if (sepidarRows.length === 0 && sentCount > 0) {
    throw new Error(
      "هیچ فاکتوری از سپیدار خوانده نشد؛ برای احتیاط چیزی بررسی یا تغییر نکرد. اتصال و دسترسی سپیدار را چک کنید."
    )
  }

  const byNumber = new Map<number, any[]>()
  for (const inv of sepidarRows) {
    const n = numOf(inv)
    if (!Number.isFinite(n)) continue
    const arr = byNumber.get(n)
    if (arr) arr.push(inv)
    else byNumber.set(n, [inv])
  }

  const missingInSepidar: any[] = []
  const markableAsSent: any[] = []
  const wrongParty: any[] = []
  const priceDiff: any[] = []
  const toReset: string[] = []
  const toMark: { id: string; invoiceId: unknown }[] = []
  let matchedOk = 0

  for (const o of orders as any[]) {
    const num = invoiceNumberOf(o.orderNumber)
    if (!num) continue

    const list = byNumber.get(num) ?? []
    const myParty: number | null = o.customer?.sepidarPartyRef ?? null
    const inv = (myParty && list.find((i) => partyOf(i) === myParty)) || null
    const status: string | null = o.sepidarSyncStatus ?? null
    const base = { orderNumber: o.orderNumber, customer: o.customer?.name ?? null, status }

    if (status === "SUCCESS") {
      if (list.length === 0) {
        // در اخوان «ارسال‌شده» است ولی در سپیدار نیست (حذف شده)
        missingInSepidar.push({ ...base, expectedNumber: num })
        toReset.push(o.id)
        continue
      }
      if (!inv) {
        // شماره در سپیدار هست ولی روی طرف‌حساب دیگری (یا مشتری اخوان لینک ندارد)
        wrongParty.push({
          ...base,
          sepidarInvoiceId: idOf(list[0]),
          sepidarPartyRef: partyOf(list[0]),
          akhavanPartyRef: myParty,
        })
        continue
      }
      matchedOk++
      const totals = computeOrderTotals(o)
      const diff = netOf(inv) - totals.finalTotal
      if (Number.isFinite(diff) && Math.abs(diff) > 1) {
        priceDiff.push({
          ...base,
          appTotal: totals.finalTotal,
          sepidarNet: netOf(inv),
          diff: Math.round(diff),
        })
      }
    } else if (inv) {
      // در اخوان «ارسال‌نشده/خطا/در حال ارسال» است ولی فاکتورش با همان شماره و همان طرف‌حساب در سپیدار هست
      markableAsSent.push({ ...base, sepidarInvoiceId: idOf(inv) })
      toMark.push({ id: o.id, invoiceId: idOf(inv) })
    }
  }

  // اگر تعداد زیادی «حذف‌شده» پیدا شود، احتمال خواندن ناقص لیست سپیدار هست؛ بدون force ریست نمی‌کنیم
  const suspicious =
    missingInSepidar.length >= 5 && sentCount > 0 && missingInSepidar.length / sentCount > 0.5

  let applied = false
  let refused: string | null = null

  if (opts.apply) {
    if (suspicious && !opts.force) {
      refused =
        "تعداد فاکتورهای «حذف‌شده» نسبت به کل ارسال‌شده‌ها غیرعادی زیاد است (احتمال خواندن ناقص لیست سپیدار). برای اعمال با اطمینان، force: true بفرستید."
    } else {
      for (const id of toReset) {
        await prisma.order.update({
          where: { id },
          data: {
            sepidarSyncStatus: null,
            sepidarInvoiceId: null,
            sepidarSyncedAt: null,
            sepidarSyncError: null,
            sepidarLastPayload: null,
          },
        })
      }
      for (const m of toMark) {
        await prisma.order.update({
          where: { id: m.id },
          data: {
            sepidarSyncStatus: "SUCCESS",
            sepidarInvoiceId: m.invoiceId != null ? String(m.invoiceId) : null,
            sepidarSyncedAt: new Date(),
            sepidarSyncError: null,
          },
        })
      }
      applied = true
    }
  }

  return {
    range: { StartDate, EndDate, days },
    sepidarInvoicesRead: sepidarRows.length,
    akhavanInvoicesChecked: orders.length,
    sentChecked: sentCount,
    matchedOk,
    applied,
    refused,
    missingInSepidar: { count: missingInSepidar.length, rows: missingInSepidar.slice(0, 200) },
    markableAsSent: { count: markableAsSent.length, rows: markableAsSent.slice(0, 200) },
    wrongParty: { count: wrongParty.length, rows: wrongParty.slice(0, 200) },
    priceDiff: { count: priceDiff.length, rows: priceDiff.slice(0, 200) },
  }
}