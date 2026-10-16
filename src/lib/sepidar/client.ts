type TokenResponse = {
  access_token?: string
  token?: string
  expires_in?: number
}

let cachedToken: { value: string; exp: number } | null = null

function baseUrl() {
  return (process.env.SEPIDAR_BASE_URL || "https://coffeemali.com").replace(
    /\/$/,
    ""
  )
}

export function isMockMode() {
  return process.env.SEPIDAR_MOCK !== "false"
}

export async function getAccessToken(): Promise<string> {
  if (isMockMode()) return "mock-token"

  const now = Date.now()
  if (cachedToken && cachedToken.exp > now + 60_000) {
    return cachedToken.value
  }

  const body = {
    client_id: process.env.SEPIDAR_CLIENT_ID || "",
    raw_token: process.env.SEPIDAR_RAW_TOKEN || "",
    username: process.env.SEPIDAR_USERNAME || "",
    password: process.env.SEPIDAR_PASSWORD || "",
    client_hash: process.env.SEPIDAR_CLIENT_HASH || "",
  }

  const res = await fetch(`${baseUrl()}/api/sepidar/v1/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
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
  const token = await getAccessToken()
  const url = path.startsWith("http") ? path : `${baseUrl()}${path}`

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    ...(init.headers as Record<string, string>),
  }
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json"
  }

  return fetch(url, { ...init, headers })
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

  const res = await sepidarFetch("/api/sepidar/v1/Sales/CreateInvoice", {
    method: "POST",
    body: JSON.stringify(payload),
  })

  const text = await res.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }

  if (!res.ok) {
    throw new Error(
      `CreateInvoice failed (${res.status}): ${typeof data === "string" ? data : JSON.stringify(data)}`
    )
  }
  return data
}