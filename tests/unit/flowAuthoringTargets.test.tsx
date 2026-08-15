import { afterEach, describe, expect, it, vi } from 'vitest'
import { CourseEventBus } from '@/player/CourseEventBus'
import {
  FlowSurfaceHost,
  type FlowBlockHit,
} from '@/player/surfaces/flow/FlowSurfaceHost'
import type {
  FlowSurfaceDocument,
  RuntimeLayerItem,
} from '@/shared/courseProjectTypes'
import type { RuntimeHostActions } from '@/shared/runtimeTypes'
import type {
  SlideItemHost,
  SlideItemMountContext,
} from '@/player/surfaces/slide/SlideSurfaceHost'

const services = {
  navigate: vi.fn(),
  getCourseState: vi.fn(),
  setCourseState: vi.fn(),
  resolveAsset: vi.fn(),
  reportDiagnostic: vi.fn(),
}

function flowDocument(): FlowSurfaceDocument {
  return {
    id: 'flow-main',
    type: 'flow',
    title: '互动讲义',
    layout: { readingWidth: 760, wideContentWidth: 1120 },
    blocks: [
      { id: 'block-p', type: 'paragraph', text: '段落' },
      {
        id: 'block-list',
        type: 'list',
        ordered: true,
        items: [
          { id: 'li-1', text: '甲' },
          { id: 'li-2', text: '乙' },
        ],
      },
      {
        id: 'block-table',
        type: 'table',
        caption: '表格',
        columns: [
          { id: 'col-a', header: '列A' },
          { id: 'col-b', header: '列B' },
        ],
        rows: [
          { id: 'row-1', cells: { 'col-a': 'A1', 'col-b': 'B1' } },
          { id: 'row-2', cells: { 'col-a': 'A2', 'col-b': 'B2' } },
        ],
      },
    ],
    surfaceLayerItems: [],
  }
}

function runtimeItem(): RuntimeLayerItem {
  return {
    layerItemId: 'flow-runtime',
    label: 'Flow Runtime',
    kind: 'runtime',
    frame: { mode: 'absolute', x: 40, y: 40, width: 240, height: 120 },
    order: 10,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    runtime: {
      protocol: 'surface-v1',
      runtimeApiVersion: 3,
      enabled: true,
      renderMode: 'dom',
      source: '',
      content: { values: {} },
      assets: {},
    },
  }
}

function interactionSession(): {
  events: CourseEventBus
  hostActions: RuntimeHostActions
} {
  return {
    events: new CourseEventBus(),
    hostActions: {
      goToScene: vi.fn(() => true),
      nextScene: vi.fn(() => true),
      previousScene: vi.fn(() => true),
      replayScene: vi.fn(() => true),
      restartCourse: vi.fn(() => true),
    },
  }
}

