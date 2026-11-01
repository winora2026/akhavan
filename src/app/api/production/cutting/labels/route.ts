import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { buildServicesText } from "@/lib/production/servicesText"

// قطعه‌ای که تعدادش بیشتر از این عدد باشد، فقط یک لیبل (با تعداد کل) می‌گیرد؛
// ۴ عدد و کمتر مثل قبل برای هر عدد یک لیبل جدا چاپ می‌شود
const BULK_LABEL_THRESHOLD = 4

// «لغو ثبت چاپ» فقط برای قطعاتی که در این مدت چاپ ثبت شده‌اند مجاز است (جلوگیری از دستکاری سابقه‌ی قدیمی)
const UNDO_WINDOW_MS = 2 * 60 * 60 * 1000

// قطعه‌ای که اجازه‌ی چاپ لیبل دارد (هنوز چاپ نشده یا اجازه‌ی چاپ مجدد گرفته)
const isPrintable = (i: {
  labelStatus: string | null
  labelReprintAllowed: boolean | null
}) =>
  i.labelStatus === "چاپ‌نشده" ||
  i.labelStatus === "مجاز چاپ مجدد" ||
  !!i.labelReprintAllowed

/**
 * پیدا کردن قلم فروش (OrderItem) متناظر با قطعه‌ی تولید.
 * اول با شناسه؛ اگر پیدا نشد (مثلاً سفارش بعد از ساخت تولید ویرایش شده و شناسه‌ی اقلام عوض شده)
 * با نام کالا + طول + عرض، ولی فقط وقتی نتیجه یکتا باشد (یا همه‌ی گزینه‌ها توضیحات و خدمات
 * یکسان داشته باشند) تا توضیحات یک قطعه روی لیبل قطعه‌ی دیگر نیفتد.
 */
