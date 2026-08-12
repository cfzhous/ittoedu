import { describe, expect, it } from 'vitest'
import { isGlobalLayerItemVisible } from '../../src/player/globalLayerVisibility'

describe('global layer visibility', () => {
  it('supports all, include, and exclude scene scopes by stable scene id', () => {
    expect(isGlobalLayerItemVisible({
      visibility: { mode: 'all', sceneIds: [] },
    }, 'scene-a')).toBe(true)

    expect(isGlobalLayerItemVisible({
      visibility: { mode: 'include', sceneIds: ['scene-a'] },
    }, 'scene-a')).toBe(true)
    expect(isGlobalLayerItemVisible({
      visibility: { mode: 'include', sceneIds: ['scene-a'] },
    }, 'scene-b')).toBe(false)

    expect(isGlobalLayerItemVisible({
      visibility: { mode: 'exclude', sceneIds: ['scene-a'] },
    }, 'scene-a')).toBe(false)
    expect(isGlobalLayerItemVisible({
      visibility: { mode: 'exclude', sceneIds: ['scene-a'] },
    }, 'scene-b')).toBe(true)
  })
})
