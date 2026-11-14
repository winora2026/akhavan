import net from "net"
import { EventEmitter } from "events"

type AmiHeaders = Record<string, string>
type Pending = {
  resolve: (headers: AmiHeaders) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

export type AmiOptions = {
  host: string
  port: number
  username: string
  secret: string
}

export class AmiClient extends EventEmitter {
  private socket: net.Socket | null = null
  private buffer = ""
  private pending = new Map<string, Pending>()
  private reconnectTimer: NodeJS.Timeout | null = null
  private pingTimer: NodeJS.Timeout | null = null
  private seq = 0
  private stopped = false
  private loginInFlight = false

  ready = false

  constructor(private readonly opts: AmiOptions) {
    super()
  }

  connect() {
    if (this.stopped || this.socket || this.loginInFlight) return

    const socket = net.createConnection(
      { host: this.opts.host, port: this.opts.port },
      () => this.login()
    )
    this.socket = socket
    socket.setNoDelay(true)
    socket.setKeepAlive(true, 30_000)
    socket.on("data", (chunk) => this.onData(chunk))
    socket.on("error", (err) => {
      this.emit("error", err)
    })
    socket.on("close", () => this.onClose())
    socket.setTimeout(90_000, () => {
      socket.destroy(new Error("AMI idle timeout"))
    })
  }

  disconnect() {
    this.stopped = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.socket?.destroy()
    this.socket = null
    this.ready = false
  }

  private async login() {
    if (!this.socket || this.loginInFlight) return
    this.loginInFlight = true
    try {
      const res = await this.action(
        {
          Action: "Login",
          Username: this.opts.username,
          Secret: this.opts.secret,
          Events: "on",
        },
        10_000
      )
      if (res.Response !== "Success") {
        throw new Error(res.Message || "AMI login rejected")
      }
      this.ready = true
      this.emit("ready")
      this.pingTimer = setInterval(() => {
        this.action({ Action: "Ping" }).catch(() => {})
      }, 25_000)
      console.log(`[telephony] AMI connected to ${this.opts.host}:${this.opts.port}`)
    } catch (e: any) {
      this.emit("error", e)
      this.socket?.destroy()
    } finally {
      this.loginInFlight = false
    }
  }

  private onClose() {
    const wasReady = this.ready
    this.ready = false
    this.socket = null
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
    for (const [, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(new Error("AMI connection closed"))
    }
    this.pending.clear()
    if (wasReady) console.warn("[telephony] AMI connection closed")
    if (!this.stopped) this.scheduleReconnect()
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 5_000)
  }

  private onData(chunk: Buffer) {
    this.buffer += chunk.toString("utf8").replace(/\r\n/g, "\n")
    let idx = this.buffer.indexOf("\n\n")
    while (idx >= 0) {
      const frame = this.buffer.slice(0, idx).trim()
      this.buffer = this.buffer.slice(idx + 2)
      if (frame) this.handleFrame(frame)
      idx = this.buffer.indexOf("\n\n")
    }
  }

  private handleFrame(frame: string) {
    const headers: AmiHeaders = {}
    for (const line of frame.split("\n")) {
      const pos = line.indexOf(":")
      if (pos <= 0) continue
      const key = line.slice(0, pos).trim()
      const value = line.slice(pos + 1).trim()
      if (key) headers[key] = value
    }

    if (headers.Event === "Ping") {
      this.action({ Action: "Pong" }).catch(() => {})
      return
    }

    if (headers.Response) {
      const id = headers.ActionID
      if (id) {
        const pending = this.pending.get(id)
        if (pending) {
          this.pending.delete(id)
          clearTimeout(pending.timer)
          pending.resolve(headers)
          return
        }
      }
      if (!id) this.emit("response", headers)
      return
    }

    if (headers.Event) {
      this.emit("event", headers)
    }
  }

  action(fields: Record<string, string | number | boolean>, timeoutMs = 7_000): Promise<AmiHeaders> {
    const socket = this.socket
    if (!socket || socket.destroyed) {
      return Promise.reject(new Error("AMI is not connected"))
    }
    const actionId = `crm-${Date.now()}-${++this.seq}`
    const payload: Record<string, string | number | boolean> = {
      ...fields,
      ActionID: actionId,
    }

    const lines = Object.entries(payload)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join("\r\n")

    return new Promise<AmiHeaders>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(actionId)
        reject(new Error("AMI action timeout"))
      }, timeoutMs)
      this.pending.set(actionId, { resolve, reject, timer })
      socket.write(lines + "\r\n\r\n")
    })
  }
}
