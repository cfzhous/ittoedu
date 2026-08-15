import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createScene, createTextNode } from '@/renderer/project/createProject'
import { completeWorkspaceTransformEvent } from '@/renderer/ui/workspaceSlideAuthoring'
import { renderTextNodeCanvas } from '@/shared/textLayout'

function canvasContext(): CanvasRenderingContext2D {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    clip: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
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

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Workspace transform completion', () => {
  it('preserves auto-height text dimensions for move and rotate', () => {
    const node = createTextNode({
      id: 'auto-height-text',
      text: '移动和旋转不应重新排版这段文字',
      width: 240,
      height: 80,
      style: { overflow: 'auto-height', fontSize: 42 },
    })
    const document = { ...createScene({ id: 'scene-a' }), nodes: [node] }

    expect(completeWorkspaceTransformEvent(document, [{
      nodeId: node.id,
      x: node.x + 40,
      y: node.y + 30,
    }])?.nodes[0]).toMatchObject({
      x: node.x + 40,
      y: node.y + 30,
      width: node.width,
      height: node.height,
      rotation: node.rotation,
    })
    expect(completeWorkspaceTransformEvent(document, [{
      nodeId: node.id,
      rotation: 25,
    }])?.nodes[0]).toMatchObject({
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      rotation: 25,
    })
  })

  it('reflows auto-height text only when resize changes its dimensions', () => {
    const node = createTextNode({
      id: 'auto-height-resize',
      text: '缩窄文本框后应按新宽度重新计算高度',
      width: 320,
      height: 80,
      style: { overflow: 'auto-height', fontSize: 42 },
    })
    const document = { ...createScene({ id: 'scene-a' }), nodes: [node] }
    const resizedWidth = 160
    const expected = renderTextNodeCanvas({ ...node, width: resizedWidth }, resizedWidth)
    const completed = completeWorkspaceTransformEvent(document, [{
      nodeId: node.id,
      x: node.x,
      y: node.y,
      width: resizedWidth,
      height: node.height,
    }])?.nodes[0]

    expect(completed).toMatchObject({
      width: expected.width,
      height: expected.height,
    })
    expect(completed?.height).not.toBe(node.height)
  })
})
