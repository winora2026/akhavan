import { prisma } from "@/lib/prisma"
import { isRentalOrderNumber, hasCuttingWage } from "@/lib/rentalOrder"

function norm(s: string) {
  return (s || "")
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

/**
 * نگاشت نام خدمت فروش → نام ایستگاه تولید
 * ترتیب ifها مهم است
 */
export function mapServiceToStation(serviceName: string): string | null {
  const name = norm(serviceName)
  if (!name) return null

  if (
    name.includes("بسته") ||
    name.includes("پکیج") ||
    name.includes("پکيج") ||
    name.includes("pack")
  ) {
    return "بسته بندی"
  }

  // تراش الگویی قبل از تراش
  if (name.includes("تراش الگویی") || name.includes("الگویی")) {
    return "تراش الگویی"
  }
  if (name.includes("تراش")) return "تراش"

  // دیاموند زاویه / زاویه / ۴۵ درجه — قبل از دیاموند ساده
  if (
    name.includes("دیاموند زاویه") ||
    name.includes("زاویه") ||
    name.includes("45 درجه") ||
    name.includes("۴۵ درجه") ||
    name.includes("45درجه") ||
    name.includes("۴۵درجه")
  ) {
    return "دیاموند زاویه"
  }

  // دیاموند، دیاموند مینی، دیاموند مات
  if (name.includes("دیاموند")) return "دیاموند"

  // لول یکپارچه: معمولی، براق، ابرویی، فرم ۳۵، خورشیدی، دالبری، طبق الگو، گوشه
  if (
    name.includes("لول") ||
    name.includes("ابرویی") ||
    name.includes("ابرويی") ||
    name.includes("فرم 35") ||
    name.includes("فرم ۳۵") ||
    name.includes("35 درجه") ||
    name.includes("۳۵ درجه") ||
    name.includes("خورشیدی") ||
    name.includes("خورشيدي") ||
    name.includes("دالبری") ||
    name.includes("دالبري") ||
    name.includes("طبق الگو") ||
    name.includes("گوشه")
  ) {
    return "لول"
  }

  if (name.includes("لیمینت") || name.includes("لمینت")) return "لیمینت"
  if (name.includes("دوجداره") || name.includes("دو جداره")) return "دوجداره"

  // جاساز CNC → CNC (قبل از جاساز دستی و قبل از بلاک عمومی CNC)
  if (
    name.includes("جاساز") &&
    (name.includes("cnc") || name.includes("سی ان سی"))
  ) {
    return "CNC"
  }

  // CNC: اینگریو، مته CNC، ...
  if (
    name.includes("اینگرو") ||
    name.includes("اینگریو") ||
    name.includes("انگرو") ||
    name.includes("cnc") ||
    name.includes("سی ان سی")
  ) {
    return "CNC"
  }

  // جاساز دستی
  if (name.includes("جاساز")) return "جاساز"

  // مته عمومی / سوراخکاری (بعد از مته CNC)
  if (name.includes("مته") || name.includes("سوراخ")) return "سوراخکاری"

  if (
    name.includes("uv") ||
    name.includes("یووی") ||
    name.includes("یو وی") ||
    name.includes("یو-وی")
  ) {
    return "UV"
  }

  if (
    name.includes("led") ||
    name.includes("ال ای دی") ||
    name.includes("ال‌ای‌دی")
  ) {
    return "LED"
  }
  if (name.includes("mdf")) return "MDF"
  if (name.includes("سندبلاست") || name.includes("سند بلاست")) return "سندبلاست"
  if (name.includes("سکوریت") || name.includes("تمپر")) return "سکوریت"

  if (name.includes("چاپ") || name.includes("رنگ")) return "چاپ (رنگ‌کاری)"

  if (name.includes("قاب")) return "قاب"
  if (name.includes("خم")) return "خم‌کاری"

  if (name.includes("شست")) return "شست و شو"
  if (name.includes("بارگیری")) return "بارگیری"

  return null
}

function collectServiceNames(salesItem: any): string[] {
  const names: string[] = []
  if (salesItem?.servicesData) {
    try {
      const parsed =
        typeof salesItem.servicesData === "string"
          ? JSON.parse(salesItem.servicesData)
          : salesItem.servicesData
      if (Array.isArray(parsed)) {
        for (const s of parsed) {
          const n = s.title || s.name || ""
          if (n) names.push(String(n))
        }
      }
    } catch {}
  }
  return names
}

// includeCut = false → ایستگاه «برش» در مسیر قرار نمی‌گیرد (سفارش اجرتیِ بدون «اجرت برش»)
function buildRouteStationNames(salesItem: any, includeCut = true): string[] {
  const route: string[] = includeCut ? ["برش"] : []
  const serviceStationSet = new Set<string>()
  let hasPackaging = false

  const serviceNames = collectServiceNames(salesItem)
  const extraText = [
    salesItem?.notes,
    salesItem?.description,
    salesItem?.productName,
  ]
    .filter(Boolean)
    .map(String)

  for (const serviceName of [...serviceNames, ...extraText]) {
    const mapped = mapServiceToStation(serviceName)
    if (!mapped) continue
    if (mapped === "بسته بندی") {
      hasPackaging = true
      continue
    }
    if (mapped === "شست و شو" || mapped === "بارگیری") continue
    serviceStationSet.add(mapped)
  }

  const preferredOrder = [
    "تراش الگویی",
    "دیاموند",
    "دیاموند زاویه",
    "لول",
    "CNC",
    "جاساز",
    "UV",
    "سوراخکاری",
    "سندبلاست",
    "چاپ (رنگ‌کاری)",
    "قاب",
    "خم‌کاری",
    "LED",
    "MDF",
    "لیمینت",
    "دوجداره",
    "سکوریت",
  ]

  if (serviceStationSet.has("تراش")) {
    route.push("تراش ۱")
    route.push("تراش ۲")
  }

  for (const name of preferredOrder) {
    if (serviceStationSet.has(name)) route.push(name)
  }

  route.push("شست و شو")
  if (hasPackaging) route.push("بسته بندی")
  route.push("انبار کالای نیمه‌ساخته")
  route.push("انبار آماده تحویل")
  route.push("بارگیری")
  return route
}

async function getNextBarcode(): Promise<string> {
  const last = await prisma.productionItem.findMany({
    where: { barcode: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { barcode: true },
  })
  let maxNum = 1050000
  for (const row of last) {
    const n = parseInt(row.barcode || "", 10)
    if (!isNaN(n) && n > maxNum) maxNum = n
  }
  const total = await prisma.productionItem.count()
  return String(Math.max(maxNum + 1, 1050001 + total))
}

async function getNextProductionNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `PROD-${year}-`

  const rows = await prisma.productionOrder.findMany({
    where: { productionNumber: { startsWith: prefix } },
    select: { productionNumber: true },
  })

  let max = 0
  for (const row of rows) {
    const part = row.productionNumber.split("-").pop() || "0"
    const n = parseInt(part, 10)
    if (!isNaN(n) && n > max) max = n
  }

  return `${prefix}${String(max + 1).padStart(4, "0")}`
}

function findStationId(
  stations: { id: string; name: string }[],
  name: string
): string | null {
  const n = norm(name)
  const found = stations.find((s) => norm(s.name) === n)
  if (found) return found.id

  if (n.includes("نیمه") || n === norm("انبار محصول یک")) {
    const s = stations.find(
      (x) =>
        norm(x.name).includes("نیمه") ||
        norm(x.name) === norm("انبار محصول یک")
    )
    if (s) return s.id
  }
  if (n.includes("آماده تحویل") || n === norm("انبار محصول دو")) {
    const s = stations.find(
      (x) =>
        norm(x.name).includes("آماده") ||
        norm(x.name) === norm("انبار محصول دو")
    )
    if (s) return s.id
  }
  if (n === "لول" || n.includes("لول")) {
    const s = stations.find(
      (x) =>
        norm(x.name) === "لول" ||
        norm(x.name) === norm("لول معمولی") ||
        norm(x.name) === norm("لول براق")
    )
    if (s) return s.id
  }
  if (n.includes("چاپ")) {
    const s = stations.find((x) => norm(x.name).includes("چاپ"))
    if (s) return s.id
  }
  if (n.includes("بسته")) {
    const pack = stations.find((s) => norm(s.name).includes("بسته"))
    if (pack) return pack.id
  }
  return null
}

// ───────────── امضای قطعه (برای تشخیص قطعات جدید/ویرایش‌شده در ارسال مجدد) ─────────────
// امضای هر قطعه‌ی فروش در فیلد thickness قطعه‌ی تولید با پیشوند SIG_PREFIX نگه داشته می‌شود
// (این فیلد جای دیگری استفاده نمی‌شود؛ نیازی به تغییر دیتابیس نیست).
const SIG_PREFIX = "sig:"
export const TAG_NEW = "ارسال مجدد: قطعه‌ی جدید"
export const TAG_EDITED = "ارسال مجدد: قطعه‌ی ویرایش‌شده"

function parseServices(sd: any): any[] {
  if (!sd) return []
  try {
    const p = typeof sd === "string" ? JSON.parse(sd) : sd
    return Array.isArray(p) ? p : []
  } catch {
    return []
  }
}

/** هرچه روی برگه‌ی برش/لیبل/خدمات اثر دارد در امضا هست؛ قیمت‌ها نیست */
export function itemSignature(si: any): string {
  const svc = parseServices(si?.servicesData)
    .map((s: any) =>
      [
        norm(String(s?.title || s?.name || "")),
        String(s?.unit ?? ""),
        String(s?.count ?? ""),
        String(s?.unitQuantity ?? ""),
        String(s?.lengthCount ?? ""),
        String(s?.widthCount ?? ""),
        norm(String(s?.note ?? "")),
      ].join("|")
    )
    .sort()
  return JSON.stringify({
    n: norm(si?.productName || ""),
    l: Number(si?.length || 0),
    w: Number(si?.width || 0),
    q: Number(si?.quantity || 1),
    s: svc,
    d: norm(si?.notes || ""),
    p: String(si?.pieceNumber ?? ""),
    i: String(si?.installationCode ?? ""),
  })
}

async function createPieceWithRoute(
  productionOrderId: string,
  salesItem: any,
  allStations: { id: string; name: string }[],
  isRental: boolean,
  tag: string | null
) {
  const barcode = await getNextBarcode()
  const prodItem = await prisma.productionItem.create({
    data: {
      productionOrderId,
      orderItemId: salesItem.id,
      productName: salesItem.productName,
      length: salesItem.length,
      width: salesItem.width,
      quantity: salesItem.quantity,
      meterage: salesItem.meterage,
      status: "در انتظار",
      barcode,
      thickness: SIG_PREFIX + itemSignature(salesItem),
    },
  })

  const includeCut = !isRental || hasCuttingWage(salesItem)
  const routeStationNames = buildRouteStationNames(salesItem, includeCut)
  let sequence = 1
  for (const stationName of routeStationNames) {
    const stationId = findStationId(allStations, stationName)
    if (!stationId) continue
    await prisma.productionItemStation.create({
      data: {
        productionItemId: prodItem.id,
        stationId,
        sequence,
        status: "در انتظار",
        quantityIn: prodItem.quantity,
      },
    })
    sequence++
  }

  if (tag) {
    await prisma.productionHistory.create({
      data: {
        productionOrderId,
        productionItemId: prodItem.id,
        action: tag,
        description: `${salesItem.productName} | بارکد ${barcode}`,
      },
    })
  }
  return prodItem
}

export type CreateProductionResult =
  | { ok: true; data: any }
  | { ok: false; status: number; error: string }

export async function createProductionOrderFromSales(
  orderId: string
): Promise<CreateProductionResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      customer: true,
    },
  })

  if (!order) {
    return { ok: false, status: 404, error: "سفارش یافت نشد" }
  }

  if (order.status !== "فاکتور") {
    return {
      ok: false,
      status: 400,
      error: "فقط فاکتورهای نهایی شده قابل ارسال به تولید هستند",
    }
  }

  const existing = await prisma.productionOrder.findFirst({
    where: { orderId: order.id },
  })
  if (existing) {
    return {
      ok: false,
      status: 400,
      error: "این فاکتور قبلاً به تولید ارسال شده است",
    }
  }

  const allStations = await prisma.productionStation.findMany()
  const required = [
    "برش",
    "شست و شو",
    "انبار کالای نیمه‌ساخته",
    "انبار آماده تحویل",
    "بارگیری",
  ]
  for (const name of required) {
    if (!findStationId(allStations, name)) {
      return {
        ok: false,
        status: 400,
        error: `ایستگاه «${name}» تعریف نشده. ابتدا seed ایستگاه‌ها را اجرا کنید.`,
      }
    }
  }

  // سفارش اجرتی (سریال ۹۰۰xxx): فقط قلم‌هایی که «اجرت برش» دارند وارد ایستگاه برش می‌شوند
  const isRental = isRentalOrderNumber(order.orderNumber)

  const productionNumber = await getNextProductionNumber()

  const productionOrder = await prisma.productionOrder.create({
    data: {
      orderId: order.id,
      productionNumber,
      status: "در انتظار",
      priority: order.priority || "عادی",
      notes: order.notes,
    },
  })

  for (const item of order.items) {
    await createPieceWithRoute(productionOrder.id, item, allStations, isRental, null)
  }

  await prisma.productionHistory.create({
    data: {
      productionOrderId: productionOrder.id,
      action: "ایجاد سفارش تولید",
      description: `سفارش تولید ${productionNumber} از فاکتور ${order.orderNumber} ایجاد شد`,
      newStatus: "در انتظار",
    },
  })

  const result = await prisma.productionOrder.findUnique({
    where: { id: productionOrder.id },
    include: {
      items: {
        include: {
          stations: {
            include: { station: true },
            orderBy: { sequence: "asc" },
          },
        },
      },
    },
  })

  return { ok: true, data: result }
}

