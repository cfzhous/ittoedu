import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PublishedCourseApp } from '@/player/PublishedCourseApp'
import { FlowSurfaceHost } from '@/player/surfaces/flow/FlowSurfaceHost'
import type {
  ComponentLayerItem,
  NativeLayerItem,
  RuntimeLayerItem,
  FlowSurfaceDocument,
} from '@/shared/courseProjectTypes'
import type {
  SlideItemHost,
  SlideItemMountContext,
} from '@/player/surfaces/slide/SlideSurfaceHost'
import { buildPublishedCourseV2Payload } from '@/renderer/export/course/buildPublishedCourse'
import { FlowCourseCanvas } from '@/renderer/course/CourseSurfaceCanvas'
import {
  addCourseSurface,
  addFlowBlock,
  createCourseProject,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'

afterEach(cleanup)

function teacherController(order = 20): NativeLayerItem {
  return {
    layerItemId: 'flow-controller',
    label: '教师控制器',
    kind: 'native',
    frame: { mode: 'absolute', x: 24, y: 640, width: 520, height: 64 },
    order,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    content: {
      nativeType: 'teacher-controller',
      data: {
        title: '教师控制',
        showSceneProgress: true,
        compact: false,
        collapsible: false,
        defaultCollapsed: false,
        buttons: [{ id: 'next', label: '下一页', visible: true, action: { type: 'scene.next' } }],
        style: {
          backgroundColor: '#ffffff', backgroundOpacity: 1,
          accentColor: '#2563eb', textColor: '#172033', cornerRadius: 8,
        },
        includeInStaticExports: false,
      },
    },
  }
}

function runtimeItem(): RuntimeLayerItem {
  return {
    layerItemId: 'flow-runtime', label: 'Flow Runtime', kind: 'runtime',
    frame: { mode: 'absolute', x: 40, y: 40, width: 240, height: 120 },
    order: 10, visible: true, locked: false, rotation: 0, opacity: 1,
    hitPolicy: 'auto', playbackInitialVisibility: 'inherit',
    runtime: {
      protocol: 'surface-v1', runtimeApiVersion: 3, enabled: true, renderMode: 'dom',
      source: '', content: { values: {} }, assets: {},
    },
  }
}

function componentItem(order = 5): ComponentLayerItem {
  return {
    layerItemId: 'flow-component', label: 'Flow Component', kind: 'component',
    frame: { mode: 'absolute', x: 320, y: 40, width: 240, height: 120 },
    order, visible: true, locked: false, rotation: 0, opacity: 1,
    hitPolicy: 'auto', playbackInitialVisibility: 'inherit',
    component: { packageId: 'component.flow', version: '1.0.0' },
    props: {}, staticFallbackAssetId: 'component-fallback',
  }
}

function flowDocument(): FlowSurfaceDocument {
  return {
    id: 'flow-main', type: 'flow', title: '讲义',
    layout: { readingWidth: 760, wideContentWidth: 1120 },
    blocks: [{ id: 'flow-a', type: 'heading', level: 1, text: '第一节' }],
    surfaceLayerItems: [{ item: runtimeItem(), visibility: { mode: 'all', locationIds: [] } }],
  }
}

const services = {
  navigate: vi.fn(),
  getCourseState: vi.fn(),
  setCourseState: vi.fn(),
  resolveAsset: vi.fn(),
  reportDiagnostic: vi.fn(),
}

describe('Flow unified authored layers', () => {
  it('captures Native, Runtime and Component in the exact live back-to-front order', async () => {
    const flow = flowDocument()
    flow.surfaceLayerItems.unshift({
      item: componentItem(),
      visibility: { mode: 'all', locationIds: [] },
    })
    const staticController = teacherController(20)
    if (staticController.content.nativeType === 'teacher-controller') {
      staticController.content.data.includeInStaticExports = true
    }
    const dynamicHost = (item: ComponentLayerItem | RuntimeLayerItem): SlideItemHost => ({
      mount(context) {
        const marker = context.container.ownerDocument.createElement('span')
        marker.textContent = `live:${item.layerItemId}`
        context.container.appendChild(marker)
      },
      capture: () => ({
        format: 'html',
        content: `<strong data-captured-dynamic="${item.layerItemId}">${item.label}</strong>`,
        warnings: [`captured:${item.layerItemId}`],
      }),
    })
    const host = new FlowSurfaceHost(flow, {
      locationId: 'flow-a',
      globalLayerItems: [{
        item: staticController,
        visibility: { mode: 'all', locationIds: [] },
      }],
      componentHostFactory: (item) => dynamicHost(item),
      runtimeHostFactory: (item) => dynamicHost(item),
    })
    const container = document.createElement('div')
    await host.mount({ surfaceId: flow.id, container, services, signal: new AbortController().signal })
    await host.activate()

    const captured = await host.capture({ purpose: 'export' })
    const componentIndex = captured.content.indexOf('data-layer-item-id="flow-component"')
    const runtimeIndex = captured.content.indexOf('data-layer-item-id="flow-runtime"')
    const nativeIndex = captured.content.indexOf('data-layer-item-id="flow-controller"')
    expect(componentIndex).toBeGreaterThan(-1)
    expect(componentIndex).toBeLessThan(runtimeIndex)
    expect(runtimeIndex).toBeLessThan(nativeIndex)
    expect(captured.content).toContain('data-flow-layer-composition="ordered"')
    expect(captured.content).toContain('data-captured-dynamic="flow-component"')
    expect(captured.content).toContain('data-captured-dynamic="flow-runtime"')
    expect(captured.warnings).toEqual(['captured:flow-component', 'captured:flow-runtime'])
    await host.destroy()
  })

  it('shows and selects scoped layers in the real Flow editor canvas', async () => {
    class ProbeHost implements SlideItemHost<RuntimeLayerItem> {
      mount(context: SlideItemMountContext<RuntimeLayerItem>): void {
        const button = context.container.ownerDocument.createElement('button')
        button.textContent = '精确点选'
        button.addEventListener('pointerdown', () => context.reportHit({ field: 'runtime/content/values/title', hitId: 'flow-editor-hit' }))
        context.container.appendChild(button)
      }
    }
    const onLayerHit = vi.fn()
    const flow = flowDocument()
    const view = render(
      <FlowCourseCanvas
        surface={flow}
        mode="inspect"
        selectedBlockId={null}
        selectedLayerItemId="flow-runtime"
        search=""
        resolveAsset={() => undefined}
        runtimeHostFactory={() => new ProbeHost()}
        locationId="flow-a"
        onLayerHit={onLayerHit}
        onSelect={() => undefined}
        onEdit={() => undefined}
      />,
    )
    const button = await vi.waitFor(() => {
      const found = view.getByRole('button', { name: '精确点选' })
      expect(found).toBeInTheDocument()
      return found
    })
    fireEvent.pointerDown(button)
    expect(onLayerHit).toHaveBeenCalledWith(expect.objectContaining({
      surfaceId: 'flow-main', layerItemId: 'flow-runtime', source: 'surface',
      field: 'runtime/content/values/title', hitId: 'flow-editor-hit',
    }))
    expect(view.container.querySelector('[data-layer-item-id="flow-runtime"]')).toHaveAttribute('data-studio-selected', 'true')
  })

  it('composes surface/global items by sparse order, preserves hit identity and applies location visibility', async () => {
    class ProbeHost implements SlideItemHost<RuntimeLayerItem> {
      button: HTMLButtonElement | null = null
      mount(context: SlideItemMountContext<RuntimeLayerItem>): void {
        this.button = context.container.ownerDocument.createElement('button')
        this.button.textContent = '运行时'
        this.button.addEventListener('pointerdown', () => context.reportHit({ field: 'runtime/content/values/title', hitId: 'runtime-hit' }))
        context.container.appendChild(this.button)
      }
    }
    const probe = new ProbeHost()
    const actions = vi.fn()
    const hits = vi.fn()
    const flow = flowDocument()
    const host = new FlowSurfaceHost(flow, {
      runtimeHostFactory: () => probe,
      locationId: 'flow-a',
      globalLayerItems: [{
        item: teacherController(),
        visibility: { mode: 'include', locationIds: ['flow-a'] },
      }],
      onTeacherControllerAction: actions,
      onLayerHit: hits,
    })
    const container = document.createElement('div')
    await host.mount({ surfaceId: flow.id, container, services, signal: new AbortController().signal })
    await host.activate()

    const ids = [...container.querySelectorAll<HTMLElement>('.flow-scoped-layer-surface > .slide-layer-item')]
      .map((element) => element.dataset.layerItemId)
    expect(ids).toEqual(['flow-runtime', 'flow-controller'])
    probe.button!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(hits).toHaveBeenCalledWith(expect.objectContaining({
      layerItemId: 'flow-runtime', source: 'surface',
      field: 'runtime/content/values/title', hitId: 'runtime-hit',
    }))
    container.querySelector<HTMLButtonElement>('[data-controller-button-id="next"]')!.click()
    await vi.waitFor(() => expect(actions).toHaveBeenCalledWith(
      { type: 'scene.next' },
      expect.objectContaining({ layerItemId: 'flow-controller' }),
    ))

    await host.setLocationId('flow-b')
    expect(container.querySelector<HTMLElement>('[data-layer-item-id="flow-controller"]')).toHaveAttribute('hidden')
    expect(container.querySelector<HTMLElement>('[data-layer-item-id="flow-runtime"]')).not.toBeNull()
    await host.destroy()
  })

  it('routes the authored Flow controller through real published navigation and guards visibility by location', async () => {
    let project = addCourseSurface(createCourseProject({ id: 'published-flow-controller' }), 'flow', { id: 'flow-main' })
    const flow = project.surfaces.find((surface) => surface.id === 'flow-main')
    if (!flow || flow.type !== 'flow') throw new Error('Flow fixture missing')
    const headingId = flow.blocks[0]!.id
    project = addFlowBlock(project, flow.id, { id: 'flow-next', type: 'paragraph', text: '第二个位置' })
    project = updateCourseProject(project, (draft) => {
      draft.startLocationId = headingId
      const controller = draft.globalLayerItems.find((entry) => (
        entry.item.kind === 'native' && entry.item.content.nativeType === 'teacher-controller'
      ))
      if (!controller || controller.item.kind !== 'native' || controller.item.content.nativeType !== 'teacher-controller') {
        throw new Error('Default controller missing')
      }
      controller.visibility = { mode: 'include', locationIds: [headingId] }
      controller.item.content.data.buttons = [{
        id: 'next', label: '下一页', visible: true, action: { type: 'scene.next' },
      }]
      draft.courseState = [{ key: 'flowUnlocked', valueType: 'boolean', defaultValue: false }]
      draft.navigationGuards = [{
        id: 'guard-flow-next', effect: 'block', toLocationIds: ['flow-next'], match: 'all',
        conditions: [{ type: 'compare', key: 'flowUnlocked', operator: 'eq', value: true }],
        message: '请先完成当前内容',
      }]
    })
    const payload = buildPublishedCourseV2Payload({ project, assetFiles: {}, components: {} })
    const root = document.createElement('div')
    document.body.appendChild(root)
    const blocked = vi.fn()
    const app = await PublishedCourseApp.create(payload, root, { onNavigationBlocked: blocked })
    expect(app.currentLocationId).toBe(headingId)
    const next = root.querySelector<HTMLButtonElement>('.flow-scoped-layer-surface [data-controller-button-id="next"]')
    expect(next).not.toBeNull()
    next!.click()
    await vi.waitFor(() => expect(blocked).toHaveBeenCalledWith(['请先完成当前内容']))
    expect(app.currentLocationId).toBe(headingId)
    app.courseState.set('flowUnlocked', true)
    next!.click()
    await vi.waitFor(() => expect(app.currentLocationId).toBe('flow-next'))
    expect(root.querySelector<HTMLElement>('[data-layer-item-id][hidden]')).not.toBeNull()
    await app.destroy()
    root.remove()
  })
})
