import { prisma } from "@/lib/prisma"
import { computeOrderTotals } from "@/lib/orderTotals"
import { getAll } from "./client"

const INVOICES_PATH = "/api/sepidar/v1/Sales/GetAllInvoices"

function toLatinDigits(s: string) {
  return (s || "")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
}

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

/** مرز روز به وقت تهران از رشته YYYY-MM-DD یا ISO */
function parseBoundary(
  iso: string | undefined | null,
  endOfDay: boolean
): Date | null {
  if (!iso) return null
  const m = String(iso).trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) {
    const t = endOfDay ? "T23:59:59.999+03:30" : "T00:00:00+03:30"
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}${t}`)
    return isNaN(d.getTime()) ? null : d
  }
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const day = tehranDay(d)
  const t = endOfDay ? "T23:59:59.999+03:30" : "T00:00:00+03:30"
  return new Date(`${day}${t}`)
}

const numOf = (inv: any) => Number(inv?.Number ?? inv?.number)
const partyOf = (inv: any) =>
  Number(inv?.CustomerPartyRef ?? inv?.customerPartyRef)
const idOf = (inv: any) =>
  inv?.InvoiceId ?? inv?.invoiceId ?? inv?.Id ?? inv?.id ?? null
const netOf = (inv: any) => Number(inv?.NetPrice ?? inv?.netPrice)

function dateOf(inv: any): string | null {
  const raw =
    inv?.Date ??
    inv?.date ??
    inv?.InvoiceDate ??
    inv?.invoiceDate ??
    inv?.DocumentDate ??
    null
  if (!raw) return null
  const d = new Date(raw)
  if (isNaN(d.getTime())) return String(raw).slice(0, 10)
  return tehranDay(d)
}

function orderDay(o: any): string | null {
  const raw = o.invoicedAt || o.orderDate
  if (!raw) return null
  const d = new Date(raw)
  if (isNaN(d.getTime())) return null
  return tehranDay(d)
}

/** اقلام فاکتور سپیدار در صورت وجود */
function sepidarItems(inv: any): any[] {
  const list = inv?.Items ?? inv?.items ?? inv?.InvoiceItems ?? []
  return Array.isArray(list) ? list : []
}

function itemRefOf(line: any): number | null {
  const n = Number(
    line?.ItemRef ?? line?.itemRef ?? line?.ItemId ?? line?.itemId
  )
  return Number.isFinite(n) ? n : null
}

function itemCodeOf(line: any): string {
  return String(
    line?.ItemCode ??
      line?.itemCode ??
      line?.Code ??
      line?.code ??
      line?.TracingTitle ??
      line?.tracingTitle ??
      ""
  ).trim()
}

function itemQtyOf(line: any): number {
  return Number(line?.Quantity ?? line?.quantity ?? 0) || 0
}

/**
 * apply=false فقط گزارش؛ apply=true اصلاح وضعیت در اخوان
 */
export async function reconcileSepidarInvoices(opts: {
  apply: boolean
  days?: number
  force?: boolean
  from?: string | null
  to?: string | null
}) {
  const now = new Date()
  let startDate = parseBoundary(opts.from, false)
  let endDate = parseBoundary(opts.to, true)

  if (!startDate || !endDate) {
    const days = Math.min(Math.max(Math.floor(opts.days ?? 45), 1), 400)
    startDate = new Date(now.getTime() - days * 86_400_000)
    const s = tehranDay(startDate)
    startDate = new Date(`${s}T00:00:00+03:30`)
    const e = tehranDay(now)
    endDate = new Date(`${e}T23:59:59.999+03:30`)
  }

  if (endDate < startDate) {
    const t = startDate
    startDate = endDate
    endDate = t
  }

  const spanDays = Math.min(
    400,
    Math.max(
      1,
      Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1
    )
  )

  const StartDate = `${tehranDay(startDate)}T00:00:00`
  const EndDate = `${tehranDay(endDate)}T23:59:59`

  const orders = await prisma.order.findMany({
    where: {
      status: "فاکتور",
      OR: [
        { invoicedAt: { gte: startDate, lte: endDate } },
        {
          invoicedAt: null,
          orderDate: { gte: startDate, lte: endDate },
        },
      ],
    },
    include: { customer: true, items: true },
  })

  const sentCount = orders.filter(
    (o: any) => o.sepidarSyncStatus === "SUCCESS"
  ).length

  const sepidarRows = await getAll(INVOICES_PATH, { StartDate, EndDate }, 200)

  if (sepidarRows.length === 0 && sentCount > 0) {
    throw new Error(
      "هیچ فاکتوری از سپیدار خوانده نشد؛ برای احتیاط چیزی بررسی یا تغییر نکرد. اتصال و دسترسی سپیدار را چک کنید."
    )
  }

  // شماره → همه فاکتورهای سپیدار با آن شماره (برای تشخیص تکراری)
  const byNumber = new Map<number, any[]>()
  // شناسه سپیدار → فاکتور
  const byId = new Map<string, any>()

  for (const inv of sepidarRows) {
    const n = numOf(inv)
    if (Number.isFinite(n)) {
      const arr = byNumber.get(n)
      if (arr) arr.push(inv)
      else byNumber.set(n, [inv])
    }
    const id = idOf(inv)
    if (id != null) byId.set(String(id), inv)
  }

  /** شماره‌های تکراری در خود سپیدار */
  const duplicateInSepidar: any[] = []
  for (const [n, list] of byNumber.entries()) {
    if (list.length < 2) continue
    duplicateInSepidar.push({
      orderNumber: String(n),
      customer: null,
      status: "تکراری در سپیدار",
      count: list.length,
      sepidarInvoiceIds: list.map((i) => idOf(i)).filter(Boolean),
      partyRefs: list.map((i) => partyOf(i)),
      nets: list.map((i) => netOf(i)),
      dates: list.map((i) => dateOf(i)),
    })
  }

  const missingInSepidar: any[] = []
  const markableAsSent: any[] = []
  const wrongParty: any[] = []
  const priceDiff: any[] = []
  const dateDiff: any[] = []
  const itemDiff: any[] = []
  const numberMismatch: any[] = []

  const toReset: string[] = []
  const toMark: { id: string; invoiceId: unknown }[] = []
  let matchedOk = 0

  for (const o of orders as any[]) {
    const num = invoiceNumberOf(o.orderNumber)
    if (!num) continue

    const list = byNumber.get(num) ?? []
    const myParty: number | null = o.customer?.sepidarPartyRef ?? null
    const inv =
      (myParty && list.find((i) => partyOf(i) === myParty)) ||
      (list.length === 1 ? list[0] : null) ||
      null
    const status: string | null = o.sepidarSyncStatus ?? null
    const base = {
      orderNumber: o.orderNumber,
      customer: o.customer?.name ?? null,
      status,
    }

    // اگر با شناسه ذخیره‌شده به فاکتور دیگری وصل شده که شماره‌اش فرق دارد
    if (o.sepidarInvoiceId) {
      const linked = byId.get(String(o.sepidarInvoiceId))
      if (linked) {
        const linkedNum = numOf(linked)
        if (Number.isFinite(linkedNum) && linkedNum !== num) {
          numberMismatch.push({
            ...base,
            expectedNumber: num,
            sepidarNumber: linkedNum,
            sepidarInvoiceId: idOf(linked),
          })
        }
      }
    }

    if (status === "SUCCESS") {
      if (list.length === 0) {
        if (
          o.sepidarSyncedAt &&
          Date.now() - new Date(o.sepidarSyncedAt).getTime() < 15 * 60_000
        ) {
          continue
        }
        missingInSepidar.push({ ...base, expectedNumber: num })
        toReset.push(o.id)
        continue
      }

      // چند فاکتور با همین شماره در سپیدار
      if (list.length > 1) {
        // در duplicateInSepidar هم هست؛ اینجا به سفارش اخوان وصل می‌کنیم
        duplicateInSepidar.push({
          ...base,
          count: list.length,
          sepidarInvoiceIds: list.map((i) => idOf(i)).filter(Boolean),
          partyRefs: list.map((i) => partyOf(i)),
          note: "شماره فاکتور در سپیدار بیش از یک بار وجود دارد",
        })
      }

      if (!inv) {
        wrongParty.push({
          ...base,
          sepidarInvoiceId: idOf(list[0]),
          sepidarPartyRef: partyOf(list[0]),
          akhavanPartyRef: myParty,
        })
        continue
      }

      matchedOk++

      // مبلغ
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

      // تاریخ
      const appDay = orderDay(o)
      const sepDay = dateOf(inv)
      if (appDay && sepDay && appDay !== sepDay) {
        dateDiff.push({
          ...base,
          akhavanDate: appDay,
          sepidarDate: sepDay,
          sepidarInvoiceId: idOf(inv),
        })
      }

      // کالا (فقط اگر سپیدار اقلام را برگرداند)
      const sItems = sepidarItems(inv)
      if (sItems.length > 0) {
        const sepKeys = sItems.map((line) => ({
          ref: itemRefOf(line),
          code: itemCodeOf(line),
          qty: itemQtyOf(line),
        }))
        const appKeys = (o.items || []).map((it: any) => ({
          ref: it.sepidarItemRef != null ? Number(it.sepidarItemRef) : null,
          code: String(it.sepidarItemCode || it.productName || "").trim(),
          name: it.productName,
          qty: Number(it.quantity) || 0,
        }))

        const problems: string[] = []
        // تعداد خطوط
        if (sepKeys.length !== appKeys.length) {
          problems.push(
            `تعداد اقلام: اخوان ${appKeys.length} / سپیدار ${sepKeys.length}`
          )
        }
        // هر قلم اخوان با ref
        for (const a of appKeys) {
          if (a.ref != null && Number.isFinite(a.ref)) {
            const hit = sepKeys.find((s) => s.ref === a.ref)
            if (!hit) {
              problems.push(`کالای اخوان «${a.name}» با کد/رف ${a.ref} در سپیدار نیست`)
            } else if (Math.abs(hit.qty - a.qty) > 0.0001) {
              problems.push(
                `تعداد «${a.name}»: اخوان ${a.qty} / سپیدار ${hit.qty}`
              )
            }
          }
        }

        if (problems.length) {
          itemDiff.push({
            ...base,
            sepidarInvoiceId: idOf(inv),
            detail: problems.join(" | "),
            akhavanItemCount: appKeys.length,
            sepidarItemCount: sepKeys.length,
          })
        }
      }
    } else if (inv) {
      markableAsSent.push({ ...base, sepidarInvoiceId: idOf(inv) })
      toMark.push({ id: o.id, invoiceId: idOf(inv) })
    }
  }

  // یکتا کردن duplicateها بر اساس شماره
  const dupSeen = new Set<string>()
  const duplicateRows = duplicateInSepidar.filter((r) => {
    const k = String(r.orderNumber)
    if (dupSeen.has(k)) return false
    dupSeen.add(k)
    return true
  })

  const suspicious =
    missingInSepidar.length >= 5 &&
    sentCount > 0 &&
    missingInSepidar.length / sentCount > 0.5

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
            sepidarInvoiceId:
              m.invoiceId != null ? String(m.invoiceId) : null,
            sepidarSyncedAt: new Date(),
            sepidarSyncError: null,
          },
        })
      }
      applied = true
    }
  }

  return {
    range: { StartDate, EndDate, days: spanDays },
    sepidarInvoicesRead: sepidarRows.length,
    akhavanInvoicesChecked: orders.length,
    sentChecked: sentCount,
    matchedOk,
    applied,
    refused,
    missingInSepidar: {
      count: missingInSepidar.length,
      rows: missingInSepidar.slice(0, 200),
    },
    markableAsSent: {
      count: markableAsSent.length,
      rows: markableAsSent.slice(0, 200),
    },
    wrongParty: {
      count: wrongParty.length,
      rows: wrongParty.slice(0, 200),
    },
    priceDiff: {
      count: priceDiff.length,
      rows: priceDiff.slice(0, 200),
    },
    dateDiff: {
      count: dateDiff.length,
      rows: dateDiff.slice(0, 200),
    },
    itemDiff: {
      count: itemDiff.length,
      rows: itemDiff.slice(0, 200),
    },
    numberMismatch: {
      count: numberMismatch.length,
      rows: numberMismatch.slice(0, 200),
    },
    duplicateInSepidar: {
      count: duplicateRows.length,
      rows: duplicateRows.slice(0, 200),
    },
  }
}