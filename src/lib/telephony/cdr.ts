import mysql from "mysql2/promise"
import { prisma } from "@/lib/prisma"
import { telephonyConfig, TEHRAN_OFFSET, TEHRAN_OFFSET_MS } from "./config"
import { normalizePhone } from "./phone"
import { extFromChannel } from "./state"
import { matchPhone } from "./customerLookup"

type CdrRow = {
  calldate: string
  clid: string | null
  src: string
  dst: string
  dcontext: string | null
  channel: string
  dstchannel: string | null
  lastapp: string | null
  lastdata: string | null
  duration: number | null
  billsec: number | null
  disposition: string | null
  uniqueid: string
  recordingfile: string | null
  recdir: string
}

type Direction = "INBOUND" | "OUTBOUND" | "INTERNAL"

let pool: mysql.Pool | null = null
let lastCursor: Date | null = null
let lastWideSweep = 0
let pollRunning = false
let timer: NodeJS.Timeout | null = null

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: telephonyConfig.mysql.host,
      port: telephonyConfig.mysql.port,
      user: telephonyConfig.mysql.user,
      password: telephonyConfig.mysql.password,
      database: telephonyConfig.mysql.database,
      connectionLimit: 2,
      waitForConnections: true,
      dateStrings: true,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10_000,
    })
  }
  return pool
}

function parseTehran(value: string): Date {
  return new Date(`${String(value).replace(" ", "T")}${TEHRAN_OFFSET}`)
}

