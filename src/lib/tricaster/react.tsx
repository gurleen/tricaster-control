import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { type ConnectionStatus, type Transport, TriCasterClient } from './client'
import type { ShortcutName, ShortcutState } from './types'

const Ctx = createContext<TriCasterClient | null>(null)

export function TriCasterProvider({ baseUrl, children }: { baseUrl: string; children: ReactNode }) {
  const client = useMemo(() => new TriCasterClient({ baseUrl }), [baseUrl])
  useEffect(() => {
    client.connect()
    return () => client.disconnect()
  }, [client])
  return <Ctx.Provider value={client}>{children}</Ctx.Provider>
}

export function useTriCaster(): TriCasterClient {
  const c = useContext(Ctx)
  if (!c) throw new Error('useTriCaster must be used inside <TriCasterProvider>')
  return c
}

export function useConnection(): { status: ConnectionStatus; transport: Transport; error?: string } {
  const c = useTriCaster()
  const snap = useSyncExternalStore(
    (cb) => c.onStatusChange(cb),
    () => `${c.status}|${c.transport}|${c.lastError ?? ''}`,
    () => 'idle|http|',
  )
  const [status, transport, error] = snap.split('|') as [ConnectionStatus, Transport, string]
  return { status, transport, error: error || undefined }
}

function parseState(raw: string | undefined): unknown {
  if (raw === undefined) return undefined
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw.trim() !== '' && !Number.isNaN(Number(raw))) return Number(raw)
  return raw
}

/** Live, parsed state of a shortcut (`undefined` until the TriCaster reports it). */
export function useShortcutState<N extends ShortcutName>(name: N): ShortcutState<N> | undefined {
  const c = useTriCaster()
  const subscribe = useCallback(
    (cb: () => void) => c.onStateChange((changed) => changed.has(name) && cb()),
    [c, name],
  )
  const raw = useSyncExternalStore(
    subscribe,
    () => c.getRawState(name),
    () => undefined,
  )
  return useMemo(() => parseState(raw) as ShortcutState<N> | undefined, [raw])
}

/**
 * Sends continuous values (faders) at most once per `ms`, always delivering
 * the last value.
 */
export function useThrottledSend<T>(send: (v: T) => void, ms = 40) {
  const last = useRef(0)
  const pending = useRef<{ v: T } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const sendRef = useRef(send)
  sendRef.current = send

  useEffect(() => () => clearTimeout(timer.current), [])

  return useCallback(
    (v: T) => {
      const now = Date.now()
      const wait = ms - (now - last.current)
      if (wait <= 0) {
        last.current = now
        sendRef.current(v)
        return
      }
      pending.current = { v }
      if (!timer.current) {
        timer.current = setTimeout(() => {
          timer.current = undefined
          last.current = Date.now()
          if (pending.current) sendRef.current(pending.current.v)
          pending.current = null
        }, wait)
      }
    },
    [ms],
  )
}

/** Small helper for local-only UI state that survives reloads. */
export function useLocalSetting<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw !== null) setValue(JSON.parse(raw) as T)
    } catch {}
  }, [key])
  const set = useCallback(
    (v: T) => {
      setValue(v)
      try {
        localStorage.setItem(key, JSON.stringify(v))
      } catch {}
    },
    [key],
  )
  return [value, set] as const
}
