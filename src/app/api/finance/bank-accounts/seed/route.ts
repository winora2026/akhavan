import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

const ACCOUNTS = [
  {
    name: "پارسیان مجتبی خاجی",
    bankName: "پارسیان",
    ownerName: "مجتبی خاجی",
    cardNumber: "6221061231052947",
    accountNumber: "190540125720100882337601",
    iban: null as string | null,
    sortOrder: 1,
  },
  {
    name: "پارسیان صنایع اخوان شیشه خواجوی",
    bankName: "پارسیان",
    ownerName: "صنایع اخوان شیشه خواجوی",
    cardNumber: null as string | null,
    accountNumber: "02100001936007",
    iban: "IR025401042021000001936007",
    sortOrder: 2,
  },
]

export async function GET() {
  try {
    const created = []
    for (const a of ACCOUNTS) {
      const existing = await prisma.bankAccount.findFirst({
        where: { name: a.name },
      })
      if (existing) {
        const row = await prisma.bankAccount.update({
          where: { id: existing.id },
          data: { ...a, isActive: true },
        })
        created.push(row)
      } else {
        const row = await prisma.bankAccount.create({
          data: { ...a, isActive: true },
        })
        created.push(row)
      }
    }
    return NextResponse.json({ message: "حساب‌ها آماده شد", accounts: created })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}