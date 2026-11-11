import { useEffect, useState } from 'react'
import { Slider } from '#/components/ui/slider'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { useShortcutState, useThrottledSend, useTriCaster } from '#/lib/tricaster'
import type { AudioMixerPrefix } from '#/lib/tricaster/shortcuts.gen'
import { cn } from '#/lib/utils'

// Piecewise fader taper: more travel around 0 dB, like a real console.
const TAPER: [pos: number, db: number][] = [
  [0, -100],
  [0.1, -60],
  [0.4, -20],
  [0.75, 0],
  [1, 12],
]
const STEPS = 1000

function posToDb(pos: number) {
  const p = pos / STEPS
  for (let i = 1; i < TAPER.length; i++) {
    const [p0, d0] = TAPER[i - 1]
    const [p1, d1] = TAPER[i]
    if (p <= p1) return Math.round((d0 + ((p - p0) / (p1 - p0)) * (d1 - d0)) * 10) / 10
  }
  return 12
}

function dbToPos(db: number) {
  for (let i = 1; i < TAPER.length; i++) {
    const [p0, d0] = TAPER[i - 1]
    const [p1, d1] = TAPER[i]
    if (db <= d1) return Math.round((p0 + ((Math.max(db, d0) - d0) / (d1 - d0)) * (p1 - p0)) * STEPS)
  }
  return STEPS
}

const fmtDb = (db: number) => (db <= -99 ? '-∞' : `${db > 0 ? '+' : ''}${db.toFixed(1)}`)

export function ChannelStrip({
  channel,
  label,
  follow = false,
  className,
}: {
  channel: AudioMixerPrefix
  label: string
  /** Show the "follow video" toggle (inputs only). */
  follow?: boolean
  className?: string
}) {
  const tc = useTriCaster()
  const volume = useShortcutState(`${channel}_volume`)
  const mute = useShortcutState(`${channel}_mute`)
  const solo = useShortcutState(`${channel}_solo`)
  const following = useShortcutState(`${channel}_follow`)

  // While dragging, the local value wins over incoming state.
  const [dragDb, setDragDb] = useState<number | null>(null)
  const known = dragDb !== null || typeof volume === 'number'
  const db = dragDb ?? (typeof volume === 'number' ? volume : 0)

  const sendVolume = useThrottledSend((v: number) => void tc.send(`${channel}_volume`, v))

  useEffect(() => {
    if (dragDb === null) return
    const end = () => setDragDb(null)
    window.addEventListener('pointerup', end)
    return () => window.removeEventListener('pointerup', end)
  }, [dragDb])

  return (
    <div
      className={cn(
        'flex w-14 shrink-0 flex-col items-center gap-1.5 rounded-md border bg-card px-1 py-1.5',
        mute && 'opacity-70',
        className,
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-full truncate text-center font-medium text-[11px] leading-none">{label}</div>
        </TooltipTrigger>
        <TooltipContent side="top">
          {label} <span className="font-mono text-muted-foreground">({channel})</span>
        </TooltipContent>
      </Tooltip>

      <button
        type="button"
        title="Double-click for 0 dB"
        onDoubleClick={() => void tc.send(`${channel}_volume`, 0)}
        className="w-full rounded bg-background py-0.5 text-center font-mono text-[11px] tabular-nums"
      >
        {known ? fmtDb(db) : '—'}
      </button>

      <div className="relative flex h-44 w-full justify-center">
        <Scale />
        <Slider
          orientation="vertical"
          min={0}
          max={STEPS}
          step={1}
          value={[dbToPos(db)]}
          onValueChange={([p]) => {
            const v = posToDb(p)
            setDragDb(v)
            sendVolume(v)
          }}
          onDoubleClick={() => void tc.send(`${channel}_volume`, 0)}
          aria-label={`${label} volume`}
          className="h-full"
        />
      </div>

      <div className="grid w-full grid-cols-2 gap-0.5">
        <StripButton
          active={mute === true}
          activeClass="bg-red-600 text-white"
          onClick={() => void tc.send(`${channel}_mute`, !mute)}
          title="Mute"
        >
          M
        </StripButton>
        <StripButton
          active={solo === true}
          activeClass="bg-amber-400 text-black"
          onClick={() => void tc.send(`${channel}_solo`, !solo)}
          title="Solo"
        >
          S
        </StripButton>
      </div>
      {follow && (
        <StripButton
          active={following === true}
          activeClass="bg-sky-600 text-white"
          onClick={() => void tc.send(`${channel}_follow`, !following)}
          title="Follow video"
          className="w-full"
        >
          AFV
        </StripButton>
      )}
    </div>
  )
}

function StripButton({
  active,
  activeClass,
  className,
  ...props
}: React.ComponentProps<'button'> & { active: boolean; activeClass: string }) {
  return (
    <button
      type="button"
      className={cn(
        'h-5 rounded font-semibold text-[10px] transition-colors',
        active ? activeClass : 'bg-secondary text-muted-foreground hover:text-foreground',
        className,
      )}
      {...props}
    />
  )
}

const MARKS = [12, 0, -10, -20, -40, -60]

function Scale() {
  return (
    <div className="pointer-events-none absolute inset-y-0 left-0 w-full">
      {MARKS.map((m) => (
        <span
          key={m}
          className="absolute left-0 -translate-y-1/2 font-mono text-[8px] text-muted-foreground leading-none"
          style={{ bottom: `${(dbToPos(m) / STEPS) * 100}%`, transform: 'translateY(50%)' }}
        >
          {m > 0 ? `+${m}` : m}
        </span>
      ))}
    </div>
  )
}
