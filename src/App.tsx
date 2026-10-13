import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router'

import { AppLayout } from '@/components/AppLayout'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { LoginPage } from '@/features/auth/LoginPage'
import { NoAccessPage } from '@/features/auth/NoAccessPage'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { PlaceholderPage } from '@/features/dashboard/PlaceholderPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/no-access" element={<NoAccessPage />} />

            <Route element={<RequireAuth />}>
              <Route element={<AppLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="assets" element={<PlaceholderPage title="Assets" phase="Phase 1" />} />
                <Route path="people" element={<PlaceholderPage title="People" phase="Phase 1" />} />
                <Route path="faults" element={<PlaceholderPage title="Faults" phase="Phase 2" />} />
                <Route
                  path="settings"
                  element={<PlaceholderPage title="Settings" phase="Phase 1" />}
                />
                <Route
                  path="*"
                  element={<PlaceholderPage title="Page not found" phase="a later phase" />}
                />
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
