import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  slideItemCaptureFailureWarning,
  type SlideSurfaceHost,
} from '@/player/surfaces/slide/SlideSurfaceHost'
import type { RuntimeLayerItem } from '@/shared/courseProjectTypes'
import { captureMountedElementPng } from '@/renderer/export/playerCapture'
import {
  captureCurrentSlideDynamicItem,
  currentPptxDynamicCapture,
} from '@/renderer/course/coursePptxCurrentCapture'
import { createCourseProject } from '@/renderer/course/courseStudioModel'

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

  it('rasterizes the same mounted current frame without running mutating capture preparation', async () => {
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
    expect(mounted.capture).toHaveBeenCalledWith({
      purpose: 'export',
      dynamicPreparation: 'preserve-current',
    })
    expect(mounted.root.style.position).toBe('relative')
    expect(mounted.wrapper.style.transform).toBe('rotate(12deg)')
    expect(mounted.wrapper.style.opacity).toBe('0.6')
    expect(mounted.overlay.style.display).toBe('block')
  })

  it('reports a failed item capture contract instead of presenting a stale image', async () => {
    const mounted = mountedHost([slideItemCaptureFailureWarning(item.label)])
    await expect(captureCurrentSlideDynamicItem(mounted.host, item)).rejects.toThrow(
      /画面生成失败/,
    )
    expect(captureMountedElementPng).not.toHaveBeenCalled()
  })

  it('拒绝把当前复核画面快照混入另一个初始画面', async () => {
    const project = createCourseProject({ id: 'pptx-current-state-guard' })
    const surface = project.surfaces[0]!
    if (surface.type !== 'slide') throw new Error('expected slide')
    const scene = surface.scenes[0]!
    scene.presentation = {
      initialStateId: 'state-a',
      states: [
        { id: 'state-a', name: '初始画面', layerItemOverrides: {} },
        { id: 'state-b', name: '复核画面', layerItemOverrides: {} },
      ],
    }
    const host = { sceneId: scene.id, stateId: 'state-b' } as unknown as SlideSurfaceHost
    const captureItem = vi.fn().mockResolvedValue('data:image/png;base64,AAAA')
    const capture = currentPptxDynamicCapture(() => host, () => surface.id, captureItem)
    await expect(capture({ project, surface, scene, item })).rejects.toThrow(/初始画面/u)
    expect(captureItem).not.toHaveBeenCalled()
  })
})
