export type LiveCallState = "NEW" | "RINGING" | "TALKING" | "ENDED"
export type CallDirection = "INBOUND" | "OUTBOUND" | "INTERNAL"

export type LiveCall = {
  id: string
  uniqueId?: string
  direction: CallDirection
  state: LiveCallState
  callerNumber: string
  calleeNumber?: string
  callerChannel?: string
  answeredChannel?: string
  ringingExtensions: string[]
  answeredExtension?: string
  startedAt: number
  answeredAt?: number
  endedAt?: number
  disposition?: string
  lastDialStatus?: string
  updatedAt: number
}

type Headers = Record<string, string>
type Store = {
  calls: Map<string, LiveCall>
  channelToCall: Map<string, string>
}

const g = globalThis as any
const store: Store = g.__pbxLiveStore || (g.__pbxLiveStore = { calls: new Map(), channelToCall: new Map() })

function now() {
  return Date.now()
}

export function extFromChannel(channel?: string | null): string | null {
  if (!channel) return null
  const match = String(channel).match(/^(?:SIP|PJSIP|IAX2|DAHDI|Local)\/([0-9]{2,6})(?:[-@;:. ]|$)/i)
  return match ? match[1] : null
}

function resolveCallId(ev: Headers): string {
  if (ev.Linkedid) return ev.Linkedid
  const byChannel = ev.Channel ? store.channelToCall.get(ev.Channel) : undefined
  if (byChannel) return byChannel
  return ev.Uniqueid || ""
}

function ensureCall(id: string, ev: Headers): LiveCall {
  let call = store.calls.get(id)
  if (call) return call

  const channel = ev.Channel
  const callerExt = extFromChannel(channel)
  call = {
    id,
    uniqueId: ev.Uniqueid,
    direction: callerExt ? "OUTBOUND" : "INBOUND",
    state: "NEW",
    callerNumber: ev.CallerIDNum || "",
    callerChannel: channel,
    ringingExtensions: [],
    startedAt: now(),
    updatedAt: now(),
  }
  store.calls.set(id, call)
  if (channel) store.channelToCall.set(channel, id)
  return call
}

function onNewChannel(ev: Headers) {
  const id = ev.Linkedid || ev.Uniqueid
  if (!id || !ev.Channel) return
  const call = ensureCall(id, ev)
  if (ev.Channel) store.channelToCall.set(ev.Channel, id)
  call.updatedAt = now()
}

function onDialBegin(ev: Headers) {
  const id = resolveCallId(ev)
  if (!id) return
  const call = ensureCall(id, ev)
  if (ev.Channel) store.channelToCall.set(ev.Channel, id)
  if (ev.DestChannel) store.channelToCall.set(ev.DestChannel, id)

  const callerExt = extFromChannel(ev.Channel)
  const destExt = extFromChannel(ev.DestChannel)
  const dialed = ev.DialString || ev.Exten || ""

  if (!call.callerChannel && ev.Channel) call.callerChannel = ev.Channel
  if (call.state === "NEW" || call.state === "RINGING") call.state = "RINGING"

  if (callerExt && destExt) {
    call.direction = "INTERNAL"
    call.callerNumber = callerExt
    call.calleeNumber = destExt
  } else if (callerExt && !destExt) {
    call.direction = "OUTBOUND"
    call.callerNumber = callerExt
    if (dialed) call.calleeNumber = dialed
  } else {
    call.direction = "INBOUND"
    if (ev.CallerIDNum) call.callerNumber = ev.CallerIDNum
    if (destExt) call.calleeNumber = destExt
  }

  if (destExt && !call.ringingExtensions.includes(destExt)) {
    call.ringingExtensions.push(destExt)
  }
  call.updatedAt = now()
}

