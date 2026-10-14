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
import { FaultPage } from '@/features/faults/FaultPage'
import { FaultsListPage } from '@/features/faults/FaultsListPage'
import { IssuePage } from '@/features/issue/IssuePage'
import { ReturnPage } from '@/features/issue/ReturnPage'
import { TransferPage } from '@/features/issue/TransferPage'
import { ExportPage } from '@/features/import-export/ExportPage'
import { ImportPage } from '@/features/import-export/ImportPage'
import { NewServiceJobPage } from '@/features/service/NewServiceJobPage'
import { ServiceJobPage } from '@/features/service/ServiceJobPage'
import { ServiceListPage } from '@/features/service/ServiceListPage'
import { PeopleListPage } from '@/features/people/PeopleListPage'
import { PersonFormPage } from '@/features/people/PersonFormPage'
import { PersonPage } from '@/features/people/PersonPage'
import { HandoverFormPrint } from '@/features/print/HandoverFormPrint'
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
              {/* Print pages: A4, no app chrome. Viewers may print too. */}
              <Route path="print/handover/:formNo" element={<HandoverFormPrint />} />
              <Route element={<AppLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="assets" element={<AssetsListPage />} />
                <Route path="assets/:tag" element={<AssetPage />} />
                {/* Viewers can open Settings and see the lists; the edit controls are admin-only. */}
                <Route path="settings" element={<SettingsPage />} />
                <Route path="people" element={<PeopleListPage />} />
                <Route path="people/:id" element={<PersonPage />} />
                <Route path="export" element={<ExportPage />} />
                <Route element={<RequireAdmin />}>
                  <Route path="assets/new" element={<AddAssetPage />} />
                  <Route path="assets/:tag/edit" element={<EditAssetPage />} />
                  <Route path="people/new" element={<PersonFormPage />} />
                  <Route path="people/:id/edit" element={<PersonFormPage />} />
                  <Route path="import" element={<ImportPage />} />
                  <Route path="issue" element={<IssuePage />} />
                  <Route path="return" element={<ReturnPage />} />
                  <Route path="transfer" element={<TransferPage />} />
                  <Route path="service/new" element={<NewServiceJobPage />} />
                </Route>
                <Route path="faults" element={<FaultsListPage />} />
                <Route path="faults/:no" element={<FaultPage />} />
                <Route path="service" element={<ServiceListPage />} />
                <Route path="service/:no" element={<ServiceJobPage />} />
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
