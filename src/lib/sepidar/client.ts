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
  if (!force && cachedToken && cachedToken.exp > now + 60_000) {
    return cachedToken.value
  }

  // فقط فیلدهای تنظیم‌شده ارسال می‌شوند (نه رشته‌ی خالی)
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
    return fetch(url, {
      ...init,
      headers,
      signal: init.signal ?? AbortSignal.timeout(30_000),
    })
  }

  let res = await doFetch(false)
  if (res.status === 401) {
    // توکن منقضی شده؛ یک بار توکن تازه می‌گیریم
    cachedToken = null
    res = await doFetch(true)
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

// شکل خروجی لیست‌ها در مستندات نیامده؛ هم آرایه و هم {items|data|result|list: []} را می‌پذیریم
export function extractList(data: any): any[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === "object") {
    for (const k of ["items", "data", "result", "results", "list", "value"]) {
      if (Array.isArray(data[k])) return data[k]
    }
  }
  return []
}

export async function getAll(
  path: string,
  params: Record<string, any> = {},
  maxPages = 100
) {
  const pageSize = 100
  const out: any[] = []
  for (let page = 1; page <= maxPages; page++) {
    const data = await sepidarGet(path, { ...params, Page: page, ItemCount: pageSize })
    const list = extractList(data)
    out.push(...list)
    if (list.length < pageSize) break
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
  return sepidarPost("/api/sepidar/v1/Sales/CreateInvoice", payload)
}