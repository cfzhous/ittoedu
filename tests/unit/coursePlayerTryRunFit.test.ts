import { describe, expect, it, vi } from 'vitest'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@/shared/constants'
import { fitPublishedCourseStage, waitForHostLayout } from '@/renderer/ui/coursePlayerTryRun'

function mockClientSize(element: HTMLElement, width: number, height: number): void {
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: width })
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: height })
}

describe('fitPublishedCourseStage', () => {
  it('letterboxes Slide, Flow and Spatial stages into a larger host', () => {
    const host = document.createElement('div')
    const slide = document.createElement('section')
    slide.className = 'slide-published-adapter'
    const flow = document.createElement('section')
    flow.className = 'flow-surface-host'
    const spatial = document.createElement('section')
    spatial.className = 'spatial-surface'
    host.append(slide, flow, spatial)
    mockClientSize(host, 1560, 992)

    fitPublishedCourseStage(host)

    const scale = Math.min(1560 / CANVAS_WIDTH, 992 / CANVAS_HEIGHT)
    for (const stage of [slide, flow, spatial]) {
      expect(stage.style.position).toBe('absolute')
      expect(stage.style.transformOrigin).toBe('0 0')
      expect(stage.style.transform).toBe(`scale(${scale})`)
      expect(stage.style.width).toBe(`${CANVAS_WIDTH}px`)
      expect(stage.style.height).toBe(`${CANVAS_HEIGHT}px`)
      expect(stage.style.left).toBe(`${(1560 - CANVAS_WIDTH * scale) / 2}px`)
      expect(stage.style.top).toBe(`${(992 - CANVAS_HEIGHT * scale) / 2}px`)
      expect(stage.dataset.stageFitScale).toBe(String(scale))
      expect(CANVAS_WIDTH / CANVAS_HEIGHT).toBeCloseTo(16 / 9)
    }
  })

  it('falls back to the design canvas when the host has no layout yet', () => {
    const host = document.createElement('div')
    const adapter = document.createElement('section')
    adapter.className = 'slide-published-adapter'
    host.append(adapter)
    mockClientSize(host, 0, 0)

    fitPublishedCourseStage(host)

    expect(adapter.style.transform).toBe('scale(1)')
    expect(adapter.style.left).toBe('0px')
    expect(adapter.style.top).toBe('0px')
  })
})

describe('waitForHostLayout', () => {
  it('waits until the host has a usable size', async () => {
    const host = document.createElement('div')
    mockClientSize(host, 0, 0)
    let frames = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames += 1
      if (frames === 3) mockClientSize(host, 1280, 720)
      callback(frames)
      return frames
    })
    try {
      await waitForHostLayout(host)
      expect(host.clientWidth).toBe(1280)
      expect(frames).toBe(3)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
