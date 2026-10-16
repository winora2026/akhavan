import { prisma } from "@/lib/prisma"

type OrderWithRelations = {
  id: string
  orderNumber: string
  orderDate: Date
  invoicedAt: Date | null
  discountAmount: number
  notes: string | null
  customer: {
    id: string
    name: string
    phone: string | null
    address: string | null
    sepidarPartyRef: number | null
  }
  items: {
    productName: string
    quantity: number
    unitPrice: number
    totalPrice: number
    length: number
    width: number
    meterage: number
    notes: string | null
  }[]
}

function normName(s: string) {
  return (s || "")
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

export async function buildCreateInvoicePayload(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      items: { orderBy: { sortOrder: "asc" } },
    },
  })

  if (!order) throw new Error("سفارش یافت نشد")
  if (order.status !== "فاکتور") {
    throw new Error("فقط فاکتور قطعی قابل ارسال به سپیدار است")
  }

  const settings =
    (await prisma.sepidarSettings.findUnique({ where: { id: "default" } })) ||
    (await prisma.sepidarSettings.create({
      data: { id: "default", mockMode: true },
    }))

  if (!settings.saleTypeRef) {
    // در حالت mock مقدار پیش‌فرض می‌گذاریم
    if (process.env.SEPIDAR_MOCK === "false") {
      throw new Error(
        "saleTypeRef در تنظیمات سپیدار خالی است. بعد از توکن از GetAllSaleTypes پر کنید."
      )
    }
  }

  const maps = await prisma.sepidarItemMap.findMany()
  const mapByName = new Map(maps.map((m) => [normName(m.productName), m]))

  const partyRef = order.customer.sepidarPartyRef
  if (!partyRef && process.env.SEPIDAR_MOCK === "false") {
    throw new Error(
      `طرف‌حساب سپیدار برای مشتری «${order.customer.name}» تعریف نشده (sepidarPartyRef)`
    )
  }

  const invoiceDate = order.invoicedAt || order.orderDate

  const items = order.items.map((it, idx) => {
    const map = mapByName.get(normName(it.productName))
    const itemRef = map?.itemRef ?? (process.env.SEPIDAR_MOCK !== "false" ? idx + 1 : 0)
    if (!map && process.env.SEPIDAR_MOCK === "false") {
      throw new Error(
        `نگاشت کالا برای «${it.productName}» در SepidarItemMap وجود ندارد`
      )
    }

    const fee = Number(it.unitPrice) || 0
    const qty = Number(it.quantity) || 1
    const price = Number(it.totalPrice) || fee * qty

    return {
      itemRef,
      quantity: qty,
      secondaryQuantity: null as number | null,
      fee,
      price,
      discount: 0,
      tax: 0,
      duty: 0,
      tracingTitle: order.orderNumber,
      stockRef: map?.stockRef ?? settings.defaultStockRef ?? 1,
      description: [
        it.productName,
        it.length && it.width ? `${it.length}*${it.width}` : null,
        it.meterage ? `م² ${it.meterage}` : null,
        it.notes,
      ]
        .filter(Boolean)
        .join(" | "),
    }
  })

  // تخفیف کل سفارش را روی اولین قلم پخش می‌کنیم (ساده؛ بعداً می‌توان دقیق‌تر کرد)
  if (order.discountAmount > 0 && items.length > 0) {
    items[0].discount = Number(order.discountAmount) || 0
  }

  const payload = {
    customerPartyRef: partyRef || 1,
    customerRealName: null as string | null,
    customerRealNameEn: null as string | null,
    saleTypeRef: settings.saleTypeRef || 1,
    number: null as string | null,
    date: invoiceDate.toISOString().slice(0, 19),
    currencyRef: settings.currencyRef || 1,
    slRef: settings.slRef || 1,
    deliveryLocationRef: settings.deliveryLocationRef || 1,
    state: settings.state || 1,
    settlementType: settings.settlementType || 1,
    rate: settings.rate || 1,
    description: `فاکتور اخوان ${order.orderNumber}${order.notes ? " | " + order.notes : ""}`,
    items,
    extraData: {
      stringColumn1: order.orderNumber,
      stringColumn2: order.customer.name,
      note: order.notes || "",
    },
  }

  return { order, payload, settings }
}