import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { buildServicesText } from "@/lib/production/servicesText"

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
    // action: "print" | "allow-reprint"

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

      const printable = items.filter(
        (i) =>
          i.labelStatus === "چاپ‌نشده" ||
          i.labelStatus === "مجاز چاپ مجدد" ||
          i.labelReprintAllowed
      )

      if (printable.length === 0) {
        return NextResponse.json(
          {
            error:
              "هیچ قلم قابل چاپی انتخاب نشده (نیاز به اجازه چاپ مجدد)",
          },
          { status: 400 }
        )
      }

      for (const item of printable) {
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
          },
        })
      }

      const labels: any[] = []

      for (const item of printable) {
        const qty = item.quantity || 1
        const order = item.productionOrder.order

        const salesItem = order?.items?.find((si) => si.id === item.orderItemId)
        const servicesText = buildServicesText(
          (salesItem as any)?.servicesData ?? null
        )

        const recutNumber = (item as any).recutNumber || 0
        const baseNotes = item.notes || salesItem?.notes || ""
        const notes =
          recutNumber > 0
            ? `برش مجدد ${recutNumber}${baseNotes ? " | " + baseNotes : ""}`
            : baseNotes

        for (let i = 1; i <= qty; i++) {
          const pieceBarcode =
            qty === 1 ? item.barcode || "" : `${item.barcode || "0"}-${i}`

          labels.push({
            productionItemId: item.id,
            productName: item.productName,
            barcode: pieceBarcode,
            length: item.length,
            width: item.width,
            quantity: 1,
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

      return NextResponse.json({ message: "لیبل‌ها ثبت شد", labels })
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