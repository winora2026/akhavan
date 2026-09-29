import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createProductionOrderFromSales } from "@/lib/createProductionOrder"

export async function GET() {
  try {
    const productionOrders = await prisma.productionOrder.findMany({
      include: {
        order: { include: { customer: true } },
        items: true,
      },
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json(productionOrders)
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: "خطا در دریافت لیست تولید" },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { orderId } = body
    if (!orderId) {
      return NextResponse.json(
        { error: "شناسه سفارش الزامی است" },
        { status: 400 }
      )
    }

    const result = await createProductionOrderFromSales(orderId)
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: "خطا در ایجاد سفارش تولید" },
      { status: 500 }
    )
  }
}