export type SyncProductionResult =
  | {
      ok: true
      created: boolean
      added: number
      edited: number
      removed: number
      unchanged: number
      kept: number
      notes: string[]
    }
  | { ok: false; status: number; error: string }

/**
 * ارسال مجدد فاکتور ویرایش‌شده به تولید.
 * قطعاتی که تغییری نکرده‌اند دست نمی‌خورند (همان بارکد، همان وضعیت لیبل/برگه).
 * قطعه‌ی جدید → قطعه‌ی تولید جدید با بارکد جدید (برچسب «جدید»)
 * قطعه‌ی ویرایش‌شده → قطعه‌ی قبلی حذف و قطعه‌ی تازه با بارکد جدید (برچسب «ویرایش‌شده»)
 * قطعه‌ی حذف‌شده از فاکتور → از تولید حذف می‌شود (اگر هنوز هیچ ایستگاهی را رد نکرده باشد)
 */
export async function syncProductionOrderFromSales(
  orderId: string
): Promise<SyncProductionResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, customer: true },
  })
  if (!order) return { ok: false, status: 404, error: "سفارش یافت نشد" }

  const prod = await prisma.productionOrder.findFirst({
    where: { orderId: order.id },
    include: {
      items: { include: { stations: { include: { station: true } } } },
    },
  })
  if (!prod) {
    const r: any = await createProductionOrderFromSales(order.id)
    if (!r.ok) return { ok: false, status: r.status, error: r.error }
    return {
      ok: true,
      created: true,
      added: order.items.length,
      edited: 0,
      removed: 0,
      unchanged: 0,
      kept: 0,
      notes: [],
    }
  }

  const allStations = await prisma.productionStation.findMany()
  const isRental = isRentalOrderNumber(order.orderNumber)
  const notes: string[] = []

  // قطعه‌های برش مجدد (فرزند) جدا هستند و دست نمی‌خورند
  const oldItems = prod.items.filter((p: any) => !p.parentItemId)
  const usedOld = new Set<string>()
  const usedNew = new Set<string>()
  const unchangedPairs: { oldId: string; newId: string; hadSig: boolean; sig: string }[] = []

  const oldSig = (p: any): string | null =>
    typeof p.thickness === "string" && p.thickness.startsWith(SIG_PREFIX)
      ? p.thickness.slice(SIG_PREFIX.length)
      : null

  // قطعه‌ی قدیمی بدون امضا: با نام + ابعاد + تعداد + همان مسیر ایستگاه‌ها مقایسه می‌شود
  const legacyEqual = (p: any, si: any) => {
    if (norm(p.productName || "") !== norm(si.productName || "")) return false
    if (Number(p.length || 0) !== Number(si.length || 0)) return false
    if (Number(p.width || 0) !== Number(si.width || 0)) return false
    if (Number(p.quantity || 1) !== Number(si.quantity || 1)) return false
    const includeCut = !isRental || hasCuttingWage(si)
    const want = buildRouteStationNames(si, includeCut)
      .map((n) => findStationId(allStations, n))
      .filter(Boolean)
      .join(",")
    const have = [...p.stations]
      .sort((a: any, b: any) => a.sequence - b.sequence)
      .map((s: any) => s.stationId)
      .join(",")
    return want === have
  }

  // ۱) بدون تغییر: امضای یکسان
  for (const p of oldItems) {
    const sig = oldSig(p)
    if (!sig) continue
    const si = order.items.find(
      (x) => !usedNew.has(x.id) && itemSignature(x) === sig
    )
    if (si) {
      usedOld.add(p.id)
      usedNew.add(si.id)
      unchangedPairs.push({ oldId: p.id, newId: si.id, hadSig: true, sig })
    }
  }
  // ۲) قطعات قدیمیِ بدون امضا
  for (const p of oldItems) {
    if (usedOld.has(p.id) || oldSig(p)) continue
    const si = order.items.find((x) => !usedNew.has(x.id) && legacyEqual(p, x))
    if (si) {
      usedOld.add(p.id)
      usedNew.add(si.id)
      unchangedPairs.push({ oldId: p.id, newId: si.id, hadSig: false, sig: itemSignature(si) })
    }
  }

  // آیا قطعه‌ی تولید هنوز دست‌نخورده است (می‌شود حذف/جایگزین کرد)؟
  const isUntouched = (p: any) =>
    p.stations.every(
      (s: any) => s.status === "در انتظار" && !(s.quantityOut || 0)
    )

  let added = 0
  let edited = 0
  let removed = 0
  let kept = 0

  const remainingOld = oldItems.filter((p) => !usedOld.has(p.id))
  const remainingNew = order.items.filter((x) => !usedNew.has(x.id))

  // ۳) ویرایش‌شده: هم‌نام (و در صورت امکان هم‌ترتیب)
  const editedPairs: { old: any; si: any }[] = []
  const relinkOnly: { oldId: string; newId: string }[] = []
  for (const p of remainingOld) {
    const si = remainingNew.find(
      (x) =>
        !usedNew.has(x.id) &&
        norm(x.productName || "") === norm(p.productName || "")
    )
    if (si) {
      usedNew.add(si.id)
      editedPairs.push({ old: p, si })
    }
  }
  const editedOldIds = new Set(editedPairs.map((e) => e.old.id))

  for (const { old, si } of editedPairs) {
    if (!isUntouched(old)) {
      kept++
      notes.push(
        `«${old.productName}» (بارکد ${old.barcode || "—"}) ویرایش شده ولی قبلاً وارد ایستگاه شده؛ همان قطعه‌ی قبلی نگه داشته شد و باید دستی بررسی شود`
      )
      // قطعه‌ی جدیدی ساخته نمی‌شود (تا دوبار تولید نشود)؛ فقط به قلم جدید وصل می‌شود
      relinkOnly.push({ oldId: old.id, newId: si.id })
      continue
    }
    await deletePieceCompletely(old.id)
    await createPieceWithRoute(prod.id, si, allStations, isRental, TAG_EDITED)
    edited++
  }

  // ۴) حذف‌شده از فاکتور
  for (const p of remainingOld) {
    if (editedOldIds.has(p.id)) continue
    if (!isUntouched(p)) {
      kept++
      notes.push(
        `«${p.productName}» (بارکد ${p.barcode || "—"}) از فاکتور حذف شده ولی قبلاً وارد ایستگاه شده؛ در تولید نگه داشته شد`
      )
      continue
    }
    await deletePieceCompletely(p.id)
    removed++
  }

  // ۵) جدید
  for (const si of order.items) {
    if (usedNew.has(si.id)) continue
    await createPieceWithRoute(prod.id, si, allStations, isRental, TAG_NEW)
    added++
  }

  // ۶) بدون تغییر: فقط به قلم جدید فاکتور وصل و (در صورت نبودن) امضا ثبت شود
  for (const u of unchangedPairs) {
    await prisma.productionItem.update({
      where: { id: u.oldId },
      data: {
        orderItemId: u.newId,
        ...(u.hadSig ? {} : { thickness: SIG_PREFIX + u.sig }),
      },
    })
  }
  for (const r of relinkOnly) {
    await prisma.productionItem.update({
      where: { id: r.oldId },
      data: { orderItemId: r.newId },
    })
  }
  // فرزندهای برش مجدد به قلم جدید والدشان وصل می‌شوند
  for (const u of unchangedPairs) {
    await prisma.productionItem.updateMany({
      where: { parentItemId: u.oldId },
      data: { orderItemId: u.newId },
    })
  }

  await prisma.productionOrder.update({
    where: { id: prod.id },
    data: { priority: order.priority || "عادی", notes: order.notes },
  })

  await prisma.productionHistory.create({
    data: {
      productionOrderId: prod.id,
      action: "ارسال مجدد فاکتور ویرایش‌شده",
      description: `جدید: ${added} | ویرایش‌شده: ${edited} | حذف‌شده: ${removed} | بدون تغییر: ${unchangedPairs.length}${
        kept ? ` | نیازمند بررسی: ${kept}` : ""
      }`,
    },
  })

  return {
    ok: true,
    created: false,
    added,
    edited,
    removed,
    unchanged: unchangedPairs.length,
    kept,
    notes,
  }
}

async function deletePieceCompletely(productionItemId: string) {
  await prisma.productionHistory.deleteMany({ where: { productionItemId } })
  await prisma.productionItemStation.deleteMany({ where: { productionItemId } })
  await prisma.waste.deleteMany({ where: { productionItemId } })
  await prisma.productionItem.delete({ where: { id: productionItemId } })
}