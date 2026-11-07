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
export const TAG_RELABEL = "ارسال مجدد: اصلاح لیبل و خدمات"

/** وضعیت قطعه‌ای که کاملاً ضایعات شده و برایش برش مجدد ثبت شده:
 *  از تولید و کارتابل‌ها خارج است (ایستگاه‌هایش حذف می‌شود) و فقط در گزارش ضایعات می‌ماند. */
export const SCRAPPED_STATUS = "ضایعات"

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
  tag: string | null,
  opts?: { quantity?: number; parentItemId?: string }
) {
  const barcode = await getNextBarcode()
  const q = opts?.quantity ?? salesItem.quantity
  const meterage =
    opts?.quantity != null && salesItem.quantity
      ? ((salesItem.meterage || 0) * opts.quantity) / salesItem.quantity
      : salesItem.meterage
  const prodItem = await prisma.productionItem.create({
    data: {
      productionOrderId,
      orderItemId: salesItem.id,
      productName: salesItem.productName,
      length: salesItem.length,
      width: salesItem.width,
      quantity: q,
      meterage,
      status: "در انتظار",
      barcode,
      // قطعه‌ی اضافه (تفاوت تعداد) امضا ندارد و فرزند قطعه‌ی اصلی حساب می‌شود
      ...(opts?.parentItemId
        ? { parentItemId: opts.parentItemId }
        : { thickness: SIG_PREFIX + itemSignature(salesItem) }),
    } as any,
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
      updated: number
      relabeled: number
      extra: number
      kept: number
      notes: string[]
    }
  | { ok: false; status: number; error: string }

/** امضا را به دو بخش «مشخصات قطعه» (نام، طول، عرض، تعداد) و «خدمات/توضیحات» تقسیم می‌کند */
function splitSig(sig: string): { core: string; vars: string } | null {
  try {
    const o = JSON.parse(sig)
    return {
      core: JSON.stringify([o.n, o.l, o.w, o.q]),
      vars: JSON.stringify([o.s, o.d, o.p, o.i]),
    }
  } catch {
    return null
  }
}

/** مسیر ایستگاه‌های مورد نیاز یک قلم فروش (شناسه‌ی ایستگاه‌ها، بدون تکرار) */
function wantedStationIds(
  salesItem: any,
  allStations: { id: string; name: string }[],
  isRental: boolean
) {
  const includeCut = !isRental || hasCuttingWage(salesItem)
  const ids: string[] = []
  for (const n of buildRouteStationNames(salesItem, includeCut)) {
    const id = findStationId(allStations, n)
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

/**
 * قطعه‌ی موجود را بدون برش مجدد و با همان بارکد اصلاح می‌کند:
 * ایستگاه‌های لازم جدید اضافه، ایستگاه‌های منتظرِ دیگر لازم حذف و ترتیب دوباره شماره‌گذاری می‌شود.
 */
async function updatePieceInPlace(
  p: any,
  si: any,
  allStations: { id: string; name: string }[],
  isRental: boolean,
  labelChanged: boolean
) {
  const wanted = wantedStationIds(si, allStations, isRental)
  const rows = [...p.stations].sort((a: any, b: any) => a.sequence - b.sequence)
  let routeChanged = false

  const keep: any[] = []
  for (const r of rows) {
    if (
      !wanted.includes(r.stationId) &&
      r.status === "در انتظار" &&
      !(r.quantityOut || 0)
    ) {
      await prisma.productionHistory.deleteMany({
        where: { productionItemStationId: r.id },
      })
      await prisma.productionItemStation.delete({ where: { id: r.id } })
      routeChanged = true
    } else {
      keep.push(r)
    }
  }

  const finalRows: { id?: string; stationId: string }[] = keep.map((r) => ({
    id: r.id,
    stationId: r.stationId,
  }))
  const have = new Set(keep.map((r) => r.stationId))
  const addedStationIds: string[] = []
  for (const sid of wanted) {
    if (have.has(sid)) continue
    routeChanged = true
    addedStationIds.push(sid)
    const wi = wanted.indexOf(sid)
    let pos = finalRows.findIndex((fr) => wanted.indexOf(fr.stationId) > wi)
    if (pos === -1) pos = finalRows.length
    finalRows.splice(pos, 0, { stationId: sid })
  }

  if (routeChanged) {
    // دو مرحله، تا اگر روی (قطعه، شماره‌ی ترتیب) محدودیت یکتایی باشد تداخل نشود
    for (let i = 0; i < finalRows.length; i++) {
      const fr = finalRows[i]
      if (fr.id) {
        await prisma.productionItemStation.update({
          where: { id: fr.id },
          data: { sequence: 1000 + i },
        })
      }
    }
    for (let i = 0; i < finalRows.length; i++) {
      const fr = finalRows[i]
      if (fr.id) {
        await prisma.productionItemStation.update({
          where: { id: fr.id },
          data: { sequence: i + 1 },
        })
      } else {
        await prisma.productionItemStation.create({
          data: {
            productionItemId: p.id,
            stationId: fr.stationId,
            sequence: i + 1,
            status: "در انتظار",
            quantityIn: p.quantity,
          },
        })
      }
    }
  }

  // قطعه‌ای که قبلاً به «انبار آماده تحویل» رسیده و حالا خدمت جدیدی گرفته:
  // ایستگاه‌های انبارِ بعد از خدمت جدید دوباره «در انتظار» می‌شوند تا بعد از انجام خدمت، دوباره به انبار برگردد.
  let reopenedWarehouse = false
  if (addedStationIds.length > 0) {
    const nameById = new Map(allStations.map((x) => [x.id, x.name]))
    const fresh = await prisma.productionItemStation.findMany({
      where: { productionItemId: p.id },
      orderBy: { sequence: "asc" },
    })
    const firstNewSeq = Math.min(
      ...fresh
        .filter((r: any) => addedStationIds.includes(r.stationId))
        .map((r: any) => r.sequence)
    )
    for (const r of fresh) {
      if (r.sequence <= firstNewSeq) continue
      if (!String(nameById.get(r.stationId) || "").includes("انبار")) continue
      if (!String(r.status || "").replace(/\u200c/g, " ").includes("تکمیل")) continue
      await prisma.productionItemStation.update({
        where: { id: r.id },
        data: { status: "در انتظار", quantityOut: 0 },
      })
      reopenedWarehouse = true
    }
  }

  const relabel = labelChanged || routeChanged
  await prisma.productionItem.update({
    where: { id: p.id },
    data: {
      orderItemId: si.id,
      thickness: SIG_PREFIX + itemSignature(si),
      // قطعه‌ای که قبلاً تمام‌شده بود و حالا ایستگاه جدید دارد دوباره در جریان است
      ...(routeChanged &&
      (reopenedWarehouse || addedStationIds.length > 0) &&
      String(p.status || "").replace(/\u200c/g, " ") === "تکمیل شده"
        ? { status: "در حال تولید" }
        : {}),
      // لیبل چاپ‌شده باید دوباره (با همان بارکد) چاپ شود
      ...(relabel && p.labelStatus === "چاپ‌شده"
        ? { labelStatus: "مجاز چاپ مجدد", labelReprintAllowed: true }
        : {}),
    },
  })
  if (relabel) {
    await prisma.productionHistory.create({
      data: {
        productionOrderId: p.productionOrderId,
        productionItemId: p.id,
        action: TAG_RELABEL,
        description: `${p.productName} | بارکد ${p.barcode || "—"}${
          routeChanged ? " | مسیر ایستگاه‌ها اصلاح شد" : ""
        }`,
      },
    })
  }
  return { routeChanged, relabeled: relabel }
}

/**
 * ارسال مجدد فاکتور ویرایش‌شده به تولید.
 *
 * • بدون تغییر: دست‌نخورده.
 * • فقط خدمات/توضیحات/کد نصب عوض شده (مثلاً تراش ۱/۵ → تراش ۲، یا اضافه شدن مته):
 *   قطعه دوباره برش نمی‌خورد؛ با همان بارکد، مسیر ایستگاه‌ها اصلاح و لیبل «مجاز چاپ مجدد» می‌شود.
 * • قلم جدید: قطعه‌ی تولید جدید با بارکد جدید (برچسب «جدید»).
 * • نام/ابعاد/تعداد عوض شده: اگر قطعه هنوز وارد ایستگاهی نشده، با قطعه‌ی تازه (بارکد جدید) جایگزین می‌شود؛
 *   اگر وارد ایستگاه شده: افزایش تعداد = قطعه‌ی اضافه برای تفاوت؛ بقیه‌ی تغییرات دستی بررسی می‌شود.
 * • حذف‌شده از فاکتور: اگر هنوز دست‌نخورده باشد حذف می‌شود، وگرنه برای بررسی دستی نگه داشته می‌شود.
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
      updated: 0,
      relabeled: 0,
      extra: 0,
      kept: 0,
      notes: [],
    }
  }

  const allStations = await prisma.productionStation.findMany()
  const isRental = isRentalOrderNumber(order.orderNumber)
  const notes: string[] = []

  // قطعه‌های برش مجدد/اضافه (فرزند) جدا هستند و در تطبیق نمی‌آیند
  const oldItems = prod.items.filter((p: any) => !p.parentItemId)

  const coreOfProd = (p: any) =>
    JSON.stringify([
      norm(p.productName || ""),
      Number(p.length || 0),
      Number(p.width || 0),
      Number(p.quantity || 1),
    ])
  const sigOf = (p: any): string | null =>
    typeof p.thickness === "string" && p.thickness.startsWith(SIG_PREFIX)
      ? p.thickness.slice(SIG_PREFIX.length)
      : null

  const oldInfo = oldItems.map((p: any) => {
    const sig = sigOf(p)
    const sp = sig ? splitSig(sig) : null
    return { p, sig, core: sp?.core ?? coreOfProd(p), vars: sp?.vars ?? null }
  })
  const newInfo = order.items.map((si: any) => {
    const full = itemSignature(si)
    const sp = splitSig(full)!
    return { si, full, core: sp.core, vars: sp.vars }
  })

  const usedOld = new Set<string>()
  const usedNew = new Set<string>()

  const routeEqual = (p: any, si: any) => {
    const want = wantedStationIds(si, allStations, isRental).join(",")
    const have = [...p.stations]
      .sort((a: any, b: any) => a.sequence - b.sequence)
      .map((s: any) => s.stationId)
      .join(",")
    return want === have
  }

  const unchangedPairs: { p: any; si: any; hadSig: boolean; full: string }[] = []
  const inplacePairs: { p: any; si: any; labelChanged: boolean }[] = []
  const corePairs: { p: any; si: any; oldQ: number; newQ: number }[] = []

  // ۱) بدون تغییر
  for (const o of oldInfo) {
    const n = newInfo.find((x) =>
      usedNew.has(x.si.id)
        ? false
        : o.sig
          ? x.full === o.sig
          : x.core === o.core && routeEqual(o.p, x.si)
    )
    if (n) {
      usedOld.add(o.p.id)
      usedNew.add(n.si.id)
      unchangedPairs.push({ p: o.p, si: n.si, hadSig: !!o.sig, full: n.full })
    }
  }
  // ۲) مشخصات قطعه همان است، خدمات/توضیحات تغییر کرده
  for (const o of oldInfo) {
    if (usedOld.has(o.p.id)) continue
    const n = newInfo.find((x) => !usedNew.has(x.si.id) && x.core === o.core)
    if (n) {
      usedOld.add(o.p.id)
      usedNew.add(n.si.id)
      inplacePairs.push({
        p: o.p,
        si: n.si,
        labelChanged: o.vars !== null && o.vars !== n.vars,
      })
    }
  }
  // ۳) هم‌نام ولی ابعاد/تعداد عوض شده
  for (const o of oldInfo) {
    if (usedOld.has(o.p.id)) continue
    const n = newInfo.find(
      (x) =>
        !usedNew.has(x.si.id) &&
        norm(x.si.productName || "") === norm(o.p.productName || "")
    )
    if (n) {
      usedOld.add(o.p.id)
      usedNew.add(n.si.id)
      corePairs.push({
        p: o.p,
        si: n.si,
        oldQ: JSON.parse(o.core)[3],
        newQ: JSON.parse(n.core)[3],
      })
    }
  }

  const isUntouched = (p: any) =>
    p.stations.every(
      (s: any) => s.status === "در انتظار" && !(s.quantityOut || 0)
    )

  let added = 0
  let edited = 0
  let removed = 0
  let kept = 0
  let updated = 0
  let relabeled = 0
  let extra = 0

  // بدون تغییر: وصل به قلم جدید (و ثبت امضا برای قطعه‌های قدیمیِ بی‌امضا)
  for (const u of unchangedPairs) {
    await prisma.productionItem.update({
      where: { id: u.p.id },
      data: {
        orderItemId: u.si.id,
        ...(u.hadSig ? {} : { thickness: SIG_PREFIX + u.full }),
      },
    })
    await prisma.productionItem.updateMany({
      where: { parentItemId: u.p.id },
      data: { orderItemId: u.si.id },
    })
  }

  // اصلاح در جا: همان بارکد، بدون برش مجدد
  for (const u of inplacePairs) {
    if (u.p.status === SCRAPPED_STATUS) {
      // قطعه‌ی ضایعات‌شده از تولید خارج است؛ فقط به قلم جدید وصل می‌ماند
      await prisma.productionItem.update({
        where: { id: u.p.id },
        data: { orderItemId: u.si.id },
      })
      await prisma.productionItem.updateMany({
        where: { parentItemId: u.p.id },
        data: { orderItemId: u.si.id },
      })
      notes.push(
        `«${u.p.productName}» (بارکد ${u.p.barcode || "—"}) قبلاً ضایعات شده و با بارکد جدید برش مجدد خورده؛ تغییر خدمات فاکتور روی قطعه‌ی برش مجدد اعمال نشد و باید دستی بررسی شود`
      )
      continue
    }
    const r = await updatePieceInPlace(
      u.p,
      u.si,
      allStations,
      isRental,
      u.labelChanged
    )
    updated++
    if (r.relabeled) relabeled++
    await prisma.productionItem.updateMany({
      where: { parentItemId: u.p.id },
      data: { orderItemId: u.si.id },
    })
  }

  // تغییر مشخصات قطعه
  for (const c of corePairs) {
    if (c.p.status === SCRAPPED_STATUS) {
      await prisma.productionItem.update({
        where: { id: c.p.id },
        data: { orderItemId: c.si.id },
      })
      kept++
      notes.push(
        `«${c.p.productName}» (بارکد ${c.p.barcode || "—"}) قبلاً ضایعات شده بود و در فاکتور تغییر کرده (ابعاد/تعداد)؛ باید دستی بررسی شود`
      )
      continue
    }
    const sameShape =
      Number(c.p.length || 0) === Number(c.si.length || 0) &&
      Number(c.p.width || 0) === Number(c.si.width || 0)
    if (isUntouched(c.p)) {
      await deletePieceCompletely(c.p.id)
      await createPieceWithRoute(prod.id, c.si, allStations, isRental, TAG_EDITED)
      edited++
    } else if (sameShape && c.newQ > c.oldQ) {
      // قطعه‌ی قبلی (که وارد کار شده) دست نمی‌خورد؛ فقط تفاوت تعداد قطعه‌ی جدید می‌شود
      await updatePieceInPlace(c.p, c.si, allStations, isRental, true)
      await createPieceWithRoute(prod.id, c.si, allStations, isRental, TAG_NEW, {
        quantity: c.newQ - c.oldQ,
        parentItemId: c.p.id,
      })
      extra++
      notes.push(
        `«${c.p.productName}»: تعداد از ${c.oldQ} به ${c.newQ} رسید؛ برای ${c.newQ - c.oldQ} عدد اضافه قطعه‌ی جدید با بارکد جدید ساخته شد`
      )
    } else {
      kept++
      await prisma.productionItem.update({
        where: { id: c.p.id },
        data: { orderItemId: c.si.id },
      })
      notes.push(
        `«${c.p.productName}» (بارکد ${c.p.barcode || "—"}) در فاکتور تغییر کرده (ابعاد/تعداد) ولی قبلاً وارد ایستگاه شده؛ همان قطعه‌ی قبلی نگه داشته شد و باید دستی بررسی یا ضایعات/برش مجدد ثبت شود`
      )
    }
  }

  // حذف‌شده از فاکتور
  for (const o of oldInfo) {
    if (usedOld.has(o.p.id)) continue
    if (!isUntouched(o.p)) {
      kept++
      notes.push(
        `«${o.p.productName}» (بارکد ${o.p.barcode || "—"}) از فاکتور حذف شده ولی قبلاً وارد ایستگاه شده؛ در تولید نگه داشته شد`
      )
      continue
    }
    await deletePieceCompletely(o.p.id)
    removed++
  }

  // قلم جدید
  for (const n of newInfo) {
    if (usedNew.has(n.si.id)) continue
    await createPieceWithRoute(prod.id, n.si, allStations, isRental, TAG_NEW)
    added++
  }

  await prisma.productionOrder.update({
    where: { id: prod.id },
    data: { priority: order.priority || "عادی", notes: order.notes },
  })

  await prisma.productionHistory.create({
    data: {
      productionOrderId: prod.id,
      action: "ارسال مجدد فاکتور ویرایش‌شده",
      description: `جدید: ${added} | جایگزین‌شده: ${edited} | اضافه‌ی تعداد: ${extra} | اصلاح خدمات/لیبل: ${updated} | حذف‌شده: ${removed} | بدون تغییر: ${unchangedPairs.length}${
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
    updated,
    relabeled,
    extra,
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