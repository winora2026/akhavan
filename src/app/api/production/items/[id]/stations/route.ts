import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { stationIds } = body // آرایه‌ای از شناسه ایستگاه‌ها به ترتیب

    if (!Array.isArray(stationIds) || stationIds.length === 0) {
      return NextResponse.json(
        { error: "حداقل یک ایستگاه باید انتخاب شود" },
        { status: 400 }
      )
    }

    // بررسی وجود قلم تولید
    const item = await prisma.productionItem.findUnique({
      where: { id },
    })

    if (!item) {
      return NextResponse.json({ error: "قلم تولید یافت نشد" }, { status: 404 })
    }

    // حذف مسیر قبلی (اگر وجود داشته)
    await prisma.productionItemStation.deleteMany({
      where: { productionItemId: id },
    })

    // ایجاد مسیر جدید
    const stations = await Promise.all(
      stationIds.map((stationId: string, index: number) =>
        prisma.productionItemStation.create({
          data: {
            productionItemId: id,
            stationId,
            sequence: index + 1,
            status: "در انتظار",
            quantityIn: item.quantity,
          },
        })
      )
    )

    // ثبت در تاریخچه
    await prisma.productionHistory.create({
      data: {
        productionItemId: id,
        productionOrderId: item.productionOrderId,
        action: "تعیین مسیر ایستگاه‌ها",
        description: `مسیر تولید با ${stationIds.length} ایستگاه تعریف شد`,
      },
    })

    return NextResponse.json(stations)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "خطا در تعیین مسیر" }, { status: 500 })
  }
}