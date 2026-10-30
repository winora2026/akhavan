import { getAll, pickId } from "./client"
import { cleanCode, nameKey, sharesNameToken, seedEntries } from "./customerCodes"

const PARTY_ID_KEYS = ["partyId", "id", "ref", "partyRef", "partySerial", "PartyId", "Id"]

const partyName = (p: any) =>
  `${p?.name ?? p?.Name ?? ""} ${p?.lastName ?? p?.LastName ?? ""}`.trim()

const isCustomerParty = (p: any) => (p?.isCustomer ?? p?.IsCustomer) === true

// فقط‌خواندنی: لیست مشتریان اخوان (کد + نام) را با طرف‌حساب‌های سپیدار مقایسه می‌کند
export async function auditSeedAgainstSepidar() {
  const rows = await getAll("/api/sepidar/v1/Parties/GetAllParty", { IsCustomer: true }, 400)

  const byId = new Map<string, any>()
  for (const p of rows) {
    const id = pickId(p, PARTY_ID_KEYS)
    if (id != null && !byId.has(String(id))) byId.set(String(id), p)
  }
  const parties = Array.from(byId.values())

  const byDl = new Map<string, any[]>()
  for (const p of parties) {
    const dl = cleanCode(p?.dlCode ?? p?.DlCode)
    if (!dl) continue
    const arr = byDl.get(dl)
    if (arr) arr.push(p)
    else byDl.set(dl, [p])
  }

  const seedCodes = new Set(seedEntries.map((e) => e.code))

  const codeNotInSepidar: any[] = []
  const codeOnManyParties: any[] = []
  const nameMismatch: any[] = []

  for (const e of seedEntries) {
    const all = byDl.get(e.code) ?? []
    const customersOnly = all.filter(isCustomerParty)
    const hits = customersOnly.length ? customersOnly : all

    if (hits.length === 0) {
      codeNotInSepidar.push({ code: e.code, name: e.name })
    } else if (hits.length > 1) {
      codeOnManyParties.push({
        code: e.code,
        name: e.name,
        parties: hits.map((p) => ({ partyId: pickId(p, PARTY_ID_KEYS), name: partyName(p) })),
      })
    } else if (!sharesNameToken(e.name, partyName(hits[0]))) {
      nameMismatch.push({
        code: e.code,
        listName: e.name,
        sepidarName: partyName(hits[0]),
        partyId: pickId(hits[0], PARTY_ID_KEYS),
      })
    }
  }

  // یک نام در لیست با چند کد (از روی نام نمی‌شود تشخیص داد کدام است)
  const codesByName = new Map<string, Set<string>>()
  const sampleNameByKey = new Map<string, string>()
  for (const e of seedEntries) {
    const k = nameKey(e.name)
    if (!k) continue
    if (!codesByName.has(k)) codesByName.set(k, new Set())
    codesByName.get(k)!.add(e.code)
    if (!sampleNameByKey.has(k)) sampleNameByKey.set(k, e.name)
  }
  const duplicateNamesInList = Array.from(codesByName.entries())
    .filter(([, s]) => s.size > 1)
    .map(([k, s]) => ({ name: sampleNameByKey.get(k), codes: Array.from(s) }))

  // یک کد در لیست با چند نام
  const namesByCode = new Map<string, Set<string>>()
  for (const e of seedEntries) {
    if (!namesByCode.has(e.code)) namesByCode.set(e.code, new Set())
    namesByCode.get(e.code)!.add(e.name)
  }
  const duplicateCodesInList = Array.from(namesByCode.entries())
    .filter(([, s]) => s.size > 1)
    .map(([code, s]) => ({ code, names: Array.from(s) }))

  // مشتری‌های سپیدار که در لیست اخوان نیستند (مثلاً مشتری‌هایی که بعداً ساخته شده‌اند)
  const sepidarNotInList = parties
    .filter((p) => isCustomerParty(p))
    .filter((p) => {
      const dl = cleanCode(p?.dlCode ?? p?.DlCode)
      return dl && !seedCodes.has(dl)
    })
    .sort((a, b) => Number(pickId(b, PARTY_ID_KEYS)) - Number(pickId(a, PARTY_ID_KEYS)))

  return {
    listEntriesWithCode: seedEntries.length,
    sepidarCustomerParties: parties.filter(isCustomerParty).length,
    codeNotInSepidar: { count: codeNotInSepidar.length, sample: codeNotInSepidar.slice(0, 100) },
    codeOnManyParties: { count: codeOnManyParties.length, sample: codeOnManyParties.slice(0, 50) },
    nameMismatch: { count: nameMismatch.length, sample: nameMismatch.slice(0, 100) },
    duplicateNamesInList: { count: duplicateNamesInList.length, sample: duplicateNamesInList.slice(0, 100) },
    duplicateCodesInList: { count: duplicateCodesInList.length, sample: duplicateCodesInList.slice(0, 100) },
    sepidarNotInList: {
      count: sepidarNotInList.length,
      newestSample: sepidarNotInList.slice(0, 40).map((p) => ({
        partyId: pickId(p, PARTY_ID_KEYS),
        code: cleanCode(p?.dlCode ?? p?.DlCode),
        name: partyName(p),
      })),
    },
  }
}