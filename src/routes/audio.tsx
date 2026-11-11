import { createFileRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { ChannelStrip } from '#/components/audio/channel-strip'
import { Button } from '#/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { useShortcutState, useTriCaster } from '#/lib/tricaster'
import { useLocalSetting } from '#/lib/tricaster/react'
import type { AudioMixerPrefix } from '#/lib/tricaster/shortcuts.gen'

export const Route = createFileRoute('/audio')({ component: AudioMixer })

const MAX_INPUTS = 44
const MEM_SLOTS = 8

const OUTPUTS = [
  { ch: 'master', label: 'Master' },
  { ch: 'aux1', label: 'Aux 1' },
  { ch: 'aux2', label: 'Aux 2' },
  { ch: 'aux3', label: 'Aux 3' },
  { ch: 'stream', label: 'Stream' },
  { ch: 'phones', label: 'Phones' },
  { ch: 'talkback', label: 'Talkback' },
] as const satisfies readonly { ch: AudioMixerPrefix; label: string }[]

const MEDIA = [
  { ch: 'ddr1', label: 'DDR 1' },
  { ch: 'ddr2', label: 'DDR 2' },
  { ch: 'ddr3', label: 'DDR 3' },
  { ch: 'ddr4', label: 'DDR 4' },
  { ch: 'sound', label: 'Sound' },
  { ch: 'effects', label: 'Effects' },
] as const satisfies readonly { ch: AudioMixerPrefix; label: string }[]

type InputChannel = Extract<AudioMixerPrefix, `input${number}`>

function AudioMixer() {
  const tc = useTriCaster()
  const [inputCount, setInputCount] = useLocalSetting('audio.inputs', 8)
  const [hiddenMedia, setHiddenMedia] = useLocalSetting<string[]>('audio.hiddenMedia', [
    'ddr3',
    'ddr4',
    'effects',
  ])

  const inputs = Array.from({ length: inputCount }, (_, i) => `input${i + 1}` as InputChannel)

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3 text-xs">
        <span className="text-muted-foreground">Inputs</span>
        <Button
          variant="outline"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => setInputCount(Math.max(1, inputCount - 1))}
        >
          −
        </Button>
        <span className="w-5 text-center font-mono tabular-nums">{inputCount}</span>
        <Button
          variant="outline"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => setInputCount(Math.min(MAX_INPUTS, inputCount + 1))}
        >
          +
        </Button>

        <span className="ml-3 text-muted-foreground">Media</span>
        {MEDIA.map((m) => {
          const shown = !hiddenMedia.includes(m.ch)
          return (
            <Button
              key={m.ch}
              variant={shown ? 'secondary' : 'ghost'}
              size="sm"
              className="h-6 px-1.5 text-[11px]"
              onClick={() =>
                setHiddenMedia(shown ? [...hiddenMedia, m.ch] : hiddenMedia.filter((c) => c !== m.ch))
              }
            >
              {m.label}
            </Button>
          )
        })}

        <div className="ml-auto flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground">Mem</span>
            </TooltipTrigger>
            <TooltipContent>Click to recall · Shift+click to store</TooltipContent>
          </Tooltip>
          {Array.from({ length: MEM_SLOTS }, (_, i) => (
            <Button
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed slots
              key={i}
              variant="outline"
              size="sm"
              className="h-6 w-6 p-0 font-mono text-[11px]"
              onClick={(e) =>
                void (e.shiftKey
                  ? tc.send('audiomixer_save_to_emem', i)
                  : tc.send('audiomixer_load_from_emem', i))
              }
            >
              {i + 1}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="ml-2 h-6 px-2 text-[11px]"
            onClick={() => void tc.send('audiomixer_solo', '')}
          >
            Clear solo
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
        <Section title="Inputs">
          {inputs.map((ch, i) => (
            <InputStrip key={ch} channel={ch} index={i + 1} />
          ))}
        </Section>
        <Section title="Media">
          {MEDIA.filter((m) => !hiddenMedia.includes(m.ch)).map((m) => (
            <ChannelStrip key={m.ch} channel={m.ch} label={m.label} />
          ))}
        </Section>
        <Section title="Outputs">
          {OUTPUTS.map((o) => (
            <ChannelStrip
              key={o.ch}
              channel={o.ch}
              label={o.label}
              className={o.ch === 'master' ? 'border-primary/40' : undefined}
            />
          ))}
        </Section>
      </div>
    </div>
  )
}

function InputStrip({ channel, index }: { channel: InputChannel; index: number }) {
  // Audio name set on the TriCaster, if any; falls back to "In N".
  const name = useShortcutState(`${channel}_audio_name`)
  const label = typeof name === 'string' && name.trim() ? name : `In ${index}`
  return <ChannelStrip channel={channel} label={label} follow />
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex shrink-0 flex-col gap-1">
      <h2 className="px-0.5 font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
        {title}
      </h2>
      <div className="flex gap-1">{children}</div>
    </section>
  )
}