function toTehranSql(date: Date): string {
  const t = new Date(date.getTime() + TEHRAN_OFFSET_MS)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`
}

function num(value: number | string | null | undefined): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function buildCall(id: string, rows: CdrRow[]) {
  const sorted = [...rows].sort((a, b) => parseTehran(a.calldate).getTime() - parseTehran(b.calldate).getTime())
  const answered = sorted
    .filter((r) => String(r.disposition || "").toUpperCase() === "ANSWERED")
    .sort((a, b) => num(b.billsec) - num(a.billsec))[0]
  const main = answered || [...sorted].sort((a, b) => num(b.billsec) - num(a.billsec))[0]

  const srcExt = extFromChannel(main.channel)
  const dstExt = extFromChannel(main.dstchannel)
  let direction: Direction = "INBOUND"
  if (srcExt && dstExt) direction = "INTERNAL"
  else if (srcExt && !dstExt) direction = "OUTBOUND"

  const startedAt = parseTehran(sorted[0].calldate)
  let endedMs = startedAt.getTime()
  let maxDuration = 0
  let maxBill = 0
  for (const row of sorted) {
    maxDuration = Math.max(maxDuration, num(row.duration))
    maxBill = Math.max(maxBill, num(row.billsec))
    const end = parseTehran(row.calldate).getTime() + num(row.duration) * 1000
    if (end > endedMs) endedMs = end
  }

  const answeredAt = answered
    ? new Date(
        Math.max(
          startedAt.getTime(),
          parseTehran(answered.calldate).getTime() +
            Math.max(0, num(answered.duration) - num(answered.billsec)) * 1000
        )
      )
    : null

  const agentExtension =
    direction === "INBOUND"
      ? extFromChannel(answered?.dstchannel) ||
        sorted.map((r) => extFromChannel(r.dstchannel)).find(Boolean) ||
        null
      : srcExt || dstExt

  // در زنگ گروهی، چند فایل ضبط برای یک تماس ساخته می‌شود؛ فایل مربوط به
  // داخلی‌ای که واقعاً پاسخ داده را ترجیح می‌دهیم.
  const recordingCandidates = sorted.filter((r) => !!r.recordingfile)
  const recRow =
    (agentExtension &&
      recordingCandidates.find((r) => String(r.recordingfile).includes(`-${agentExtension}-`))) ||
    (answered && answered.recordingfile ? answered : null) ||
    recordingCandidates[0] ||
    null
  const recordingFile = recRow?.recordingfile || null
  const recordingPath = recordingFile && recRow?.recdir ? `${recRow.recdir}/${recordingFile}` : null

  const callerNumber = direction === "OUTBOUND" ? srcExt || main.src || "" : main.src || ""
  const calleeNumber = direction === "OUTBOUND" ? main.dst || "" : main.dst || ""
  const matchNumber = direction === "INBOUND" ? callerNumber : direction === "OUTBOUND" ? main.dst : ""

  const rawCdr = JSON.stringify(
    sorted.map((r) => ({
      calldate: r.calldate,
      src: r.src,
      dst: r.dst,
      dcontext: r.dcontext,
      channel: r.channel,
      dstchannel: r.dstchannel,
      disposition: r.disposition,
      duration: r.duration,
      billsec: r.billsec,
      uniqueid: r.uniqueid,
      recordingfile: r.recordingfile,
    }))
  )

  return {
    uniqueId: id,
    direction,
    callerNumber: callerNumber || "نامشخص",
    callerNorm: normalizePhone(callerNumber) || null,
    calleeNumber: calleeNumber || null,
    agentExtension,
    disposition: answered ? "ANSWERED" : String(sorted[sorted.length - 1]?.disposition || "NO ANSWER"),
    startedAt,
    answeredAt,
    endedAt: new Date(endedMs),
    durationSec: maxDuration,
    billSec: maxBill,
    recordingFile,
    recordingPath,
    rawCdr,
    matchNumber,
  }
}

async function loadExtensionMap() {
  const users = await prisma.user.findMany({
    where: { extension: { not: null } },
    select: { id: true, extension: true },
  })
  const map = new Map<string, string>()
  for (const user of users) {
    if (user.extension) map.set(user.extension, user.id)
  }
  return map
}

async function importGroups(groups: Map<string, CdrRow[]>) {
  if (groups.size === 0) return 0

  const extensionMap = await loadExtensionMap()
  const ops: any[] = []

  for (const [id, rows] of groups) {
    const call = buildCall(id, rows)
    let customerId: string | null = null
    if (call.matchNumber) {
      const match = await matchPhone(call.matchNumber)
      if (match?.kind === "customer" && match.dbId) customerId = match.dbId
    }
    const userId = call.agentExtension ? extensionMap.get(call.agentExtension) || null : null

    const create = {
      uniqueId: call.uniqueId,
      direction: call.direction,
      callerNumber: call.callerNumber,
      callerNorm: call.callerNorm,
      calleeNumber: call.calleeNumber,
      agentExtension: call.agentExtension,
      disposition: call.disposition,
      startedAt: call.startedAt,
      answeredAt: call.answeredAt,
      endedAt: call.endedAt,
      durationSec: call.durationSec,
      billSec: call.billSec,
      recordingFile: call.recordingFile,
      recordingPath: call.recordingPath,
      rawCdr: call.rawCdr,
      customerId,
      userId,
    }
    const update = { ...create }
    delete (update as any).uniqueId
    ops.push(
      prisma.pbxCall.upsert({
        where: { uniqueId: call.uniqueId },
        create,
        update,
      })
    )
  }

  let done = 0
  for (let i = 0; i < ops.length; i += 50) {
    await prisma.$transaction(ops.slice(i, i + 50))
    done += Math.min(50, ops.length - i)
    if (ops.length > 500 && done % 500 === 0) {
      console.log(`[telephony] CDR import progress ${done}/${ops.length}`)
    }
  }
  return done
}

async function fetchRows(since: Date): Promise<CdrRow[]> {
  const sql = `
    SELECT calldate, clid, src, dst, dcontext, channel, dstchannel, lastapp, lastdata,
           duration, billsec, disposition, uniqueid, recordingfile,
           DATE_FORMAT(calldate, '%Y/%m/%d') AS recdir
    FROM cdr
    WHERE calldate >= ?
    ORDER BY calldate ASC
  `
  const [rows] = await getPool().query(sql, [toTehranSql(since)])
  return rows as CdrRow[]
}

export async function pollCdrOnce(options?: { initial?: boolean }): Promise<number> {
  if (pollRunning) return 0
  pollRunning = true
  try {
    // CDR هر تماس هنگام قطع شدن نوشته می‌شود ولی calldate زمان شروع است؛
    // هر چند دقیقه یک‌بار چند ساعت اخیر دوباره خوانده می‌شود تا تماس‌های طولانی جا نیفتند.
    const nowMs = Date.now()
    const wideSweep = nowMs - lastWideSweep > 5 * 60_000
    if (wideSweep) lastWideSweep = nowMs

    let since: Date
    if (lastCursor) {
      since = new Date(lastCursor.getTime() - (wideSweep ? 6 * 60 * 60_000 : 10 * 60_000))
    } else {
      const latest = await prisma.pbxCall.findFirst({
        orderBy: { startedAt: "desc" },
        select: { startedAt: true },
      })
      since = latest
        ? new Date(nowMs - 6 * 60 * 60_000)
        : new Date(nowMs - telephonyConfig.backfillDays * 24 * 60 * 60_000)
    }

    const rows = await fetchRows(since)
    if (rows.length === 0) {
      if (options?.initial) console.log("[telephony] CDR poll: no rows found")
      return 0
    }

    const groups = new Map<string, CdrRow[]>()
    let newest = 0
    for (const row of rows) {
      if (!row.uniqueid) continue
      const list = groups.get(row.uniqueid)
      if (list) list.push(row)
      else groups.set(row.uniqueid, [row])
      const t = parseTehran(row.calldate).getTime()
      if (t > newest) newest = t
    }

    const imported = await importGroups(groups)
    if (newest > 0) lastCursor = new Date(newest)
    if (imported > 0) {
      console.log(`[telephony] CDR imported/updated ${imported} calls`)
    }
    return imported
  } catch (e: any) {
    console.error("[telephony] CDR poll failed:", e?.message || e)
    return 0
  } finally {
    pollRunning = false
  }
}

export function startCdrPoller() {
  if (timer) return
  setTimeout(() => {
    pollCdrOnce({ initial: true }).catch(() => {})
  }, 10_000)
  timer = setInterval(() => {
    pollCdrOnce().catch(() => {})
  }, 30_000)
  console.log("[telephony] CDR poller started")
}

export function stopCdrPoller() {
  if (timer) clearInterval(timer)
  timer = null
}
