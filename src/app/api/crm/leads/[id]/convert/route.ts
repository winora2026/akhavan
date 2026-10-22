import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    const { id } = await params

    const lead = await prisma.lead.findUnique({ where: { id } })
    if (!lead) {
      return NextResponse.json({ error: "سرنخ یافت نشد" }, { status: 404 })
    }

    let customerId = lead.customerId

    if (!customerId) {
      // اول با موبایل، بعد با نام
      let customer = null as Awaited<
        ReturnType<typeof prisma.customer.findFirst>
      >
      if (lead.mobile) {
        customer = await prisma.customer.findFirst({
          where: { phone: lead.mobile.trim() },
        })
      }
      if (!customer && lead.name) {
        customer = await prisma.customer.findFirst({
          where: { name: lead.name.trim() },
        })
      }
      if (!customer) {
        customer = await prisma.customer.create({
          data: {
            name: lead.name.trim(),
            phone: lead.mobile || lead.phone || null,
            address: lead.city || null,
            notes: lead.companyName
              ? `از CRM | ${lead.companyName}`
              : "از CRM",
            customerCode: `C-${Date.now()}`,
            customerGroup: lead.customerType || "همکار",
          },
        })
      }
      customerId = customer.id
    }

    const updated = await prisma.lead.update({
      where: { id },
      data: {
        customerId,
        status: "CONVERTED",
        lastActivityAt: new Date(),
      },
      include: { customer: true },
    })

    if (session?.id) {
      await prisma.activity.create({
        data: {
          type: "CONVERT",
          title: "تبدیل به مشتری",
          description: `متصل به مشتری: ${updated.customer?.name}`,
          leadId: id,
          customerId,
          createdById: session.id,
          activityAt: new Date(),
        },
      })
    }

    return NextResponse.json({
      success: true,
      lead: updated,
      customer: updated.customer,
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در تبدیل به مشتری" },
      { status: 500 }
    )
  }
}