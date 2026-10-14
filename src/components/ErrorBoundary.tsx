import { Component, type ReactNode } from 'react'

/**
 * The last safety net: if a screen crashes while drawing, show one plain page with a way back
 * instead of a blank white one. It says nothing about what went wrong on screen, and logs only
 * the kind of error, never its text: a message can carry a name or an NID (CLAUDE.md).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    console.error(`The page crashed (${error.name}).`)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main
        role="alert"
        className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6"
      >
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground">
          This page could not be shown. Nothing you did has been lost. Try reloading, and if it
          keeps happening, tell IT.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
          <a className="rounded-md border px-4 py-2 text-sm font-medium" href="/">
            Go to the start
          </a>
        </div>
      </main>
    )
  }
}
