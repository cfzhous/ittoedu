import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SlideSurfaceHost } from '@/player/surfaces/slide/SlideSurfaceHost'
import type { RuntimeLayerItem } from '@/shared/courseProjectTypes'
import { captureMountedElementPng } from '@/renderer/export/playerCapture'
import { captureCurrentSlideDynamicItem } from '@/renderer/course/coursePptxCurrentCapture'

vi.mock('@/renderer/export/playerCapture', () => ({
  captureMountedElementPng: vi.fn(),
}))

const item: RuntimeLayerItem = {
  layerItemId: 'runtime-current',
  label: '当前 Runtime',
  kind: 'runtime',
  frame: { mode: 'absolute', x: 40, y: 30, width: 320, height: 180 },
  order: 10,
  visible: true,
  locked: false,
  rotation: 12,
  opacity: .6,
  hitPolicy: 'auto',
  playbackInitialVisibility: 'inherit',
  runtime: {
    enabled: true,
    protocol: 'surface-v1',
    runtimeApiVersion: 3,
    renderMode: 'dom',
    source: 'SurfaceRuntime.define({runtimeApiVersion:3,create(){return{destroy(){}}}})',
    content: { values: {} },
    assets: {},
  },
}

function mountedHost(warnings: string[] = []) {
  const root = document.createElement('section')
  root.className = 'slide-surface'
  root.style.position = 'relative'
  const wrapper = document.createElement('div')
  wrapper.className = 'slide-layer-item'
  wrapper.dataset.layerItemId = item.layerItemId
  wrapper.style.transform = 'rotate(12deg)'
  wrapper.style.opacity = '.6'
  const content = document.createElement('div')
  content.className = 'slide-layer-content'
  const overlay = document.createElement('div')
  overlay.className = 'course-dynamic-authoring-targets'
  overlay.style.display = 'block'
  content.appendChild(overlay)
  wrapper.appendChild(content)
  root.appendChild(wrapper)
  const capture = vi.fn().mockResolvedValue({
    format: 'html' as const,
    content: root.outerHTML,
    width: 1280,
    height: 720,
    warnings,
  })
  const host = { rootElement: root, capture } as unknown as SlideSurfaceHost
  return { host, root, wrapper, content, overlay, capture }
}

describe('Course Studio current dynamic PPTX capture', () => {
  beforeEach(() => vi.clearAllMocks())

  it('settles the same mounted host and rasterizes its captured current-frame clone', async () => {
    const mounted = mountedHost()
    vi.mocked(captureMountedElementPng).mockImplementation(async (element) => {
      expect(element).not.toBe(mounted.content)
      const cloneRoot = element.closest<HTMLElement>('.slide-surface')!
      const cloneWrapper = element.closest<HTMLElement>('.slide-layer-item')!
      expect(cloneRoot.style.position).toBe('fixed')
      expect(cloneRoot.style.left).toBe('-100000px')
      expect(cloneRoot.style.transform).toBe('none')
      expect(cloneWrapper.style.transform).toBe('none')
      expect(cloneWrapper.style.opacity).toBe('1')
      expect(element.querySelector<HTMLElement>('.course-dynamic-authoring-targets')?.style.display).toBe('none')
      return 'data:image/png;base64,Q1VSUkVOVA=='
    })

    await expect(captureCurrentSlideDynamicItem(mounted.host, item)).resolves.toBe(
      'data:image/png;base64,Q1VSUkVOVA==',
    )
    expect(mounted.capture).toHaveBeenCalledWith({ purpose: 'export' })
    expect(mounted.root.style.position).toBe('relative')
    expect(mounted.wrapper.style.transform).toBe('rotate(12deg)')
    expect(mounted.wrapper.style.opacity).toBe('0.6')
    expect(mounted.overlay.style.display).toBe('block')
  })

  it('reports a failed item capture contract instead of presenting a stale image', async () => {
    const mounted = mountedHost([`${item.label} capture failed`])
    await expect(captureCurrentSlideDynamicItem(mounted.host, item)).rejects.toThrow(
      /capture 契约执行失败/,
    )
    expect(captureMountedElementPng).not.toHaveBeenCalled()
  })
})
