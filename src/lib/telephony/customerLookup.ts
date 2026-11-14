import { prisma } from "@/lib/prisma"
import { normalizePhone } from "./phone"

export type PhoneMatch = {
  dbId: string | null
  name: string
  code?: string | null
  kind: "customer" | "lead"
  phone: string
}

type SeedCustomer = {
  code?: string
  firstName?: string
  lastName?: string
  companyName?: string
  customerType?: string
  phones?: string[]
}

type Index = {
  at: number
  map: Map<string, PhoneMatch>
}

const CACHE_MS = 2 * 60 * 1000
const g = globalThis as any

let building: Promise<Map<string, PhoneMatch>> | null = null

function seedName(c: SeedCustomer): string {
  if (c.customerType === "حقوقی" && c.companyName) return c.companyName
  const full = `${c.lastName || ""} ${c.firstName || ""}`.trim()
  return full || c.companyName || "بدون نام"
}

function put(map: Map<string, PhoneMatch>, rawPhone: unknown, entry: PhoneMatch, overwrite: boolean) {
  if (typeof rawPhone !== "string") return
  const norm = normalizePhone(rawPhone)
  if (!norm || norm.length < 4) return
  if (!overwrite && map.has(norm)) return
  map.set(norm, entry)
}

async function buildIndex(): Promise<Map<string, PhoneMatch>> {
  const map = new Map<string, PhoneMatch>()

  try {
    const mod: any = await import("@/app/customers/customers-seed.json")
    const seed: SeedCustomer[] = mod.default || mod
    for (const c of seed) {
      const entry: PhoneMatch = {
        dbId: null,
        name: seedName(c),
        code: c.code || null,
        kind: "customer",
        phone: "",
      }
      for (const phone of c.phones || []) {
        put(map, phone, { ...entry, phone }, false)
      }
    }
  } catch (e) {
    console.error("[telephony] reading customers seed failed", e)
  }

  try {
    const rows = await prisma.customer.findMany({
      select: { id: true, name: true, customerCode: true, phone: true, profile: true },
    })
    for (const row of rows) {
      let phones: string[] = []
      if (row.profile) {
        try {
          const parsed = JSON.parse(row.profile)
          if (Array.isArray(parsed?.phones)) phones = parsed.phones.map(String)
        } catch {
          // ignore malformed profile
        }
      }
      if (row.phone) phones.push(row.phone)
      const entry: PhoneMatch = {
        dbId: row.id,
        name: row.name,
        code: row.customerCode || null,
        kind: "customer",
        phone: "",
      }
      for (const phone of phones) {
        put(map, phone, { ...entry, phone }, true)
      }
    }
  } catch (e) {
    console.error("[telephony] reading customers failed", e)
  }

  try {
    const leads = await prisma.lead.findMany({ select: { id: true, name: true, mobile: true, phone: true } })
    for (const lead of leads) {
      const entry: PhoneMatch = {
        dbId: lead.id,
        name: lead.name,
        code: null,
        kind: "lead",
        phone: "",
      }
      put(map, lead.mobile, { ...entry, phone: String(lead.mobile || "") }, false)
      put(map, lead.phone, { ...entry, phone: String(lead.phone || "") }, false)
    }
  } catch (e) {
    console.error("[telephony] reading leads failed", e)
  }

  return map
}

export async function getPhoneIndex(): Promise<Map<string, PhoneMatch>> {
  const cached: Index | undefined = g.__pbxPhoneIndex
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.map
  if (building) return building

  building = buildIndex()
    .then((map) => {
      g.__pbxPhoneIndex = { at: Date.now(), map }
      return map
    })
    .finally(() => {
      building = null
    })

  return building
}

export async function matchPhone(rawPhone: string | null | undefined): Promise<PhoneMatch | null> {
  const norm = normalizePhone(rawPhone)
  if (!norm) return null
  const map = await getPhoneIndex()
  return map.get(norm) || null
}

export function invalidatePhoneIndex() {
  g.__pbxPhoneIndex = undefined
}
