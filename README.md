# TriCaster Control

TanStack Start + React + shadcn/ui app for controlling a Vizrt (NewTek) TriCaster. Deploys to Cloudflare Workers.

Currently implemented: **Audio mixer** (`/audio`): volume, mute, solo, audio-follow-video, mixer memories.

## Setup

```bash
pnpm install
cp .dev.vars.example .dev.vars   # set TRICASTER_URL
pnpm dev                         # http://localhost:3000
```

## How it talks to the TriCaster

The browser never calls the TriCaster directly by default. `src/server.ts` proxies `/tc/v1/*` to
`TRICASTER_URL` (WebSocket upgrades included), so the page stays same-origin over HTTPS.

- **Send:** WebSocket `/v1/shortcut_notifications` (`name=…&value=…`). Falls back to HTTP
  `GET /v1/shortcut?name=…&value=…` when the socket is down. Shortcuts with dictionary entries
  use `POST /v1/shortcut` with XML.
- **State:** WebSocket `/v1/change_notifications` says when `shortcut_states` changed, then the
  client reads `GET /v1/dictionary?key=shortcut_states`. If that socket is down, it polls every second.

The API base can be switched to a direct `http://<ip>` in the header's connection menu. That only
works when the page itself is served over plain HTTP on the same LAN (browsers block `ws://` from
HTTPS pages).

## Deploying to Cloudflare

The Worker has to be able to reach the TriCaster, e.g. through a
[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
running on the show network.

```bash
pnpm wrangler secret put TRICASTER_URL    # e.g. https://tricaster.example.com
pnpm wrangler secret put TRICASTER_AUTH   # optional, "user:password" for LivePanel auth
pnpm deploy
```

**Put Cloudflare Access in front of the Worker.** Anyone who can load the site can control the TriCaster.

## Calling shortcuts from code

`config/shortcuts_cfg.xml` is compiled into types (`src/lib/tricaster/shortcuts.gen.ts`). Rerun
after updating the XML:

```bash
pnpm gen:shortcuts
```

```tsx
import { useShortcutState, useTriCaster } from '#/lib/tricaster'

const tc = useTriCaster()
tc.send('main_background_take')                 // void: no value allowed
tc.send('input3_volume', -6)                    // double: number required
tc.send('input3_mute', true)                    // bool
tc.send('ddr1_play_file', undefined, { path: 'D:\\clip.mov' })  // dictionary entries
tc.sendRaw('some_new_shortcut', 1)              // untyped escape hatch

const vol = useShortcutState('input3_volume')   // number | undefined, live
```

Invalid names and wrong value types are compile errors. Group prefixes are exported too
(`AudioMixerPrefix`, `PtzPrefix`, …) for building typed names like `` `${ch}_mute` ``.
