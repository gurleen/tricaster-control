import { createRootRoute, HeadContent, Link, Outlet, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { ConnectionMenu } from '#/components/connection-menu'
import { TooltipProvider } from '#/components/ui/tooltip'
import { TriCasterProvider } from '#/lib/tricaster'
import { useLocalSetting } from '#/lib/tricaster/react'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'TriCaster Control' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
  component: App,
})

const NAV = [{ to: '/audio', label: 'Audio' }] as const

function App() {
  const [baseUrl, setBaseUrl] = useLocalSetting('tc.baseUrl', '/tc')
  return (
    <TriCasterProvider baseUrl={baseUrl}>
      <TooltipProvider delayDuration={400}>
        <div className="flex h-dvh flex-col">
          <header className="flex h-9 shrink-0 items-center gap-3 border-b px-3">
            <span className="font-semibold tracking-tight">TriCaster</span>
            <nav className="flex gap-1">
              {NAV.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  className="rounded px-2 py-0.5 text-muted-foreground hover:text-foreground"
                  activeProps={{ className: 'bg-secondary text-foreground' }}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto">
              <ConnectionMenu baseUrl={baseUrl} onBaseUrlChange={setBaseUrl} />
            </div>
          </header>
          <main className="min-h-0 flex-1">
            <Outlet />
          </main>
        </div>
      </TooltipProvider>
    </TriCasterProvider>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
