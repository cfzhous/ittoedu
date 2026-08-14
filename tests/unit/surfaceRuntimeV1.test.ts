import { describe, expect, it, vi } from 'vitest'
import { CourseEventBus } from '@/player/CourseEventBus'
import { DeclarativeCourseState } from '@/player/DeclarativeCourseState'
import { PublishedDynamicHostRegistry } from '@/player/surfaces/publishedDynamicHosts'
import { SurfaceRuntimeRegistry } from '@/player/SurfaceRuntimeRegistry'
import { courseRuntimeDefinitionSchema } from '@/shared/courseProjectSchema'
import type { RuntimeLayerItem } from '@/shared/courseProjectTypes'
import { publishedLayerItemSchema } from '@/shared/publishedCourseSchema'
import type { PublishedCourseV2Payload } from '@/shared/publishedCourseTypes'

const SURFACE_RUNTIME_SOURCE = `
CoursewareSurfaceRuntime.define({
  runtimeApiVersion: 3,
  create(ctx) {
    const root = ctx.dom.root;
    root.dataset.createCount = String(Number(root.dataset.createCount || 0) + 1);
    root.dataset.initialMode = ctx.mode;
    const text = root.ownerDocument.createElement('p');
    text.dataset.coursewareContentKey = 'title/a~b';
    text.textContent = ctx.content.get('title/a~b');
    root.appendChild(text);
    const image = root.ownerDocument.createElement('img');
    image.dataset.coursewareAssetKey = 'hero/x~y';
    image.src = ctx.assets.url('hero/x~y');
    root.appendChild(image);
    ctx.authoring.registerAsset({key: 'hero/x~y', label: '主图', bounds: {x: 8, y: 9, width: 40, height: 30}});
    root.replaceChildren(text, image);
    return {
      setMode(mode) { root.dataset.mode = mode; },
      suspend() { root.dataset.suspendCount = String(Number(root.dataset.suspendCount || 0) + 1); },
      resume() { root.dataset.resumeCount = String(Number(root.dataset.resumeCount || 0) + 1); },
      destroy() { root.dataset.destroyed = 'true'; }
    };
  }
});`

function runtimeItem(): RuntimeLayerItem {
  return {
    layerItemId: 'runtime-surface-v1',
    label: 'Runtime V1',
    frame: { mode: 'absolute', x: 0, y: 0, width: 640, height: 360 },
    order: 0,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    kind: 'runtime',
    runtime: {
      protocol: 'surface-v1',
      runtimeApiVersion: 3,
      enabled: true,
      renderMode: 'dom',
      source: SURFACE_RUNTIME_SOURCE,
      content: { values: { 'title/a~b': '可命中文字' } },
      assets: { 'hero/x~y': { assetId: 'asset-hero' } },
    },
  }
}

function payload(): PublishedCourseV2Payload {
  return {
    format: 'h5course-published',
    formatVersion: 2,
    sourceSchemaVersion: 9,
    courseId: 'runtime-course',
    title: 'Runtime Course',
    assets: { 'asset-hero': { mimeType: 'image/png', url: 'data:image/png;base64,AA==' } },
    components: {},
    designTokens: {} as PublishedCourseV2Payload['designTokens'],
    media: {} as PublishedCourseV2Payload['media'],
    playback: {} as PublishedCourseV2Payload['playback'],
    courseState: [],
    navigationGuards: [],
    locations: [{
      id: 'location-runtime', label: 'Runtime', kind: 'slide-scene',
      surfaceId: 'surface-runtime', sceneId: 'scene-runtime',
    }],
    startLocationId: 'location-runtime',
    globalLayerItems: [],
    globalInteractions: [],
    surfaces: [],
  }
}

function dynamicRegistry() {
  const state = new DeclarativeCourseState({
    projectId: 'runtime-course',
    projectRevision: 0,
    declarations: [],
    navigationGuards: [],
    locationIds: ['location-runtime'],
    startLocationId: 'location-runtime',
  })
  return new PublishedDynamicHostRegistry({
    payload: payload(),
    courseState: state,
    events: new CourseEventBus(),
    navigation: {
      goToScene: vi.fn(), next: vi.fn(), previous: vi.fn(), replay: vi.fn(), restart: vi.fn(),
      setPresentationState: vi.fn(),
      presentationState: () => ({ current: null, states: [] }),
    },
  })
}

