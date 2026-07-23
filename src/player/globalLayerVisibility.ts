import type { GlobalLayerItem } from '../shared/projectTypes'

export function isGlobalLayerItemVisible(
  item: Pick<GlobalLayerItem, 'visibility'>,
  sceneId: string,
): boolean {
  const { mode, sceneIds } = item.visibility
  if (mode === 'all') return true
  const listed = sceneIds.includes(sceneId)
  return mode === 'include' ? listed : !listed
}
