// مسیر آزمایشی و موقت: آیا UpdateParty نوع (حقیقی/حقوقی) را عوض می‌کند؟
// مقصد: src/app/api/sepidar/customers/update-test/route.ts  (بعد از تست حذف شود)
//
// فقط خواندن (پیش‌فرض):
//   /api/sepidar/customers/update-test?partyId=8500
// اجرای واقعی روی «یک» مشتری آزمایشی:
//   /api/sepidar/customers/update-test?partyId=8500&apply=1&name=علی&lastName=رضایی
import { NextResponse } from "next/server"
import { sepidarGet, sepidarFetch } from "@/lib/sepidar/client"

export const dynamic = "force-dynamic"

const KEYS = [
  "name", "nameEn", "lastName", "lastNameEn", "economicCode", "identificationCode",
  "registrationCode", "passportNumber", "website", "email", "isInBlacklist",
  "isCustomer", "isVendor", "isBroker", "isEmployee", "isPurchasingAgent",
  "discountRate", "customerGroupingRef", "vendorGroupingRef", "brokerGroupingRef",
  "birthDate", "marriageDate",
]

async function readParty(partyId: string) {
  return sepidarGet("/api/sepidar/v1/Parties/GetParty", { PartyId: partyId })
}

export async function GET(req: Request) {
  const u = new URL(req.url)
  const partyId = u.searchParams.get("partyId") || ""
  if (!/^\d+$/.test(partyId)) return NextResponse.json({ error: "partyId لازم است" }, { status: 400 })
  try {
    const before = await readParty(partyId)
    const cur: any = Array.isArray(before) ? before[0] : before?.data ?? before
    const body: Record<string, any> = {}
    for (const k of KEYS) if (cur && cur[k] !== undefined) body[k] = cur[k]
    const name = u.searchParams.get("name")
    const lastName = u.searchParams.get("lastName")
    const nationalCode = u.searchParams.get("nationalCode")
    if (name) body.name = name
    if (lastName) body.lastName = lastName
    if (nationalCode) body.identificationCode = nationalCode

    if (u.searchParams.get("apply") !== "1") {
      return NextResponse.json({ mode: "dry-run (چیزی ارسال نشد)", before, wouldSend: body })
    }
    const res = await sepidarFetch(
      `/api/sepidar/v1/Parties/UpdateParty?PartyId=${partyId}`,
      { method: "PUT", body: JSON.stringify(body) }
    )
    const text = await res.text()
    const after = await readParty(partyId).catch((e) => ({ error: String(e) }))
    return NextResponse.json({ status: res.status, response: text, sent: body, after })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}