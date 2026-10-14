import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router'

import { AppLayout } from '@/components/AppLayout'
import { AddAssetPage } from '@/features/assets/AddAssetPage'
import { AssetPage } from '@/features/assets/AssetPage'
import { AssetsListPage } from '@/features/assets/AssetsListPage'
import { EditAssetPage } from '@/features/assets/EditAssetPage'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { LoginPage } from '@/features/auth/LoginPage'
import { NoAccessPage } from '@/features/auth/NoAccessPage'
import { RequireAdmin } from '@/features/auth/RequireAdmin'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { PlaceholderPage } from '@/features/dashboard/PlaceholderPage'
import { SettingsPage } from '@/features/settings/SettingsPage'

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
                <Route path="assets" element={<AssetsListPage />} />
                <Route path="assets/:tag" element={<AssetPage />} />
                {/* Viewers can open Settings and see the lists; the edit controls are admin-only. */}
                <Route path="settings" element={<SettingsPage />} />
                <Route element={<RequireAdmin />}>
                  <Route path="assets/new" element={<AddAssetPage />} />
                  <Route path="assets/:tag/edit" element={<EditAssetPage />} />
                  {/* Built in the next PR (Phase 1, PR C). */}
                  <Route
                    path="issue"
                    element={<PlaceholderPage title="Issue" phase="the next update" />}
                  />
                  <Route
                    path="return"
                    element={<PlaceholderPage title="Return" phase="the next update" />}
                  />
                  <Route
                    path="transfer"
                    element={<PlaceholderPage title="Transfer" phase="the next update" />}
                  />
                </Route>
                <Route
                  path="people"
                  element={<PlaceholderPage title="People" phase="the next update" />}
                />
                <Route path="faults" element={<PlaceholderPage title="Faults" phase="Phase 2" />} />
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
