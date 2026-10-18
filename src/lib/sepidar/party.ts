import { prisma } from "@/lib/prisma"
import { sepidarPost, getAll, isMockMode, pickId } from "./client"

function norm(s: string) {
  return (s || "")
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function digits(s: string) {
  return (s || "")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\D/g, "")
}

const PARTY_ID_KEYS = ["partyId", "id", "ref", "partyRef", "partySerial", "PartyId"]

function partyDisplayName(p: any) {
  return norm(`${p?.name ?? p?.Name ?? ""} ${p?.lastName ?? p?.LastName ?? ""}`)
}

export function buildCreatePartyPayload(customer: {
  name: string
  phone?: string | null
  address?: string | null
}) {
  const phoneType = Number(process.env.SEPIDAR_PHONE_TYPE || 1)
  const addressType = Number(process.env.SEPIDAR_ADDRESS_TYPE || 1)

  const phones = (customer.phone || "")
    .split(/[،,;\/\s]+/)
    .map(digits)
    .filter((p) => p.length >= 7)
    .map((p, i) => ({ type: phoneType, phone: p, isMain: i === 0 }))

  const addresses = customer.address?.trim()
    ? [{ type: addressType, address: customer.address.trim(), isMain: true }]
    : []

  return {
    name: customer.name.trim(),
    isCustomer: true,
    ...(phones.length ? { phones } : {}),
    ...(addresses.length ? { addresses } : {}),
  }
}

async function findExistingParty(name: string, phone?: string | null) {
  const parties = await getAll("/api/sepidar/v1/Parties/GetAllParty", {
    IsCustomer: true,
    IsPhone: true,
  })
  const target = norm(name)
  const matches = parties.filter((p) => partyDisplayName(p) === target)
  if (matches.length === 0) return null
  if (matches.length > 1 && phone) {
    const d = digits(phone)
    const byPhone = matches.find((p) =>
      JSON.stringify(p?.phones ?? p?.Phones ?? "").includes(d.slice(-7))
    )
    if (byPhone) return byPhone
  }
  return matches[0]
}

/**
 * مشتری اخوان را در سپیدار تضمین می‌کند:
 * 1) اگر قبلاً لینک شده همان را برمی‌گرداند
 * 2) اگر طرف‌حسابی با همین نام در سپیدار هست، به آن لینک می‌کند (بدون ساخت تکراری)
 * 3) در غیر این صورت با CreateParty (همراه آدرس و تلفن) می‌سازد
 */
export async function ensureSepidarParty(customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } })
  if (!customer) throw new Error("مشتری یافت نشد")

  const c: any = customer
  if (c.sepidarPartyRef) {
    return { partyRef: Number(c.sepidarPartyRef), created: false, linked: false }
  }

  if (isMockMode()) {
    return { partyRef: 1, created: false, linked: false, mock: true }
  }

  const existing = await findExistingParty(c.name, c.phone)
  if (existing) {
    const id = pickId(existing, PARTY_ID_KEYS)
    if (!id) {
      throw new Error(
        `طرف‌حساب در سپیدار پیدا شد ولی شناسه‌اش مشخص نیست. کلیدها: ${Object.keys(existing).join(", ")}`
      )
    }
    await prisma.customer.update({
      where: { id: customerId },
      data: { sepidarPartyRef: Number(id) } as any,
    })
    return { partyRef: Number(id), created: false, linked: true }
  }

  const payload = buildCreatePartyPayload(c)
  const result = await sepidarPost("/api/sepidar/v1/Parties/CreateParty", payload)

  let id = pickId(result, PARTY_ID_KEYS)
  if (!id) {
    // خروجی CreateParty در مستندات نیامده؛ در صورت نبود شناسه، با نام دوباره جستجو می‌کنیم
    const again = await findExistingParty(c.name, c.phone)
    id = again ? pickId(again, PARTY_ID_KEYS) : null
  }
  if (!id) {
    throw new Error(
      `مشتری در سپیدار ساخته شد ولی شناسه‌اش پیدا نشد. پاسخ: ${JSON.stringify(result)}`
    )
  }

  await prisma.customer.update({
    where: { id: customerId },
    data: { sepidarPartyRef: Number(id) } as any,
  })
  return { partyRef: Number(id), created: true, linked: false }
}