import type { ShortcutArgs, ShortcutName, WireValue } from './types'

/**
 * TriCaster control client.
 *
 * Sending: shortcuts go over the `/v1/shortcut_notifications` WebSocket as
 * `name=...&value=...` messages. If that socket isn't open, or the shortcut
 * carries a dictionary, it falls back to the HTTP API (`/v1/shortcut`).
 *
 * State: `/v1/change_notifications` tells us which dictionary changed; we then
 * re-read `/v1/dictionary?key=shortcut_states`. Without that socket we poll.
 */

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'degraded' | 'offline'
export type Transport = 'ws' | 'http'

export interface TriCasterClientOptions {
  /**
   * Where the TriCaster API lives. Either a path on this origin that proxies to
   * the TriCaster (default `/tc`, see src/server.ts), or an absolute URL such as
   * `http://192.168.1.50` for direct LAN access.
   */
  baseUrl: string
  /** Poll interval for shortcut_states when the notification socket is down. */
  pollMs?: number
}

export const WS_PATHS = {
  shortcuts: '/v1/shortcut_notifications',
  changes: '/v1/change_notifications',
} as const

type StateListener = (changed: ReadonlySet<string>) => void
type StatusListener = () => void

const KEEPALIVE_MS = 15_000

export class TriCasterClient {
  readonly baseUrl: string
  private readonly pollMs: number
  private cmdSocket?: WebSocket
  private changeSocket?: WebSocket
  private timers = new Set<ReturnType<typeof setTimeout>>()
  private pollTimer?: ReturnType<typeof setInterval>
  private backoff = 1000
  private stopped = true
  /** Bumped on every connect/disconnect so stale socket callbacks are ignored. */
  private gen = 0
  private fetchingStates?: Promise<void>
  private refetchQueued = false

  private states = new Map<string, string>()
  private stateListeners = new Set<StateListener>()
  private statusListeners = new Set<StatusListener>()

  status: ConnectionStatus = 'idle'
  transport: Transport = 'http'
  lastError?: string

  constructor(opts: TriCasterClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')
    this.pollMs = opts.pollMs ?? 1000
  }

  // ---- lifecycle ----------------------------------------------------------

  connect() {
    if (!this.stopped) return
    this.stopped = false
    this.gen++
    this.setStatus('connecting')
    this.openCmdSocket()
    this.openChangeSocket()
    void this.refreshStates()
  }

  disconnect() {
    this.stopped = true
    this.gen++
    for (const t of this.timers) clearTimeout(t)
    this.timers.clear()
    this.stopPolling()
    this.cmdSocket?.close(1000)
    this.changeSocket?.close(1000)
    this.cmdSocket = this.changeSocket = undefined
    this.setStatus('idle')
  }

  // ---- sending ------------------------------------------------------------

  /** Type-safe shortcut call. `send('input1_volume', -6)`, `send('main_take')`. */
  send<N extends ShortcutName>(name: N, ...args: ShortcutArgs<N>): Promise<void> {
    const [value, dict] = args as [WireValue | undefined, Record<string, WireValue> | undefined]
    return this.sendRaw(name, value, dict)
  }

  /** Untyped escape hatch for names not in the config (e.g. newer firmware). */
  async sendRaw(
    name: string,
    value?: WireValue,
    dict?: Record<string, WireValue | undefined>,
  ): Promise<void> {
    if (value !== undefined) this.setLocalState(name, String(value))

    const cleanDict = dict
      ? Object.fromEntries(Object.entries(dict).filter(([, v]) => v !== undefined))
      : undefined
    const hasDict = cleanDict && Object.keys(cleanDict).length > 0

    if (!hasDict && this.cmdSocket?.readyState === WebSocket.OPEN) {
      this.cmdSocket.send(queryString(name, value))
      return
    }
    await this.sendHttp(name, value, hasDict ? (cleanDict as Record<string, WireValue>) : undefined)
  }

  private async sendHttp(name: string, value?: WireValue, dict?: Record<string, WireValue>) {
    const init: RequestInit = this.isCrossOrigin() ? { mode: 'no-cors' } : {}
    try {
      if (dict) {
        const entries = Object.entries(dict)
          .map(([k, v]) => `<entry key="${xmlEscape(k)}" value="${xmlEscape(String(v))}" />`)
          .join('')
        const valueAttr = value === undefined ? '' : ` value="${xmlEscape(String(value))}"`
        const body = `<shortcuts><shortcut name="${xmlEscape(name)}"${valueAttr}>${entries}</shortcut></shortcuts>`
        await fetch(`${this.baseUrl}/v1/shortcut`, { ...init, method: 'POST', body })
      } else {
        await fetch(`${this.baseUrl}/v1/shortcut?${queryString(name, value)}`, init)
      }
    } catch (err) {
      this.lastError = `HTTP send failed: ${String(err)}`
      this.setStatus('offline')
      throw err
    }
  }

  // ---- state --------------------------------------------------------------

  /** Raw state string as reported by the TriCaster. */
  getRawState(name: string): string | undefined {
    return this.states.get(name)
  }

  onStateChange(fn: StateListener): () => void {
    this.stateListeners.add(fn)
    return () => this.stateListeners.delete(fn)
  }

  onStatusChange(fn: StatusListener): () => void {
    this.statusListeners.add(fn)
    return () => this.statusListeners.delete(fn)
  }

