import { useEffect, useState } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover'
import { type ConnectionStatus, useConnection } from '#/lib/tricaster'
import { cn } from '#/lib/utils'

const DOT: Record<ConnectionStatus, string> = {
  idle: 'bg-muted-foreground',
  connecting: 'bg-amber-400 animate-pulse',
  connected: 'bg-emerald-500',
  degraded: 'bg-amber-400',
  offline: 'bg-red-500',
}

export function ConnectionMenu({
  baseUrl,
  onBaseUrlChange,
}: {
  baseUrl: string
  onBaseUrlChange: (v: string) => void
}) {
  const { status, transport, error } = useConnection()
  const [draft, setDraft] = useState(baseUrl)
  useEffect(() => setDraft(baseUrl), [baseUrl])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-2 px-2 text-xs">
          <span className={cn('size-2 rounded-full', DOT[status])} />
          <span className="capitalize">{status}</span>
          <span className="font-mono text-muted-foreground uppercase">{transport}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3 text-xs">
        <form
          className="space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            onBaseUrlChange(draft.trim() || '/tc')
          }}
        >
          <Label htmlFor="tc-url" className="text-xs">
            TriCaster API base
          </Label>
          <div className="flex gap-1.5">
            <Input
              id="tc-url"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="/tc or http://192.168.1.50"
              className="h-7 font-mono text-xs"
            />
            <Button type="submit" size="sm" className="h-7">
              Apply
            </Button>
          </div>
          <p className="text-muted-foreground">
            <code>/tc</code> goes through this app's Worker proxy (set <code>TRICASTER_URL</code>). Use a
            direct <code>http://</code> address only when this page is also served over plain HTTP on the same
            network.
          </p>
        </form>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">Status</dt>
          <dd className="capitalize">{status}</dd>
          <dt className="text-muted-foreground">Sending via</dt>
          <dd>{transport === 'ws' ? 'WebSocket' : 'HTTP fallback'}</dd>
          {error && (
            <>
              <dt className="text-muted-foreground">Last error</dt>
              <dd className="break-words text-red-400">{error}</dd>
            </>
          )}
        </dl>
      </PopoverContent>
    </Popover>
  )
}
