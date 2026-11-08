type TokenResponse = {
  access_token?: string
  token?: string
  expires_in?: number
}

let cachedToken: { value: string; exp: number } | null = null

export function isMockMode() {
  return process.env.SEPIDAR_MOCK !== "false"
}

function baseUrl() {
  const u = process.env.SEPIDAR_BASE_URL
  if (!u) throw new Error("SEPIDAR_BASE_URL در .env تنظیم نشده است")
  return u.replace(/\/$/, "")
}

export async function getAccessToken(force = false): Promise<string> {
  if (isMockMode()) return "mock-token"

  const now = Date.now()
  if (!force && cachedToken && cachedToken.exp > now + 20 * 60_000) {
    return cachedToken.value
  }

  const body: Record<string, string> = {}
  const add = (k: string, env: string | undefined) => {
    if (env && env.trim()) body[k] = env.trim()
  }
  add("raw_token", process.env.SEPIDAR_RAW_TOKEN)
  add("client_id", process.env.SEPIDAR_CLIENT_ID)
  add("client_secret", process.env.SEPIDAR_CLIENT_SECRET)
  add("username", process.env.SEPIDAR_USERNAME)
  add("password", process.env.SEPIDAR_PASSWORD)
  add("client_hash", process.env.SEPIDAR_CLIENT_HASH)
  if (!body.raw_token) throw new Error("SEPIDAR_RAW_TOKEN در .env تنظیم نشده است")

  const res = await fetch(`${baseUrl()}/api/sepidar/v1/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Sepidar auth failed (${res.status}): ${text}`)
  }

  const data = (await res.json()) as TokenResponse
  const token = data.access_token || data.token
  if (!token) throw new Error("Sepidar auth: access_token خالی است")

  const ttlSec = data.expires_in ?? 3600
  cachedToken = { value: token, exp: now + ttlSec * 1000 }
  return token
}

let nextSlot = 0
async function throttle() {
  const gap = Number(process.env.SEPIDAR_MIN_GAP_MS || 300)
  const now = Date.now()
  const at = Math.max(now, nextSlot)
  nextSlot = at + gap
  if (at > now) await new Promise((r) => setTimeout(r, at - now))
}