  /** Re-read all shortcut states. Coalesces concurrent calls. */
  refreshStates(): Promise<void> {
    if (this.fetchingStates) {
      this.refetchQueued = true
      return this.fetchingStates
    }
    this.fetchingStates = this.fetchStates().finally(() => {
      this.fetchingStates = undefined
      if (this.refetchQueued) {
        this.refetchQueued = false
        void this.refreshStates()
      }
    })
    return this.fetchingStates
  }

  private async fetchStates() {
    // Cross-origin reads only work if the TriCaster sends CORS headers.
    try {
      const res = await fetch(`${this.baseUrl}/v1/dictionary?key=shortcut_states`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      this.applyStatesXml(await res.text())
      if (this.status === 'connecting' || this.status === 'offline') this.updateStatus()
    } catch (err) {
      this.lastError = `State read failed: ${String(err)}`
      this.updateStatus()
    }
  }

  private applyStatesXml(xml: string) {
    const doc = new DOMParser().parseFromString(xml, 'text/xml')
    const changed = new Set<string>()
    for (const el of Array.from(doc.getElementsByTagName('shortcut_state'))) {
      const name = el.getAttribute('name')
      const value = el.getAttribute('value') ?? ''
      if (name && this.states.get(name) !== value) {
        this.states.set(name, value)
        changed.add(name)
      }
    }
    if (changed.size) this.emitStates(changed)
  }

  private setLocalState(name: string, value: string) {
    if (this.states.get(name) === value) return
    this.states.set(name, value)
    this.emitStates(new Set([name]))
  }

  private emitStates(changed: Set<string>) {
    for (const fn of this.stateListeners) fn(changed)
  }

  // ---- sockets ------------------------------------------------------------

  private openCmdSocket() {
    const ws = this.openSocket(WS_PATHS.shortcuts, () => this.openCmdSocket(), false)
    if (!ws) return
    this.cmdSocket = ws
    ws.addEventListener('message', (e) => this.handleMessage(e.data))
  }

  private openChangeSocket() {
    const ws = this.openSocket(WS_PATHS.changes, () => this.openChangeSocket(), true)
    if (!ws) return
    this.changeSocket = ws
    ws.addEventListener('message', (e) => this.handleMessage(e.data))
  }

  private openSocket(path: string, reopen: () => void, keepAlive: boolean): WebSocket | undefined {
    const gen = this.gen
    const current = () => gen === this.gen && !this.stopped
    let ws: WebSocket
    try {
      ws = new WebSocket(this.wsUrl(path))
    } catch (err) {
      this.lastError = `WebSocket failed: ${String(err)}`
      this.updateStatus()
      this.schedule(reopen)
      return undefined
    }
    let ping: ReturnType<typeof setInterval> | undefined
    ws.addEventListener('open', () => {
      if (!current()) return ws.close(1000)
      this.backoff = 1000
      if (keepAlive) {
        ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('keep alive'), KEEPALIVE_MS)
      }
      this.updateStatus()
      void this.refreshStates()
    })
    ws.addEventListener('close', () => {
      clearInterval(ping)
      if (!current()) return
      this.updateStatus()
      this.schedule(reopen)
    })
    ws.addEventListener('error', () => {
      if (current()) this.lastError = `WebSocket error on ${path}`
    })
    return ws
  }

  private handleMessage(data: unknown) {
    if (typeof data !== 'string') return
    const msg = data.trim()
    if (!msg) return
    if (msg.includes('<shortcut_state')) {
      this.applyStatesXml(msg)
    } else if (msg === 'shortcut_states' || msg.startsWith('shortcut_state')) {
      void this.refreshStates()
    }
  }

  private schedule(fn: () => void) {
    if (this.stopped) return
    const gen = this.gen
    const t = setTimeout(() => {
      this.timers.delete(t)
      if (gen === this.gen && !this.stopped) fn()
    }, this.backoff)
    this.timers.add(t)
    this.backoff = Math.min(this.backoff * 2, 10_000)
  }

  private updateStatus() {
    if (this.stopped) return
    const cmdOpen = this.cmdSocket?.readyState === WebSocket.OPEN
    const changesOpen = this.changeSocket?.readyState === WebSocket.OPEN
    this.transport = cmdOpen ? 'ws' : 'http'

    if (changesOpen) this.stopPolling()
    else this.startPolling()

    if (cmdOpen && changesOpen) this.setStatus('connected')
    else if (cmdOpen || changesOpen || this.states.size > 0) this.setStatus('degraded')
    else this.setStatus(this.status === 'connecting' ? 'connecting' : 'offline')
  }

  private startPolling() {
    if (this.pollTimer || this.stopped) return
    this.pollTimer = setInterval(() => void this.refreshStates(), this.pollMs)
  }

  private stopPolling() {
    clearInterval(this.pollTimer)
    this.pollTimer = undefined
  }

  private setStatus(s: ConnectionStatus) {
    if (this.status === s) return
    this.status = s
    for (const fn of this.statusListeners) fn()
  }

  // ---- urls ---------------------------------------------------------------

  private absoluteBase(): URL {
    return new URL(this.baseUrl || '/', window.location.href)
  }

  private isCrossOrigin() {
    return this.absoluteBase().origin !== window.location.origin
  }

  private wsUrl(path: string) {
    const u = this.absoluteBase()
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    u.pathname = `${u.pathname.replace(/\/+$/, '')}${path}`
    return u.toString()
  }
}

function queryString(name: string, value?: WireValue) {
  const q = new URLSearchParams({ name })
  if (value !== undefined) q.set('value', String(value))
  return q.toString()
}

function xmlEscape(s: string) {
  return s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`)
}
