import { telephonyConfig } from "./config"
import { AmiClient } from "./ami"
import { cleanupLiveCalls, handleAmiEvent } from "./state"
import { startCdrPoller } from "./cdr"

const g = globalThis as any

export type TelephonyStats = {
  enabled: boolean
  amiReady: boolean
  events: number
  lastEventAt: number | null
  lastEventName: string | null
  startedAt: number | null
}

export function startTelephony() {
  if (!telephonyConfig.enabled) {
    console.log("[telephony] disabled (TELEPHONY_ENABLED is not true)")
    return
  }
  if (g.__pbxStarted) return
  g.__pbxStarted = true
  g.__pbxStartedAt = Date.now()
  g.__pbxEvents = 0
  g.__pbxLastEventAt = null
  g.__pbxLastEventName = null

  if (!telephonyConfig.ami.secret) {
    console.error("[telephony] AMI_SECRET is not configured")
    return
  }

  const client = new AmiClient(telephonyConfig.ami)
  client.on("ready", () => {
    console.log("[telephony] ready")
  })
  client.on("error", (e: any) => {
    console.warn("[telephony] AMI error:", e?.message || e)
  })
  client.on("event", (ev: Record<string, string>) => {
    g.__pbxEvents = (g.__pbxEvents || 0) + 1
    g.__pbxLastEventAt = Date.now()
    g.__pbxLastEventName = ev.Event || null
    try {
      handleAmiEvent(ev)
    } catch (e) {
      console.error("[telephony] event handler failed", e)
    }
  })

  client.connect()
  g.__pbxAmi = client

  startCdrPoller()
  if (!g.__pbxCleanupTimer) {
    g.__pbxCleanupTimer = setInterval(cleanupLiveCalls, 60_000)
  }
}

export function getAmiClient(): AmiClient | null {
  return g.__pbxAmi || null
}

export function isTelephonyReady(): boolean {
  const client: AmiClient | null = g.__pbxAmi || null
  return !!client?.ready
}

export function getTelephonyStats(): TelephonyStats {
  return {
    enabled: telephonyConfig.enabled,
    amiReady: isTelephonyReady(),
    events: g.__pbxEvents || 0,
    lastEventAt: g.__pbxLastEventAt || null,
    lastEventName: g.__pbxLastEventName || null,
    startedAt: g.__pbxStartedAt || null,
  }
}
