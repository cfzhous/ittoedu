import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTextNode } from '@/renderer/project/createProject'
import { renderTextNodeCanvas } from '@/shared/textLayout'

type FillTextCall = [text: string, x: number, y: number]

function canvasContext(fillTextCalls: FillTextCall[]): CanvasRenderingContext2D {
  return {
    beginPath: vi.fn(),
    closePath: vi.fn(),
    clip: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn((...args: FillTextCall) => fillTextCalls.push(args)),
    lineTo: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('direction-aware text layout', () => {
  it('keeps vertical height authored and grows width by the required columns', () => {
    const calls: FillTextCall[] = []
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      canvasContext(calls),
    )
    const node = createTextNode({
      width: 200,
      height: 80,
      text: '甲乙丙丁戊己庚',
      style: {
        writingMode: 'vertical-rl',
        overflow: 'auto-height',
        fontSize: 20,
        lineSpacing: 0,
        letterSpacing: 0,
        padding: 0,
      },
    })

    const compact = renderTextNodeCanvas(node)
    const taller = renderTextNodeCanvas({ ...node, height: 160 })

    expect(compact.height).toBe(80)
    expect(compact.width).toBe(60)
    expect(taller.height).toBe(160)
    expect(taller.width).toBe(40)
  })

  it('draws vertical-rl columns rightward-first and vertical-lr leftward-first', () => {
    const rightToLeftCalls: FillTextCall[] = []
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      canvasContext(rightToLeftCalls),
    )
    const node = createTextNode({
      height: 80,
      text: '甲乙丙丁',
      style: {
        writingMode: 'vertical-rl',
        overflow: 'auto-height',
        fontSize: 20,
        lineSpacing: 0,
        letterSpacing: 0,
        padding: 0,
      },
    })
    renderTextNodeCanvas(node)
    const firstRight = rightToLeftCalls.find(([text]) => text === '甲')!
    const nextRightColumn = rightToLeftCalls.find(([text]) => text === '丁')!
    expect(firstRight[1]).toBeGreaterThan(nextRightColumn[1])

    vi.restoreAllMocks()
    const leftToRightCalls: FillTextCall[] = []
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      canvasContext(leftToRightCalls),
    )
    renderTextNodeCanvas({
      ...node,
      style: { ...node.style, writingMode: 'vertical-lr' },
    })
    const firstLeft = leftToRightCalls.find(([text]) => text === '甲')!
    const nextLeftColumn = leftToRightCalls.find(([text]) => text === '丁')!
    expect(firstLeft[1]).toBeLessThan(nextLeftColumn[1])
  })
})