function resolveSalesItem(
  order: any,
  item: {
    orderItemId?: string | null
    productName?: string | null
    length?: number | null
    width?: number | null
  }
) {
  const list = order?.items
  if (!Array.isArray(list) || list.length === 0) return null

  if (item.orderItemId) {
    const byId = list.find((si: any) => si.id === item.orderItemId)
    if (byId) return byId
  }

  const name = (item.productName || "").trim()
  if (!name) return null

  const same = list.filter(
    (si: any) =>
      (si.productName || "").trim() === name &&
      Number(si.length) === Number(item.length) &&
      Number(si.width) === Number(item.width)
  )
  if (same.length === 1) return same[0]
  if (same.length > 1) {
    const sig = (si: any) => JSON.stringify([si.notes || "", si.servicesData || ""])
    if (same.every((si: any) => sig(si) === sig(same[0]))) return same[0]
  }
  return null
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      productionItemIds,
      action,
      mode, // "simple" | "waste"
      labelReason, // علت چاپ مجدد ساده (پارگی، ناخوانا، ...)
      reason,
      department,
      responsiblePerson,
      operatorName,
    } = body
    // action: "print" (پیش‌نمایش، بدون تغییر وضعیت) | "mark-printed" | "unmark-printed" | "allow-reprint"

    if (!Array.isArray(productionItemIds) || productionItemIds.length === 0) {
      return NextResponse.json(
        { error: "هیچ قلمی انتخاب نشده" },
        { status: 400 }
      )
    }

    if (action === "allow-reprint") {
      const reprintMode = mode === "waste" ? "waste" : "simple"
      const simpleReason = labelReason ? String(labelReason).trim() : ""

      if (reprintMode === "waste") {
        if (!reason || !String(reason).trim()) {
          return NextResponse.json(
            { error: "علت ضایعات الزامی است" },
            { status: 400 }
          )
        }
        if (!department || !["تولید", "اداری"].includes(department)) {
          return NextResponse.json(
            { error: "بخش مسبب باید تولید یا اداری باشد" },
            { status: 400 }
          )
        }
        if (!responsiblePerson || !String(responsiblePerson).trim()) {
          return NextResponse.json(
            { error: "شخص مسبب الزامی است" },
            { status: 400 }
          )
        }
      }

      const wasteNote =
        reprintMode === "waste"
          ? `بخش: ${department} | شخص: ${String(responsiblePerson).trim()}`
          : null

      await prisma.productionItem.updateMany({
        where: { id: { in: productionItemIds } },
        data: {
          labelReprintAllowed: true,
          labelStatus: "مجاز چاپ مجدد",
        },
      })

      for (const id of productionItemIds) {
        const item = await prisma.productionItem.findUnique({
          where: { id },
        })
        if (!item) continue

        // فقط در حالت ضایعات واقعی رکورد Waste ساخته می‌شود
        if (reprintMode === "waste") {
          await prisma.waste.create({
            data: {
              productionItemId: id,
              quantity: item.quantity || 1,
              reason: String(reason).trim(),
              notes: wasteNote,
              operatorId: operatorName ? String(operatorName) : null,
            },
          })
        }

        await prisma.productionHistory.create({
          data: {
            productionOrderId: item.productionOrderId,
            productionItemId: id,
            action:
              reprintMode === "waste"
                ? "اجازه چاپ مجدد لیبل (با ضایعات)"
                : "اجازه چاپ مجدد لیبل",
            description:
              reprintMode === "waste"
                ? `ضایعات | علت: ${String(reason).trim()} | ${wasteNote}`
                : `چاپ مجدد لیبل${simpleReason ? ` | علت: ${simpleReason}` : ""}`,
            operatorName: operatorName ? String(operatorName) : null,
          },
        })
      }

      return NextResponse.json({
        message:
          reprintMode === "waste"
            ? "اجازه چاپ مجدد و ثبت ضایعات انجام شد"
            : "اجازه چاپ مجدد لیبل ثبت شد",
      })
    }

    // ───────── ثبت اینکه لیبل‌ها واقعاً چاپ شدند (بعد از بسته شدن پنجره‌ی چاپ) ─────────
    if (action === "mark-printed") {
      const items = await prisma.productionItem.findMany({
        where: { id: { in: productionItemIds } },
      })
      // فقط قطعاتی که هنوز «چاپ‌نشده/مجاز چاپ مجدد» هستند؛ تکرار درخواست چیزی را دوباره ثبت نمی‌کند
      const toMark = items.filter(isPrintable)

      for (const item of toMark) {
        await prisma.productionItem.update({
          where: { id: item.id },
          data: {
            labelStatus: "چاپ‌شده",
            labelPrintCount: { increment: 1 },
            labelPrintedAt: new Date(),
            labelReprintAllowed: false,
          },
        })

        await prisma.productionHistory.create({
          data: {
            productionOrderId: item.productionOrderId,
            productionItemId: item.id,
            action: "چاپ لیبل",
            description: `چاپ لیبل (دفعه ${(item.labelPrintCount || 0) + 1})`,
            operatorName: operatorName ? String(operatorName) : null,
          },
        })
      }

      return NextResponse.json({
        message: "چاپ لیبل‌ها ثبت شد",
        marked: toMark.length,
      })
    }

    // ───────── لغو ثبت چاپ (وقتی پنجره‌ی چاپ لغو شده و لیبل واقعاً چاپ نشده) ─────────
    if (action === "unmark-printed") {
      const items = await prisma.productionItem.findMany({
        where: { id: { in: productionItemIds } },
      })
      const now = Date.now()
      const toUndo = items.filter(
        (i) =>
          i.labelStatus === "چاپ‌شده" &&
          i.labelPrintedAt &&
          now - new Date(i.labelPrintedAt).getTime() <= UNDO_WINDOW_MS
      )

      for (const item of toUndo) {
        const newCount = Math.max(0, (item.labelPrintCount || 1) - 1)
        const hadBefore = newCount > 0
        await prisma.productionItem.update({
          where: { id: item.id },
          data: {
            labelPrintCount: newCount,
            // اگر قبلاً هم چاپ شده بود، اجازه‌ی چاپ مجدد برمی‌گردد؛ وگرنه «چاپ‌نشده»
            labelStatus: hadBefore ? "مجاز چاپ مجدد" : "چاپ‌نشده",
            labelReprintAllowed: hadBefore,
            ...(hadBefore ? {} : { labelPrintedAt: null }),
          },
        })

        await prisma.productionHistory.create({
          data: {
            productionOrderId: item.productionOrderId,
            productionItemId: item.id,
            action: "لغو ثبت چاپ لیبل",
            description: "ثبت چاپ لیبل لغو شد (چاپ انجام نشد)",
            operatorName: operatorName ? String(operatorName) : null,
          },
        })
      }

      return NextResponse.json({
        message: "ثبت چاپ لغو شد",
        undone: toUndo.length,
      })
    }

    // ───────── پیش‌نمایش لیبل‌ها: هیچ وضعیتی تغییر نمی‌کند ─────────
    if (action === "print") {
      const items = await prisma.productionItem.findMany({
        where: { id: { in: productionItemIds } },
        include: {
          productionOrder: {
            include: {
              order: {
                include: {
                  customer: true,
                  items: true,
                },
              },
            },
          },
        },
      })

      const printable = items.filter(isPrintable)

      if (printable.length === 0) {
        return NextResponse.json(
          {
            error:
              "هیچ قلم قابل چاپی انتخاب نشده (نیاز به اجازه چاپ مجدد)",
          },
          { status: 400 }
        )
      }

      const labels: any[] = []

      for (const item of printable) {
        const qty = item.quantity || 1
        const order = item.productionOrder.order

        // قلم فروش: با شناسه، و در صورت نبودن شناسه با نام + طول + عرض (فقط اگر یکتا باشد)
        const salesItem = resolveSalesItem(order, item)
        const servicesText = buildServicesText(
          (salesItem as any)?.servicesData ?? null
        )

        const recutNumber = (item as any).recutNumber || 0
        const baseNotes = item.notes || (salesItem as any)?.notes || ""
        const notes =
          recutNumber > 0
            ? `برش مجدد ${recutNumber}${baseNotes ? " | " + baseNotes : ""}`
            : baseNotes

        // بالای ۴ عدد: فقط یک لیبل با تعداد کل (بارکد اصلی قطعه، بدون پسوند)
        // ۴ عدد و کمتر: برای هر عدد یک لیبل جدا (بارکد با پسوند -۱، -۲، ...)
        const isBulk = qty > BULK_LABEL_THRESHOLD
        const labelCount = isBulk ? 1 : qty

        for (let i = 1; i <= labelCount; i++) {
          const pieceBarcode =
            isBulk || qty === 1
              ? item.barcode || ""
              : `${item.barcode || "0"}-${i}`

          labels.push({
            productionItemId: item.id,
            productName: item.productName,
            barcode: pieceBarcode,
            length: item.length,
            width: item.width,
            quantity: isBulk ? qty : 1,
            totalQuantity: qty,
            pieceIndex: i,
            meterage: item.meterage,
            orderNumber: order?.orderNumber,
            customerName: order?.customer?.name,
            orderDate: order?.orderDate,
            deliveryDate: order?.deliveryDate,
            notes,
            servicesText,
            recutNumber,
            printCount: (item.labelPrintCount || 0) + 1,
          })
        }
      }

      return NextResponse.json({ message: "پیش‌نمایش لیبل‌ها", labels })
    }

    return NextResponse.json({ error: "عملیات نامعتبر" }, { status: 400 })
  } catch (error: any) {
    console.error(error)
    return NextResponse.json(
      {
        error: "خطا در عملیات لیبل",
        details: String(error?.message || error),
      },
      { status: 500 }
    )
  }
}