describe('Surface Runtime V1 DOM contract', () => {
  it('requires one synchronous API 3 definition and rejects module syntax', () => {
    const registry = new SurfaceRuntimeRegistry()
    expect(registry.executeRuntime(SURFACE_RUNTIME_SOURCE).runtimeApiVersion).toBe(3)
    expect(() => registry.executeRuntime('void 0')).toThrow(/define was not called synchronously/)
    expect(() => registry.executeRuntime(
      'CoursewareSurfaceRuntime.define({runtimeApiVersion:2,create(){return{destroy(){}}}})',
    )).toThrow(/must use runtimeApiVersion 3/)
    expect(() => registry.executeRuntime('export default {}')).toThrow(/不能使用 export/)
    registry.dispose()
  })

  it('keeps one live instance while inspection hits resolve to stable product fields', async () => {
    const registry = dynamicRegistry()
    const item = runtimeItem()
    const host = registry.runtimeHost(item)
    const container = document.createElement('div')
    const reportHit = vi.fn()
    await host.mount({
      surfaceId: 'surface-runtime',
      sceneId: 'scene-runtime',
      item,
      container,
      services: {
        navigate: vi.fn(), getCourseState: vi.fn(), setCourseState: vi.fn(),
        resolveAsset: vi.fn(), reportDiagnostic: vi.fn(),
      },
      signal: new AbortController().signal,
      mode: 'playback',
      reportHit,
    })
    await host.activate?.()

    const text = container.querySelector<HTMLElement>('[data-courseware-content-key="title/a~b"]')!
    const image = container.querySelector<HTMLElement>('[data-courseware-asset-key="hero/x~y"]')!
    const bounds = container.querySelector<HTMLElement>('[data-surface-runtime-target-key="hero/x~y"]')!
    expect(text).toHaveTextContent('可命中文字')
    expect(image).toHaveAttribute('src', 'data:image/png;base64,AA==')
    expect(container.dataset.createCount).toBe('1')
    expect(container.querySelector('.published-runtime-underlay')).toBeNull()
    expect(bounds.style.cssText).toContain('left: 8px')

    text.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(reportHit).not.toHaveBeenCalled()
    await host.setInspectionMode?.('inspect')
    expect(container.dataset.createCount).toBe('1')
    expect(container.dataset.mode).toBe('inspect')
    expect(container.dataset.suspendCount).toBe('1')

    text.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    image.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    bounds.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(reportHit).toHaveBeenCalledWith(expect.objectContaining({
      field: 'runtime/content/values/title~1a~0b',
      hitId: expect.stringMatching(/^surface-runtime:text:/),
    }))
    expect(reportHit).toHaveBeenCalledWith(expect.objectContaining({
      field: 'runtime/assets/hero~1x~0y/assetId',
      hitId: expect.stringMatching(/^surface-runtime:asset:/),
      targetKind: 'asset',
    }))

    await host.setInspectionMode?.('playback')
    expect(container.dataset.createCount).toBe('1')
    expect(container.dataset.mode).toBe('playback')
    expect(container.dataset.resumeCount).toBe('2')
    await host.destroy?.()
    expect(container.dataset.destroyed).toBe('true')
    expect(container.querySelector('.surface-runtime-authoring-targets')).toBeNull()
    registry.dispose()
  })

  it('limits the published Surface V1 promise to its implemented DOM renderer', () => {
    const invalid = structuredClone(runtimeItem()) as unknown as {
      runtime: Omit<RuntimeLayerItem['runtime'], 'renderMode'> & { renderMode: string }
    }
    invalid.runtime.renderMode = 'phaser'
    expect(courseRuntimeDefinitionSchema.safeParse(invalid.runtime).success).toBe(false)
    const { source: _source, ...publishedRuntime } = invalid.runtime
    expect(publishedLayerItemSchema.safeParse({
      ...invalid,
      runtime: {
        ...publishedRuntime,
        code: { encoding: 'base64-utf16le', data: 'QQA=' },
      },
    }).success).toBe(false)
  })
})
