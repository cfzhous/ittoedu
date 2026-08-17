import { afterEach, describe, expect, it, vi } from 'vitest'
import { FlowSurfaceHost } from '@/player/surfaces/flow/FlowSurfaceHost'
import {
  FLOW_RUNTIME_TOC_DRAWER_WIDTH_PX,
  flowRuntimeTocAnchorId,
} from '@/player/surfaces/flow/flowRuntimeToc'
import type { FlowSurfaceDocument, NativeLayerItem } from '@/shared/courseProjectTypes'

const services = {
  navigate: vi.fn(),
  getCourseState: vi.fn(),
  setCourseState: vi.fn(),
  resolveAsset: vi.fn(),
  reportDiagnostic: vi.fn(),
}

function flowDocument(): FlowSurfaceDocument {
  return {
    id: 'flow-host',
    type: 'flow',
    title: '运行讲义',
    layout: { readingWidth: 760, wideContentWidth: 1120 },
    blocks: [
      { id: 'h1', type: 'heading', level: 1, text: '阅读任务' },
      { id: 'p1', type: 'paragraph', text: '长文正文' },
      { id: 'h2', type: 'heading', level: 2, text: '材料 B' },
    ],
    surfaceLayerItems: [],
  }
}

function teacherController(): NativeLayerItem {
  return {
    layerItemId: 'flow-controller',
    label: '教师控制器',
    kind: 'native',
    frame: { mode: 'absolute', x: 24, y: 640, width: 520, height: 64 },
    order: 20,
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
          backgroundColor: '#ffffff',
          backgroundOpacity: 1,
          accentColor: '#2563eb',
          textColor: '#172033',
          cornerRadius: 8,
        },
        includeInStaticExports: false,
      },
    },
  }
}

async function mountHost() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const host = new FlowSurfaceHost(flowDocument())
  await host.mount({
    surfaceId: 'flow-host',
    container,
    services,
    signal: new AbortController().signal,
  })
  await host.activate()
  return { host, container }
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('FlowSurfaceHost runtime TOC', () => {
  it('starts collapsed against the viewport left edge and does not write the project', async () => {
    const { host, container } = await mountHost()
    const toggle = container.querySelector<HTMLButtonElement>('[data-testid="flow-runtime-toc-toggle"]')!
    const drawer = container.querySelector<HTMLElement>('[data-testid="flow-runtime-toc-drawer"]')!
    expect(host.tocOpen).toBe(false)
    expect(toggle.getAttribute('aria-label')).toBe('展开目录')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.style.position).toBe('fixed')
    expect(toggle.style.left).toBe('0px')
    expect(toggle.querySelector('[data-flow-runtime-toc-chevron="right"]')).not.toBeNull()
    expect(drawer.style.position).toBe('fixed')
    expect(drawer.style.transform).toBe('translateX(-100%)')
    expect(host.document).toEqual(flowDocument())
    await host.destroy()
  })

  it('opens a left drawer with the triangle on the drawer edge and only heading anchors', async () => {
    const { host, container } = await mountHost()
    const toggle = container.querySelector<HTMLButtonElement>('[data-testid="flow-runtime-toc-toggle"]')!
    const drawer = container.querySelector<HTMLElement>('[data-testid="flow-runtime-toc-drawer"]')!
    toggle.click()
    expect(host.tocOpen).toBe(true)
    expect(toggle.getAttribute('aria-label')).toBe('收起目录')
    expect(toggle.style.left).toBe(`${FLOW_RUNTIME_TOC_DRAWER_WIDTH_PX}px`)
    expect(toggle.querySelector('[data-flow-runtime-toc-chevron="left"]')).not.toBeNull()
    expect(drawer.style.transform).toBe('translateX(0)')
    const items = [...container.querySelectorAll<HTMLElement>('[data-flow-runtime-toc-item]')]
    expect(items.map((item) => item.dataset.flowTocBlockId)).toEqual(['h1', 'h2'])
    expect(container.querySelector('[data-flow-toc-block-id="p1"]')).toBeNull()
    expect(container.querySelector(`#${flowRuntimeTocAnchorId('h1')}`)?.tagName).toBe('H1')

    const heading = container.querySelector<HTMLElement>(`#${flowRuntimeTocAnchorId('h2')}`)!
    heading.scrollIntoView = vi.fn()
    items[1]!.click()
    expect(heading.scrollIntoView).toHaveBeenCalled()
    expect(host.document.blocks[1]).toMatchObject({ id: 'p1', type: 'paragraph' })
    await host.destroy()
  })

  it('keeps TOC open/close as session state across document updates', async () => {
    const { host, container } = await mountHost()
    host.setTocOpen(true)
    expect(host.tocOpen).toBe(true)
    const updated = flowDocument()
    updated.blocks.push({ id: 'h3', type: 'heading', level: 2, text: '新增标题' })
    await host.updateDocument(updated)
    expect(host.tocOpen).toBe(true)
    expect(container.querySelector('[data-flow-toc-block-id="h3"]')).not.toBeNull()
    expect(host.document.blocks.some((block) => block.id === 'h3')).toBe(true)
    await host.destroy()
  })
})

describe('FlowSurfaceHost course progress source', () => {
  it('forwards courseProgressSource to the overlay Slide host', async () => {
    const flow = flowDocument()
    flow.surfaceLayerItems = [
      { item: teacherController(), visibility: { mode: 'all', locationIds: [] } },
    ]
    const container = document.createElement('div')
    document.body.appendChild(container)
    const host = new FlowSurfaceHost(flow, {
      courseProgressSource: {
        getLocations: () => [
          { id: 'intro', name: '导入' },
          { id: 'read', name: '阅读任务' },
        ],
        getCurrentLocationId: () => 'read',
        getStateLabel: () => '精读',
      },
    })
    await host.mount({
      surfaceId: 'flow-host',
      container,
      services,
      signal: new AbortController().signal,
    })
    await host.activate()

    const progress = container.querySelector<HTMLElement>('.slide-teacher-controller-progress')
    expect(progress?.textContent).toBe('2 / 2 · 阅读任务 · 精读')
    expect(progress?.textContent).not.toContain('语义长文覆盖图层')
    await host.destroy()
  })
})
