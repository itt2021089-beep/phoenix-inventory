import { useSearchParams } from 'react-router'

import { PageHeader } from '@/components/PageHeader'
import { QueryState } from '@/components/QueryState'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/features/auth/useAuth'
import {
  useAccessoryTypes,
  useCategories,
  useDepartments,
  useStockItems,
  useVendors,
} from '@/features/lookups/useLookups'
import { VENDOR_KIND_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'

import { CategoriesEditor } from './CategoriesEditor'
import { ThresholdsEditor } from './ThresholdsEditor'
import { ListEditor } from './ListEditor'

const TABS = [
  { key: 'categories', label: 'Categories' },
  { key: 'accessories', label: 'Accessories' },
  { key: 'departments', label: 'Departments' },
  { key: 'vendors', label: 'Suppliers & vendors' },
  { key: 'thresholds', label: 'Reminders & limits' },
] as const

const options = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }))

export function SettingsPage() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin'
  const [params, setParams] = useSearchParams()
  const tab = TABS.find((t) => t.key === params.get('tab'))?.key ?? 'categories'

  const categories = useCategories()
  const accessories = useAccessoryTypes()
  const stock = useStockItems()
  const departments = useDepartments()
  const vendors = useVendors()
  // The thresholds tab loads its own rows, so it has no query to show a spinner for here.
  const active = { categories, accessories, departments, vendors, thresholds: null }[tab]

  return (
    <div>
      <PageHeader
        title="Settings"
        description={
          canEdit ? 'The lists every screen picks from.' : 'View only. Only IT can change these.'
        }
      />
      <div role="tablist" className="mb-4 flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              tab === t.key
                ? 'border-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setParams({ tab: t.key }, { replace: true })}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent>
          {active && <QueryState isLoading={active.isLoading} error={active.error} />}
          {tab === 'thresholds' && <ThresholdsEditor canEdit={canEdit} />}
          {tab === 'categories' && categories.data && (
            <CategoriesEditor rows={categories.data} canEdit={canEdit} />
          )}
          {tab === 'accessories' && accessories.data && (
            <>
              <p className="mb-3 text-sm text-muted-foreground">
                Ticked when a laptop or desktop is issued. One linked to a stock item takes 1 from
                stock when ticked at issue and puts 1 back when returned (see the Stock page).
              </p>
              <ListEditor
                table="accessory_types"
                noun="accessory"
                canEdit={canEdit}
                rows={accessories.data}
                columns={[
                  { key: 'name', label: 'Accessory', required: true },
                  {
                    key: 'stock_item_id',
                    label: 'Stock item',
                    type: 'select',
                    options: (stock.data ?? []).map((s) => ({
                      value: String(s.id),
                      label: `${s.name} (${s.item_code})`,
                    })),
                    show: (r) => stock.data?.find((s) => s.id === r.stock_item_id)?.name ?? '',
                  },
                ]}
              />
            </>
          )}
          {tab === 'departments' && departments.data && (
            <ListEditor
              table="departments"
              noun="department"
              canEdit={canEdit}
              rows={departments.data}
              columns={[{ key: 'name', label: 'Department', required: true }]}
            />
          )}
          {tab === 'vendors' && vendors.data && (
            <ListEditor
              table="vendors"
              noun="vendor"
              canEdit={canEdit}
              rows={vendors.data}
              columns={[
                { key: 'name', label: 'Name', required: true },
                {
                  key: 'kind',
                  label: 'Kind',
                  type: 'select',
                  required: true,
                  options: options(VENDOR_KIND_LABELS),
                  show: (r) => VENDOR_KIND_LABELS[r.kind as keyof typeof VENDOR_KIND_LABELS] ?? '',
                },
                { key: 'contact_person', label: 'Contact', wide: true },
                { key: 'phone', label: 'Phone', type: 'tel', wide: true },
                { key: 'email', label: 'Email', type: 'email', wide: true },
                { key: 'notes', label: 'Notes', wide: true },
              ]}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
