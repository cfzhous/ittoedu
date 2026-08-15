import { describe, expect, it, vi } from 'vitest'
import type { CourseProjectDocument } from '@/shared/courseProjectTypes'
import {
  createCourseProject,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import {
  createTrialRunOverlay,
  resolveTrialRunStart,
} from '@/renderer/preview/trialRunOverlay'

const NOW = '2026-08-15T00:00:00.000Z'

function fixtureProject(): {
  project: CourseProjectDocument
  locationId: string
} {
  const created = createCourseProject({ id: 'trial-run-project', title: '试运行', now: NOW })
  const locationId = created.locations[0]!.id
  const project = updateCourseProject(created, (draft) => {
    const surface = draft.surfaces[0]!
    if (surface.type !== 'slide') throw new Error('expected Slide surface')
    surface.scenes[0]!.presentation!.states.push({
      id: 'state_reveal',
      name: '揭示',
      layerItemOverrides: {},
    })
  }, NOW)
  return { project, locationId }
}

describe('resolveTrialRunStart', () => {
  it('starts at the selected location without a state on the base scene', () => {
    const { project, locationId } = fixtureProject()
    expect(resolveTrialRunStart(project, { locationId, stateId: null }))
      .toEqual({ locationId })
  })

  it('carries the selected presentation state when the scene owns it', () => {
    const { project, locationId } = fixtureProject()
    expect(resolveTrialRunStart(project, { locationId, stateId: 'state_reveal' }))
      .toEqual({ locationId, stateId: 'state_reveal' })
  })

  it('falls back to the start location for an unknown selection', () => {
    const { project, locationId } = fixtureProject()
    expect(resolveTrialRunStart(project, { locationId: 'location-missing', stateId: 'state_reveal' }))
      .toEqual({ locationId })
  })

  it('drops a state the scene presentation does not declare', () => {
    const { project, locationId } = fixtureProject()
    expect(resolveTrialRunStart(project, { locationId, stateId: 'state_foreign' }))
      .toEqual({ locationId })
  })

  it('never overrides a state pinned by the location itself', () => {
    const { project: base, locationId } = fixtureProject()
    const project = updateCourseProject(base, (draft) => {
      const location = draft.locations[0]!
      if (location.kind !== 'slide-scene') throw new Error('expected slide-scene location')
      location.stateId = 'state_initial'
    }, NOW)
    expect(resolveTrialRunStart(project, { locationId, stateId: 'state_reveal' }))
      .toEqual({ locationId })
  })
})

describe('createTrialRunOverlay', () => {
  function stubBlobUrls(): {
    calls: Array<{ type: string; text(): Promise<string> }>
    revokeObjectURL: ReturnType<typeof vi.fn>
    restore(): void
  } {
    const calls: Array<{ type: string; text(): Promise<string> }> = []
    const names = ['blob:payload', 'blob:player', 'blob:html']
    const originalCreate = URL.createObjectURL
    const originalRevoke = URL.revokeObjectURL
    URL.createObjectURL = ((blob: Blob) => {
      calls.push(blob as unknown as { type: string; text(): Promise<string> })
      return names[calls.length - 1] ?? `blob:extra-${calls.length}`
    }) as typeof URL.createObjectURL
    const revokeObjectURL = vi.fn()
    URL.revokeObjectURL = revokeObjectURL as typeof URL.revokeObjectURL
    return {
      calls,
      revokeObjectURL,
      restore() {
        URL.createObjectURL = originalCreate
        URL.revokeObjectURL = originalRevoke
      },
    }
  }

  it('builds a Blob document that loads payload and player as external blob scripts', async () => {
    const { project, locationId } = fixtureProject()
    const stub = stubBlobUrls()
    try {
      const resource = createTrialRunOverlay(
        { project, assetFiles: {}, components: {} },
        { locationId, stateId: 'state_reveal' },
        'player-bundle-stub',
      )
      // blob: documents inherit the editor CSP: no inline scripts allowed.
      expect(stub.calls.map((call) => call.type)).toEqual([
        'text/javascript',
        'text/javascript',
        'text/html',
      ])
      expect(await stub.calls[0]!.text())
        .toContain('window.__H5_COURSE_PAYLOAD__=')
      expect(await stub.calls[1]!.text()).toBe('player-bundle-stub')
      const html = await stub.calls[2]!.text()
      expect(html).toContain('<script src="blob:payload"></script>')
      expect(html).toContain('<script src="blob:player"></script>')
      expect(html).not.toContain('__H5_COURSE_PAYLOAD__=')
      expect(resource.url).toBe(`blob:html#location=${locationId}&state=state_reveal`)
      resource.revoke()
      expect(stub.revokeObjectURL.mock.calls.flat().sort())
        .toEqual(['blob:html', 'blob:payload', 'blob:player'])
    } finally {
      stub.restore()
    }
  })

  it('omits the state parameter when the start has none', () => {
    const { project, locationId } = fixtureProject()
    const stub = stubBlobUrls()
    try {
      const resource = createTrialRunOverlay(
        { project, assetFiles: {}, components: {} },
        { locationId },
        'player-bundle-stub',
      )
      expect(resource.url).toBe(`blob:html#location=${locationId}`)
    } finally {
      stub.restore()
    }
  })
})