function onDialEnd(ev: Headers) {
  const id = resolveCallId(ev)
  if (!id) return
  const call = store.calls.get(id)
  if (!call) return
  if (ev.DestChannel) store.channelToCall.set(ev.DestChannel, id)
  call.lastDialStatus = ev.DialStatus || call.lastDialStatus
  call.updatedAt = now()

  if (ev.DialStatus !== "ANSWER") return

  const destExt = extFromChannel(ev.DestChannel)
  const callerExt = extFromChannel(ev.Channel)
  call.state = "TALKING"
  call.answeredAt = call.answeredAt || now()

  if (call.direction === "OUTBOUND") {
    call.answeredExtension = callerExt || call.answeredExtension
    call.answeredChannel = ev.Channel || call.answeredChannel
  } else {
    call.answeredExtension = destExt || call.answeredExtension
    call.answeredChannel = ev.DestChannel || call.answeredChannel
  }
}

function onBridgeEnter(ev: Headers) {
  const id = resolveCallId(ev)
  if (!id) return
  const call = store.calls.get(id)
  if (!call || call.direction !== "INBOUND") return
  const channel = ev.Channel
  const ext = extFromChannel(channel)
  if (!ext) return
  if (call.ringingExtensions.includes(ext) && !call.answeredExtension) {
    call.state = "TALKING"
    call.answeredExtension = ext
    call.answeredChannel = channel
    call.answeredAt = call.answeredAt || now()
    call.updatedAt = now()
  }
}

function onHangup(ev: Headers) {
  const id = resolveCallId(ev)
  if (!id) return
  const call = store.calls.get(id)
  if (!call) return

  const channel = ev.Channel
  const isCallerLeg = !!channel && channel === call.callerChannel
  const isAnsweredLeg = !!channel && channel === call.answeredChannel

  if (isCallerLeg || (call.state === "TALKING" && isAnsweredLeg)) {
    if (call.state !== "ENDED") {
      call.state = "ENDED"
      call.endedAt = now()
      const cause = String(ev.Cause || "")
      if (call.answeredExtension) call.disposition = "ANSWERED"
      else if (cause === "17") call.disposition = "BUSY"
      else call.disposition = "NO ANSWER"
    }
  }
  call.updatedAt = now()
}

export function handleAmiEvent(ev: Headers) {
  switch (ev.Event) {
    case "Newchannel":
      onNewChannel(ev)
      break
    case "DialBegin":
    case "Dial":
      onDialBegin(ev)
      break
    case "DialEnd":
      onDialEnd(ev)
      break
    case "BridgeEnter":
      onBridgeEnter(ev)
      break
    case "Hangup":
      onHangup(ev)
      break
    default:
      break
  }
}

export function getLiveCallsForExtension(extension: string): LiveCall[] {
  if (!extension) return []
  const result: LiveCall[] = []
  const ts = now()

  for (const call of store.calls.values()) {
    if (call.direction !== "INBOUND") continue
    if (call.state === "NEW") continue
    if (ts - call.startedAt > 6 * 60 * 60 * 1000) continue

    const rangMe = call.ringingExtensions.includes(extension)
    const answeredMe = call.answeredExtension === extension

    if (call.state === "RINGING" && rangMe) {
      result.push(call)
    } else if (call.state === "TALKING" && (answeredMe || (rangMe && !call.answeredExtension))) {
      result.push(call)
    } else if (call.state === "ENDED") {
      const stillFresh = ts - (call.endedAt || ts) < 60_000
      if (stillFresh && (answeredMe || (rangMe && !call.answeredExtension))) {
        result.push(call)
      }
    }
  }

  return result.sort((a, b) => b.startedAt - a.startedAt)
}

export function getLiveSnapshot() {
  return Array.from(store.calls.values()).sort((a, b) => b.startedAt - a.startedAt)
}

export function cleanupLiveCalls() {
  const ts = now()
  for (const [id, call] of store.calls) {
    const tooOld =
      (call.state === "ENDED" && ts - (call.endedAt || call.updatedAt) > 5 * 60 * 1000) ||
      ts - call.startedAt > 6 * 60 * 60 * 1000
    if (tooOld) {
      store.calls.delete(id)
      if (call.callerChannel) store.channelToCall.delete(call.callerChannel)
      if (call.answeredChannel) store.channelToCall.delete(call.answeredChannel)
    }
  }
}