async function mountFlowHost(
  flow: FlowSurfaceDocument,
  options: ConstructorParameters<typeof FlowSurfaceHost>[1] = {},
): Promise<{ host: FlowSurfaceHost; container: HTMLElement }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const host = new FlowSurfaceHost(flow, options)
  await host.mount({
    surfaceId: flow.id,
    container,
    services,
    signal: new AbortController().signal,
  })
  return { host, container }
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('Flow authoring targets', () => {
  it('reports semantic block hits with blockId and granular list/table fields', async () => {
    const onBlockHit = vi.fn<(hit: FlowBlockHit) => void>()
    const { host, container } = await mountFlowHost(flowDocument(), { onBlockHit })
    await host.activate()

    const paragraph = container.querySelector<HTMLElement>('[data-flow-block-id="block-p"]')!
    paragraph.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onBlockHit).toHaveBeenLastCalledWith({
      surfaceId: 'flow-main',
      blockId: 'block-p',
    })

    const listItems = container.querySelectorAll<HTMLElement>(
      '[data-flow-block-id="block-list"] [data-flow-list-item-id]',
    )
    listItems[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onBlockHit).toHaveBeenLastCalledWith({
      surfaceId: 'flow-main',
      blockId: 'block-list',
      field: 'items.1',
    })

    const headerCells = container.querySelectorAll<HTMLElement>(
      '[data-flow-block-id="block-table"] thead th',
    )
    headerCells[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onBlockHit).toHaveBeenLastCalledWith({
      surfaceId: 'flow-main',
      blockId: 'block-table',
      field: 'columns.0',
    })

    const bodyRows = container.querySelectorAll<HTMLElement>(
      '[data-flow-block-id="block-table"] tbody tr',
    )
    const secondRowCells = bodyRows[1]!.querySelectorAll<HTMLElement>('td')
    secondRowCells[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onBlockHit).toHaveBeenLastCalledWith({
      surfaceId: 'flow-main',
      blockId: 'block-table',
      field: 'rows.1.col-b',
    })

    await host.destroy()
  })

  it('returns stable surface/block authoring addresses and keeps layer hits on layerItemId', async () => {
    class ProbeHost implements SlideItemHost<RuntimeLayerItem> {
      mount(context: SlideItemMountContext<RuntimeLayerItem>): void {
        const button = context.container.ownerDocument.createElement('button')
        button.textContent = '运行时命中'
        button.addEventListener('pointerdown', () => {
          context.reportHit({ field: 'runtime/content/values/title', hitId: 'runtime-hit' })
        })
        context.container.appendChild(button)
      }
    }

    const flow = flowDocument()
    flow.surfaceLayerItems = [{ item: runtimeItem(), visibility: { mode: 'all', locationIds: [] } }]
    const onLayerHit = vi.fn()
    const onBlockHit = vi.fn<(hit: FlowBlockHit) => void>()
    const { host, container } = await mountFlowHost(flow, {
      runtimeHostFactory: () => new ProbeHost(),
      onLayerHit,
      onBlockHit,
    })
    await host.activate()

    expect(host.flowAuthoringAddress('block-p')).toBe('surface:flow-main/block:block-p')

    const button = container.querySelector<HTMLButtonElement>(
      '.flow-scoped-layer-surface [data-layer-item-id="flow-runtime"] button',
    )!
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(onLayerHit).toHaveBeenCalledWith(expect.objectContaining({
      surfaceId: 'flow-main',
      layerItemId: 'flow-runtime',
      source: 'surface',
      field: 'runtime/content/values/title',
      hitId: 'runtime-hit',
    }))
    // A scoped layer hit has no data-flow-block-id and must not double as a
    // semantic block target.
    expect(onBlockHit).not.toHaveBeenCalled()

    await host.destroy()
  })

  it('keeps the interaction session inert while inspecting and active only in playback', async () => {
    const session = interactionSession()
    const { host } = await mountFlowHost(flowDocument(), {
      interactions: session,
      inspectionMode: 'inspect',
    })

    // The inner SlideSurfaceHost mounts in playback and is then pushed into
    // inspect, so its scene-rule engine must already be torn down.
    expect(session.events.listenerCount('scene:enter')).toBe(0)

    await host.capture({ purpose: 'export' })
    expect(session.events.listenerCount('scene:enter')).toBe(0)

    await host.setInspectionMode('playback')
    expect(session.events.listenerCount('scene:enter')).toBeGreaterThan(0)

    await host.setInspectionMode('inspect')
    expect(session.events.listenerCount('scene:enter')).toBe(0)

    await host.destroy()
  })

  it('creates the playback session through the scoped layer host and destroys it without leaking', async () => {
    const session = interactionSession()
    const sceneExits: Array<{ sceneId: string }> = []
    const disposeSceneExit = session.events.on<{ sceneId: string }>('scene:exit', (detail) => {
      sceneExits.push({ sceneId: detail.sceneId })
    })
    const { host } = await mountFlowHost(flowDocument(), {
      interactions: session,
    })
    await host.activate()

    expect(session.events.listenerCount('scene:enter')).toBeGreaterThan(0)
    expect(session.events.listenerCount('audio:change')).toBe(1)

    await host.destroy()
    expect(session.events.listenerCount('scene:enter')).toBe(0)
    expect(session.events.listenerCount('audio:change')).toBe(0)
    expect(sceneExits).toEqual([{ sceneId: 'flow-overlay-flow-main' }])

    disposeSceneExit()
    expect(session.events.listenerCount()).toBe(0)
  })

  it('keeps updateDocument capture-race-free after the async wave-1 change', async () => {
    const flow = flowDocument()
    const { host, container } = await mountFlowHost(flow, { locationId: 'block-p' })
    await host.activate()

    const updated = flowDocument()
    updated.surfaceLayerItems = [{
      item: runtimeItem(),
      visibility: { mode: 'all', locationIds: [] },
    }]
    const updating = host.updateDocument(updated)
    expect(updating).toBeInstanceOf(Promise)

    // Capture is enqueued after updateDocument and must observe the new
    // overlay, never the stale pre-update composition.
    const captured = await host.capture({ purpose: 'export' })
    await updating
    expect(captured.content).toContain('data-layer-item-id="flow-runtime"')
    expect(captured.content).toContain('data-flow-layer-composition="ordered"')

    await host.destroy()
    expect(container.querySelector('.flow-scoped-layer-surface')).toBeNull()
  })
})
