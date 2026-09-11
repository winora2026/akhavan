import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const productionOrder = await prisma.productionOrder.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            customer: true,
            items: {
              include: {
                services: {
                  include: {
                    service: true,
                  },
                },
              },
            },
          },
        },
        items: {
          include: {
            stations: {
              include: {
                station: true,
              },
              orderBy: {
                sequence: "asc",
              },
            },
          },
        },
        history: {
          orderBy: {
            createdAt: "desc",
          },
          take: 50,
        },
      },
    })

    if (!productionOrder) {
      return NextResponse.json({ error: "سفارش تولید یافت نشد" }, { status: 404 })
    }

    return NextResponse.json(productionOrder)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "خطا در دریافت جزئیات" }, { status: 500 })
  }
}