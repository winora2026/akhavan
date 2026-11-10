export type MockCall = {
  externalId: string
  direction: "INBOUND" | "OUTBOUND"
  phone: string
  status: "COMPLETED" | "FAILED" | "LIVE"
  endReason: string | null
  startedAt: string
  durationSec: number
  turns: number
  cost: number
  answerer: string
  goal: string | null
  summary: string | null
}

export function getMockCalls(): MockCall[] {
  const now = Date.now()
  return [
    {
      externalId: "zt-demo-001",
      direction: "INBOUND",
      phone: "09360115045",
      status: "COMPLETED",
      endReason: "قطع توسط تماس‌گیرنده",
      startedAt: new Date(now - 3600_000).toISOString(),
      durationSec: 20,
      turns: 5,
      cost: 0.0122,
      answerer: "منشی",
      goal: "سایر",
      summary: "مشتری درباره قیمت آینه ۴ میل سوال کرد.",
    },
    {
      externalId: "zt-demo-002",
      direction: "INBOUND",
      phone: "09371205362",
      status: "COMPLETED",
      endReason: "ws_close_1011",
      startedAt: new Date(now - 7200_000).toISOString(),
      durationSec: 40,
      turns: 3,
      cost: 0.0179,
      answerer: "منشی",
      goal: "فروش",
      summary: "درخواست پیش‌فاکتور شیشه سکوریت.",
    },
    {
      externalId: "zt-demo-003",
      direction: "INBOUND",
      phone: "0912454587",
      status: "FAILED",
      endReason: "gemini_error",
      startedAt: new Date(now - 86400_000).toISOString(),
      durationSec: 3,
      turns: 0,
      cost: 0,
      answerer: "منشی",
      goal: null,
      summary: null,
    },
  ]
}