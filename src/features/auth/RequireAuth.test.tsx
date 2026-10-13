import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'

import { AuthContext, type AuthState } from './auth-context'
import { RequireAuth } from './RequireAuth'

// Fake people only: never real staff names or NIDs in tests (CLAUDE.md).
const PROFILE = {
  id: 'u-1',
  full_name: 'Test Admin',
  role: 'admin' as const,
  employee_id: null,
  created_at: '2026-01-01T00:00:00Z',
}

function renderGuard(state: Partial<AuthState>) {
  const value: AuthState = {
    loading: false,
    userId: null,
    email: null,
    profile: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    ...state,
  }

  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/login" element={<p>login page</p>} />
          <Route path="/no-access" element={<p>no access page</p>} />
          <Route element={<RequireAuth />}>
            <Route index element={<p>protected page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('RequireAuth', () => {
  it('shows a loading state and decides nothing while auth is still resolving', () => {
    renderGuard({ loading: true })

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('protected page')).not.toBeInTheDocument()
    expect(screen.queryByText('login page')).not.toBeInTheDocument()
  })

  it('sends a logged-out visitor to the login page', () => {
    renderGuard({ userId: null })

    expect(screen.getByText('login page')).toBeInTheDocument()
    expect(screen.queryByText('protected page')).not.toBeInTheDocument()
  })

  it('sends a logged-in user with no profile row to the no-access page', () => {
    renderGuard({ userId: 'u-1', email: 'nobody@example.com', profile: null })

    expect(screen.getByText('no access page')).toBeInTheDocument()
    expect(screen.queryByText('protected page')).not.toBeInTheDocument()
  })

  it('lets a user with a profile row through', () => {
    renderGuard({ userId: 'u-1', email: 'admin@example.com', profile: PROFILE })

    expect(screen.getByText('protected page')).toBeInTheDocument()
  })
})
