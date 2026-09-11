import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { productionItemIds, action } = body

    if (!Array.isArray(productionItemIds) || productionItemIds.length === 0) {
      return NextResponse.json({ error: "هیچ قلمی انتخاب نشده" }, { status: 400 })
    }

    if (action === "allow-reprint") {
      await prisma.productionItem.updateMany({
        where: { id: { in: productionItemIds } },
        data: {
          labelReprintAllowed: true,
          labelStatus: "مجاز چاپ مجدد",
        },
      })

      for (const id of productionItemIds) {
        const item = await prisma.productionItem.findUnique({ where: { id } })
        if (!item) continue
        await prisma.productionHistory.create({
          data: {
            productionOrderId: item.productionOrderId,
            productionItemId: id,
            action: "اجازه چاپ مجدد لیبل",
            description: "اجازه چاپ مجدد لیبل صادر شد",
          },
        })
      }

      return NextResponse.json({ message: "اجازه چاپ مجدد ثبت شد" })
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
          { error: "هیچ قلم قابل چاپی انتخاب نشده (نیاز به اجازه چاپ مجدد)" },
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

        // خدمات از قلم فروش
        let servicesText = ""
        const salesItem = order?.items?.find((si) => si.id === item.orderItemId)
        if ((salesItem as any)?.servicesData) {
          try {
            const parsed = JSON.parse((salesItem as any).servicesData)
            if (Array.isArray(parsed)) {
              servicesText = parsed
                .map((s: any) => s.title || s.name)
                .filter(Boolean)
                .join("_")
            }
          } catch {}
        }

        for (let i = 1; i <= qty; i++) {
          const pieceBarcode =
            qty === 1
              ? item.barcode || ""
              : `${item.barcode || "0"}-${i}`

          labels.push({
            productionItemId: item.id,
            productName: item.productName,
            barcode: pieceBarcode,
            length: item.length,
            width: item.width,
            quantity: 1, // هر لیبل = یک قطعه
            totalQuantity: qty,
            pieceIndex: i,
            meterage: item.meterage,
            orderNumber: order?.orderNumber,
            customerName: order?.customer?.name,
            orderDate: order?.orderDate,
            deliveryDate: order?.deliveryDate,
            notes: item.notes || salesItem?.notes || "",
            servicesText,
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
      { error: "خطا در عملیات لیبل", details: String(error?.message || error) },
      { status: 500 }
    )
  }
}