import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { CourseProjectDocument, NativeLayerItem, ScopedLayerItem } from '@/shared/courseProjectTypes'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import { addCourseFlowPage, addCourseScene, addCourseSpatialPage } from '@/renderer/course/courseLocationCommands'
import { createBlankCourseProject } from '@/renderer/project/createCourseProject'
import { buildPublishedCourseV2Payload } from '@/renderer/export/course/buildPublishedCourse'
import {
  createPublishedCourseSession,
  type PublishedCourseSession,
} from '@/player/surfaces/publishedDynamicHosts'

const NOW = '2026-08-17T21:00:00.000Z'

function textStyle() {
  return {
    fontFamily: 'sans-serif',
    fontSize: 18,
    color: '#172033',
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    emphasis: false,
    highlightColor: null,
    align: 'left' as const,
    verticalAlign: 'top' as const,
    writingMode: 'horizontal' as const,
    lineSpacing: 1.2,
    letterSpacing: 0,
    padding: 0,
    overflow: 'fixed' as const,
    backgroundColor: '#ffffff',
    backgroundOpacity: 0,
    cornerRadius: 0,
  }
}

function requireOk<T extends { ok: boolean; reason?: string }>(result: T): T & { ok: true } {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.reason ?? 'command failed')
  return result as T & { ok: true }
}

function globalNote(locationId: string): ScopedLayerItem {
  const item: NativeLayerItem = {
    layerItemId: 'global-note',
    label: '仅首页',
    frame: { mode: 'absolute', x: 16, y: 16, width: 180, height: 32 },
    order: 50_000,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    kind: 'native',
    content: {
      nativeType: 'text',
      data: { text: '仅首页可见', runs: [], style: textStyle() },
    },
  }
  return {
    item,
    visibility: { mode: 'include', locationIds: [locationId] },
  }
}

function mixedProject(): CourseProjectDocument {
  let project = createBlankCourseProject({ now: NOW })
  const slideSurface = project.surfaces.find((surface) => surface.type === 'slide')
  if (!slideSurface) throw new Error('expected slide surface')
  const homeLocationId = project.startLocationId

  const sceneAdded = requireOk(addCourseScene(project, {
    surfaceId: slideSurface.id,
    now: NOW,
    expectedRevision: project.revision,
  }))
  project = sceneAdded.project

  const flowAdded = requireOk(addCourseFlowPage(project, {
    now: NOW,
    expectedRevision: project.revision,
  }))
  project = flowAdded.project

  const spatialAdded = requireOk(addCourseSpatialPage(project, {
    now: NOW,
    expectedRevision: project.revision,
  }))
  project = spatialAdded.project

  return courseProjectDocumentSchema.parse({
    ...project,
    globalLayerItems: [...project.globalLayerItems, globalNote(homeLocationId)],
  })
}

