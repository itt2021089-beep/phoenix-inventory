import type { AssetListRow } from './api'

/** Spares of the same kind, oldest tag first (the one bought earliest has sat longest). */
export function sparesFor(assets: AssetListRow[], faultyId: string, categoryId: number) {
  return assets
    .filter((a) => a.status === 'spare' && a.category_id === categoryId && a.id !== faultyId)
    .sort((a, b) => a.asset_tag.localeCompare(b.asset_tag))
}