export async function sepidarFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${baseUrl()}${path}`

  const doFetch = async (force: boolean) => {
    const token = await getAccessToken(force)
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers as Record<string, string>),
    }
    if (init.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json"
    }
    await throttle()
    return fetch(url, {
      ...init,
      headers,
      signal: init.signal ?? AbortSignal.timeout(30_000),
    })
  }

  let res = await doFetch(false)
  if (res.status === 401) {
    cachedToken = null
    res = await doFetch(true)
  }
  // محدودیت نرخ درگاه (429): با فاصله دوباره تلاش می‌کنیم
  for (let i = 0; i < 3 && res.status === 429; i++) {
    const ra = Number(res.headers.get("retry-after"))
    await new Promise((r) => setTimeout(r, ra > 0 ? ra * 1000 : 2000 * (i + 1)))
    res = await doFetch(false)
  }
  return res
}

async function parse(res: Response) {
  const text = await res.text()
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return { raw: text }
  }
}

export async function sepidarGet(path: string, params: Record<string, any> = {}) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v))
  }
  const q = qs.toString()
  const res = await sepidarFetch(q ? `${path}?${q}` : path)
  const data = await parse(res)
  if (!res.ok) {
    throw new Error(`GET ${path} failed (${res.status}): ${JSON.stringify(data)}`)
  }
  return data
}

export async function sepidarPost(path: string, payload: unknown) {
  const res = await sepidarFetch(path, {
    method: "POST",
    body: JSON.stringify(payload),
  })
  const data = await parse(res)
  if (!res.ok) {
    throw new Error(`POST ${path} failed (${res.status}): ${JSON.stringify(data)}`)
  }
  return data
}

export function extractList(data: any): any[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === "object") {
    for (const k of ["items", "data", "result", "results", "list", "value"]) {
      if (Array.isArray(data[k])) return data[k]
    }
  }
  return []
}

function partyRowId(row: any): string | number | null {
  if (!row || typeof row !== "object") return null
  for (const k of [
    "id",
    "Id",
    "partyId",
    "PartyId",
    "partyRef",
    "PartyRef",
    "PartyID",
  ]) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") {
      return row[k]
    }
  }
  return null
}

/**
 * لیست‌گیری صفحه‌به‌صفحه.
 * طرف‌حساب‌ها: AfterPartyId (محدودیت max skip 5000)
 * بقیه: Page با سقف امن
 */
export async function getAll(
  path: string,
  params: Record<string, any> = {},
  maxPages = 200
) {
  const pageSize = 50
  const out: any[] = []
  const isParty =
    path.includes("GetAllParty") ||
    path.toLowerCase().includes("/parties/")

  if (isParty) {
    let afterId: string | number | undefined
    for (let i = 0; i < maxPages; i++) {
      const p: Record<string, any> = {
        ...params,
        Page: 1,
        ItemCount: pageSize,
      }
      if (afterId != null) p.AfterPartyId = afterId

      const data = await sepidarGet(path, p)
      const list = extractList(data)
      if (!list.length) break

      out.push(...list)

      const lastId = partyRowId(list[list.length - 1])
      if (lastId == null || list.length < pageSize) break
      afterId = lastId

      await new Promise((r) => setTimeout(r, 150))
    }
    return out
  }

  const maxSafePages = Math.min(maxPages, Math.floor(5000 / pageSize))
  for (let page = 1; page <= maxSafePages; page++) {
    const data = await sepidarGet(path, {
      ...params,
      Page: page,
      ItemCount: pageSize,
    })
    const list = extractList(data)
    out.push(...list)
    if (list.length < pageSize) break
    await new Promise((r) => setTimeout(r, 100))
  }
  return out
}

export function pickId(data: any, keys: string[]): string | null {
  const tryObj = (o: any) => {
    if (!o || typeof o !== "object") return null
    for (const k of keys) {
      const v = o[k]
      if (v !== undefined && v !== null && v !== "") return String(v)
    }
    return null
  }
  if (typeof data === "number" || typeof data === "string") return String(data)
  return tryObj(data) || tryObj(data?.data) || tryObj(data?.result)
}

export async function createInvoice(payload: unknown) {
  if (isMockMode()) {
    return {
      mock: true,
      id: `MOCK-${Date.now()}`,
      number: `M-${Date.now()}`,
      payload,
    }
  }

  // محافظ تکراری: اگر فاکتوری با همین شماره از قبل در سپیدار هست، دوباره ساخته نمی‌شود.
  // اگر خواندن لیست فاکتورها ممکن نشد هم ارسال متوقف می‌شود (ارسال تکراری از ارسال دیرتر بدتر است).
  // برای ارسال گروهی، شماره‌ی فاکتورهای ۱۴ روز اخیر یک‌بار خوانده و ۹۰ ثانیه نگه داشته می‌شود
  // (به‌جای یک خواندن کامل برای هر فاکتور)؛ شماره‌ی فاکتورِ تازه‌ارسال‌شده هم فوراً به آن اضافه می‌شود.
  const p: any = payload
  const num = Number(p?.number ?? p?.Number)
  const guardOn = Number.isFinite(num) && num > 0
  if (guardOn) {
    const g = globalThis as any
    const store: { at: number; nums: Set<number>; from: number } =
      (g.__sepidarInvoiceNums ??= { at: 0, nums: new Set<number>(), from: 0 })

    const dateMs = new Date(String(p?.date ?? "").slice(0, 10) + "T12:00:00Z").getTime()
    const invoiceMs = Number.isFinite(dateMs) ? dateMs : Date.now()
    const needFrom = invoiceMs - 10 * 86_400_000
    const day = (d: Date) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(d)

    // کش تازه نیست، یا فاکتور قدیمی‌تر از بازه‌ی کش است
    if (Date.now() - store.at > 90_000 || needFrom < store.from) {
      // پیش‌فرض ۱۴ روز اخیر (هم‌اندازه‌ی بازه‌ی قبلی، تا ارسال تکی کندتر نشود)؛ فقط اگر فاکتور قدیمی‌تر بود بازه عقب‌تر می‌رود
      const from = Math.min(needFrom - 20 * 86_400_000, Date.now() - 14 * 86_400_000)
      const to = Math.max(invoiceMs, Date.now()) + 3 * 86_400_000
      let rows: any[]
      try {
        rows = await getAll(
          "/api/sepidar/v1/Sales/GetAllInvoices",
          { StartDate: `${day(new Date(from))}T00:00:00`, EndDate: `${day(new Date(to))}T23:59:59` },
          200
        )
      } catch (e: any) {
        throw new Error(
          `بررسی تکراری‌بودن فاکتور ${num} در سپیدار ممکن نشد؛ برای جلوگیری از ثبت تکراری ارسال نشد. دوباره تلاش کنید. (${e?.message ?? e})`
        )
      }
      store.nums = new Set(rows.map((i) => Number(i?.Number ?? i?.number)).filter((n) => Number.isFinite(n)))
      store.at = Date.now()
      store.from = from
    }

    if (store.nums.has(num)) {
      throw new Error(
        `فاکتور شماره ${num} از قبل در سپیدار ثبت شده است. برای جلوگیری از ثبت تکراری ارسال نشد. ` +
          `اگر این فاکتور را در سپیدار حذف کرده‌اید، چند دقیقه صبر کنید (یا ۱–۲ دقیقه بعد دوباره امتحان کنید).`
      )
    }

    const res = await sepidarPost("/api/sepidar/v1/Sales/CreateInvoice", payload)
    store.nums.add(num)
    return res
  }

  return sepidarPost("/api/sepidar/v1/Sales/CreateInvoice", payload)
}