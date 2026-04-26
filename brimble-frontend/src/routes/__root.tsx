import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="min-h-full bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800/80 bg-neutral-950/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-md bg-gradient-to-br from-emerald-400 to-teal-600" />
            <div>
              <h1 className="text-sm font-semibold tracking-tight">
                Brimble Deploy
              </h1>
              <p className="text-xs text-neutral-400">
                Push code. Get a URL. Watch it ship.
              </p>
            </div>
          </div>
          <a
            href="https://brimble.io"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-neutral-400 hover:text-neutral-200"
          >
            brimble.io ↗
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
