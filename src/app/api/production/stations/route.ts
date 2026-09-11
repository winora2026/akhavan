import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// دریافت لیست ایستگاه‌ها
export async function GET() {
  try {
    const stations = await prisma.productionStation.findMany({
      orderBy: { sortOrder: "asc" },
    })
    return NextResponse.json(stations)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "خطا در دریافت ایستگاه‌ها" }, { status: 500 })
  }
}

// ایجاد ایستگاه جدید
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, code, description, sortOrder } = body

    if (!name) {
      return NextResponse.json({ error: "نام ایستگاه الزامی است" }, { status: 400 })
    }

    const station = await prisma.productionStation.create({
      data: {
        name,
        code: code || null,
        description: description || null,
        sortOrder: sortOrder || 0,
      },
    })

    return NextResponse.json(station)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "خطا در ایجاد ایستگاه" }, { status: 500 })
  }
}