describe('published course Mixed navigation', () => {
  const sessions: PublishedCourseSession[] = []

  beforeAll(() => {
    if (typeof HTMLElement.prototype.scrollIntoView !== 'function') {
      HTMLElement.prototype.scrollIntoView = function scrollIntoView() {}
    }
  })

  afterEach(async () => {
    await Promise.all(sessions.splice(0).map((session) => session.destroy()))
  })

  it('walks Mixed location order, catalog, progress, and next/previous', async () => {
    const project = mixedProject()
    const before = structuredClone(project)
    const payload = buildPublishedCourseV2Payload({
      project,
      assetFiles: {},
      components: {},
    })
    const session = createPublishedCourseSession(payload)
    sessions.push(session)
    const container = document.createElement('div')
    document.body.appendChild(container)
    await session.mount(container)

    const catalog = session.listCatalog()
    expect(catalog.map((entry) => entry.id)).toEqual(payload.locations.map((location) => location.id))
    expect(catalog.map((entry) => entry.kind)).toEqual(['slide', 'slide', 'flow', 'spatial-2d'])
    expect(session.navigator.current).toMatchObject({
      locationId: payload.startLocationId,
      index: 0,
      total: 4,
    })
    expect(session.getProgress()).toMatchObject({
      index: 0,
      total: 4,
      ratio: 0.25,
      atStart: true,
      atEnd: false,
    })

    const second = await session.next()
    expect(second).toMatchObject({ index: 1, kind: 'slide', total: 4 })
    expect(session.getProgress()).toMatchObject({ index: 1, ratio: 0.5, atStart: false, atEnd: false })

    const flow = await session.next()
    expect(flow).toMatchObject({ index: 2, kind: 'flow' })
    expect(session.player.activeSurfaceId).toBe(flow?.surfaceId)

    const spatial = await session.next()
    expect(spatial).toMatchObject({ index: 3, kind: 'spatial-2d' })
    expect(session.getProgress()).toMatchObject({ atEnd: true, ratio: 1 })
    expect(await session.next()).toBeNull()

    expect(await session.previous()).toMatchObject({ index: 2, kind: 'flow' })
    expect(await session.goToIndex(0)).toMatchObject({
      locationId: payload.startLocationId,
      index: 0,
    })

    expect(project).toEqual(before)
    expect(payload.locations).toEqual(before.locations)
    container.remove()
  })

  it('shows global overlay only on the included active location', async () => {
    const project = mixedProject()
    const payload = buildPublishedCourseV2Payload({
      project,
      assetFiles: {},
      components: {},
    })
    const homeId = payload.startLocationId
    const session = createPublishedCourseSession(payload)
    sessions.push(session)
    const container = document.createElement('div')
    document.body.appendChild(container)
    await session.mount(container)

    const slideRoot = container.querySelector<HTMLElement>('.slide-published-adapter')
    expect(slideRoot?.hidden).toBe(false)
    expect(slideRoot?.querySelector('[data-global-layer-item="global-note"]')).not.toBeNull()

    await session.next()
    expect(slideRoot?.dataset.locationId).not.toBe(homeId)
    expect(slideRoot?.querySelector('[data-global-layer-item="global-note"]')).toBeNull()

    await session.next()
    const flowRoot = container.querySelector<HTMLElement>('.flow-surface-host')
    expect(flowRoot?.hidden).toBe(false)
    expect(slideRoot?.hidden).toBe(true)
    expect(flowRoot?.querySelector('[data-flow-overlay-item="global-note"]')).toBeNull()

    await session.next()
    const spatialRoot = container.querySelector<HTMLElement>('.spatial-surface')
    expect(spatialRoot?.hidden).toBe(false)
    expect(spatialRoot?.querySelector('[data-layer-item-id="global-note"]')).toBeNull()

    await session.goToLocation(homeId)
    expect(slideRoot?.hidden).toBe(false)
    expect(slideRoot?.querySelector('[data-global-layer-item="global-note"]')).not.toBeNull()
    container.remove()
  })

  it('mounts the global teacher controller on Slide Published Adapter', async () => {
    const project = mixedProject()
    const payload = buildPublishedCourseV2Payload({
      project,
      assetFiles: {},
      components: {},
    })
    const controllerId = payload.globalLayerItems.find((entry) => (
      entry.item.kind === 'native' && entry.item.content.nativeType === 'teacher-controller'
    ))?.item.layerItemId
    expect(controllerId).toBeTruthy()
    const session = createPublishedCourseSession(payload)
    sessions.push(session)
    const container = document.createElement('div')
    document.body.appendChild(container)
    await session.mount(container)

    const slideRoot = container.querySelector<HTMLElement>('.slide-published-adapter')
    expect(slideRoot?.querySelector('.slide-native-teacher-controller')).not.toBeNull()
    expect(slideRoot?.querySelector(`[data-native-type="teacher-controller"]`)).not.toBeNull()
    expect(slideRoot?.querySelector(`[data-global-layer-item="${controllerId}"]`)).not.toBeNull()
    container.remove()
  })

  it('shows include-scoped global component fallback only on the selected location', async () => {
    const project = mixedProject()
    const payload = buildPublishedCourseV2Payload({
      project,
      assetFiles: {},
      components: {},
    })
    const homeId = payload.startLocationId
    const included = payload.locations.find((location) => (
      location.kind === 'slide-scene' && location.id !== homeId
    ))
    expect(included).toBeTruthy()
    payload.globalLayerItems.push({
      item: {
        layerItemId: 'global-nav',
        frame: { mode: 'absolute', x: 40, y: 40, width: 400, height: 80 },
        order: 60_000,
        visible: true,
        rotation: 0,
        opacity: 1,
        hitPolicy: 'auto',
        playbackInitialVisibility: 'inherit',
        kind: 'component',
        component: { packageId: 'com.example.global-nav', version: '4.0.0' },
        props: { content: { title: '教师全局导航', buttons: { next: '继续学习' } } },
      },
      visibility: { mode: 'include', locationIds: [included!.id] },
    })
    const session = createPublishedCourseSession(payload)
    sessions.push(session)
    const container = document.createElement('div')
    document.body.appendChild(container)
    await session.mount(container)

    const slideRoot = container.querySelector<HTMLElement>('.slide-published-adapter')
    expect(slideRoot?.hidden).toBe(false)
    expect(slideRoot?.querySelector('[data-global-layer-item="global-nav"]')).toBeNull()

    await session.goToLocation(included!.id)
    const fallback = slideRoot?.querySelector<HTMLElement>('[data-global-layer-item="global-nav"]')
    expect(fallback).not.toBeNull()
    expect(fallback?.dataset.slideFallbackKind).toBe('component')
    expect(fallback?.textContent).toBe('教师全局导航')
    expect(fallback?.style.background).toMatch(/#0f766e|rgb\(15,\s*118,\s*110\)/)
    expect(fallback?.style.color).toMatch(/#fff(?:fff)?|rgb\(255,\s*255,\s*255\)/)
    expect(slideRoot?.querySelector('[data-global-layer-item="global-note"]')).toBeNull()

    await session.goToLocation(homeId)
    expect(slideRoot?.querySelector('[data-global-layer-item="global-nav"]')).toBeNull()
    container.remove()
  })
})
