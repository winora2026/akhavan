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
  {
    name: "پارسیان صنایع شیشه اخوان",
    bankName: "پارسیان",
    ownerName: "صنایع شیشه اخوان",
    cardNumber: null as string | null,
    accountNumber: null as string | null,
    iban: "IR020540104202100001936007",
    sortOrder: 3,
  },
  {
    name: "ملت هادی درودیان",
    bankName: "ملت",
    ownerName: "هادی درودیان",
    cardNumber: "6104337809586488",
    accountNumber: "4049978094",
    iban: "IR370120010000004049978094",
    sortOrder: 4,
  },
  {
    name: "پست بانک مجتبی خاجی",
    bankName: "پست بانک",
    ownerName: "مجتبی خاجی",
    cardNumber: "6277601352377491",
    accountNumber: null as string | null,
    iban: "IR60201000001000219153011",
    sortOrder: 5,
  },
  {
    name: "پست بانک مرضیه درودی",
    bankName: "پست بانک",
    ownerName: "مرضیه درودی",
    cardNumber: "6277601353233701",
    accountNumber: "1000219674842",
    iban: "IR690210000001000219674842",
    sortOrder: 6,
  },
  {
    name: "صادرات مرضیه درودی",
    bankName: "صادرات",
    ownerName: "مرضیه درودی",
    cardNumber: "6037697666101875",
    accountNumber: null as string | null,
    iban: "IR3301900000000117869193005",
    sortOrder: 7,
  },
  {
    name: "صادرات مجتبی خاجی",
    bankName: "صادرات",
    ownerName: "مجتبی خاجی",
    cardNumber: "6037697567784894",
    accountNumber: "0114282409005",
    iban: "IR580190000000114282409005",
    sortOrder: 8,
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
    return NextResponse.json({
      message: `${created.length} حساب بانکی آماده شد`,
      accounts: created.map((c) => ({
        id: c.id,
        name: c.name,
        bankName: c.bankName,
        cardNumber: c.cardNumber,
        accountNumber: c.accountNumber,
        iban: c.iban,
      })),
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}