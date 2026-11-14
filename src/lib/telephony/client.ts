export type OriginateResult = {
  ok: boolean
  extension: string
  phone: string
}

export async function originateCall(phone: string): Promise<OriginateResult> {
  const res = await fetch("/api/telephony/originate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || "خطا در برقراری تماس")
  return data as OriginateResult
}
