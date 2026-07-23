import { describe, expect, it } from 'vitest'
import { isGlobalComponentVisible } from '../../src/player/globalComponentVisibility'

describe('global component visibility', () => {
  it('supports all, include, and exclude scene scopes by stable scene id', () => {
    expect(isGlobalComponentVisible({
      visibility: { mode: 'all', sceneIds: [] },
    }, 'scene-a')).toBe(true)

    expect(isGlobalComponentVisible({
      visibility: { mode: 'include', sceneIds: ['scene-a'] },
    }, 'scene-a')).toBe(true)
    expect(isGlobalComponentVisible({
      visibility: { mode: 'include', sceneIds: ['scene-a'] },
    }, 'scene-b')).toBe(false)

    expect(isGlobalComponentVisible({
      visibility: { mode: 'exclude', sceneIds: ['scene-a'] },
    }, 'scene-a')).toBe(false)
    expect(isGlobalComponentVisible({
      visibility: { mode: 'exclude', sceneIds: ['scene-a'] },
    }, 'scene-b')).toBe(true)
  })
})
