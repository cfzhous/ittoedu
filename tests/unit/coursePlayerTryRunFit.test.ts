import { describe, expect, it } from 'vitest'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@/shared/constants'
import { fitPublishedCourseStage } from '@/renderer/ui/coursePlayerTryRun'

function mockClientSize(element: HTMLElement, width: number, height: number): void {
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: width })
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: height })
}

describe('fitPublishedCourseStage', () => {
  it('letterboxes the 1280×720 published adapter into a larger host', () => {
    const host = document.createElement('div')
    const adapter = document.createElement('section')
    adapter.className = 'slide-published-adapter'
    host.append(adapter)
    mockClientSize(host, 1560, 992)

    fitPublishedCourseStage(host)

    const scale = Math.min(1560 / CANVAS_WIDTH, 992 / CANVAS_HEIGHT)
    expect(adapter.style.position).toBe('absolute')
    expect(adapter.style.transformOrigin).toBe('0 0')
    expect(adapter.style.transform).toBe(`scale(${scale})`)
    expect(adapter.style.left).toBe(`${(1560 - CANVAS_WIDTH * scale) / 2}px`)
    expect(adapter.style.top).toBe(`${(992 - CANVAS_HEIGHT * scale) / 2}px`)
    expect(adapter.dataset.stageFitScale).toBe(String(scale))
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
