import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ErrorBoundary } from './ErrorBoundary'

function Boom(): never {
  throw new Error('Test Person One 200012345678 secret')
}

describe('ErrorBoundary', () => {
  it('shows its children when nothing is wrong', () => {
    render(
      <ErrorBoundary>
        <p>fine</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('fine')).toBeInTheDocument()
  })

  it('shows one plain page when a screen crashes, and never the error text', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('200012345678')
    // The boundary logs the kind of error, not its text. (React's own development logging of a
    // caught error is switched off in main.tsx, where the root is made.)
    const ours = spy.mock.calls
      .map((c) => c.join(' '))
      .filter((l) => l.startsWith('The page crashed'))
    expect(ours).toEqual(['The page crashed (Error).'])
    spy.mockRestore()
  })
})
